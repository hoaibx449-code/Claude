"""Scene layouts: a scene in the storyboard is data, {"layout": name, ...slots}, never code.

Each layout places props, the figure, labels and marks in the safe area of the 9:16 frame and returns the
ops the hand draws (main things first, labels and accents after). Unknown props fall back to a star, long
labels shrink to fit, so a storyboard written by an AI always renders cleanly."""
from .engine import *
from .props import *

# safe area: clear of the cover title at the top and of the captions / platform buttons at the bottom
X0, X1, Y0, Y1 = 90, 990, 380, 1470
G = 1440  # ground line

def _s(d, k, default=''):
    v = d.get(k) if isinstance(d, dict) else None
    return str(v).strip() if isinstance(v, (str, int, float)) and not isinstance(v, bool) and str(v).strip() else default
def _fig(cv, x, y, s, f, flip=1):
    f = f or {}
    return fig(cv, x, y, s, f.get('pose', 'stand') if f.get('pose') in POSE else 'stand', f.get('face', 'happy'), 13, flip, shirt=ACC if f.get('accent') else None)
def _lab(cv, x, y, t, size=54, w=380, c=INK, lines=2):
    if t: cv.text(x, y, t, size, c, max_w=w, lines=lines)
def _ground(cv): cv.line([(70, G), (1010, G)], 8)

def L_hero(cv, d):
    """one big object with a short label, the figure beside it reacting"""
    f = d.get('figure')
    if f:
        draw_prop(cv, d.get('prop', 'star'), 670, 800, 1.45); _ground(cv); _fig(cv, 245, G, 1.05, f)
        _lab(cv, 670, 1180, _s(d, 'label'), 68, 560)
    else:
        draw_prop(cv, d.get('prop', 'star'), 540, 860, 1.9); _lab(cv, 540, 1300, _s(d, 'label'), 78, 860)

def L_big_number(cv, d):
    """a striking number: big figure in a yellow box, what it means under it, a small prop or reaction"""
    num = _s(d, 'number', '1')
    sz = fit_size(num, 300, 800); w = text_width(num, sz) + 130
    rrect(cv, 540 - w / 2, 470, 540 + w / 2, 820, 44, 13, INK, ACC); cv.text(540, 645, num, sz)
    _lab(cv, 540, 930, _s(d, 'label'), 70, 880)
    if d.get('figure'): _ground(cv); _fig(cv, 540, G, 0.7, d['figure'])
    elif d.get('prop'): draw_prop(cv, d['prop'], 540, 1220, 1.0)

def L_before_after(cv, d):
    """two sides: before (left) and after (right), an arrow between"""
    a, b = d.get('before') or {}, d.get('after') or {}
    _lab(cv, 270, 470, _s(a, 'title', 'TRƯỚC'), 66, 380); _lab(cv, 810, 470, _s(b, 'title', 'SAU'), 66, 380)
    figs = a.get('figure') or b.get('figure')
    for side, x, flip in ((a, 270, 1), (b, 810, -1)):
        if side.get('figure'): _fig(cv, x, G, 1.0, side['figure'], flip)
        else: draw_prop(cv, side.get('prop', 'star'), x, 980, 1.15)
    if figs: _ground(cv)
    ya = 1180 if figs else 980
    cv.arrow(470, ya, 610, ya, 14, INK, 42); _lab(cv, 540, ya - 70, _s(d, 'arrow'), 44, 240, RED)
    ly = 820 if figs else 1300
    _lab(cv, 270, ly, _s(a, 'label'), 54, 400); _lab(cv, 810, ly, _s(b, 'label'), 54, 400)

def L_growth(cv, d):
    """the same thing growing over time: small, medium, large with time labels and a time arrow"""
    items = (d.get('items') or [])[:3] or [{'label': 'Ngày 1'}, {'label': '1 tháng'}, {'label': '1 năm'}]
    prop = d.get('prop', 'tree'); n = len(items)
    _lab(cv, 540, 470, _s(d, 'title'), 76, 880)
    xs = [220, 520, 830][:n] if n == 3 else [330, 750][:n] if n == 2 else [540]
    for k, (x, it) in enumerate(zip(xs, items)):
        sc = (0.6, 0.95, 1.3)[k] if n == 3 else (0.8, 1.3)[k] if n == 2 else 1.3
        p = it.get('prop', prop); cy = 1330 - (190 if p == 'tree' else 130 if p in ('sapling', 'sprout') else 150) * sc
        draw_prop(cv, p, x, cy, sc)
        _lab(cv, x, 1385, _s(it, 'label'), 56, 280)
    cv.arrow(110, 1455, 970, 1455, 12, INK, 36)

def L_stairs(cv, d):
    """step by step: blocks rising to a flag, the figure climbing"""
    steps = (d.get('steps') or ['Bước 1', 'Bước 2', 'Bước 3', 'Bước 4'])[:5]; n = len(steps); bw = 780 / n
    _lab(cv, 540, 460, _s(d, 'title'), 76, 880); _ground(cv)
    for k, t in enumerate(steps):
        x0 = 150 + k * bw; h = 130 + k * (520 / max(1, n - 1))
        cv.rect(x0, G - h, x0 + bw, G, 10, INK, WHITE if k % 2 == 0 else PAPER)
        _lab(cv, x0 + bw / 2, G - h / 2 + 30, t, 46, bw - 18, lines=1)
    top = G - (130 + 520); xf = 150 + (n - 1) * bw + bw / 2
    cv.line([(xf, top), (xf, top - 160)], 10); cv.poly([(xf, top - 160), (xf + 105, top - 122), (xf, top - 85)], INK, ACC, 7)
    f = d.get('figure') if isinstance(d.get('figure'), dict) else {'pose': 'climb', 'face': 'determined'}
    _fig(cv, 150 + bw / 2, G - 130, 0.62, f)

def L_compare(cv, d):
    """two bars side by side: which is bigger, with labels and a dashed level line"""
    a, b = d.get('left') or {}, d.get('right') or {}
    _lab(cv, 540, 460, _s(d, 'title'), 76, 880); _ground(cv)
    for side, x in ((a, 290), (b, 790)):
        try: v = float(side.get('value', 0.5) or 0.5)
        except (TypeError, ValueError): v = 0.5
        v = max(0.15, min(1.0, v)); h = 700 * v
        col = {'red': RED, 'green': (170, 220, 170), 'yellow': ACC, 'blue': SKY}.get(side.get('color', ''), WHITE)
        cv.rect(x - 120, G - h, x + 120, G, 11, INK, col)
        if side.get('prop'): draw_prop(cv, side['prop'], x, G - h - 120, 0.6)
        _lab(cv, x, G - h / 2, _s(side, 'value_label'), 66, 210)
        _lab(cv, x, 1500, _s(side, 'label'), 50, 420)
    _lab(cv, 540, 1060, 'VS', 76)

def L_choose(cv, d):
    """options in cards, one picked with a check, the figure pointing"""
    opts = (d.get('options') or [])[:3]; n = max(1, len(opts))
    try: pick = int(d.get('pick', 0) or 0)
    except (TypeError, ValueError): pick = 0
    _lab(cv, 540, 460, _s(d, 'title'), 76, 880)
    cw = 860 / n
    for k, o in enumerate(opts):
        x0 = 110 + k * cw; cv.rect(x0 + 10, 560, x0 + cw - 10, 980, 10, INK, ACC if k == pick else WHITE)
        draw_prop(cv, o.get('prop', 'star'), x0 + cw / 2, 720, 0.55 if n == 3 else 0.75)
        _lab(cv, x0 + cw / 2, 900, _s(o, 'label'), 46, cw - 40)
    if opts:
        x = 110 + min(pick, n - 1) * cw + cw - 40; cv.circle(x, 570, 40, 8, INK, GREEN); check(cv, x, 570, 0.8, 9)
    _ground(cv); _fig(cv, 280, G, 0.85, d.get('figure') or {'pose': 'point', 'face': 'happy'})
    _lab(cv, 720, 1200, _s(d, 'label'), 62, 480)

def L_checklist(cv, d):
    """a short list being ticked off"""
    items = (d.get('items') or [])[:4]; n = max(1, len(items)); gap = min(230, 900 / n)
    _lab(cv, 540, 470, _s(d, 'title'), 78, 880)
    y0 = 960 - gap * (n - 1) / 2
    for k, t in enumerate(items):
        y = y0 + k * gap; cv.rect(130, y - 70, 270, y + 70, 11, INK, WHITE)
        _lab(cv, 620, y, t, 64, 640)
    for k in range(len(items)): check(cv, 200, y0 + k * gap, 1.9, 15)

def L_quote(cv, d):
    """one sentence to remember, in a card with big quote marks and an underline"""
    t = _s(d, 'text'); rows = wrap(t, 72, 760, 6)[:6]; h = 124 * len(rows) + 170; y0 = 920 - h / 2
    rrect(cv, 120, y0, 960, y0 + h, 44, 12, INK, WHITE)
    cv.text(205, y0 + 14, '“', 190, ACC)
    for k, l in enumerate(rows): cv.text(540, y0 + 140 + k * 124, l, 72, INK, max_w=780, lines=1)
    cv.line([(330, y0 + h - 50), (750, y0 + h - 50)], 11, ACC)
    _lab(cv, 540, y0 + h + 80, _s(d, 'author'), 50, 760)

def L_obstacle(cv, d):
    """something in the way and the figure getting over it"""
    _lab(cv, 540, 460, _s(d, 'title'), 76, 880); _ground(cv)
    draw_prop(cv, d.get('prop', 'wall'), 640, G - 190, 1.15)
    _lab(cv, 640, G - 440, _s(d, 'label'), 58, 440, RED)
    _fig(cv, 210, G, 0.95, d.get('figure') or {'pose': 'run', 'face': 'determined'})
    path = bez((300, G - 600), (640, G - 900), (960, G - 560)); dashed(cv, path, 9, INK); cv.arrow(path[-3][0], path[-3][1], 965, G - 540, 10, INK, 30)

def L_journey(cv, d):
    """a winding path with milestones to a flag"""
    ms = (d.get('milestones') or ['Bắt đầu', 'Kiên trì', 'Bứt phá'])[:4]
    _lab(cv, 540, 450, _s(d, 'title'), 76, 880)
    pts = bez((180, 1430), (1120, 1180), (420, 1000)) + bez((420, 1000), (-60, 820), (760, 680))[1:]
    cv.line(pts, 34, GRAYR); dashed(cv, pts, 6, WHITE)
    idx = [int(len(pts) * (k + 1) / (len(ms) + 1)) for k in range(len(ms))]
    for k, i in enumerate(idx):
        x, y = pts[i]; cv.circle(x, y, 30, 8, INK, ACC); _lab(cv, x + (190 if x < 540 else -190), y, ms[k], 52, 300)
    x, y = pts[-1]; cv.line([(x, y), (x, y - 160)], 10); cv.poly([(x, y - 160), (x + 105, y - 122), (x, y - 85)], INK, RED, 7)
    _lab(cv, x - 260, y - 110, _s(d, 'goal'), 54, 300)

def L_icons(cv, d):
    """two to four ideas side by side, each an object and a word"""
    items = (d.get('items') or [])[:4]; n = max(1, len(items))
    _lab(cv, 540, 460, _s(d, 'title'), 78, 880)
    if n <= 2: pos = [(300, 880), (780, 880)][:n]; sc = 1.0
    elif n == 3: pos = [(280, 760), (800, 760), (540, 1180)]; sc = 0.85
    else: pos = [(290, 740), (790, 740), (290, 1170), (790, 1170)]; sc = 0.78
    for (x, y), it in zip(pos, items): draw_prop(cv, it.get('prop', 'star'), x, y, sc)
    for (x, y), it in zip(pos, items): _lab(cv, x, y + 190 * sc + 40, _s(it, 'label'), 56, 420)

def L_cta(cv, d):
    """the ending: save, share, comment, with a question for the viewer"""
    _lab(cv, 540, 460, _s(d, 'title'), 74, 880)
    for x, p, t in ((240, 'bookmark', 'Lưu'), (540, 'share', 'Chia sẻ'), (840, 'comment', 'Bình luận')):
        draw_prop(cv, p, x, 700, 0.75); _lab(cv, x, 880, t, 54, 260)
    q = _s(d, 'question')
    if q:
        rrect(cv, 110, 1000, 970, 1300, 44, 12, INK, WHITE); cv.poly([(300, 1298), (250, 1390), (390, 1298)], INK, WHITE, 10)
        cv.text(540, 1150, q, 64, INK, max_w=780)

def L_chapter(cv, d):
    """a chapter card: number and title"""
    n = _s(d, 'number', '1')
    cv.circle(540, 760, 170, 13, INK, ACC); cv.text(540, 770, n, 190)
    _lab(cv, 540, 1060, _s(d, 'title'), 84, 880); cv.line([(300, 1170), (780, 1170)], 11, ACC)


def L_thought(cv, d):
    """the figure thinking, the object in a big thought bubble, the label under it"""
    _ground(cv); _fig(cv, 250, G, 0.95, d.get('figure') or {'pose': 'think', 'face': 'think'})
    ell(cv, 640, 720, 290, 230, 11, INK, WHITE)
    for (x, y, r) in ((420, 960, 34), (360, 1015, 22)): cv.circle(x, y, r, 8, INK, WHITE)
    draw_prop(cv, d.get('prop', 'bulb'), 640, 720, 0.95)
    _lab(cv, 660, 1110, _s(d, 'label'), 64, 560)

def L_callout(cv, d):
    """a big object with a hand-written tag pointing at it"""
    draw_prop(cv, d.get('prop', 'star'), 540, 920, 1.55)
    t = _s(d, 'label')
    if t:
        sz = fit_size(t, 66, 640); w = text_width(t, sz) + 70
        rrect(cv, 540 - w / 2, 470, 540 + w / 2, 580, 30, 9, INK, ACC); cv.text(540, 525, t, sz, INK, max_w=660, lines=1)
        cv.arrow(540 + w / 2 - 40, 590, 700, 700, 9, INK, 30)
    for x, y in ((180, 700), (900, 1200), (170, 1250)): cv.poly(star_pts(x, y, 24, 0.42, 4, -90), INK, ACC, 5)

def L_hold(cv, d):
    """the figure holding the object up, proud or tired"""
    f = d.get('figure') or {'pose': 'lift', 'face': 'proud'}
    _ground(cv); p = fig(cv, 540, G, 1.0, 'lift', f.get('face', 'proud'), 13)
    hx = (p['handL'][0] + p['handR'][0]) / 2; hy = min(p['handL'][1], p['handR'][1])
    draw_prop(cv, d.get('prop', 'trophy'), hx, hy - 130, 0.8)
    _lab(cv, 540, 470, _s(d, 'label'), 70, 860)

HERO_VARIANTS = ('hero', 'callout', 'thought', 'hold')

LAYOUTS = {
 'hero': (L_hero, 'một đồ vật lớn + nhãn, có thể kèm nhân vật phản ứng: {prop,label,figure?}'),
 'big_number': (L_big_number, 'con số gây ấn tượng: {number,label,prop?|figure?}'),
 'before_after': (L_before_after, 'trước/sau: {before:{title,prop|figure,label}, after:{...}, arrow?}'),
 'growth': (L_growth, 'nhỏ → lớn theo thời gian: {title?, prop, items:[{label,prop?}]x3, axis?}'),
 'stairs': (L_stairs, 'từng bước đi lên: {title?, steps:[2-5 nhãn], figure?}'),
 'compare': (L_compare, 'so sánh hai cột: {title?, left:{label,value 0-1,value_label?,color?,prop?}, right:{...}}'),
 'choose': (L_choose, 'chọn 1 trong các lựa chọn: {title, options:[{prop,label}]x2-3, pick, label?}'),
 'checklist': (L_checklist, 'danh sách 2-4 việc được tick: {title, items:[...]}'),
 'quote': (L_quote, 'một câu đáng nhớ: {text, author?}'),
 'obstacle': (L_obstacle, 'vượt chướng ngại: {title?, prop(wall|boulder|...), label, figure?}'),
 'journey': (L_journey, 'hành trình nhiều chặng: {title?, milestones:[2-4], goal?}'),
 'icons': (L_icons, '2-4 ý song song: {title?, items:[{prop,label}]}'),
 'cta': (L_cta, 'kết: Lưu/Chia sẻ/Bình luận + câu hỏi: {title?, question}'),
 'chapter': (L_chapter, 'thẻ chương (video dài): {number,title}'),
 'callout': (L_callout, 'một đồ vật lớn với thẻ chữ chỉ vào: {prop,label}'),
 'thought': (L_thought, 'nhân vật suy nghĩ, đồ vật trong bong bóng ý nghĩ: {prop,label,figure?}'),
 'hold': (L_hold, 'nhân vật giơ cao đồ vật (thành quả, gánh nặng): {prop,label,figure?}'),
}

def build(scene):
    """ops for a storyboard scene; a broken scene becomes a plain hero card instead of failing the video"""
    cv = Canvas(); name = scene.get('layout', 'hero')
    fn = LAYOUTS.get(name, LAYOUTS['hero'])[0]
    try: fn(cv, scene)
    except Exception as e:  # noqa: BLE001 - a bad slot must not stop the render
        cv = Canvas(); L_hero(cv, {'prop': scene.get('prop', 'star'), 'label': scene.get('label') or scene.get('title') or ''})
    return cv.done()
