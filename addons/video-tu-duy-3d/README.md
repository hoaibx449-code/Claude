# Video Tư Duy 3D ẩn dụ

Bộ sản xuất video TikTok/Reels/Shorts kiểu "Tư Duy 3D": một khái niệm (tiền bạc, năng suất, tâm lý hành vi, sự nghiệp) được minh hoạ bằng thế giới 3D ẩn dụ trong khung phim 16:9 đặt giữa màn 9:16, có hook cố định ở trên, phụ đề karaoke ở dưới.

Bộ này **độc lập** với bộ dựng Nét Vẽ (`src/engine`), Whiteboard và Illustrated. Nó chưa được nối vào trang web: đây là bản gốc từ máy (thư mục `May dung short`).

## Cấu trúc

```
SKILL.md        quy trình đầy đủ (chủ đề → rút thế giới → kịch bản → giọng → 3D → dựng)
brand.json      bộ nhận diện kênh (màu hook, phụ đề, font)
history.json    lịch sử chống trùng (thế giới/ẩn dụ đã dùng)
data/           matrix.json (ma trận thế giới), ban_list.json (vật bị cấm vì sáo mòn)
references/     ngữ pháp thể loại, ẩn dụ từ cơ chế, cấu trúc kịch bản, đòn tâm lý, bộ prompt P1–P8, schema storyboard
engine/         kit.js (hạ tầng three.js), render_scene.js (Playwright → film.mp4 16:9)
scripts/        world_roll.py (rút thăm có trí nhớ + giám khảo trùng), tts_everai.py, timeline.py, assemble.py (ghép 9:16)
examples/       demo_ghe_cho_noi: chỉ để xem cách gọi API, không dùng làm khuôn
docs/           hướng dẫn sử dụng, phân tích thể loại, hệ thống chống rập khuôn
```

## Chạy trên máy

Cần Node 20+, Python 3 + Pillow, FFmpeg, Playwright Chromium.

```bash
K=addons/video-tu-duy-3d
bash $K/engine/setup.sh
mkdir -p work && python3 $K/scripts/world_roll.py roll --topic "Lạm phát lối sống" --out work/world.json
# viết work/storyboard.json + work/scene.html theo SKILL.md
python3 $K/scripts/tts_everai.py --config everai.json --text work/narration.txt --outdir work/
python3 $K/scripts/timeline.py --storyboard work/storyboard.json --srt work/voice.srt --audio work/voice.mp3 --out work/timeline.json
node $K/engine/render_scene.js --dir work --out work/film.mp4
python3 $K/scripts/assemble.py --storyboard work/storyboard.json --timeline work/timeline.json \
  --film work/film.mp4 --voice work/voice.mp3 --out work/video.mp4
```

`everai.json` (khoá API EverAI, mã giọng) **không** nằm trong repo; giữ trên máy.
