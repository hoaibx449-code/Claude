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
from . import sfx

T_IN, T_OUT = 0.16, 0.24
SWAPC = 420
DRAW_SPEED = 3400.0   # stroke pixels per second
ARM_END, ARM_FADE = 150, 110
TR = 0.22             # seconds of a slide between scenes
# pace: voice rate, longest time to draw a scene, slide length. The pictures follow the voice, so a faster
# voice makes the whole video faster and stays in sync word by word.
PACES = {'slow': ('+0%', 1.5, 0.30), 'normal': ('+8%', 1.2, 0.22), 'fast': ('+15%', 0.9, 0.18), 'faster': ('+25%', 0.7, 0.15)}
def pace_rate(pace):
    """'fast' or a factor like 1.2 -> the voice rate string edge-tts and EverAI take"""
    if pace in PACES: return PACES[pace][0]
    try: return f'{round((float(pace) - 1) * 100):+d}%'
    except (TypeError, ValueError): return PACES['normal'][0]
def pace_draw(pace):
    if pace in PACES: return PACES[pace][1:]
    try: f = float(pace)
    except (TypeError, ValueError): return PACES['normal'][1:]
    return max(0.6, 1.3 / f), max(0.14, 0.24 / f)
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


def scene_frames(ops, dur, cam, base=None, t_in=T_IN, td_max=1.5, info=None):
    """frames of one scene; `base` is a picture already on the board when the scene starts (the cover title),
    the hand draws `ops` over it. With t_in=0 the hand is already on the paper at the first frame."""
    nf = max(1, int(round(dur * FPS))); T_IN = t_in
    items, S, last, side0, sideL = plan(ops or [])
    Td = min(max(0.6, S / DRAW_SPEED), max(0.6, min(td_max, dur * 0.7)))
    if info is not None: info.update(t_in=t_in, td=Td if items else 0)
    board = np.empty((H, W, 3), np.uint8)
    if base is not None: board[:] = base
    else: board[:] = BG
    idx = 0
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
def chunks(ws, size=64, max_w=900, most=6):
    """split a line into caption chunks at natural breaks: after punctuation, never ending on a linking word
    (và, của, là…), chunks of near-equal length; found by dynamic programming over the split points"""
    n = len(ws); best = [0.0] + [1e18] * n; back = [0] * (n + 1)
    target = n / max(1, math.ceil(n / most))
    for j in range(1, n + 1):
        for i in range(max(0, j - most), j):
            part = ws[i:j]
            if text_width(' '.join(part), size) > max_w and j - i > 1: continue
            last = part[-1]; c = (len(part) - target) ** 2
            if j < n:
                if last.rstrip(',.!?…:;') != last: c -= 6          # a comma or full stop is the best place to break
                if last.lower().strip(',.') in GLUE: c += 9        # never end on "và", "của", "là"…
                if ws[j].lower() in ('và', 'nhưng', 'vì', 'để', 'thì', 'mà', 'rồi', 'hay', 'hoặc'): c -= 3  # start on a joining word
            if len(part) == 1 and n > 1: c += 8
            if best[i] + c < best[j]: best[j] = best[i] + c; back[j] = i
    cuts = []; j = n
    while j > 0: cuts.append((back[j], j)); j = back[j]
    return cuts[::-1]


def phrase_cuts(phrases, n):
    """the editor's phrase marks for a line, as (start, end) word ranges, if they cover it exactly"""
    if not phrases: return None
    sizes = [len(str(p).split()) for p in phrases if str(p).strip()]
    if sum(sizes) != n or not sizes: return None
    out, a = [], 0
    for k in sizes:
        while k > 7: out.append((a, a + k // 2)); a += k // 2; k -= k // 2  # a long phrase is halved
        out.append((a, a + k)); a += k
    return out


def caption_layer(words, t, phrases=None):
    """the chunk of the current line that holds the word being said"""
    cur = [w for w in words if w[2] <= t + 0.05]
    if not cur: return None
    line = cur[-1][0]; ws = [w for w in words if w[0] == line]
    k = max(0, min(len(ws) - 1, sum(1 for w in ws if w[2] <= t + 0.05) - 1))
    size = 64
    cuts = phrase_cuts((phrases or {}).get(line), len(ws)) or chunks([w[1] for w in ws], size)
    for a, b in cuts:
        if a <= k < b: return [(i, ws[i][1]) for i in range(a, b)], k, size
    return None


def draw_caption(frame, words, t, phrases=None):
    got = caption_layer(words, t, phrases)
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


def render(scenes, timing, voice, out, words=None, cover=None, music=None, music_volume=0.20, captions=True, effects=True, pace='normal', log=print):
    """scenes: storyboard scenes; timing: [(i, start, end)] per scene from the voice; words: [(line, word, start, end)];
    cover: (title image, ops the hand draws over it) — the first scene, drawn in the first second"""
    work = os.path.dirname(os.path.abspath(out)) or '.'
    total = timing[-1][2]; silent = os.path.join(work, '_silent.mp4'); mix = os.path.join(work, '_mix.m4a'); fx = os.path.join(work, '_fx.wav')
    pr = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
    td_max, TR = pace_draw(pace)
    phrases = {i: sc.get('phrases') for i, sc in enumerate(scenes) if sc.get('phrases')}
    written = 0; prev = None; ntr = max(2, int(TR * FPS)); events = []
    for i, sc in enumerate(scenes):
        _, st, en = timing[i]
        nf = int(round(en * FPS)) - written  # frames are counted on the global clock, so drift never builds up
        use_cover = i == 0 and cover is not None
        kind = sc.get('transition', 'slide') if i else 'cut'
        cam = sc.get('camera') or {}; info = {}
        if use_cover: frames = scene_frames(cover[1], nf / FPS, {'type': 'push', 'amount': 0.05}, cover[0], t_in=0.0, td_max=min(1.2, td_max), info=info)
        else: frames = scene_frames(build(sc.get('visual') or {}), nf / FPS, cam, td_max=td_max, info=info)
        last = None
        for k, fr in enumerate(frames):
            o = fr
            if prev is not None and kind != 'cut' and k < ntr: o = slide(prev, fr, (k + 1) / ntr)
            gt = (written + k) / FPS
            if captions and words: o = draw_caption(o, words, gt, phrases)
            pr.stdin.write(progress(np.array(o, copy=True), gt, total).tobytes()); last = fr
        t0 = written / FPS
        if i and kind != 'cut': events.append((max(0, t0 - 0.08), 'whoosh', TR))
        if info.get('td'): events.append((t0 + info['t_in'], 'scratch', info['td']))
        if use_cover or cam.get('punch'): events.append((t0 + info.get('t_in', 0) + info.get('td', 0), 'pop', 0))
        written += nf; prev = last; log(f'cảnh {i + 1}/{len(scenes)} xong')
    pr.stdin.close(); pr.wait()
    # sound: the voice; music under it that dips while someone speaks; the pen, pops and whooshes
    ins = ['-i', voice]; chains = ['[0:a]aresample=44100,asplit=2[v1][v2]']; mixin = ['[v2]']
    if music and os.path.exists(music):
        ins += ['-stream_loop', '-1', '-i', music]; m = ins.count('-i') - 1
        chains.append(f'[{m}:a]aresample=44100,volume={music_volume},afade=t=in:d=1,afade=t=out:st={max(0, total - 2):.2f}:d=2[m]')
        chains.append('[m][v1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[md]'); mixin.append('[md]')
    else:
        chains.append('[v1]anullsink')
    if effects and events:
        sfx.track(total, events, fx); ins += ['-i', fx]; e = ins.count('-i') - 1
        chains.append(f'[{e}:a]aresample=44100,volume=0.55[fx]'); mixin.append('[fx]')
    fil = ';'.join(chains) + f';{"".join(mixin)}amix=inputs={len(mixin)}:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5,apad[out]'
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error'] + ins + ['-filter_complex', fil, '-map', '[out]', '-t', f'{total:.3f}', mix])
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', mix, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out])
    for x in (silent, mix, fx):
        if os.path.exists(x): os.remove(x)
    return total
