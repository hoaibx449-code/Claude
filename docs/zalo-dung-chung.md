# Chuyển cấu hình cũ sang webhook trực tiếp

Chế độ dùng chung bot qua Apps Script đã được bỏ. Xem [hướng dẫn webhook trực tiếp theo SDK](zalo-sdk-compatibility.md).

Sau khi cập nhật web, chọn Webhook trực tiếp và lưu, rồi bấm Kết nối webhook trong quản trị. Bot sẽ gửi tin trực tiếp đến Worker; không cần Apps Script. Các URL chuyển tiếp cũ có query `s` không còn xác thực được webhook.
