# Kết quả kiểm chứng đợt hoàn thiện thương mại

Ngày: 13/10/2026. Kiểm tra trên cloud workspace Linux, Node 24.19.0, npm 11.9.0, FFmpeg, Wrangler 4.149.0. Kết quả là cho checkout hiện tại và dịch vụ cục bộ, chưa phải production.

## Đã chạy và đạt

- `npm test`: **29 test, 29 pass, 0 fail, 0 skip**. Cũng đã chạy đủ 29 test với Node 22 bằng `npm exec --package=node@22 -- node --test test/*.test.ts`, đều đạt. Gồm engine, timeline, EverAI fake server, xử lý JSON/quota/admin (kể cả JSON null/array/primitive), xuất H.264 ở kích thước lẻ, encoder cố ý thất bại, payment batch thực thi SQLite và job lease/reclaim.
- `npm run typecheck`: đạt. Phạm vi TypeScript theo cấu hình hiện có là phần web; không khẳng định đây là kiểm tra kiểu toàn bộ Node renderer.
- `npm run web:build`: đạt, tạo engine bundle, assets, icon và demos.
- `npm audit`: **0 cảnh báo** sau cập nhật Wrangler + Workers types và lockfile. Trước cập nhật có 5 mục mức high trong toolchain. Audit không thay đánh giá bảo mật ứng dụng.
- `node tools/commercial-demo.mjs`: 4 MP4, mỗi video 360×640, 15 FPS, 238 frame, khoảng 15,8 giây; giọng mock im lặng. Đã xem ảnh ghép bốn phong cách và đổi ký tự mũi tên không có trong font demo sang văn bản thường.
- `NV_API_URL=http://127.0.0.1:8788 node tools/check-local.mjs`: đạt trên Wrangler mới, D1 và R2 local. Tạo account dev có consent → tạo kịch bản miễn phí → queue → runner với lease → dựng trên máy chủ → upload MP4/SRT → trạng thái done → tải có xác thực → từ chối tải vô danh (401) → đọc video inline theo byte range (206, 100 byte). Dự án thử được xóa và session được logout; account dev thử vẫn nằm trong local DB.
- Video end-to-end: H.264 **1080×1920**, AAC, khoảng **5,47 giây**; mock narration. Đây không phải benchmark throughput hay chất lượng âm thanh thật.

## Test phản ánh lỗi thực

- EverAI: 2 câu trong một đoạn tạo đúng 1 yêu cầu trả phí giả lập; render lại không gọi API thêm; mốc estimate không vượt audio. Tách đoạn đúng giới hạn 5.000 ký tự.
- Thanh toán: từ chối sai account, tiền ra, thiếu tiền, đơn quá hạn; retry và hai request đồng thời không cấp gói hai lần; một transaction không trả được hai order. SQL dùng transaction SQLite tương ứng D1 batch; SePay thật và fault injection D1 production chưa chạy.
- Lease: job bị reclaim nhận lease mới; worker cũ không được gửi progress/upload/done/fail; cần đủ MP4 và SRT trước done; output của lease cũ không trở thành video công bố; request fail sau done không hoàn quota nhầm.
- Renderer: yêu cầu 240px khung dọc xuất được 240×426 thay vì chiều cao 427 không hợp lệ; encoder exit lỗi được xử lý, không crash EPIPE; thư mục audio tạm được dọn.

## Tạo lại môi trường kiểm chứng

```bash
cd /workspace/Claude
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm test
npm run typecheck
npm run web:build
npm audit --audit-level=high
node tools/commercial-demo.mjs
export XDG_CONFIG_HOME=/workspace/.config WRANGLER_SEND_METRICS=false
cd web
../node_modules/.bin/wrangler d1 execute net-ve-studio --local --file schema.sql
../node_modules/.bin/wrangler dev --local --ip 127.0.0.1 --port 8787
```

Trong terminal khác, chạy `node tools/check-local.mjs` từ gốc repository. Cần `web/.dev.vars` với `DEV_LOGIN=1` và local `RUNNER_TOKEN` ngẫu nhiên ít nhất 32 ký tự, cùng token cho Worker/runner. Runtime hiện chưa có Google client ID, khóa TTS hoặc SePay/Cấu hình deploy trong các biến môi trường đã kiểm tra; cần cấu hình riêng cho kiểm chứng live. Không đưa giá trị token vào Git hoặc log. Bài smoke chỉ chấp nhận localhost; nó dùng mock voice. Khi chỉ kiểm tra pipeline, không cần Cloudflare account hoặc khóa AI.

CI mới ở `.github/workflows/checks.yml` chạy test/typecheck/build/audit với Node 22 và 24. **Workflow GitHub chưa được chạy trong phiên này**; không ghi CI đã xanh. Workflow deploy có service account runtime riêng nhưng **chưa deploy thực tế**.

## Chưa được kiểm chứng / còn điều kiện trước thu tiền

- Google OAuth trên domain production và trong trình duyệt nhúng.
- Nghe giọng thật EverAI/Google/ElevenLabs, phát âm tiếng Việt, timestamp và quyền thương mại; espeak không được cài trên instance này, phần code fallback đã sửa nhưng chưa thử nghe. Container production có espeak-ng trong Dockerfile, chưa build container trong phiên này.
- SePay staging, account ngân hàng đúng, webhook retry của nhà cung cấp và backfill lịch sử transaction nếu đã có thanh toán trước.
- IAM/secret rotation, backup/restore, retention/cleanup artifacts, tải đồng thời, timeout và lỗi mạng kéo dài.
- Monthly credit, hard cap ngân sách tổng hệ thống, sửa hạn mức gói cho đủ biên lợi nhuận; nghe trước và thông báo khi fallback giọng; audio toàn bài + alignment chính xác.
- UI demo HTML có MP4 thật và điều khiển playback, nhưng chưa có kiểm thử browser tự động hoặc kiểm chứng trên điện thoại thật trong phiên này.

Mã và hướng dẫn được lưu trong workspace. Chưa push, tạo PR, triển khai hoặc publish production. Xem [kế hoạch thương mại](commercial-plan.md) cho thứ tự ưu tiên và các điểm phản biện.

## Cập nhật tích hợp tham khảo v3.3.8

Sau đợt kiểm chứng ở trên, đã bổ sung quản trị Máy dựng, hộp thư/outbox Zalo và bàn dựng mới. Suite hiện có **37 test**, đã đạt trên Node 22 và 24. Đã chạy Chromium desktop/mobile kiểm chứng bàn dựng theo phase thật, hoàn tất và nút tải, cùng quản trị Zalo/Máy dựng, tìm kiếm/lọc lỗi/chẩn đoán và thumbnail storyboard. Các dòng “chưa kiểm thử browser” ở phần đợt trước không áp dụng cho những luồng mới này. Zalo thật vẫn chưa được kiểm chứng vì chưa có token/webhook production. Xem [bàn giao tích hợp](reference-integration.md).
