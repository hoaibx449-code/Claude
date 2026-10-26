#!/usr/bin/env python3
"""Khớp lời đọc với giọng: storyboard.json + voice.srt (hoặc chỉ voice.mp3) -> timeline.json

  python timeline.py --storyboard storyboard.json --srt voice.srt --audio voice.mp3 --out timeline.json

timeline.json = {duration, shots:[{id,start,end}], words:[{w,start,end,shot}]}
- Có SRT: chia thời gian mỗi đoạn SRT cho các từ theo độ dài ký tự, rồi khớp chuỗi từ với lời đọc (difflib),
  nên lời đọc trong storyboard lệch nhẹ so với SRT vẫn chạy.
- Không có SRT: chia đều theo độ dài ký tự trên toàn bộ thời lượng audio (kém chính xác hơn).
"""
import argparse, difflib, json, re, subprocess, unicodedata
from pathlib import Path


def probe_dur(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    return "".join(c for c in w if unicodedata.category(c) != "Mn").replace("đ", "d").strip(".,!?;:\"'“”…()-–—")


def ts(s):
    h, m, rest = s.strip().replace(".", ",").split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


def parse_srt(text):
    segs = []
    for block in re.split(r"\n\s*\n", text.strip().replace("\r", "")):
        lines = [l for l in block.split("\n") if l.strip()]
        for i, l in enumerate(lines):
            if "-->" in l:
                a, b = l.split("-->")
                segs.append((ts(a), ts(b), " ".join(lines[i + 1:])))
                break
    return segs


def spread(words, start, end):
    total = sum(len(w) + 1 for w in words) or 1
    t, out = start, []
    for w in words:
        d = (end - start) * (len(w) + 1) / total
        out.append([w, round(t, 3), round(t + d, 3)])
        t += d
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--storyboard", required=True)
    p.add_argument("--srt")
    p.add_argument("--audio")
    p.add_argument("--out", default="timeline.json")
    a = p.parse_args()
    sb = json.loads(Path(a.storyboard).read_text(encoding="utf-8"))
    words, owner = [], []
    for si, sh in enumerate(sb["shots"]):
        for w in sh["say"].split():
            words.append(w)
            owner.append(si)
    dur = probe_dur(a.audio) if a.audio else None

    if a.srt and Path(a.srt).exists():
        srt_words = []
        for s, e, txt in parse_srt(Path(a.srt).read_text(encoding="utf-8")):
            srt_words += spread(txt.split(), s, e)
        sm = difflib.SequenceMatcher(None, [norm(w) for w in words], [norm(x[0]) for x in srt_words], autojunk=False)
        times = [None] * len(words)
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                times[blk.a + k] = srt_words[blk.b + k][1:]
        # nội suy các từ không khớp
        known = [i for i, t in enumerate(times) if t]
        if not known:
            raise SystemExit("SRT không khớp với lời đọc trong storyboard")
        for i in range(len(times)):
            if times[i] is None:
                prev = max([k for k in known if k < i], default=None)
                nxt = min([k for k in known if k > i], default=None)
                t0 = times[prev][1] if prev is not None else 0.0
                t1 = times[nxt][0] if nxt is not None else (dur or t0 + 0.3)
                gap_words = (nxt if nxt is not None else len(times)) - (prev if prev is not None else -1) - 1
                pos = i - (prev if prev is not None else -1)
                st = t0 + (t1 - t0) * (pos - 1) / max(1, gap_words)
                times[i] = [round(st, 3), round(st + (t1 - t0) / max(1, gap_words), 3)]
        matched = len(known) / len(words)
        if dur is None:
            dur = times[-1][1] + 0.6
    else:
        if dur is None:
            raise SystemExit("Cần --srt hoặc --audio")
        times = [x[1:] for x in spread(words, 0.15, dur - 0.4)]
        matched = 0.0

    shots = []
    for si, sh in enumerate(sb["shots"]):
        idx = [i for i, o in enumerate(owner) if o == si]
        shots.append({"id": sh["id"], "start": times[idx[0]][0] if idx else 0})
    shots[0]["start"] = 0.0
    for i, s in enumerate(shots):
        s["end"] = shots[i + 1]["start"] if i + 1 < len(shots) else round(dur, 3)
    out = {"duration": round(dur, 3), "match_ratio": round(matched, 3), "shots": shots,
           "words": [{"w": w, "start": t[0], "end": t[1], "shot": owner[i]} for i, (w, t) in enumerate(zip(words, times))]}
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"timeline: {len(shots)} shot, {len(words)} từ, {dur:.1f}s, khớp SRT {matched:.0%}")
    long = [s["id"] for s in shots if s["end"] - s["start"] > 6]
    if long:
        print("Cảnh báo: shot dài > 6s (nên tách câu hoặc thêm cắt góc):", ", ".join(long))


if __name__ == "__main__":
    main()
