"""Hand-drawn whiteboard engine: stroke-by-stroke drawing, wobble, hand sprite (rotates/mirrors, wrist fades).

Based on the handdrawn-video-package skill. Coordinates are 1080x1920 (x right, y down). A scene is a list of
"ops" built with Canvas; the hand draws them in order."""
import math, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
def _hex(s): s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
# palette can be overridden from spec.json via env (render.py sets VID_BG / VID_INK / VID_ACC before importing this module)
BG = _hex(os.environ.get('VID_BG', '#F5F0E6')); INK = _hex(os.environ.get('VID_INK', '#1F2937')); ACC = _hex(os.environ.get('VID_ACC', '#F7CE3B'))
HERE = os.path.dirname(os.path.abspath(__file__)); ASSETS = os.path.join(HERE, '..', 'assets')
GREEN = (0x2E, 0x9E, 0x5B); RED = (0xD9, 0x4F, 0x4F)
SKIN = (244, 200, 165); SLEEVE = (96, 108, 132)
# Be Vietnam Pro (OFL) draws Vietnamese well; DejaVu stays as a fallback
FONT = next((p for p in [os.path.join(ASSETS, 'fonts', 'BeVietnamPro-ExtraBold.ttf'), '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if os.path.exists(p)), 'DejaVuSans-Bold.ttf')
FONT_BLACK = os.path.join(ASSETS, 'fonts', 'BeVietnamPro-Black.ttf')
_fonts = {}
def font(size, path=None):
    key = (path or FONT, int(size))
    if key not in _fonts: _fonts[key] = ImageFont.truetype(key[0], key[1])
    return _fonts[key]
def text_width(txt, size, path=None):
    b = font(size, path).getbbox(txt); return b[2] - b[0]
def wrap(txt, size, max_w, lines=2):
    """greedy word wrap; balanced so the last line is not a lone word"""
    words = txt.split(); rows = []; cur = ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if cur and text_width(t, size) > max_w: rows.append(cur); cur = w
        else: cur = t
    if cur: rows.append(cur)
    if len(rows) == 2 and len(rows[1].split()) == 1 and len(rows[0].split()) > 2:
        a = rows[0].split(); rows = [' '.join(a[:-1]), a[-1] + ' ' + rows[1]]
    return rows
def fit_size(txt, size, max_w, path=None, floor=26):
    """the largest size up to `size` at which txt fits in max_w pixels"""
    while size > floor and text_width(txt, size, path) > max_w: size -= 2
    return size

rng = np.random.RandomState(11)
def wob(pts, jitter=1.5, step=14):
    pts = [tuple(map(float, p)) for p in pts]; out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for k in range(n):
            t = k / n; out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(pts[-1]); a = np.array(out)
    if len(a) > 3:
        nz = rng.randn(len(a), 2) * jitter; k = np.ones(3) / 3
        nz = np.stack([np.convolve(nz[:, 0], k, 'same'), np.convolve(nz[:, 1], k, 'same')], 1)
        nz[0] = 0; nz[-1] = 0; a = a + nz
    return a

class Canvas:
    def __init__(s): s.ops = []
    def line(s, pts, w=10, c=INK): s.ops.append(dict(k='line', pts=wob(pts), w=w, c=c))
    def shape(s, pts, w, c, fill):
        s.ops.append(dict(k='shape', pts=wob(pts, 1.2), w=w, c=c, fill=fill))
    def circle(s, cx, cy, r, w=10, c=INK, fill=None):
        n = max(28, int(r * 0.6)); a0 = rng.rand() * 6.28
        t = np.linspace(a0, a0 + 2 * math.pi * 1.01, n)
        s.shape([(cx + r * math.cos(a), cy + r * math.sin(a)) for a in t], w, c, fill)
    def rect(s, x0, y0, x1, y1, w=10, c=INK, fill=None):
        s.shape([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], w, c, fill)
    def poly(s, pts, c=INK, fill=None, w=8):
        if fill is None and not w: return
        s.shape(list(pts) + [pts[0]], w or 1, c, fill)
    def arc(s, cx, cy, r, a0, a1, w=10, c=INK):
        if a1 < a0: a1 += 360
        t = np.radians(np.linspace(a0, a1, max(12, int((a1 - a0) / 6))))
        s.ops.append(dict(k='line', pts=wob([(cx + r * math.cos(a), cy + r * math.sin(a)) for a in t], 1.0), w=w, c=c))
    def arrow(s, x0, y0, x1, y1, w=12, c=INK, head=36):
        s.line([(x0, y0), (x1, y1)], w, c); a = math.atan2(y1 - y0, x1 - x0)
        for sg in (-1, 1):
            s.line([(x1, y1), (x1 - head * math.cos(a + sg * 0.5), y1 - head * math.sin(a + sg * 0.5))], w, c)
    def text(s, x, y, txt, size=60, c=INK, max_w=None, lines=2):
        """text centred at (x, y); too wide for max_w it wraps onto up to `lines` lines, then shrinks"""
        if not txt: return
        if max_w and text_width(txt, size) > max_w and lines > 1:
            rows = wrap(txt, size, max_w, lines)
            while len(rows) > lines and size > 30: size -= 2; rows = wrap(txt, size, max_w, lines)
            if len(rows) > 1:
                gap = size * 1.18; y0 = y - gap * (len(rows) - 1) / 2
                for k, r in enumerate(rows): s.text(x, y0 + k * gap, r, size, c, max_w, 1)
                return
        if max_w: size = fit_size(txt, size, max_w)
        f = font(size); m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).text((x, y), txt, font=f, fill=255, anchor='mm')
        bb = m.getbbox()
        if not bb: return
        m = np.asarray(m)[bb[1]:bb[3], bb[0]:bb[2]]
        s.ops.append(dict(k='text', mask=m, bb=bb, c=c))
    def done(s): return s.ops

def prep(op):
    if op['k'] == 'text':
        x0, y0, x1, y1 = op['bb']; op['a'] = (x0, (y0 + y1) / 2); op['b'] = (x1, (y0 + y1) / 2); op['L'] = (x1 - x0) * 0.45
    else:
        p = op['pts']; seg = np.hypot(*np.diff(p, axis=0).T) if len(p) > 1 else np.zeros(0)
        op['cum'] = np.concatenate([[0], np.cumsum(seg)]); op['L'] = float(op['cum'][-1])
        op['a'] = tuple(p[0]); op['b'] = tuple(p[-1])

def stroke(img, pts, w, c):
    p = np.round(np.asarray(pts) * 16).astype(np.int32).reshape(-1, 1, 2)
    if len(p) > 1: cv2.polylines(img, [p], False, c, int(w), cv2.LINE_AA, 4)
    for q in (p[0, 0], p[-1, 0]): cv2.circle(img, (int(q[0]), int(q[1])), int(w * 8), c, -1, cv2.LINE_AA, 4)

def render_full(img, op):
    if op['k'] == 'text': render_text(img, op, op['bb'][2])
    else:
        if op['k'] == 'shape' and op['fill'] is not None:
            cv2.fillPoly(img, [np.round(op['pts'] * 16).astype(np.int32).reshape(-1, 1, 2)], op['fill'], cv2.LINE_AA, 4)
        stroke(img, op['pts'], op['w'], op['c'])

def render_text(img, op, xlim):
    x0, y0, x1, y1 = op['bb']; xl = int(min(xlim, x1))
    if xl <= x0: return
    m = op['mask'][:, :xl - x0].astype(np.float32)[..., None] / 255
    roi = img[y0:y1, x0:xl].astype(np.float32)
    img[y0:y1, x0:xl] = (roi * (1 - m) + np.array(op['c'], np.float32) * m).astype(np.uint8)

def render_partial(img, op, frac):
    if op['k'] == 'text':
        x = op['a'][0] + (op['b'][0] - op['a'][0]) * frac; render_text(img, op, x); return (x, op['a'][1])
    tgt = op['L'] * frac; cum = op['cum']; p = op['pts']
    k = int(np.searchsorted(cum, tgt, side='right')) - 1; k = max(0, min(k, len(p) - 2))
    seg = cum[k + 1] - cum[k]; t = (tgt - cum[k]) / seg if seg > 0 else 1
    q = p[k] + (p[k + 1] - p[k]) * t
    stroke(img, np.vstack([p[:k + 1], q]), op['w'], op['c']); return tuple(q)

# ---------- hand sprite (user-supplied image), rotatable + mirrored ----------
HAND_PNG = os.environ.get('VID_HAND', os.path.join(ASSETS, 'hand.png'))
# a little smaller than the skill's 0.42, so the hand covers less of what it draws
SC = float(os.environ.get('VID_HAND_SCALE', '0.36')); CX0, CY0 = 225, 150; BOT = 1089; ROWQ = 1084; PHI0 = math.atan2(1, 0.70)
def make_hand():
    im = np.asarray(Image.open(HAND_PNG).convert('RGBA')).copy()
    sub = im[CY0:BOT, CX0:].astype(np.float32); a = sub[..., 3:4] / 255
    pm = cv2.resize(np.concatenate([sub[..., :3] * a, a * 255], 2), None, fx=SC, fy=SC, interpolation=cv2.INTER_AREA)
    row = im[ROWQ].astype(np.float32); ra = row[:, 3:4] / 255; rowpm = np.concatenate([row[:, :3] * ra, ra * 255], 1)
    xs = np.where(im[ROWQ, :, 3] > 128)[0]; x0, x1 = xs.min(), xs.max()
    n2 = max(8, int((x1 - x0 + 1) * SC)); tex = cv2.resize(rowpm[x0:x1 + 1][None], (n2, 1), interpolation=cv2.INTER_AREA)[0]
    tip = ((237 - CX0) * SC, (175 - CY0) * SC); A = ((x0 - CX0) * SC, (ROWQ - CY0) * SC); B = ((x1 - CX0) * SC, (ROWQ - CY0) * SC)
    nz = lambda v: np.array(v, float) / np.hypot(*v)
    right = dict(spr=pm, tip=np.array(tip), A=np.array(A), B=np.array(B), dA=nz((0.586, 1)), dB=nz((0.817, 1)), tex=tex)
    w = pm.shape[1]; fx = lambda p: np.array([w - 1 - p[0], p[1]])
    left = dict(spr=cv2.flip(pm, 1), tip=fx(tip), A=fx(B), B=fx(A), dA=nz((-0.817, 1)), dB=nz((-0.586, 1)), tex=tex[::-1].copy())
    return {1: right, -1: left}
HAND = make_hand()

def phi_for(p, side):
    x = min(max(p[0], 0), W); y = min(max(p[1], 0), H)
    ds = (W - x) if side == 1 else x; db = H - y
    return math.radians(20 + 75 * ds / (ds + db + 1e-6))

def arm_vec(phi, side): return np.array([side * math.cos(phi), math.sin(phi)])

def exit_dist(p, v):
    ts = []
    if v[0] > 1e-6: ts.append((W - p[0]) / v[0])
    elif v[0] < -1e-6: ts.append((0 - p[0]) / v[0])
    if v[1] > 1e-6: ts.append((H - p[1]) / v[1])
    return max(0.0, min(ts)) + 540

def blit(img, out, x, y):
    h, w = out.shape[:2]; x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1: return
    s = out[y0 - y:y1 - y, x0 - x:x1 - x]; a = s[..., 3:4] / 255
    img[y0:y1, x0:x1] = (img[y0:y1, x0:x1].astype(np.float32) * (1 - a) + s[..., :3]).clip(0, 255).astype(np.uint8)

def draw_hand(img, tip, phi, side):
    h = HAND[side]; d = side * (phi - PHI0); c, s = math.cos(d), math.sin(d); R = np.array([[c, -s], [s, c]])
    tip = np.array(tip, float); f = lambda p: tip + R @ (p - h['tip'])
    Ap, Bp = f(h['A']), f(h['B']); dA, dB = R @ h['dA'], R @ h['dB']; D = 2900.0
    # arm: texture strip stretched along the arm
    n = h['tex'].shape[0]; texI = np.repeat(h['tex'][None], 48, 0).astype(np.float32)
    dst = np.float32([Ap, Bp, Bp + dB * D, Ap + dA * D]); src = np.float32([[0, 0], [n - 1, 0], [n - 1, 47], [0, 47]])
    # sleeve
    u = (dA + dB) / np.linalg.norm(dA + dB); perp = np.array([-u[1], u[0]])
    if perp @ (Ap - Bp) < 0: perp = -perp
    m, s0 = 15, 330
    SA, SB = Ap + dA * s0 + perp * m, Bp + dB * s0 - perp * m; FA, FB = Ap + dA * D + perp * m, Bp + dB * D - perp * m
    I = lambda q: np.round(q).astype(np.int32)
    x0 = max(0, int(dst[:, 0].min())); y0 = max(0, int(dst[:, 1].min())); x1 = min(W, int(dst[:, 0].max()) + 1); y1 = min(H, int(dst[:, 1].max()) + 1)
    if x1 > x0 and y1 > y0:
        M = cv2.getPerspectiveTransform(src, dst); M = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ M
        out = cv2.warpPerspective(texI, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        blit(img, out, x0, y0)
    cv2.fillPoly(img, [np.array([I(SA), I(SB), I(FB), I(FA)])], SLEEVE, cv2.LINE_AA)
    for p, q in ((SA, FA), (SB, FB), (SA, SB)): cv2.line(img, tuple(I(p)), tuple(I(q)), INK, 4, cv2.LINE_AA)
    # rotated hand sprite
    spr = h['spr']; hh, ww = spr.shape[:2]; t = tip - R @ h['tip']
    cf = (R @ np.array([[0, 0], [ww, 0], [ww, hh], [0, hh]], float).T).T + t
    bx0, by0 = np.floor(cf.min(0)).astype(int); bx1, by1 = np.ceil(cf.max(0)).astype(int)
    M2 = np.hstack([R, (t - np.array([bx0, by0]))[:, None]]).astype(np.float32)
    blit(img, cv2.warpAffine(spr, M2, (bx1 - bx0, by1 - by0), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)), bx0, by0)

def draw_hand2(img, tip, phi, side, arm_end=None, fade=0, sleeve_at=None):
    """arm_end: px along arm (from wrist cut) where arm fully disappears; None = runs off-screen (current)."""
    h = HAND[side]; d = side * (phi - PHI0); c, s = math.cos(d), math.sin(d); R = np.array([[c, -s], [s, c]])
    tip = np.array(tip, float); f = lambda p: tip + R @ (p - h['tip'])
    Ap, Bp = f(h['A']), f(h['B']); dA, dB = R @ h['dA'], R @ h['dB']; D = (arm_end + 40.0) if arm_end else 2900.0
    u = (dA + dB) / np.linalg.norm(dA + dB); perp = np.array([-u[1], u[0]])
    if perp @ (Ap - Bp) < 0: perp = -perp
    layer = img.copy() if arm_end else img
    n = h['tex'].shape[0]; texI = np.repeat(h['tex'][None], 48, 0).astype(np.float32)
    dst = np.float32([Ap, Bp, Bp + dB * D, Ap + dA * D]); src = np.float32([[0, 0], [n - 1, 0], [n - 1, 47], [0, 47]])
    I = lambda q: np.round(q).astype(np.int32)
    x0 = max(0, int(dst[:, 0].min())); y0 = max(0, int(dst[:, 1].min())); x1 = min(W, int(dst[:, 0].max()) + 1); y1 = min(H, int(dst[:, 1].max()) + 1)
    ok = x1 > x0 and y1 > y0
    if ok:
        M = cv2.getPerspectiveTransform(src, dst); M = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ M
        blit(layer, cv2.warpPerspective(texI, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)), x0, y0)
    if sleeve_at is not None:
        m = 15; SA, SB = Ap + dA * sleeve_at + perp * m, Bp + dB * sleeve_at - perp * m; FA, FB = Ap + dA * D + perp * m, Bp + dB * D - perp * m
        cv2.fillPoly(layer, [np.array([I(SA), I(SB), I(FB), I(FA)])], SLEEVE, cv2.LINE_AA)
        for p, q in ((SA, FA), (SB, FB), (SA, SB)): cv2.line(layer, tuple(I(p)), tuple(I(q)), INK, 4, cv2.LINE_AA)
    if arm_end and ok:
        ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        proj = (xs - Ap[0]) * u[0] + (ys - Ap[1]) * u[1]
        mk = np.clip((arm_end - proj) / max(fade, 1), 0, 1)[..., None]
        img[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - mk) + layer[y0:y1, x0:x1] * mk).astype(np.uint8)
    spr = h['spr']; hh, ww = spr.shape[:2]; t = tip - R @ h['tip']
    cf = (R @ np.array([[0, 0], [ww, 0], [ww, hh], [0, hh]], float).T).T + t
    bx0, by0 = np.floor(cf.min(0)).astype(int); bx1, by1 = np.ceil(cf.max(0)).astype(int)
    M2 = np.hstack([R, (t - np.array([bx0, by0]))[:, None]]).astype(np.float32)
    blit(img, cv2.warpAffine(spr, M2, (bx1 - bx0, by1 - by0), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)), bx0, by0)

