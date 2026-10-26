#!/usr/bin/env python3
"""Tìm & tải ảnh thật cho storyboard từ Pixabay (ảnh dùng thương mại miễn phí).
   PIXABAY_KEY=... python3 fetch_images.py storyboard.json
   - Ảnh có "q" mà chưa có "src" sẽ được tìm, tải về assets/ cạnh storyboard, ghi src + credit.
   - Không trùng ảnh trong cùng video; cảnh fullbleed ưu tiên ảnh dọc.
   - "video": true trong image → lấy VIDEO Pixabay (miễn phí thương mại), cắt ≤ VMAX giây, tách khung JPG
     30 fps vào assets/pv_<id>/ (dựng xác định theo khung, không phát video trực tiếp); ghi src = khung đầu,
     frames = {dir, n, fps}. "vstart": giây bắt đầu cắt (mặc định 1)."""
import json, os, sys, hashlib, urllib.parse, urllib.request
from pathlib import Path

_kf = next((p for p in (Path(__file__).parent / 'config' / 'pixabay.key', Path.home() / '.pixabay_key') if p.exists()), Path.home() / '.pixabay_key')
KEY = os.environ.get('PIXABAY_KEY') or (_kf.read_text().strip() if _kf.exists() else None)
UA = {'User-Agent': 'HBXVideo/1.0'}

def get(url, tries=10):
    # CDN Pixabay hay trả 429 ngắt quãng với IP dùng chung → thử lại có giãn cách
    import time, urllib.error
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == tries - 1: raise
            time.sleep(6 + k * 4)

# KHÔNG TRÙNG GIỮA NHIỀU VIDEO: HBX_AVOID = id ảnh/video vừa dùng gần đây ở mọi người dùng ("123,v456"); HBX_SEED = dấu vân tay
# của video → chọn ngẫu nhiên (có trọng số, ưu tiên độ hợp) trong nhóm ảnh hợp nhất thay vì luôn lấy ảnh phổ biến số 1
import random
RNG = random.Random(os.environ.get('HBX_SEED') or None)
AVOID = {int(x) if x.isdigit() else x for x in os.environ.get('HBX_AVOID', '').replace(' ', '').split(',') if x}
def pick(hits, k=6):
    top = hits[:k]
    return RNG.choices(top, weights=[k - i for i in range(len(top))])[0] if top else None

# pictures that carry printed words (diagrams, signs, posters, screens…): their English text would sit on the video
import re as _re
TEXTY = _re.compile(r'\b(text|word|words|letter|letters|font|typography|alphabet|sign|signage|poster|banner|label|diagram|chart|graph|infographic|'
                    r'illustration|vector|icon|logo|map|quote|message|newspaper|book page|document|screen|calendar|menu|sale|advertis\w*|render)\b', _re.I)
def textless(hits): return [h for h in hits if not TEXTY.search(h.get('tags', ''))]
# recognisable people (a face filling the frame) are a likeness/copyright risk: pictures tagged with people go last,
# and every picture/clip is checked with a face detector after download (a big face = rejected, another one is picked)
PEOPLE = _re.compile(r'\b(portrait|face|faces|woman|women|man|men|girl|girls|boy|boys|lady|guy|model|beauty|person|people|elderly|senior|child|children|kid|kids|'
                     r'baby|teen|teenager|couple|family|selfie|smile|smiling|businessman|businesswoman|student|female|male)\b', _re.I)
def faceless_first(hits): return sorted(hits, key=lambda h: bool(PEOPLE.search(h.get('tags', ''))))
FACE_MAX = float(os.environ.get('HBX_FACE_MAX', '0.08'))   # widest face allowed, as a share of the visible 9:16 width
_FD = []
def face_big(path):
    """width of the largest face as a share of the part of the picture a 9:16 frame shows (0 = none / no detector)"""
    if _FD and _FD[0] is None: return 0
    try:
        import cv2
        if not _FD: _FD.append(cv2.FaceDetectorYN.create(str(Path(__file__).parent / 'models' / 'face_yunet.onnx'), '', (320, 320), 0.7))
        im = cv2.imread(str(path))
        if im is None: return 0
        h, w = im.shape[:2]; k = 640 / max(h, w); im = cv2.resize(im, (max(1, int(w * k)), max(1, int(h * k))))
        _FD[0].setInputSize((im.shape[1], im.shape[0])); _, f = _FD[0].detect(im)
        if f is None: return 0
        seen = min(im.shape[1], im.shape[0] * 9 / 16)
        return max(float(x[2]) for x in f) / seen
    except Exception as e:  # noqa: BLE001 - no detector here: the tag rule above still applies
        print('  (không dò được khuôn mặt:', str(e)[:80], ')'); _FD[:] = [None]; return 0
def relevance(q):
    words = [w for w in _re.findall(r'[a-z]+', q.lower()) if len(w) > 2]
    return lambda h: sum(w.rstrip('s') in h.get('tags', '').lower() for w in words)

def search(q, vertical, used, lang='en'):
    # used: id đã dùng trong video + id bị loại (avoid)
    p = dict(key=KEY, q=q[:100], image_type='photo', safesearch='true', per_page=30, order='popular', lang=lang, min_width=1000)
    if vertical: p['orientation'] = 'vertical'
    hits = json.loads(get('https://pixabay.com/api/?' + urllib.parse.urlencode(p))).get('hits', [])
    hits = textless(hits)
    if not hits and vertical: return search(q, False, used, lang)
    sc = relevance(q); hits.sort(key=lambda h: -sc(h))   # on the subject first, then popularity (stable sort)
    hits = faceless_first(hits)
    fresh = [h for h in hits if h['id'] not in used and h['id'] not in AVOID] or [h for h in hits if h['id'] not in used]
    return pick(fresh) or None

VMAX, VFPS = 12, 30

def vsearch(q, used):
    p = dict(key=KEY, q=q[:100], video_type='film', safesearch='true', per_page=30, order='popular', min_width=1280)
    hits = json.loads(get('https://pixabay.com/api/videos/?' + urllib.parse.urlencode(p))).get('hits', [])
    hits = [h for h in textless(hits) if ('v%d' % h['id']) not in used and h.get('duration', 0) >= 4]
    hits = [h for h in hits if ('v%d' % h['id']) not in AVOID] or hits
    # ĐÚNG NỘI DUNG trước: chấm theo số từ khoá có trong tags của clip; rồi mới ưu tiên clip dọc, rồi độ phổ biến
    words = [w for w in q.lower().split() if len(w) > 2]
    def score(h):
        tags = h.get('tags', '').lower()
        return sum(w.rstrip('s') in tags for w in words)
    hits = [h for h in hits if score(h) >= max(1, (len(words) + 1) // 2)] or hits
    hits.sort(key=lambda h: (bool(PEOPLE.search(h.get('tags', ''))), -score(h), 0 if h['videos']['small']['height'] > h['videos']['small']['width'] else 1))
    best = [h for h in hits if score(h) == score(hits[0]) and bool(PEOPLE.search(h.get('tags', ''))) == bool(PEOPLE.search(hits[0].get('tags', '')))] if hits else []
    return pick(best, 4)

def vget(img, h, assets):
    import subprocess
    v = h['videos']['small'] if h['videos']['small'].get('url') else h['videos']['tiny']
    d = assets / f"pv_{h['id']}"; src = assets / f"pv_{h['id']}.mp4"
    if not (d / 'f0001.jpg').exists():
        if not src.exists(): src.write_bytes(get(v['url']))
        d.mkdir(exist_ok=True)
        ss = float(img.get('vstart', 1 if h.get('duration', 0) > 6 else 0))
        # khung dọc 1080 px chiều cao lớn nhất có thể, giữ tỉ lệ gốc (CSS cover sẽ cắt theo khung hiển thị)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(ss), '-i', str(src), '-t', str(VMAX), '-an',
                        '-vf', f'fps={VFPS},scale=-2:1080', '-q:v', '4', str(d / 'f%04d.jpg')], check=True)
        src.unlink(missing_ok=True)
    n = len(list(d.glob('f*.jpg')))
    img['src'] = f'assets/{d.name}/f0001.jpg'; img['frames'] = {'dir': f'assets/{d.name}', 'n': n, 'fps': VFPS}
    img['credit'] = f"Video: {h['user']} / Pixabay"; img['page'] = h['pageURL']; img['pid'] = 'v%d' % h['id']
    print(f"  ▶ {img.get('q')} → {d.name} ({n} khung, {n / VFPS:.1f}s)")

def main(sbp):
    sbp = Path(sbp); sb = json.loads(sbp.read_text()); assets = sbp.parent / 'assets'; assets.mkdir(exist_ok=True)
    if not KEY: sys.exit('Thiếu PIXABAY_KEY')
    used = set(); slots = []
    for s in sb['scenes']:
        if isinstance(s.get('image'), dict): slots.append((s['image'], s['type'] == 'fullbleed'))
        if isinstance(s.get('bg'), dict): slots.append((s['bg'], True))   # cine: toàn cảnh dọc
        for it in s.get('items', []):
            if isinstance(it, dict) and isinstance(it.get('image'), dict): slots.append((it['image'], False))
        for k in ('a', 'b', 'before', 'after'):
            if isinstance(s.get(k), dict) and isinstance(s[k].get('image'), dict): slots.append((s[k]['image'], k in ('before', 'after')))
    import re
    # cùng từ khoá (q + video) xuất hiện nhiều cảnh = CỐ Ý dùng lại cùng 1 cảnh quay (khác góc máy/đoạn) → chỉ tìm 1 lần
    groups, lead = {}, []
    for img, v in slots:
        key = (img.get('q'), bool(img.get('video')))
        shared = key[0] and not img.get('alt')
        if shared and key in groups: groups[key].append(img); continue
        if shared: groups[key] = [img]
        lead.append((img, v))
    followers = [(g[0], g[1:]) for g in groups.values() if len(g) > 1]
    slots = lead
    for img, _ in slots:  # ảnh đã có trong video cũng tính là đã dùng
        m = re.search(r'px_(\d+)', img.get('src') or '')
        if m: used.add(int(m.group(1)))
    for img, _ in slots:   # pid dạng v123 = video đã chọn
        if str(img.get('pid', '')).startswith('v'): used.add(img['pid'])
    for img, _ in slots:   # VIDEO Pixabay
        if not img.get('video'): continue
        if img.get('frames') and (sbp.parent / img['frames']['dir'] / 'f0001.jpg').exists(): continue
        h = None
        if str(img.get('pid', '')).startswith('v'):
            h = (json.loads(get(f"https://pixabay.com/api/videos/?key={KEY}&id={img['pid'][1:]}")).get('hits') or [None])[0]
        skip = set()
        for _ in range(4):
            if not h and img.get('q'): h = vsearch(img['q'], used | skip | {'v' + str(a).lstrip('v') for a in img.get('avoid', [])})
            if not h: break
            used.add('v%d' % h['id']); vget(img, h, assets)
            d = sbp.parent / img['frames']['dir']; n = img['frames']['n']
            big = max(face_big(d / f'f{i:04d}.jpg') for i in {1, max(1, n // 2), max(1, n - 1)})
            if big <= FACE_MAX: break
            print(f"  ✗ {img['pid']}: mặt người quá rõ ({big:.0%} khung), đổi cảnh khác")
            skip.add(img['pid']); img.setdefault('avoid', []).append(img['pid'])
            for k in ('src', 'frames', 'credit', 'page', 'pid'): img.pop(k, None)
            h = None
        if not img.get('frames'): print('  ✗ không có video:', img.get('q'), '→ dùng ảnh'); img.pop('video', None); img.pop('pid', None); continue
    for img, vert in slots:  # ảnh đã chọn ở Pha A (pid) → tải lại đúng ảnh đó
        if img.get('video'): continue
        if img.get('pid') and not (img.get('src') and (sbp.parent / img['src']).exists()):
            h = (json.loads(get(f"https://pixabay.com/api/?key={KEY}&id={img['pid']}")).get('hits') or [None])[0]
            if h:
                fn = assets / f"px_{h['id']}{Path(urllib.parse.urlparse(h['largeImageURL']).path).suffix or '.jpg'}"
                if not fn.exists(): fn.write_bytes(get(h['largeImageURL']))
                img['src'] = f'assets/{fn.name}'; img['credit'] = f"Ảnh: {h['user']} / Pixabay"; used.add(h['id'])
                print(f"  ↺ pid {h['id']} → {fn.name}")
    for img, vert in slots:
        if img.get('video') or (img.get('src') and (sbp.parent / img['src']).exists()) or not img.get('q'): continue
        skip, fn = set(), None
        for _ in range(5):
            h = search(img['q'], vert, used | skip | set(img.get('avoid', [])))
            if not h: break
            used.add(h['id']); url = h['largeImageURL']
            fn = assets / f"px_{h['id']}{Path(urllib.parse.urlparse(url).path).suffix or '.jpg'}"
            if not fn.exists(): fn.write_bytes(get(url))
            big = face_big(fn)
            if big <= FACE_MAX: break
            print(f"  ✗ ảnh {h['id']}: mặt người quá rõ ({big:.0%} khung), đổi ảnh khác")
            skip.add(h['id']); fn = None
        if not fn: print('  ✗ không có ảnh:', img['q']); continue
        img['src'] = f'assets/{fn.name}'; img['credit'] = f"Ảnh: {h['user']} / Pixabay"; img['page'] = h['pageURL']; img['pid'] = h['id']
        print(f"  ✓ {img['q']} → {fn.name} ({h['imageWidth']}x{h['imageHeight']})")
    for L, fs in followers:
        for f in fs:
            for k in ('src', 'frames', 'credit', 'page', 'pid', 'video'):
                if k in L: f[k] = L[k]
                elif k in f and k != 'video': f.pop(k)
    sbp.write_text(json.dumps(sb, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main(sys.argv[1])
