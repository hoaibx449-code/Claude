"""What the browser needs to draw a video itself (Ink Studio's "Trình duyệt" machine): every stroke of every
scene, when each scene starts, the words for the captions and the finished sound as raw AAC frames.
The render machine writes this instead of the MP4; the page draws the frames with the same rules as render.py
(ink-render.js) and puts them in an MP4 with this sound."""
import base64, io, json, os
from PIL import Image
from .engine import BG, INK, ACC, W, H, FPS, prep
from .layouts import build
from .render import (plan, draw_time, sound_events, mix_audio, pace_draw, phrase_cuts, chunks,
                     T_IN, T_OUT, SWAPC, DRAW_SPEED, ARM_END, ARM_FADE, CAP_Y)

hexc = lambda c: '#%02x%02x%02x' % tuple(int(v) for v in c[:3])


def op_json(op):
    if op['k'] == 'text':
        m = op['mask']; rgba = Image.new('RGBA', (m.shape[1], m.shape[0]), tuple(int(v) for v in op['c'][:3]) + (0,))
        rgba.putalpha(Image.fromarray(m))
        buf = io.BytesIO(); rgba.save(buf, 'PNG', optimize=True)
        return {'k': 'text', 'bb': [int(v) for v in op['bb']], 'img': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}
    p = op['pts']
    return {'k': op['k'], 'p': [round(float(v), 1) for v in p.reshape(-1)], 'w': round(float(op['w']), 2), 'c': hexc(op['c']),
            'f': hexc(op['fill']) if op['k'] == 'shape' and op.get('fill') is not None else None}


def export(sb, timing, words, voice, out, cover, music=None, music_volume=0.20, captions=True, pace='normal'):
    """writes draw.json and audio.aac into folder `out`; cover = (base ops, drawn ops)"""
    td_max, tr = pace_draw(pace)
    scenes, events = [], []
    for i, sc in enumerate(sb['scenes']):
        _, st, en = timing[i]
        use_cover = i == 0
        ops = list(cover[1]) if use_cover else build(sc.get('visual') or {})
        for op in ops: prep(op)
        items, S, *_ = plan(ops)
        t_in = 0.0 if use_cover else T_IN
        td = draw_time(S, en - st, min(1.2, td_max) if use_cover else td_max) if items else 0
        kind = sc.get('transition', 'slide') if i else 'cut'
        cam = {'type': 'push', 'amount': 0.05} if use_cover else (sc.get('camera') or {})
        events += sound_events(i, st, kind, {'t_in': t_in, 'td': td}, cam, use_cover)
        scenes.append({'end': en, 'kind': kind, 'cam': cam, 't_in': t_in, 'td_max': min(1.2, td_max) if use_cover else td_max, 'ops': [op_json(o) for o in ops]})
    caps = {}
    if captions and words:
        for line in sorted({w[0] for w in words}):
            ws = [w[1] for w in words if w[0] == line]
            caps[line] = phrase_cuts(sb['scenes'][line].get('phrases'), len(ws)) or chunks(ws, 64)
    base = [op_json(o) for o in cover[0]]
    data = {'v': 1, 'W': W, 'H': H, 'fps': FPS, 'total': timing[-1][2], 'bg': hexc(BG), 'ink': hexc(INK), 'acc': hexc(ACC),
            'params': {'T_IN': T_IN, 'T_OUT': T_OUT, 'SWAPC': SWAPC, 'DRAW_SPEED': DRAW_SPEED, 'ARM_END': ARM_END, 'ARM_FADE': ARM_FADE, 'TR': tr, 'CAP_Y': CAP_Y},
            'cover': base, 'scenes': scenes, 'words': [list(w) for w in words] if captions else [], 'captions': caps}
    with open(os.path.join(out, 'draw.json'), 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    mix_audio(timing[-1][2], voice, os.path.join(out, 'audio.aac'), music, music_volume, events, adts=True)
    return data['total']
