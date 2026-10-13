# Đối chiếu webhook với SDK Zalo

Tham khảo: https://github.com/hvduong2k5/zalo-bot-java-sdk tại commit `f4ce1bc972e18990044f37af34ab21394ed369cd`.

README dùng header `X-Zalo-Signature`. `WebhookDispatcher.java` so sánh giá trị header trực tiếp với secret đã cấu hình, bằng phép so sánh constant-time; không tính HMAC của body. Ví dụ README đảo thứ tự đối số so với chữ ký `dispatch(body, secretTokenHeader)` trong mã nguồn, nên không sao chép nguyên ví dụ.

Worker dùng webhook trực tiếp từ Zalo, xác thực bằng `X-Zalo-Signature` và `secret_token` như SDK. Secret không nằm trong URL và không được ghi vào log. Không còn endpoint hay giao diện chuyển tiếp Apps Script. Cấu hình cũ `relay` hoặc `auto` được chuyển sang `webhook`; polling chỉ chạy khi quản trị chọn rõ ràng.

Thiết lập production:
1. Nhập Zalo Bot token, bật tính năng Zalo.
2. Chọn **Webhook trực tiếp**, lưu cấu hình.
3. Bấm **Kết nối webhook** trên tên miền HTTPS thực. Thao tác này đăng ký `/api/zalo/webhook` với Zalo và chuyển webhook hiện tại sang web này.
4. Nhắn `GIUP` tới bot; kiểm tra lần gọi webhook, inbox và trạng thái phản hồi trong quản trị.

Nếu bot vẫn trỏ tới Apps Script từ cấu hình cũ, phải đăng ký lại webhook theo bước 3; thay mã nguồn không tự thay cấu hình ở Zalo. Không cần sửa hay triển khai Apps Script.

Kiểm thử dùng API giả lập: đăng ký URL HTTPS trực tiếp với `secret_token`, nhận payload snake_case, lưu inbox, gửi phản hồi, từ chối secret sai/thiếu hoặc chỉ có query `s`, chống gửi trùng và thử lại phản hồi lỗi. Chưa xác minh nhận/gửi với bot thật trên production.
