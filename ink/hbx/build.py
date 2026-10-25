#!/usr/bin/env python3
"""Một lệnh cho cả chuỗi dựng (chạy trong thư mục engine).

Pha A — xem trước khi chưa có giọng (ước lượng 20 ký tự/giây):
  python build.py preview --plan plan.json --work work/
    → lấy ảnh (ghi pid vào plan.json), xử lý sticker nếu format paper,
      xuất work/preview.jpg (ảnh ghép các khung) để Read soát ảnh / chữ / bố cục.

Pha B — dựng thật:
  python build.py render --plan plan.json --voice voice.mp3 [--srt voice.srt] --work work/ --out video.mp4 --cover cover.jpg
    → nhạc nền + khớp giọng (align) + ảnh + dựng + đính bìa. Thoát mã 3 nếu < 90 giây.
"""
import argparse, json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# PHONG CÁCH THEO CHỦ ĐỀ — plan.theme → mood. Mood quyết định CÙNG LÚC: màu chủ đạo, font + kiểu tiêu đề,
# kiểu chữ nhấn, hiệu ứng tiêu đề, bảng màu thẻ, và nhạc nền (make_music.py). Không chọn ngẫu nhiên.
# Ghi đè có chủ đích: plan.mood (vd tin AI nhưng nội dung là lừa đảo → 'alert').
MOOD = {'ai': 'tech', 'tech': 'tech', 'science': 'tech',
        'finance': 'finance', 'economy': 'finance', 'business': 'finance', 'crypto': 'finance',
        'security': 'alert', 'scam': 'alert', 'warning': 'alert',
        'tips': 'bright', 'howto': 'bright', 'review': 'bright',
        'life': 'calm', 'health': 'calm', 'society': 'calm', 'development': 'calm', 'environment': 'calm', 'education': 'calm'}
MOODS = ('tech', 'finance', 'alert', 'bright', 'calm')


def mood_of(plan):
    m = plan.get('mood') or MOOD.get(str(plan.get('theme', '')).lower())
    if m not in MOODS: sys.exit(f"LỖI: không suy ra được mood từ theme={plan.get('theme')!r} — ghi plan.mood ∈ {MOODS}")
    return m


def run(*a, **kw):
    print('$', ' '.join(map(str, a)), flush=True); return subprocess.run([str(x) for x in a], check=True, **kw)


def sb_from_plan(plan, cps=20.0):
    sb = json.loads(json.dumps(plan['storyboard']))
    for s in sb['scenes']:
        s.setdefault('dur', round(max(2.2, len(s['say']) / cps + .3), 2))
    return sb


def images(sbp, plan_p, plan):
    run(sys.executable, HERE / 'fetch_images.py', sbp)
    sb = json.loads(Path(sbp).read_text())
    if sb.get('theme') == 'paper': run(sys.executable, HERE / 'paper_prep.py', sbp); sb = json.loads(Path(sbp).read_text())
    if sb.get('theme') == 'cine': run(sys.executable, HERE / 'depth25.py', sbp); sb = json.loads(Path(sbp).read_text())   # lưới độ sâu để neo chữ
    # ghi pid + credit ngược vào plan để Pha B tải lại đúng ảnh
    def imgs(scenes):
        for s in scenes:
            for o in [s.get('image'), s.get('bg')] + [i.get('image') for i in s.get('items', []) if isinstance(i, dict)] + [(s.get(k) or {}).get('image') for k in ('a', 'b')]:
                yield o
    for a, b in zip(imgs(plan['storyboard']['scenes']), imgs(sb['scenes'])):
        if isinstance(a, dict) and isinstance(b, dict) and b.get('pid'):
            a['pid'] = b['pid']; a['credit'] = b.get('credit')
    Path(plan_p).write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    return sb


def sub_tones(sbp):
    """how bright the picture is right behind the captions, per scene ('light' | 'dark'): the captions pick dark or
    light letters so they always stand out (cine). Photos/clips are measured; graphic scenes follow their tone."""
    from PIL import Image, ImageStat
    sb = json.loads(Path(sbp).read_text()); scheme = (sb.get('style') or {}).get('scheme', 'dark')
    for s in sb['scenes']:
        bg = s.get('bg') if isinstance(s.get('bg'), dict) else None
        src = None
        if bg and isinstance(bg.get('frames'), dict): src = Path(sbp).parent / bg['frames']['dir'] / 'f0001.jpg'
        elif bg and bg.get('src') and not str(bg['src']).startswith(('http', 'data:')): src = Path(sbp).parent / str(bg['src']).replace('file://', '')
        if src and src.exists():
            im = Image.open(src).convert('L'); w, h = im.size
            cw = min(w, int(h * 9 / 16)); x0 = int((w - cw) * float((bg.get('focus') or {}).get('x', .5)))
            band = im.crop((x0, int(h * .44), x0 + cw, int(h * .62)))
            m = ImageStat.Stat(band).mean[0]
            s['subTone'] = 'light' if m > 168 else 'dark' if m < 105 else 'mid'   # mid: nền lưng chừng → nền mờ sau chữ
        elif s.get('type') != 'shot':
            t = s.get('tone', 'a')
            s['subTone'] = 'light' if t == 'c' or (scheme == 'light' and t == 'a') else 'dark'
    Path(sbp).write_text(json.dumps(sb, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['preview', 'render'])
    ap.add_argument('--plan', required=True); ap.add_argument('--work', default='work')
    ap.add_argument('--voice'); ap.add_argument('--srt'); ap.add_argument('--out'); ap.add_argument('--cover')
    ap.add_argument('--min', type=float, default=90); ap.add_argument('--workers', type=int, default=max(2, __import__('os').cpu_count() or 2))
    a = ap.parse_args()
    work = Path(a.work).resolve(); work.mkdir(parents=True, exist_ok=True)
    plan = json.loads(Path(a.plan).read_text())
    say = ' '.join(s['say'].strip() for s in plan['storyboard']['scenes'])
    if say != plan.get('narration', '').strip():
        sys.exit('LỖI: narration phải đúng bằng " ".join(scene.say)')
    sbp = work / 'sb.json'
    mood = mood_of(plan); plan['storyboard']['mood'] = mood
    Path(a.plan).write_text(json.dumps(plan, ensure_ascii=False, indent=1)); print('mood =', mood)

    if a.mode == 'preview':
        sb = sb_from_plan(plan); sbp.write_text(json.dumps(sb, ensure_ascii=False, indent=1))
        sb = images(sbp, a.plan, plan); sub_tones(sbp); sb = json.loads(sbp.read_text())
        ts, acc = [], 0.0
        for s in sb['scenes']: ts.append(round(acc + min(s['dur'] * .7, s['dur'] - .3), 2)); acc += s['dur']
        pv = work / 'pv'; run(sys.executable, HERE / 'render.py', sbp, pv, '--preview', ','.join(map(str, ts)))
        from PIL import Image
        fs = sorted(pv.glob('p_*.jpg')); W, H = 240, 427; cols = min(6, len(fs)); rows = (len(fs) + cols - 1) // cols
        im = Image.new('RGB', (W * cols, H * rows), (40, 40, 40))
        for i, f in enumerate(fs): im.paste(Image.open(f).resize((W, H)), ((i % cols) * W, (i // cols) * H))
        # ảnh bìa hook = khung 0 của video → đặt ĐẦU lưới xem trước để soát cùng các cú máy
        run(sys.executable, HERE / 'cover.py', sbp, work / 'cover_preview.jpg')
        cv = Image.open(work / 'cover_preview.jpg').resize((W * 2, int(H * 2)))
        full = Image.new('RGB', (im.width + cv.width, max(im.height, cv.height)), (40, 40, 40)); full.paste(cv, (0, 0)); full.paste(im, (cv.width, 0)); im = full
        im.save(work / 'preview.jpg', quality=88)
        print(json.dumps({'preview': str(work / 'preview.jpg'), 'cover': str(work / 'cover_preview.jpg'), 'est_seconds': round(acc, 1), 'scenes': len(ts)}))
        return

    if not (a.voice and a.out): sys.exit('render cần --voice và --out')
    vdur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.voice],
                                capture_output=True, text=True, check=True).stdout)
    if vdur + 1.6 < a.min: print(f'GIỌNG_NGẮN {vdur:.1f}s'); sys.exit(3)
    music = work / 'music.wav'
    run(sys.executable, HERE / 'make_music.py', '--duration', int(vdur + 4), '--mood', mood, *(['--bpm', plan['bpm']] if plan.get('bpm') else []),
        '--seed', ''.join(c for c in plan.get('id', '1') if c.isdigit())[-8:] or 1, '--out', music)
    args = [sys.executable, HERE / 'align.py', a.plan, a.voice] + ([a.srt] if a.srt else []) + [sbp, '--music', music]
    run(*args)
    images(sbp, a.plan, plan)
    if json.loads(Path(sbp).read_text()).get('theme') == 'cine': run(sys.executable, HERE / 'depth25.py', '--bake', sbp)   # nướng máy quay 2.5D/video
    sub_tones(sbp)
    run(sys.executable, HERE / 'render.py', sbp, a.out, '--workers', a.workers, *(['--cover', a.cover] if a.cover else []))


if __name__ == '__main__':
    main()
