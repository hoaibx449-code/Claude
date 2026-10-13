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
   - Thay **toàn bộ** Code.gs bằng bản đã vá. Bản vá thêm ba hàm `_netveRelayUrl_`, `_netveChuyen_`, `_netveLaLenhFv_` và chỉ sửa bản `_fvZaloWebhook_ = function (e)` ở cuối tệp (bản đang chạy thật). `_fvZlLenhChu_` giữ nguyên.
   - Nét Vẽ chỉ được coi là đã nhận tin khi trả về `{"ok": true}`. Nếu Nét Vẽ từ chối hoặc không gọi được, web Apps Script tự trả lời như cũ, nên bot không bao giờ im lặng hay trả về "null".
   - Lưu địa chỉ vừa sao chép bằng **một** trong ba cách:
     - Thêm một dòng vào trang tính **CauHinh** của dự án: cột Key ghi `NETVE_RELAY_URL`, cột Value ghi địa chỉ. Cách này hợp khi Script Properties đã đầy. Cấu hình được đọc lại sau tối đa 5 phút.
     - Dán thẳng địa chỉ vào biến `var NETVE_RELAY_URL_ = '';` trong Code.gs.
     - Thêm khoá `NETVE_RELAY_URL` vào Script Properties, nếu còn chỗ.
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
