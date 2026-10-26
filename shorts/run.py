#!/usr/bin/env python3
"""Dựng một cảnh đã được viết sẵn; không tự tạo chủ đề hoặc gọi AI sinh cảnh."""
import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
ENGINE = ROOT / 'renderer' / 'engine'
SCRIPTS = ROOT / 'renderer' / 'scripts'


def call(*args, capture=False):
    return subprocess.run([str(x) for x in args], check=True, text=True,
                          encoding='utf-8', capture_output=capture)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def font_path(name):
    result = call('fc-match', '-f', '%{file}', name, capture=True).stdout.strip()
    if not Path(result).is_file():
        raise ValueError(f'Không tìm thấy font: {name}')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default='demo_ghe_cho_noi')
    parser.add_argument('--voice', choices=['demo', 'everai'], default='demo')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', args.project):
        parser.error('Tên project chỉ gồm chữ không dấu, số, dấu _ hoặc -')
    example_root = (ROOT / 'renderer' / 'examples').resolve()
    project = (example_root / args.project).resolve()
    if not project.is_relative_to(example_root) or not project.is_dir():
        parser.error('Không tìm thấy project trong renderer/examples')
    for name in ['scene.html', 'storyboard.json', 'world.json']:
        if not (project / name).is_file():
            parser.error(f'Thiếu {name}')
    storyboard = read(project / 'storyboard.json')
    shots = storyboard.get('shots', [])
    if not 1 <= len(shots) <= 100 or any(not str(s.get('say', '')).strip() for s in shots):
        parser.error('Cần 1–100 cảnh và lời đọc say cho mỗi cảnh')
    if args.voice == 'everai' and not all(os.environ.get(k, '').strip() for k in ['EVERAI_API_KEY', 'EVERAI_VOICE_CODE']):
        parser.error('Thiếu secret EVERAI_API_KEY hoặc EVERAI_VOICE_CODE; chưa gọi API')
    for executable in ['node', 'ffmpeg', 'ffprobe', 'fc-match']:
        if not shutil.which(executable):
            parser.error(f'Thiếu công cụ {executable}')
    if not (ENGINE / 'node_modules' / 'playwright').exists():
        parser.error('Chưa npm ci trong renderer/engine')
    output = ROOT / 'out'
    if output.exists() and any(output.iterdir()):
        parser.error('Thư mục shorts/out đã có dữ liệu; chuyển kết quả cũ đi trước khi dựng lại')
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='shorts-') as td:
        work = Path(td)
        # Chỉ copy tệp của cảnh, không copy everai.json hoặc dữ liệu bên ngoài.
        for name in ['scene.html', 'storyboard.json', 'world.json', 'voice.mp3', 'voice.srt']:
            if (project / name).is_file():
                shutil.copy2(project / name, work / name)
        narration = '\n'.join(s['say'].strip() for s in shots)
        (work / 'narration.txt').write_text(narration, encoding='utf-8')
        brand = read(ROOT / 'renderer' / 'brand.json')
        brand.update(font_bold='DejaVu Sans', font_regular='DejaVu Sans',
                     font_bold_file=font_path('DejaVu Sans:style=Bold'),
                     font_regular_file=font_path('DejaVu Sans'),
                     font_italic_file=font_path('DejaVu Sans:style=Oblique'))
        write(work / 'brand.json', brand)
        if args.voice == 'everai':
            # Khóa chỉ tồn tại trong môi trường; không lưu vào cấu hình hay artifact.
            write(work / 'tts-config.json', {'voice_code': os.environ['EVERAI_VOICE_CODE']})
            call(sys.executable, SCRIPTS / 'tts_everai.py', '--config', work / 'tts-config.json',
                 '--text', work / 'narration.txt', '--outdir', work)
        elif not (work / 'voice.mp3').is_file():
            raise ValueError('Project chưa có voice.mp3 để dựng demo')
        timeline_cmd = [sys.executable, SCRIPTS / 'timeline.py', '--storyboard', work / 'storyboard.json',
                        '--audio', work / 'voice.mp3', '--out', work / 'timeline.json']
        if (work / 'voice.srt').is_file():
            timeline_cmd += ['--srt', work / 'voice.srt']
        call(*timeline_cmd)
        timeline = read(work / 'timeline.json')
        duration = timeline['duration']
        if not math.isfinite(duration) or not 1 <= duration <= 300:
            raise ValueError('Thời lượng phải từ 1 đến 300 giây')
        if any(s['end'] <= s['start'] for s in timeline['shots']):
            raise ValueError('Timeline có cảnh với thời gian không hợp lệ')
        call('node', ENGINE / 'render_scene.js', '--dir', work, '--out', work / 'film.mp4')
        video = output / 'video.mp4'
        call(sys.executable, SCRIPTS / 'assemble.py', '--storyboard', work / 'storyboard.json',
             '--timeline', work / 'timeline.json', '--film', work / 'film.mp4', '--voice', work / 'voice.mp3',
             '--brand', work / 'brand.json', '--out', video)
        probe = json.loads(call('ffprobe', '-v', 'error', '-show_format', '-show_streams',
                                '-of', 'json', video, capture=True).stdout)
        stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
        if (stream['width'], stream['height']) != (1080, 1920):
            raise ValueError('Sai kích thước đầu ra')
        if abs(float(probe['format']['duration']) - duration) > .3:
            raise ValueError('Thời lượng đầu ra lệch timeline')
        if not any(s['codec_type'] == 'audio' for s in probe['streams']):
            raise ValueError('Thiếu audio stream')
        # Giải mã toàn bộ, lỗi giải mã khiến job thất bại.
        call('ffmpeg', '-v', 'error', '-xerror', '-i', video, '-f', 'null', '-')
        from PIL import Image, ImageOps
        thumbnails = []
        for i, shot in enumerate(timeline['shots']):
            target = output / f'scene-{i + 1:02d}.jpg'
            t = (shot['start'] + shot['end']) / 2
            call('ffmpeg', '-y', '-v', 'error', '-ss', str(t), '-i', video, '-frames:v', '1', '-q:v', '2', target)
            with Image.open(target) as im:
                thumbnails.append(ImageOps.contain(im.convert('RGB'), (216, 384)))
        sheet = Image.new('RGB', (216 * min(5, len(thumbnails)), 384 * math.ceil(len(thumbnails) / 5)), '#111827')
        for i, im in enumerate(thumbnails):
            sheet.paste(im, ((i % 5) * 216, (i // 5) * 384))
        sheet.save(output / 'contact-sheet.jpg', quality=92)
        shutil.copy2(output / 'scene-01.jpg', output / 'cover.jpg')
        for name in ['storyboard.json', 'timeline.json', 'narration.txt', 'voice.srt']:
            if (work / name).is_file():
                shutil.copy2(work / name, output / name)
        (output / 'caption.txt').write_text(storyboard.get('caption', '') + '\n' + ' '.join(storyboard.get('hashtags', [])), encoding='utf-8')
        write(output / 'quality.json', {'project': args.project, 'voice': args.voice, 'duration': duration,
                                      'width': 1080, 'height': 1920, 'decoded_all_frames': True,
                                      'srt_match_ratio': timeline.get('match_ratio'),
                                      'notice': 'Demo dùng audio im lặng' if args.voice == 'demo' else 'Giọng EverAI'})
        report = (f'## Shorts 3D: {args.project}\n\n1080×1920 · {duration:.2f} giây · {len(shots)} cảnh. '
                  'Đã giải mã toàn bộ video để kiểm tra lỗi.\n\n'
                  + ('**Bản kiểm tra hình, audio demo im lặng.**\n\n' if args.voice == 'demo' else 'Giọng đọc: EverAI.\n\n')
                  + 'Tải MP4 và ảnh kiểm tra trong mục Artifacts. Căn từ phụ đề là ước lượng từ SRT, chưa phải forced alignment.\n')
        (output / 'report.md').write_text(report, encoding='utf-8')
        print(report, flush=True)


if __name__ == '__main__':
    main()
