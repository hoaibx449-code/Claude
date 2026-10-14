# Bot Zalo chạy độc lập

Nét Vẽ tự giữ bot Zalo (Zalo Bot Platform), không qua web nào khác. Cách làm theo
[zalo-bot-java-sdk](https://github.com/hvduong2k5/zalo-bot-java-sdk):

- **Webhook trực tiếp:** dùng cho production. Zalo gọi thẳng tới `https://<tên miền>/api/zalo/webhook`.
- **Hỏi định kỳ (long polling, `getUpdates`):** dùng khi không đặt được webhook.

```
Zalo ──webhook (X-Bot-Api-Secret-Token)──▶ Nét Vẽ /api/zalo/webhook ──sendMessage──▶ Zalo
```

## Cài đặt

1. **Quản trị → Zalo → Khoá API:** dán Zalo Bot token (lấy trong Zalo Bot Creator).
2. **Cài đặt Zalo:**
   - Bật "Bật tạo video qua Zalo".
   - Dán đường dẫn bot `https://zalo.me/...`.
   - Lưu.
3. **Cách nhận tin nhắn:** chọn **Webhook trực tiếp**, rồi lưu.
4. Bấm **Kết nối webhook** khi đang mở trang quản trị bằng tên miền HTTPS thật.
   - Web gọi `setWebhook` với `url` và `secret_token`, giống `SetWebhookRequest` của SDK.
   - Bot chỉ có **một** webhook. Nếu trước đây webhook trỏ về Apps Script hay web khác, thao tác này chuyển bot về Nét Vẽ.
   - Không cần sửa Apps Script nào.
5. Nhắn `HUONGDAN` cho bot, rồi bấm **Kiểm tra lại**.
6. Tạo mã chủ web và gửi `CHUWEB <mã>` cho bot để nhận thông báo quản trị.

## Xác thực webhook

Giống `WebhookDispatcher` của SDK: web so sánh mã bí mật nguyên văn, bằng phép so sánh thời gian hằng.

- Web nhận mã ở header `X-Bot-Api-Secret-Token` (header Zalo gửi kèm `secret_token`) hoặc `X-Zalo-Signature` (tên header trong ví dụ của SDK).
- Địa chỉ webhook đã đăng ký cũng mang mã ở `?s=`. Đây là phương án dự phòng.
- Mã sai hoặc thiếu thì web vẫn trả HTTP 200 với `ok: false`, để Zalo không ngừng gọi, và ghi lý do vào nhật ký.

Nội dung Zalo gửi tới có dạng `Update` của SDK:

```json
{ "event_name": "message.text.received",
  "message": { "message_id": "...", "chat": { "id": "...", "chat_type": "PRIVATE" },
               "from": { "id": "...", "display_name": "..." }, "text": "..." } }
```

Dạng bọc `{ "ok": true, "result": { ... } }` (trả về từ `getUpdates`) cũng đọc được.

## Lệnh trong Zalo

Gõ có dấu hay không dấu, có cách hay không cách đều được. Ví dụ "Hướng dẫn", "Trạng thái", "Hủy kết nối", "Định dạng 2".

| Lệnh | Việc |
|---|---|
| `HUONGDAN` | Xem cách dùng |
| `KB` + kịch bản | Dựng video từ kịch bản |
| `TAO` + chủ đề | AI viết kịch bản rồi dựng |
| `MAU` | Kịch bản mẫu |
| `TT` | Tiến độ và link video |
| `DS` | Video gần đây |
| `KHUNG DOC` / `KHUNG NGANG` | Đổi khung hình |
| `DINHDANG` | Chọn định dạng video |
| `GIONG` | Chọn giọng đọc |
| `TAT` / `BAT` | Tắt / bật thông báo |
| `KETNOI` + mã | Gắn với tài khoản web |
| `HUYKETNOI` | Bỏ liên kết |

Việc cần AI (`TAO`, hoặc `KB` khi minh hoạ bằng AI) có thể mất hơn 30 giây. Cloudflare chỉ cho lời gọi webhook chạy thêm chừng đó sau khi trả lời Zalo.

- Bot trả lời "Đã nhận" ngay.
- Tác vụ chạy mỗi phút làm tiếp phần AI.
- Tin lỗi và phản hồi chưa gửi được cũng được thử lại mỗi phút, tối đa 5 lần.

## Khi bot im lặng

Mở Quản trị → Zalo → **Kiểm tra lại** và sửa theo mục báo ✗:

1. Webhook đang trỏ về web khác: bấm **Kết nối webhook**.
2. Zalo chưa gọi tới:
   - Trong Zalo Bot Creator, bật sự kiện `message.text.received`.
   - Trên Cloudflare, tắt Bot Fight Mode / Under Attack cho `/api/zalo/webhook`.
3. `RUNNER_TOKEN` đổi thì mã bí mật cũng đổi: bấm **Kết nối webhook** lại.
4. Vẫn không được thì chọn **Hỏi định kỳ**: web tự hỏi Zalo mỗi phút.
   - Chế độ này không tự xoá webhook của tên miền khác. Phải bấm Kết nối webhook hoặc tự xoá trong Bot Creator.
