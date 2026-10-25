#!/usr/bin/env python3
"""Biến ảnh thật → "sticker giấy in risograph":
   - tách nền (rembg) cho nhân vật/vật thể, hoặc giữ nguyên khung (plate)
   - in chấm halftone 2 màu: mực đen + màu chủ đạo, lệch khuôn in nhẹ như riso thật
   - viền giấy trắng ngà, mép xé ngẫu nhiên
   python3 paperize.py in.jpg out.png --mode cut|obj|plate --spot "#e8432e"
"""
import argparse
import numpy as np
from PIL import Image, ImageFilter, ImageOps

PAPER = (239, 231, 214)


def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def screen(dark, cell, angle, gain=.78):
    """Lưới chấm halftone khử răng cưa. dark: 0..1 (1 = đậm)."""
    H, W = dark.shape
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.deg2rad(angle)
    u = x * np.cos(a) + y * np.sin(a); v = -x * np.sin(a) + y * np.cos(a)
    fu = (u % cell) - cell / 2; fv = (v % cell) - cell / 2
    d = np.sqrt(fu * fu + fv * fv)
    r = cell * gain * np.sqrt(np.clip(dark, 0, 1))
    return np.clip(r - d + .5, 0, 1)


def torn(mask, border, seed=1):
    """Mở rộng mặt nạ thành viền giấy rồi làm mép xé gồ ghề."""
    rng = np.random.default_rng(seed)
    m = Image.fromarray((mask > .5).astype(np.uint8) * 255)
    k = border | 1
    m = m.filter(ImageFilter.MaxFilter(k if k <= 25 else 25))
    if border > 25: m = m.filter(ImageFilter.MaxFilter(border - 24 | 1))
    m = m.filter(ImageFilter.GaussianBlur(border * .35))
    a = np.asarray(m).astype(np.float32) / 255
    # nhiễu 2 tần số → mép xé
    H, W = a.shape
    lo = np.asarray(Image.fromarray((rng.random((H // 16 + 1, W // 16 + 1)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
    hi = rng.random((H, W)).astype(np.float32)
    a = a + (lo - .5) * .5 + (hi - .5) * .12
    return np.clip((a - .5) * 6 + .5, 0, 1)


def paperize(src, dst, mode='cut', spot='#e8432e', size=1000, cell=None, border=None, seed=1):
    im = Image.open(src).convert('RGB'); im.thumbnail((size, size), Image.LANCZOS)
    W, H = im.size
    if mode in ('cut', 'obj'):
        from rembg import remove, new_session
        sess = new_session('u2net_human_seg' if mode == 'cut' else 'isnet-general-use')
        alpha = np.asarray(remove(im, session=sess, only_mask=True)).astype(np.float32) / 255
        from scipy import ndimage  # chỉ giữ mảng chủ thể lớn nhất (bỏ mảnh rời)
        lab, n = ndimage.label(alpha > .5)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1)); keep = np.argmax(sizes) + 1
            alpha = alpha * ndimage.binary_dilation(lab == keep, iterations=3)
        pad = 60; big = np.zeros((H + 2 * pad, W + 2 * pad), np.float32); big[pad:-pad, pad:-pad] = alpha; alpha = big
        canvas = Image.new('RGB', (W + 2 * pad, H + 2 * pad), (255, 255, 255)); canvas.paste(im, (pad, pad)); im = canvas
        W, H = im.size
    else:
        alpha = np.zeros((H, W), np.float32); m = int(min(W, H) * .045); alpha[m:-m, m:-m] = 1
    cell = cell or max(5, round(min(W, H) / 150))
    border = border or max(10, round(min(W, H) / 55))
    # tông: tăng tương phản, làm mịn theo cỡ ô
    g = ImageOps.autocontrast(im.convert('L'), cutoff=2).filter(ImageFilter.GaussianBlur(cell * .35))
    dark = 1 - np.asarray(g).astype(np.float32) / 255
    ink = screen(np.clip((dark - .26) * 1.5, 0, 1), cell, 45)                    # mực đen: vùng tối
    sp = screen(np.clip((dark - .15) * .95, 0, 1) * .75, cell * 1.15, 15)  # màu chủ đạo: trung tông
    sp = np.roll(np.roll(sp, 3, 0), -4, 1)                                          # lệch khuôn in
    paper = np.array(PAPER, np.float32)[None, None, :]
    s = np.array(hexrgb(spot), np.float32)[None, None, :]
    out = paper * (1 - sp[..., None]) + (paper * s / 255) * sp[..., None]           # in chồng (multiply)
    out = out * (1 - ink[..., None] * .92) + np.array([24, 22, 20], np.float32) * (ink[..., None] * .92)
    # thớ giấy
    rng = np.random.default_rng(seed); out += (rng.random((H, W, 1)) - .5) * 10
    inner = alpha if mode != 'plate' else alpha
    edge = torn(inner, border, seed)
    rgb = out * inner[..., None] + paper * (1 - inner[..., None])                    # ngoài chủ thể: giấy trơn
    rgba = np.dstack([np.clip(rgb, 0, 255), edge * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA'); bb = img.getbbox(); img = img.crop(bb) if bb else img
    img.save(dst, optimize=True)
    return img.size


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--mode', default='cut'); ap.add_argument('--spot', default='#e8432e'); ap.add_argument('--seed', type=int, default=1)
    a = ap.parse_args(); print(paperize(a.src, a.dst, a.mode, a.spot, seed=a.seed))
