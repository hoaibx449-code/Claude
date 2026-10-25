#!/usr/bin/env python3
"""Ảnh bìa hook (1080x1920) — dùng làm KHUNG ĐẦU TIÊN của MP4 (ảnh đại diện Facebook/Shorts) và cover.jpg.

   python3 cover.py sb.json cover.jpg        # sb.json = storyboard đã có bg.src (sau fetch_images)

storyboard.cover (tuỳ chọn; thiếu thì tự lấy cảnh 1 + tiêu đề cảnh 1):
  {"shot": 3,                        # cảnh (đếm từ 1) lấy nền — chọn cảnh đẹp, chủ thể rõ, hợp hook
   "hook": "Tài khoản bạn quên | vẫn đang *mở cửa*",   # 4–9 chữ, "|" xuống dòng, *…* tô màu nhấn (1 cụm)
   "kicker": "AN TOÀN SỐ",            # nhãn nhỏ phía trên (chủ đề), ≤ 3 từ
   "detail": "12 năm · 1 mật khẩu · 3.300 người",  # 1 dòng chi tiết thật từ nguồn (tuỳ chọn)
   "type": "tò mò",                   # nhóm hook (ghi lại để xoay vòng, không hiển thị)
   "focus": {"x": .5, "y": .45},      # vùng cắt ảnh nền
   "pos": "low|mid|top"}              # vị trí khối chữ (mặc định low)
Phong cách lấy từ storyboard.style (scheme, accent, accentInk, font, grade) → bìa cùng tông với video.
"""
import html, json, os, re, sys
from pathlib import Path

GRADE = {'night': 'brightness(.78) contrast(1.12) saturate(.85) hue-rotate(-6deg)', 'cool': 'contrast(1.08) saturate(.9) hue-rotate(-8deg)',
         'warm': 'contrast(1.06) saturate(1.1) sepia(.12)', 'dawn': 'contrast(1.05) saturate(1.12) sepia(.1) brightness(1.04)',
         'bright': 'contrast(1.05) saturate(1.15) brightness(1.06)', 'mono': 'grayscale(1) contrast(1.15)',
         'earth': 'contrast(1.05) saturate(.95) sepia(.18)', 'none': 'none'}


def _md(s, accent, ink):
    s = html.escape(s)
    s = re.sub(r'\*(.+?)\*', lambda m: f'<b style="{"white-space:nowrap;" if len(m.group(1)) <= 16 else ""}background:{accent};color:{ink};padding:.02em .14em 0;box-decoration-break:clone;-webkit-box-decoration-break:clone">{m.group(1)}</b>', s)
    return '<br>'.join(p.strip() for p in s.split('|'))


def build_html(sb, base):
    sc = sb['scenes']; cv = dict(sb.get('cover') or {})
    st = sb.get('style') or {}
    idx = max(1, min(len(sc), int(cv.get('shot', 1)))) - 1
    # cảnh không có ảnh nền (cảnh 3D) → lấy cảnh có nền gần nhất
    order = [idx] + [i for i in range(len(sc)) if i != idx]
    bg = next((sc[i]['bg'] for i in order if isinstance(sc[i].get('bg'), dict) and sc[i]['bg'].get('src')), None)
    src = bg['src'] if bg else ''
    if src and not src.startswith(('file:', 'http', 'data:')): src = (base / src).resolve().as_uri()
    hook = cv.get('hook')
    if not hook:
        t = next((s.get('title') for s in sc if s.get('title')), None) or [sb.get('title', '')]
        hook = ' | '.join(x for x in t if x)
    foc = cv.get('focus') or (bg or {}).get('focus') or {'x': .5, 'y': .45}
    dark = st.get('scheme', 'dark') != 'light'
    acc, ink = st.get('accent', '#ffb21e'), st.get('accentInk', '#111')
    font = st.get('font', 'Oswald')
    pos = {'top': 'top:150px', 'mid': 'top:560px', 'low': 'bottom:250px'}[cv.get('pos', 'low')]
    shade = ('linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 42%,rgba(0,0,0,.72) 72%,rgba(0,0,0,.88) 100%)' if dark
             else 'linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.65) 100%)')
    kick = html.escape(cv.get('kicker', '') or '')
    det = html.escape(cv.get('detail', '') or '')
    brand = html.escape(sb.get('brand', ''))
    fonts = ''.join(f'@import url("../node_modules/@fontsource/{f}.css");' for f in
                    ('oswald/600', 'oswald/700', 'barlow-condensed/700', 'barlow-condensed/800', 'space-grotesk/700', 'playfair-display/800', 'lora/700',
                     'be-vietnam-pro/500', 'be-vietnam-pro/600', 'be-vietnam-pro/800'))
    weight = 800 if font in ('Barlow Condensed', 'Playfair Display', 'Be Vietnam Pro') else 700
    if font == 'Lora': weight = 700
    upper = font in ('Oswald', 'Barlow Condensed')
    return f'''<!doctype html><meta charset="utf-8"><style>{fonts}
html,body{{margin:0;width:720px;height:1280px;overflow:hidden;background:#000}}
.bg{{position:absolute;inset:0;background:url("{src}") {foc.get("x", .5) * 100:.0f}% {foc.get("y", .45) * 100:.0f}%/cover no-repeat;filter:{GRADE.get(st.get("grade", "none"), "none")};transform:scale(1.04)}}
.sh{{position:absolute;inset:0;background:{shade}}}
.box{{position:absolute;left:52px;right:52px;{pos}}}
.k{{display:inline-block;font:600 22px/1 "Be Vietnam Pro","{font}",sans-serif;letter-spacing:.16em;color:{acc};text-transform:uppercase;margin-bottom:22px;padding-left:14px;border-left:4px solid {acc}}}
.h{{font:{weight} {78 if upper else 70}px/{1.24 if upper else 1.18} "{font}","Be Vietnam Pro",sans-serif;text-transform:{"uppercase" if upper else "none"};text-wrap:balance;color:#fff;letter-spacing:{".01em" if upper else "-.01em"};text-shadow:0 2px 18px rgba(0,0,0,.45)}}
.d{{margin-top:26px;font:500 25px/1.3 "Be Vietnam Pro",sans-serif;color:rgba(255,255,255,.88)}}
.br{{position:absolute;left:52px;bottom:120px;font:600 18px/1 "Be Vietnam Pro",sans-serif;letter-spacing:.2em;color:rgba(255,255,255,.6)}}
</style><div class="bg"></div><div class="sh"></div>
<div class="box">{f'<div class="k">{kick}</div>' if kick else ''}<div class="h">{_md(hook, acc, ink)}</div>{f'<div class="d">{det}</div>' if det else ''}</div>
{f'<div class="br">{brand}</div>' if brand else ''}'''


def render_cover(sb, base, out):
    from playwright.sync_api import sync_playwright
    page = Path(__file__).resolve().parent / 'engine' / f'_cover_{Path(out).stem}.html'; page.write_text(build_html(sb, Path(base)))
    with sync_playwright() as pw:
        exe = os.environ.get('HBX_CHROMIUM')
        b = pw.chromium.launch(args=['--allow-file-access-from-files'], **({'executable_path': exe} if exe else {}))
        pg = b.new_page(viewport={'width': 720, 'height': 1280}, device_scale_factor=1.5)
        pg.goto(page.resolve().as_uri()); pg.wait_for_timeout(400)
        pg.evaluate('document.fonts.ready')
        pg.screenshot(path=str(out), type='jpeg', quality=94)
        b.close()
    page.unlink(missing_ok=True)
    return out


if __name__ == '__main__':
    p = Path(sys.argv[1]).resolve()
    print(render_cover(json.loads(p.read_text()), p.parent, sys.argv[2]))
