"""Script and storyboard: two ways in, one way out.

  from a topic:   strategy -> outline -> narration -> editor review (one rewrite if it scores low)
  from a script:  keep the author's words, make them speakable, suggest (not apply) improvements
then both:        storyboard (a layout per line, from the drawing library), cover, caption, hashtags.
Every step is a separate AI call with its own prompt in prompts/, all in Vietnamese."""
import json, os, re
from . import ai
from .layouts import LAYOUTS
from .props import PROPS, POSE, FACES

HERE = os.path.dirname(os.path.abspath(__file__))
WPS = 2.8          # Vietnamese words (syllables) per second for the EverAI voice
MAX_SECONDS = 300  # five minutes


def prompt(name, **kw):
    return open(os.path.join(HERE, 'prompts', name + '.md'), encoding='utf-8').read().format(**kw)

SYSTEM = None
def system():
    global SYSTEM
    if SYSTEM is None: SYSTEM = prompt('common')
    return SYSTEM

def words(text): return len(re.findall(r'\w+', text))


def _lines_ok(obj):
    if not isinstance(obj.get('lines'), list) or not obj['lines']: raise ValueError('thiếu lines')
    for l in obj['lines']:
        if not isinstance(l, dict) or not str(l.get('say', '')).strip(): raise ValueError('câu đọc rỗng')


def from_topic(topic, seconds=60, audience='', goal='truyền cảm hứng', tone='ấm áp, chân thành, truyền động lực', notes='', log=print):
    seconds = max(20, min(MAX_SECONDS, int(seconds))); target = int(seconds * WPS)
    log('1/4 Chiến lược nội dung…')
    strategy = ai.ask(system(), prompt('strategy', topic=topic, audience=audience or 'chưa rõ, hãy tự xác định', goal=goal, tone=tone, seconds=seconds, notes=notes or 'không'), 0.8,
                      check=lambda o: o.get('core_message') or (_ for _ in ()).throw(ValueError('thiếu core_message')), log=log)
    log('2/4 Dàn ý…')
    outline = ai.ask(system(), prompt('outline', strategy=json.dumps(strategy, ensure_ascii=False), seconds=seconds, words=target), 0.7,
                     check=lambda o: o.get('beats') or (_ for _ in ()).throw(ValueError('thiếu beats')), log=log)
    feedback = ''; best = None
    for round_ in range(3):
        log('3/4 Viết lời đọc…' if round_ == 0 else f'3/4 Viết lại theo góp ý biên tập (lần {round_})…')
        script = ai.ask(system(), prompt('write', strategy=json.dumps(strategy, ensure_ascii=False), outline=json.dumps(outline, ensure_ascii=False), seconds=seconds, words=target, feedback=feedback), 0.75, check=_lines_ok, log=log)
        review, avg, low = _review(strategy, script, seconds, target, log)
        if best is None or avg > best[2]: best = (script, review, avg)
        if avg >= 8.5 and not low: break
        feedback = 'Biên tập viên yêu cầu sửa những điểm sau (bắt buộc khắc phục):\n- ' + '\n- '.join(review.get('issues', [])[:5])
    script, review, _ = best
    hook = _num(review.get('scores', {}).get('hook'))
    if hook < 8: script = fix_hook(strategy, script, review, log)
    script['strategy'] = strategy; script['outline'] = outline; script['review'] = review
    script.setdefault('core_message', strategy.get('core_message', '')); script.setdefault('title', strategy.get('title', ''))
    return script


def _num(v):
    try: return float(v)
    except (TypeError, ValueError): return 0.0


def _review(strategy, script, seconds, target, log):
    text = '\n'.join(l['say'] for l in script['lines'])
    log('4/4 Biên tập viên chấm kịch bản…')
    review = ai.ask(system(), prompt('review', core=strategy.get('core_message', ''), seconds=seconds, words=target, count=words(text), script=text), 0.2,
                    check=lambda o: o.get('scores') or (_ for _ in ()).throw(ValueError('thiếu scores')), log=log)
    sc = {k: _num(v) for k, v in review.get('scores', {}).items()}
    low = [k for k, v in sc.items() if v < 8]; avg = sum(sc.values()) / max(1, len(sc))
    log(f'   điểm trung bình {avg:.1f}, tiêu chí dưới 8: {", ".join(low) or "không"}')
    return review, avg, low


def fix_hook(strategy, script, review, log, tries=2):
    """the hook decides whether anyone watches: write six new ones of different kinds, have a strict viewer
    score them, keep the best; a video whose best hook still scores under 8 is not made"""
    lines = script['lines']; core = strategy.get('core_message', '') if strategy else script.get('core_message', '')
    issues = '; '.join(review.get('issues', [])[:3]) if review else 'hook chưa đủ mạnh'
    best = (0.0, None)
    for k in range(tries):
        log(f'   viết lại câu mở đầu (lần {k + 1})…')
        cand = ai.ask(system(), prompt('hook', core=core, script='\n'.join(f'{i}. {l["say"]}' for i, l in enumerate(lines)), issues=issues), 0.9,
                      check=lambda o: (isinstance(o.get('hooks'), list) and o['hooks']) or (_ for _ in ()).throw(ValueError('thiếu hooks')), log=log)
        hooks = [' '.join(str(h).split()) for h in cand['hooks'] if str(h).strip() and words(str(h)) <= 12]
        if not hooks: continue
        judge = ai.ask(system(), prompt('hook_judge', core=core, next=lines[1]['say'] if len(lines) > 1 else '', hooks='\n'.join(f'{i}. {h}' for i, h in enumerate(hooks))), 0.2,
                       check=lambda o: isinstance(o.get('scores'), list) or (_ for _ in ()).throw(ValueError('thiếu scores')), log=log)
        scores = [_num(x) for x in judge['scores']][:len(hooks)]
        if scores:
            i = max(range(len(scores)), key=lambda j: scores[j])
            log(f'   hook tốt nhất {scores[i]:.0f}/10: "{hooks[i]}"')
            if scores[i] > best[0]: best = (scores[i], hooks[i])
        if best[0] >= 8: break
    if best[0] < 8: raise RuntimeError(f'Câu mở đầu chưa đạt (tốt nhất {best[0]:.0f}/10). Không dựng video kém; hãy chạy lại hoặc làm rõ chủ đề.')
    lines[0] = dict(lines[0], say=best[1], emphasis=[]); script['hook_score'] = best[0]
    return script


def from_script(text, max_seconds=MAX_SECONDS, log=print):
    max_seconds = min(MAX_SECONDS, int(max_seconds))
    log('1/1 Chuẩn hóa kịch bản có sẵn (giữ nguyên ý và giọng văn)…')
    return ai.ask(system(), prompt('adapt', script=text.strip(), max_seconds=max_seconds, max_words=int(max_seconds * WPS)), 0.2, check=_lines_ok, log=log)


def _storyboard_ok(n):
    def check(o):
        if not isinstance(o.get('scenes'), list): raise ValueError('thiếu scenes')
        got = {int(s.get('line', -1)) for s in o['scenes'] if isinstance(s, dict) and isinstance(s.get('visual'), dict)}
        if len(got & set(range(n))) < n * 0.8: raise ValueError(f'phân cảnh thiếu câu ({len(got)}/{n})')
    return check


def storyboard(script, log=print):
    lines = script['lines']; n = len(lines)
    listing = '\n'.join(f'{i}. {l["say"]}' + (f'  [nhấn: {", ".join(l.get("emphasis") or [])}]' if l.get('emphasis') else '') + (f'  [chương mới: {l["chapter"]}]' if l.get('chapter') else '') for i, l in enumerate(lines))
    layouts = '\n'.join(f'- {k}: {v[1]}' for k, v in LAYOUTS.items())
    props = '; '.join(f'{k}: {v[1]}' for k, v in PROPS.items())
    log('Phân cảnh và ảnh bìa…')
    sb = ai.ask(system(), prompt('storyboard', core=script.get('core_message', ''), lines=listing, layouts=layouts, props=props,
                                 poses=', '.join(POSE), faces=', '.join(FACES)), 0.6, check=_storyboard_ok(n), log=log)
    by_line = {}
    for s in sb['scenes']:
        try: by_line.setdefault(int(s.get('line')), s)
        except (TypeError, ValueError): pass
    from .layouts import HERO_VARIANTS
    long_video = sum(words(l['say']) for l in lines) / WPS >= 120
    scenes = []; prev = None; hero_k = 0
    for i, l in enumerate(lines):
        s = by_line.get(i) or {'visual': {'layout': 'hero', 'prop': 'star', 'label': (l.get('emphasis') or [''])[0]}}
        v = clean_visual(s.get('visual') or {})
        if v.get('layout') == 'chapter' and (not long_video or not l.get('chapter')):  # chapters only in long videos
            v = {'layout': 'callout', 'prop': v.get('prop') or 'star', 'label': v.get('title') or (l.get('emphasis') or [''])[0]}
        if v.get('layout') in HERO_VARIANTS:  # rotate the single-object compositions so no two scenes look alike
            v['layout'] = HERO_VARIANTS[hero_k % len(HERO_VARIANTS)] if prev in HERO_VARIANTS or hero_k else v['layout']; hero_k += 1
            if v['layout'] == prev: v['layout'] = HERO_VARIANTS[(HERO_VARIANTS.index(prev) + 1) % len(HERO_VARIANTS)]
        prev = v.get('layout')
        scenes.append({'say': l['say'], 'visual': v, 'camera': s.get('camera') or {'type': 'push'}, 'transition': s.get('transition', 'slide')})
    return {'title': script.get('title', ''), 'core_message': script.get('core_message', ''), 'scenes': scenes,
            'cover': sb.get('cover') or {}, 'caption': sb.get('caption', ''), 'hashtags': sb.get('hashtags') or [], 'music': sb.get('music', 'motivating')}


def clean_visual(v):
    """props outside the library become the nearest known one by keyword, unknown layouts become hero"""
    def fix(x):
        if isinstance(x, dict): return {k: (fix_prop(val) if k == 'prop' else fix(val)) for k, val in x.items()}
        if isinstance(x, list): return [fix(i) for i in x]
        return x
    v = fix(dict(v))
    if v.get('layout') not in LAYOUTS: v['layout'] = 'hero'
    return v


def fix_prop(name):
    name = str(name or '').strip().lower()
    if name in PROPS: return name
    best, score = 'star', 0
    for k, (_, kw) in PROPS.items():
        s = sum(1 for w in re.findall(r'\w+', name) if w in kw)
        if s > score: best, score = k, s
    return best
