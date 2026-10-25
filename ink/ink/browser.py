"""Ink Studio entirely in the user's browser (Pyodide): the same script, storyboard, drawings, music and timing as
the render machines. Only two things leave the device: the AI questions and the text to read aloud, which the
website answers (its keys and prompts never reach the browser). The page draws and encodes the frames itself.

Every function takes and returns JSON text or bytes, so the JavaScript side stays simple."""
import json
import os
import numpy as np
from . import ai, script as S
from .cover import cover_parts
from .export import drawing as plan_drawing
from .voice import align, plain_estimate, line_spans
from .music import compose
from .sfx import scratch, pop, whoosh, SR


def use_site(ask):
    """ask(system_ref, user_ref, temperature, attempt) -> (text, provider, model), answered by the website"""
    ai.remote = ask


def plan(inp_json, log=print):
    """script + storyboard for a job's input (topic or the user's own script)"""
    inp = json.loads(inp_json)
    os.environ['INK_VOICE_PROVIDER'] = inp.get('voiceProvider') or 'microsoft'  # the script is sized to this voice
    if inp.get('mode') == 'script':
        sc = S.from_script(inp.get('script', ''), int(inp.get('seconds') or S.MAX_SECONDS), pace=inp.get('pace', 'normal'), log=log)
    else:
        sc = S.from_topic(inp.get('topic', ''), int(inp.get('seconds') or 60), inp.get('audience', ''),
                          tone=inp.get('tone') or 'tự nhiên, hợp với chủ đề và người xem', notes=inp.get('notes', ''), pace=inp.get('pace', 'normal'), log=log)
    sb = S.storyboard(sc, log=log)
    sb['ai'] = [f'{p}/{m}' for p, m in ai.used]
    return json.dumps(sb, ensure_ascii=False)


def timing(lines_json, heard_json, total):
    """word and line times from the voice's word boundaries (or an even share when the voice gave none)"""
    lines, heard = json.loads(lines_json), json.loads(heard_json)
    words = align(lines, [tuple(h) for h in heard], total) if heard else None
    words = words or plain_estimate(lines, total)
    return json.dumps({'timing': line_spans(lines, words, total), 'words': words}, ensure_ascii=False)


def drawing(sb_json, timing_json, pace='normal', captions=True):
    """the drawing plan the page draws (same as draw.json from a render machine) and the sound events"""
    sb, t = json.loads(sb_json), json.loads(timing_json)
    data, events = plan_drawing(sb, [tuple(x) for x in t['timing']], [tuple(w) for w in t['words']],
                                cover_parts(sb.get('cover') or {'lines': [sb.get('title') or 'Video mới']}), captions, pace)
    return json.dumps({'draw': data, 'events': events}, ensure_ascii=False, separators=(',', ':'))


def music(seconds, mood):
    """background music, mono float32 at 44.1 kHz"""
    return compose(float(seconds), mood if mood else 'motivating').astype(np.float32).tobytes()


def effects(seconds, events_json):
    """the pen, pops and whooshes on one mono float32 track (same sounds as the render machines)"""
    out = np.zeros(int((float(seconds) + 1) * SR), np.float32)
    for at, kind, dur in json.loads(events_json):
        sig = scratch(dur) if kind == 'scratch' else pop() if kind == 'pop' else whoosh()
        i = int(at * SR); j = min(len(out), i + len(sig))
        if 0 <= i < len(out): out[i:j] += sig[:j - i]
    return np.clip(out, -1, 1).tobytes()
