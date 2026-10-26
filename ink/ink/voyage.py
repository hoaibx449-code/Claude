"""The 3D journey of an inspiring video ('Đòn Bẩy Tư Duy'): the camera leads the viewer through spaces that stand for
the steps of the story (an empty office, a corridor, a lit door, a road, stairs, a bridge, a city, a peak, the sky),
the light follows the feeling (cold → warm → bright → dawn), the cut between spaces is a camera move and a flash
where the feeling turns, numbers and key words pop in exactly when they are said.

  plan:      the director (AI) splits the lines into 4–7 spaces, picks the light, the words that pop, the climax
             and the closing line; a plan that does not hold together falls back to a classic arc
  scenes:    one v_scene per line; lines in the same space continue the same camera move (u ranges), so the cut
             between them is invisible; the first scene carries the title, the last the closing line and the source
  proposal:  what the person approves before the video is made (facts, what the source does not say, hook,
             message, closing line, the scene table, the comment question)
  deliver:   the clean voice-over script and a karaoke .ass subtitle file"""
import json, re
from . import ai, script as S

KINDS = ['office', 'corridor', 'door', 'road', 'stairs', 'bridge', 'city', 'peak', 'sky']
MOODS = ['cold', 'dim', 'warm', 'bright', 'dawn']
KIND_VI = {'office': 'văn phòng vắng', 'corridor': 'hành lang dài', 'door': 'cánh cửa hắt sáng', 'road': 'con đường', 'stairs': 'bậc thang đi lên',
           'bridge': 'cây cầu qua sương', 'city': 'phố cao tầng', 'peak': 'đỉnh núi lúc bình minh', 'sky': 'khoảng trời mở'}
MOOD_VI = {'cold': 'tối lạnh', 'dim': 'u ám', 'warm': 'ấm dần', 'bright': 'rực sáng', 'dawn': 'bình minh'}
CAMERA_VI = {'office': 'lướt dọc dãy bàn trống', 'corridor': 'trôi dọc hành lang về phía khe sáng', 'door': 'đẩy thẳng vào khe sáng', 'road': 'bay thấp dọc con đường',
             'stairs': 'leo theo bậc thang', 'bridge': 'lượn dọc cây cầu', 'city': 'bay giữa các toà nhà', 'peak': 'vòng lên đỉnh rồi lùi ra rộng', 'sky': 'bay lên khoảng trời'}
# the classic arc when the director's plan is not usable
ARC = [('office', 'cold', None), ('corridor', 'cold', 'dim'), ('door', 'dim', 'warm'), ('road', 'warm', None), ('stairs', 'warm', 'bright'), ('peak', 'dawn', None)]


def _check(o, n):
    sp = o.get('spaces')
    if not isinstance(sp, list) or not 2 <= len(sp) <= 8: raise ValueError('cần 2–8 không gian')
    for x in sp:
        if x.get('kind') not in KINDS or x.get('mood') not in MOODS: raise ValueError(f'không gian/ánh sáng không hợp lệ: {x.get("kind")}/{x.get("mood")}')
        try: int(x['from']); int(x['to'])
        except (KeyError, TypeError, ValueError): raise ValueError('thiếu from/to')


def _repair(o, n):
    """spaces made contiguous over every line: each starts where the last one ended, the last one reaches the end"""
    sp = sorted(o['spaces'], key=lambda x: int(x['from'])); out, nxt = [], 0
    for x in sp:
        b = min(n - 1, max(int(x['to']), nxt))
        if nxt > n - 1: break
        out.append({**x, 'from': nxt, 'to': b}); nxt = b + 1
    if out: out[-1]['to'] = n - 1
    o['spaces'] = [x for x in out if x['to'] >= x['from']]
    return o


def _fallback(n):
    k = max(2, min(len(ARC), n // 2)); arc = ARC[:k - 1] + [ARC[-1]]
    cuts = [round(i * n / k) for i in range(k + 1)]
    return {'spaces': [{'kind': kd, 'mood': m, **({'mood2': m2} if m2 else {}), 'from': cuts[i], 'to': cuts[i + 1] - 1} for i, (kd, m, m2) in enumerate(arc)],
            'pops': [], 'title': [], 'peak': max(0, n - 3), 'closing': max(0, n - 2), 'pause_before': [max(0, n - 2)]}


def plan(sc, lines, topic, log=print):
    n = len(lines)
    want = '4–5' if n < 14 else '5–7'
    try:
        o = ai.ask(S.system(), S.prompt('voyage_direct', topic=topic, message=sc.get('message') or sc.get('core_message', ''), closing=sc.get('closing', ''),
                                         lines='\n'.join(f'{i}. {l}' for i, l in enumerate(lines)), spaces=want, last=n - 1),
                   0.7, check=lambda x: _check(x, n), log=log)
    except RuntimeError as e:
        log(f'   đạo diễn hành trình chưa trả lời được ({str(e)[:120]}): dùng mạch cổ điển'); o = _fallback(n)
    o = _repair(o, n)
    if o['spaces'][-1]['kind'] not in ('peak', 'sky'): o['spaces'][-1].update(kind='peak', mood='dawn')
    log('   hành trình: ' + ' → '.join(f'{KIND_VI[x["kind"]]} ({MOOD_VI[x["mood"]]})' for x in o['spaces']))
    return o


def scenes(o, lines, wps, closing='', source='', prop=None):
    """one v_scene per line, in its space, continuing the same camera move"""
    out, n = [], len(lines)
    pops = {}
    for p in o.get('pops') or []:
        try: k = int(p.get('line'))
        except (TypeError, ValueError): continue
        if 0 <= k < n and str(p.get('text') or '').strip() and k not in pops:
            cue = str(p.get('cue') or '').strip()
            pops[k] = {'text': S.clip(p['text'], 28), 'kind': p.get('kind') if p.get('kind') in ('num', 'term', 'word') else 'word',
                       **({'cue': cue} if cue and cue.lower() in lines[k].lower() else {})}
    pauses = {int(x) for x in o.get('pause_before') or [] if str(x).lstrip('-').isdigit()}
    try: peak = int(o.get('peak'))
    except (TypeError, ValueError): peak = max(0, n - 3)
    try: close = int(o.get('closing'))
    except (TypeError, ValueError): close = max(0, n - 2)
    prev_mood = None
    for si, sp in enumerate(o['spaces']):
        a, b = int(sp['from']), int(sp['to'])
        w = [max(1, S.words(lines[k])) for k in range(a, b + 1)]; tot = sum(w); acc = 0
        for j, k in enumerate(range(a, b + 1)):
            u0, u1 = acc / tot, (acc + w[j]) / tot; acc += w[j]
            s = {'type': 'v_scene', 'say': lines[k], 'space': {k2: sp[k2] for k2 in ('kind', 'mood', 'mood2') if sp.get(k2)}, 'u': [round(u0, 3), round(u1, 3)]}
            if sp.get('mood2'):  # the light turns across the whole space, not again in every line
                m0, m1 = sp['mood'], sp['mood2']
                s['space'] = {'kind': sp['kind'], 'mood': m0, 'mood2': m1, 'q': [round(u0, 3), round(u1, 3)]}
            if j == 0 and si:  # a new space: a camera move and a flash where the feeling turns, a soft dissolve otherwise
                s['trans'] = 'flash' if sp['mood'] != prev_mood else 'dissolve'
            elif j: s['trans'] = 'cut'
            if k in pops: s['pops'] = [pops[k]]
            if k in pauses and k: s['pause'] = .7
            if k == peak: s['beat'] = 'reward'
            if prop and sp['kind'] in ('road', 'stairs', 'bridge', 'corridor') and j == 0: s['prop'] = prop
            out.append(s)
        prev_mood = sp.get('mood2') or sp['mood']
    if o.get('title'): out[0]['title'] = [S.clip(t, 34) for t in o['title'][:2] if str(t).strip()]
    if 0 <= close < n and closing:
        out[close]['closing'] = S.clip(closing, 80); out[close].pop('pops', None)
    if source: out[-1]['source'] = S.clip(source, 70)
    return out


def climax_share(scenes_, wps):
    """where the climax falls, as a share of the voice (the music peaks there)"""
    words = [S.words(s['say']) for s in scenes_]; tot = max(1, sum(words))
    k = next((i for i, s in enumerate(scenes_) if s.get('beat') == 'reward'), int(len(scenes_) * .7))
    return round(sum(words[:k]) / tot, 3)


def proposal(o, scenes_, sc, facts, wps):
    """what the person reads before the video is made"""
    t, rows = 0.0, []
    for sp in o['spaces']:
        a, b = int(sp['from']), int(sp['to'])
        d = sum(max(1.2, S.words(s['say']) / max(.5, wps)) for s in scenes_[a:b + 1])
        rows.append({'time': f'{int(t)}–{int(t + d)}s', 'space': KIND_VI[sp['kind']], 'camera': sp.get('camera') or CAMERA_VI[sp['kind']],
                     'light': MOOD_VI[sp['mood']] + (' → ' + MOOD_VI[sp['mood2']] if sp.get('mood2') else ''), 'why': sp.get('why') or '',
                     'content': ' '.join(s['say'] for s in scenes_[a:b + 1])[:160]})
        t += d
    fl = [f for f in (facts.get('facts') or []) if isinstance(f, str)] + [f'{x.get("who")} ({x.get("year")}): {x.get("finding") or x.get("did") or ""}'.strip()
                                                                            for x in (facts.get('studies') or []) if isinstance(x, dict)]
    return {'facts': fl[:8], 'not_said': [str(x) for x in (facts.get('not_said') or [])][:5], 'hook': scenes_[0]['say'] if scenes_ else '',
            'message': sc.get('message') or sc.get('core_message', ''), 'closing': sc.get('closing', ''), 'question': sc.get('question', ''), 'scenes': rows}


def script_text(scenes_):
    """the voice-over as the person pastes it into a voice tool: one paragraph per space, nothing but the words"""
    out, cur, last = [], [], None
    for s in scenes_:
        k = (s.get('space') or {}).get('kind')
        if cur and k != last: out.append(' '.join(cur)); cur = []
        cur.append(s['say'].strip()); last = k
    if cur: out.append(' '.join(cur))
    return '\n\n'.join(out) + '\n'


def ass(words, wide=False, per=7):
    """a karaoke subtitle file: each word turns yellow as it is read (\\k), lines of a few words"""
    W, H = (1920, 1080) if wide else (1080, 1920)
    f = lambda t: f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{int(t % 60):02d}.{int(round(t % 1 * 100)) % 100:02d}'
    head = (f'[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 2\n\n[V4+ Styles]\n'
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
            f'Style: Karaoke,Be Vietnam Pro,{58 if not wide else 52},&H003FD2FF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,80,80,{360 if not wide else 70},1\n\n'
            '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
    lines, cur = [], []
    for w in words:
        _, word, a, b = w
        if cur and (len(cur) >= per or cur[-1][0] != w[0] or a - cur[-1][3] > .6): lines.append(cur); cur = []
        cur.append(w)
    if cur: lines.append(cur)
    ev = []
    for ln in lines:
        start, end = ln[0][2], ln[-1][3]
        parts = []
        for i, (_, word, a, b) in enumerate(ln):
            nxt = ln[i + 1][2] if i + 1 < len(ln) else b
            parts.append(f'{{\\k{max(1, round((nxt - a) * 100))}}}{word}')
        ev.append(f'Dialogue: 0,{f(start)},{f(end + .15)},Karaoke,,0,0,0,,' + ' '.join(parts))
    return head + '\n'.join(ev) + '\n'
