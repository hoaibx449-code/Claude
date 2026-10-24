"""The cover, drawn in the video's own hand: it is also the first frame of the video (the hook is read over
it), so platforms that take the first frame show it too.

Built for short-video covers: a 2-3 line title in marker lettering readable in a second, its key phrase on
a yellow marker swash and circled in red; one big hand-drawn hero with feeling; small doodles that lead the
eye; everything in the middle 3:4 and clear of the bottom fifth and the right-hand buttons."""
from .engine import *
from .props import draw_prop, fig, POSE, FACES, star_pts, rrect, WHITE

TITLE_Y = 470


def _swash(cv, x0, y0, x1, y1):
    """a yellow highlighter stroke behind the key words: slightly tilted, ragged ends"""
    pts = []; n = 14
    for k in range(n + 1):
        t = k / n; pts.append((x0 + (x1 - x0) * t, y0 + rng.uniform(-6, 6) - 8 * t))
    for k in range(n, -1, -1):
        t = k / n; pts.append((x0 + (x1 - x0) * t + rng.uniform(-4, 4), y1 + rng.uniform(-6, 6) - 8 * t))
    cv.shape(pts + [pts[0]], 2, ACC, ACC)


def _doodles(cv):
    for (x, y, r) in ((140, 330, 26), (960, 760, 22), (120, 1000, 18)):
        cv.poly(star_pts(x, y, r, 0.42, 4, -90), INK, ACC, 5)
    for (x, y) in ((930, 300), (170, 1270)):
        for a in (-60, 0, 60): cv.line([(x + 18 * math.cos(math.radians(a - 90)), y + 18 * math.sin(math.radians(a - 90))),
                                        (x + 40 * math.cos(math.radians(a - 90)), y + 40 * math.sin(math.radians(a - 90)))], 6, INK)


def cover_ops(cover):
    lines = [' '.join(str(l).split()) for l in (cover.get('lines') or []) if str(l).strip()][:3] or [cover.get('title') or 'Video mới']
    hl = ' '.join(str(cover.get('highlight') or '').split()).lower(); badge = str(cover.get('badge') or '').strip()
    cv = Canvas()
    size = min(fit_size(l, 168, 920) for l in lines); gap = size * 1.12
    y0 = TITLE_Y - gap * (len(lines) - 1) / 2 + (40 if badge else 0)
    # the swash goes first, under the words
    marks = []
    for k, l in enumerate(lines):
        i = l.lower().find(hl) if hl else -1
        if i >= 0:
            tot = text_width(l, size); x = (W - tot) / 2
            x0 = x + (text_width(l[:i].rstrip(), size) + text_width(' ', size) if i else 0) - 18; x1 = x + text_width(l[:i + len(hl)], size) + 18
            y = y0 + k * gap; _swash(cv, x0, y - size * 0.42, x1, y + size * 0.4); marks.append((x0, x1, y))
    for k, l in enumerate(lines): cv.text(W / 2, y0 + k * gap, l, size, INK, max_w=940, lines=1)
    for x0, x1, y in marks:  # a red marker underline under the key phrase
        cv.line([(x0 + 10, y + size * 0.55), ((x0 + x1) / 2, y + size * 0.62), (x1 - 10, y + size * 0.52)], 11, RED)
    if badge:
        bs = fit_size(badge, 56, 520); bw = text_width(badge, bs) + 70
        rrect(cv, W / 2 - bw / 2, y0 - gap * 0.5 - 120, W / 2 + bw / 2, y0 - gap * 0.5 - 30, 28, 8, INK, RED)
        cv.text(W / 2, y0 - gap * 0.5 - 75, badge, bs, WHITE, max_w=520, lines=1)
    # the hero, big
    g = 1450; f = cover.get('figure') if isinstance(cover.get('figure'), dict) else None
    prop = cover.get('prop') or 'trophy'
    if f:
        draw_prop(cv, prop, 690, 1150, 1.35); cv.line([(80, g), (1000, g)], 8)
        fig(cv, 300, g, 1.05, f.get('pose') if f.get('pose') in POSE else 'cheer', f.get('face') if f.get('face') in FACES else 'proud', 15)
    else:
        draw_prop(cv, prop, 540, 1150, 1.9)
    _doodles(cv)
    return cv.done()


def cover_frame(cover):
    img = np.empty((H, W, 3), np.uint8); img[:] = BG
    for op in cover_ops(cover): prep(op); render_full(img, op)
    return img


def make_cover(cover, out, brand=''):
    img = cover_frame(cover)
    if brand:
        pil = Image.fromarray(img); ImageDraw.Draw(pil).text((70, 150), brand, font=font(44), fill=INK, anchor='lm'); img = np.asarray(pil)
    Image.fromarray(img).save(out, quality=93)
    return img
