"""Render a storyboard to a 9:16 MP4: each scene is drawn stroke by stroke by the hand while its line is read.

Changes from the skill's render.py: the scenes come from layouts (data, not code); the drawing finishes well
before the line ends, so the finished picture holds instead of leaving the screen half empty; the camera keeps
a slow push on the finished picture; the title card on the first scene is designed like the cover."""
import math, os, subprocess
from .engine import *
from .layouts import build

T_IN, T_OUT = 0.22, 0.30
PAD_END = 0.25
SWAPC = 520
DRAW_SPEED = 2300.0  # stroke pixels per second at the slowest; long scenes do not stretch the drawing
ease = lambda t: t * t * (3 - 2 * t)


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))


def plan(ops):
    items = []; s = 0.0; cur = None; side = None; first_side = None
    for op in ops:
        prep(op)
        if side is None:
            side = -1 if op['a'][0] < 0.5 * W else 1; first_side = side
        else:
            ns = side
            if side == 1 and op['a'][0] < 0.30 * W: ns = -1
            elif side == -1 and op['a'][0] > 0.70 * W: ns = 1
            if ns != side:
                items.append(dict(t='swap', s0=s, s1=s + SWAPC, a=cur, b=op['a'], sf=side, st=ns)); s += SWAPC; side = ns
            else:
                d = math.hypot(op['a'][0] - cur[0], op['a'][1] - cur[1]); tr = d * 0.12
                if tr > 0: items.append(dict(t='travel', s0=s, s1=s + tr, a=cur, b=op['a'], side=side)); s += tr
        items.append(dict(t='draw', s0=s, s1=s + op['L'], op=op, side=side)); s += op['L']; cur = op['b']
    return items, max(s, 1e-6), cur, first_side, side


def slide(P, side, k):
    phi = phi_for(P, side); v = arm_vec(phi, side)
    return (P[0] + v[0] * exit_dist(P, v) * k, P[1] + v[1] * exit_dist(P, v) * k), phi


def cam_matrix(cam, dur, t):
    typ = (cam or {}).get('type', 'push'); e = ease(min(1.0, t / max(dur, 0.1)))
    z, cx, cy = 1.0, W / 2, H / 2
    amt = float((cam or {}).get('amount', 0.08))
    if typ == 'push': z = 1 + amt * e
    elif typ == 'pull': z = 1 + amt * (1 - e)
    elif typ == 'pan':
        z = float(cam.get('zoom', 1.15)); a = cam.get('focus', [540, 960]); b = cam.get('to', [540, 960])
        cx = (540 + (a[0] - 540) * 0.25) * (1 - e) + (540 + (b[0] - 540) * 0.25) * e
    if cam and cam.get('punch'): z *= 1 + 0.05 * max(0, 1 - t / 0.2)
    cw, ch = W / z, H / z; x0 = min(max(cx - cw / 2, 0), W - cw); y0 = min(max(cy - ch / 2, 0), H - ch)
    return np.float32([[z, 0, -x0 * z], [0, z, -y0 * z]])


def scene_frames(ops, dur, cam):
    items, S, last, side0, sideL = plan(ops)
    nf = int(round(dur * FPS))
    Td = min(max(0.8, dur - T_IN - T_OUT - 0.12), max(1.1, S / DRAW_SPEED), dur * 0.78)
    base = np.empty((H, W, 3), np.uint8); base[:] = BG; idx = 0
    first = items[0]['op']['a'] if items else (W / 2, H / 2)
    for f in range(nf):
        t = f / FPS; sd = min(max((t - T_IN) / Td, 0), 1) * S
        while idx < len(items) and items[idx]['s1'] <= sd:
            if items[idx]['t'] == 'draw': render_full(base, items[idx]['op'])
            idx += 1
        img = base.copy(); hand = None
        if not items: pass
        elif t < T_IN:
            tip, phi = slide(first, side0, 1 - ease(t / T_IN)); hand = (tip, phi, side0)
        elif idx < len(items):
            it = items[idx]
            if it['t'] == 'travel':
                u = (sd - it['s0']) / (it['s1'] - it['s0']); tip = (it['a'][0] + (it['b'][0] - it['a'][0]) * u, it['a'][1] + (it['b'][1] - it['a'][1]) * u)
                hand = (tip, phi_for(tip, it['side']), it['side'])
            elif it['t'] == 'swap':
                u = (sd - it['s0']) / (it['s1'] - it['s0'])
                if u < 0.5: tip, phi = slide(it['a'], it['sf'], ease(u * 2)); hand = (tip, phi, it['sf'])
                else: tip, phi = slide(it['b'], it['st'], 1 - ease((u - 0.5) * 2)); hand = (tip, phi, it['st'])
            else:
                fr = (sd - it['s0']) / (it['s1'] - it['s0']) if it['s1'] > it['s0'] else 1
                tip = render_partial(img, it['op'], max(0.0, min(fr, 1.0))) if fr > 0 else it['op']['a']
                hand = (tip, phi_for(tip, it['side']), it['side'])
        else:
            u = (t - (T_IN + Td)) / T_OUT
            if u < 1: tip, phi = slide(last, sideL, ease(max(u, 0))); hand = (tip, phi, sideL)
        if hand is not None: draw_hand2(img, *hand, arm_end=330, fade=200)
        yield cv2.warpAffine(img, cam_matrix(cam, dur, t), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def title_card(frame, text, t, hold=1.7):
    """the hook title on the first second and a half: ink-outlined yellow box, big black type"""
    if not text or t > hold: return frame
    a = 1.0 if t < hold - 0.35 else max(0.0, (hold - t) / 0.35)
    pil = Image.fromarray(frame).convert('RGBA'); box = Image.new('RGBA', pil.size, (0, 0, 0, 0)); bd = ImageDraw.Draw(box)
    size = fit_size(text, 104, 860, FONT_BLACK); f = font(size, FONT_BLACK)
    bb = bd.textbbox((W / 2, 250), text, font=f, anchor='mm'); pad = 34; al = int(255 * a)
    bd.rounded_rectangle([bb[0] - pad + 10, bb[1] - pad + 12, bb[2] + pad + 10, bb[3] + pad + 12], 26, fill=INK + (int(al * 0.9),))
    bd.rounded_rectangle([bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad], 26, fill=ACC + (al,), outline=INK + (al,), width=8)
    bd.text((W / 2, 250), text, font=f, fill=INK + (al,), anchor='mm')
    return np.asarray(Image.alpha_composite(pil, box).convert('RGB'))


def transition(a, b, kind, p):
    p = ease(p)
    if kind == 'cut': return b if p > 0.5 else a
    if kind in ('whoosh', 'slide'):
        off = int(W * p); out = np.empty_like(a); out[:, :W - off] = a[:, off:]; out[:, W - off:] = b[:, :off]; return out
    if kind == 'zoom':
        z = 1 + 0.5 * p; M = np.float32([[z, 0, -(z - 1) * W / 2], [0, z, -(z - 1) * H / 2]])
        return cv2.addWeighted(cv2.warpAffine(a, M, (W, H), borderMode=cv2.BORDER_REPLICATE), 1 - p, b, p, 0)
    return cv2.addWeighted(a, 1 - p, b, p, 0)


def progress(frame, gt, total):
    f = frame.copy(); bw = int(W * gt / total)
    cv2.rectangle(f, (0, H - 14), (W, H), (225, 218, 200), -1); cv2.rectangle(f, (0, H - 14), (bw, H), ACC, -1); return f


def render(scenes, audios, out, title='', music=None, log=print):
    """scenes: storyboard scenes ({'visual': layout dict, 'camera', 'transition'}); audios: one voice file per scene"""
    assert len(scenes) == len(audios), 'mỗi cảnh cần đúng một file giọng đọc'
    work = os.path.dirname(os.path.abspath(out)) or '.'
    durs = [duration(a) + PAD_END for a in audios]; total = sum(durs)
    silent, voice = os.path.join(work, '_silent.mp4'), os.path.join(work, '_voice.m4a')
    pr = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', silent], stdin=subprocess.PIPE)
    gt = 0.0; prev = None; TR = int(0.2 * FPS)
    for i, sc in enumerate(scenes):
        kind = sc.get('transition', 'cut'); last_out = None
        for k, fr in enumerate(scene_frames(build(sc.get('visual') or {}), durs[i], sc.get('camera'))):
            o = fr
            if i == 0: o = title_card(o, title, k / FPS)
            if i > 0 and kind != 'cut' and k < TR and prev is not None: o = transition(prev, o, kind, (k + 1) / TR)
            pr.stdin.write(progress(o, gt + k / FPS, total).tobytes()); last_out = fr
        prev = last_out; gt += durs[i]; log(f'cảnh {i + 1}/{len(scenes)} xong')
    pr.stdin.close(); pr.wait()
    fil = ''.join(f'[{i}:a]apad=pad_dur={PAD_END},aresample=44100[a{i}];' for i in range(len(audios)))
    fil += ''.join(f'[a{i}]' for i in range(len(audios))) + f'concat=n={len(audios)}:v=0:a=1,loudnorm=I=-16:TP=-1.5[v]'
    inp = [x for a in audios for x in ('-i', a)]
    if music and os.path.exists(music):
        # music sits well under the voice and ducks while someone speaks
        inp += ['-stream_loop', '-1', '-i', music]
        fil += f';[v]asplit=2[v1][v2];[{len(audios)}:a]volume=0.22,aresample=44100[m];[m][v1]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=400[md];[v2][md]amix=inputs=2:duration=first:normalize=0[out]'
        outlabel = '[out]'
    else: outlabel = '[v]'
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error'] + inp + ['-filter_complex', fil, '-map', outlabel, '-t', f'{total:.3f}', voice])
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', voice, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out])
    for t in (silent, voice):
        if os.path.exists(t): os.remove(t)
    return total
