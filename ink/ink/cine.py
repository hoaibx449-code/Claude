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
          'checklist': 'list', 'c_list': 'list', 'g_cards': 'list', 'question': 'text', 'c_word': 'text', 'c_headline': 'text', 'outro': 'text'}
FOOTAGE = {'shot', 'callouts', 'compare', 'warning', 'c_photo'}

# ---------------------------------------------------------------- the video's own fingerprint
# picked at random for every video, so many people making the same topic still get different videos
PALETTES = [('#ff8a00', '#1e88e5', '#141008'), ('#ffcf3f', '#3fd0ff', '#141008'), ('#e8432e', '#ffd166', '#fff7ea'), ('#2ec4b6', '#ff9f1c', '#04201d'),
            ('#c6ff3d', '#7b61ff', '#101400'), ('#ff5d8f', '#4cc9f0', '#1a0610'), ('#f4d35e', '#0d3b66', '#1a1405'), ('#06d6a0', '#ef476f', '#032018'),
            ('#ffb703', '#219ebc', '#1a1100'), ('#e76f51', '#2a9d8f', '#fff4ec'), ('#a3e635', '#0ea5e9', '#0b1400'), ('#fb7185', '#facc15', '#1f0710'),
            ('#38bdf8', '#f97316', '#04121c'), ('#d4a373', '#588157', '#1b1209'), ('#e9c46a', '#e63946', '#1a1405'), ('#9b5de5', '#00f5d4', '#ffffff')]
FONTS = ['Barlow Condensed', 'Oswald', 'Space Grotesk', 'Playfair Display', 'Lora', 'Be Vietnam Pro']
GRADES = ['dawn', 'warm', 'cool', 'night', 'bright', 'earth', 'none']
VOICES = ['nhịp cắt nhanh, nhiều đồ hoạ số liệu xen cảnh thật', 'điện ảnh: nhiều cảnh quay rộng, chuyển cảnh mượt, đồ hoạ điểm xuyết',
          'tạp chí: thẻ, sơ đồ, ô lắp dần xen ảnh chi tiết', 'phóng sự: cảnh thật, ghim chú thích, so sánh trước/sau',
          'giải thích trực quan: dòng chảy cơ chế, trục thời gian, ví von bằng hình', 'kể chuyện cảm xúc: cảnh người và nơi chốn, chữ lớn ở bước ngoặt']


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


def _img(o):
    """an image slot {q, video?} for the engine (q cleaned), or None"""
    if not isinstance(o, dict): return None
    q = ' '.join(str(o.get('q') or '').split())[:100]
    return ({k: v for k, v in o.items() if k in ('video', 'focus', 'depth', 'vstart')} | {'q': q}) if q else None


def build(o, lines, fp, clips):
    """the director's answer → engine scenes, one per script line, in order; raises ValueError when unusable"""
    got = {}
    for s in o.get('scenes') or []:
        try: k = int(s.get('line'))
        except (TypeError, ValueError, AttributeError): continue
        if isinstance(s, dict) and s.get('type') == 'g_timeline':  # the flat timeline instead (no empty frames)
            s = dict(s, type='timeline', items=[{'when': str(i.get('year') or i.get('when') or ''), 'text': i.get('text', '')} for i in s.get('items') or [] if isinstance(i, dict)])
        if 0 <= k < len(lines) and k not in got and s.get('type') in FAMILY: got[k] = dict(s)
    if len(got) < len(lines) * .8: raise ValueError(f'thiếu cảnh cho {len(lines) - len(got)} câu')
    scenes, videos, qs, tone_i = [], 0, {}, 0
    for k, say in enumerate(lines):
        s = got.get(k) or {'type': 'shot', 'bg': {'q': (scenes[-1].get('bg') or {}).get('q', 'city aerial') if scenes else 'sunrise sky'}}
        s['say'] = say; s.pop('line', None); s['sub'] = _clean_sub(s.get('sub'), say)
        t = s['type']
        for key in ('bg', 'image'):
            if key in s: s[key] = _img(s[key])
        for side in ('a', 'b'):
            if isinstance(s.get(side), dict): s[side]['image'] = _img(s[side].get('image'))
        if t == 'shot' and not s.get('bg'): raise ValueError(f'câu {k}: shot thiếu bg.q')
        if t in ('callouts', 'warning', 'c_photo') and not s.get('image'): raise ValueError(f'câu {k}: {t} thiếu image.q')
        for img in [s.get('bg'), s.get('image')] + [(s.get(x) or {}).get('image') for x in ('a', 'b')]:
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
        fx = {'camera': fx.get('camera') if fx.get('camera') in FX_CAM else None, 'effect': fx.get('effect') if fx.get('effect') in FX_EFF else None,
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


def variety(scenes, min_types):
    """the director's rules, checked: problems in plain words (empty = fine)"""
    out, n = [], len(scenes)
    types = [s['type'] for s in scenes]
    for i in range(1, n):
        if types[i] == types[i - 1] and types[i] != 'shot': out.append(f'cảnh {i} và {i + 1} cùng kiểu {types[i]}: đổi một cảnh sang kiểu khác hợp ý câu')
    for i in range(2, n):
        if types[i] == types[i - 1] == types[i - 2] == 'shot': out.append(f'cảnh {i - 1}–{i + 1} liền 3 cảnh shot: đổi cảnh giữa sang đồ hoạ hợp ý câu')
    for t in set(types):
        if types.count(t) > max(2, .35 * n): out.append(f'kiểu {t} chiếm {types.count(t)}/{n} cảnh (tối đa 35%)')
    if len(set(types)) < min_types: out.append(f'chỉ dùng {len(set(types))} kiểu cảnh, cần ít nhất {min_types}')
    foot = sum(t in FOOTAGE for t in types) / max(1, n)
    if foot < .3: out.append(f'cảnh quay thật chỉ {foot:.0%}, cần 35–60% để video sống động')
    if foot > .7: out.append(f'cảnh quay thật tới {foot:.0%}: đổi vài câu có số liệu/liệt kê/cơ chế sang đồ hoạ')
    tr = [s.get('trans') for s in scenes[1:]]
    if any(tr[i] and tr[i] == tr[i - 1] == tr[i - 2] for i in range(2, len(tr))): out.append('3 lần chuyển cảnh liền nhau cùng một kiểu')
    if len({t for t in tr if t}) < min(6, max(3, n // 5)): out.append(f'chỉ dùng {len({t for t in tr if t})} kiểu chuyển cảnh, cần đa dạng hơn (cut, whip, smash, iris, lightleak…)')
    fxc = [(s.get('fx') or {}).get('camera') for s in scenes]
    if any(fxc[i] and fxc[i] == fxc[i - 1] for i in range(1, n)): out.append('2 cảnh liền cùng một kỹ thuật máy quay giả (punchIn, snapZoom…)')
    with_fx = sum(bool(s.get('fx')) for s in scenes) / max(1, n)
    if with_fx < .5: out.append(f'chỉ {with_fx:.0%} cảnh có công thức dựng (fx): cần ≥ 60% cảnh có máy quay giả/đồ hoạ phủ/hiệu ứng')
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


def plan(inp, log=print):
    """the HBX plan for a job's input, made by the whole crew: content creator + scriptwriter (the same strategy,
    outline, writing, editor review, hook and length steps as hand-drawn videos), then director + cinematographer
    (one way of telling each line), checked against the variety rules and scored by an independent judge"""
    seconds = max(20, min(S.MAX_SECONDS, int(inp.get('seconds') or 60))); pace = inp.get('pace', 'normal')
    clips = max(2, min(6, seconds // 20))
    fp = fingerprint(inp.get('seed') or random.SystemRandom().randrange(1 << 30))
    if inp.get('mode') == 'script':
        sc = S.from_script(inp.get('script', ''), seconds, pace=pace, log=log); topic = sc.get('title') or ''
    else:
        topic = inp.get('topic', '')
        sc = S.from_topic(topic, seconds, inp.get('audience', ''), tone=inp.get('tone') or 'tự nhiên, hợp với chủ đề và người xem', notes=inp.get('notes', ''), pace=pace, log=log)
    lines = [' '.join(str(l['say']).split()) for l in sc['lines'] if str(l.get('say', '')).strip()]
    strategy = sc.get('strategy') or {}
    min_types = max(4, min(9, len(lines) // 3))
    wps = S.wps() * S.speed(pace); sec_per_line = round(sum(S.words(l) for l in lines) / max(1, len(lines)) / wps, 1)
    best, feedback = None, ''
    for round_ in range(3):
        log('Đạo diễn phân cảnh…' if not round_ else f'Đạo diễn làm lại theo góp ý (lần {round_})…')
        o = ai.ask(S.system(), S.prompt('cine_direct', topic=topic, genre=strategy.get('genre') or 'chưa rõ', core=sc.get('core_message') or strategy.get('core_message', ''),
                                        lines='\n'.join(f'{i}. {l}' for i, l in enumerate(lines)), fingerprint=fp_text(fp), clips=clips, min_types=min_types, sec_per_line=sec_per_line, feedback=feedback),
                   0.85, check=lambda x: build(x, lines, fp, clips), log=log)
        scenes = build(o, lines, fp, clips); problems = variety(scenes, min_types) + rhythm(scenes, wps)
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
    style = {**fp['style'], **{k: v for k, v in (o.get('style') or {}).items() if k in ('scheme', 'grade') and isinstance(v, str)}}
    if not fp['caps']: style['titleCase'] = 'none'
    shots = [i + 1 for i, s in enumerate(scenes) if s['type'] == 'shot'] or [1]
    c = o.get('cover') if isinstance(o.get('cover'), dict) else {}
    try: c['shot'] = int(c.get('shot'))
    except (TypeError, ValueError): c['shot'] = shots[0]
    if c['shot'] not in shots: c['shot'] = shots[0]
    c['hook'] = str(c.get('hook') or o.get('title') or lines[0])[:80]
    sb = {'theme': 'cine', 'brand': (inp.get('brand') or '').strip()[:40] or str(o.get('title') or '')[:30].upper(), 'style': style, 'cover': c,
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
    return {'format': 'cine', 'title': hb['title'], 'caption': o.get('caption', ''), 'hashtags': o.get('hashtags') or [], 'scenes': scenes, 'plan': hb,
            'fingerprint': fp['seed'], 'judge': scores, 'ai': [f'{p}/{m}' for p, m in ai.used]}


def _plan_file(job_sb, work):
    p = json.loads(json.dumps(job_sb['plan'])); p['storyboard']['scenes'] = job_sb['scenes']
    p['narration'] = ' '.join(s['say'].strip() for s in job_sb['scenes'])
    path = os.path.join(work, 'plan.json'); json.dump(p, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return path


def _env(job_sb=None):
    env = dict(os.environ)
    if job_sb and job_sb.get('fingerprint'): env['HBX_SEED'] = str(job_sb['fingerprint'])  # this video's own picks among good footage
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
    """the engine's own preview: images chosen (their ids kept in the plan), a grid of shots and the cover"""
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env(job_sb)
    pf = _plan_file(job_sb, work)
    _run([sys.executable, 'build.py', 'preview', '--plan', pf, '--work', os.path.join(work, 'w')], log, env)
    p = json.load(open(pf, encoding='utf-8')); job_sb['scenes'] = p['storyboard'].pop('scenes'); job_sb['plan']['storyboard'] = p['storyboard']
    from PIL import Image
    Image.open(os.path.join(work, 'w', 'preview.jpg')).save(os.path.join(out, 'overview.png'))
    shutil.copy(os.path.join(work, 'w', 'cover_preview.jpg'), os.path.join(out, 'cover.jpg'))
    return job_sb


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


def render(job_sb, out, pace='normal', log=print, seconds=0):
    """voice + the HBX render; returns (seconds of video, voice provider, measured caption sync or None)"""
    from .voice import narrate, duration
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env(job_sb)
    lines = [s['say'] for s in job_sb['scenes']]
    os.environ['INK_VOICE_RATE'] = pace_rate(pace)
    log('Giọng đọc (một mạch, có mốc từng chữ)…')
    voice, timing, words, provider = narrate(lines, os.path.join(work, 'voice'), log=log)
    if seconds and provider == 'microsoft' and not 0.88 <= timing[-1][2] / seconds <= 1.12:
        was = int(pace_rate(pace).rstrip('%')); rate = round(max(-15, min(50, ((1 + was / 100) * timing[-1][2] / seconds - 1) * 100)))
        if rate != was:
            log(f'  giọng dài {timing[-1][2]:.0f} giây, chọn {seconds}: đọc lại ở tốc độ {rate:+d}%')
            os.environ['INK_VOICE_RATE'] = f'{rate:+d}%'
            voice, timing, words, provider = narrate(lines, os.path.join(work, 'voice'), log=log)
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
