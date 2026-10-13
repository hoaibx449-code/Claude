# Usage: python3 tools/hands-build.py <folder of transparent hand photos (1.webp…)> assets/hands/poses
# Needs: pip install numpy pillow opencv-python-headless
# Builds adaptive hand assets from photos of a hand holding a pen (transparent PNG/WebP):
# hand without the pen (inpainted), the fingers in front of the pen, anchors, and the forearm
# extruded along its own direction so it always continues past the frame edge.
import numpy as np, json, sys, os, cv2
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
names = {'1': 'E', '2': 'D', '3': 'C', '4': 'B', '5': 'A'}  # filled below from the measured exit
SCALE = 0.75  # one scale for every pose (the photos share the same hand size); sharp at 1080p
os.makedirs(out, exist_ok=True)
poses = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.webp'): continue
    a = np.array(Image.open(os.path.join(src, f)).convert('RGBA'))
    al = a[..., 3].astype(float); lum = a[..., :3].astype(float).mean(2)
    H, W = al.shape
    dark = (al > 128) & (lum < 80)
    ys, xs = np.nonzero(dark); P = np.stack([xs, ys], 1).astype(float); c = P.mean(0)
    d = np.linalg.svd(P - c, full_matrices=False)[2][0]
    t = (P - c) @ d; n = np.array([-d[1], d[0]])
    keep = np.abs((P - c) @ n) < 120  # pen pixels only, near its axis
    P = P[keep]; t = t[keep]
    c = P.mean(0); d = np.linalg.svd(P - c, full_matrices=False)[2][0]; n = np.array([-d[1], d[0]]); t = (P - c) @ d
    b = np.zeros((H, W), bool); b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = True
    by, bx = np.nonzero(b & (al > 128)); ex = np.array([bx.mean(), by.mean()])
    e0, e1 = c + d * np.percentile(t, 0.2), c + d * np.percentile(t, 99.8)
    tip, back = (e0, e1) if np.linalg.norm(e0 - ex) > np.linalg.norm(e1 - ex) else (e1, e0)
    ax = (back - tip) / np.linalg.norm(back - tip); nx = np.array([-ax[1], ax[0]])
    # pen half width: median width of the dark run across the axis, where the pen is visible
    ws = []
    for tt in np.linspace(np.percentile(t, 10), np.percentile(t, 90), 60):
        q0 = c + d * tt; run = 0
        for vv in np.arange(-90, 90, 1.0):
            q = q0 + n * vv; xi, yi = int(round(q[0])), int(round(q[1]))
            if 0 <= xi < W and 0 <= yi < H and dark[yi, xi]: run += 1
        if run > 6: ws.append(run)
    hw = float(np.median(ws)) / 2
    # the metal point is lighter: extend the tip until the pixels along the axis stop
    for k in range(1, 60):
        q = tip - ax * k; xi, yi = int(round(q[0])), int(round(q[1]))
        if not (0 <= xi < W and 0 <= yi < H) or al[yi, xi] < 60: break
    tip = tip - ax * (k - 1)
    L = np.linalg.norm(back - tip)
    # pixel grid in the pen frame
    YY, XX = np.mgrid[0:H, 0:W]; G = np.stack([XX, YY], -1).astype(float) - tip
    u = G @ ax; v = G @ nx
    # the real end of the pen: the farthest grey/dark pixel on its axis (the cap is lighter)
    penish = (al > 60) & (lum < 150) & (np.abs(v) < hw * 1.4) & (u > 0)
    L = max(L, float(np.percentile(u[penish], 99.7)))
    back = tip + ax * L
    band = (u > -4) & (u < L + 6) & (np.abs(v) < hw + 3)
    warm = a[..., 0].astype(float) - a[..., 2].astype(float)
    skin = (al > 128) & (lum >= 80) & (warm > 28)
    penm = band & (al > 60) & ~(skin & (np.abs(v) < hw + 3) & (lum > 120) & False)
    # pixels of the band that are skin are fingers in front of the pen
    front = band & skin & (lum > 110)
    # keep only finger runs that sit between pen pixels along the axis (the pen continues on both sides)
    occl = np.zeros(int(L) + 8, bool)
    for s in range(0, int(L)):
        q = tip + ax * s; xi, yi = int(q[0]), int(q[1])
        if 0 <= xi < W and 0 <= yi < H and skin[yi, xi]: occl[s] = True
    fm = np.zeros((H, W), bool)
    for s0 in range(int(L)):
        if occl[s0]: fm |= (u >= s0 - 1) & (u <= s0 + 2) & (np.abs(v) < hw * 1.6) & skin
    fm = cv2.dilate(fm.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & (al > 0)
    fingers = a.copy(); fingers[..., 3] = np.where(fm, a[..., 3], 0)
    fingers[..., 3] = cv2.GaussianBlur(fingers[..., 3], (3, 3), 0)
    # hand without the pen: the pen band (minus the front fingers) is painted from its surroundings
    wide = (u > -16) & (u < L + 12) & (np.abs(v) < hw * 1.6 + 6)
    greyish = (al > 40) & (lum < 165) & (u > -24) & (u < L + 14) & (np.abs(v) < hw * 2.2)
    pm = ((wide | greyish) & ~fm).astype(np.uint8) * 255
    pm = cv2.dilate(pm, np.ones((9, 9), np.uint8)) & ~(fm.astype(np.uint8) * 255)
    rgb = cv2.inpaint(np.ascontiguousarray(a[..., :3]), pm, 9, cv2.INPAINT_TELEA)
    alp = cv2.inpaint(np.ascontiguousarray(a[..., 3]), pm, 9, cv2.INPAINT_TELEA)
    alp = np.where(pm > 0, np.where(alp > 140, 255, 0), a[..., 3]).astype(np.uint8)
    hand = np.dstack([rgb, alp])
    hand[fm] = a[fm]
    # forearm: its direction near the frame edge, a clean cross-section inside the picture
    arm = (al > 128); dist = np.hypot(XX - ex[0], YY - ex[1])
    cen = lambda m: np.array([XX[m].mean(), YY[m].mean()])
    fd = cen(arm & (dist < 70)) - cen(arm & (dist > 240) & (dist < 320)); fd /= np.linalg.norm(fd)
    fn = np.array([-fd[1], fd[0]])
    def section(p0):
        # the run of arm pixels through p0 across the forearm; None if it leaves the picture
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
    p0 = None
    for dd in range(20, 600, 6):
        q = ex - fd * dd
        q2 = q.copy()
        if not arm[int(np.clip(q[1], 0, H - 1)), int(np.clip(q[0], 0, W - 1))]: continue
        s = section(q)
        if s:
            lo, hi = s; mid = q + fn * (hi - lo) / 2; p0 = mid; half = (hi + lo) / 2; break
    assert p0 is not None, f
    # wrist: narrowest cross-section between the grip and the cut
    grip = tip + ax * L * 0.62
    best = (1e9, None)
    for s in np.linspace(0.15, 0.95, 40):
        q = grip + (p0 - grip) * s
        if not arm[int(q[1]), int(q[0])]: continue
        r = section(q)
        if r and r[0] + r[1] < best[0]: best = (r[0] + r[1], q)
    wrist = best[1] if best[1] is not None else (grip + p0) / 2
    # scale and pad: the forearm is extruded beyond the cut line (no stretching of the hand)
    k = SCALE
    ext = 0.0  # the photo is used as it is: its own forearm, never lengthened
    corners = np.array([[0, 0], [W, 0], [0, H], [W, H]], float)
    far = p0 + fd * ext
    pts = corners
    x0, y0 = np.floor(pts.min(0)); x1, y1 = np.ceil(pts.max(0))
    OW, OH = int(x1 - x0), int(y1 - y0)
    canvas = np.zeros((OH, OW, 4), np.uint8); fcan = np.zeros((OH, OW, 4), np.uint8)
    canvas[int(-y0):int(-y0) + H, int(-x0):int(-x0) + W] = hand
    fcan[int(-y0):int(-y0) + H, int(-x0):int(-x0) + W] = fingers
    # everything past the cut line comes from the cross-section at the cut
    OY, OX = np.mgrid[0:OH, 0:OW]; Q = np.stack([OX + x0, OY + y0], -1).astype(float)
    along = (Q - p0) @ fd; across = (Q - p0) @ fn
    # (no extrusion: whatever lies past the photo's edge simply is not there)
    # resize
    OWs, OHs = max(2, int(round(OW * k))), max(2, int(round(OH * k)))
    hi = Image.fromarray(canvas).resize((OWs, OHs), Image.LANCZOS)
    fi = Image.fromarray(fcan).resize((OWs, OHs), Image.LANCZOS)
    tr = lambda p: [round(float((p[0] - x0) * k), 2), round(float((p[1] - y0) * k), 2)]
    pid = os.path.splitext(f)[0]
    hi.save(os.path.join(out, f'hand-{pid}.webp'), quality=88, method=6)
    fi.save(os.path.join(out, f'fingers-{pid}.webp'), quality=88, method=6)
    ang = lambda v: round(float(np.arctan2(v[1], v[0])), 4)
    # bounding box of the hand itself (without the extrusion), for occlusion
    hy, hx = np.nonzero(hand[..., 3] > 100)
    bx_, by_ = bx.astype(float), by.astype(float)
    along_e = (np.stack([bx_, by_], 1) - ex) @ fn
    e_a = np.array([bx_[along_e.argmin()], by_[along_e.argmin()]]); e_b = np.array([bx_[along_e.argmax()], by_[along_e.argmax()]])
    poses.append({'id': pid, 'scale': SCALE, 'edge': [tr(e_a), tr(ex), tr(e_b)], 'width': OWs, 'height': OHs, 'tip': tr(tip), 'back': tr(back), 'grip': tr(grip), 'wrist': tr(wrist), 'cut': tr(p0),
        'penWidth': round(float(2 * hw * k), 2), 'penAxis': ang(ax), 'forearm': ang(fd), 'armHalf': round(float(half * k), 1),
        'box': [round(float((hx.min() - x0) * k)), round(float((hy.min() - y0) * k)), round(float((hx.max() - x0) * k)), round(float((hy.max() - y0) * k))]})
    print(pid, poses[-1])
json.dump(poses, open(os.path.join(out, 'poses.json'), 'w'), indent=1)
