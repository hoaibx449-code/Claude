"""Finished-frame previews: each scene fully drawn, side by side, to check a storyboard before rendering."""
import argparse, json
from .engine import *
from .layouts import build

def still(scene):
    img = np.empty((H, W, 3), np.uint8); img[:] = BG
    for op in build(scene): prep(op); render_full(img, op)
    return img

def sheet(scenes, out, cols=5, scale=0.25, first=None):
    tiles = ([cv2.resize(first, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)] if first is not None else []) + [cv2.resize(still(s), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) for s in scenes]
    th, tw = tiles[0].shape[:2]; rows = (len(tiles) + cols - 1) // cols
    big = np.full((rows * (th + 8), cols * (tw + 8), 3), 255, np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols); big[r * (th + 8):r * (th + 8) + th, c * (tw + 8):c * (tw + 8) + tw] = t
    Image.fromarray(big).save(out)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('storyboard'); ap.add_argument('--out', default='overview.png'); a = ap.parse_args()
    sb = json.load(open(a.storyboard)); sheet([s.get('visual', s) for s in sb['scenes']], a.out)
