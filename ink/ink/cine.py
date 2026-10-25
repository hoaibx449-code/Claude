"""The 'Điện ảnh' (cinematic) video type: real footage from Pixabay filling the frame, the camera as the viewer's
eye, words anchored in the space, CapCut-style captions. Made by the HBX engine (ink/hbx, Chromium + ffmpeg).

  plan:   strategy (same as hand-drawn) → AI writes the HBX storyboard → length fitted → checked and repaired →
          preview grid (overview.png) and cover from the engine
  render: the voice (same providers, word times → SRT) → hbx/build.py render → video.mp4 + cover.jpg

The job keeps {format:'cine', title, caption, hashtags, scenes, plan} where `plan` is the HBX plan without its
scenes (scenes sit at the top so the storyboard review page lists them like a hand-drawn one)."""
import json, os, re, shutil, subprocess, sys
from . import ai, script as S
from .genres import genre_of, genre_text
from .render import pace_rate

HBX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'hbx')
THEMES = {'ai', 'tech', 'science', 'finance', 'security', 'tips', 'life', 'health', 'society', 'education', 'environment', 'development', 'economy', 'business', 'crypto', 'scam', 'warning', 'howto', 'review'}
MOODS = ('tech', 'finance', 'alert', 'bright', 'calm')
CAMS = {'push', 'dolly', 'zoom', 'fpv', 'truckL', 'truckR', 'rise', 'orbit'}
TRANS = {'through', 'cut', 'dissolve'}
G3 = {'g_flow', 'g_blocks', 'g_timeline', 'g_cards'}


def say_words(scenes): return sum(S.words(s.get('say', '')) for s in scenes)


def _sub(say):
    """a caption split into short chunks when the AI left it out"""
    ws, out, cur = say.split(), [], ''
    for w in ws:
        if cur and len(cur) + 1 + len(w) > 30: out.append(cur); cur = w
        else: cur = (cur + ' ' + w).strip()
    if cur: out.append(cur)
    return ' | '.join(out)


def repair(o, clips):
    """make the AI's storyboard safe for the engine: known types, a background for every shot, cues that exist,
    at most `clips` video backgrounds, no background used more than twice; raises ValueError when unusable"""
    sb = o.get('storyboard')
    if not isinstance(sb, dict) or not isinstance(sb.get('scenes'), list) or len(sb['scenes']) < 3: raise ValueError('thiếu storyboard.scenes')
    scenes, used, videos, prev_q = [], {}, 0, None
    for s in sb['scenes']:
        if not isinstance(s, dict) or not str(s.get('say', '')).strip(): continue
        s = dict(s); s['say'] = ' '.join(str(s['say']).split())
        s['sub'] = ' '.join(str(s.get('sub') or '').split()) or _sub(s['say'])
        if '|' not in s['sub'] and len(s['sub']) > 38: s['sub'] = _sub(s['sub'].replace('*', ''))
        t = s.get('type') if s.get('type') in G3 else 'shot'; s['type'] = t
        if t == 'shot':
            bg = s.get('bg') if isinstance(s.get('bg'), dict) else {}
            q = ' '.join(str(bg.get('q') or s.get('q') or '').split())[:100]
            if not q: raise ValueError(f'cảnh "{s["say"][:30]}…" thiếu bg.q')
            if used.get(q, 0) >= 2 or q == prev_q:  # the same footage at most twice, never twice in a row
                q = next((v for v in (q + ' ' + x for x in ('close up', 'wide view', 'detail', 'aerial', 'at sunset')) if used.get(v, 0) < 1 and v != prev_q), q)
            used[q] = used.get(q, 0) + 1; prev_q = q
            bg = {k: v for k, v in bg.items() if k in ('q', 'video', 'focus', 'depth', 'vstart')}; bg['q'] = q
            if bg.get('video'):
                videos += 1
                if videos > clips: bg.pop('video')
            s['bg'] = bg
            if s.get('cam') not in CAMS: s['cam'] = 'push'
        else:
            prev_q = None
        if s.get('trans') not in TRANS: s.pop('trans', None)
        low = s['say'].lower()
        for k in ('items', 'nodes', 'pins'):
            for it in s.get(k) or []:
                if isinstance(it, dict) and it.get('cue') and str(it['cue']).lower() not in low: it.pop('cue')
        scenes.append(s)
    if len(scenes) < 3: raise ValueError('quá ít cảnh dùng được')
    if not any(s['type'] == 'shot' for s in scenes): raise ValueError('không có cảnh quay thật nào')
    sb['scenes'] = scenes
    theme = str(o.get('theme') or 'science').lower(); o['theme'] = theme if theme in THEMES else 'science'
    if o.get('mood') not in MOODS: o.pop('mood', None)  # the engine then picks the mood from the theme
    c = sb.get('cover') if isinstance(sb.get('cover'), dict) else {}
    shots = [i + 1 for i, s in enumerate(scenes) if s['type'] == 'shot']
    try: c['shot'] = int(c.get('shot'))
    except (TypeError, ValueError): c['shot'] = shots[0]
    if c['shot'] not in shots: c['shot'] = shots[0]
    c['hook'] = str(c.get('hook') or o.get('title') or scenes[0]['say'])[:80]
    sb['cover'] = c
    st = sb.get('sticker')
    if not (isinstance(st, dict) and st.get('text') and isinstance(st.get('t0'), (int, float)) and isinstance(st.get('t1'), (int, float)) and st['t1'] > st['t0']): sb.pop('sticker', None)
    if not isinstance(sb.get('style'), dict): sb.pop('style', None)
    return o


def plan(inp, log=print):
    """the HBX plan for a job's input (topic or the user's own script), kept as the job's storyboard"""
    seconds = max(20, min(S.MAX_SECONDS, int(inp.get('seconds') or 60))); pace = inp.get('pace', 'normal')
    target = round(seconds * S.wps() * S.speed(pace)); clips = max(2, min(6, seconds // 20))
    own = inp.get('mode') == 'script'
    if own:
        content = 'KỊCH BẢN CÓ SẴN CỦA NGƯỜI DÙNG — giữ nguyên ý, giọng văn và phần lớn câu chữ, chỉ chia cảnh và chỉnh cho dễ đọc thành tiếng:\n' + inp.get('script', '').strip()
        strategy, G = {}, genre_text('giai_thich')
    else:
        content = 'Chủ đề: ' + inp.get('topic', '').strip()
        log('1/4 Chiến lược nội dung…')
        strategy = ai.ask(S.system(), S.prompt('strategy', topic=inp.get('topic', ''), audience=inp.get('audience') or 'chưa rõ, hãy tự xác định', goal='mang lại giá trị thật cho người xem',
                                               tone=inp.get('tone') or 'tự nhiên, hợp với chủ đề', seconds=seconds, notes=inp.get('notes') or 'không'), 0.8,
                          check=lambda o: o.get('core_message') or (_ for _ in ()).throw(ValueError('thiếu core_message')), log=log)
        G = genre_text(genre_of(strategy)); log(f'   thể loại: {G["genre"]}')
    log('2/4 Viết lời đọc và phân cảnh điện ảnh…')
    kw = dict(content=content, strategy=json.dumps(strategy, ensure_ascii=False) if strategy else 'không có', seconds=seconds, words=target, clips=clips,
              audience=inp.get('audience') or 'người Việt dùng mạng xã hội', tone=inp.get('tone') or 'tò mò, gần gũi, rõ ràng', notes=inp.get('notes') or 'không',
              brand=(inp.get('brand') or '').strip()[:40], **G)
    o = ai.ask(S.system(), S.prompt('cine', feedback='', **kw), 0.75, check=lambda x: repair(x, clips), log=log)
    o = repair(o, clips)
    # the AI often writes a third too short: lengthen (or shorten) until the length fits the chosen time
    low, high = round(target * 0.9), round(target * 1.15)
    for k in range(2):
        n = say_words(o['storyboard']['scenes'])
        if low <= n <= high or own: break
        log(f'3/4 Lời đọc {n} chữ, cần khoảng {target}: ' + ('viết thêm…' if n < low else 'rút gọn…'))
        try:
            f = ai.ask(S.system(), S.prompt('cine_fit', count=n, words=target, seconds=seconds, low=low, high=high, how='kéo dài' if n < low else 'rút gọn',
                                            plan=json.dumps(o, ensure_ascii=False)), 0.6, check=lambda x: repair(x, clips), log=log)
            f = repair(f, clips); f['storyboard']['scenes'][0] = o['storyboard']['scenes'][0]
            if abs(say_words(f['storyboard']['scenes']) - target) < abs(n - target): o = f
        except Exception as e:  # noqa: BLE001 - a video slightly off length is still a video
            log(f'   không chỉnh được độ dài ({e})'); break
    sb = o['storyboard']; scenes = sb.pop('scenes')
    sb.update(theme='cine', pace='fast' if pace in ('fast', 'faster') else 'normal', subWords=3)
    sb.setdefault('brand', kw['brand'] or (o.get('title') or '')[:30].upper())
    hb = {'id': 'INK', 'title': o.get('title') or scenes[0]['say'][:60], 'theme': o['theme'], **({'mood': o['mood']} if o.get('mood') else {}), 'storyboard': sb}
    log(f'4/4 Phân cảnh điện ảnh: {len(scenes)} cảnh, {say_words(scenes)} chữ')
    return {'format': 'cine', 'title': hb['title'], 'caption': o.get('caption', ''), 'hashtags': o.get('hashtags') or [], 'scenes': scenes, 'plan': hb,
            'ai': [f'{p}/{m}' for p, m in ai.used]}


def _plan_file(job_sb, work):
    p = json.loads(json.dumps(job_sb['plan'])); p['storyboard']['scenes'] = job_sb['scenes']
    p['narration'] = ' '.join(s['say'].strip() for s in job_sb['scenes'])
    path = os.path.join(work, 'plan.json'); json.dump(p, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return path


def _env():
    env = dict(os.environ)
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
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env()
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


def render(job_sb, out, pace='normal', log=print, seconds=0):
    """voice + the HBX render; returns (seconds of video, voice provider)"""
    from .voice import narrate, duration
    work = os.path.join(out, 'cine'); os.makedirs(work, exist_ok=True); env = _env()
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
    pf = _plan_file(job_sb, work)
    log('Dựng video điện ảnh (lấy cảnh, nướng chuyển động máy, chụp khung, mã hoá)…')
    video, cover = os.path.join(out, 'video.mp4'), os.path.join(out, 'cover.jpg')
    _run([sys.executable, 'build.py', 'render', '--plan', pf, '--voice', voice, '--srt', srt, '--work', os.path.join(work, 'w'),
          '--out', video, '--cover', cover, '--min', '0'], log, env)
    return duration(video), provider
