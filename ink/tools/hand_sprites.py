"""Bake the drawing hand (forearm that fades out after the wrist) into two transparent PNGs for the browser
renderer, exactly as render.py draws it: draw_hand2 at the hand's own angle, once on black and once on white,
the difference gives the transparency. Writes web/public/ink/hand-{r,l}.png and hand.json (tip, base angle).
Run again only when the hand image or ARM_END/ARM_FADE change:  python tools/hand_sprites.py"""
import json, math, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ink.engine import draw_hand2, PHI0
from ink.render import ARM_END, ARM_FADE

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'public', 'ink')
TIP = (520.0, 300.0); SIZE = (1040, 1100)
meta = {'phi0': PHI0, 'armEnd': ARM_END, 'fade': ARM_FADE}
os.makedirs(OUT, exist_ok=True)
for side, name in ((1, 'r'), (-1, 'l')):
    shots = []
    for bg in (0, 255):
        img = np.full((1920, 1080, 3), bg, np.uint8)
        draw_hand2(img, TIP, PHI0, side, arm_end=ARM_END, fade=ARM_FADE)
        shots.append(img[:SIZE[1], :SIZE[0]].astype(np.float32))
    black, white = shots
    a = np.clip(1 - (white - black).mean(2) / 255, 0, 1)
    rgb = np.where(a[..., None] > 1e-3, black / np.maximum(a[..., None], 1e-3), 0).clip(0, 255)
    ys, xs = np.where(a > 0.01); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([rgb, a * 255])[y0:y1, x0:x1].astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'hand-{name}.png'), optimize=True)
    meta[name] = {'tipX': TIP[0] - x0, 'tipY': TIP[1] - y0}
json.dump(meta, open(os.path.join(OUT, 'hand.json'), 'w'), indent=1)
print('ok', meta)
