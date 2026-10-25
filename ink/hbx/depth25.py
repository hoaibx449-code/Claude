#!/usr/bin/env python3
"""2.5D cho ảnh tĩnh: ước lượng chiều sâu (MiDaS small, ONNX, chạy CPU) → tách 3 lớp xa/giữa/gần có
alpha mềm, vá phần bị che (inpaint) để khi máy quay di chuyển, lớp gần trượt nhanh hơn lớp xa (thị sai thật).

  python3 depth25.py storyboard.json      # xử lý mọi image (không phải video) trong cảnh `shot`
  python3 depth25.py one.jpg out_dir/     # thử 1 ảnh

Kết quả mỗi ảnh: assets/d25_<tên>/ {l0.jpg (nền xa, đã vá), l1.png, l2.png, depth.png, meta.json}
meta.json: {w, h, z:[độ sâu tương đối 0..1 của từng lớp], depth_at: lưới 9x16 độ sâu để neo chữ vào vật}.
Mô hình: ~/.hbx_models/midas_small.onnx (tự tải từ GitHub isl-org/MiDaS nếu chưa có)."""
import json, sys, os, urllib.request
from pathlib import Path
import numpy as np, cv2

MODEL = Path.home() / '.hbx_models' / 'midas_small.onnx'
URL = 'https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx'
W, H = 1080, 1920          # khung dọc 9:16
_sess = None


def session():
    global _sess
    if _sess is None:
        import onnxruntime as ort
        if not MODEL.exists():
            MODEL.parent.mkdir(parents=True, exist_ok=True)
            print('  tải mô hình chiều sâu MiDaS…', flush=True)
            urllib.request.urlretrieve(URL, MODEL)
        _sess = ort.InferenceSession(str(MODEL), providers=['CPUExecutionProvider'])
    return _sess


def cover(img, fx=.5, fy=.5):
    """cắt ảnh về 9:16 theo tiêu điểm (fx, fy), phóng tới 1080x1920"""
    h, w = img.shape[:2]; tr = W / H
    if w / h > tr: nw = int(h * tr); x0 = int(np.clip(fx * w - nw / 2, 0, w - nw)); img = img[:, x0:x0 + nw]
    else: nh = int(w / tr); y0 = int(np.clip(fy * h - nh / 2, 0, h - nh)); img = img[y0:y0 + nh]
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)


def depth(img):
    x = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (256, 256), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    d = session().run(None, {session().get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    d = cv2.bilateralFilter(d.astype(np.float32), 9, float(d.std()) * .5 + 1e-6, 9)   # giữ biên vật thể
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    return np.clip((d - lo) / (hi - lo + 1e-6), 0, 1)        # 1 = gần, 0 = xa (MiDaS trả inverse depth)


def layers(img, d, out):
    out.mkdir(parents=True, exist_ok=True)
    t1, t2 = np.percentile(d, 45), np.percentile(d, 80)    # ngưỡng giữa / gần
    def soft(mask, r=9):
        m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), r); return np.clip(m * 1.6 - .3, 0, 1)
    near = d >= t2; mid = d >= t1
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    def fill(src, mask):   # vá vùng bị lớp trước che, mở rộng mask để không lộ viền khi thị sai
        mk = cv2.dilate(mask.astype(np.uint8) * 255, k)
        small = cv2.resize(src, (W // 3, H // 3)); ms = cv2.resize(mk, (W // 3, H // 3))
        fs = cv2.inpaint(small, ms, 9, cv2.INPAINT_TELEA)
        up = cv2.resize(fs, (W, H), interpolation=cv2.INTER_CUBIC)
        a = (cv2.GaussianBlur(mk, (0, 0), 6).astype(np.float32) / 255)[..., None]
        return (src * (1 - a) + up * a).astype(np.uint8)
    l0 = fill(img, mid)                                     # nền xa: vá cả giữa + gần
    l1 = fill(img, near)                                    # lớp giữa: vá phần gần
    cv2.imwrite(str(out / 'l0.jpg'), l0, [cv2.IMWRITE_JPEG_QUALITY, 90])
    for name, src, m in (('l1', l1, mid), ('l2', img, near)):
        rgba = np.dstack([src, (soft(m) * 255).astype(np.uint8)])
        cv2.imwrite(str(out / f'{name}.png'), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    cv2.imwrite(str(out / 'depth.png'), (d * 255).astype(np.uint8))
    grid = cv2.resize(d, (9, 16), interpolation=cv2.INTER_AREA)
    meta = {'w': W, 'h': H, 'z': [float(np.median(d[~mid])) if (~mid).any() else 0., float(np.median(d[mid & ~near])) if (mid & ~near).any() else .5,
                                  float(np.median(d[near])) if near.any() else 1.], 'depth_at': [[round(float(v), 3) for v in r] for r in grid]}
    (out / 'meta.json').write_text(json.dumps(meta))
    return meta


def process(src, out, fx=.5, fy=.5):
    img = cv2.imread(str(src)); img = cover(img, fx, fy)
    return layers(img, depth(img), Path(out))


# ---------- MÁY QUAY 2.5D (nướng sẵn thành chuỗi khung, thị sai theo từng điểm ảnh) ----------
# Cùng công thức với engine/cine.js (camOf) để chữ neo vào vật chuyển động khớp với ảnh.
def ease(t):
    """khởi động êm rồi giữ vận tốc đều — máy KHÔNG dừng ở cuối cảnh, đà tiến nối sang cảnh sau"""
    t = float(t) if np.ndim(t) == 0 else t
    return (np.where(t < .25, 2 * t * t, t - .125) / .875) if np.ndim(t) else ((2 * t * t if t < .25 else t - .125) / .875)

def ramp(t):
    """nhịp nhanh: lao mạnh đầu cú máy rồi hãm (speed ramp)"""
    return 1 + (t - 1) * .15 if t >= 1 else 1 - (1 - t) ** 3

def cam(kind, t, pace=None):
    """t: 0..1(+) → (z tiến tới, x ngang, y dọc, roll độ, zoom) — đơn vị theo chiều cao khung. GIỐNG engine/cine.js"""
    if pace == 'fast':
        z, x, y, r, zm = cam_base(kind, t, ramp)
        return (z * 1.15, x * 1.2, y * 1.2, r * 1.2, 1 + (zm - 1) * 1.3)
    return cam_base(kind, t, ease)

def cam_base(kind, t, ease):
    e = ease(t); sn = np.sin(np.pi * min(t, 1))
    # the camera goes only a little way into a single photo (deeper tears it at object edges); the rest is lens zoom
    if kind == 'push':   return (.07 * e, 0, 0, 0, 1)
    if kind == 'dolly':  return (.11 * e, 0, 0, 0, 1 + .05 * e)
    if kind == 'zoom':   return (0, 0, 0, 0, 1 + .16 * e)
    if kind == 'fpv':    return (.13 * e, .04 * sn, -.02 * e, 2 * sn, 1 + .06 * e)
    if kind == 'truckL': return (.03 * e, -.08 * e, 0, 0, 1)
    if kind == 'truckR': return (.03 * e, .08 * e, 0, 0, 1)
    if kind == 'rise':   return (.04 * e, 0, -.08 * e, 0, 1)
    if kind == 'orbit':  return (.05 * e, .07 * np.sin(np.pi * (min(t, 1) - .5)), 0, 1.5 * sn, 1)
    return (.03 * e, 0, 0, 0, 1)   # still: trôi rất nhẹ

def project(px, py, d, c):
    """điểm (px,py) toạ độ chuẩn hoá quanh tâm, đơn vị = chiều cao; d độ gần 0..1 → vị trí mới"""
    z, x, y, roll, zm = c
    s = 1 / (1 - z * (.12 + .88 * d)); k = .2 + .8 * d
    qx, qy = px * s - x * k, py * s - y * k
    r = np.deg2rad(roll); qx, qy = qx * np.cos(r) - qy * np.sin(r), qx * np.sin(r) + qy * np.cos(r)
    return qx * zm, qy * zm

GRADES = {   # chỉnh màu theo phong cách từng video (BGR gain, độ tương phản, bão hoà, sáng)
    'none':   ((1, 1, 1), 1, 1, 1),
    'dawn':   ((.95, 1.0, 1.07), .96, 1.06, 1.04),
    'warm':   ((.92, 1.01, 1.08), 1.0, 1.05, 1.0),
    'cool':   ((1.08, 1.0, .94), 1.02, .98, 1.0),
    'night':  ((1.08, .98, .92), 1.10, .95, .82),
    'bright': ((1.0, 1.02, 1.03), .94, 1.08, 1.10),
    'mono':   ((1.04, 1.0, .97), 1.05, .25, .98),
    'earth':  ((.90, 1.0, 1.06), 1.02, .92, 1.0),
}

def grade(img, name):
    g, ct, sat, ex = GRADES.get(name or 'none', GRADES['none'])
    if name in (None, 'none'): return img
    f = img.astype(np.float32) / 255 * np.array(g, np.float32) * ex
    f = (f - .5) * ct + .5
    gray = f.mean(axis=2, keepdims=True); f = gray + (f - gray) * sat
    return (np.clip(f, 0, 1) * 255).astype(np.uint8)

def bake(src, d, kind, n, out, t_of, ow=720, oh=1280, over=1.07, gname=None, pace=None):
    """nướng chuyển động máy: src = ảnh BGR (2.5D, d = bản đồ độ gần) hoặc hàm i→ảnh (video, d = số cố định)
       n khung, t_of(i) → thời gian máy 0..1(+). Ghi out/f0001.jpg…"""
    out.mkdir(parents=True, exist_ok=True)
    ys, xs = np.mgrid[0:oh, 0:ow].astype(np.float32)
    qx = (xs - ow / 2) / oh / over; qy = (ys - oh / 2) / oh / over
    get = src if callable(src) else (lambda i: src)
    img0 = get(0); H0, W0 = img0.shape[:2]
    flat = not isinstance(d, np.ndarray)
    if not flat: dsm = cv2.resize(d.astype(np.float32), (W0 // 2, H0 // 2))
    def dat(px, py):
        if flat: return d
        mx = (px * H0 + W0 / 2) / 2; my = (py * H0 + H0 / 2) / 2
        return cv2.remap(dsm, mx.astype(np.float32), my.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    for i in range(n):
        z, x, y, roll, zm = cam(kind, t_of(i), pace)
        r = -np.deg2rad(roll); ux, uy = qx / zm, qy / zm
        ux, uy = ux * np.cos(r) - uy * np.sin(r), ux * np.sin(r) + uy * np.cos(r)
        dd = dat(ux, uy)
        for _ in range(1 if flat else 3):
            sc = 1 / (1 - z * (.12 + .88 * dd)); k = .2 + .8 * dd
            px, py = (ux + x * k) / sc, (uy + y * k) / sc
            dd = dat(px, py)
        img = get(i)
        mx = (px * H0 + W0 / 2).astype(np.float32); my = (py * H0 + H0 / 2).astype(np.float32)
        if np.ndim(mx) == 0: mx = np.full((oh, ow), mx, np.float32)
        fr = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        cv2.imwrite(str(out / f'f{i + 1:04d}.jpg'), grade(fr, gname), [cv2.IMWRITE_JPEG_QUALITY, 90])
    return n


TAIL = .6   # nướng dư 0,6 s cuối cảnh để máy vẫn chạy trong lúc chuyển cảnh

def _video_get(fd, off, ns, rate, focus):
    cache = {}
    def get(i):
        j = min(off + ns, off + int(i * rate) + 1)
        if j not in cache: cache.clear(); cache[j] = cover(cv2.imread(str(fd / f'f{j:04d}.jpg')), focus.get('x', .5), focus.get('y', .5))
        return cache[j]
    return get


def _bake_task(t):
    """one shot, in a worker process (scenes bake side by side on every core)"""
    cv2.setNumThreads(1)
    k, src, d, kind, n, out, dur, fps, gname, pace = t
    if isinstance(src, tuple): src = _video_get(*src)
    bake(src, d, kind, n, out, lambda i: (i / fps) / dur, gname=gname, pace=pace)
    return k, kind, n


def bake_sb(sbp, fps=30):
    sbp = Path(sbp); sb = json.loads(sbp.read_text()); gname = (sb.get('style') or {}).get('grade'); pace = sb.get('pace')
    tasks = []
    for k, s in enumerate(sb['scenes']):
        if s.get('type') != 'shot': continue
        bg = s.get('bg') or {}; kind = s.get('cam', 'push'); dur = float(s['dur']); n = int(round((dur + TAIL) * fps))
        key = f"{k:02d}_{kind}_{n}_{gname}_{pace}_{Path(bg.get('src', 'x')).stem}_{int(100 * (bg.get('focus') or {}).get('x', .5))}{int(100 * (bg.get('focus') or {}).get('y', .5))}_{bg.get('from', 0)}"
        out = sbp.parent / 'assets' / f'shot_{key}'
        if not (out / f'f{n:04d}.jpg').exists():
            if bg.get('frames'):                     # video: lấy khung nguồn, chạy chậm nếu clip ngắn hơn cảnh
                fd = sbp.parent / bg['frames']['dir']; off = int(float(bg.get('from', 0)) * fps); ns = max(1, bg['frames']['n'] - off); rate = min(1., ns / n)
                tasks.append((k, (fd, off, ns, rate, bg.get('focus') or {}), .45, kind, n, out, dur, fps, gname, pace))
            elif bg.get('src'):                      # ảnh: 2.5D thị sai từng điểm ảnh
                f = bg.get('focus') or {}
                img = cover(cv2.imread(str(sbp.parent / bg['src'])), f.get('x', .5), f.get('y', .5))
                d = depth(img) if bg.get('depth', True) else .45
                if isinstance(d, np.ndarray):
                    # làm mượt bản đồ độ sâu: vật mảnh (cần cẩu, dây điện, cành cây) không bị xé/nhân đôi khi máy di chuyển
                    d = cv2.GaussianBlur(d.astype(np.float32), (0, 0), d.shape[0] * .018)
                    edge = float(np.mean(np.abs(cv2.Sobel(d, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(d, cv2.CV_32F, 0, 1))))
                    if edge > .014: d = d * .4 + .3           # ảnh nhiều vật mảnh trên nền trời → giảm mạnh thị sai
                if isinstance(d, np.ndarray): bg['dgrid'] = cv2.resize(d, (9, 16), interpolation=cv2.INTER_AREA).round(3).tolist()
                tasks.append((k, img, d, kind, n, out, dur, fps, gname, pace))
            else: continue
        bg['baked'] = {'dir': f'assets/{out.name}', 'n': n, 'fps': fps}
    if tasks:
        import multiprocessing as mp
        from concurrent.futures import ProcessPoolExecutor, as_completed
        with ProcessPoolExecutor(max(1, min(len(tasks), os.cpu_count() or 2)), mp_context=mp.get_context('fork')) as ex:
            for i, f in enumerate(as_completed([ex.submit(_bake_task, t) for t in tasks])):
                k, kind, n = f.result(); print(f'  nướng cảnh {i + 1}/{len(tasks)} (cảnh {k + 1}: {kind} {n} khung)', flush=True)
    sbp.write_text(json.dumps(sb, ensure_ascii=False, indent=1))


def depth_sb(sbp):
    """Pha xem trước: chỉ tính lưới độ sâu 9x16 cho ảnh (để neo chữ/ghim vào vật)"""
    sbp = Path(sbp); sb = json.loads(sbp.read_text())
    for s in sb['scenes']:
        bg = s.get('bg') or {}
        if s.get('type') != 'shot' or bg.get('frames') or not bg.get('src') or bg.get('depth') is False or bg.get('dgrid'): continue
        f = bg.get('focus') or {}
        img = cover(cv2.imread(str(sbp.parent / bg['src'])), f.get('x', .5), f.get('y', .5))
        bg['dgrid'] = cv2.resize(depth(img), (9, 16), interpolation=cv2.INTER_AREA).round(3).tolist()
    sbp.write_text(json.dumps(sb, ensure_ascii=False, indent=1))


def main():
    a = sys.argv[1:]
    if a[0] == '--bake': bake_sb(a[1])
    elif a[0].endswith('.json'): depth_sb(a[0])
    else: print(process(a[0], a[1]))


if __name__ == '__main__':
    main()
