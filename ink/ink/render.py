"""Render a storyboard to a 9:16 MP4 in one continuous narration.

- the video opens on the cover, already drawn, while the hook is read (the cover is the first frame)
- every scene starts exactly when its line starts (word timings from the voice) and is drawn fast, in
  about a second, so the screen is never half empty; the finished picture then holds with a slow push
- scenes hand over with a quick slide or a cut, never a pause; key lines get a punch zoom
- the hand: only the forearm shows and it fades soon after the wrist; it lifts between strokes
- captions: the words of the line on a paper strip, the one being said marked in yellow
- voice, plus music that ducks under it (generated, or the user's own track)"""
import math, os, subprocess
from .engine import *
from .layouts import build

T_IN, T_OUT = 0.16, 0.24
SWAPC = 420
DRAW_SPEED = 3400.0   # stroke pixels per second
ARM_END, ARM_FADE = 150, 110
TR = 0.22             # seconds of a slide between scenes
CAP_Y = 1580          # caption line centre
ease = lambda t: t * t * (3 - 2 * t)


def plan(ops):
    items = []; s = 0.0; cur = None; side = None; first_side = None
    for op in ops:
        prep(op)
        if side is None:
            side = -1 if op['a'][0] < 0.42 * W else 1; first_side = side
        else:
            ns = side
            if side == 1 and op['a'][0] < 0.26 * W: ns = -1
            elif side == -1 and op['a'][0] > 0.74 * W: ns = 1
            if ns != side:
                items.append(dict(t='swap', s0=s, s1=s + SWAPC, a=cur, b=op['a'], sf=side, st=ns)); s += SWAPC; side = ns
            else:
                d = math.hypot(op['a'][0] - cur[0], op['a'][1] - cur[1]); tr = d * 0.10
                if tr > 0: items.append(dict(t='travel', s0=s, s1=s + tr, a=cur, b=op['a'], side=side, d=d)); s += tr
        items.append(dict(t='draw', s0=s, s1=s + op['L'], op=op, side=side)); s += op['L']; cur = op['b']
    return items, max(s, 1e-6), cur, first_side, side


def slide_out(P, side, k):
    phi = phi_for(P, side); v = arm_vec(phi, side)
    return (P[0] + v[0] * exit_dist(P, v) * k, P[1] + v[1] * exit_dist(P, v) * k), phi


def cam_matrix(cam, dur, t):
    cam = cam or {}; typ = cam.get('type', 'push'); e = ease(min(1.0, t / max(dur, 0.1)))
    amt = float(cam.get('amount', 0.07)); z = 1 + amt * e if typ == 'push' else 1 + amt * (1 - e) if typ == 'pull' else 1.0
    if cam.get('punch'): z *= 1 + 0.07 * max(0.0, 1 - t / 0.25)
    cx, cy = W / 2, H * 0.47; cw, ch = W / z, H / z; x0 = min(max(cx - cw / 2, 0), W - cw); y0 = min(max(cy - ch / 2, 0), H - ch)
    return np.float32([[z, 0, -x0 * z], [0, z, -y0 * z]])


def scene_frames(ops, dur, cam, base=None):
    """frames of one scene; `base` is a picture already on the board (the cover) to hold without drawing"""
    nf = max(1, int(round(dur * FPS)))
    if base is not None:
        for f in range(nf): yield cv2.warpAffine(base, cam_matrix(cam, dur, f / FPS), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return
    items, S, last, side0, sideL = plan(ops)
    Td = min(max(0.6, S / DRAW_SPEED), max(0.6, min(1.5, dur * 0.7)))
    board = np.empty((H, W, 3), np.uint8); board[:] = BG; idx = 0
    first = items[0]['op']['a'] if items else (W / 2, H / 2)
    for f in range(nf):
        t = f / FPS; sd = min(max((t - T_IN) / Td, 0), 1) * S
        while idx < len(items) and items[idx]['s1'] <= sd:
            if items[idx]['t'] == 'draw': render_full(board, items[idx]['op'])
            idx += 1
        img = board.copy(); hand = None
        if not items: pass
        elif t < T_IN:
            tip, phi = slide_out(first, side0, 1 - ease(t / T_IN)); hand = (tip, phi, side0)
        elif idx < len(items):
            it = items[idx]; u = (sd - it['s0']) / max(1e-6, it['s1'] - it['s0'])
            if it['t'] == 'travel':  # the pen lifts a little on its way to the next stroke
                lift = math.sin(math.pi * u) * min(60, it['d'] * 0.15)
                tip = (it['a'][0] + (it['b'][0] - it['a'][0]) * u, it['a'][1] + (it['b'][1] - it['a'][1]) * u - lift)
                hand = (tip, phi_for(tip, it['side']), it['side'])
            elif it['t'] == 'swap':
                if u < 0.5: tip, phi = slide_out(it['a'], it['sf'], ease(u * 2)); hand = (tip, phi, it['sf'])
                else: tip, phi = slide_out(it['b'], it['st'], 1 - ease((u - 0.5) * 2)); hand = (tip, phi, it['st'])
            else:
                tip = render_partial(img, it['op'], max(0.0, min(u, 1.0))) if u > 0 else it['op']['a']
                hand = (tip, phi_for(tip, it['side']), it['side'])
        else:
            u = (t - (T_IN + Td)) / T_OUT
            if u < 1: tip, phi = slide_out(last, sideL, ease(max(u, 0))); hand = (tip, phi, sideL)
        if hand is not None: draw_hand2(img, *hand, arm_end=ARM_END, fade=ARM_FADE)
        yield cv2.warpAffine(img, cam_matrix(cam, dur, t), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def slide(a, b, p):
    p = ease(p); off = int(W * p); out = np.empty_like(a); out[:, :W - off] = a[:, off:]; out[:, W - off:] = b[:, :off]; return out


# ---------------- captions ----------------
def caption_layer(words, t):
    """the words of the current line around the one being said, one line of up to ~6 words"""
    cur = [w for w in words if w[2] <= t + 0.05]
    if not cur: return None
    line = cur[-1][0]; ws = [w for w in words if w[0] == line]
    k = max(0, min(len(ws) - 1, sum(1 for w in ws if w[2] <= t + 0.05) - 1))
    # chunk the line into groups of words that fit, show the group holding the current word
    size = 64; groups = [[]]
    for i, w in enumerate(ws):
        trial = ' '.join(x[1] for x in groups[-1] + [w])
        if groups[-1] and (text_width(trial, size) > 900 or len(groups[-1]) >= 6): groups.append([])
        groups[-1].append((i, w[1]))
    g = next(gr for gr in groups if any(i == k for i, _ in gr))
    return g, k, size


def draw_caption(frame, words, t):
    got = caption_layer(words, t)
    if not got: return frame
    g, k, size = got
    pil = Image.fromarray(frame).convert('RGBA'); lay = Image.new('RGBA', pil.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    f = font(size); sw = ink_stroke(size); sp = text_width(' ', size)
    widths = [text_width(w, size) for _, w in g]; tot = sum(widths) + sp * (len(g) - 1); x = (W - tot) / 2
    d.rounded_rectangle([x - 34, CAP_Y - 58, x + tot + 34, CAP_Y + 56], 30, fill=(255, 252, 245, 235), outline=INK + (255,), width=5)
    for (i, w), wd in zip(g, widths):
        if i == k: d.rounded_rectangle([x - 8, CAP_Y - 44, x + wd + 8, CAP_Y + 42], 14, fill=ACC + (255,))
        d.text((x, CAP_Y), w, font=f, fill=INK + (255,), anchor='lm', stroke_width=sw, stroke_fill=INK + (255,))
        x += wd + sp
    return np.array(Image.alpha_composite(pil, lay).convert("RGB"))


def progress(frame, gt, total):
    cv2.rectangle(frame, (0, H - 12), (W, H), (225, 218, 200), -1); cv2.rectangle(frame, (0, H - 12), (int(W * gt / total), H), ACC, -1); return frame


def render(scenes, timing, voice, out, words=None, cover_img=None, music=None, music_volume=0.20, captions=True, log=print):
    """scenes: storyboard scenes; timing: [(i, start, end)] per scene from the voice; words: [(line, word, start, end)]"""
    work = os.path.dirname(os.path.abspath(out)) or '.'
    total = timing[-1][2]; silent = os.path.join(work, '_silent.mp4'); mix = os.path.join(work, '_mix.m4a')
    pr = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
    written = 0; prev = None; ntr = int(TR * FPS)
    for i, sc in enumerate(scenes):
        _, st, en = timing[i]
        nf = int(round(en * FPS)) - written  # frames are counted on the global clock, so drift never builds up
        use_cover = i == 0 and cover_img is not None
        kind = sc.get('transition', 'slide') if i else 'cut'
        last = None
        for k, fr in enumerate(scene_frames(None if use_cover else build(sc.get('visual') or {}), nf / FPS, sc.get('camera'), cover_img if use_cover else None)):
            o = fr
            if prev is not None and kind != 'cut' and k < ntr: o = slide(prev, fr, (k + 1) / ntr)
            gt = (written + k) / FPS
            if captions and words and not use_cover: o = draw_caption(o, words, gt)
            pr.stdin.write(progress(np.array(o, copy=True), gt, total).tobytes()); last = fr
        written += nf; prev = last; log(f'cảnh {i + 1}/{len(scenes)} xong')
    pr.stdin.close(); pr.wait()
    # sound: the voice, and music under it that dips while someone speaks
    if music and os.path.exists(music):
        fil = (f'[0:a]aresample=44100,asplit=2[v1][v2];[1:a]aresample=44100,volume={music_volume},afade=t=in:d=1,afade=t=out:st={max(0, total - 2):.2f}:d=2[m];'
               f'[m][v1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[md];[v2][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5[out]')
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', voice, '-stream_loop', '-1', '-i', music, '-filter_complex', fil, '-map', '[out]', '-t', f'{total:.3f}', mix])
    else:
        subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', voice, '-af', 'loudnorm=I=-15:TP=-1.5,apad', '-t', f'{total:.3f}', mix])
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', mix, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out])
    for x in (silent, mix):
        if os.path.exists(x): os.remove(x)
    return total
