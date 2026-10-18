# Quản lý Zalo chủ web và người nhận ảnh

Quản trị → Zalo → **Chủ web & người nhận thông báo** hiển thị tên Zalo, email/tài khoản web liên kết (nếu có), Zalo chat ID, vai trò đang hoạt động/đã gỡ và trạng thái đăng ký ảnh riêng biệt. Tên chỉ lấy từ liên kết, cuộc trò chuyện hoặc tên đã biết; nếu chưa có bằng chứng thì ghi Chưa có tên, không đoán danh tính người nhận.

Danh sách có nút thêm Zalo đã liên kết/đã nhắn bot, gỡ chủ web và tạo mã CHUWEB để thêm Zalo mới. Quyền này là quyền chủ web của bot và người nhận thông báo vận hành; không tự thêm/xóa quyền quản trị website. Quyền web quản lý tại Cài đặt. Không cho thêm chat ID chưa từng được xác định; mã CHUWEB có hạn 30 phút, dùng một lần.

Lần khởi tạo đầu, danh sách sao chép Zalo chủ web và Zalo quản trị đang nhận tin theo cơ chế cũ để không mất thông báo đột ngột. Sau đó chỉ đọc danh sách tường minh: quản trị mới liên kết Zalo không tự nhận thông báo, Zalo bị gỡ không được tự thêm lại khi tải trang hoặc lưu cấu hình cũ. Gỡ sẽ ngừng các thông báo chủ web mới và hủy các thông báo chủ web còn pending/failed trong outbox; không thu hồi được tin đã gửi. Web Push cũng chỉ dùng các tài khoản liên kết với chủ web đang hoạt động. Xóa tài khoản web sẽ vô hiệu vai trò chủ web của Zalo liên kết tài khoản đó.

Vai trò chủ web không tự đăng ký nhận ảnh. Chỉ danh sách `image_feed_subscribers` có `active=1` được dùng làm người nhận ảnh theo lịch, theo đúng chat ID đã đăng ký; gửi NHẬN ẢNH để bật và HỦY NHẬN ẢNH để dừng. Gỡ chủ web không tự hủy lựa chọn nhận ảnh đã đăng ký; trạng thái được thể hiện riêng và có thể hủy tại mục Ảnh Zalo từ Sheet.

**Gửi thử ảnh** chỉ gửi tới Zalo liên kết với chính tài khoản quản trị đang đăng nhập. Không còn fallback sang Zalo chủ web và không chấp nhận chat ID tùy ý từ request. Giao diện ghi tên + 6 ký tự cuối chat ID để phân biệt tài khoản trùng tên. Nếu chưa liên kết thì yêu cầu liên kết đúng Zalo trước. Khi liên kết đã đổi, yêu cầu gửi thử đang chờ tới chat cũ bị hủy. Yêu cầu thử do chính quản trị bấm không cần NHẬN ẢNH, có tiền tố [Gửi thử] và không đưa ảnh vào hàng gửi chung.

Đây là hai cơ chế cũ có thể gây nhầm: (1) thông báo chủ web từng gửi cả claimed owner và mọi linked admin, (2) gửi thử ảnh từng fallback sang claimed owner khi người bấm chưa liên kết Zalo. Không kết luận một tin cụ thể là gửi sai theo lịch nếu chưa đối chiếu chat ID, lịch sử giao nhận và tiền tố [Gửi thử].
