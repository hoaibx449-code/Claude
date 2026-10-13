# Builds the adaptive hand assets from photos of a hand WITHOUT a pen (the pen is drawn by the
# engine and held between the fingers). Where the pen goes is learned from a photo of the same
# pose WITH a pen: that photo is aligned onto the pen-free one (affine ECC on the silhouettes),
# and its pen tip, axis, width and the stretch of pen hidden by the fingers are carried over.
# The pen-free photo itself is used untouched; only the fingertips that sit in front of the pen
# are copied into a second layer drawn over it.
#
# Usage: python3 tools/hands-attach.py <photos folder> assets/hands/poses  6:4 7:4 8:1 9:2
#   (pen-free photo : photo of the same pose with a pen; files <name>.webp)
# Needs: pip install numpy pillow opencv-python-headless
import numpy as np, json, sys, os, cv2
from PIL import Image

src, out, pairs = sys.argv[1], sys.argv[2], [p.split(':') for p in sys.argv[3:]]
SCALE = 0.75  # asset px per photo px (one scale for every pose; sharp at 1080p)
os.makedirs(out, exist_ok=True)
load = lambda n: np.array(Image.open(os.path.join(src, f'{n}.webp')).convert('RGBA'))


def pen_of(a):
    """Pen in a photo with a pen: tip, end, unit axis (tip → end), half width, hidden runs."""
    al = a[..., 3].astype(float); lum = a[..., :3].astype(float).mean(2); H, W = al.shape
    warm = a[..., 0].astype(float) - a[..., 2].astype(float)
    dark = (al > 128) & (lum < 80)
    ys, xs = np.nonzero(dark); P = np.stack([xs, ys], 1).astype(float); c = P.mean(0)
    d = np.linalg.svd(P - c, full_matrices=False)[2][0]; n = np.array([-d[1], d[0]])
    keep = np.abs((P - c) @ n) < 120; P = P[keep]
    c = P.mean(0); d = np.linalg.svd(P - c, full_matrices=False)[2][0]; n = np.array([-d[1], d[0]]); t = (P - c) @ d
    b = np.zeros((H, W), bool); b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = True
    by, bx = np.nonzero(b & (al > 128)); ex = np.array([bx.mean(), by.mean()])
    e0, e1 = c + d * np.percentile(t, 0.2), c + d * np.percentile(t, 99.8)
    tip, back = (e0, e1) if np.linalg.norm(e0 - ex) > np.linalg.norm(e1 - ex) else (e1, e0)
    ws = []
    for tt in np.linspace(np.percentile(t, 10), np.percentile(t, 90), 60):
        run = sum(1 for vv in np.arange(-90, 90, 1.0) if (lambda q: 0 <= int(round(q[0])) < W and 0 <= int(round(q[1])) < H and dark[int(round(q[1])), int(round(q[0]))])(c + d * tt + n * vv))
        if run > 6: ws.append(run)
    hw = float(np.median(ws)) / 2
    ax = (back - tip) / np.linalg.norm(back - tip)
    for k in range(1, 60):  # the lighter metal point
        q = tip - ax * k; xi, yi = int(round(q[0])), int(round(q[1]))
        if not (0 <= xi < W and 0 <= yi < H) or al[yi, xi] < 60: break
    tip = tip - ax * (k - 1)
    YY, XX = np.mgrid[0:H, 0:W]; G = np.stack([XX, YY], -1).astype(float) - tip
    nx = np.array([-ax[1], ax[0]]); u = G @ ax; v = G @ nx
    penish = (al > 60) & (lum < 150) & (np.abs(v) < hw * 1.4) & (u > 0)
    L = max(float(np.linalg.norm(back - tip)), float(np.percentile(u[penish], 99.7)))
    # stretches of the axis covered by skin: fingers in front of the pen
    skin = (al > 128) & (lum >= 80) & (warm > 28)
    hidden = []
    for s in range(int(L)):
        q = tip + ax * s; xi, yi = int(q[0]), int(q[1])
        if 0 <= xi < W and 0 <= yi < H and skin[yi, xi]: hidden.append(s)
    return tip, ax, L, hw, hidden


def align(new, old):
    """Affine warp taking points of the photo with a pen onto the pen-free photo."""
    sz = 418  # work small, then scale the matrix back
    f = lambda a: cv2.resize((a[..., 3] > 128).astype(np.float32), (sz, sz), interpolation=cv2.INTER_AREA)
    t, i = cv2.GaussianBlur(f(new), (0, 0), 3), cv2.GaussianBlur(f(old), (0, 0), 3)
    M = np.eye(2, 3, dtype=np.float32)
    _, M = cv2.findTransformECC(t, i, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    k = new.shape[1] / sz
    M = M.astype(float); M[:, 2] *= k  # maps a pen-free point x to the old photo: old ≈ M·[x, 1]
    A = np.vstack([M, [0, 0, 1]]); Ai = np.linalg.inv(A)[:2]
    return lambda p: Ai @ np.array([p[0], p[1], 1.0]), float(np.sqrt(abs(np.linalg.det(Ai[:, :2]))))


poses = []
for new_name, old_name in pairs:
    a, o = load(new_name), load(old_name)
    tip0, ax0, L0, hw0, hidden0 = pen_of(o)
    to_new, sc = align(a, o)
    tip = to_new(tip0); back = to_new(tip0 + ax0 * L0)
    ax = (back - tip) / np.linalg.norm(back - tip); L = float(np.linalg.norm(back - tip)); hw = hw0 * sc
    nx = np.array([-ax[1], ax[0]])
    al = a[..., 3].astype(float); lum = a[..., :3].astype(float).mean(2); H, W = al.shape
    warm = a[..., 0].astype(float) - a[..., 2].astype(float)
    skin = (al > 128) & (lum >= 80) & (warm > 20)
    YY, XX = np.mgrid[0:H, 0:W]; G = np.stack([XX, YY], -1).astype(float) - tip
    u = G @ ax; v = G @ nx
    # the fingertips over the pen: skin of the pen-free photo along the hidden stretches, a little wider than the pen
    fm = np.zeros((H, W), bool)
    for s0 in hidden0:
        s = s0 * L / L0
        fm |= (u >= s - 1.5) & (u <= s + 2.5) & (np.abs(v) < hw * 1.9) & skin
    fm = cv2.morphologyEx(fm.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool) & (al > 0)
    fingers = a.copy(); fingers[..., 3] = np.where(fm, a[..., 3], 0)
    fingers[..., 3] = cv2.GaussianBlur(fingers[..., 3], (3, 3), 0)
    # forearm direction, where it leaves the photo, the wrist
    b = np.zeros((H, W), bool); b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = True
    by, bx = np.nonzero(b & (al > 128)); ex = np.array([bx.mean(), by.mean()])
    arm = al > 128; dist = np.hypot(XX - ex[0], YY - ex[1])
    cen = lambda m: np.array([XX[m].mean(), YY[m].mean()])
    fd = cen(arm & (dist < 70)) - cen(arm & (dist > 240) & (dist < 320)); fd /= np.linalg.norm(fd)
    fn = np.array([-fd[1], fd[0]])
    def section(p0):
        lo = hi = 0
        for sgn in (1, -1):
            for k in range(1, 700):
                q = p0 + fn * k * sgn; xi, yi = int(round(q[0])), int(round(q[1]))
                if not (0 <= xi < W and 0 <= yi < H): return None
                if al[yi, xi] < 100:
                    if sgn > 0: hi = k
                    else: lo = k
                    break
            else: return None
        return lo, hi
    half = 80.0
    for dd in range(20, 600, 6):
        q = ex - fd * dd
        if not arm[int(np.clip(q[1], 0, H - 1)), int(np.clip(q[0], 0, W - 1))]: continue
        s_ = section(q)
        if s_: lo, hi = s_; p0 = q + fn * (hi - lo) / 2; half = (hi + lo) / 2; break
    grip = tip + ax * L * 0.4
    best = (1e9, None)
    for s in np.linspace(0.15, 0.95, 40):
        q = grip + (p0 - grip) * s
        if not arm[int(q[1]), int(q[0])]: continue
        r = section(q)
        if r and r[0] + r[1] < best[0]: best = (r[0] + r[1], q)
    wrist = best[1] if best[1] is not None else (grip + p0) / 2
    along_e = (np.stack([bx, by], 1).astype(float) - ex) @ fn
    e_a = np.array([bx[along_e.argmin()], by[along_e.argmin()]], float); e_b = np.array([bx[along_e.argmax()], by[along_e.argmax()]], float)
    hy, hx = np.nonzero(a[..., 3] > 100)
    k = SCALE; OW, OH = int(round(W * k)), int(round(H * k))
    Image.fromarray(a).resize((OW, OH), Image.LANCZOS).save(os.path.join(out, f'hand-{new_name}.webp'), quality=88, method=6)
    Image.fromarray(fingers).resize((OW, OH), Image.LANCZOS).save(os.path.join(out, f'fingers-{new_name}.webp'), quality=90, method=6)
    tr = lambda p: [round(float(p[0] * k), 2), round(float(p[1] * k), 2)]
    ang = lambda vv: round(float(np.arctan2(vv[1], vv[0])), 4)
    poses.append({'id': new_name, 'scale': SCALE, 'edge': [tr(e_a), tr(ex), tr(e_b)], 'width': OW, 'height': OH, 'tip': tr(tip), 'back': tr(back), 'grip': tr(grip),
        'wrist': tr(wrist), 'cut': tr(p0), 'penWidth': round(float(2 * hw * k), 2), 'penAxis': ang(ax), 'forearm': ang(fd), 'armHalf': round(float(half * k), 1),
        'box': [round(float(hx.min() * k)), round(float(hy.min() * k)), round(float(hx.max() * k)), round(float(hy.max() * k))]})
    # one pen for every pose (a pen pointing at the camera looks wider in its photo, the drawn one should not)
    poses[-1]['penWidth'] = round(float(np.clip(poses[-1]['penWidth'], 28, 34)), 2)
    print(new_name, 'from', old_name, 'tip', tr(tip), 'axis', ang(ax), 'pen width', poses[-1]['penWidth'], 'scale', round(sc, 3))
json.dump(poses, open(os.path.join(out, 'poses.json'), 'w'), indent=1)
