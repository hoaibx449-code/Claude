"""Prepare a hand photo for the renderer.

Input: a hand holding a pen, background already transparent (PNG/WebP).
You give 3 measurements in the source image's pixel coordinates:
  --tip    x,y   the pen tip (where the line is drawn)
  --end    x,y   the far end of the pen (cap)
  --fingers x0,x1  horizontal range where fingers cover the pen (thumb/index pads)
Optional:
  --cut y        cut the forearm horizontally at this y (like the reference videos)
  --width px     pen width in source pixels (default 46)

Output folder gets: hand.webp (hand with the pen removed), fingers.webp (the
fingers that sit in front of the tool) and hand.json (anchor + angle).

Example:
  python3 tools/hand_prep.py photo.webp assets/hands/default \\
      --tip 175,158 --end 686,488 --fingers 288,356 --cut 860
"""
import argparse, json, math, os
import numpy as np
from PIL import Image


def pt(s):
    return np.array([float(v) for v in s.split(',')])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--tip', required=True, type=pt)
    ap.add_argument('--end', required=True, type=pt)
    ap.add_argument('--fingers', required=True, type=pt)
    ap.add_argument('--cut', type=float)
    ap.add_argument('--width', type=float, default=46)
    ap.add_argument('--dilate', type=int, default=5)
    a = ap.parse_args()

    img = np.asarray(Image.open(a.src).convert('RGBA')).astype(np.float32)
    H, W = img.shape[:2]
    rgb, A = img[..., :3], img[..., 3]
    lum, sat = rgb.mean(-1), rgb.max(-1) - rgb.min(-1)
    A[A < 40] = 0  # stray semi-transparent noise

    T, E = a.tip, a.end
    L = float(np.linalg.norm(E - T)); d = (E - T) / L; n = np.array([-d[1], d[0]])
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    s = (xx - T[0]) * d[0] + (yy - T[1]) * d[1]
    w = (xx - T[0]) * n[0] + (yy - T[1]) * n[1]
    half = a.width * 0.82
    corr = (s > -6) & (s < L + 16) & (np.abs(w) < half)
    # dark body, plus grey/silver clip and rings
    penlike = (A > 60) & (((lum < 125) & (sat < 48)) | ((lum > 150) & (sat < 18)))
    pen = penlike & corr
    m = pen.copy()
    for _ in range(a.dilate):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    m &= corr
    finger_zone = (xx >= a.fingers[0]) & (xx <= a.fingers[1])
    m &= ~(finger_zone & ~pen)  # never paint over fingers in front of the pen

    # fill the pen area across its width, interpolating the skin on both sides
    out = img.copy()
    pre = np.concatenate([rgb * A[..., None] / 255.0, A[..., None]], -1)
    ws = np.arange(-half - 10, half + 11, 1.0)

    def side(iy, ix, i, step):
        k = [min(max(i + step * j, 0), len(ws) - 1) for j in range(4)]
        return np.mean([pre[iy[j], ix[j]] for j in k], 0)

    for si in np.arange(-6, L + 16, 0.5):
        c = T + si * d
        pts = c[None, :] + ws[:, None] * n[None, :]
        ix = np.clip(np.round(pts[:, 0]).astype(int), 0, W - 1)
        iy = np.clip(np.round(pts[:, 1]).astype(int), 0, H - 1)
        mm = m[iy, ix]
        if not mm.any():
            continue
        idx = np.where(mm)[0]; i0, i1 = idx.min(), idx.max()
        lo, hi = max(i0 - 6, 0), min(i1 + 6, len(ws) - 1)
        p0, p1 = side(iy, ix, lo, -1), side(iy, ix, hi, 1)
        for i in range(i0, i1 + 1):
            u = (i - lo) / (hi - lo); v = p0 * (1 - u) + p1 * u
            out[iy[i], ix[i], 3] = v[3]
            out[iy[i], ix[i], :3] = v[:3] / v[3] * 255.0 if v[3] > 1 else 0

    fingers = np.zeros_like(img)
    fm = (A > 128) & (np.abs(w) < half + 6) & (s > 0) & (s < L) & finger_zone & ~pen
    fingers[fm] = img[fm]

    cut = int(a.cut) if a.cut else H
    out[cut:] = 0
    for i in range(4):  # soften the cut edge
        out[cut - 1 - i, :, 3] *= (i + 1) / 5

    ys, xs = np.where(out[..., 3] > 10)
    x0 = max(min(int(xs.min()), int(T[0])) - 4, 0)
    y0 = max(min(int(ys.min()), int(T[1])) - 4, 0)
    x1 = min(int(xs.max()) + 4, W)
    os.makedirs(a.out, exist_ok=True)
    for arr, name in ((out, 'hand.webp'), (fingers, 'fingers.webp')):
        Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA').crop((x0, y0, x1, cut)).save(
            os.path.join(a.out, name), 'WEBP', quality=88, method=6)
    meta = {
        'width': x1 - x0, 'height': cut - y0,
        'tip': [round(T[0] - x0, 1), round(T[1] - y0, 1)],
        'angle': round(math.atan2(d[1], d[0]), 4),
        'penWidth': a.width,
    }
    json.dump(meta, open(os.path.join(a.out, 'hand.json'), 'w'), indent=2)
    print(json.dumps(meta))


if __name__ == '__main__':
    main()
