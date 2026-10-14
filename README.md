# Nét Vẽ Studio

Video bàn tay vẽ kèm thuyết minh tiếng Việt. Bản này là **bộ dựng video chạy trên máy chủ**: không cần trình duyệt, đầu vào là kịch bản cảnh (JSON), đầu ra là MP4 + phụ đề SRT.

Đề án sản phẩm và demo: [`docs/handdraw-studio.html`](docs/handdraw-studio.html).

## Chạy thử

```bash
npm install
npm run render -- examples/luong-11-trieu/project.json --out out/video.mp4
npm test
npm run typecheck   # kiểm tra kiểu phần web
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

**Không cần AI vẫn chạy:** kịch bản mẫu, chế độ "kịch bản của tôi + tự minh hoạ" (luật trong `web/src/compose.ts`, nhận diện dạng video/ngách trong `web/src/intent.ts`), giọng đọc miễn phí (Google Neural2 qua tài khoản Google Cloud của máy dựng, dự phòng espeak-ng). Giọng trả phí lỗi thì tự chuyển sang giọng miễn phí; AI lỗi thì thử model dự phòng, rồi nhà cung cấp còn lại, cuối cùng tự minh hoạ miễn phí.

**Zalo** (`web/src/zalo.ts`, Zalo Bot Platform): người dùng gửi `KB` + kịch bản hoặc `TAO` + chủ đề cho bot và nhận link video (ký số, hạn 7 ngày). Liên kết tài khoản bằng mã `KETNOI`; người chưa có tài khoản web được tạo tài khoản Zalo tự động (tuỳ chọn). Webhook xác thực bằng header `X-Bot-Api-Secret-Token`. Webhook luôn trả HTTP 200 cho Zalo (lỗi được ghi nhật ký và hiện ở Quản trị → Zalo) để Zalo không ngừng gọi; mã bí mật đi kèm cả header lẫn `?s=` trên địa chỉ webhook.

**Chế độ Beta** (Quản trị → Nội dung, bật mặc định): trang web không hiện bảng giá, gói cước, thanh toán, nút nâng cấp hay khẩu hiệu bán hàng; `/api/orders` bị chặn. Cài đặt gói/thanh toán vẫn giữ và giới hạn mỗi gói vẫn áp dụng. Tắt Beta là mở bán lại.

**Trang chủ tuỳ biến** (Quản trị → Nội dung → Trang chủ): tiêu đề, đoạn giới thiệu, ảnh/video cạnh tiêu đề và tối đa 12 video mẫu. Dán địa chỉ `https://` hoặc tải tệp lên (PNG/JPG/WebP/MP4/WebM ≤ 60 MB, lưu R2 `site/`, phục vụ công khai qua `/api/site/…` có Range và cache 1 năm). Để trống thì trang chủ vẽ demo trực tiếp.

**Trần chi phí** (`web/src/budget.ts`, Quản trị → Cài đặt): trần ngày/tháng (VND, tính từ `events.cost`) và mức tối đa một video. Chạm trần thì AI viết/vẽ tạm dừng có thông báo, "kịch bản của tôi + AI minh hoạ" chuyển sang tự minh hoạ, giọng trả phí chuyển sang giọng cơ bản cho lượt dựng đó. Trang quản trị hiện mức đã tiêu và loại tốn nhiều nhất 30 ngày.

**Định dạng video** (`src/engine/looks.ts`, đã chốt theo phiếu chọn trong [`docs/de-xuat-dinh-dang-video.html`](docs/de-xuat-dinh-dang-video.html)): video mới chọn một trong 7 định dạng thay cho 17 phong cách × 4 kiểu vẽ (vẫn giữ "Vẽ tay cổ điển" cho video cũ và ai cần):

| Định dạng | `look` | Dữ liệu mỗi cảnh (`x`) | Bộ màu |
|---|---|---|---|
| Chữ bùng nổ | `kinetic` | `icon`, `keys` | dem · sang · tim |
| Hai bên đối lập | `split` | `a`, `b`, `aIcon`, `bIcon`, `aValue`, `bValue` (+ `sides` ở gốc) | do-xanh · sang · tim-vang |
| Tin nhắn drama | `chat` | `chat[{who,text}]`, `card` (+ `chatName`) | sang · toi · hong |
| Kể chuyện người que | `story` | `place{icon,label}`, `action`, `say`, `money`, `icons` | giay · bang-den · xanh |
| Con số biết nói | `data` | `stat{value,unit,label,parts}` | dem · sang · xanh-la |
| Đố vui đếm ngược | `quiz` | `quiz{q,options,answer,reveal}`, `pause` (đếm ngược) | tim · xanh · cam |
| Phim tài liệu AI | `doc` | `panels[0].prompt` (ảnh AI điện ảnh) | dien-anh · trang-den · lanh |

- Mọi định dạng: cảnh đầu có chữ ngay khung đầu tiên, chuyển cảnh có nhịp phóng và chớp sáng, phụ đề karaoke tô từ đang đọc (bật mặc định), thanh tiến độ, tiếng hiệu ứng tự tổng hợp (`src/node/sfx.ts`: vút, bụp, ting, tích tắc, chuông) và nhạc nền tự hạ khi có giọng đọc (quản trị tải nhạc có quyền dùng ở Nội dung → Nhạc nền).
- Dữ liệu `x` do AI viết (lời dặn riêng từng định dạng, `LOOK_BRIEF` trong `web/src/ai.ts`) hoặc tự điền miễn phí theo luật (`composeLook` trong `web/src/compose.ts`); mọi trường được kiểm tra trong `cleanLook` (`web/src/spec.ts`).
- Bật/tắt/đổi tên từng định dạng: Quản trị → Hiển thị (`look:*`) và Nội dung → Đổi tên. Bot Zalo: lệnh `DINHDANG` (phim tài liệu chỉ làm trên web).

**Phim tài liệu AI tính credit** (`web/src/credits.ts`, bảng `credits`, `credit_log`, `doc_projects`): trừ trước khi gọi AI, theo thứ tự lượt kèm gói VIP mỗi tháng (`docPerMonth` của gói) rồi tới credit. Mỗi video kèm `imagesPerVideo` lượt vẽ ảnh (cả vẽ lại), không dùng hạn mức ảnh hằng ngày; hoàn credit nếu AI viết lỗi hoặc xoá dự án trước khi vẽ ảnh nào. Gói credit bán lẻ cấu hình ở Quản trị → Gói cước (mua qua mã đơn `credit:<gói>`, SePay xác nhận như gói thường); trong Beta không hiện cho khách, quản trị cấp credit ở trang Người dùng. Giá vốn ước tính hiện ngay trên thẻ cài đặt để đặt giá không lỗ.

**Gói cước & thanh toán** (`web/src/plans.ts`): giới hạn theo ngày, phong cách/giọng/cách tạo theo gói, mã VietQR, SePay báo tiền về `/api/sepay/webhook` (API key) để kích hoạt tự động.

**Nhật ký** (`web/src/log.ts`, bảng `events`): mọi yêu cầu, từng bước video, chi phí AI/giọng (VND), lỗi, thao tác trong trang (xem, bấm, rời trang, lỗi trình duyệt). Trang quản trị có tổng quan, phễu, lọc, dòng thời gian từng người, xuất CSV.

**Trang quản trị** (`#/admin`, liên kết "Quản trị" trên thanh đầu trang): nhập/xoá khoá API (Gemini, OpenAI, EverAI, Google TTS, ElevenLabs — mã hoá AES-GCM trong D1, không bao giờ hiện lại, ưu tiên hơn khoá trên máy chủ), đổi tên trang và mọi tên hiển thị (phong cách, dụng cụ, kiểu sơ đồ, động tác người que, chữ trên giao diện), bật/tắt phong cách, giá trị mặc định, danh sách giọng đọc, model AI, giới hạn mỗi ngày, lời dặn thêm cho AI, danh sách quản trị viên, khoá/mở khoá người dùng. Khi chưa có danh sách quản trị viên, phải cấu hình `ADMIN_EMAIL` đúng email Google của chủ web; khách đăng nhập đầu tiên không được tự cấp quyền quản trị. Trong GitHub Actions, đặt variable `ADMIN_EMAIL` trước khi triển khai.

Secrets cần trong GitHub (Settings → Secrets and variables → Actions):

| Secret | Dùng cho |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Triển khai web |
| `GOOGLE_CLIENT_ID` | Đăng nhập Google |
| `RUNNER_TOKEN` | Chuỗi ngẫu nhiên ≥ 32 ký tự, dùng chung cho trang web và máy dựng |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | AI viết kịch bản và vẽ ảnh |
| `NV_API_URL` | Địa chỉ trang web, cho máy dựng thử nghiệm |
| `EVERAI_API_KEY`, `EVERAI_VOICE_CODE` | Giọng đọc (máy dựng) |

## Rà soát thương mại và demo

- [Đề xuất sản phẩm, nhịp kể chuyện, chi phí và điều kiện mở bán](docs/commercial-plan.md).
- [Demo so sánh bốn phong cách](docs/commercial-demo.html): chạy `node tools/commercial-demo.mjs` trước khi mở; MP4 được dựng trên máy chủ, âm thanh mock im lặng.
- [Kết quả kiểm chứng và giới hạn](docs/validation-commercial.md).

EverAI hiện đọc liền đoạn trong mỗi cảnh thay vì gọi riêng từng câu. Khi provider không trả timestamp, mốc câu là ước lượng khớp thời lượng audio, không phải đồng bộ chính xác từng từ. Cache cục bộ ở `.cache/everai`, có thể đổi bằng `NV_VOICE_CACHE_DIR`; cache này chưa dùng chung giữa các instance Cloud Run.

Trước triển khai cập nhật thanh toán, áp `web/schema.sql` để thêm bảng `payment_receipts`; đối soát/backfill giao dịch đã xử lý từ trước nếu đã có thanh toán thật. Không bật thu tiền với hạn mức ảnh/giọng hiện tại trước khi kiểm định chi phí và các điều kiện ra mắt trong đề xuất.

## Tích hợp dự án tham khảo và Zalo

[Chi tiết tích hợp FACIUP v3.3.8, ảnh giao diện và hướng dẫn kết nối bot](docs/reference-integration.md). Bàn dựng mới lấy tiến độ thực từ máy chủ; quản trị có tab Máy dựng và hộp thư Zalo có retry. Áp schema trước cập nhật Worker/runner. Connector Zalo dùng Bot Platform, không phải OA API, và chạy độc lập (webhook trực tiếp hoặc hỏi định kỳ): [docs/zalo-bot.md](docs/zalo-bot.md).

Chạy kiểm tra giao diện local bằng `npm run test:ui` (cần Wrangler dev và Chromium); dùng `NV_API_URL` để chọn cổng local khác. Test dùng mock TTS và không gửi tin Zalo thật.
