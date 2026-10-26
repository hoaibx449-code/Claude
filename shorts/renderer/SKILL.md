---
name: video-tu-duy-3d
description: Sản xuất video TikTok/Reels/Shorts thể loại "Tư Duy 3D ẩn dụ" (Anti-Brainrot) — khái niệm tiền bạc, năng suất, tâm lý hành vi, AI & sự nghiệp minh hoạ bằng thế giới 3D ẩn dụ trong khung phim 16:9 đặt giữa màn 9:16, hook cố định, phụ đề karaoke song ngữ. Mỗi video có thế giới, vật ẩn dụ, màu, máy quay khác nhau nhờ rút thăm có trí nhớ + giám khảo trùng lặp. Dùng khi Hoài nhắc video tư duy 3D, video kiểu AI & Money, video anti-brainrot, video ẩn dụ 3D, hoặc muốn làm video khái niệm tài chính/tư duy dạng này, kể cả khi không nói tên skill.
---

# Video Tư Duy 3D ẩn dụ

Skill độc lập — **không** dùng/sửa các skill video khác (ai-facebook-video, ai-science-video, don-bay-tu-duy-video), không dùng sheet/repo của chúng.

## Nguyên tắc tối thượng (vì sao skill này tồn tại)
Dùng 1 video mẫu làm khuôn khiến AI chép cảnh. Ở đây:
1. **Không bao giờ** mở, xem, mô tả lại hay bắt chước video mẫu nào khi sản xuất. Chỉ dùng `references/ngu_phap_the_loai.md` (ngữ pháp bằng chữ).
2. Hình ảnh **suy ra từ cơ chế** của khái niệm (`references/an_du_co_che.md`), không từ danh từ hiển nhiên.
3. Thuộc tính hình ảnh **rút thăm có trí nhớ** bằng `scripts/world_roll.py` (né lịch sử). Chỉ được đổi 1 nhóm đã rút khi nó phản cảm xúc chủ đề — ghi lý do.
4. **Giám khảo trùng lặp** (`world_roll.py check` + prompt P8) phải ĐẠT trước khi dựng.
5. Không bịa nguồn/số liệu. Không hù doạ, không hứa làm giàu, không khuyên mua mã/sản phẩm.

## 0. Chuẩn bị bộ công cụ (đầu mỗi phiên)
Bộ công cụ = thư mục chứa `SKILL.md` này (scripts/, engine/, data/, references/, brand.json).
- Nếu thư mục skill đã có `scripts/` → `K=<thư mục skill>`; chép sang chỗ ghi được: `cp -r $K /home/claude/vtd3d && K=/home/claude/vtd3d`.
- Nếu chỉ có SKILL.md (skill lưu dạng 1 file) → lấy bộ công cụ từ máy Hoài qua cầu nối thiết bị: `C:\Users\PC\Desktop\Học Tiktok\BoSanXuat_VideoTuDuy3D\05_SKILL\video-tu-duy-3d\` (device_list_dir đệ quy → device_stage_files các file, bỏ qua examples/*.mp4) rồi chép vào `/home/claude/vtd3d`. Không có cầu nối → nhờ Hoài đính kèm file zip `video-tu-duy-3d.zip`.
- `bash $K/engine/setup.sh`
- Stage thêm `DU_LIEU_KENH\everai.json` (cấu hình giọng EverAI).
- **Lịch sử chống trùng** `history.json` và `brand.json` thật nằm ở máy Hoài: `…\BoSanXuat_VideoTuDuy3D\DU_LIEU_KENH\`. Stage về đầu phiên (ghi đè `$K/history.json`, `$K/brand.json`), commit ngược lại cuối phiên. Không truy cập được → báo Hoài, vẫn chạy với lịch sử hiện có và ghi chú trong kết quả.

## 1. Chọn chủ đề (bỏ qua nếu Hoài đã đưa chủ đề)
Prompt P1 (`references/bo_prompt.md`) + `python $K/scripts/world_roll.py list` để né trùng. Kiểm chứng nguồn bằng WebSearch/WebFetch ≥ 2 nguồn; tên người, năm, con số trên hình/lời đọc phải có trong trang đã đọc.

## 2. Rút thế giới
```
mkdir -p /home/claude/work && cd /home/claude/work
python $K/scripts/world_roll.py roll --topic "<khái niệm>" --out world.json
```
Đọc `world.json` (environment, material, light, palette, camera + camera_extra, scene_type, script_frame, hook_type, banned).

## 3. Ẩn dụ → kịch bản → storyboard
- P2: 3 động từ cơ chế → 6 ẩn dụ từ 6 lĩnh vực → chấm → chọn → "dịch" vào môi trường đã rút.
- P3: lời đọc theo `script_frame` + `hook_type` (`references/cau_truc_kich_ban.md`), đòn giữ chân `references/don_tam_ly.md`. 220–480 từ.
- P4: `storyboard.json` theo `references/storyboard.schema.md`; `render_mode`:
  - `code3d` (mặc định, tự động hoàn toàn): Claude viết cảnh three.js.
  - `ai_clips`: khi Hoài muốn dùng Veo/Kling — điền `ai_prompt` từng shot theo P5.
- Ghi `narration.txt` = nối tất cả `say` (gửi TTS).
- Giám khảo: `python $K/scripts/world_roll.py check --storyboard storyboard.json` (exit 2 = làm lại phần trùng) **và** tự chạy P8. Tối đa 3 vòng.

## 4. Giọng đọc (EverAI tự động)
Cấu hình ở máy Hoài: `…\BoSanXuat_VideoTuDuy3D\DU_LIEU_KENH\everai.json` (api_key, voice_code, speed_rate…). Stage về `work/everai.json` (không in api_key ra hội thoại, không ghi nó vào file nào khác, xoá `work/everai.json` khi xong).
```
python $K/scripts/tts_everai.py --config work/everai.json --text work/narration.txt --outdir work/
```
→ `voice.mp3` + `voice.srt`. Lỗi:
- "KHÔNG KẾT NỐI ĐƯỢC EverAI" → môi trường chặn mạng: báo Hoài thêm `www.everai.vn`, `everai.vn` và `*.r2.cloudflarestorage.com` (nơi EverAI lưu file giọng) vào danh sách tên miền được phép của môi trường, rồi chạy lại. Trong lúc chờ, commit `narration.txt` vào `SAN_XUAT\<ID>\` để Hoài có thể tự tạo giọng và bỏ `voice.mp3` + `voice.srt` vào đó.
- Thiếu api_key/voice_code → nhắc Hoài điền `everai.json`. Lỗi từ EverAI (hết ký tự, sai mã giọng) → báo nguyên văn lỗi.
- Giọng đã tạo xong nhưng không tải được (lỗi KHÔNG TẢI ĐƯỢC) → sau khi mở tên miền, chạy lại với `--resume <request_id>` (lấy trong `work/everai_request.json`) — không tạo lại, không tốn ký tự. EverAI trả trạng thái tiếng Việt ("hoàn thành").
- Đã có sẵn `voice.mp3` trong `SAN_XUAT\<ID>\` → dùng luôn, không gọi API.
Đo tốc độ thật lần đầu: số từ ÷ thời lượng → ghi `voice_words_per_sec` vào brand.json (khi Hoài đồng ý).
Sau đó: `python $K/scripts/timeline.py --storyboard storyboard.json --srt voice.srt --audio voice.mp3 --out timeline.json` (khớp < 85% → kiểm lại lời đọc so với SRT).

## 5. Hình
**code3d:** viết `work/scene.html` theo P6, import map:
`{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}`, `import {...} from '/kit.js'`. `examples/demo_ghe_cho_noi/scene.html` chỉ để xem cách gọi API — **không** chép thế giới/vật của nó.
```
cd $K/engine
node render_scene.js --dir /home/claude/work --still 2,8,20,40,70      # soát bằng Read các still_*.jpg
node render_scene.js --dir /home/claude/work --out /home/claude/work/film.mp4   # chạy nền (run_in_background), ~0,65 s/khung ở 1280×720
```
Soát still: vật chính rõ, không bị cắt, không xuyên nhau, đáy 20% đủ trống cho phụ đề, khác hẳn thế giới demo. Chậm quá → `--w 960 --h 540`.
**ai_clips:** clip đặt tên `clips/S01.mp4…` (Hoài tạo bằng Veo/Kling hoặc app Veo của Hoài), stage về `work/clips/`.

## 6. Dựng + soát
```
python $K/scripts/assemble.py --storyboard storyboard.json --timeline timeline.json \
   --film film.mp4 | --clips clips/   --voice voice.mp3 [--music music.mp3] --out <ID>.mp4 --preview
# Read preview.jpg → sửa → bỏ --preview để xuất bản cuối
```
Soát: hook không mồ côi chữ, thẻ không đè phụ đề, phụ đề khớp giọng, không có chữ "nướng" sai trong cảnh, thời lượng đúng. Xuất khung đẹp nhất làm bìa: `ffmpeg -ss <t> -i <ID>.mp4 -frames:v 1 cover.jpg`.

## 7. Giao + ghi lịch sử
- `python $K/scripts/world_roll.py commit --storyboard storyboard.json`
- Commit lên máy Hoài vào `…\SAN_XUAT\<ID>\`: `<ID>.mp4`, `cover.jpg`, `storyboard.json`, `caption.txt` (P7), `scene.html`; và `history.json` về `DU_LIEU_KENH\`. Gửi video bằng SendUserFile.
- Kết bằng 2–3 câu: khái niệm, ẩn dụ, thế giới đã rút, điểm giám khảo, việc Hoài cần làm (xem, đăng). Nêu rõ điều chưa kiểm được (vd. chưa nghe giọng thật).

## Không làm
- Không xem lại kênh tham khảo trong lúc sản xuất. Không dùng vật trong `data/ban_list.json`.
- Không đổi `brand.json` khi Hoài chưa yêu cầu (bộ nhận diện phải ổn định).
- Không render lại video khi Hoài chỉ yêu cầu sửa skill/code.
