# Dùng chung một bot Zalo với web khác

Một bot Zalo (Zalo Bot Platform) chỉ có **một webhook**. Nếu đã có một web khác chạy tốt với bot
(ví dụ web Apps Script FACIUP), thì cứ để webhook ở web đó. Web đó chuyển tiếp sang Nét Vẽ những
tin nhắn nó không xử lý, và Nét Vẽ trả lời bằng cùng token bot. Hai web không còn giành nhau webhook.

```
Zalo ──webhook──▶ web Apps Script ──(tin không phải của nó)──▶ Nét Vẽ /api/zalo/webhook?s=…
                         │                                              │
                         └──── trả lời bằng token bot ◀── cùng token ───┘
```

## Cài đặt

1. **Nét Vẽ → Quản trị → Zalo:**
   - Ở mục Cách nhận tin nhắn, chọn chế độ **"Dùng chung bot với web khác (nhận chuyển tiếp)"** rồi lưu.
   - Ở mục Khoá API, dán **đúng token của bot** mà web kia đang dùng.
   - Mở mục **"Dùng chung một bot Zalo"** và sao chép **địa chỉ chuyển tiếp**. Giữ bí mật địa chỉ này vì nó chứa mã xác thực.
2. **Web Apps Script:**
   - Dán bản vá Code.gs. Bản vá thêm hai hàm `_netveRelayUrl_`, `_netveChuyen_` và sửa `_fvZaloWebhook_`, `_fvZlLenhChu_`.
   - Vào Cài đặt dự án → Script Properties, thêm khoá `NETVE_RELAY_URL` với địa chỉ vừa sao chép.
   - Triển khai lại, giữ nguyên URL `/exec`.
3. Nhắn `HUONGDAN` cho bot, rồi bấm **Kiểm tra lại** trong trang quản trị Nét Vẽ.

## Ai trả lời tin nào

- **Web Apps Script giữ lại:**
  - Lệnh của chủ web: `duyet`, `huy`, `don`, `giup`.
  - Mã `KETNOI` do chính web đó cấp.
- **Nét Vẽ nhận mọi tin còn lại:**
  - `KB`, `TAO`, `HUONGDAN`, `TT`, `DS`…
  - Mã `KETNOI` của Nét Vẽ.
  - Ảnh, sticker và tin nhắn thoại.

Khi chưa cài `NETVE_RELAY_URL`, web Apps Script chạy y như trước.

## Vì sao trước đây không chạy

- **Hai web dùng chung token:** chế độ "hỏi định kỳ" của Nét Vẽ từng xoá webhook của bot mỗi phút để tự đọc tin, làm web kia im lặng. Giờ Nét Vẽ không bao giờ xoá webhook của tên miền khác. Ở chế độ dùng chung, Nét Vẽ cũng không đổi webhook và không hỏi định kỳ.
- **Zalo có thể không gọi tới được Worker** (ví dụ do tường lửa). Lời gọi từ Apps Script (máy chủ Google) sang Nét Vẽ là lời gọi thường giữa hai máy chủ, nên không gặp vấn đề này.
