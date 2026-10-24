"""The cover (thumbnail) for 9:16 videos, 1080x1920.

Rules of a good short-video cover, built in:
- a 2-3 line title of at most about 8 words in heavy type, readable in one second, its key word on a yellow
  block outlined in ink with an offset shadow;
- one big hero illustration with emotion (the figure reacting, an object), a burst of light behind it;
- everything important inside the middle 3:4 (what profile grids show) and clear of the bottom fifth and the
  right-hand button column of TikTok/Reels/Shorts; a small badge for a number or hook."""
from .engine import *
from .props import draw_prop, fig, POSE, FACES, rays, WHITE

SAFE_TOP, SAFE_BOTTOM = 260, 1500


def _paper():
    img = np.empty((H, W, 3), np.float32); img[:] = BG
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - 0.10 * (((xx - W / 2) / W) ** 2 + ((yy - H * 0.45) / H) ** 2) * 2.2  # soft vignette
    noise = np.random.RandomState(3).randn(H, W).astype(np.float32) * 2.2
    return np.clip(img * v[..., None] + noise[..., None], 0, 255).astype(np.uint8)


def _hero(img, cover):
    """draw the cover's illustration fully, larger than in the video"""
    from .engine import Canvas
    cv = Canvas(); cx, g = 540, 1440
    f = cover.get('figure') if isinstance(cover.get('figure'), dict) else None
    prop = cover.get('prop') or 'trophy'
    if f:
        draw_prop(cv, prop, 700, 1130, 1.25)
        fig(cv, 330, g, 1.05, f.get('pose') if f.get('pose') in POSE else 'cheer', f.get('face') if f.get('face') in FACES else 'proud', 15)
    else:
        draw_prop(cv, prop, cx, 1150, 1.8)
    for op in cv.done(): prep(op); render_full(img, op)


def _burst(draw, cx, cy, r0, r1, n=18):
    for k in range(n):
        a0 = math.radians(k * 360 / n); a1 = math.radians(k * 360 / n + 360 / n / 2)
        draw.polygon([(cx + r0 * math.cos(a0), cy + r0 * math.sin(a0)), (cx + r1 * math.cos(a0), cy + r1 * math.sin(a0)),
                      (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1)), (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1))], fill=ACC + (70,))


def make_cover(cover, out, brand=''):
    lines = [str(l).strip() for l in (cover.get('lines') or []) if str(l).strip()][:3] or [cover.get('title') or 'Video mới']
    hl = str(cover.get('highlight') or '').strip().lower(); badge = str(cover.get('badge') or '').strip()
    img = _paper()
    # light burst behind the hero, then the hero itself
    pil = Image.fromarray(img).convert('RGBA'); lay = Image.new('RGBA', pil.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    _burst(d, 560, 1130, 120, 760); d.ellipse([560 - 330, 1130 - 330, 560 + 330, 1130 + 330], fill=ACC + (60,))
    img = np.asarray(Image.alpha_composite(pil, lay).convert('RGB')).copy()
    _hero(img, cover)
    pil = Image.fromarray(img).convert('RGBA'); lay = Image.new('RGBA', pil.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    # the title: one size for all lines, the largest that fits 900px
    size = min(fit_size(l, 180, 940, FONT_BLACK) for l in lines)
    f = font(size, FONT_BLACK); gap = int(size * 1.12)
    y = SAFE_TOP + 120 + (gap if badge else 0) // 2
    for l in lines:
        tot = text_width(l, size, FONT_BLACK); x = (W - tot) / 2
        i = l.lower().find(hl) if hl else -1
        if i >= 0:  # one block behind the whole highlighted phrase
            x0 = x + (text_width(l[:i], size, FONT_BLACK) if i else 0); x1 = x + text_width(l[:i + len(hl)], size, FONT_BLACK)
            pad = 18; box = [x0 - pad, y - size * 0.62, x1 + pad, y + size * 0.52]
            d.rounded_rectangle([box[0] + 10, box[1] + 12, box[2] + 10, box[3] + 12], 22, fill=INK + (255,))
            d.rounded_rectangle(box, 22, fill=ACC + (255,), outline=INK + (255,), width=8)
        # a white edge keeps the type crisp over any part of the drawing
        d.text((x, y), l, font=f, fill=INK + (255,), anchor='lm', stroke_width=6, stroke_fill=WHITE + (255,))
        y += gap
    # brush underline under the title
    d.line([(250, y - gap * 0.35), (830, y - gap * 0.42)], fill=RED + (230,), width=14, joint='curve')
    if badge:
        bf = font(fit_size(badge, 58, 520, FONT_BLACK), FONT_BLACK); bb = d.textbbox((540, SAFE_TOP), badge, font=bf, anchor='mm')
        d.rounded_rectangle([bb[0] - 30, bb[1] - 18, bb[2] + 30, bb[3] + 18], 40, fill=RED + (255,), outline=INK + (255,), width=6)
        d.text((540, SAFE_TOP), badge, font=bf, fill=(255, 255, 255, 255), anchor='mm')
    if brand:
        d.text((60, 120), brand, font=font(40), fill=INK + (200,), anchor='lm')
    out_img = Image.alpha_composite(pil, lay).convert('RGB')
    out_img.save(out, quality=92)
    return out
