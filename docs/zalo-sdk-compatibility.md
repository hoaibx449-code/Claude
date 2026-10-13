# Đối chiếu webhook với SDK Zalo

Tham khảo: https://github.com/hvduong2k5/zalo-bot-java-sdk tại commit `f4ce1bc972e18990044f37af34ab21394ed369cd`.

README dùng header `X-Zalo-Signature`. `WebhookDispatcher.java` so sánh giá trị header trực tiếp với secret đã cấu hình, bằng phép so sánh constant-time; không tính HMAC của body. Ví dụ README đảo thứ tự đối số so với chữ ký `dispatch(body, secretTokenHeader)` trong mã nguồn, nên không sao chép nguyên ví dụ.

Worker nhận thêm `X-Zalo-Signature`, tiếp tục hỗ trợ `X-Bot-Api-Secret-Token` và query `s` cho chuyển tiếp Apps Script. Phải có ít nhất một secret; nếu nhiều nguồn cùng xuất hiện, tất cả phải đúng. Secret không được ghi vào log. Luồng dùng chung bot vẫn không thay webhook của web khác.

Kiểm thử dùng API giả lập: nhận payload snake_case của SDK, lưu inbox, gửi phản hồi, từ chối secret sai/xung đột, chống gửi trùng; giữ kiểm thử chuyển tiếp và thử lại phản hồi lỗi. Chưa xác minh nhận/gửi với bot thật trên production.

Sau khi triển khai: trong quản trị nhắn `GIUP` tới đúng bot, kiểm tra thời điểm gọi webhook, inbox và trạng thái phản hồi. Nếu dùng chung Apps Script, kiểm tra bản triển khai chuyển tiếp; không bấm chuyển webhook sang Worker. Nếu vẫn không có lần gọi, đây là lỗi đường chuyển tiếp/cấu hình phía Zalo, không phải bằng chứng Worker đã nhận tin.
