#!/usr/bin/env python3
"""Khớp giọng EverAI vào storyboard.

  python align.py plan.json voice.mp3 [voice.srt] storyboard.json [--music music.wav]

plan.json có `storyboard` = {theme, series, ..., scenes:[{type, ..., say (lời đọc), sub (chữ hiển thị, có | và *)}]}
và `narration` = " ".join(scene.say).  Kết quả storyboard.json:
  - dur từng cảnh = từ lúc giọng bắt đầu đọc text cảnh đó tới cảnh sau (cảnh cuối + đuôi nhạc)
  - words = [{w, t}] cho phụ đề karaoke (chữ hiển thị khớp với từ đọc tương ứng; "|" giữ nguyên làm điểm ngắt cụm)
  - mọi object có "cue": "cụm từ" → "at" = lúc giọng đọc tới cụm đó (tính từ đầu cảnh)
"""
import json, re, subprocess, sys, unicodedata
from difflib import SequenceMatcher

LEAD = .18     # hình đi trước giọng một chút
OUTRO = 1.6    # đuôi nhạc sau câu cuối


def norm(s): return re.sub(r'[^\w]', '', unicodedata.normalize('NFC', s.lower()))


def dur_of(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True, check=True).stdout)


def parse_srt(path):
    txt = open(path, encoding='utf-8-sig').read().replace('\r', '')
    cues = []
    for b in re.split(r'\n\s*\n', txt.strip()):
        ls = [l for l in b.split('\n') if l.strip()]
        tl = next((l for l in ls if '-->' in l), None)
        if not tl: continue
        def ts(x):
            h, m, s = x.strip().replace(',', '.').split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
        a, b2 = tl.split('-->'); t = ' '.join(ls[ls.index(tl) + 1:]).strip()
        if t: cues.append((ts(a), ts(b2), t))
    return cues


def char_timeline(narr, cues, total):
    """Trả về hàm time(i) cho vị trí ký tự i trong narration (đã chuẩn hoá)."""
    nn = norm(narr)
    if not cues:
        return lambda i: total * i / max(1, len(nn)), nn
    stimes, sstr = [], ''
    for a, b, t in cues:
        k = norm(t)
        for j in range(len(k)): stimes.append(a + (b - a) * j / max(1, len(k)))
        sstr += k
    sm = SequenceMatcher(None, nn, sstr, autojunk=False)
    mp = [None] * (len(nn) + 1)
    for blk in sm.get_matching_blocks():
        for d in range(blk.size): mp[blk.a + d] = stimes[blk.b + d]
    # nội suy chỗ không khớp
    known = [(i, t) for i, t in enumerate(mp) if t is not None]
    if not known: return lambda i: total * i / max(1, len(nn)), nn
    out = []
    ki = 0
    for i in range(len(nn) + 1):
        while ki + 1 < len(known) and known[ki + 1][0] <= i: ki += 1
        i0, t0 = known[ki]
        if i0 == i: out.append(t0); continue
        if ki + 1 < len(known):
            i1, t1 = known[ki + 1]; out.append(t0 + (t1 - t0) * (i - i0) / max(1, i1 - i0))
        else: out.append(t0 + (i - i0) / 20.0)
    return (lambda i: out[min(max(0, i), len(out) - 1)]), nn


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    music = sys.argv[sys.argv.index('--music') + 1] if '--music' in sys.argv else None
    if music in args: args.remove(music)
    plan_p, voice = args[0], args[1]
    srt = args[2] if len(args) == 4 else None
    out_p = args[-1]
    plan = json.load(open(plan_p, encoding='utf-8'))
    sb = plan['storyboard']; scenes = sb['scenes']
    texts = [s['say'].strip() for s in scenes]
    narr = ' '.join(texts)
    if norm(narr) != norm(plan.get('narration', narr)):
        print('CẢNH BÁO: narration khác " ".join(scene.say) — vẫn căn theo say từng cảnh', file=sys.stderr)
    vdur = dur_of(voice)
    T, nn = char_timeline(narr, parse_srt(srt) if srt else [], vdur)

    # vị trí ký tự chuẩn hoá bắt đầu mỗi cảnh, và thời điểm bắt đầu từng từ đọc
    pos, starts, spoken = 0, [], []
    for k, t in enumerate(texts):
        starts.append(T(pos)); ws = []
        for w in t.split():
            n = norm(w)
            ws.append((w, T(pos)) if n else (w, None)); pos += len(n)
        spoken.append(ws)
    starts[0] = 0.0
    # cảnh đổi trước lời một chút (LEAD); s.lead riêng của cảnh: J-cut (> 0,4: hình đến trước), L-cut (< 0: hình ở lại sau lời)
    bounds = [max(0, s - float(scenes[i].get('lead', LEAD))) if i else 0 for i, s in enumerate(starts)] + [vdur + OUTRO]
    for i in range(1, len(bounds) - 1): bounds[i] = min(max(bounds[i], bounds[i - 1] + .8), bounds[i + 1] - .8) if bounds[i + 1] - bounds[i - 1] > 1.6 else bounds[i]
    for i, s in enumerate(scenes): s['dur'] = round(bounds[i + 1] - bounds[i], 3)

    # phụ đề: khớp từ hiển thị ↔ từ đọc (số viết chữ vs số viết số sẽ được nội suy)
    words = []
    for k, s in enumerate(scenes):
        disp = (s.get('sub') or s['say']).replace('|', ' | ').split()
        sp = [(w, t) for w, t in spoken[k] if t is not None]
        a = [norm(w.replace('*', '')) for w in disp]; b = [norm(w) for w, _ in sp]
        tmap = [None] * len(disp)
        for blk in SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
            for d in range(blk.size):
                if a[blk.a + d]: tmap[blk.a + d] = sp[blk.b + d][1]
        # chữ không khớp được nội suy trong khoảng LỜI của câu (không theo ranh giới hình, vốn lệch khi J-cut)
        s0 = starts[k] + .02 if k else .05; s1 = (starts[k + 1] if k + 1 < len(starts) else vdur) - .1
        idx = [i for i, w in enumerate(disp) if w != '|']
        for j, i in enumerate(idx):  # nội suy các từ không khớp
            if tmap[i] is None:
                prev = next((tmap[x] for x in reversed(idx[:j]) if tmap[x] is not None), s0)
                nxt = next((tmap[x] for x in idx[j + 1:] if tmap[x] is not None), s1)
                tmap[i] = prev + (nxt - prev) * .5 if prev < nxt else prev
        # mỗi câu mở một cụm phụ đề mới: chữ cuối câu trước không dính vào cụm của câu sau
        if k and words and words[-1]['w'] != '|': words.append({'w': '|', 't': words[-1]['t']})
        for i, w in enumerate(disp):
            # đúng lúc giọng đọc (không kẹp vào ranh giới cảnh: với J-cut hình đổi trước lời, phụ đề vẫn theo lời)
            words.append({'w': w, 't': round(min(vdur, tmap[i] if tmap[i] is not None else s0), 3)})

    # cue → at (giây tính từ đầu cảnh)
    def walk(o, k):
        if isinstance(o, dict):
            if 'cue' in o:
                c = norm(o['cue']); txt = ''.join(norm(w) for w, _ in spoken[k])
                at = None; j = txt.find(c)
                if j >= 0:
                    acc = 0
                    for w, t in spoken[k]:
                        if acc >= j and t is not None: at = t; break
                        acc += len(norm(w))
                if at is not None: o['at'] = round(max(.25, at - bounds[k] - .1), 2)
                else: print(f'  cue không thấy trong lời đọc cảnh {k + 1}: {o["cue"]!r}', file=sys.stderr)
            for v in o.values(): walk(v, k)
        elif isinstance(o, list):
            for v in o: walk(v, k)
    for k, s in enumerate(scenes): walk(s, k)

    sb['words'] = words
    sb['seed'] = sb.get('seed') or sum(map(ord, plan.get('id', 'x'))) % 97
    sb['audio'] = {**sb.get('audio', {}), 'voice': voice, **({'music': music} if music else {})}
    json.dump(sb, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'voice_s': round(vdur, 1), 'video_s': round(bounds[-1], 1), 'scenes': [s['dur'] for s in scenes]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
