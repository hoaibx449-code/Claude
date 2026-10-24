"""One command from an idea to a finished video:

  python -m ink.cli --topic "..." --seconds 60 --out out/
  python -m ink.cli --script-file my_script.txt --out out/

Writes script.json, storyboard.json, overview.png (every scene finished), video.mp4, cover.jpg, caption.txt
and run.log into --out. --until storyboard stops before the voice and render (to review the plan first)."""
import argparse, json, os, sys, time
from . import ai, script as S
from .preview import sheet
from .voice import synth_all
from .render import render
from .cover import make_cover


def main(argv=None):
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--topic'); src.add_argument('--script-file')
    ap.add_argument('--seconds', type=int, default=60); ap.add_argument('--audience', default=''); ap.add_argument('--goal', default='truyền cảm hứng và giúp người xem hành động')
    ap.add_argument('--tone', default='ấm áp, chân thành, truyền động lực'); ap.add_argument('--notes', default='')
    ap.add_argument('--voice', default=None); ap.add_argument('--speed', type=float, default=1.0); ap.add_argument('--music', default=None)
    ap.add_argument('--brand', default=''); ap.add_argument('--out', default='out'); ap.add_argument('--until', choices=['script', 'storyboard', 'video'], default='video')
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True); logf = open(os.path.join(a.out, 'run.log'), 'a', encoding='utf-8')
    def log(m):
        line = time.strftime('%H:%M:%S ') + m; print(line, flush=True); logf.write(line + '\n'); logf.flush()
    t0 = time.time()
    if a.topic:
        log(f'Chế độ: từ chủ đề — "{a.topic}" ({a.seconds} giây)')
        sc = S.from_topic(a.topic, a.seconds, a.audience, a.goal, a.tone, a.notes, log=log)
    else:
        log('Chế độ: từ kịch bản có sẵn')
        sc = S.from_script(open(a.script_file, encoding='utf-8').read(), min(S.MAX_SECONDS, a.seconds if a.seconds > 60 else S.MAX_SECONDS), log=log)
    json.dump(sc, open(os.path.join(a.out, 'script.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    log(f'Kịch bản: {len(sc["lines"])} câu, {sum(S.words(l["say"]) for l in sc["lines"])} chữ')
    if a.until == 'script': return
    sb = S.storyboard(sc, log=log)
    json.dump(sb, open(os.path.join(a.out, 'storyboard.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sheet([s['visual'] for s in sb['scenes']], os.path.join(a.out, 'overview.png'))
    make_cover(sb.get('cover') or {'lines': [sb['title']]}, os.path.join(a.out, 'cover.jpg'), a.brand)
    with open(os.path.join(a.out, 'caption.txt'), 'w', encoding='utf-8') as f:
        f.write((sb.get('caption') or '') + '\n\n' + ' '.join(sb.get('hashtags') or []) + '\n')
    log('Phân cảnh, ảnh bìa, caption: xong')
    if a.until == 'storyboard': return
    log('Giọng đọc EverAI…')
    audios = synth_all([s['say'] for s in sb['scenes']], os.path.join(a.out, 'voice'), a.voice, a.speed, log=log)
    log('Dựng video…')
    title = ' '.join((sb.get('cover') or {}).get('lines') or [sb.get('title', '')]).strip()
    total = render(sb['scenes'], audios, os.path.join(a.out, 'video.mp4'), title=title, music=a.music, log=log)
    log(f'Xong: video {total:.1f} giây, dựng mất {time.time() - t0:.0f} giây. AI đã dùng: {", ".join(f"{p}/{m}" for p, m in ai.used)}')


if __name__ == '__main__':
    try: main()
    except Exception as e:  # noqa: BLE001
        print('LỖI:', e, file=sys.stderr); raise
