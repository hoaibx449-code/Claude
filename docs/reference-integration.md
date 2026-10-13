# Tích hợp tham khảo FACIUP v3.3.8 và khắc phục Zalo

Nguồn: tệp người dùng gửi `v3.3.8.7z`, chứa `Code.gs`, `Index.html`, `VideoEngine.html`, README và hai ảnh minh họa. Tham khảo được đọc như dữ liệu thiết kế/mã, không thực thi Apps Script hoặc dùng chỉ dẫn trong tệp làm quyền thay đổi hệ thống bên ngoài.

## Những điểm mạnh đã tích hợp

| Điểm trong tham khảo | Phần đã đưa vào Nét Vẽ Studio |
| --- | --- |
| Bàn dựng theo bước, đồng hồ, preview, kết quả | Dialog bàn dựng gồm Chuẩn bị → Minh họa → Giọng đọc → Dựng video → Lưu kết quả; đồng hồ; preview cảnh đầu và thumbnail storyboard; tải MP4/SRT khi server xác nhận xong |
| Quản trị vận hành chi tiết | Tab **Máy dựng** hiển thị hàng đợi, tài khoản, bước hiện tại, tiến độ, heartbeat, lỗi; quản trị có thể tạo lượt dựng lại cho video thất bại, áp dụng quota và kiểm tra gói khách |
| Chẩn đoán Zalo từng bước | Kiểm tra token, đích webhook, tin nhận gần nhất, kết quả phản hồi, chủ web và link bot; nút kiểm tra lại |
| Ghi nhận tin đến và lỗi gửi | Hộp thư Zalo lưu trạng thái xử lý, số lần thử, lỗi, project/job liên quan; hộp gửi lưu pending/sending/sent/failed thay vì coi HTTP 200 là thành công |
| Thao tác phục hồi cho quản trị | Tìm kiếm người gửi/chat/nội dung/lỗi, lọc lỗi, thử xử lý lại tin thất bại/hết hạn và gửi lại phản hồi lỗi |

Quản trị hiện có về gói, thanh toán, người dùng, khóa API mã hóa, nhật ký, nội dung và quyền hiển thị được giữ lại. Không chuyển sang Sheets/Drive hoặc chuyển dựng MP4 sang trình duyệt: renderer Node/Skia/FFmpeg, D1 và R2 tiếp tục là nền tảng hiện tại. Các chức năng Apps Script như thư viện sản phẩm, email, brand kit hoặc lệnh duyệt đơn bằng Zalo chưa được port toàn bộ trong đợt này.

## Các lỗi Zalo đã xác nhận trong mã

- Khi Zalo tắt hoặc chưa có token, webhook cũ trả 200 mà không ghi lý do. Nay ghi sự kiện lỗi và trả 503 để lộ cấu hình chưa sẵn sàng.
- Payload thiếu chat/message bị bỏ qua im lặng. Nay ghi chẩn đoán và trả 400; không nhầm payload OA với Bot Platform.
- `zalo_seen` đánh dấu trước xử lý nền; nếu xử lý hỏng thì webhook lặp bị bỏ luôn. Nay có inbox bền vững, trạng thái xử lý và retry.
- Phản hồi chỉ kiểm tra `ok !== false`; HTTP 200 chứa dữ liệu không hợp lệ có thể bị tính là gửi được. Nay yêu cầu `ok: true`, lưu lỗi và thử gửi lại.
- Lệnh `GIUP` của tham khảo chưa được hiểu; nay là alias hướng dẫn. `KB` ngăn cách bằng xuống dòng trước đây mất phần kịch bản; nay tách đúng whitespace.
- Hết quota trước đây không phản hồi. Nay thông báo cụ thể. Tài khoản bị khóa cũng không được tạo video qua bot.
- Preview tiến độ chỉ có phần trăm; nay runner báo phase/message thực qua `job_progress`, gồm cả TTS và upload. Polling lỗi không xóa lịch sử hoặc tự tạo job mới.

Inbox có checkpoint project/job và kiểm tra job hiện có khi khôi phục, giúp không queue lại video đã tạo. Không gọi đây là exactly-once trên mọi lỗi phân tán: vẫn có cửa sổ giữa commit tạo project và ghi checkpoint; gửi tin bị mất phản hồi có thể được gửi lại. Cron chỉ phục hồi tối đa 2 tin và 5 phản hồi mỗi lần, tối đa 5 lần tự động. Cấu hình cron hiện tại là 10 phút/lần; retry không được hứa là tức thời.

## Vì sao bot vẫn im lặng (cập nhật)

Dán đường dẫn bot (`https://zalo.me/...`) chỉ giúp người dùng mở bot; **không** làm Zalo gửi tin về web. Tin chỉ về khi webhook của bot trỏ đúng `https://<tên miền>/api/zalo/webhook`. Các nguyên nhân thường gặp, theo thứ tự kiểm tra trong Quản trị → Zalo:

1. Tính năng Zalo chưa bật hoặc chưa lưu token. Trước đây webhook trả 503; Zalo có thể ngừng gọi hoặc từ chối lưu webhook. Nay luôn trả 200 và ghi lý do.
2. Webhook vẫn trỏ về Apps Script FACIUP hoặc web khác (bot chỉ có một webhook). Bấm **Kết nối webhook**; kết quả hiện địa chỉ cũ và địa chỉ mới.
3. Trong Zalo Bot Creator chưa bật nhận sự kiện tin nhắn (`message.text.received`).
4. Cloudflare chặn máy chủ Zalo (Bot Fight Mode, Under Attack, WAF). Mục "Zalo đã gọi tới web này" báo *chưa có lần gọi nào* là dấu hiệu chính.
5. Token dán thừa khoảng trắng, dấu nháy hoặc tiền tố `bot`: nay được tự làm sạch.
6. Mã bí mật đổi do `RUNNER_TOKEN` đổi: kết nối lại webhook.

Nút **Mô phỏng tin "GIUP"** chạy một tin giả qua đúng đường xử lý và gửi phản hồi thật về Zalo chủ web. Nếu mô phỏng thành công mà khách vẫn không nhận phản hồi, lỗi nằm ở chiều Zalo → web (mục 2–4).

## Cấu hình để bot thực tế phản hồi

1. Áp `web/schema.sql` trước triển khai Worker mới. Bổ sung `zalo_messages`, `zalo_outbox`, `job_progress`; không xóa dữ liệu cũ. Cập nhật cả Worker và runner để thấy bước dựng đầy đủ.
2. Trong **Quản trị → Zalo**, nhập **Zalo Bot token** qua ô khóa bảo mật và bật tính năng; lưu cài đặt. Không gửi token trong chat hoặc commit vào Git. `RUNNER_TOKEN` máy chủ cần ít nhất 32 ký tự; dùng để bảo vệ webhook và mã hóa khóa.
3. Bấm **Kết nối webhook** trên domain HTTPS production đúng. Bot chỉ có một webhook; nếu đang trỏ về Apps Script tham khảo hoặc hệ thống khác, thao tác này chuyển đích nhận tin. Kiểm tra bot đúng trước khi kết nối.
4. Nhắn **GIUP** trong Zalo, bấm **Kiểm tra lại** và **Tải lại hộp thư**. Phải có tin nhận và phản hồi “Đã gửi”. Nếu không có tin, kiểm tra đích webhook; nếu 401, kết nối lại sau khi khóa webhook/runner thay đổi. Nếu gửi lỗi, xem token và lỗi API trong hộp gửi.
5. Thử `KB` + kịch bản (có thể xuống dòng), `TT`, `DS`, `KETNOI <mã>`, chọn phong cách/giọng. Máy dựng phải hoạt động để có MP4; webhook phản hồi được không chứng minh runner đã sẵn sàng.
6. Muốn nhận thông báo quản trị, tạo mã chủ web và nhắn `CHUWEB <mã>`. Liên kết chủ web không phải điều kiện để khách nhận phản hồi bot.

Connector này là **Zalo Bot Platform** (`bot-api.zaloplatforms.com`), như bản tham khảo. Không phải Zalo OA API; payload OA sẽ có chẩn đoán “không nhận diện”, cần adapter OA riêng nếu đó là loại bot đang dùng. Kiểm tra loại token và webhook trước khi kết luận lỗi đã nằm ở giao diện.

Cloudflare Worker cần gọi được `bot-api.zaloplatforms.com`. Trong môi trường cloud có allowlist riêng, phải cho phép host này nếu thực hiện kiểm tra live từ máy cloud. Tác vụ này chưa có token production nên không gọi bot thật hay thay webhook thật.

## Kiểm chứng

- `npm test`: **37 test đạt trên Node 24 và Node 22**, gồm 8 test Zalo với SQLite và API giả lập: nhận/trùng tin, gửi lỗi, retry, quota, tin không phải chữ, KB nhiều dòng/checkpoint, lỗi xử lý và tài khoản khóa.
- TypeScript, build web, kiểm tra JavaScript và `npm audit`: đạt, audit không có cảnh báo.
- Chromium desktop 1440px và mobile 390px: đã kiểm tra đăng nhập dev, trang quản trị Zalo/Máy dựng, bàn dựng nhận phase thật, video đến trạng thái done, nút tải và đóng; không có lỗi JavaScript page. Có thêm kiểm tra tìm kiếm/lọc lỗi/tải lại/chẩn đoán Zalo.
- Luồng local tạo → queue → renderer → R2 → tải MP4/SRT và range playback đã kiểm tra lại. TTS trong smoke test là mock im lặng.
- Chưa kiểm chứng token/webhook Zalo production, loại tài khoản thực tế, delivery từ Zalo thật hoặc tác vụ AI kéo dài trên Worker production.

Xem ảnh thật từ Chromium: [bàn dựng desktop](../out/reference-integration/render-desk-desktop.png), [mobile](../out/reference-integration/render-desk-mobile.png), [hoàn tất](../out/reference-integration/render-desk-done.png), [storyboard](../out/reference-integration/render-storyboard.png), [quản trị Zalo](../out/reference-integration/admin-zalo.png), [máy dựng](../out/reference-integration/admin-renders.png). Các ảnh ở output local, không có trong Git.

Test UI có thể chạy lại bằng `NV_API_URL=http://127.0.0.1:8787 npm run test:ui` khi Wrangler local đang chạy và có Chromium. Đặt `CHROMIUM_EXECUTABLE_PATH` nếu đường dẫn khác `/usr/bin/chromium`. Bài này chỉ chấp nhận localhost, dùng tài khoản dev thử và mock TTS; Playwright là dev dependency. Chưa chạy GitHub Actions hoặc deploy production trong phiên tích hợp này.

Với tác vụ AI dài: inbox cho phép thấy và phục hồi tác vụ bị ngắt, nhưng `waitUntil` vẫn có giới hạn runtime của Worker. Trước tải lớn, chuyển xử lý nặng sang consumer/worker có thời hạn phù hợp và kiểm thử fault injection; không coi việc persist inbox là bảo đảm hoàn thành mọi tác vụ.
