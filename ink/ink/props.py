"""The drawing library: a stick figure with poses and faces, and objects drawn in the same hand.

Every object is a function obj(cv, cx, cy, s) drawn around (cx, cy) inside a box about 260*s wide, so a
layout can place any of them in any slot. PROPS lists them with Vietnamese/English keywords, which is what
the storyboard AI picks from."""
from .engine import *

WHITE = (255, 252, 245); PAPER = (240, 232, 215); BROWN = (176, 124, 84); LEAF = (120, 196, 128)
SKY = (214, 236, 250); GRAYR = (214, 209, 198); PINK = (255, 205, 210); DROP = (150, 200, 240)
BLUE = (90, 150, 230); ORANGE = (245, 150, 70); PURPLE = (150, 110, 220); DARK = (70, 74, 86)


def ell(cv, cx, cy, rx, ry, w=10, c=INK, fill=None):
    n = max(30, int((rx + ry) / 6)); a0 = rng.rand() * 6.28; t = np.linspace(a0, a0 + 2 * math.pi * 1.01, n)
    cv.shape([(cx + rx * math.cos(a), cy + ry * math.sin(a)) for a in t], w, c, fill)

def bez(p0, p1, p2, n=36):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]

def dashed(cv, pts, w=9, c=INK, seg=2, gap=1):
    i = 0
    while i < len(pts) - 1:
        j = min(i + seg, len(pts) - 1); cv.line(pts[i:j + 1], w, c); i = j + gap

def check(cv, x, y, s=1.0, w=12):
    cv.line([(x - 26 * s, y), (x - 8 * s, y + 24 * s), (x + 30 * s, y - 26 * s)], w, GREEN)

def cross(cv, x, y, s=1.0, w=14):
    cv.line([(x - 34 * s, y - 34 * s), (x + 34 * s, y + 34 * s)], w, RED); cv.line([(x + 34 * s, y - 34 * s), (x - 34 * s, y + 34 * s)], w, RED)

def rays(cv, x, y, r0, r1, n=8, c=None, w=7, a0=0):
    for k in range(n):
        a = math.radians(a0 + k * 360 / n); cv.line([(x + math.cos(a) * r0, y + math.sin(a) * r0), (x + math.cos(a) * r1, y + math.sin(a) * r1)], w, c or ACC)

def star_pts(cx, cy, r, ri=0.45, n=5, rot=-90):
    return [(cx + (r if k % 2 == 0 else r * ri) * math.cos(math.radians(rot + k * 180 / n)), cy + (r if k % 2 == 0 else r * ri) * math.sin(math.radians(rot + k * 180 / n))) for k in range(2 * n)]

def rrect(cv, x0, y0, x1, y1, r=24, w=10, c=INK, fill=None):
    """rounded rectangle"""
    pts = []
    for (cx, cy, a) in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        pts += [(cx + r * math.cos(math.radians(a + t)), cy + r * math.sin(math.radians(a + t))) for t in np.linspace(0, 90, 7)]
    cv.shape(pts + [pts[0]], w, c, fill)


# ---------------- the figure ----------------
POSE = {
 'stand': ([(-55, 55), (-70, 150)], [(55, 55), (70, 150)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'cheer': ([(-70, -10), (-105, -110)], [(70, -10), (105, -110)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'flex': ([(-100, 25), (-72, -70)], [(100, 25), (72, -70)], [(-35, 95), (-62, 190)], [(35, 95), (62, 190)]),
 'worry': ([(-48, 40), (-26, -55)], [(48, 40), (26, -55)], [(-20, 95), (-34, 190)], [(20, 95), (34, 190)]),
 'point': ([(-55, 55), (-62, 150)], [(75, -5), (160, -75)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'hold': ([(-25, 75), (45, 95)], [(40, 70), (75, 100)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'walk': ([(-45, 70), (-85, 135)], [(55, 55), (95, 120)], [(-10, 95), (-80, 188)], [(30, 95), (60, 182)]),
 'run': ([(-70, 30), (-120, -10)], [(60, 70), (120, 40)], [(-60, 80), (-130, 150)], [(50, 100), (40, 190)]),
 'tired': ([(-40, 90), (-45, 190)], [(40, 90), (45, 190)], [(-22, 95), (-38, 190)], [(22, 95), (38, 190)]),
 'think': ([(-55, 55), (-70, 150)], [(60, 40), (20, -60)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'wave': ([(-55, 55), (-70, 150)], [(75, -20), (120, -120)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'shrug': ([(-75, 20), (-110, -20)], [(75, 20), (110, -20)], [(-28, 95), (-48, 190)], [(28, 95), (48, 190)]),
 'lift': ([(-90, -20), (-95, -120)], [(90, -20), (95, -120)], [(-40, 95), (-70, 190)], [(40, 95), (70, 190)]),
 'climb': ([(-30, -40), (10, -130)], [(70, 30), (110, -10)], [(-20, 100), (-60, 190)], [(50, 60), (100, 120)]),
}
FACES = ('happy', 'proud', 'worry', 'tired', 'sad', 'surprised', 'determined', 'think', 'calm')

def face(cv, hd, s, kind, c=INK):
    x, y = hd
    if kind == 'surprised':
        for dx in (-24, 24): cv.circle(x + dx * s, y - 10 * s, 9 * s, 4, c, fill=WHITE)
        cv.circle(x, y + 30 * s, 12 * s, 5, c); return
    for dx in (-24, 24): cv.circle(x + dx * s, y - 8 * s, 5.5 * s, 4, c, fill=c)
    if kind in ('happy', 'proud'):
        r = 26 if kind == 'happy' else 34; cv.arc(x, y + 6 * s, r * s, 15, 165, 6, c)
        if kind == 'proud':
            for dx in (-46, 46): ell(cv, x + dx * s, y + 18 * s, 10 * s, 6 * s, 2, PINK, PINK)
    elif kind in ('worry', 'sad'):
        cv.arc(x, y + 42 * s, 24 * s, 205, 335, 6, c)
        cv.line([(x - 40 * s, y - 30 * s), (x - 12 * s, y - 40 * s)], 5, c); cv.line([(x + 40 * s, y - 30 * s), (x + 12 * s, y - 40 * s)], 5, c)
        if kind == 'worry': cv.poly([(x + 64 * s, y - 55 * s), (x + 52 * s, y - 25 * s), (x + 76 * s, y - 25 * s)], c, DROP, 4)
        else: cv.line([(x - 24 * s, y + 2 * s), (x - 26 * s, y + 22 * s)], 4, DROP)
    elif kind == 'tired':
        cv.line([(x - 22 * s, y + 28 * s), (x + 22 * s, y + 28 * s)], 6, c)
        cv.line([(x - 40 * s, y - 24 * s), (x - 12 * s, y - 20 * s)], 5, c); cv.line([(x + 40 * s, y - 24 * s), (x + 12 * s, y - 20 * s)], 5, c)
    elif kind == 'determined':
        cv.line([(x - 22 * s, y + 26 * s), (x + 22 * s, y + 22 * s)], 6, c)
        cv.line([(x - 42 * s, y - 34 * s), (x - 12 * s, y - 22 * s)], 6, c); cv.line([(x + 42 * s, y - 34 * s), (x + 12 * s, y - 22 * s)], 6, c)
    elif kind == 'think':
        cv.line([(x - 14 * s, y + 28 * s), (x + 18 * s, y + 22 * s)], 6, c)
        for k, r in enumerate((8, 12, 18)): cv.circle(x + (70 + k * 30) * s, y - (60 + k * 36) * s, r * s, 4, c, fill=WHITE)
    else:  # calm
        cv.arc(x, y + 14 * s, 18 * s, 20, 160, 6, c)

def fig(cv, x, y, s=1.0, pose='stand', fc='happy', lw=12, flip=1, c=INK, shirt=None):
    """stick figure standing with its feet at (x, y); about 508*s tall. Returns head, shoulders, hands."""
    A, B, Lg, Rg = POSE.get(pose, POSE['stand']); sh = (x, y - 360 * s); hip = (x, y - 190 * s); hh = 70 * s; hd = (x, sh[1] - hh - 8 * s)
    P = lambda b, o: (b[0] + flip * o[0] * s, b[1] + o[1] * s)
    cv.circle(hd[0], hd[1], hh, lw, c, fill=WHITE)
    if shirt:  # a simple filled torso makes the figure read as a person, not a symbol
        cv.poly([(sh[0] - 34 * s, sh[1] + 8 * s), (sh[0] + 34 * s, sh[1] + 8 * s), (hip[0] + 30 * s, hip[1]), (hip[0] - 30 * s, hip[1])], c, shirt, lw * 0.7)
    else:
        cv.line([sh, hip], lw, c)
    cv.line([hip, P(hip, Lg[0]), P(hip, Lg[1])], lw, c); cv.line([hip, P(hip, Rg[0]), P(hip, Rg[1])], lw, c)
    cv.line([sh, P(sh, A[0]), P(sh, A[1])], lw, c); cv.line([sh, P(sh, B[0]), P(sh, B[1])], lw, c)
    face(cv, hd, s, fc if fc in FACES else 'happy', c); return dict(hd=hd, sh=sh, handL=P(sh, A[1]), handR=P(sh, B[1]))


# ---------------- objects ----------------
def book(cv, cx, cy, s=1.0):
    w, h = 130 * s, 170 * s
    L = [(cx - w, cy - h / 2 + 16 * s), (cx, cy - h / 2), (cx, cy + h / 2), (cx - w, cy + h / 2 + 16 * s)]
    R = [(cx, cy - h / 2), (cx + w, cy - h / 2 + 16 * s), (cx + w, cy + h / 2 + 16 * s), (cx, cy + h / 2)]
    cv.poly(L, INK, WHITE, 9); cv.poly(R, INK, WHITE, 9)
    for k in range(4):
        y = cy - h / 2 + 45 * s + k * 30 * s; cv.line([(cx - w + 24 * s, y + 10 * s), (cx - 20 * s, y - 2 * s)], 5); cv.line([(cx + 20 * s, y - 2 * s), (cx + w - 24 * s, y + 10 * s)], 5)

def books(cv, cx, cy, s=1.0):
    cols = (BLUE, RED, GREEN, ACC)
    for k in range(4):
        y = cy + 90 * s - k * 46 * s; dx = (k % 2) * 14 * s - 7 * s
        cv.rect(cx - 120 * s + dx, y - 40 * s, cx + 120 * s + dx, y, 9, INK, cols[k]); cv.line([(cx - 90 * s + dx, y - 20 * s), (cx + 90 * s + dx, y - 20 * s)], 4, WHITE)

def calendar(cv, cx, cy, s=1.0, top='NGÀY', num='1', band=RED):
    w, h = 220 * s, 220 * s; x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    cv.rect(x0, y0, x1, y1, 10, INK, WHITE); cv.rect(x0, y0, x1, y0 + h * 0.26, 10, INK, band)
    for dx in (-0.28, 0.28): cv.line([(cx + dx * w, y0 - 22 * s), (cx + dx * w, y0 + 18 * s)], 12)
    cv.text(cx, y0 + h * 0.13, top, 40 * s, WHITE if band == RED else INK, max_w=w * 0.9); cv.text(cx, y0 + h * 0.63, num, 110 * s, INK, max_w=w * 0.85)

def clock(cv, cx, cy, s=1.0, pie=None):
    r = 110 * s; cv.circle(cx, cy, r, 11, INK, WHITE)
    if pie:
        pts = [(cx, cy)] + [(cx + r * 0.86 * math.cos(math.radians(a)), cy + r * 0.86 * math.sin(math.radians(a))) for a in np.linspace(-90, -90 + pie, 18)]
        cv.poly(pts, INK, ACC, 5)
    for k in range(12):
        a = math.radians(k * 30); cv.line([(cx + r * 0.9 * math.cos(a), cy + r * 0.9 * math.sin(a)), (cx + r * 0.78 * math.cos(a), cy + r * 0.78 * math.sin(a))], 5)
    cv.line([(cx, cy), (cx, cy - r * 0.72)], 8); cv.line([(cx, cy), (cx + r * 0.5, cy + r * 0.1)], 8); cv.circle(cx, cy, 8, 4, INK, fill=INK)

def alarm(cv, cx, cy, s=1.0):
    for sg in (-1, 1): cv.circle(cx + sg * 70 * s, cy - 95 * s, 30 * s, 8, INK, ACC)
    clock(cv, cx, cy, s * 0.95)
    for sg in (-1, 1): cv.line([(cx + sg * 60 * s, cy + 95 * s), (cx + sg * 85 * s, cy + 125 * s)], 10)
    for sg in (-1, 1): cv.arc(cx + sg * 10 * s, cy, 150 * s, -150 if sg < 0 else -60, -120 if sg < 0 else -30, 7, RED)

def hourglass(cv, cx, cy, s=1.0):
    cv.rect(cx - 90 * s, cy - 130 * s, cx + 90 * s, cy - 110 * s, 9, INK, BROWN); cv.rect(cx - 90 * s, cy + 110 * s, cx + 90 * s, cy + 130 * s, 9, INK, BROWN)
    cv.poly([(cx - 70 * s, cy - 110 * s), (cx + 70 * s, cy - 110 * s), (cx + 8 * s, cy), (cx + 70 * s, cy + 110 * s), (cx - 70 * s, cy + 110 * s), (cx - 8 * s, cy)], INK, WHITE, 9)
    cv.poly([(cx - 40 * s, cy - 70 * s), (cx + 40 * s, cy - 70 * s), (cx, cy - 8 * s)], INK, ACC, 4); cv.poly([(cx - 60 * s, cy + 108 * s), (cx + 60 * s, cy + 108 * s), (cx, cy + 50 * s)], INK, ACC, 4)

def coin(cv, cx, cy, s=1.0):
    r = 26 * s; cv.circle(cx, cy, r, 7, INK, ACC); cv.circle(cx, cy, r * 0.52, 4, INK)

def coins(cv, cx, cy, s=1.0):
    for k in range(5): ell(cv, cx - 40 * s, cy + 80 * s - k * 22 * s, 60 * s, 18 * s, 7, INK, ACC)
    for k in range(3): ell(cv, cx + 60 * s, cy + 80 * s - k * 22 * s, 60 * s, 18 * s, 7, INK, ACC)
    coin(cv, cx + 10 * s, cy - 60 * s, s * 1.6)

def jar(cv, cx, cy, s=1.0, level=0.6):
    w, h = 170 * s, 230 * s; bot = cy + h / 2
    cv.rect(cx - w / 2, bot - h, cx + w / 2, bot, 10, INK, (246, 250, 252)); cv.rect(cx - w / 2 - 10, bot - h - 34 * s, cx + w / 2 + 10, bot - h, 10, INK, BROWN)
    per = max(1, int((w - 24) / (44 * s))); rows = int(level * (h - 30 * s) / (40 * s))
    for r in range(rows):
        for k in range(per): coin(cv, cx - (per - 1) * 22 * s + k * 44 * s + (r % 2) * 4 * s, bot - 28 * s - r * 38 * s, s * 0.75)

def money(cv, cx, cy, s=1.0):
    for k in range(3):
        o = k * 16 * s; cv.rect(cx - 140 * s + o, cy - 70 * s - o, cx + 140 * s + o, cy + 70 * s - o, 9, INK, (170, 220, 170))
    cv.circle(cx + 32 * s, cy - 32 * s, 40 * s, 7, INK, (200, 236, 200)); cv.text(cx + 32 * s, cy - 32 * s, '$', 56 * s, INK)

def wallet(cv, cx, cy, s=1.0):
    rrect(cv, cx - 150 * s, cy - 90 * s, cx + 150 * s, cy + 100 * s, 26 * s, 10, INK, BROWN)
    cv.rect(cx - 120 * s, cy - 130 * s, cx + 90 * s, cy - 70 * s, 8, INK, (170, 220, 170))
    rrect(cv, cx + 40 * s, cy - 20 * s, cx + 160 * s, cy + 40 * s, 18 * s, 9, INK, ACC); cv.circle(cx + 80 * s, cy + 10 * s, 12 * s, 5, INK, fill=WHITE)

def piggy(cv, cx, cy, s=1.0):
    ell(cv, cx, cy, 150 * s, 110 * s, 10, INK, PINK)
    for dx in (-80, 60): cv.rect(cx + dx * s, cy + 90 * s, cx + (dx + 30) * s, cy + 140 * s, 8, INK, PINK)
    ell(cv, cx + 150 * s, cy + 10 * s, 34 * s, 28 * s, 8, INK, PINK)
    cv.poly([(cx + 60 * s, cy - 95 * s), (cx + 100 * s, cy - 140 * s), (cx + 110 * s, cy - 80 * s)], INK, PINK, 8)
    cv.circle(cx + 90 * s, cy - 30 * s, 8 * s, 4, INK, fill=INK); cv.line([(cx - 30 * s, cy - 108 * s), (cx + 30 * s, cy - 108 * s)], 10)
    coin(cv, cx, cy - 160 * s, s * 1.2)

def chart_up(cv, cx, cy, s=1.0):
    x0, y0, x1, y1 = cx - 150 * s, cy - 130 * s, cx + 150 * s, cy + 130 * s
    cv.line([(x0, y0), (x0, y1), (x1, y1)], 10)
    for k, h in enumerate((0.25, 0.42, 0.62, 0.9)):
        bx = x0 + 30 * s + k * 68 * s; cv.rect(bx, y1 - h * 240 * s, bx + 48 * s, y1, 8, INK, GREEN if k == 3 else LEAF)
    cv.arrow(x0 + 20 * s, y1 - 70 * s, x1 - 10 * s, y0 + 10 * s, 11, RED, 34 * s)

def chart_down(cv, cx, cy, s=1.0):
    x0, y0, x1, y1 = cx - 150 * s, cy - 130 * s, cx + 150 * s, cy + 130 * s
    cv.line([(x0, y0), (x0, y1), (x1, y1)], 10)
    for k, h in enumerate((0.9, 0.62, 0.42, 0.2)):
        bx = x0 + 30 * s + k * 68 * s; cv.rect(bx, y1 - h * 240 * s, bx + 48 * s, y1, 8, INK, (240, 170, 170))
    cv.arrow(x0 + 20 * s, y0 + 30 * s, x1 - 10 * s, y1 - 40 * s, 11, RED, 34 * s)

def pie(cv, cx, cy, s=1.0, part=0.7):
    r = 130 * s; cv.circle(cx, cy, r, 10, INK, WHITE)
    pts = [(cx, cy)] + [(cx + r * 0.94 * math.cos(math.radians(a)), cy + r * 0.94 * math.sin(math.radians(a))) for a in np.linspace(-90, -90 + 360 * part, 30)]
    cv.poly(pts, INK, ACC, 7)

def mountain(cv, cx, cy, s=1.0):
    g = cy + 140 * s
    cv.poly([(cx - 190 * s, g), (cx, cy - 150 * s), (cx + 190 * s, g)], INK, (228, 222, 210), 10)
    cv.poly([(cx - 64 * s, cy - 50 * s), (cx, cy - 150 * s), (cx + 64 * s, cy - 50 * s), (cx + 30 * s, cy - 70 * s), (cx, cy - 46 * s), (cx - 30 * s, cy - 70 * s)], INK, WHITE, 6)
    cv.line([(cx, cy - 150 * s), (cx, cy - 240 * s)], 9); cv.poly([(cx, cy - 240 * s), (cx + 90 * s, cy - 212 * s), (cx, cy - 184 * s)], INK, ACC, 7)

def flag(cv, cx, cy, s=1.0):
    cv.line([(cx - 40 * s, cy + 140 * s), (cx - 40 * s, cy - 140 * s)], 11); cv.poly([(cx - 40 * s, cy - 140 * s), (cx + 120 * s, cy - 90 * s), (cx - 40 * s, cy - 40 * s)], INK, RED, 8)
    ell(cv, cx - 40 * s, cy + 140 * s, 60 * s, 14 * s, 8, INK, GRAYR)

def trophy(cv, cx, cy, s=1.0):
    cv.poly([(cx - 100 * s, cy - 130 * s), (cx + 100 * s, cy - 130 * s), (cx + 80 * s, cy - 10 * s), (cx + 30 * s, cy + 30 * s), (cx - 30 * s, cy + 30 * s), (cx - 80 * s, cy - 10 * s)], INK, ACC, 10)
    for sg in (-1, 1): cv.arc(cx + sg * 100 * s, cy - 80 * s, 46 * s, 270 if sg > 0 else 90, 450 if sg > 0 else 270, 10)
    cv.rect(cx - 18 * s, cy + 30 * s, cx + 18 * s, cy + 80 * s, 9, INK, ACC); cv.rect(cx - 80 * s, cy + 80 * s, cx + 80 * s, cy + 130 * s, 10, INK, BROWN)
    cv.poly(star_pts(cx, cy - 70 * s, 36 * s), INK, WHITE, 5)

def medal(cv, cx, cy, s=1.0):
    cv.poly([(cx - 70 * s, cy - 160 * s), (cx - 20 * s, cy - 160 * s), (cx + 20 * s, cy - 40 * s), (cx - 20 * s, cy - 40 * s)], INK, RED, 7)
    cv.poly([(cx + 70 * s, cy - 160 * s), (cx + 20 * s, cy - 160 * s), (cx - 20 * s, cy - 40 * s), (cx + 20 * s, cy - 40 * s)], INK, BLUE, 7)
    cv.circle(cx, cy + 40 * s, 90 * s, 10, INK, ACC); cv.poly(star_pts(cx, cy + 40 * s, 46 * s), INK, WHITE, 5)

def star(cv, cx, cy, s=1.0):
    cv.poly(star_pts(cx, cy, 130 * s), INK, ACC, 10); rays(cv, cx, cy, 150 * s, 185 * s, 8, ACC, 7, 22)

def bulb(cv, cx, cy, s=1.0):
    cv.circle(cx, cy - 30 * s, 100 * s, 10, INK, (255, 240, 170))
    cv.rect(cx - 46 * s, cy + 70 * s, cx + 46 * s, cy + 130 * s, 9, INK, GRAYR)
    for k in range(2): cv.line([(cx - 46 * s, cy + (88 + 20 * k) * s), (cx + 46 * s, cy + (88 + 20 * k) * s)], 5)
    cv.line([(cx - 30 * s, cy + 60 * s), (cx - 20 * s, cy - 20 * s), (cx, cy + 10 * s), (cx + 20 * s, cy - 20 * s), (cx + 30 * s, cy + 60 * s)], 6, ORANGE)
    rays(cv, cx, cy - 30 * s, 125 * s, 165 * s, 7, ACC, 7, -180)

def rocket(cv, cx, cy, s=1.0):
    cv.poly([(cx, cy - 170 * s), (cx + 60 * s, cy - 70 * s), (cx + 60 * s, cy + 70 * s), (cx - 60 * s, cy + 70 * s), (cx - 60 * s, cy - 70 * s)], INK, WHITE, 10)
    cv.circle(cx, cy - 40 * s, 28 * s, 8, INK, SKY)
    for sg in (-1, 1): cv.poly([(cx + sg * 60 * s, cy + 10 * s), (cx + sg * 110 * s, cy + 100 * s), (cx + sg * 60 * s, cy + 70 * s)], INK, RED, 8)
    cv.poly([(cx - 34 * s, cy + 70 * s), (cx + 34 * s, cy + 70 * s), (cx, cy + 170 * s)], INK, ORANGE, 7)

def key(cv, cx, cy, s=1.0):
    cv.circle(cx - 90 * s, cy, 60 * s, 11, INK, ACC); cv.circle(cx - 90 * s, cy, 22 * s, 7, INK, fill=WHITE)
    cv.line([(cx - 30 * s, cy), (cx + 160 * s, cy)], 16)
    for dx in (100, 140): cv.line([(cx + dx * s, cy), (cx + dx * s, cy + 40 * s)], 14)

def lock(cv, cx, cy, s=1.0):
    cv.arc(cx, cy - 40 * s, 70 * s, 180, 360, 16); cv.line([(cx - 70 * s, cy - 40 * s), (cx - 70 * s, cy)], 16); cv.line([(cx + 70 * s, cy - 40 * s), (cx + 70 * s, cy)], 16)
    rrect(cv, cx - 110 * s, cy, cx + 110 * s, cy + 160 * s, 20 * s, 10, INK, ACC); cv.circle(cx, cy + 70 * s, 18 * s, 6, INK, fill=INK); cv.line([(cx, cy + 80 * s), (cx, cy + 120 * s)], 10)

def door(cv, cx, cy, s=1.0):
    cv.rect(cx - 110 * s, cy - 170 * s, cx + 110 * s, cy + 170 * s, 11, INK, BROWN)
    cv.poly([(cx - 90 * s, cy - 150 * s), (cx + 40 * s, cy - 120 * s), (cx + 40 * s, cy + 190 * s), (cx - 90 * s, cy + 150 * s)], INK, WHITE, 9)
    rays(cv, cx - 30 * s, cy, 210 * s, 250 * s, 6, ACC, 7, -30)
    cv.circle(cx + 20 * s, cy + 20 * s, 10 * s, 5, INK, fill=ACC)

def stairs(cv, cx, cy, s=1.0):
    g = cy + 150 * s
    for k in range(4):
        x0 = cx - 180 * s + k * 90 * s; cv.rect(x0, g - (k + 1) * 75 * s, x0 + 90 * s, g, 9, INK, WHITE if k % 2 == 0 else PAPER)
    cv.line([(cx + 135 * s, g - 300 * s), (cx + 135 * s, g - 400 * s)], 9); cv.poly([(cx + 135 * s, g - 400 * s), (cx + 210 * s, g - 372 * s), (cx + 135 * s, g - 345 * s)], INK, ACC, 7)

def road(cv, cx, cy, s=1.0):
    cv.poly([(cx - 40 * s, cy - 170 * s), (cx + 40 * s, cy - 170 * s), (cx + 180 * s, cy + 160 * s), (cx - 180 * s, cy + 160 * s)], INK, GRAYR, 10)
    for k in range(4): y0 = cy - 140 * s + k * 80 * s; cv.line([(cx, y0), (cx, y0 + 40 * s)], 9, WHITE)
    cv.line([(cx + 70 * s, cy - 180 * s), (cx + 70 * s, cy - 250 * s)], 8); cv.poly([(cx + 70 * s, cy - 250 * s), (cx + 130 * s, cy - 228 * s), (cx + 70 * s, cy - 206 * s)], INK, ACC, 6)

def target(cv, cx, cy, s=1.0):
    for k, (r, f) in enumerate(((140, WHITE), (100, RED), (62, WHITE), (26, RED))): cv.circle(cx, cy, r * s, 9, INK, f)
    cv.arrow(cx + 190 * s, cy - 150 * s, cx + 12 * s, cy - 8 * s, 10, INK, 30 * s)

def sun(cv, cx, cy, s=1.0):
    cv.circle(cx, cy, 90 * s, 10, INK, ACC); rays(cv, cx, cy, 115 * s, 165 * s, 10, ORANGE, 9)

def sunrise(cv, cx, cy, s=1.0):
    g = cy + 60 * s; cv.arc(cx, g, 110 * s, 180, 360, 10); cv.line([(cx - 200 * s, g), (cx + 200 * s, g)], 9)
    for k in range(7):
        a = math.radians(180 + 15 + k * 25); cv.line([(cx + math.cos(a) * 130 * s, g + math.sin(a) * 130 * s), (cx + math.cos(a) * 180 * s, g + math.sin(a) * 180 * s)], 8, ORANGE)
    for k in range(2): cv.line([(cx - 150 * s + k * 40 * s, g + 40 * s + k * 30 * s), (cx + 150 * s - k * 40 * s, g + 40 * s + k * 30 * s)], 6, BLUE)

def heart(cv, cx, cy, s=1.0):
    pts = [(cx + 130 * s * 16 * math.sin(t) ** 3 / 16, cy - 130 * s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16) for t in np.linspace(0, 2 * math.pi * 1.01, 60)]
    cv.shape(pts, 10, INK, RED)

def brain(cv, cx, cy, s=1.0):
    for dx, dy, r in ((-60, -40, 70), (10, -70, 75), (75, -30, 65), (-40, 40, 70), (50, 40, 70)): cv.circle(cx + dx * s, cy + dy * s, r * s, 9, INK, PINK)
    cv.line(bez((cx - 80 * s, cy), (cx, cy - 40 * s), (cx + 90 * s, cy + 10 * s)), 6); cv.line([(cx + 5 * s, cy + 100 * s), (cx + 5 * s, cy + 150 * s)], 10)

def phone(cv, cx, cy, s=1.0):
    rrect(cv, cx - 85 * s, cy - 160 * s, cx + 85 * s, cy + 160 * s, 24 * s, 10, INK, DARK)
    cv.rect(cx - 66 * s, cy - 130 * s, cx + 66 * s, cy + 120 * s, 6, INK, SKY)
    for k in range(3): rrect(cv, cx - 50 * s, cy - 110 * s + k * 70 * s, cx + 50 * s, cy - 60 * s + k * 70 * s, 12 * s, 5, INK, WHITE)
    cv.circle(cx + 70 * s, cy - 150 * s, 26 * s, 6, INK, RED)

def laptop(cv, cx, cy, s=1.0):
    cv.rect(cx - 150 * s, cy - 130 * s, cx + 150 * s, cy + 60 * s, 10, INK, DARK); cv.rect(cx - 130 * s, cy - 110 * s, cx + 130 * s, cy + 40 * s, 6, INK, SKY)
    cv.poly([(cx - 190 * s, cy + 60 * s), (cx + 190 * s, cy + 60 * s), (cx + 210 * s, cy + 110 * s), (cx - 210 * s, cy + 110 * s)], INK, GRAYR, 9)
    for k in range(3): cv.line([(cx - 100 * s, cy - 80 * s + k * 36 * s), (cx + (60 - k * 40) * s, cy - 80 * s + k * 36 * s)], 7, BLUE)

def bed(cv, cx, cy, s=1.0):
    cv.rect(cx - 200 * s, cy - 10 * s, cx + 200 * s, cy + 60 * s, 10, INK, BROWN); cv.line([(cx - 200 * s, cy - 120 * s), (cx - 200 * s, cy + 120 * s)], 14)
    cv.poly([(cx - 190 * s, cy - 10 * s), (cx - 120 * s, cy - 60 * s), (cx + 190 * s, cy - 60 * s), (cx + 190 * s, cy - 10 * s)], INK, SKY, 8)
    ell(cv, cx - 150 * s, cy - 50 * s, 46 * s, 26 * s, 8, INK, WHITE)
    cv.text(cx + 120 * s, cy - 150 * s, 'Z z', 60 * s, BLUE)

def dumbbell(cv, cx, cy, s=1.0):
    cv.line([(cx - 120 * s, cy), (cx + 120 * s, cy)], 18)
    for sg in (-1, 1):
        cv.rect(cx + sg * 120 * s - 30 * s, cy - 80 * s, cx + sg * 120 * s + 30 * s, cy + 80 * s, 10, INK, DARK)
        cv.rect(cx + sg * 175 * s - 22 * s, cy - 55 * s, cx + sg * 175 * s + 22 * s, cy + 55 * s, 9, INK, DARK)

def shoe(cv, cx, cy, s=1.0):
    cv.poly([(cx - 170 * s, cy + 60 * s), (cx - 150 * s, cy - 50 * s), (cx - 60 * s, cy - 60 * s), (cx + 30 * s, cy), (cx + 170 * s, cy + 20 * s), (cx + 180 * s, cy + 60 * s)], INK, BLUE, 10)
    cv.line([(cx - 175 * s, cy + 80 * s), (cx + 185 * s, cy + 80 * s)], 14)
    for k in range(3): cv.line([(cx - 100 * s + k * 34 * s, cy - 40 * s + k * 12 * s), (cx - 70 * s + k * 34 * s, cy - 54 * s + k * 12 * s)], 6, WHITE)

def apple(cv, cx, cy, s=1.0):
    cv.circle(cx, cy + 20 * s, 120 * s, 10, INK, RED); cv.line([(cx, cy - 100 * s), (cx + 10 * s, cy - 150 * s)], 10, BROWN)
    ell(cv, cx + 50 * s, cy - 140 * s, 44 * s, 20 * s, 7, INK, LEAF)

def water(cv, cx, cy, s=1.0):
    cv.poly([(cx - 80 * s, cy - 150 * s), (cx + 80 * s, cy - 150 * s), (cx + 60 * s, cy + 150 * s), (cx - 60 * s, cy + 150 * s)], INK, WHITE, 10)
    cv.poly([(cx - 70 * s, cy - 40 * s), (cx + 70 * s, cy - 40 * s), (cx + 60 * s, cy + 140 * s), (cx - 60 * s, cy + 140 * s)], INK, DROP, 5)

def coffee(cv, cx, cy, s=1.0):
    cv.poly([(cx - 110 * s, cy - 60 * s), (cx + 90 * s, cy - 60 * s), (cx + 70 * s, cy + 120 * s), (cx - 90 * s, cy + 120 * s)], INK, WHITE, 10)
    cv.arc(cx + 100 * s, cy + 20 * s, 50 * s, 270, 450, 10); cv.rect(cx - 100 * s, cy - 60 * s, cx + 80 * s, cy - 30 * s, 6, INK, BROWN)
    for dx in (-40, 0, 40): cv.line(bez((cx + dx * s, cy - 90 * s), (cx + (dx + 25) * s, cy - 130 * s), (cx + dx * s, cy - 170 * s)), 6, GRAYR)

def house(cv, cx, cy, s=1.0):
    cv.rect(cx - 140 * s, cy - 40 * s, cx + 140 * s, cy + 150 * s, 10, INK, WHITE); cv.poly([(cx - 175 * s, cy - 30 * s), (cx, cy - 170 * s), (cx + 175 * s, cy - 30 * s)], INK, RED, 10)
    cv.rect(cx - 30 * s, cy + 50 * s, cx + 40 * s, cy + 150 * s, 8, INK, BROWN); cv.rect(cx - 110 * s, cy + 10 * s, cx - 60 * s, cy + 60 * s, 7, INK, SKY)

def family(cv, cx, cy, s=1.0):
    g = cy + 170 * s
    fig(cv, cx - 110 * s, g, 0.62 * s, 'stand', 'happy', 10); fig(cv, cx + 110 * s, g, 0.6 * s, 'stand', 'happy', 10, -1)
    fig(cv, cx, g, 0.4 * s, 'cheer', 'happy', 9); heart(cv, cx, cy - 200 * s, 0.3 * s)

def team(cv, cx, cy, s=1.0):
    g = cy + 170 * s
    for k, dx in enumerate((-140, 0, 140)): fig(cv, cx + dx * s, g, 0.55 * s, 'cheer' if k == 1 else 'stand', 'happy', 10)

def gift(cv, cx, cy, s=1.0):
    cv.rect(cx - 130 * s, cy - 40 * s, cx + 130 * s, cy + 140 * s, 10, INK, RED); cv.rect(cx - 150 * s, cy - 90 * s, cx + 150 * s, cy - 40 * s, 10, INK, RED)
    cv.rect(cx - 22 * s, cy - 90 * s, cx + 22 * s, cy + 140 * s, 6, INK, ACC)
    for sg in (-1, 1): ell(cv, cx + sg * 50 * s, cy - 120 * s, 50 * s, 26 * s, 8, INK, ACC)

def chain(cv, cx, cy, s=1.0, broken=True):
    for k in range(5):
        x = cx - 200 * s + k * 100 * s
        if broken and k == 2:
            cv.arc(x - 15 * s, cy, 40 * s, 100, 260, 10, GRAYR); cv.arc(x + 15 * s, cy, 40 * s, -80, 80, 10, GRAYR); rays(cv, x, cy, 60 * s, 100 * s, 6, ACC, 7)
        else: ell(cv, x, cy, 56 * s, 34 * s, 10, INK, None)

def wall(cv, cx, cy, s=1.0):
    for r in range(4):
        for k in range(4):
            off = (r % 2) * 50 * s; x0 = cx - 200 * s + k * 100 * s + off - 50 * s * (r % 2)
            cv.rect(max(cx - 200 * s, x0), cy + 100 * s - r * 70 * s, min(cx + 200 * s, x0 + 100 * s), cy + 170 * s - r * 70 * s, 8, INK, (220, 140, 110))

def boulder(cv, cx, cy, s=1.0, fill=GRAYR):
    r = 150 * s
    pts = [(cx + r * (1 + 0.07 * math.sin(a * 3 + 1)) * math.cos(a), cy + r * (1 + 0.07 * math.sin(a * 3 + 1)) * math.sin(a)) for a in np.linspace(0, 2 * math.pi * 1.01, 40)]
    cv.shape(pts, 12, INK, fill)
    cv.line([(cx - r * 0.5, cy - r * 0.35), (cx - r * 0.15, cy - r * 0.05), (cx - r * 0.35, cy + r * 0.25)], 6); cv.line([(cx + r * 0.3, cy + r * 0.3), (cx + r * 0.55, cy + r * 0.05)], 6)

def sprout(cv, cx, cy, s=1.0):
    g = cy + 100 * s; cv.line([(cx - 90 * s, g), (cx + 90 * s, g)], 8, BROWN)
    cv.line([(cx, g), (cx, g - 110 * s)], 11, GREEN)
    ell(cv, cx - 40 * s, g - 112 * s, 40 * s, 18 * s, 8, INK, LEAF); ell(cv, cx + 40 * s, g - 132 * s, 40 * s, 18 * s, 8, INK, LEAF)

def sapling(cv, cx, cy, s=1.0):
    g = cy + 130 * s; cv.line([(cx, g), (cx, g - 230 * s)], 12, (110, 80, 50))
    for dx, dy in ((-50, -120), (50, -150), (-45, -200), (48, -230)): ell(cv, cx + dx * s, g + dy * s, 42 * s, 19 * s, 8, INK, LEAF)
    cv.circle(cx, g - 255 * s, 30 * s, 8, INK, LEAF)

def tree(cv, cx, cy, s=1.0):
    g = cy + 190 * s; k = s * 0.8
    cv.rect(cx - 30 * k, g - 280 * k, cx + 30 * k, g, 10, INK, BROWN)
    for dx, dy, r in ((-90, -330, 95), (90, -330, 95), (0, -420, 110), (0, -330, 100)): cv.circle(cx + dx * k, g + dy * k, r * k, 10, INK, LEAF)
    for dx, dy in ((-80, -340), (70, -310), (10, -440)): cv.circle(cx + dx * k, g + dy * k, 17 * k, 6, INK, RED)

def seedling_pot(cv, cx, cy, s=1.0):
    cv.poly([(cx - 90 * s, cy + 20 * s), (cx + 90 * s, cy + 20 * s), (cx + 70 * s, cy + 150 * s), (cx - 70 * s, cy + 150 * s)], INK, ORANGE, 10)
    cv.line([(cx, cy + 20 * s), (cx, cy - 100 * s)], 10, GREEN); ell(cv, cx - 45 * s, cy - 70 * s, 45 * s, 20 * s, 8, INK, LEAF); ell(cv, cx + 45 * s, cy - 100 * s, 45 * s, 20 * s, 8, INK, LEAF)

def checklist(cv, cx, cy, s=1.0):
    cv.rect(cx - 140 * s, cy - 170 * s, cx + 140 * s, cy + 170 * s, 10, INK, WHITE); cv.rect(cx - 50 * s, cy - 190 * s, cx + 50 * s, cy - 150 * s, 8, INK, GRAYR)
    for k in range(3):
        y = cy - 90 * s + k * 90 * s; cv.rect(cx - 110 * s, y - 24 * s, cx - 62 * s, y + 24 * s, 7, INK, WHITE); check(cv, cx - 86 * s, y, 0.8 * s, 9)
        cv.line([(cx - 40 * s, y), (cx + 110 * s, y)], 7)

def notebook(cv, cx, cy, s=1.0):
    cv.rect(cx - 130 * s, cy - 170 * s, cx + 130 * s, cy + 170 * s, 10, INK, WHITE)
    for k in range(7): cv.line([(cx - 130 * s, cy - 120 * s + k * 44 * s), (cx + 130 * s, cy - 120 * s + k * 44 * s)], 4, SKY)
    for k in range(6): cv.circle(cx - 130 * s, cy - 140 * s + k * 56 * s, 12 * s, 5, INK, fill=BG)
    cv.line([(cx + 70 * s, cy + 150 * s), (cx + 200 * s, cy - 40 * s)], 18, ACC)

def pencil(cv, cx, cy, s=1.0):
    cv.poly([(cx - 180 * s, cy + 60 * s), (cx + 120 * s, cy - 60 * s), (cx + 150 * s, cy + 10 * s), (cx - 150 * s, cy + 130 * s)], INK, ACC, 10)
    cv.poly([(cx - 180 * s, cy + 60 * s), (cx - 150 * s, cy + 130 * s), (cx - 230 * s, cy + 125 * s)], INK, PAPER, 8)

def megaphone(cv, cx, cy, s=1.0):
    cv.poly([(cx - 120 * s, cy - 40 * s), (cx + 100 * s, cy - 130 * s), (cx + 100 * s, cy + 130 * s), (cx - 120 * s, cy + 40 * s)], INK, RED, 10)
    cv.rect(cx - 170 * s, cy - 45 * s, cx - 120 * s, cy + 45 * s, 9, INK, WHITE); cv.line([(cx - 100 * s, cy + 40 * s), (cx - 80 * s, cy + 130 * s)], 12)
    for k in range(3): cv.arc(cx + 120 * s, cy, (60 + k * 40) * s, -40, 40, 7, ACC)

def handshake(cv, cx, cy, s=1.0):
    cv.poly([(cx - 220 * s, cy - 40 * s), (cx - 40 * s, cy - 50 * s), (cx + 40 * s, cy + 10 * s), (cx - 20 * s, cy + 50 * s), (cx - 220 * s, cy + 40 * s)], INK, SKIN, 9)
    cv.poly([(cx + 220 * s, cy - 40 * s), (cx + 20 * s, cy - 60 * s), (cx - 60 * s, cy + 0 * s), (cx + 10 * s, cy + 60 * s), (cx + 220 * s, cy + 40 * s)], INK, (230, 180, 140), 9)
    for sg in (-1, 1): cv.rect(cx + sg * 220 * s - 30 * s * (sg > 0), cy - 50 * s, cx + sg * 220 * s + 30 * s * (sg < 0), cy + 50 * s, 9, INK, BLUE if sg < 0 else DARK)

def magnifier(cv, cx, cy, s=1.0):
    cv.circle(cx - 30 * s, cy - 30 * s, 100 * s, 12, INK, SKY); cv.line([(cx + 45 * s, cy + 45 * s), (cx + 150 * s, cy + 150 * s)], 26)
    cv.arc(cx - 30 * s, cy - 30 * s, 66 * s, 200, 260, 8, WHITE)

def gear(cv, cx, cy, s=1.0):
    pts = []
    for k in range(48):
        a = 2 * math.pi * k / 48; r = (130 if (k // 3) % 2 == 0 else 105) * s; pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    cv.shape(pts + [pts[0]], 10, INK, GRAYR); cv.circle(cx, cy, 44 * s, 9, INK, BG)

def puzzle(cv, cx, cy, s=1.0):
    cv.rect(cx - 130 * s, cy - 130 * s, cx + 130 * s, cy + 130 * s, 10, INK, BLUE); cv.circle(cx + 130 * s, cy, 34 * s, 9, INK, BLUE); cv.circle(cx, cy - 130 * s, 34 * s, 9, INK, BLUE)

def shield(cv, cx, cy, s=1.0):
    cv.poly([(cx, cy - 160 * s), (cx + 140 * s, cy - 110 * s), (cx + 120 * s, cy + 40 * s), (cx, cy + 160 * s), (cx - 120 * s, cy + 40 * s), (cx - 140 * s, cy - 110 * s)], INK, BLUE, 10)
    check(cv, cx, cy, 2.0, 16)

def warning(cv, cx, cy, s=1.0):
    cv.poly([(cx, cy - 160 * s), (cx + 170 * s, cy + 130 * s), (cx - 170 * s, cy + 130 * s)], INK, ACC, 11)
    cv.line([(cx, cy - 60 * s), (cx, cy + 40 * s)], 18); cv.circle(cx, cy + 90 * s, 12 * s, 6, INK, fill=INK)

def question(cv, cx, cy, s=1.0):
    cv.circle(cx, cy, 140 * s, 10, INK, ACC); cv.text(cx, cy + 8 * s, '?', 200 * s, INK)

def idea_speech(cv, cx, cy, s=1.0):
    rrect(cv, cx - 170 * s, cy - 120 * s, cx + 170 * s, cy + 80 * s, 40 * s, 10, INK, WHITE)
    cv.poly([(cx - 60 * s, cy + 78 * s), (cx - 110 * s, cy + 150 * s), (cx - 10 * s, cy + 78 * s)], INK, WHITE, 9)
    for dx in (-80, 0, 80): cv.circle(cx + dx * s, cy - 20 * s, 20 * s, 6, INK, fill=INK)

def battery(cv, cx, cy, s=1.0, level=0.25):
    cv.rect(cx - 170 * s, cy - 80 * s, cx + 150 * s, cy + 80 * s, 11, INK, WHITE); cv.rect(cx + 150 * s, cy - 35 * s, cx + 185 * s, cy + 35 * s, 9, INK, INK)
    cv.rect(cx - 150 * s, cy - 60 * s, cx - 150 * s + 280 * s * level, cy + 60 * s, 6, INK, RED if level < 0.4 else GREEN)

def bolt(cv, cx, cy, s=1.0):
    cv.poly([(cx + 30 * s, cy - 170 * s), (cx - 90 * s, cy + 20 * s), (cx - 10 * s, cy + 20 * s), (cx - 40 * s, cy + 170 * s), (cx + 90 * s, cy - 30 * s), (cx + 10 * s, cy - 30 * s)], INK, ACC, 10)

def fire(cv, cx, cy, s=1.0):
    cv.shape([(cx, cy - 170 * s), (cx + 90 * s, cy - 40 * s), (cx + 110 * s, cy + 60 * s), (cx + 40 * s, cy + 150 * s), (cx - 60 * s, cy + 150 * s), (cx - 120 * s, cy + 50 * s), (cx - 70 * s, cy - 60 * s), (cx - 30 * s, cy - 10 * s), (cx, cy - 170 * s)], 10, INK, ORANGE)
    cv.shape([(cx, cy - 40 * s), (cx + 50 * s, cy + 40 * s), (cx + 20 * s, cy + 130 * s), (cx - 40 * s, cy + 130 * s), (cx - 60 * s, cy + 60 * s), (cx, cy - 40 * s)], 7, INK, ACC)

def compass(cv, cx, cy, s=1.0):
    cv.circle(cx, cy, 140 * s, 11, INK, WHITE); cv.poly([(cx, cy - 110 * s), (cx + 26 * s, cy), (cx - 26 * s, cy)], INK, RED, 7); cv.poly([(cx, cy + 110 * s), (cx + 26 * s, cy), (cx - 26 * s, cy)], INK, GRAYR, 7)

def plane(cv, cx, cy, s=1.0):
    cv.poly([(cx - 180 * s, cy + 20 * s), (cx + 170 * s, cy - 110 * s), (cx - 20 * s, cy + 60 * s)], INK, WHITE, 9); cv.poly([(cx - 20 * s, cy + 60 * s), (cx + 170 * s, cy - 110 * s), (cx + 10 * s, cy + 140 * s)], INK, SKY, 9)
    dashed(cv, bez((cx - 190 * s, cy + 40 * s), (cx - 260 * s, cy + 160 * s), (cx - 140 * s, cy + 200 * s)), 6, INK)

def globe(cv, cx, cy, s=1.0):
    cv.circle(cx, cy, 140 * s, 10, INK, SKY); ell(cv, cx, cy, 60 * s, 140 * s, 6, INK); cv.line([(cx - 140 * s, cy), (cx + 140 * s, cy)], 6)
    cv.shape([(cx - 90 * s, cy - 70 * s), (cx - 20 * s, cy - 90 * s), (cx - 10 * s, cy - 20 * s), (cx - 70 * s, cy + 10 * s), (cx - 90 * s, cy - 70 * s)], 6, INK, LEAF)

def cart(cv, cx, cy, s=1.0):
    cv.line([(cx - 200 * s, cy - 120 * s), (cx - 150 * s, cy - 120 * s), (cx - 100 * s, cy + 60 * s), (cx + 150 * s, cy + 60 * s)], 11)
    cv.poly([(cx - 140 * s, cy - 80 * s), (cx + 180 * s, cy - 80 * s), (cx + 150 * s, cy + 20 * s), (cx - 110 * s, cy + 20 * s)], INK, ACC, 9)
    for dx in (-70, 110): cv.circle(cx + dx * s, cy + 110 * s, 30 * s, 9, INK, DARK)

def store(cv, cx, cy, s=1.0):
    cv.rect(cx - 170 * s, cy - 40 * s, cx + 170 * s, cy + 160 * s, 10, INK, WHITE)
    for k in range(5): cv.poly([(cx - 190 * s + k * 76 * s, cy - 120 * s), (cx - 114 * s + k * 76 * s, cy - 120 * s), (cx - 114 * s + k * 76 * s, cy - 40 * s), (cx - 190 * s + k * 76 * s, cy - 40 * s)], INK, RED if k % 2 == 0 else WHITE, 7)
    cv.rect(cx - 40 * s, cy + 40 * s, cx + 40 * s, cy + 160 * s, 8, INK, SKY); cv.rect(cx - 140 * s, cy + 10 * s, cx - 70 * s, cy + 80 * s, 7, INK, SKY)

def video(cv, cx, cy, s=1.0):
    rrect(cv, cx - 190 * s, cy - 120 * s, cx + 190 * s, cy + 120 * s, 30 * s, 11, INK, RED); cv.poly([(cx - 40 * s, cy - 60 * s), (cx + 70 * s, cy), (cx - 40 * s, cy + 60 * s)], INK, WHITE, 8)

def bookmark(cv, cx, cy, s=1.0):
    cv.poly([(cx - 70 * s, cy - 130 * s), (cx + 70 * s, cy - 130 * s), (cx + 70 * s, cy + 130 * s), (cx, cy + 70 * s), (cx - 70 * s, cy + 130 * s)], INK, ACC, 10)

def share(cv, cx, cy, s=1.0):
    pts = [(cx - 90 * s, cy), (cx + 90 * s, cy - 90 * s), (cx + 90 * s, cy + 90 * s)]
    cv.line([pts[0], pts[1]], 9); cv.line([pts[0], pts[2]], 9)
    for p in pts: cv.circle(p[0], p[1], 36 * s, 9, INK, ACC if p is pts[0] else WHITE)

def comment(cv, cx, cy, s=1.0):
    idea_speech(cv, cx, cy, s * 0.8)

def thumbs_up(cv, cx, cy, s=1.0):
    cv.rect(cx - 150 * s, cy - 20 * s, cx - 80 * s, cy + 140 * s, 9, INK, BLUE)
    cv.shape([(cx - 80 * s, cy - 10 * s), (cx - 20 * s, cy - 50 * s), (cx, cy - 150 * s), (cx + 40 * s, cy - 140 * s), (cx + 30 * s, cy - 40 * s), (cx + 130 * s, cy - 40 * s), (cx + 140 * s, cy), (cx + 110 * s, cy + 140 * s), (cx - 80 * s, cy + 140 * s), (cx - 80 * s, cy - 10 * s)], 9, INK, SKIN)

def paper_plane_goal(cv, cx, cy, s=1.0):
    target(cv, cx + 80 * s, cy, 0.8 * s); plane(cv, cx - 100 * s, cy + 40 * s, 0.6 * s)

def scale_balance(cv, cx, cy, s=1.0):
    cv.line([(cx, cy - 150 * s), (cx, cy + 140 * s)], 11); cv.rect(cx - 90 * s, cy + 130 * s, cx + 90 * s, cy + 160 * s, 9, INK, BROWN)
    cv.line([(cx - 170 * s, cy - 110 * s), (cx + 170 * s, cy - 130 * s)], 10)
    for sg, dy in ((-1, -110), (1, -130)):
        x = cx + sg * 170 * s; cv.line([(x, cy + dy * s), (x - 50 * s, cy + (dy + 80) * s)], 5); cv.line([(x, cy + dy * s), (x + 50 * s, cy + (dy + 80) * s)], 5)
        cv.arc(x, cy + (dy + 80) * s, 60 * s, 0, 180, 9)

def snail(cv, cx, cy, s=1.0):
    cv.circle(cx + 20 * s, cy - 20 * s, 100 * s, 10, INK, ORANGE); cv.arc(cx + 20 * s, cy - 20 * s, 55 * s, 0, 300, 7); cv.arc(cx + 20 * s, cy - 20 * s, 24 * s, 0, 300, 6)
    cv.shape([(cx - 170 * s, cy + 90 * s), (cx + 150 * s, cy + 90 * s), (cx + 150 * s, cy + 60 * s), (cx - 120 * s, cy + 60 * s), (cx - 150 * s, cy - 20 * s), (cx - 190 * s, cy + 40 * s), (cx - 170 * s, cy + 90 * s)], 9, INK, LEAF)
    for dx in (-160, -130): cv.line([(cx + dx * s, cy - 10 * s), (cx + (dx - 10) * s, cy - 70 * s)], 6)

def mirror(cv, cx, cy, s=1.0):
    ell(cv, cx, cy - 30 * s, 110 * s, 150 * s, 11, INK, SKY); cv.line([(cx, cy + 120 * s), (cx, cy + 170 * s)], 12); cv.line([(cx - 70 * s, cy + 170 * s), (cx + 70 * s, cy + 170 * s)], 12)
    cv.line([(cx - 50 * s, cy - 110 * s), (cx - 10 * s, cy - 150 * s)], 7, WHITE)

def seed(cv, cx, cy, s=1.0):
    ell(cv, cx, cy, 60 * s, 90 * s, 10, INK, BROWN); cv.line(bez((cx - 10 * s, cy - 50 * s), (cx + 20 * s, cy), (cx - 10 * s, cy + 50 * s)), 6, PAPER)


# name: (function, keywords). Keywords are what the storyboard AI matches meanings against.
PROPS = {
 'book': (book, 'sách đọc học kiến thức book read learn'), 'books': (books, 'chồng sách thư viện học tập books study'),
 'calendar': (calendar, 'lịch ngày tháng thời gian kỷ luật calendar day'), 'clock': (clock, 'đồng hồ thời gian phút giờ clock time'),
 'alarm': (alarm, 'báo thức dậy sớm buổi sáng alarm wake'), 'hourglass': (hourglass, 'đồng hồ cát thời gian trôi chờ đợi hourglass'),
 'coin': (coin, 'đồng xu tiền coin'), 'coins': (coins, 'tiền xu tiết kiệm tích lũy coins savings'), 'jar': (jar, 'lọ tiền tiết kiệm tích lũy dần jar'),
 'money': (money, 'tiền mặt thu nhập lương money cash salary'), 'wallet': (wallet, 'ví tiền chi tiêu wallet spend'),
 'piggy': (piggy, 'heo đất tiết kiệm piggy bank'), 'chart_up': (chart_up, 'biểu đồ tăng trưởng lợi nhuận growth chart up'),
 'chart_down': (chart_down, 'biểu đồ giảm thua lỗ sụt giảm chart down loss'), 'pie': (pie, 'biểu đồ tròn tỷ lệ phần trăm pie percent'),
 'mountain': (mountain, 'núi đỉnh mục tiêu thử thách mountain peak goal'), 'flag': (flag, 'cờ đích về đích thành công flag finish'),
 'trophy': (trophy, 'cúp chiến thắng thành tựu trophy win'), 'medal': (medal, 'huy chương giải thưởng medal award'),
 'star': (star, 'ngôi sao nổi bật xuất sắc star'), 'bulb': (bulb, 'bóng đèn ý tưởng sáng tạo idea bulb'),
 'rocket': (rocket, 'tên lửa bứt phá tăng tốc khởi nghiệp rocket launch'), 'key': (key, 'chìa khóa bí quyết giải pháp key secret'),
 'lock': (lock, 'ổ khóa bảo mật giới hạn lock'), 'door': (door, 'cánh cửa cơ hội lối mở door opportunity'),
 'stairs': (stairs, 'bậc thang từng bước tiến bộ steps progress'), 'road': (road, 'con đường hành trình phía trước road journey'),
 'target': (target, 'mục tiêu trúng đích tập trung target focus'), 'sun': (sun, 'mặt trời năng lượng tích cực sun'),
 'sunrise': (sunrise, 'bình minh khởi đầu mới hy vọng sunrise new start'), 'heart': (heart, 'trái tim yêu thương sức khỏe đam mê heart love'),
 'brain': (brain, 'não bộ tư duy suy nghĩ trí nhớ brain mind'), 'phone': (phone, 'điện thoại mạng xã hội xao nhãng phone social'),
 'laptop': (laptop, 'máy tính làm việc online laptop work'), 'bed': (bed, 'giường ngủ nghỉ ngơi lười bed sleep'),
 'dumbbell': (dumbbell, 'tạ tập gym sức mạnh dumbbell gym'), 'shoe': (shoe, 'giày chạy bộ vận động shoe run'),
 'apple': (apple, 'táo ăn uống lành mạnh apple healthy'), 'water': (water, 'cốc nước uống nước water'),
 'coffee': (coffee, 'cà phê buổi sáng tỉnh táo coffee'), 'house': (house, 'ngôi nhà gia đình nhà cửa house home'),
 'family': (family, 'gia đình cha mẹ con cái family'), 'team': (team, 'đội nhóm đồng đội hợp tác team'),
 'gift': (gift, 'quà tặng phần thưởng gift reward'), 'chain': (chain, 'xiềng xích phá vỡ giải thoát chain break free'),
 'wall': (wall, 'bức tường rào cản trở ngại wall barrier'), 'boulder': (boulder, 'tảng đá khó khăn gánh nặng boulder obstacle'),
 'sprout': (sprout, 'mầm cây bắt đầu nhỏ sprout start'), 'sapling': (sapling, 'cây non phát triển sapling grow'),
 'tree': (tree, 'cây lớn trưởng thành thành quả tree result'), 'seedling_pot': (seedling_pot, 'chậu cây chăm sóc nuôi dưỡng pot nurture'),
 'seed': (seed, 'hạt giống gieo khởi đầu seed'), 'checklist': (checklist, 'danh sách việc cần làm kế hoạch checklist todo plan'),
 'notebook': (notebook, 'sổ tay ghi chép viết notebook write'), 'pencil': (pencil, 'bút chì viết vẽ pencil'),
 'megaphone': (megaphone, 'loa thông báo quảng cáo megaphone announce'), 'handshake': (handshake, 'bắt tay hợp tác thỏa thuận handshake deal'),
 'magnifier': (magnifier, 'kính lúp tìm hiểu phân tích nghiên cứu search analyze'), 'gear': (gear, 'bánh răng hệ thống quy trình gear process'),
 'puzzle': (puzzle, 'mảnh ghép giải pháp kết nối puzzle'), 'shield': (shield, 'khiên bảo vệ an toàn shield safe'),
 'warning': (warning, 'cảnh báo nguy hiểm sai lầm warning mistake'), 'question': (question, 'câu hỏi thắc mắc tại sao question why'),
 'speech': (idea_speech, 'bong bóng hội thoại nói chuyện speech talk'), 'battery_low': (battery, 'pin yếu mệt mỏi kiệt sức battery low tired'),
 'bolt': (bolt, 'tia sét năng lượng bốc đồng bolt energy'), 'fire': (fire, 'ngọn lửa đam mê nhiệt huyết fire passion'),
 'compass': (compass, 'la bàn định hướng compass direction'), 'plane': (plane, 'máy bay giấy ước mơ plane dream'),
 'globe': (globe, 'trái đất thế giới globe world'), 'cart': (cart, 'giỏ hàng mua sắm bán hàng cart shopping'),
 'store': (store, 'cửa hàng kinh doanh store shop business'), 'video': (video, 'video youtube nội dung video content'),
 'bookmark': (bookmark, 'lưu đánh dấu save bookmark'), 'share': (share, 'chia sẻ share'), 'comment': (comment, 'bình luận comment'),
 'thumbs_up': (thumbs_up, 'thích tán thành tốt like good'), 'scale': (scale_balance, 'cân bằng cân nhắc balance scale'),
 'snail': (snail, 'ốc sên chậm chạp trì hoãn slow procrastinate'), 'mirror': (mirror, 'gương bản thân soi mình mirror self'),
 'goal': (paper_plane_goal, 'hướng tới mục tiêu goal aim'),
}

def draw_prop(cv, name, cx, cy, s=1.0, **kw):
    fn = PROPS.get(name, PROPS['star'])[0]
    try: fn(cv, cx, cy, s, **kw)
    except TypeError: fn(cv, cx, cy, s)

def prop_names(): return sorted(PROPS)
