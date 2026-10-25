#!/usr/bin/env python3
"""Render storyboard JSON → MP4 9:16 (1080x1920, 30fps) bằng engine HTML.
   python3 render.py storyboard.json out.mp4 [--workers 4] [--preview 1.2,5,9]
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, wave
from multiprocessing import Process
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
PLAYER = (ROOT / 'engine' / 'player.html').as_uri()
FPS, SR = int(os.environ.get('HBX_FPS', '30')), 44100
# TĂNG TỐC: chụp khung ở 720x1280 (DSF 1.0) rồi phóng lanczos lên 1080x1920 khi mã hoá — nhanh ~2 lần,
# chữ gần như không khác sau nén Facebook. Cần nét tối đa: HBX_DSF=1.5 (chụp thẳng 1080x1920).
DSF = float(os.environ.get('HBX_DSF', '1.0'))
OUT_W, OUT_H = 1080, 1920


def resolve_images(sb, base):
    def fix(img):
        if isinstance(img, dict) and img.get('src') and not img['src'].startswith(('http', 'file:', 'data:')):
            img['src'] = (base / img['src']).resolve().as_uri()
        if isinstance(img, dict) and isinstance(img.get('frames'), dict) and not img['frames']['dir'].startswith('file:'):
            img['frames']['dir'] = (base / img['frames']['dir']).resolve().as_uri()
        if isinstance(img, dict) and isinstance(img.get('baked'), dict) and not img['baked']['dir'].startswith('file:'):
            img['baked']['dir'] = (base / img['baked']['dir']).resolve().as_uri()
    icons = ROOT / 'node_modules' / 'lucide-static' / 'icons'
    for s in sb['scenes']:
        for t in s.get('tiles', []) + s.get('nodes', []) + [i for i in s.get('items', []) if isinstance(i, dict)]:  # icon Lucide theo tên → SVG nội tuyến
            ic = t.get('icon')
            if ic and not ic.startswith('<') and (icons / f'{ic}.svg').exists():
                t['icon'] = (icons / f'{ic}.svg').read_text().split('-->')[-1].strip()
        fix(s.get('image')); fix(s.get('bg'))
        for it in s.get('items', []):
            if isinstance(it, dict): fix(it.get('image'))
        for k in ('a', 'b', 'before', 'after'):
            if isinstance(s.get(k), dict): fix(s[k].get('image'))
    return sb


def open_page(pw, sb):
    # HBX_CHROMIUM: a Chromium already on the machine (otherwise Playwright's own download)
    exe = os.environ.get('HBX_CHROMIUM')
    # WebGL (3D metaphor scenes, meta3d.js) in a headless browser: software rendering, same picture on every machine
    b = pw.chromium.launch(args=['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], **({'executable_path': exe} if exe else {}))
    pg = b.new_page(viewport={'width': 720, 'height': 1280}, device_scale_factor=DSF)
    pg.goto(PLAYER)
    pg.evaluate('sb => HBX.build(sb)', sb)
    pg.wait_for_timeout(200)
    return b, pg


def worker(sb, frames, d):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b, pg = open_page(pw, sb)
        for i in frames:
            pg.evaluate(f'HBX.setTime({i / FPS})')  # trả Promise khi có khung video cần nạp → Playwright tự chờ
            pg.screenshot(path=f'{d}/f{i:06d}.jpg', type='jpeg', quality=93 if DSF > 1.2 else 95)
        b.close()


# ---------- SFX tổng hợp bằng numpy (không cần file ngoài) ----------
def env(n, a=.01, r=None):
    t = np.linspace(0, 1, n); e = np.minimum(1, t / max(a, 1e-4))
    return e * (np.exp(-t * (r or 6)))

def lp(x, k):  # lowpass thô bằng trung bình trượt
    k = max(1, int(k)); return np.convolve(x, np.ones(k) / k, mode='same')

def sfx(kind, d=1.0):
    rng = np.random.default_rng(abs(hash(kind)) % 2**32)
    if kind == 'whoosh':
        n = int(SR * .5); t = np.linspace(0, 1, n); x = rng.standard_normal(n)
        x = lp(x, 6) - lp(x, 40); return x * np.sin(np.pi * t) ** 2 * .5
    if kind == 'swish':
        n = int(SR * .28); t = np.linspace(0, 1, n); x = rng.standard_normal(n); x = x - lp(x, 8)
        return x * np.sin(np.pi * t) ** 3 * .25
    if kind == 'pop':
        n = int(SR * .09); t = np.arange(n) / SR; f = 900 * np.exp(-t * 30) + 260
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * .45
    if kind == 'tick':
        n = int(SR * .05); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 1800 * t) + .5 * np.sin(2 * np.pi * 2700 * t)) * np.exp(-t * 90) * .35
    if kind == 'impact':
        n = int(SR * .7); t = np.arange(n) / SR
        low = np.sin(2 * np.pi * (55 + 40 * np.exp(-t * 8)) * t) * np.exp(-t * 5)
        nz = lp(rng.standard_normal(n), 10) * np.exp(-t * 25)
        return (low * .8 + nz * .5) * .7
    if kind in ('glitch', 'glitch_s'):
        n = int(SR * (.28 if kind == 'glitch' else .12)); x = np.zeros(n); i = 0
        while i < n:
            L = int(rng.integers(300, 1500)); f = rng.choice([180, 420, 900, 1600])
            seg = np.sign(np.sin(2 * np.pi * f * np.arange(L) / SR)) * rng.uniform(.1, .35)
            x[i:i + L] = seg[:max(0, min(L, n - i))]; i += L + int(rng.integers(0, 600))
        return np.round(x * 6) / 6 * .6
    if kind == 'roll':
        out = np.zeros(int(SR * d) + SR // 10); tk = sfx('tick') * .5; t = 0.0; g = .05
        while t < d:
            i = int(t * SR); out[i:i + len(tk)] += tk[:len(out) - i]; t += g; g = .03 + .1 * (t / d) ** 2
        return out
    if kind == 'type':
        out = np.zeros(int(SR * d) + SR // 10); t = 0.0
        while t < d:
            tk = sfx('tick') * rng.uniform(.25, .5); i = int(t * SR); out[i:i + len(tk)] += tk[:len(out) - i]; t += rng.uniform(.05, .11)
        return out
    if kind == 'riser':   # tiếng dồn lên trước cú bẻ hướng: ồn trắng lọc + âm cao dần
        n = int(SR * max(.4, d)); t = np.arange(n) / SR; p = t / t[-1]
        nz = rng.standard_normal(n); nz = nz - lp(nz, 3 + 30 * (1 - p.mean()))
        tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * p ** 2) / SR)
        return (nz * .35 + tone * .25) * p ** 2 * .6
    if kind == 'bass':    # nện trầm vào chữ đắt
        n = int(SR * .45); t = np.arange(n) / SR
        return np.sin(2 * np.pi * (48 + 60 * np.exp(-t * 18)) * t) * np.exp(-t * 7) * .9
    return np.zeros(1)


def music_gain(events):
    """the music bed follows the beats: silent for a moment at each turn (mstop), slightly louder at the end (mswell)"""
    parts = [f'between(t,{e["t"]:.2f},{e["t"] + e.get("d", .8):.2f})' for e in events if e['k'] == 'mstop']
    expr = f"if({'+'.join(parts)},0.06,1)" if parts else '1'
    sw = [e for e in events if e['k'] == 'mswell']
    if sw: expr = f"({expr})*if(gte(t,{sw[0]['t']:.2f}),1.35,1)"
    return expr


def write_wav(path, x):
    x = np.clip(x, -1, 1); y = (x * 32767).astype(np.int16)
    with wave.open(str(path), 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())


def build_audio(events, total, out, gain=.55):
    buf = np.zeros(int(SR * (total + 1)))
    for e in events:
        if e['k'] in ('mstop', 'mswell'): continue   # not sounds: they shape the music (music_gain)
        s = sfx(e['k'], e.get('d', 1.0)) * gain; i = int(max(0, e['t']) * SR)
        j = min(len(buf), i + len(s)); buf[i:j] += s[:j - i]
    write_wav(out, buf[:int(SR * total)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('storyboard'); ap.add_argument('out')
    ap.add_argument('--workers', type=int, default=max(2, os.cpu_count() or 2))  # = số nhân CPU (nhiều hơn chỉ tranh nhau)
    ap.add_argument('--preview', default='')
    ap.add_argument('--no-sfx', action='store_true')
    ap.add_argument('--cover', default='')
    ap.add_argument('--cover-at', type=float, default=2.4)
    a = ap.parse_args()
    sbp = Path(a.storyboard).resolve(); sb = resolve_images(json.loads(sbp.read_text()), sbp.parent)
    from playwright.sync_api import sync_playwright

    if a.preview:  # ảnh tĩnh ở các mốc → kiểm tra bố cục nhanh
        out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as pw:
            b, pg = open_page(pw, sb)
            for t in a.preview.split(','):
                pg.evaluate(f'HBX.setTime({float(t)})'); pg.screenshot(path=str(out / f'p_{float(t):06.2f}.jpg'), type='jpeg', quality=85)
            b.close()
        return

    # QC trước khi dựng: chữ tràn khung / đồ hoạ đè phụ đề → gỡ đúng kỹ thuật gây lỗi ở cảnh đó rồi soát lại (tối đa 3 vòng)
    for rnd in range(3):
        with sync_playwright() as pw:
            b, pg = open_page(pw, sb); total = pg.evaluate('HBX.TOTAL'); events = pg.evaluate('HBX.EVENTS')
            qc = pg.evaluate('window.HBX_QC ? HBX_QC() : []'); b.close()
        for q in qc[:8]: print(f"  QC cảnh {q['scene']} ({q['at']}s): {q['what']} [{q['el']}]", flush=True)
        fixed = False
        for q in qc:
            s = sb['scenes'][q['scene'] - 1]; f = s.get('fx') or {}
            if q['what'] == 'đồ hoạ đè phụ đề' and f.get('overlay'):
                kind = next((c for c in str(q['el']).split() if c.startswith('fx-')), '')[3:]
                keep = [o for o in f['overlay'] if not kind or not o.get('kind', '').startswith(kind[:4])]
                if len(keep) < len(f['overlay']): f['overlay'] = keep; fixed = True
            elif q['what'] == 'tràn khung ngang' and f.get('camera'):
                f.pop('camera'); fixed = True
            elif q['what'] == 'tràn khung ngang' and q['el'] in ('title', 'big', 'ctitle', 'fit'):
                s['titleFit'] = True
        if not qc or not fixed: break
        print(f'  QC: đã gỡ kỹ thuật gây lỗi, soát lại (vòng {rnd + 2})', flush=True)
    (sbp.parent / 'qc.json').write_text(json.dumps(qc, ensure_ascii=False))
    print(f'  QC: {len(qc)} vấn đề bố cục còn lại' if qc else '  QC: bố cục sạch', flush=True)
    import time; T0 = time.time()
    n = int(round(total * FPS)); tmp = Path(tempfile.mkdtemp(prefix='hbxr_'))
    ps = [Process(target=worker, args=(sb, list(range(k, n, a.workers)), tmp)) for k in range(a.workers)]
    [p.start() for p in ps]
    last = -1
    while any(p.is_alive() for p in ps):   # progress for the site: frames written so far
        time.sleep(5); done = len(list(tmp.glob('*.jpg'))) + len(list(tmp.glob('*.png')))
        pc = min(99, int(100 * done / max(1, n)))
        if pc // 10 != last // 10: last = pc; print(f'  chụp khung {pc}%', flush=True)
    [p.join() for p in ps]
    if any(p.exitcode for p in ps): sys.exit('worker lỗi')
    print(f'  chụp {n} khung: {time.time() - T0:.0f}s', flush=True); T1 = time.time()

    # KHUNG ĐẦU = ẢNH BÌA HOOK (Facebook/Shorts lấy khung 0 làm ảnh đại diện; trước đây là nền trắng do cảnh mở hiện dần)
    cov_img = None
    if a.cover or sb.get('cover'):
        sys.path.insert(0, str(ROOT)); from cover import render_cover
        cov_img = tmp / 'cover_hook.jpg'; render_cover(sb, sbp.parent, cov_img)
        from PIL import Image
        f0 = tmp / 'f000000.jpg'; w, h = Image.open(f0).size
        Image.open(cov_img).convert('RGB').resize((w, h), Image.LANCZOS).save(f0, quality=95)
        print('  khung 0 = ảnh bìa hook', flush=True)
    au = sb.get('audio', {}); inputs = ['-framerate', str(FPS), '-i', f'{tmp}/f%06d.jpg']; chains = []; labels = []
    idx = 1
    if not a.no_sfx:
        build_audio(events, total, tmp / 'sfx.wav', au.get('sfx_gain', .55))
        inputs += ['-i', str(tmp / 'sfx.wav')]; chains.append(f'[{idx}:a]volume={.6 if au.get("voice") else 1}[sfx]'); labels.append('[sfx]'); idx += 1
    vi = None
    if au.get('voice'):
        inputs += ['-i', au['voice']]; vi = idx; idx += 1
        chains.append(f'[{vi}:a]volume={au.get("voice_gain", 1.0)},asplit=2[voice][vsc]'); labels.append('[voice]')
    if au.get('music'):
        inputs += ['-stream_loop', '-1', '-i', au['music']]; mi = idx; idx += 1
        m = f'[{mi}:a]volume={au.get("music_gain", .32)},volume=\'{music_gain(events)}\':eval=frame,afade=t=out:st={max(0, total - 1.6)}:d=1.6'
        if vi is not None:  # nhạc tự hạ khi có giọng (sidechain)
            chains.append(m + '[mraw]'); chains.append('[mraw][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[music]')
        else: chains.append(m + '[music]')
        labels.append('[music]')
    elif vi is not None: chains.append('[vsc]anullsink')
    cmd = ['ffmpeg', '-y', '-v', 'error'] + inputs
    if labels:
        filt = ';'.join(chains) + f';{"".join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]'
        cmd += ['-filter_complex', filt, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k']
    body = tmp / 'body.mp4'
    # giới hạn dung lượng: Apps Script UrlFetch chỉ gửi được < 50 MB → mục tiêu ≤ HBX_MAX_MB (mặc định 38 MB)
    max_mb = float(os.environ.get('HBX_MAX_MB', '38'))
    vk = max(800, min(4500, int(max_mb * 8 * 1000 / max(total, 1)) - 200))
    if abs(DSF - 1.5) > .01: cmd += ['-vf', f'scale={OUT_W}:{OUT_H}:flags=lanczos']
    cmd += ['-t', f'{total:.3f}', '-c:v', 'libx264', '-preset', os.environ.get('HBX_PRESET', 'veryfast'), '-crf', '19', '-maxrate', f'{vk}k', '-bufsize', f'{vk * 2}k',
            '-pix_fmt', 'yuv420p', '-r', str(FPS), str(body)]
    subprocess.run(cmd, check=True)
    print(f'  mã hoá: {time.time() - T1:.0f}s', flush=True)
    # ảnh bìa: ảnh bìa hook (cover.py) — cũng là khung 0 — đính kèm vào MP4
    if a.cover:
        cov = Path(a.cover)
        src = cov_img if cov_img else f'{tmp}/f{int(a.cover_at * FPS):06d}.jpg'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(src), '-vf', f'scale={OUT_W}:{OUT_H}:flags=lanczos', '-q:v', '2', str(cov)], check=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(body), '-i', str(cov), '-map', '0', '-map', '1', '-c', 'copy',
                        '-disposition:v:1', 'attached_pic', '-movflags', '+faststart', a.out], check=True)
    else:
        shutil.move(str(body), a.out)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'OK {a.out} {total:.1f}s {n} frames')


if __name__ == '__main__':
    main()
