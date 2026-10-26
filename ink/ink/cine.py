"""The 'Điện ảnh' (cinematic) video type: real footage from Pixabay filling the frame, the camera as the viewer's
eye, words anchored in the space, CapCut-style captions. Made by the HBX engine (ink/hbx, Chromium + ffmpeg).

  plan:   strategy (same as hand-drawn) → AI writes the HBX storyboard → length fitted → checked and repaired →
          preview grid (overview.png) and cover from the engine
  render: the voice (same providers, word times → SRT) → hbx/build.py render → video.mp4 + cover.jpg

The job keeps {format:'cine', title, caption, hashtags, scenes, plan} where `plan` is the HBX plan without its
scenes (scenes sit at the top so the storyboard review page lists them like a hand-drawn one)."""
import json, os, random, re, shutil, subprocess, sys
from . import ai, script as S
from .render import pace_rate

HBX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'hbx')
THEMES = {'ai', 'tech', 'science', 'finance', 'security', 'tips', 'life', 'health', 'society', 'education', 'environment', 'development', 'economy', 'business', 'crypto', 'scam', 'warning', 'howto', 'review'}
MOODS = ('tech', 'finance', 'alert', 'bright', 'calm')
CAMS = ['push', 'dolly', 'zoom', 'fpv', 'truckL', 'truckR', 'rise', 'orbit']
TRANS = ['through', 'cut', 'dissolve', 'whip', 'zoom', 'flash', 'slideup', 'glitch', 'stripes', 'blur', 'spin', 'stretch', 'rgb', 'lightleak', 'filmburn',
         'dipblack', 'dipwhite', 'pushup', 'slide', 'iris', 'wipe', 'smash', 'fpv']
# the technique library (hbx/engine/fx.js): fake camera, overlays, picture effects, footage speed — chosen per scene
FX_CAM = ['punchIn', 'punchOut', 'snapZoom', 'crashZoom', 'kenBurns', 'handheld', 'shake', 'pullOut', 'tiltUp', 'tiltDown', 'panL', 'panR', 'dutch', 'breathe']
FX_OVER = ['arrow', 'circle', 'box', 'underline', 'scribble', 'spotlight', 'impact', 'keyword', 'lowerthird', 'counter', 'progress', 'typewriter', 'stamp', 'sticker', 'bracket', 'flash']
FX_EFF = ['vignette', 'grain', 'glow', 'chroma', 'lightleak', 'halftone', 'bw', 'warm', 'cool', 'blurIn', 'filmburn', 'dim', 'duotone']
FX_SPEED = ['slow', 'ramp', 'freeze', 'fast']
# every way of telling a line in pictures the engine knows, and which "family" it belongs to (variety rules)
FAMILY = {'shot': 'footage', 'callouts': 'footage', 'compare': 'compare', 'warning': 'footage', 'c_photo': 'footage',
          'big_number': 'number', 'c_number': 'number', 'g_blocks': 'number', 'c_ring': 'number', 'c_bar': 'number', 'chart': 'chart', 'c_dots': 'number',
          'c_equation': 'flow', 'g_flow': 'flow', 'b_grid': 'flow', 'timeline': 'time',
          'checklist': 'list', 'c_list': 'list', 'g_cards': 'list', 'question': 'text', 'c_word': 'text', 'c_headline': 'text', 'outro': 'text',
          # infographics (hbx/engine/infographics.js)
          'i_donut': 'number', 'i_gauge': 'number', 'i_rank': 'chart', 'i_scale': 'chart', 'i_funnel': 'flow', 'i_pyramid': 'flow', 'i_cycle': 'flow',
          'i_ipo': 'flow', 'i_venn': 'compare', 'i_matrix': 'compare', 'i_proscons': 'compare', 'i_beforeafter': 'compare', 'i_table': 'compare', 'i_steps': 'list'}
FOOTAGE = {'shot', 'callouts', 'compare', 'warning', 'c_photo'}
# the 3D metaphor world (hbx/engine/meta3d.js, three.js): only for the 'Đòn Bẩy Tư Duy' series, where it carries about half the video
FAMILY['m_scene'] = 'metaphor'
# the treadmill and the dominoes are clichés: kept in the engine for old storyboards, never chosen again
M_PROPS = {'leaky', 'stairs2', 'meter', 'cluster', 'split', 'jar', 'stage'}
M_CAMS = {'orbit', 'push', 'pull', 'rise', 'low', 'top', 'side'}
M_POSES = {'idle', 'think', 'point', 'cheer', 'slump', 'walk', 'run'}
# on a baked 2.5D shot the camera already moves through the picture: only light hand-held tricks may stack on it
SHOT_CAM = {'handheld', 'shake', 'dutch'}

# ---------------------------------------------------------------- the video's own fingerprint
# picked at random for every video, so many people making the same topic still get different videos
PALETTES = [('#ff8a00', '#1e88e5', '#141008'), ('#ffcf3f', '#3fd0ff', '#141008'), ('#e8432e', '#ffd166', '#fff7ea'), ('#2ec4b6', '#ff9f1c', '#04201d'),
            ('#c6ff3d', '#7b61ff', '#101400'), ('#ff5d8f', '#4cc9f0', '#1a0610'), ('#f4d35e', '#0d3b66', '#1a1405'), ('#06d6a0', '#ef476f', '#032018'),
            ('#ffb703', '#219ebc', '#1a1100'), ('#e76f51', '#2a9d8f', '#fff4ec'), ('#a3e635', '#0ea5e9', '#0b1400'), ('#fb7185', '#facc15', '#1f0710'),
            ('#38bdf8', '#f97316', '#04121c'), ('#d4a373', '#588157', '#1b1209'), ('#e9c46a', '#e63946', '#1a1405'), ('#9b5de5', '#00f5d4', '#ffffff')]
FONTS = ['Barlow Condensed', 'Oswald', 'Space Grotesk', 'Playfair Display', 'Lora', 'Be Vietnam Pro']
GRADES = ['dawn', 'warm', 'cool', 'night', 'bright', 'earth', 'none']
VOICES = ['nhịp cắt nhanh, cảnh thật nối nhau, con số nổi trên cảnh', 'điện ảnh: nhiều cảnh quay rộng, chuyển cảnh mượt, đồ hoạ điểm xuyết',
          'tạp chí: ảnh chi tiết đẹp, chữ lớn đặt trên cảnh, một sơ đồ ở chỗ cần', 'phóng sự: cảnh thật, ghim chú thích, so sánh trước/sau',
          'giải thích trực quan: ví von bằng hình thật, ghim chỉ chi tiết, một sơ đồ cơ chế', 'kể chuyện cảm xúc: cảnh người và nơi chốn, chữ lớn ở bước ngoặt']


def fingerprint(seed):
    r = random.Random(seed)
    acc, acc2, ink = r.choice(PALETTES)
    types = [t for t in FAMILY if t not in ('shot', 'outro')]; r.shuffle(types)
    return {'seed': seed, 'style': {'scheme': r.choice(['dark', 'light']), 'accent': acc, 'accent2': acc2, 'accentInk': ink, 'font': r.choice(FONTS), 'grade': r.choice(GRADES)},
            'voice': r.choice(VOICES), 'favour': types[:4], 'tones': r.choice(['abc', 'bca', 'cab', 'acb']),
            'trans': r.sample(['through', 'cut', 'whip', 'zoom', 'flash', 'slideup', 'dissolve'], 3), 'caps': r.random() < .5}


def fp_text(fp):
    st = fp['style']
    return (f"- Bảng màu: nhấn {st['accent']}, nhấn phụ {st['accent2']}, chữ trên màu nhấn {st['accentInk']}; nền {'tối' if st['scheme'] == 'dark' else 'sáng'}; font tiêu đề {st['font']}; chỉnh màu {st['grade']}.\n"
            f"- Chất dựng chủ đạo: {fp['voice']}.\n- Ưu tiên dùng (khi hợp ý câu): {', '.join(fp['favour'])}.\n- Chuyển cảnh hay dùng: {', '.join(fp['trans'])}.")


def norm_words(text): return [w for w in re.findall(r'\w+', str(text).lower()) if len(w) > 1 and not w.isdigit()] + re.findall(r'\d+', str(text))


STRONG_CAM = {'snapZoom', 'crashZoom', 'punchIn', 'shake'}
STRONG_OVER = {'impact', 'keyword', 'stamp', 'flash'}
STRONG_TRANS = {'smash', 'dipwhite', 'flash', 'glitch', 'rgb'}


def strong(s):
    f = s.get('fx') or {}
    return f.get('camera') in STRONG_CAM or any(o.get('kind') in STRONG_OVER for o in f.get('overlay', [])) or s.get('trans') in STRONG_TRANS


def rhythm(scenes, wps):
    """the 3-tier retention rhythm, checked on the estimated timeline: a reward every 8–12 s, turns near 1/3 and 2/3,
    a breath after every strong beat. Returns problems in plain words."""
    out, t, times = [], 0.0, []
    for s in scenes: times.append(t); t += max(1.2, S.words(s['say']) / wps)
    total = t or 1
    hits = [times[i] for i, s in enumerate(scenes) if s.get('beat') in ('reward', 'turn') and strong(s)]
    edges = [0.0] + hits + [total]
    for a, b in zip(edges, edges[1:]):
        if b - a > 13: out.append(f'khoảng {a:.0f}–{b:.0f} giây không có phần thưởng nhỏ nào (beat "reward" + cú mạnh đúng chữ đắt): cần mỗi 8–12 giây')
    turns = [times[i] / total for i, s in enumerate(scenes) if s.get('beat') == 'turn']
    for mark in (1 / 3, 2 / 3):
        if total > 25 and not any(abs(x - mark) < .15 for x in turns): out.append(f'thiếu cú bẻ hướng lớn (beat "turn") quanh {mark * total:.0f} giây')
    for i in range(1, len(scenes)):
        if strong(scenes[i]) and strong(scenes[i - 1]): out.append(f'cảnh {i} và {i + 1} đều là cú mạnh liền nhau: cảnh sau phải là cảnh thở (breath)')
    return out


def polish(scenes, fp, wps):
    """the mechanical rules the AI still broke, fixed in code (deterministic per video): repeated transitions, camera
    tricks or effects in a row, two strong beats back to back, and gaps of more than 12 s without a reward"""
    r = random.Random(fp['seed'])
    calm_tr = ['cut', 'dissolve', 'slide', 'wipe', 'iris', 'through', 'whip', 'pushup', 'blur']
    for i in range(1, len(scenes)):
        a, b = scenes[i - 1], scenes[i]
        if b.get('trans') and b.get('trans') == a.get('trans'):
            b['trans'] = r.choice([t for t in calm_tr if t != a.get('trans')])
        fa, fb = a.get('fx') or {}, b.get('fx') or {}
        if fb.get('camera') and fb.get('camera') == fa.get('camera'): fb.pop('camera')
        if fb.get('effect') and fb.get('effect') == fa.get('effect'): fb.pop('effect')
        if strong(a) and strong(b):   # the second one becomes the breath
            fb.pop('camera', None) if fb.get('camera') in STRONG_CAM else None
            fb['overlay'] = [o for o in fb.get('overlay', []) if o.get('kind') not in STRONG_OVER]
            if b.get('trans') in STRONG_TRANS: b['trans'] = r.choice(['dissolve', 'cut', 'slide'])
            if b['type'] not in ('shot', 'm_scene'): fb.setdefault('camera', 'breathe')
            b['beat'] = 'breath'
        if fb: b['fx'] = {k: v for k, v in fb.items() if v}
        else: b.pop('fx', None)
    for i in range(2, len(scenes)):
        if scenes[i]['type'] == scenes[i - 1]['type'] == scenes[i - 2]['type'] == 'shot' and scenes[i].get('cam') == scenes[i - 1].get('cam') == scenes[i - 2].get('cam'):
            scenes[i]['cam'] = r.choice([c for c in CAMS if c != scenes[i]['cam']])
    # rewards: no stretch longer than 12 s without one — the line's own key words pop on a snap zoom
    t, times = 0.0, []
    for s in scenes: times.append(t); t += max(1.2, S.words(s['say']) / wps)
    last = 0.0
    for i, s in enumerate(scenes):
        if s.get('beat') in ('reward', 'turn') and strong(s): last = times[i]; continue
        if times[i] - last >= 9 and not strong(scenes[i - 1] if i else {}) and not (i + 1 < len(scenes) and strong(scenes[i + 1])):
            key = re.findall(r'\*([^*]+)\*', s['sub'])
            if key:
                f = s.setdefault('fx', {})
                if s['type'] not in ('shot', 'm_scene'): f['camera'] = 'snapZoom'
                f['overlay'] = [o for o in f.get('overlay', []) if o.get('kind') not in STRONG_OVER][:1] + [{'kind': 'keyword', 'text': key[0][:24], 'y': .2}]
                s['beat'] = 'reward'; last = times[i]
    return scenes


TURN_WORDS = re.compile(r'\b(nhưng|thật ra|thực ra|khoan|ngược lại|bất ngờ|điều lạ|sự thật là|vậy mà|tuy nhiên|còn kỳ lạ)\b', re.I)


def structure(scenes, lines_meta, fp, wps, meta=False):
    """the story's shape in pictures: turns
    near 1/3 and 2/3 when the director left them out (the line that turns the story: "nhưng…", a question, a word
    cut), and a loop ending that comes back to the opening footage so the video replays seamlessly"""
    r = random.Random(fp['seed'] + 7)
    t, times = 0.0, []
    for s in scenes: times.append(t); t += max(1.2, S.words(s['say']) / wps)
    total = t or 1
    for mark in (1 / 3, 2 / 3):
        if total < 25 or any(s.get('beat') == 'turn' and abs(times[i] / total - mark) < .15 for i, s in enumerate(scenes)): continue
        near = sorted(range(1, len(scenes) - 1), key=lambda i: abs(times[i] / total - mark))[:5]
        pick = next((i for i in near if scenes[i]['type'] in ('question', 'c_word', 'c_headline') or TURN_WORDS.search(scenes[i]['say'])), near[0] if near else None)
        if pick is None: continue
        s = scenes[pick]; s['beat'] = 'turn'
        if not strong(scenes[pick - 1]): s['trans'] = r.choice(['smash', 'dipwhite', 'glitch'] if s['type'] != 'shot' else ['smash', 'whip', 'dipwhite'])
        if pick + 1 < len(scenes) and strong(scenes[pick + 1]):   # keep a breath after it
            f = scenes[pick + 1].get('fx') or {}; f.pop('camera', None) if f.get('camera') in STRONG_CAM else None
            f['overlay'] = [o for o in f.get('overlay', []) if o.get('kind') not in STRONG_OVER]; scenes[pick + 1]['beat'] = 'breath'
            if scenes[pick + 1].get('trans') in STRONG_TRANS: scenes[pick + 1]['trans'] = 'dissolve'
    first, last = scenes[0], scenes[-1]
    if not meta and first['type'] == 'shot' and last['type'] == 'shot' and first.get('bg') and last.get('bg'):
        last['bg'] = dict(first['bg']); last['cam'] = first.get('cam', 'push'); last['loop'] = True   # same footage: the end flows into the start
    return scenes


def merge_lines(lines, wps, lo=4.0, hi=7.5):
    """one shot per thought, not per sentence: short lines that follow each other join into a scene of about 4–7 s
    (a picture every 2 s reads as flicker). The hook stays alone, a question or a turn opens a new scene."""
    out = []
    for i, l in enumerate(lines):
        sec = S.words(l) / wps
        if out and i > 1 and (out[-1][1] < lo or sec < 2) and out[-1][1] + sec <= hi + 1 and not TURN_WORDS.match(l) and not out[-1][0].rstrip().endswith('?'):
            out[-1] = (out[-1][0] + ' ' + l, out[-1][1] + sec)
        else: out.append((l, sec))
    return [l for l, _ in out]


def split_lines(lines, wps, most=3.2, least=1.4):
    """a fast cut (about 1.5–3 s a picture): a long sentence is cut at its commas into phrases the picture can follow,
    never into a scrap under ~1.5 s"""
    out = []
    for l in lines:
        if S.words(l) / wps <= most: out.append(l); continue
        parts, cur = [], ''
        for b in (x.strip() for x in re.split(r'(?<=[,;:–—])\s+', l) if x.strip()):
            if cur and S.words(cur) / wps >= least and S.words(b) / wps >= least * .8: parts.append(cur); cur = b
            else: cur = (cur + ' ' + b).strip()
        if cur and parts and S.words(cur) / wps < least: parts[-1] += ' ' + cur
        elif cur: parts.append(cur)
        out += parts
    return out


def say_words(scenes): return sum(S.words(s.get('say', '')) for s in scenes)


def _sub(say):
    """a caption split into short chunks when the AI left it out"""
    ws, out, cur = say.split(), [], ''
    for w in ws:
        if cur and len(cur) + 1 + len(w) > 30: out.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    if cur: out.append(cur)
    return ' | '.join(out)


def _clean_sub(sub, say):
    sub = ' '.join(str(sub or '').split()) or _sub(say)
    if '|' not in sub and len(sub) > 38: sub = _sub(sub.replace('*', ''))
    parts = [p.strip().rstrip('.').strip() if not p.strip().endswith('...') else p.strip() for p in sub.split('|')]
    # captions read like normal sentences: a fully upper-case chunk is brought back to sentence case
    parts = [(p[:1] if i == 0 else p[:1].lower()) + p[1:].lower() if len(p) > 3 and p.upper() == p and any(c.isalpha() for c in p) else p for i, p in enumerate(parts)]
    return ' | '.join(p for p in parts if p)


NOT_FOOTAGE = re.compile(r'\b(diagram|graph|chart|infographic|illustration|vector|icon|3d|render|rendering|text|sign|poster|map|drawing|cartoon|animation|showing|concept|or)\b', re.I)


def _footage_q(q):
    """a stock-photo search: subject + place + light, never diagrams or drawings (they come with English words)"""
    q = ' '.join(NOT_FOOTAGE.sub(' ', str(q)).split())
    return q or 'nature landscape'


def _img(o):
    """an image slot {q, video?} for the engine (q cleaned), or None"""
    if not isinstance(o, dict): return None
    q = _footage_q(o.get('q') or '')[:100] if str(o.get('q') or '').strip() else ''
    return ({k: v for k, v in o.items() if k in ('video', 'focus', 'depth', 'vstart')} | {'q': q}) if q else None


# ---------------------------------------------------------------- the 'Đòn Bẩy Tư Duy' look: one text layer, one world
M_TYPES = {'shot', 'm_scene', 'big_number', 'question'}
M_TEXT = ('title', 'items', 'pins', 'quote', 'label', 'note', 'kicker', 'caption', 'value', 'decimals', 'prefix', 'suffix')
M_OVER = {'arrow', 'circle', 'underline', 'spotlight', 'bracket'}          # pointing at the picture, never words on it
M_EFF = {'grain', 'vignette', 'warm', 'cool', 'dim'}                       # one consistent grade, no collage of looks
POSED = re.compile(r'\b(portrait|model|posing|pose|smiling|smile|beautiful|pretty|attractive|fashion|woman in|girl in|selfie|headshot|studio|face|faces|close up face|elderly|old man|old woman)\b', re.I)


OFFTONE = re.compile(r'\b(traditional|costume|calligraphy|ao dai|conical hat|non la|temple|pagoda|festival|ancient|vintage|antique|historical|kimono|hanbok)\b', re.I)


def _m_query(q, fallback):
    """a footage search that finds a moment (hands, objects, a place, an action) in today's city life, not a model
    posing for the camera nor a costume picture from another world"""
    q = ' '.join(OFFTONE.sub(' ', POSED.sub(' ', str(q or ''))).split())
    return q if len(q.split()) >= 2 else fallback


def _number(v):
    """a count-up value: 30, 2.5, "30%", "1.200" → number; None when it is not one"""
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)): return v
    m = re.fullmatch(r'\s*[^\d-]*(-?\d{1,3}(?:[.,]\d{3})+|-?\d+(?:[.,]\d+)?)\s*\D*\s*', str(v or ''))
    if not m: return None
    t = m.group(1)
    if re.fullmatch(r'-?\d{1,3}(?:[.,]\d{3})+', t): return int(re.sub(r'[.,]', '', t))
    f = float(t.replace(',', '.'))
    return int(f) if f.is_integer() else f


def series_rules(scenes, fp):
    """what makes the series read as made by a person: words on screen once (the fine captions), big text only where
    a concept is named or a study's number lands (at most 3 times), one picture world (shots + 3D metaphors), no
    posed stock portraits, no blurred or black-and-white collage, no loop back to the opening picture"""
    prev_q = 'city street morning'
    big = 0
    for i, s in enumerate(scenes):
        t = s['type']
        if t not in M_TYPES:   # cards, charts, slides and flow boxes become real footage of the same idea
            side = next((s[x].get('image') for x in ('a', 'before', 'b', 'after') if isinstance(s.get(x), dict) and isinstance(s[x].get('image'), dict)), None)
            q = (s.get('image') or {}).get('q') or (side or {}).get('q') or s.get('alt') or prev_q + ' hands close up'
            keep = {k: s[k] for k in ('say', 'sub', 'lead', 'trans', 'beat', 'fx') if k in s}
            s.clear(); s.update(keep, type='shot', bg=_img({'q': q}), cam=CAMS[i % len(CAMS)]); t = 'shot'
        if t == 'shot':
            for k in M_TEXT: s.pop(k, None)
            s['bg']['q'] = _m_query(s['bg'].get('q'), prev_q); prev_q = s['bg']['q']
            if s.get('cam') == 'fpv': s['cam'] = 'push'
        elif t == 'm_scene':
            if s.get('tag') or s.get('num'): s.pop('title', None)
            if s.get('title'):
                if big >= 1: s.pop('title')
                else: big += 1
            if s.get('tag') or s.get('num'): big += 1
            if big > 3: s.pop('tag', None); s.pop('num', None)
        elif t == 'big_number':
            big += 1
            v = _number(s.get('value'))
            if v is not None: s['value'] = v
            # no number to count up (missing, words, a year) left an empty black frame: real footage instead
            if big > 3 or v is None or (isinstance(v, int) and 1800 <= v <= 2100 and not s.get('suffix') and not s.get('prefix')):
                s.clear(); s.update({'type': 'shot', 'say': s.get('say', ''), 'sub': s.get('sub', ''), 'bg': _img({'q': prev_q + ' detail'}), 'cam': 'push'})
        s.pop('loop', None)
        f = s.get('fx') or {}
        f['overlay'] = [o for o in f.get('overlay', []) if o.get('kind') in M_OVER][:1]
        if f.get('effect') not in M_EFF: f.pop('effect', None)
        f = {k: v for k, v in f.items() if v}
        if f: s['fx'] = f
        else: s.pop('fx', None)
    return scenes


def _m_scene(s, say, extra=()):
    """a 3D metaphor scene made safe: a known prop (or this video's own one), known camera moves, cues that are really in the line"""
    if s.get('prop') not in M_PROPS and s.get('prop') not in extra: s['prop'] = 'stage'
    if not isinstance(s.get('o'), dict): s['o'] = {}
    if s['prop'] == 'stage' and s['o'].get('pose') not in M_POSES: s['o']['pose'] = 'think'
    for k in ('in', 'out', 'core', 'baseLabel', 'offLabel', 'save', 'spend'):
        v = s['o'].get(k)
        if isinstance(v, dict): v = v.get('text') or v.get('label') or v.get('vi') or ''
        if k in s['o']: s['o'][k] = ' '.join(str(v if not isinstance(v, (list, dict)) else '').split())[:24]
        if s['o'].get(k) == '': s['o'].pop(k)
    cams = [c for c in (s.get('cams') if isinstance(s.get('cams'), list) else [s['cam']] if isinstance(s.get('cam'), dict) else []) if isinstance(c, dict) and c.get('kind') in M_CAMS][:4]
    s.pop('cam', None)
    s['cams'] = cams or [{'kind': 'orbit'}]
    if isinstance(s.get('tag'), dict) and not (s['tag'].get('en') or s['tag'].get('vi')): s.pop('tag')
    if isinstance(s.get('num'), dict) and not isinstance(s['num'].get('value'), (int, float)): s.pop('num')
    low = say.lower()
    def drop_cues(o):
        if isinstance(o, dict):
            if isinstance(o.get('cue'), str) and o['cue'].lower() not in low: o.pop('cue')
            for v in o.values(): drop_cues(v)
        elif isinstance(o, list):
            for v in o: drop_cues(v)
    drop_cues(s)
    return s


def build(o, lines, fp, clips, meta=False, extra=()):
    """the director's answer → engine scenes, one per script line, in order; raises ValueError when unusable"""
    got = {}
    for s in o.get('scenes') or []:
        try: k = int(s.get('line'))
        except (TypeError, ValueError, AttributeError): continue
        if isinstance(s, dict) and s.get('type') == 'g_timeline':  # the flat timeline instead (no empty frames)
            s = dict(s, type='timeline', items=[{'when': str(i.get('year') or i.get('when') or ''), 'text': i.get('text', '')} for i in s.get('items') or [] if isinstance(i, dict)])
        if s.get('type') == 'm_scene' and not meta: continue
        if 0 <= k < len(lines) and k not in got and s.get('type') in FAMILY: got[k] = dict(s)
    if len(got) < len(lines) * .8: raise ValueError(f'thiếu cảnh cho {len(lines) - len(got)} câu')
    scenes, videos, qs, tone_i = [], 0, {}, 0
    for k, say in enumerate(lines):
        s = got.get(k) or {'type': 'shot', 'bg': {'q': (scenes[-1].get('bg') or {}).get('q', 'city aerial') if scenes else 'sunrise sky'}}
        s['say'] = say; s.pop('line', None); s['sub'] = _clean_sub(s.get('sub'), say)
        t = s['type']
        if t == 'big_number':   # a number to count up, or real footage (an empty number left a black frame)
            v = _number(s.get('value'))
            if v is None: s = {'type': 'shot', 'say': say, 'sub': s['sub'], 'bg': {'q': s.get('alt') or ((scenes[-1].get('bg') or {}).get('q', 'city street') if scenes else 'city street morning')}}; t = 'shot'
            else: s['value'] = v
        if t == 'm_scene': s = _m_scene(s, say, extra)
        for key in ('bg', 'image'):
            if key in s: s[key] = _img(s[key])
        for side in ('a', 'b', 'before', 'after'):
            if isinstance(s.get(side), dict): s[side]['image'] = _img(s[side].get('image'))
        if t == 'shot' and not s.get('bg'): raise ValueError(f'câu {k}: shot thiếu bg.q')
        if t in ('callouts', 'warning', 'c_photo') and not s.get('image'): raise ValueError(f'câu {k}: {t} thiếu image.q')
        for img in [s.get('bg'), s.get('image')] + [(s.get(x) if isinstance(s.get(x), dict) else {}).get('image') for x in ('a', 'b', 'before', 'after')]:
            if not img: continue
            n = qs.get(img['q'], 0); qs[img['q']] = n + 1
            if n: img['q'] = img['q'] + ' ' + ['close up', 'wide view', 'detail', 'aerial', 'at sunset'][n % 5]
            if img.get('video'):
                videos += 1
                if videos > clips: img.pop('video')
        if t == 'shot':
            if s.get('cam') not in CAMS: s['cam'] = CAMS[k % len(CAMS)]
        elif t != 'shot':
            s['tone'] = fp['tones'][tone_i % 3]; tone_i += 1
        if s.get('trans') not in TRANS: s.pop('trans', None)
        if s.get('beat') not in ('reward', 'turn', 'breath'): s.pop('beat', None)
        # J-cut: the next picture arrives before its words; L-cut: the picture stays a little after the words moved on
        s['lead'] = {'J': .55, 'L': .02}.get(str(s.pop('cut', '')).upper()[:1], .18)
        fx = s.get('fx') if isinstance(s.get('fx'), dict) else {}
        fx = {'camera': fx.get('camera') if fx.get('camera') in (SHOT_CAM if t == 'shot' else FX_CAM) else None, 'effect': fx.get('effect') if fx.get('effect') in FX_EFF else None,
              'speed': fx.get('speed') if fx.get('speed') in FX_SPEED and t == 'shot' and (s.get('bg') or {}).get('video') else None,
              'cue': fx.get('cue') if isinstance(fx.get('cue'), str) and fx['cue'].lower() in say.lower() else None,
              'overlay': [o for o in (fx.get('overlay') if isinstance(fx.get('overlay'), list) else [fx.get('overlay')] if isinstance(fx.get('overlay'), dict) else [])
                          if isinstance(o, dict) and o.get('kind') in FX_OVER][:2]}
        # an overlay's words must come from the line itself (effects point at the content, not decoration)
        def _fits(o):
            if o.get('kind') not in ('impact', 'keyword', 'stamp') or not o.get('text'): return True
            said = set(norm_words(say + ' ' + s['sub']))
            return bool(set(norm_words(str(o['text']))) & said) or o['kind'] == 'stamp'
        fx['overlay'] = [o for o in fx['overlay'] if _fits(o)]
        for o in fx['overlay']:
            if o.get('cue') and str(o['cue']).lower() not in say.lower(): o.pop('cue')
            for c in ('x', 'y'):
                try: o[c] = max(0.05, min(0.95, float(o[c])))
                except (KeyError, TypeError, ValueError): o.pop(c, None)
        fx = {k: v for k, v in fx.items() if v}
        if fx: s['fx'] = fx
        else: s.pop('fx', None)
        low = say.lower()
        for key in ('items', 'nodes', 'pins', 'tiles'):
            for it in s.get(key) or []:
                if isinstance(it, dict) and it.get('cue') and str(it['cue']).lower() not in low: it.pop('cue')
        scenes.append(s)
    if not any(s['type'] in FOOTAGE for s in scenes): raise ValueError('không có cảnh quay thật nào')
    return scenes


def ground(scenes, fp):
    """real footage carries the video: a board only where a board says it better — at most 1 scene in 4, at most
    2 infographics (each kind once), never two boards in a row. The rest become shots on the director's own back-up
    footage (`alt`), keeping the line's number or points floating over the picture."""
    n, r = len(scenes), random.Random(fp['seed'] + 3)
    def to_shot(i):
        s, prev = scenes[i], next((x['bg']['q'] for x in reversed(scenes[:i]) if x['type'] == 'shot' and x.get('bg')), 'city street people')
        q = str(s.get('alt') or '').strip() or prev + ' ' + r.choice(['close up', 'detail', 'wide view', 'at night', 'hands'])
        used = {(x.get('bg') or x.get('image') or {}).get('q') for x in scenes}
        while q in used: q += ' ' + r.choice(['close up', 'detail', 'wide view', 'aerial', 'at sunset'])
        sh = {k: s[k] for k in ('say', 'sub', 'lead', 'trans', 'beat') if k in s}
        sh.update(type='shot', bg=_img({'q': q}), cam=r.choice([c for c in CAMS if c != 'fpv']))
        if isinstance(s.get('value'), (int, float)):
            sh.update({k: s[k] for k in ('value', 'decimals', 'prefix', 'suffix', 'caption', 'label') if k in s})
        else:
            its = [{'text': str(it.get('text') or it.get('label') or it.get('title') or '')[:40], **({'cue': it['cue']} if it.get('cue') else {})}
                   for it in (s.get('items') or s.get('nodes') or s.get('tiles') or []) if isinstance(it, dict)]
            its = [it for it in its if it['text']][:3]
            if its: sh['items'] = its
            head = str(s.get('title') or s.get('text') or s.get('head') or '').replace('\n', ' ').strip()
            if head and not its and len(head.split()) <= 6: sh['title'] = [head]
        f = s.get('fx') or {}
        f = {k: v for k, v in f.items() if k in ('overlay', 'effect', 'cue') or (k == 'camera' and v in SHOT_CAM)}
        if f: sh['fx'] = f
        scenes[i] = sh
    board = lambda i: scenes[i]['type'] not in FOOTAGE and scenes[i]['type'] != 'm_scene'
    seen = set()
    for i in range(n):   # infographics: each kind once, two at most
        t = scenes[i]['type']
        if t.startswith('i_'):
            if t in seen or len(seen) >= 2: to_shot(i)
            else: seen.add(t)
    for i in range(1, n):   # never two boards in a row
        if board(i) and board(i - 1): to_shot(i)
    for i in range(2, n):   # three 3D scenes in a row: the third goes back to real footage
        if all(scenes[j]['type'] == 'm_scene' for j in (i - 2, i - 1, i)): to_shot(i)
    cap = max(1, n // 4)
    extra = [i for i in range(n) if board(i)]
    r.shuffle(extra)   # the plainest boards (no number, no data) go first
    extra.sort(key=lambda i: bool(scenes[i].get('value') or scenes[i].get('data') or scenes[i]['type'].startswith('i_') or scenes[i].get('beat') == 'turn'))
    for i in extra[:max(0, len(extra) - cap)]: to_shot(i)
    for s in scenes: s.pop('alt', None)
    return scenes


def variety(scenes, min_types, meta=False):
    """the director's rules, checked: problems in plain words (empty = fine)"""
    out, n = [], len(scenes)
    if meta:   # the series: half 3D metaphors, the rest real moments; few words on screen
        share = sum(s['type'] == 'm_scene' for s in scenes) / max(1, n)
        if not .35 <= share <= .6: out.append(f'cảnh 3D m_scene chiếm {share:.0%}, cần khoảng 45–55%')
        posed = [i + 1 for i, s in enumerate(scenes) if s['type'] == 'shot' and POSED.search(str((s.get('bg') or {}).get('q', '')))]
        if posed: out.append(f'cảnh {posed}: từ khoá cảnh quay là người mẫu tạo dáng; đổi sang khoảnh khắc thật (tay, đồ vật, hành động, nơi chốn)')
    types = [s['type'] for s in scenes]
    for i in range(1, n):
        if types[i] == types[i - 1] and types[i] not in ('shot', 'm_scene'): out.append(f'cảnh {i} và {i + 1} cùng kiểu {types[i]}: đổi một cảnh sang kiểu khác hợp ý câu')
    for t in (set() if meta else set(types) - FOOTAGE - {'m_scene'}):
        if types.count(t) > 1 and t.startswith('i_'): out.append(f'infographic {t} dùng {types.count(t)} lần: mỗi loại tối đa 1 lần')
        elif types.count(t) > max(2, .12 * n): out.append(f'kiểu {t} chiếm {types.count(t)}/{n} cảnh (đồ hoạ một kiểu tối đa 12%)')
    if not meta and len(set(types)) < min_types: out.append(f'chỉ dùng {len(set(types))} kiểu cảnh, cần ít nhất {min_types}')
    foot = sum(t in FOOTAGE or t == 'm_scene' for t in types) / max(1, n)
    if not meta and foot < .7: out.append(f'cảnh quay thật chỉ {foot:.0%}, cần ≥ 70%: bảng đồ hoạ chỉ khi câu thật sự cần (số liệu so sánh, cơ chế)')
    if sum(t.startswith('i_') for t in types) > 2: out.append('quá 2 infographic: chuyển phần dư sang cảnh quay thật có số/ghim nổi trên cảnh')
    tr = [s.get('trans') for s in scenes[1:]]
    if any(tr[i] and tr[i] == tr[i - 1] == tr[i - 2] for i in range(2, len(tr))): out.append('3 lần chuyển cảnh liền nhau cùng một kiểu')
    if len({t for t in tr if t}) < min(6, max(3, n // 5)): out.append(f'chỉ dùng {len({t for t in tr if t})} kiểu chuyển cảnh, cần đa dạng hơn (cut, whip, smash, iris, lightleak…)')
    fxc = [(s.get('fx') or {}).get('camera') for s in scenes]
    if any(fxc[i] and fxc[i] == fxc[i - 1] for i in range(1, n)): out.append('2 cảnh liền cùng một kỹ thuật máy quay giả (punchIn, snapZoom…)')
    with_fx = sum(bool(s.get('fx')) for s in scenes) / max(1, n)
    if not meta and with_fx < .5: out.append(f'chỉ {with_fx:.0%} cảnh có công thức dựng (fx): cần ≥ 60% cảnh có máy quay giả/đồ hoạ phủ/hiệu ứng')
    ov = [o['kind'] for s in scenes for o in (s.get('fx') or {}).get('overlay', [])]
    for k in set(ov):
        if ov.count(k) > max(2, n // 6): out.append(f'đồ hoạ phủ "{k}" lặp {ov.count(k)} lần')
    eff = [(s.get('fx') or {}).get('effect') for s in scenes]
    if any(eff[i] and eff[i] == eff[i - 1] for i in range(1, n)): out.append('2 cảnh liền cùng một hiệu ứng hình')
    cams = [s.get('cam') for s in scenes if s['type'] == 'shot']
    if any(cams[i] == cams[i - 1] == cams[i - 2] for i in range(2, len(cams))): out.append('3 cảnh quay liền cùng một chuyển động máy')
    return out


def _brief(scenes):
    """one line per scene for the judge: number · type · words · what is on screen"""
    def what(s):
        bits = [str(s.get(k)) for k in ('title', 'kicker', 'over', 'text', 'head', 'caption', 'value', 'label') if s.get(k)]
        bits += [str((s.get('bg') or s.get('image') or {}).get('q', ''))] if (s.get('bg') or s.get('image')) else []
        for k in ('items', 'nodes', 'tiles', 'pins'):
            bits += [str(it.get('text') or it.get('label') or it.get('title') or it) for it in (s.get(k) or [])[:4] if isinstance(it, dict)]
        f = s.get('fx') or {}
        bits += [f'[dựng: {f.get("camera") or "-"}/{",".join(o["kind"] for o in f.get("overlay", [])) or "-"}/{f.get("effect") or "-"}/{s.get("trans") or "-"}]']
        return '; '.join(b for b in bits if b and b != 'None')[:200]
    out, t = [], 0.0
    for i, s in enumerate(scenes):
        out.append(f'{i + 1} · {t:.0f}s · {s["type"]}{" · " + s["beat"] if s.get("beat") else ""} · "{s["say"]}" · {what(s)}'); t += max(1.2, S.words(s['say']) / 3.3)
    return '\n'.join(out)


M_GUIDE = """SERIES "ĐÒN BẨY TƯ DUY" — chỉ dùng 4 kiểu cảnh: `shot` (cảnh quay thật), `m_scene` (thế giới ẩn dụ 3D, KHOẢNG MỘT NỬA số câu: 45–55%), `big_number` (tối đa 1 lần, cho con số nghiên cứu đắt nhất), `question` (câu hỏi kết). KHÔNG dùng thẻ, biểu đồ, sơ đồ, compare, infographic.
CHỮ TRÊN HÌNH: phụ đề đã có sẵn, nên `shot` KHÔNG đặt title/items/pins/quote/label. Chữ lớn chỉ 2–3 lần cả video: thẻ tên khái niệm (`tag`), con số nghiên cứu (`num`/big_number).
CẢNH QUAY THẬT theo CẢM XÚC của câu, không theo nghĩa đen của từ: tìm KHOẢNH KHẮC có hành động (tay, đồ vật, nơi chốn, người đang làm việc gì đó, nhìn nghiêng/từ sau lưng), bối cảnh Việt Nam/châu Á khi hợp. KHÔNG cảnh rõ mặt người (bản quyền hình ảnh): chỉ tay, đồ vật, nơi chốn, người nhìn từ sau lưng hoặc ở xa; CẤM người mẫu tạo dáng, chân dung, close up mặt, "smiling woman", "portrait", "model", "elderly man". Ví dụ tốt: "hand scrolling shopping app at night", "motorbike traffic saigon rain", "receipt pile on desk", "salary envelope counting cash hands". Cả video giữ MỘT tông màu (không đen trắng xen ảnh ấm) và MỘT THẾ GIỚI: đời sống đô thị Việt Nam hiện đại của nhân vật (văn phòng, quán cà phê, căn hộ, xe máy, siêu thị, ví, hoá đơn, điện thoại). KHÔNG cổ trang, áo dài/nón lá trình diễn, thư pháp, lễ hội, đền chùa, cảnh quê hoài cổ — trừ khi câu nói đúng về điều đó.
- `m_scene` {{prop, o {{…}}, cams [{{kind, cue?, a0?, a1?}}], tag {{en, vi, cue}}?, title [l1, l2]?, num {{value, from?, decimals?, suffix?, caption?, cue?}}?, label?}}: một VẬT ẨN DỤ đang chuyển động trên đảo nổi, có nhân vật không mặt. Chọn prop theo CƠ CHẾ của ý, không theo từ khoá:
  leaky (xô thủng: tiền vào trên, rò ra đáy; o: in, out, rate) · stairs2 (2 cầu thang song song, vd thu nhập/chi tiêu; o: beats [{{cue}}], labels [a,b]) · meter (vọt lên rồi tụt về cũ; o: rise {{cue}}, fall {{cue}}, baseLabel) · cluster (vật chính kéo theo vật phụ; o: core, items [{{text,cue}}]) · split (dòng tiền rẽ vào hũ tiết kiệm; o: save, spend, frac) · jar (hũ tích luỹ dâng dần; o: from, to 0..1, fill {{cue}}, marks [{{v,text}}]) · stage (nhân vật một mình; o: pose idle|think|point|cheer|slump|walk|run).
- `cams`: cắt góc máy trong cảnh 2–4 giây một góc (orbit giới thiệu, push nhấn, pull mở rộng, rise, low kịch tính, top toàn cục, side); cảnh dài hơn 5 giây phải có ≥ 2 góc, góc sau có `cue`.
- `tag`: thẻ thuật ngữ song ngữ, CHỈ khi câu đặt tên khái niệm (≤ 3 thẻ cả video). Số liệu nghiên cứu: `num` trên m_scene (prop jar/meter) hoặc big_number.
- Không đặt 3 cảnh m_scene liền nhau; một prop dùng tối đa 3 lần với góc máy khác. Cảnh cuối: m_scene prop stage hoặc question với câu hỏi mời bình luận. Không hù doạ, không hình ảnh tiền bạc phô trương.
"""


def plan(inp, log=print):
    """the HBX plan for a job's input, made by the whole crew: content creator + scriptwriter (the same strategy,
    outline, writing, editor review, hook and length steps as hand-drawn videos), then director + cinematographer
    (one way of telling each line), checked against the variety rules and scored by an independent judge"""
    seconds = max(20, min(S.MAX_SECONDS, int(inp.get('seconds') or 60))); pace = inp.get('pace', 'normal')
    clips = max(2, min(6, seconds // 20))
    fp = fingerprint(inp.get('seed') or random.SystemRandom().randrange(1 << 30))
    if inp.get('format') == 'money':  # 'Đòn Bẩy Tư Duy': researched on the web, essay voice (money.py)
        from . import money
        sc = money.script(inp, seconds, pace, log); topic = inp.get('topic') or sc.get('title') or ''
    elif inp.get('mode') == 'script':
        sc = S.from_script(inp.get('script', ''), seconds, pace=pace, log=log); topic = sc.get('title') or ''
    else:
        topic = inp.get('topic', '')
        sc = S.from_topic(topic, seconds, inp.get('audience', ''), tone=inp.get('tone') or 'tự nhiên, hợp với chủ đề và người xem', notes=inp.get('notes', ''), pace=pace, log=log)
    lines = [' '.join(str(l['say']).split()) for l in sc['lines'] if str(l.get('say', '')).strip()]
    strategy = sc.get('strategy') or {}
    wps = S.wps() * S.speed(pace)
    fast = inp.get('format') == 'money' or isinstance(inp.get('series'), dict)
    lines = split_lines(merge_lines(lines, wps, 2.0, 3.6), wps) if fast else merge_lines(lines, wps)
    min_types = max(3, min(6, len(lines) // 5))
    sec_per_line = round(sum(S.words(l) for l in lines) / max(1, len(lines)) / wps, 1)
    best, feedback = None, ''
    # the series' own way of filming (Đòn Bẩy Tư Duy, or a user's series): mechanisms in 3D metaphors, everyday moments in real footage
    ser = inp.get('series') if isinstance(inp.get('series'), dict) else None
    meta = inp.get('format') == 'money' or bool(ser)
    series = M_GUIDE if meta else ''
    spec = code = None; extra = ()
    if ser:  # a new metaphor, its prop written and test-filmed before the director starts
        from . import series as SR
        spec, code = SR.prepare(ser, topic, sc.get('core_message') or strategy.get('core_message', ''), lines, log)
        series = series.replace('SERIES "ĐÒN BẨY TƯ DUY"', f'SERIES "{ser.get("name") or "của bạn"}"')
        if code: series += SR.guide(spec); extra = (spec['prop'],)
    for round_ in range(3):
        log('Đạo diễn phân cảnh…' if not round_ else f'Đạo diễn làm lại theo góp ý (lần {round_})…')
        o = ai.ask(S.system(), S.prompt('cine_direct', topic=topic, genre=strategy.get('genre') or 'chưa rõ', core=sc.get('core_message') or strategy.get('core_message', ''),
                                        lines='\n'.join(f'{i}. {l}' for i, l in enumerate(lines)), fingerprint=fp_text(fp), clips=clips, min_types=min_types, sec_per_line=sec_per_line, feedback=series + feedback),
                   0.85, check=lambda x: build(x, lines, fp, clips, meta, extra), log=log)
        scenes = ground(build(o, lines, fp, clips, meta, extra), fp)
        if meta: scenes = series_rules(scenes, fp)
        problems = variety(scenes, min_types, meta) + rhythm(scenes, wps)
        try:
            j = ai.ask(S.system(), S.prompt('cine_judge', topic=topic, scenes=_brief(scenes)), 0.2,
                       check=lambda x: isinstance(x.get('scores'), dict) or (_ for _ in ()).throw(ValueError('thiếu scores')), log=log)
            sc_ = {k: S._num(v) for k, v in j['scores'].items()}; avg = sum(sc_.values()) / max(1, len(sc_)); issues = [str(x) for x in j.get('issues') or []][:6]
        except Exception as e:  # noqa: BLE001 - no judge: the rules alone decide
            log(f'   giám khảo không trả lời ({e})'); sc_, avg, issues = {}, 7.0, []
        score = avg - .4 * len(problems)
        log(f'   giám khảo: {avg:.1f}/10' + (f' · {", ".join(f"{k} {v:.0f}" for k, v in sc_.items())}' if sc_ else '') + (f' · {len(problems)} lỗi đa dạng' if problems else ''))
        if best is None or score > best[0]: best = (score, o, scenes, sc_)
        if avg >= 8 and not problems: break
        feedback = 'GÓP Ý BẮT BUỘC SỬA từ lần trước:\n- ' + '\n- '.join(problems + issues)
    _, o, scenes, scores = best
    before = len(variety(scenes, min_types, meta) + rhythm(scenes, wps))
    scenes = structure(polish(scenes, fp, wps), sc['lines'], fp, wps, meta)
    if meta: scenes = series_rules(scenes, fp)
    if extra: scenes = SR.enforce(scenes, spec)
    left = variety(scenes, min_types, meta) + rhythm(scenes, wps)
    log(f'   tự sửa luật dựng: còn {len(left)}/{before} lỗi' + (f' ({"; ".join(left[:3])})' if left else ''))
    style = {**fp['style'], **{k: v for k, v in (o.get('style') or {}).items() if k in ('scheme', 'grade') and isinstance(v, str)}}
    if not fp['caps']: style['titleCase'] = 'none'
    shots = [i + 1 for i, s in enumerate(scenes) if s['type'] == 'shot'] or [1]
    c = o.get('cover') if isinstance(o.get('cover'), dict) else {}
    try: c['shot'] = int(c.get('shot'))
    except (TypeError, ValueError): c['shot'] = shots[0]
    if c['shot'] not in shots: c['shot'] = shots[0]
    c['hook'] = str(c.get('hook') or o.get('title') or lines[0])[:80]
    sb = {'theme': 'cine', 'brand': (inp.get('brand') or '').strip()[:40], 'style': style, 'cover': c,
          'pace': 'fast' if pace in ('fast', 'faster') else 'normal', 'subWords': 3}
    st = o.get('sticker')
    if isinstance(st, dict) and st.get('text'):
        try: sb['sticker'] = {'text': str(st['text'])[:40], 'line': int(st.get('line'))}
        except (TypeError, ValueError): pass
    theme = str(o.get('theme') or 'science').lower()
    hb = {'id': 'INK', 'title': o.get('title') or sc.get('title') or lines[0][:60], 'theme': theme if theme in THEMES else 'science',
          **({'mood': o['mood']} if o.get('mood') in MOODS else {}), 'storyboard': sb}
    types = [s['type'] for s in scenes]
    log(f'Phân cảnh điện ảnh: {len(scenes)} cảnh, {len(set(types))} kiểu ({", ".join(sorted(set(types)))}), {say_words(scenes)} chữ')
    out = {'format': 'cine', 'title': hb['title'], 'caption': o.get('caption', ''), 'hashtags': o.get('hashtags') or [], 'scenes': scenes, 'plan': hb,
           'fingerprint': fp['seed'], 'judge': scores, 'ai': [f'{p}/{m}' for p, m in ai.used]}
    if inp.get('format') == 'money':
        from . import money
        out = money.finish(out, sc, inp)
    if ser:
        out = SR.finish(out, spec, code, ser)
        out['script_table'] = SR.table(SR.visual_prompts(scenes, spec), wps)
    return out


def _plan_file(job_sb, work):
    p = json.loads(json.dumps(job_sb['plan'])); p['storyboard']['scenes'] = job_sb['scenes']
    p['narration'] = ' '.join(s['say'].strip() for s in job_sb['scenes'])
    path = os.path.join(work, 'plan.json'); json.dump(p, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return path


def _env(job_sb=None):
    env = dict(os.environ)
    if job_sb and job_sb.get('fingerprint'): env['HBX_SEED'] = str(job_sb['fingerprint'])  # this video's own picks among good footage
    if job_sb and job_sb.get('series') in ('money', 'series'): env['HBX_MODERN'] = '1'   # one modern city world: costume/heritage pictures go last
    env['PIXABAY_KEY'] = env.get('PIXABAY_API_KEY') or env.get('PIXABAY_KEY', '')  # from the site's admin page
    if not env['PIXABAY_KEY']: raise RuntimeError('Máy dựng chưa có khoá Pixabay (Quản trị → API & token → Pixabay).')
    return env


def _run(args, log, env):
    log('  $ ' + ' '.join(os.path.basename(str(a)) for a in args[:3]))
    p = subprocess.Popen([str(a) for a in args], cwd=HBX, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    tail = []
    for line in p.stdout:
        line = line.rstrip(); tail = (tail + [line])[-12:]
        if line.strip(): log('  ' + line[:200])
    if p.wait() == 3: raise RuntimeError('Giọng đọc quá ngắn so với yêu cầu của bộ dựng.')
    if p.returncode: raise RuntimeError('Bộ dựng điện ảnh lỗi: ' + ' / '.join(t for t in tail[-3:] if t.strip())[:280])


def preview(job_sb, out, log=print):
    """the engine's own preview: images chosen (their ids kept in the plan), a grid of shots and the cover. For the
    'Đòn Bẩy Tư Duy' series a director looks at that grid once and has the shots that look generated replaced."""
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env(job_sb)
    def run():
        pf = _plan_file(job_sb, work)
        _run([sys.executable, 'build.py', 'preview', '--plan', pf, '--work', os.path.join(work, 'w')], log, env)
        p = json.load(open(pf, encoding='utf-8')); job_sb['scenes'] = p['storyboard'].pop('scenes'); job_sb['plan']['storyboard'] = p['storyboard']
    run()
    if job_sb.get('series') in ('money', 'series') and _judge_preview(job_sb, os.path.join(work, 'w', 'preview.jpg'), log): run()
    from PIL import Image
    Image.open(os.path.join(work, 'w', 'preview.jpg')).save(os.path.join(out, 'overview.png'))
    shutil.copy(os.path.join(work, 'w', 'cover_preview.jpg'), os.path.join(out, 'cover.jpg'))
    return job_sb


def _judge_preview(job_sb, grid, log=print):
    """the director's look at the preview grid: posed stock models, off-topic or empty frames and clashing colours get
    a new footage search (the old picture is excluded). True when something was replaced."""
    scenes = job_sb['scenes']
    listing = '\n'.join(f'{i + 1} · {s["type"]} · "{s["say"][:90]}" · {(s.get("bg") or {}).get("q", "")}' for i, s in enumerate(scenes))
    try:
        j = ai.look(S.system(), S.prompt('look_judge', scenes=listing), grid,
                    check=lambda x: isinstance(x.get('fix'), list) or (_ for _ in ()).throw(ValueError('thiếu fix')), log=log)
    except Exception as e:  # noqa: BLE001 - no model could look: the rules already applied stand
        log(f'   đạo diễn chưa xem được bản xem trước ({e})'); return False
    swapped = 0
    for f in j['fix'][:8]:
        try: k = int(f.get('scene')) - 1
        except (TypeError, ValueError): continue
        if not 0 <= k < len(scenes) or scenes[k]['type'] != 'shot' or f.get('problem') not in ('portrait', 'offtopic', 'blank', 'clash'): continue
        q = _m_query(f.get('q'), '')
        if not q: continue
        bg = scenes[k].get('bg') or {}
        old = bg.get('pid')
        for key in ('src', 'pid', 'frames', 'credit', 'page'): bg.pop(key, None)
        bg['q'] = _footage_q(q); bg['avoid'] = [x for x in list(bg.get('avoid') or []) + ([old] if old else []) if x][-6:]
        scenes[k]['bg'] = bg; swapped += 1
    log(f'   đạo diễn chấm bản xem trước: {S._num(j.get("score")):.0f}/10 · đổi {swapped} cảnh quay' + (f' ({"; ".join(str(f.get("problem")) + " " + str(f.get("scene")) for f in j["fix"][:5])})' if j['fix'] else ''))
    job_sb['preview_judge'] = {'score': S._num(j.get('score')), 'fix': j['fix'][:8]}
    return swapped > 0


def _srt(words, path):
    """one cue per word from the voice's word times (the engine matches them to the text itself)"""
    f = lambda t: f'{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round(t % 1 * 1000)) % 1000:03d}'
    with open(path, 'w', encoding='utf-8') as fh:
        for i, w in enumerate(words):
            _, word, a, b = w
            fh.write(f'{i + 1}\n{f(a)} --> {f(max(b, a + 0.05))}\n{word}\n\n')


def footage(sbp):
    """the Pixabay photos and clips this video used ("123", "v456"), so other videos avoid them for a while"""
    ids = []
    def walk(o):
        if isinstance(o, dict):
            if o.get('pid'): ids.append(str(o['pid']))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    try: walk(json.load(open(sbp, encoding='utf-8')).get('scenes'))
    except (OSError, ValueError): pass
    return sorted(set(ids))


def sync_report(video, sbp, log=print):
    """listen to the finished video (Whisper) and compare when each word is heard with when its caption lights up:
    the honest measure of 'the words match the voice'. Returns {'median','p90','words'} in seconds, or None."""
    from .voice import whisper_words, norm
    import difflib, statistics
    try: heard = whisper_words(video)
    except Exception as e: log(f'  không đo được độ khớp ({e})'); return None  # noqa: BLE001
    if not heard: return None
    shown = [w for w in json.load(open(sbp, encoding='utf-8')).get('words', []) if w.get('w') not in ('|', '')]
    a = [norm(w['w'].replace('*', '')) for w in shown]; b = [norm(w) for w, _, _ in heard]
    diffs = []
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            if len(a[blk.a + k]) > 1: diffs.append(shown[blk.a + k]['t'] - heard[blk.b + k][1])
    if len(diffs) < 10: return None
    ad = sorted(abs(d) for d in diffs)
    r = {'median': round(statistics.median(ad), 3), 'p90': round(ad[int(len(ad) * .9)], 3), 'bias': round(statistics.median(diffs), 3), 'words': len(diffs)}
    log(f'  độ khớp chữ–giọng: lệch trung vị {r["median"]:.2f}s, 90% dưới {r["p90"]:.2f}s, xu hướng {r["bias"]:+.2f}s ({r["words"]} từ)')
    return r


def stretch(job_sb, seconds, now, log=print):
    """the voice came out too short for the chosen length: each scene's line keeps its words and gains a clause, so
    the pictures and the cues on them stay valid. True when the scenes were lengthened."""
    scenes = job_sb['scenes']; n = len(scenes)
    have = sum(S.words(s['say']) for s in scenes); more = round(have * (seconds / max(1.0, now) - 1))
    if more < 8 or n < 3: return False
    log(f'  lời đọc thiếu khoảng {more} chữ cho {seconds} giây: viết thêm vào từng cảnh…')
    def ok(o):
        if not isinstance(o.get('lines'), list) or len(o['lines']) != n: raise ValueError(f'cần đúng {n} dòng')
    try:
        o = ai.ask(S.system(), S.prompt('stretch', now=round(now), seconds=seconds, more=more, n=n,
                                         script='\n'.join(f'{i}. {s["say"]}' for i, s in enumerate(scenes))), 0.6, check=ok, log=log)
    except Exception as e:  # noqa: BLE001 - a shorter video is still a video
        log(f'   không viết thêm được ({e})'); return False
    grew = 0
    for i, (s, new) in enumerate(zip(scenes, o['lines'])):
        old, new = s['say'], ' '.join(str(new).split())
        # only a line that really starts with the old words grows (the picture and its cues stay right)
        if i in (0, n - 1) or len(new) <= len(old) + 3 or not new.startswith(old.rstrip('.?!… ')): continue
        extra = new[len(old.rstrip('.?!… ')):].strip(' ,.;')
        s['say'] = new; s['sub'] = _clean_sub((s.get('sub') or _sub(old)) + ' | ' + _sub(extra), new); grew += 1
    log(f'   đã viết thêm vào {grew}/{n} cảnh, {sum(S.words(s["say"]) for s in scenes) - have} chữ')
    return grew > 0


def render(job_sb, out, pace='normal', log=print, seconds=0):
    """voice + the HBX render; returns (seconds of video, voice provider, measured caption sync or None)"""
    from .voice import narrate, duration
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env(job_sb)
    lines = [s['say'] for s in job_sb['scenes']]
    os.environ['INK_VOICE_RATE'] = pace_rate(pace)
    log('Giọng đọc (một mạch, có mốc từng chữ)…')
    voice, timing, words, provider = narrate(lines, os.path.join(work, 'voice'), log=log)
    # the video lasts the time the person chose: first the reading speed is nudged (Microsoft freely, EverAI only
    # a little: its speed comes in steps of 0.1 and sounds rushed or dragged beyond ±12%), then, if the words are
    # still too few for the time, every scene's line is lengthened and read again
    if seconds and not 0.9 <= timing[-1][2] / seconds <= 1.12:
        was = int(pace_rate(pace).rstrip('%')); lo, hi = (-15, 50) if provider == 'microsoft' else (-12, 15)
        rate = round(max(lo, min(hi, ((1 + was / 100) * timing[-1][2] / seconds - 1) * 100)))
        if provider != 'microsoft': rate = round(rate / 10) * 10 if abs(rate - was) >= 5 else was
        if rate != was:
            log(f'  giọng dài {timing[-1][2]:.0f} giây, chọn {seconds}: đọc lại ở tốc độ {rate:+d}%')
            os.environ['INK_VOICE_RATE'] = f'{rate:+d}%'
            voice, timing, words, provider = narrate(lines, os.path.join(work, 'voice'), log=log)
    if seconds and timing[-1][2] < seconds * 0.88 and stretch(job_sb, seconds, timing[-1][2], log):
        lines = [s['say'] for s in job_sb['scenes']]
        voice, timing, words, provider = narrate(lines, os.path.join(work, 'voice'), log=log)
        log(f'  sau khi viết thêm: giọng dài {timing[-1][2]:.0f}/{seconds} giây')
    srt = os.path.join(work, 'voice.srt'); _srt(words, srt)
    st = job_sb['plan']['storyboard'].get('sticker')
    if isinstance(st, dict) and isinstance(st.get('line'), int) and 0 <= st['line'] < len(timing):
        t0 = max(0.5, timing[st['line']][1] - 4.0); job_sb['plan']['storyboard']['sticker'] = {'text': st['text'], 't0': round(t0, 2), 't1': round(t0 + 3.2, 2)}
    elif isinstance(st, dict) and 't0' not in st: job_sb['plan']['storyboard'].pop('sticker', None)
    pf = _plan_file(job_sb, work)
    log('Dựng video điện ảnh (lấy cảnh, nướng chuyển động máy, chụp khung, mã hoá)…')
    video, cover = os.path.join(out, 'video.mp4'), os.path.join(out, 'cover.jpg')
    _run([sys.executable, 'build.py', 'render', '--plan', pf, '--voice', voice, '--srt', srt, '--work', os.path.join(work, 'w'),
          '--out', video, '--cover', cover, '--min', '0'], log, env)
    sbp = os.path.join(work, 'w', 'sb.json')
    sync = sync_report(video, sbp, log)
    job_sb['footage'] = footage(sbp)
    return duration(video), provider, sync
