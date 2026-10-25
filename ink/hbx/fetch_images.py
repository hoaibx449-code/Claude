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

def search(q, vertical, used, lang='en'):
    # used: id đã dùng trong video + id bị loại (avoid)
    p = dict(key=KEY, q=q[:100], image_type='photo', safesearch='true', per_page=30, order='popular', lang=lang, min_width=1000)
    if vertical: p['orientation'] = 'vertical'
    hits = json.loads(get('https://pixabay.com/api/?' + urllib.parse.urlencode(p))).get('hits', [])
    if not hits and vertical: return search(q, False, used, lang)
    for h in hits:
        if h['id'] not in used: return h
    return hits[0] if hits else None

VMAX, VFPS = 12, 30

def vsearch(q, used):
    p = dict(key=KEY, q=q[:100], video_type='film', safesearch='true', per_page=30, order='popular', min_width=1280)
    hits = json.loads(get('https://pixabay.com/api/videos/?' + urllib.parse.urlencode(p))).get('hits', [])
    hits = [h for h in hits if ('v%d' % h['id']) not in used and h.get('duration', 0) >= 4]
    # ĐÚNG NỘI DUNG trước: chấm theo số từ khoá có trong tags của clip; rồi mới ưu tiên clip dọc, rồi độ phổ biến
    words = [w for w in q.lower().split() if len(w) > 2]
    def score(h):
        tags = h.get('tags', '').lower()
        return sum(w.rstrip('s') in tags for w in words)
    hits = [h for h in hits if score(h) >= max(1, (len(words) + 1) // 2)] or hits
    hits.sort(key=lambda h: (-score(h), 0 if h['videos']['small']['height'] > h['videos']['small']['width'] else 1))
    return hits[0] if hits else None

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
        for k in ('a', 'b'):
            if isinstance(s.get(k), dict) and isinstance(s[k].get('image'), dict): slots.append((s[k]['image'], False))
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
        if not h and img.get('q'): h = vsearch(img['q'], used | {'v' + str(a).lstrip('v') for a in img.get('avoid', [])})
        if not h: print('  ✗ không có video:', img.get('q'), '→ dùng ảnh'); img.pop('video', None); img.pop('pid', None); continue
        used.add('v%d' % h['id']); vget(img, h, assets)
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
        h = search(img['q'], vert, used | set(img.get('avoid', [])))
        if not h: print('  ✗ không có ảnh:', img['q']); continue
        used.add(h['id']); url = h['largeImageURL']
        fn = assets / f"px_{h['id']}{Path(urllib.parse.urlparse(url).path).suffix or '.jpg'}"
        if not fn.exists(): fn.write_bytes(get(url))
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
