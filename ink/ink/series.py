"""Series: many videos on one topic, each with its own new 3D metaphor that moves for real.

  invent:   the creative director reads the video's script and invents a metaphor that has never been used in the
            series (the series remembers every metaphor and prop it used) and is not a cliché
  write:    an AI (Claude when its key is set, else Gemini/OpenAI) writes the three.js code of that prop, in the shape
            meta3d.js expects, with the channel's shared kit so it keeps the same look
  validate: the prop is built and filmed at a few moments in the real engine (render.py --preview); a compile or run
            error, an empty frame or a prop that never moves is sent back with the error, twice at most; after that
            the video uses the built-in props instead
  look:     one fixed style for the whole series (3D minimalist, soft pastel, soft studio light) and a visual prompt
            in English for every scene: the style anchor + what is on screen"""
import json, os, re, subprocess, sys, tempfile
from . import ai, script as S

HERE = os.path.dirname(os.path.abspath(__file__))
HBX = os.path.join(os.path.dirname(HERE), 'hbx')
STYLE_ANCHOR = '3D minimalist animation style, soft pastel color palette, cinematic soft studio lighting, clean soft background'
CLICHES = ['hamster wheel', 'jenga tower', 'bird cage', 'treadmill', 'iceberg', 'domino', 'puzzle pieces', 'lightbulb', 'rocket', 'ladder', 'maze', 'chess', 'tightrope', 'snowball']
# the same soft studio world for every video of a series (the channel is recognised by it)
PASTEL = {'sky': ['#f4e9f1', '#dde8f6'], 'floor': '#f7f2ec', 'side': '#c9b6e4', 'rock': '#9c8fb8', 'accent': '#f6b8a6', 'accent2': '#9fd8cb',
          'cool': '#a9c8f0', 'char': '#fbf3e8', 'ink': '#3b3550', 'font': 'Be Vietnam Pro'}
NAME = re.compile(r'^[a-z][a-z0-9_]{2,23}$')
BUILTIN = {'leaky', 'stairs2', 'treadmill', 'meter', 'dominoes', 'cluster', 'split', 'jar', 'stage'}


def _spec_ok(o, used):
    if not NAME.match(str(o.get('prop') or '')) or o['prop'] in BUILTIN: raise ValueError('prop phải là tên mới dạng snake_case (a-z, 3-24 ký tự)')
    if not str(o.get('metaphor') or '').strip() or not str(o.get('mechanism') or '').strip(): raise ValueError('thiếu metaphor hoặc mechanism')
    low = (o['metaphor'] + ' ' + o['prop'].replace('_', ' ')).lower()
    for c in CLICHES:
        if c in low: raise ValueError(f'ẩn dụ sáo mòn: {c}')
    for u in used:
        if o['prop'] == u.get('prop') or str(u.get('metaphor', '')).lower().strip() == o['metaphor'].lower().strip(): raise ValueError(f'đã dùng trong series: {o["metaphor"]}')


def invent(series, topic, core, lines, log=print):
    """a metaphor the series has not used yet: {metaphor, prop, mechanism, params {name: meaning}, beats [..], subject}"""
    used = series.get('used') or []
    log(f'Series "{series.get("name")}": nghĩ ẩn dụ mới (đã dùng {len(used)})…')
    return ai.ask(S.system(), S.prompt('series_invent', series=series.get('name', ''), series_topic=series.get('topic', ''), topic=topic, core=core,
                                       lines='\n'.join(f'{i}. {l}' for i, l in enumerate(lines)),
                                       used='\n'.join(f'- {u.get("metaphor")} (prop {u.get("prop")})' for u in used[-60:]) or 'chưa có',
                                       cliches=', '.join(CLICHES), style=series.get('style') or 'không'),
                  0.95, check=lambda o: _spec_ok(o, used), log=log)


def _unwrap(code):
    """the body the engine wants, when the AI wrote the whole `function (THREE, K) {...}` around it"""
    m = re.match(r'\s*(?:(?:export\s+default|const\s+\w+\s*=)\s*)?(?:function\s*\w*\s*\(\s*THREE\s*,\s*K\s*\)|\(\s*THREE\s*,\s*K\s*\)\s*=>)\s*\{(.*)\}\s*;?\s*$', code, re.S)
    return m.group(1).strip() if m else code


def _code_ok(text):
    code, _ = ai.blocks(text); code = _unwrap(code)
    if 'return' not in code or 'W.sc.add' not in code: raise ValueError('mã phải trả về hàm (P, o, W) và thêm vật vào W.sc')
    for bad in ('fetch(', 'XMLHttpRequest', 'import(', 'document.cookie', 'localStorage', 'eval(', 'new Function', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Math.random', 'Date.now', 'performance.now'):
        if bad in code: raise ValueError(f'mã không được dùng {bad}')


def _sample(spec):
    """o for a test scene: the spec's own example, cues dropped (the test line has none of the words)"""
    o = spec.get('example') if isinstance(spec.get('example'), dict) else {}
    return json.loads(json.dumps(o).replace('"cue"', '"_cue"'))


def validate(name, code, spec, log=print, timeout=150):
    """films the prop at 3 moments in the real engine; None when it is fine, else what went wrong (for the AI to fix)"""
    sb = {'theme': 'cine', 'style': {}, 'world': PASTEL, 'props': {name: code},
          'scenes': [{'type': 'm_scene', 'prop': name, 'o': _sample(spec), 'cams': [{'kind': 'orbit'}], 'dur': 6, 'say': 'thử'}]}
    with tempfile.TemporaryDirectory(prefix='prop_') as d:
        p = os.path.join(d, 'sb.json'); json.dump(sb, open(p, 'w'), ensure_ascii=False)
        try:
            r = subprocess.run([sys.executable, os.path.join(HBX, 'render.py'), p, os.path.join(d, 'pv'), '--preview', '0.6,2.5,5'],
                               cwd=HBX, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return 'dựng thử quá lâu (vòng lặp nặng hoặc quá nhiều vật)'
        ef = os.path.join(d, 'pv', 'errors.json')
        if not os.path.exists(ef):  # the test machine itself could not run: not the prop's fault
            log(f'   không dựng thử được ({(r.stderr or r.stdout)[-160:].strip()}); mã vẫn có khung an toàn')
            return None
        errs = json.load(open(ef))
        if errs: return '; '.join(f'{e.get("step")}: {e.get("error")}' for e in errs[:3])
        try:
            import numpy as np
            from PIL import Image
            ims = [np.asarray(Image.open(os.path.join(d, 'pv', f)).convert('L'), dtype=np.float32) for f in sorted(os.listdir(os.path.join(d, 'pv'))) if f.endswith('.jpg')]
        except Exception as e:  # noqa: BLE001 - no image tools: the error check above is what we have
            log(f'   không đọc được ảnh thử ({e})'); return None
        h, w = ims[0].shape; mid = [im[h // 5: h * 4 // 5, w // 6: w * 5 // 6] for im in ims]
        if max(m.std() for m in mid) < 9: return 'khung hình gần như trống: vật quá nhỏ, nằm ngoài khung hoặc cùng màu nền (đặt vật quanh gốc toạ độ, cao 2–5 đơn vị, dùng màu P.*)'
        # an art director looks at the three frames: does it read as the metaphor, is it well made, does it move?
        sheet = os.path.join(d, 'sheet.jpg')
        frames = [Image.open(os.path.join(d, 'pv', f)).convert('RGB').resize((360, 640)) for f in sorted(os.listdir(os.path.join(d, 'pv'))) if f.endswith('.jpg')]
        im = Image.new('RGB', (360 * len(frames), 640)); [im.paste(f, (360 * i, 0)) for i, f in enumerate(frames)]; im.save(sheet, quality=85)
        try:
            j = ai.look(S.system(), S.prompt('prop_look', spec=json.dumps({k: spec.get(k) for k in ('metaphor', 'look', 'beats')}, ensure_ascii=False)), sheet,
                        check=lambda x: isinstance(x.get('score'), (int, float)) or (_ for _ in ()).throw(ValueError('thiếu score')), log=log)
        except Exception as e:  # noqa: BLE001 - no model could look: the render checks above stand
            log(f'   chưa xem được hình thử ({str(e)[:100]})'); return None
        log(f'   giám đốc hình ảnh chấm đạo cụ: {j["score"]}/10')
        if j['score'] < 6: return 'giám đốc hình ảnh chấm ' + str(j['score']) + '/10: ' + '; '.join(str(x) for x in (j.get('issues') or [])[:4])
        return None


def write(spec, log=print):
    """the prop's code, tested; None when no version passed (the video then uses the built-in props)"""
    name, feedback = spec['prop'], ''
    for round_ in range(3):
        log(f'   viết mã đạo cụ "{name}"' + (f' (sửa lần {round_})' if round_ else '') + '…')
        try:
            text = ai.code(S.prompt('prop_system'), S.prompt('prop_code', spec=json.dumps(spec, ensure_ascii=False, indent=1), feedback=feedback or 'không'), check=_code_ok, log=log)
        except RuntimeError as e:
            log(f'   không AI nào viết được mã ({str(e)[:160]})'); return None
        code, meta = ai.blocks(text); code = _unwrap(code)
        if isinstance(meta.get('example'), dict): spec['example'] = meta['example']
        if isinstance(meta.get('params'), dict): spec['params'] = meta['params']
        err = validate(name, code, spec, log)
        if not err:
            log(f'   đạo cụ "{name}" dựng thử đạt ({len(code)} ký tự mã)'); return code
        log(f'   dựng thử lỗi: {err[:200]}')
        feedback = f'Bản trước dựng thử bị lỗi, sửa tận gốc:\n{err}\n\nMã bản trước:\n```js\n{code[:6000]}\n```'
    return None


def guide(spec):
    """what the director is told about this video's own prop"""
    params = '; '.join(f'{k}: {v}' for k, v in (spec.get('params') or {}).items())
    beats = ' → '.join(str(b) for b in spec.get('beats') or [])
    return (f'\nĐẠO CỤ RIÊNG CỦA VIDEO NÀY (mới, chưa từng dùng trong series): prop `{spec["prop"]}` — {spec["metaphor"]}. Cơ chế: {spec["mechanism"]}.'
            f'\n  o: {params or "{}"}' + (f'\n  diễn tiến gợi ý: {beats}' if beats else '') +
            '\n  Video series KỂ BẰNG 3D: khoảng 2/3 số câu là m_scene dùng prop này (đạo cụ diễn tiếp câu chuyện qua từng cảnh), cảnh quay thật chỉ chen vào khoảnh khắc con người (mở đầu, cảm xúc), không 2 cảnh quay liền nhau. Dùng prop này cho mọi cảnh m_scene (mỗi lần một góc máy/đoạn diễn tiến khác, đặt `cue` là một từ có trong câu); phần còn lại dùng `stage`; quy tắc "một prop tối đa 3 lần" không áp dụng cho prop này. KHÔNG dùng các prop có sẵn khác (leaky, treadmill, dominoes...).'
            '\n  Mỗi cảnh thêm khoá `vp`: mô tả tiếng Anh ngắn những gì đang hiện trên hình (chủ thể + hành động + đạo cụ), không viết phong cách.\n')


CAMS = [[{'kind': 'orbit'}], [{'kind': 'push'}], [{'kind': 'low'}], [{'kind': 'side'}], [{'kind': 'rise'}], [{'kind': 'top'}], [{'kind': 'pull'}]]


def enforce(scenes, spec, footage=.34):
    """a series video is told by its own 3D prop; real footage only cuts in for a human moment (the opening, then at
    most one scene in three, never two in a row). The prop's story runs on across its scenes: each scene picks the
    story up where the last one left it (`pt0`), from a new camera angle, so it reads as one object changing, not the
    same clip replayed."""
    ex = spec.get('example') if isinstance(spec.get('example'), dict) else {}
    n = len(scenes); keep = max(1, int(n * footage))
    shots = [i for i, s in enumerate(scenes) if s['type'] == 'shot']
    # the footage kept: the opening shot, then the director's shots spaced out evenly
    kept, last = set(), -9
    if shots and shots[0] == 0: kept.add(0); last = 0
    for i in shots:
        if len(kept) >= keep: break
        if i - last >= 3: kept.add(i); last = i
    for i, sc in enumerate(scenes):
        if sc['type'] == 'shot' and i not in kept:
            keepk = {k: sc[k] for k in ('say', 'sub', 'lead', 'trans', 'beat') if k in sc}
            sc.clear(); sc.update(keepk, type='m_scene')
    m = [sc for sc in scenes if sc['type'] == 'm_scene']
    for k, sc in enumerate(m):
        sc['prop'], sc['o'] = spec['prop'], json.loads(json.dumps(ex))   # the tested options: the director's could break it
        sc['pt0'] = round(6.0 * k / max(1, len(m) - 1), 2)               # where in the prop's story this scene starts
        sc['cams'] = CAMS[k % len(CAMS)]
        for key in ('title', 'label'): sc.pop(key, None)
    return scenes


def visual_prompts(scenes, spec):
    """[Visual Prompt] for every scene: the fixed style anchor + the scene's own subject"""
    for s in scenes:
        if s['type'] == 'm_scene':
            subj = str(s.get('vp') or (spec or {}).get('subject') or 'a faceless figure on a floating island').strip()
        elif s['type'] == 'shot':
            subj = 'real footage: ' + str((s.get('bg') or {}).get('q') or '').strip()
        else:
            subj = str(s.get('vp') or s.get('caption') or s.get('title') or s['type'])
        s['vp'] = (subj if subj.startswith('real footage') else f'{STYLE_ANCHOR}, {subj}')[:400]
    return scenes


def table(scenes, wps):
    """the script table: [Scene X – time] [Voiceover] [Visual Prompt]"""
    out, t = [], 0.0
    for i, s in enumerate(scenes):
        d = max(1.2, S.words(s.get('say', '')) / max(.5, wps))
        out.append({'scene': i + 1, 'time': f'{int(t // 60)}:{int(t % 60):02d}–{int((t + d) // 60)}:{int((t + d) % 60):02d}', 'voiceover': s.get('say', ''), 'visual': s.get('vp', '')})
        t += d
    return out


def prepare(series, topic, core, lines, log=print):
    """(spec, code) for this video; (spec, None) when the code could not be made, (None, None) when nothing could"""
    try: spec = invent(series, topic, core, lines, log)
    except RuntimeError as e:
        log(f'   không nghĩ được ẩn dụ mới ({str(e)[:160]}); dùng đạo cụ có sẵn'); return None, None
    log(f'   ẩn dụ: {spec["metaphor"]} · prop {spec["prop"]}')
    return spec, write(spec, log)


def finish(out, spec, code, series):
    """the series' look and memory on the plan cine.py made"""
    st = out['plan']['storyboard']
    st['world'] = dict(PASTEL)
    st['style'] = {**st.get('style', {}), 'grade': 'bright'}
    if spec and code: st['props'] = {spec['prop']: code}
    out['series'] = 'series'
    # remembered by the series only when the prop really was on screen
    out['series_meta'] = {'id': series.get('id'), 'metaphor': spec['metaphor'] if code else '', 'prop': spec['prop'] if code else '',
                          'ok': bool(code), 'by': next((f'{p}/{m}' for p, m in reversed(ai.used) if p == 'anthropic'), '') or (ai.used[-1][0] if ai.used else '')}
    return out
