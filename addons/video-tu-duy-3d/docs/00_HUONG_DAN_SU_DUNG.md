# 00 · HƯỚNG DẪN SỬ DỤNG — Bộ sản xuất "Video Tư Duy 3D ẩn dụ"

> Bộ này giúp bạn sản xuất hàng loạt video thể loại giống kênh "AI & Money" (khái niệm tư duy/tiền bạc minh hoạ bằng thế giới 3D ẩn dụ, khung phim 16:9 giữa màn dọc, hook cố định, phụ đề karaoke song ngữ) — **nhưng mỗi video có thế giới riêng và không chép kênh nào**.

## Vì sao trước đây làm không được, và bộ này sửa thế nào
| Vấn đề cũ | Cách bộ này xử lý |
|---|---|
| Đưa 1 video mẫu → AI coi mọi thứ là khuôn, chép luôn cảnh | Đã phân tích 4 video + ~30 ảnh bìa để tách **ngữ pháp thể loại** (giữ) khỏi **nội dung từng video** (đổi). AI sản xuất chỉ nhận ngữ pháp **bằng chữ**, không bao giờ nhận video mẫu |
| Video sau na ná video trước | Thế giới/chất liệu/ánh sáng/màu/máy quay/khung kịch bản/kiểu hook được **rút thăm có trí nhớ** (`world_roll.py`, ~58 triệu tổ hợp), né những gì đã dùng gần đây |
| Hình minh hoạ sáo (tiền → đồng xu) | **Bộ máy ẩn dụ**: hình suy ra từ *động từ* của khái niệm, sinh 6 phương án từ 6 lĩnh vực rồi chấm điểm |
| Không ai kiểm tra trùng | **Giám khảo trùng lặp**: script chấm điểm so lịch sử + danh sách cấm, cộng prompt P8 chấm chất lượng |

## Trong thư mục có gì
| File / thư mục | Dùng để |
|---|---|
| `01_PHAN_TICH_THE_LOAI.md` | Đọc 1 lần: thể loại này là gì, vì sao giữ chân người xem, kênh tham khảo làm thế nào |
| `02_HE_THONG_CHONG_RAP_KHUON.md` | Luật chống rập khuôn, danh sách cấm, 3 bộ nhận diện kênh gợi ý |
| `03_THU_VIEN/` | Thư viện: ngữ pháp thể loại, bộ máy ẩn dụ, 6 khung kịch bản + 12 kiểu hook, đòn tâm lý, ma trận thế giới, schema storyboard |
| `04_BO_PROMPT.md` | 9 prompt P1→P9, dùng tay với Claude/ChatGPT/Gemini |
| `05_SKILL/video-tu-duy-3d/` | Skill cho Claude chạy tự động + script dựng (rút thăm, khớp giọng, render 3D, ghép video) |
| `video-tu-duy-3d.zip` | Cùng nội dung skill, nén sẵn để tải lên/đính kèm |
| `DU_LIEU_KENH/` | `brand.json` (nhận diện kênh) + `history.json` (lịch sử chống trùng) — **dữ liệu sống của kênh, đừng xoá** |
| `SAN_XUAT/` | Mỗi video 1 thư mục `<ID>/`: lời đọc, giọng, clip, video thành phẩm, caption |
| `SAN_XUAT/DEMO-20261026-01/` | Video demo 20 giây chạy thử toàn bộ dây chuyền (giọng im lặng — chỉ để xem bố cục, thẻ chữ, phụ đề) |

---

## Bước 1 — Thiết lập kênh (làm 1 lần, ~10 phút)
1. Đọc `02_…` mục 4, chọn 1 trong 3 bộ nhận diện (hoặc tự đặt).
2. Mở `DU_LIEU_KENH/brand.json`, sửa: `channel_name`, `series`, màu (`band_bg`, `hook_accent`, `sub_highlight`…), `sub_english` (true/false). Mặc định đang là bộ "Mực & Đồng".
3. Đo tốc độ giọng TTS bạn dùng: đọc 1 đoạn 300 từ, lấy số từ ÷ số giây → ghi vào `voice_words_per_sec`.

## Bước 1b — Cấu hình giọng EverAI (làm 1 lần)
1. Mở `DU_LIEU_KENH/everai.json`, điền `api_key` (tạo tại everai.vn/api) và `voice_code` (mã giọng, vd `vi_male_vanduy_mb`). Có thể chỉnh `speed_rate` (0.5–2.0), `pitch_rate`, `volume`.
2. **Mở mạng cho EverAI**: môi trường làm việc của Claude chặn mọi trang web ngoài danh sách cho phép. Vào phần cài đặt môi trường (network / allowed domains — nơi bạn từng thêm api.pexels.com) và thêm: `www.everai.vn`, `everai.vn` và `*.r2.cloudflarestorage.com` (EverAI trả file giọng từ kho Cloudflare R2).
3. Xong 2 việc này, Claude tự tạo giọng + phụ đề SRT, bạn không phải làm tay bước giọng nữa.
> Giữ kín file `everai.json` (chứa khoá API). Nếu lộ, vào everai.vn/api tạo khoá mới.

## Bước 2 — Cài skill cho Claude
Chọn 1 trong 2 cách:
- **A. Lưu skill trong Claude** — ở cuối cuộc trò chuyện này có thẻ đề xuất skill `video-tu-duy-3d`, bấm lưu. Skill đó sẽ tự lấy script từ thư mục này trên máy bạn (cần Claude được liên kết với máy tính như phiên hiện tại).
- **B. Dùng file zip** — tải `video-tu-duy-3d.zip` lên mục Skills trong cài đặt Claude (nếu tài khoản của bạn hỗ trợ tải skill), hoặc đính kèm zip vào cuộc trò chuyện khi cần.

## Bước 3 — Sản xuất 1 video (tự động với Claude)
Nói với Claude, ví dụ:
> "Làm video tư duy 3D về **hiệu ứng mỏ neo khi mặc cả lương**, dạng code3d."
> "Làm video tư duy 3D, tự chọn chủ đề tuần này."
> "Làm video tư duy 3D về **sunk cost**, dùng clip Veo (ai_clips)."

Claude sẽ: rút thế giới → chọn ẩn dụ → viết kịch bản + storyboard → giám khảo trùng lặp → **tự tạo giọng EverAI** → dựng → lưu video vào `SAN_XUAT/<ID>/`. Chạy một mạch.

Nếu chưa cấu hình EverAI (Bước 1b) thì Claude dừng sau kịch bản và lưu `narration.txt` vào `SAN_XUAT/<ID>/`, khi đó:

Bạn: dán `narration.txt` vào TTS (EverAI, Vbee, FPT.AI, ElevenLabs, CapCut…), lưu **`voice.mp3`** và nếu được **`voice.srt`** vào cùng thư mục `SAN_XUAT/<ID>/`. Nếu chọn ai_clips: tạo clip theo `prompts_ai.txt`, lưu `clips/S01.mp4, S02.mp4…`.

Nói: **"dựng tiếp <ID>"** → Claude khớp giọng, render cảnh 3D (≈ 40 phút cho video 2 phút; chạy nền), ghép video, soát khung, lưu `<ID>.mp4` + `cover.jpg` + `caption.txt` vào `SAN_XUAT/<ID>/`, ghi lịch sử.

Bạn: xem video → đăng (caption trong `caption.txt`). Bật nhãn "AI-generated" khi đăng TikTok.

> Đã có sẵn giọng? Bỏ vào `SAN_XUAT/<ID>/` trước và nói "làm từ đầu tới cuối" — Claude chạy một mạch.

## Bước 3' — Sản xuất bằng tay (không cần skill)
1. `world_roll.py roll` (hoặc tự bốc 1 dòng mỗi nhóm trong `03_THU_VIEN/the_gioi_ma_tran.md`, không trùng 8 video gần nhất).
2. Chạy P1 → P2 → P3 → P4 trong `04_BO_PROMPT.md` với AI bạn thích.
3. Tạo clip bằng P5 (Veo/Kling/Hailuo) — giữ nguyên câu WORLD/LIGHT/STYLE cho mọi shot.
4. Chạy P8 để chấm trùng lặp. Ghép bằng `assemble.py` hoặc CapCut theo bố cục ở `03_THU_VIEN/ngu_phap_the_loai.md` mục 1.
5. Ghi tên vật ẩn dụ + thế giới vào `history.json` (hoặc 1 bảng tính) để lần sau né.

## Hai chế độ hình ảnh
| | `code3d` (mặc định) | `ai_clips` |
|---|---|---|
| Ai làm hình | Claude viết cảnh three.js, render tự động | Bạn tạo clip trên Veo/Kling/Hailuo theo prompt P5 |
| Ưu | Tự động 100%, thế giới nhất quán tuyệt đối, chữ khắc trong cảnh được, miễn phí | Hình giàu chi tiết, chất liệu thật hơn |
| Nhược | Hình tối giản (khối cơ bản), render chậm ~0,65 s/khung | Tốn credit, thế giới có thể lệch giữa các clip, phải làm tay |

## Lệnh tham khảo (Claude tự chạy; ghi ra để bạn hiểu)
```
python scripts/world_roll.py roll --topic "..." --out world.json      # rút thế giới
python scripts/world_roll.py check --storyboard storyboard.json       # giám khảo trùng lặp
python scripts/timeline.py --storyboard storyboard.json --srt voice.srt --audio voice.mp3 --out timeline.json
node engine/render_scene.js --dir work --still 2,8,20                 # soát nhanh cảnh 3D
node engine/render_scene.js --dir work --out work/film.mp4            # render cảnh
python scripts/assemble.py --storyboard storyboard.json --timeline timeline.json --film film.mp4 --voice voice.mp3 --out video.mp4 [--preview]
python scripts/world_roll.py commit --storyboard storyboard.json      # ghi lịch sử
```

## Mở rộng
- Thêm môi trường/chất liệu/bảng màu: sửa `05_SKILL/video-tu-duy-3d/data/matrix.json` (mỗi dòng có `id` không dấu).
- Thêm vật cấm: `data/ban_list.json`.
- Thêm động từ → hình ảnh: `references/an_du_co_che.md`.
- Đổi bố cục/phụ đề: `brand.json` (màu, font, song ngữ, chế độ tô chữ `color` = chỉ chữ đang đọc / `progressive` = tô dần).

## Câu hỏi thường gặp
- **Video vẫn na ná nhau?** Xem `02_…` mục 7 (5 bước kiểm tra).
- **Phụ đề lệch giọng?** Cung cấp `voice.srt`; không có SRT thì thời gian chỉ ước lượng theo độ dài chữ.
- **Muốn dùng lại 1 thế giới cho series?** Được — ghi `"series_world": true` trong storyboard và nói rõ với Claude; giám khảo sẽ bỏ qua tiêu chí thế giới nhưng vẫn yêu cầu vật ẩn dụ mới.
