# Bán giải pháp một lần

Trong Quản trị → Giải pháp, chọn Chi phí: Trả phí và nhập giá nguyên VND (ví dụ 99000). Chế độ miễn phí tiếp tục như trước.

Nội dung giới thiệu, ảnh, demo và điều kiện chuẩn bị là công khai. Hướng dẫn sử dụng, lịch sử phiên bản và tài nguyên chỉ hiện sau khi mua; không đặt bí mật trong phần giới thiệu công khai. Tệp, mã sao chép và liên kết tài nguyên đều được ẩn khỏi HTML công khai. Với công cụ đặt trên hệ thống bên ngoài, việc mở khóa liên kết không thay thế giấy phép hoặc xác thực của công cụ đó.

Khách đăng nhập và bấm Mua giải pháp, thanh toán VietQR theo cấu hình ngân hàng hiện tại. SePay hoặc quản trị xác nhận chuyển khoản. Đơn được đánh dấu paid trong cùng giao dịch SQLite với kiểm tra mã biên nhận; quyền truy cập được xác định trực tiếp từ đơn paid, không có bản sao quyền có thể lệch trạng thái. Đơn pending/cancelled/expired không cấp quyền. Không tạo lại đơn mua cho sản phẩm đã sở hữu.

Popup tài khoản có mục Giải pháp đã mua. Quyền không hết hạn theo gói video hoặc credit. Sản phẩm retired vẫn phục vụ người đã mua; draft không công khai. Không có thuê bao định kỳ trong phiên bản này.

HTML công khai không chứa dữ liệu mở khóa ngay cả khi trình duyệt đã đăng nhập. Nội dung riêng được lấy qua API có kiểm tra phiên và tài khoản bị chặn; tệp trả phí dùng API thay vì đường dẫn tệp công khai. Chatbot không đọc hướng dẫn riêng. Service worker không lưu tài nguyên hoặc nội dung riêng.

Kiểm tra: test/solution-purchases.test.ts và tools/check-solutions-ui.mjs dùng SQLite/tệp/đơn thanh toán giả lập, không gửi tiền hoặc xác nhận đơn thật.
