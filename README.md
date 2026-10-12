# Nét Vẽ Studio

Video bàn tay vẽ kèm thuyết minh tiếng Việt. Bản này là **bộ dựng video chạy trên máy chủ**: không cần trình duyệt, đầu vào là kịch bản cảnh (JSON), đầu ra là MP4 + phụ đề SRT.

Đề án sản phẩm và demo: [`docs/handdraw-studio.html`](docs/handdraw-studio.html).

## Chạy thử

```bash
npm install
npm run render -- examples/luong-11-trieu/project.json --out out/video.mp4
npm test
```

Cần Node ≥ 22.18 (chạy TypeScript trực tiếp) và `ffmpeg`. Mặc định dùng giọng thử (`mock`, âm thanh câm, thời gian ước tính) để kiểm tra bố cục mà không cần khoá API.

Tuỳ chọn:

| Tham số | Giá trị |
|---|---|
| `--tts` | `mock` · `everai` · `elevenlabs` · `google` |
| `--images` | `openai` · `gemini` (cho khung chỉ có `prompt`) |
| `--size` | cạnh ngắn của video, mặc định `1080` |
| `--fps` | mặc định `30` |

## Khoá API (biến môi trường)

Cách nhanh nhất: `cp .env.example .env`, mở `.env` và điền khoá của dịch vụ bạn dùng. `npm run render` tự đọc tệp này. Tệp `.env` đã nằm trong `.gitignore`, không bị đưa lên GitHub.


| Dịch vụ | Biến |
|---|---|
| EverAI | `EVERAI_API_KEY`, `EVERAI_VOICE_CODE` (vd. `vi_female_thuytrang_mb`, danh sách trong `src/node/everai-voices.ts`), tuỳ chọn `EVERAI_MODEL` (mặc định `everai-v1.6`), `EVERAI_API_URL` |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, tuỳ chọn `ELEVENLABS_MODEL` |
| Google TTS | `GOOGLE_TTS_API_KEY`, tuỳ chọn `GOOGLE_TTS_VOICE` (mặc định `vi-VN-Neural2-A`) |
| OpenAI ảnh | `OPENAI_API_KEY`, tuỳ chọn `OPENAI_IMAGE_MODEL` (mặc định `gpt-image-1`) |
| Gemini ảnh | `GEMINI_API_KEY`, tuỳ chọn `GEMINI_IMAGE_MODEL` (mặc định `gemini-2.5-flash-image`) |

EverAI không trả mốc thời gian từng từ, nên mỗi câu được đọc thành một đoạn riêng rồi ghép lại: thời điểm vẽ khớp đúng từng câu. Mỗi câu đã đọc được lưu đệm theo đúng nội dung yêu cầu: dựng lại không bị EverAI trừ phí lần hai. Giọng đặt trong kịch bản:

```json
"voice": { "provider": "everai", "voiceId": "vi_male_minhtriet_mb", "model": "everai-v1.6", "speed": 1.1, "pitch": 1.0, "volume": 100 }
```

Khoá chỉ đọc từ môi trường, không ghi vào log hay tệp. Ảnh AI được lưu đệm trong `.cache/` theo nội dung câu lệnh, dựng lại không tốn tiền lần hai.

## Kịch bản cảnh

```json
{
  "channel": "Nét Vẽ", "episode": "Tập 12",
  "ratio": "9:16", "style": "notebook",
  "voice": { "provider": "google" },
  "images": { "provider": "gemini" },
  "scenes": [
    { "lines": ["Làm việc quần quật cả năm.", "Lương vẫn 11 triệu."],
      "panels": [ { "prompt": "an office worker overwhelmed by paperwork" },
                  { "image": "my-drawing.png" } ] }
  ]
}
```

- Mỗi `lines[i]` là một câu thoại và một dòng phụ đề. Khung thứ i được vẽ khi câu thứ i bắt đầu được đọc (đổi bằng `"line": n`).
- `image` dùng ảnh có sẵn. Nếu chỉ có `prompt`, ảnh được tạo bằng AI với một câu lệnh phong cách line-art cố định (`src/node/images.ts`).
- Bảng vẽ tự do `{"kind":"sketch","items":[...]}` (mặc định): mỗi cảnh một bố cục riêng gồm chữ viết tay, hình nét đơn (4.500+ icon Tabler, MIT, `assets/icons`), người que, biểu đồ, mũi tên/khoanh tròn/✗/✓ nối theo `id`; toạ độ % vùng vẽ, `line` = câu thoại mà vật được vẽ cùng. Bộ dựng tự giữ vật trong khung và đẩy các vật chồng nhau ra. Phụ đề trên hình tắt mặc định (`"subtitles": true` để bật); tệp SRT vẫn được xuất.
- Ba cách tạo: AI viết từ chủ đề · kịch bản của tôi + AI minh hoạ · kịch bản của tôi + tự minh hoạ theo luật (`web/src/compose.ts`, không gọi AI, miễn phí).
- Sơ đồ `{"kind":"stick","actors":[{"action":"walk","label":"Bạn"}],"bubble":"...","caption":"..."}`: 1-2 người que được bàn tay vẽ rồi chuyển động thật (`idle` `walk` `run` `wave` `think` `cheer` `sad` `point` `shrug` `jump`).
- `style`: `notebook` · `whiteboard` · `chalkboard` · `kraft` · `oly` · `blueprint` · `ricepaper`. Mỗi phong cách có màu mực và dụng cụ vẽ riêng. Đổi dụng cụ bằng `"tool"`: `marker` · `chalk` · `fountain` · `colormarker` · `pencil` · `technical` · `brush`.

## Thay ảnh bàn tay

Ảnh tay cầm bút, nền trong suốt. Đo 3 thông số trên ảnh gốc rồi chạy:

```bash
python3 tools/hand_prep.py hand.png assets/hands/ten-tay \
  --tip 175,158 --end 686,488 --fingers 288,356 --cut 860
```

- `--tip`: đầu bút · `--end`: đuôi bút · `--fingers`: khoảng x nơi ngón tay đè lên bút · `--cut`: cắt ngang cẳng tay tại y này.
- Công cụ xoá bút cũ, tách lớp ngón tay, cắt cẳng tay. Dụng cụ vẽ của từng phong cách được chèn giữa hai lớp.
- Dùng trong kịch bản: `"hand": "../../assets/hands/ten-tay"`. Thư mục `assets/hands/default` là tay mặc định.
- Cần quyền dùng thương mại cho ảnh tay.

## Cấu trúc

```
src/engine/   dùng chung trình duyệt + máy chủ (chỉ Canvas 2D API)
  render.ts   vẽ một khung hình theo thời gian t: nền, hình lộ theo vệt bút, phụ đề, bàn tay
  timeline.ts khớp thời điểm vẽ với lời đọc
  tools.ts    7 dụng cụ vẽ
  styles.ts   7 phong cách
src/node/     nhà cung cấp giọng đọc và ảnh AI
src/cli/      lệnh dựng MP4 (Skia vẽ khung → FFmpeg)
tools/        xử lý ảnh tay
assets/       font Pangolin (OFL), hình Open Doodles (CC0), ảnh tay
```

Đo trên máy chủ thử: video 9:16 1080×1920 dựng mất khoảng 0,6 giây cho mỗi giây video, trên ~1 vCPU.

## Trang web (Cloudflare)

`web/` là trang web: đăng nhập Google, AI viết kịch bản (Gemini hoặc OpenAI, chọn theo từng video), chỉnh từng câu, xem trước bàn tay vẽ, vẽ ảnh AI cho từng khung, xếp hàng dựng video và tải MP4 + phụ đề.

- **Chạy thử trên máy:** `npm run web:dev` (tạo `web/.dev.vars` có `DEV_LOGIN=1` và `RUNNER_TOKEN=...`, rồi `cd web && npx wrangler d1 execute net-ve-studio --local --file schema.sql`). Nút "Đăng nhập thử" chỉ hiện trên localhost.
- **Triển khai:** chạy workflow **Triển khai web** trên GitHub (tab Actions). Workflow tự tạo D1 + R2, áp schema, đưa trang lên và cài khoá bí mật.
- **Máy dựng (chạy thật):** workflow **Triển khai máy dựng** đưa `runner.Dockerfile` lên Google Cloud Run Jobs (asia-southeast1) và cài cho trang web một khoá chỉ có quyền bật job đó. Khi có video được xếp hàng, trang web bật job; job dựng hết hàng chờ rồi tắt. Cron 10 phút/lần là lưới an toàn. Cần secret `GCP_SA_KEY` (khoá service account có quyền Owner trên dự án Google Cloud, đã bật thanh toán).
- **Máy dựng (thử):** `NV_API_URL=https://... RUNNER_TOKEN=... npm run runner` trên máy có FFmpeg, hoặc workflow **Máy dựng (thử nghiệm)**.

**Trang quản trị** (`#/admin`, liên kết "Quản trị" trên thanh đầu trang): nhập/xoá khoá API (Gemini, OpenAI, EverAI, Google TTS, ElevenLabs — mã hoá AES-GCM trong D1, không bao giờ hiện lại, ưu tiên hơn khoá trên máy chủ), đổi tên trang và mọi tên hiển thị (phong cách, dụng cụ, kiểu sơ đồ, động tác người que, chữ trên giao diện), bật/tắt phong cách, giá trị mặc định, danh sách giọng đọc, model AI, giới hạn mỗi ngày, lời dặn thêm cho AI, danh sách quản trị viên, khoá/mở khoá người dùng. Chưa khai báo quản trị viên thì tài khoản Google đăng nhập đầu tiên là quản trị viên.

Secrets cần trong GitHub (Settings → Secrets and variables → Actions):

| Secret | Dùng cho |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Triển khai web |
| `GOOGLE_CLIENT_ID` | Đăng nhập Google |
| `RUNNER_TOKEN` | Chuỗi ngẫu nhiên ≥ 32 ký tự, dùng chung cho trang web và máy dựng |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | AI viết kịch bản và vẽ ảnh |
| `NV_API_URL` | Địa chỉ trang web, cho máy dựng thử nghiệm |
| `EVERAI_API_KEY`, `EVERAI_VOICE_CODE` | Giọng đọc (máy dựng) |
