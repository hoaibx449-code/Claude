"""The 'Đòn Bẩy Tư Duy' video type (personal finance, career, behaviour): one named concept per video, researched on
the web right now, told in an essay voice over real footage and 3D graphics, with fine karaoke captions.

  research: the AI searches the web (Gemini + Google Search, or OpenAI web search) and returns the concept, 2-4 real
            studies, a metaphor, everyday Vietnamese examples, one thing to do today; every name/year/number comes
            from the pages found, which are kept as the video's sources
  write:    the narration in one of four frames (A essay, B everyday maths, C a common advice turned over, D one
            concept one episode), scored by the editor and rewritten when weak
  look:     then the cinematic director (cine.py) films it; this module only sets the series' own look: brand line,
            fine captions in a colour that suits the video's mood, a world palette, the cover kicker"""
import json, random, re
from . import ai, script as S

FRAMES = {'A': 'A. Tiểu luận thức tỉnh', 'B': 'B. Phép tính đời thường', 'C': 'C. Bẻ một lời khuyên phổ biến', 'D': 'D. Một khái niệm – một tập'}
# colour of the words already read, and the world's palette, chosen by the video's mood (never the same look every time)
# the island and its character stay the same (the channel is recognised); sky, light and accents follow the mood
W = lambda sky, floor, side, rock, accent, accent2, cool: {'sky': sky, 'floor': floor, 'side': side, 'rock': rock, 'accent': accent, 'accent2': accent2, 'cool': cool, 'char': '#f3e6d0', 'ink': '#14222a', 'font': 'Be Vietnam Pro'}
MOODS = {
    'tiet_kiem_hy_vong': {'subColor': '#ffb38a', 'grade': 'dawn', 'world': W(['#f7a08a', '#ffd9b8'], '#f6ead8', '#d9785a', '#7a3b2e', '#ffb347', '#ff6f61', '#9ad1c9')},
    'no_canh_giac': {'subColor': '#ff6b6b', 'grade': 'night', 'world': W(['#1c1430', '#3b2550'], '#e9dfee', '#7b2d4a', '#3a1424', '#ff5d5d', '#ffb347', '#8f7bd6')},
    'su_nghiep': {'subColor': '#d4f25a', 'grade': 'cool', 'world': W(['#16376e', '#3f74c4'], '#eef2f8', '#2f5fa8', '#1c3560', '#d4f25a', '#ff8a3d', '#8fd3ff')},
    'tram_tinh': {'subColor': '#f5c04a', 'grade': 'earth', 'world': W(['#0e2a30', '#2d6467'], '#efe4d2', '#c4553b', '#6b3326', '#f2b134', '#e4572e', '#7cc4bb')},
    'tinh_thuc': {'subColor': '#9be7ff', 'grade': 'cool', 'world': W(['#0d1626', '#2b4a72'], '#e6edf5', '#3c6e9f', '#1b2c45', '#9be7ff', '#ffcf5a', '#7fe0c4')},
}
DISCLAIMER = 'Nội dung mang tính thông tin, không phải tư vấn tài chính. Ảnh/video minh hoạ.'


def _research_ok(o):
    if not str(o.get('concept_en') or o.get('concept_vi') or '').strip(): raise ValueError('thiếu tên khái niệm')
    if not isinstance(o.get('studies'), list) or not o['studies']: raise ValueError('thiếu nghiên cứu')


def research(topic, notes='', log=print):
    log('1/3 Tìm khái niệm và nghiên cứu trên web…')
    try:
        facts, sources = ai.research(S.system(), S.prompt('money_research', topic=topic, notes=notes or 'không'), check=_research_ok, log=log)
    except RuntimeError as e:
        # no web search available: the research step still runs, held to studies the model knows for sure
        log(f'   không tìm được trên web ({str(e)[:120]}); chỉ dùng nghiên cứu kinh điển, không thêm số mới')
        facts = ai.ask(S.system(), S.prompt('money_research', topic=topic, notes=(notes + '\n' if notes else '') +
                       'KHÔNG tìm được web lúc này: chỉ dùng nghiên cứu kinh điển bạn chắc chắn (tác giả, năm), bỏ mọi con số không chắc.'), 0.3, check=_research_ok, log=log)
        sources = []
    log(f'   khái niệm: {facts.get("concept_en")} – {facts.get("concept_vi")} · {len(facts.get("studies") or [])} nghiên cứu · {len(sources)} nguồn web')
    return facts, sources


def script(inp, seconds, pace, log=print):
    """the narration in the same shape the other types use ({title, core_message, lines, strategy}), plus what the
    series needs later (research, sources, hook, caption, mood)"""
    topic = inp.get('topic') or inp.get('script') or ''
    facts, sources = research(topic, inp.get('notes', ''), log)
    target = round(seconds * S.wps() * S.speed(pace))
    frame = FRAMES[random.SystemRandom().choice(list(FRAMES))] if seconds >= 75 else FRAMES['D']
    log(f'2/3 Viết lời đọc (khung {frame})…')
    feedback, best = '', None
    G = S.genre_text('giai_thich')
    for round_ in range(3):
        sc = ai.ask(S.system(), S.prompt('money_write', topic=topic, research=json.dumps(facts, ensure_ascii=False), frame=frame, seconds=seconds, words=target, feedback=feedback),
                    0.75, check=S._lines_ok, log=log)
        strategy = {'core_message': sc.get('core_message', ''), 'genre': G['genre'], 'title': sc.get('title', '')}
        review, avg, low = S._review(strategy, sc, seconds, target, log, G, topic)
        if best is None or avg > best[2]: best = (sc, review, avg)
        if avg >= 8 and not low: break
        feedback = 'Biên tập viên yêu cầu sửa (bắt buộc):\n- ' + '\n- '.join(review.get('issues', [])[:5])
    sc, review, _ = best
    sc = S.fit_length(sc, seconds, target, G['genre'], log)
    sc['strategy'] = {'core_message': sc.get('core_message', ''), 'genre': G['genre'], 'title': sc.get('title', '')}
    sc['review'] = review; sc['money'] = {'facts': facts, 'sources': sources, 'frame': frame}
    return sc


def _ascii(t):
    import unicodedata
    return unicodedata.normalize('NFKD', t.replace('đ', 'd').replace('Đ', 'D')).encode('ascii', 'ignore').decode()


def _hook(*cands):
    """the cover line: the first one that reads as a whole sentence (4–11 words, not a fragment)"""
    for c in cands:
        c = ' '.join(str(c or '').replace('|', ' ').split())
        n = len(c.split())
        if 4 <= n <= 11 and not c.endswith((',', '…', '...', ':', '-')): return S.clip(c, 80)
    return S.clip(next((c for c in cands if c), ''), 80)


def finish(sb, sc, inp):
    """the series' own look and words on the cinematic plan cine.py made"""
    m = sc.get('money') or {}
    facts, sources = m.get('facts') or {}, m.get('sources') or []
    mood = MOODS.get(str(sc.get('mood') or ''), random.SystemRandom().choice(list(MOODS.values())))
    st = sb['plan']['storyboard']
    ser = inp.get('series') if isinstance(inp.get('series'), dict) else {}
    name = str(ser.get('name') or '').strip() or 'Đòn Bẩy Tư Duy'   # a user's series carries its own name, never this one
    st['brand'] = S.clip(inp.get('brand') or name.upper(), 40)
    st['subStyle'], st['subWords'] = 'fine', 6
    st.pop('sticker', None)   # no extra words stuck on the picture: the captions carry the words
    st['style'] = {**st.get('style', {}), 'subColor': mood['subColor'], 'grade': mood['grade']}
    st['world'] = mood['world']
    cover = st.get('cover') or {}
    cover.update({'kicker': S.clip(name, 28), 'hook': _hook(sc.get('hook'), sb.get('title'), cover.get('hook')),
                  # the concept's name and a short Vietnamese gloss: whole words, a whole phrase (never "… khiến chi")
                  'detail': ' – '.join(x for x in (S.clip(facts.get('concept_en'), 28), S.clip(re.split(r'\s+(?:khiến|vì|do|mà|làm|nên|để)\s+', str(facts.get('concept_vi') or ''))[0], 34)) if x)})
    st['cover'] = cover
    sb['plan']['theme'] = 'finance' if facts.get('group') == 'tien_bac' else 'life'
    sb['plan']['series'] = name
    src = '; '.join(f'{s["title"] or s["url"]}' for s in sources[:4]) or '; '.join(f'{x.get("who")} ({x.get("year")})' for x in (facts.get('studies') or [])[:3])
    tags = ['#' + (re.sub(r'[^A-Za-z0-9]', '', _ascii(name.title())) or 'DonBayTuDuy')] + ['#' + str(h).lstrip('#') for h in (sc.get('hashtags') or [])][:3]
    sb['title'] = S.clip(sc.get('title') or sb['title'], 100)
    sb['caption'] = (str(sc.get('caption') or '').strip() + f'\n\nNguồn: {src}. {DISCLAIMER}').strip()
    sb['hashtags'] = tags
    sb['series'] = 'money'; sb['sources'] = sources; sb['concept'] = {k: facts.get(k) for k in ('concept_en', 'concept_vi', 'group', 'metaphor')}
    return sb
