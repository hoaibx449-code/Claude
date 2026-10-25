"""One command from an idea to a finished video:

  python -m ink.cli --topic "..." --seconds 60 --out out/
  python -m ink.cli --script-file my_script.txt --out out/
  python -m ink.cli --from out/ --pace fast --out out-fast/     (same storyboard, another pace: no AI call)

Writes script.json, storyboard.json, overview.png (every scene finished), video.mp4, cover.jpg, caption.txt
and run.log into --out. --until storyboard stops before the voice and render (to review the plan first).
Pace: slow | normal | fast | faster, or a factor such as 1.15."""
import argparse, json, os, sys, time
import numpy as np
from . import ai, script as S
from .preview import sheet
from .voice import narrate
from .music import write as write_music, MOODS
from .render import render, pace_rate
from .cover import make_cover, cover_frame, cover_parts
from .engine import render_full, prep, BG, W, H


def make_plan(out, topic=None, script_text=None, seconds=60, audience='', goal='mang lại giá trị thật cho người xem: hiểu ra, nhớ được hoặc làm được một điều',
              tone='ấm áp, chân thành, truyền động lực', notes='', pace='normal', brand='', log=print):
    """script + storyboard + cover + caption; returns the storyboard"""
    if topic:
        log(f'Chế độ: từ chủ đề — "{topic}" ({seconds} giây)')
        sc = S.from_topic(topic, seconds, audience, goal, tone, notes, pace=pace, log=log)
    else:
        log('Chế độ: từ kịch bản có sẵn')
        sc = S.from_script(script_text, min(S.MAX_SECONDS, seconds if seconds > 60 else S.MAX_SECONDS), pace=pace, log=log)
    json.dump(sc, open(os.path.join(out, 'script.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'Kịch bản: {len(sc["lines"])} câu, {sum(S.words(l["say"]) for l in sc["lines"])} chữ')
    sb = S.storyboard(sc, log=log)
    save_plan(sb, out, brand)
    log('Phân cảnh, ảnh bìa, caption: xong')
    return sb


def save_plan(sb, out, brand=''):
    json.dump(sb, open(os.path.join(out, 'storyboard.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sheet([s['visual'] for s in sb['scenes'][1:]], os.path.join(out, 'overview.png'), first=cover_frame(sb.get('cover') or {}))
    make_cover(sb.get('cover') or {'lines': [sb.get('title') or 'Video mới']}, os.path.join(out, 'cover.jpg'), brand)
    with open(os.path.join(out, 'caption.txt'), 'w', encoding='utf-8') as f:
        f.write((sb.get('caption') or '') + '\n\n' + ' '.join(sb.get('hashtags') or []) + '\n')


def make_video(sb, out, pace='normal', music=None, mood='auto', music_volume=0.20, captions=True, log=print, browser=False):
    """voice, music and the hand-drawn render of a storyboard; returns the video length in seconds.
    browser=True: instead of the MP4, write draw.json + audio.aac for the user's browser to draw (export.py)"""
    os.environ['INK_VOICE_RATE'] = pace_rate(pace)
    log(f'Giọng đọc (một mạch, có mốc từng chữ), nhịp {pace}…')
    voice, timing, words, provider = narrate([s['say'] for s in sb['scenes']], os.path.join(out, 'voice'), log=log)
    json.dump({'provider': provider, 'pace': pace, 'timing': timing, 'words': words}, open(os.path.join(out, 'timing.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if not music and mood != 'none':
        m = sb.get('music') if mood == 'auto' else mood
        m = m if m in MOODS else 'motivating'
        music = write_music(timing[-1][2] + 1, os.path.join(out, 'voice', 'music.wav'), m); log(f'  nhạc nền: tự tạo, không khí "{m}"')
    if browser:
        from .export import export
        log('Xuất bản vẽ cho trình duyệt…')
        return export(sb, timing, words, voice, out, cover_parts(sb.get('cover') or {'lines': [sb.get('title') or 'Video mới']}),
                      music, music_volume, captions, pace), provider
    log('Dựng video…')
    base_ops, drawn = cover_parts(sb.get('cover') or {'lines': [sb.get('title') or 'Video mới']})
    base = np.empty((H, W, 3), np.uint8); base[:] = BG
    for op in base_ops: prep(op); render_full(base, op)
    return render(sb['scenes'], timing, voice, os.path.join(out, 'video.mp4'), words=words, cover=(base, drawn),
                  music=music, music_volume=music_volume, captions=captions, pace=pace, log=log), provider


def main(argv=None):
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--topic'); src.add_argument('--script-file'); src.add_argument('--from', dest='from_dir', help='thư mục đã có storyboard.json: dựng lại, không gọi AI')
    ap.add_argument('--seconds', type=int, default=60); ap.add_argument('--audience', default=''); ap.add_argument('--goal', default='truyền cảm hứng và giúp người xem hành động')
    ap.add_argument('--tone', default='ấm áp, chân thành, truyền động lực'); ap.add_argument('--notes', default='')
    ap.add_argument('--pace', default=os.environ.get('INK_PACE', 'normal'))
    ap.add_argument('--music', default=None, help='nhạc riêng (mp3/wav); bỏ trống = nhạc tự tạo theo không khí')
    ap.add_argument('--mood', default='auto', choices=['auto', 'none'] + list(MOODS)); ap.add_argument('--music-volume', type=float, default=0.20)
    ap.add_argument('--no-captions', action='store_true')
    ap.add_argument('--brand', default=''); ap.add_argument('--out', default='out'); ap.add_argument('--until', choices=['script', 'storyboard', 'video'], default='video')
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True); logf = open(os.path.join(a.out, 'run.log'), 'a', encoding='utf-8')
    def log(m):
        line = time.strftime('%H:%M:%S ') + m; print(line, flush=True); logf.write(line + '\n'); logf.flush()
    t0 = time.time()
    if a.from_dir:
        sb = json.load(open(os.path.join(a.from_dir, 'storyboard.json'), encoding='utf-8'))
        if os.path.abspath(a.from_dir) != os.path.abspath(a.out): save_plan(sb, a.out, a.brand)
        log(f'Dựng lại từ phân cảnh có sẵn ({len(sb["scenes"])} cảnh), nhịp {a.pace}')
    else:
        if a.until == 'script':
            sc = S.from_topic(a.topic, a.seconds, a.audience, a.goal, a.tone, a.notes, pace=a.pace, log=log) if a.topic else S.from_script(open(a.script_file, encoding='utf-8').read(), pace=a.pace, log=log)
            json.dump(sc, open(os.path.join(a.out, 'script.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1); return
        sb = make_plan(a.out, a.topic, open(a.script_file, encoding='utf-8').read() if a.script_file else None, a.seconds, a.audience, a.goal, a.tone, a.notes, a.pace, a.brand, log)
        if a.until == 'storyboard': return
    total, _ = make_video(sb, a.out, a.pace, a.music, a.mood, a.music_volume, not a.no_captions, log)
    log(f'Xong: video {total:.1f} giây, dựng mất {time.time() - t0:.0f} giây. AI đã dùng: {", ".join(f"{p}/{m}" for p, m in ai.used) or "không"}')


if __name__ == '__main__':
    try: main()
    except Exception as e:  # noqa: BLE001
        print('LỖI:', e, file=sys.stderr); raise
