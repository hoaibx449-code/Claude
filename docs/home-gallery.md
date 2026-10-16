# Trình diễn video trang chủ

Vào **Quản trị → Nội dung → Trang chủ: trình diễn video**.

- Bấm **Tải nhiều video** để chọn nhiều MP4/WebM cùng lúc; tối đa 12 video trong danh sách, mỗi tệp tối đa 60 MB. Khuyến nghị H.264 dưới 10 MB để tải nhanh trên điện thoại.
- Có thể thêm từng mục bằng **+ Thêm video trình diễn**, tải tệp hoặc dán URL HTTPS.
- Đặt tiêu đề, ảnh bìa; dùng **↑ Lên** đổi thứ tự hoặc **Bỏ video** gỡ mục khỏi danh sách.
- **Ảnh/video mở đầu** là mục cũ, vẫn hiện trước danh sách nếu được cấu hình. Bỏ trống nếu muốn chỉ dùng danh sách mới.
- Bấm **Lưu cài đặt**. Tải tệp chưa đồng nghĩa nội dung đã được xuất bản; cần lưu cấu hình. Gỡ mục khỏi danh sách không xóa vĩnh viễn tệp đã tải.

Trang chủ giữ nguyên khung chứa và hiển thị trọn nội dung bằng contain, nên video ngang có khoảng nền trong khung dọc. Từ hai mục, trình diễn tự chuyển sau khi video phát hết; ảnh giữ 8 giây. Video lỗi được bỏ qua sau khoảng 8 giây, một video đơn không tự chuyển. Có nút trước/sau, chấm chọn và dừng/tiếp tục; video có điều khiển âm thanh riêng và khởi đầu tắt tiếng.

Tự chuyển dừng khi rê chuột/đặt tiêu điểm vào vùng trình diễn. Rời vùng đó để tiếp tục. Khi người dùng yêu cầu giảm chuyển động, trình diễn khởi đầu ở trạng thái dừng. Ra khỏi vùng nhìn thấy hoặc ẩn tab thì video tạm dừng; đổi trang giải phóng bộ hẹn giờ và dừng video.

Khi không có tệp nào được cấu hình, trang chủ dùng mẫu Canvas hiện có. Video cũ và thiết lập mở đầu vẫn được giữ; URL trùng nhau chỉ xuất hiện một lần. Nội dung, địa chỉ Zalo và thông tin nhân viên không bị tự thay đổi. Nút công khai dùng “Tư vấn qua Zalo”, không quảng cáo nhân viên trực 24/7 khi chưa có thông tin xác nhận.

Nút chọn định dạng trước đây luôn xanh ở thẻ đầu tiên do selector CSS nth-child(n+2) chỉ làm trắng các thẻ sau. Đã thống nhất nút trắng cho mọi thẻ; xanh khi hover/focus tương tác, không ngụ ý đã chọn định dạng đầu.

Kiểm tra: playlist/config round trip, chu kỳ kết thúc và phát lại video, tạm dừng và cleanup; thử hai tệp 9:16/16:9 qua API upload local và giao diện trình duyệt. Không đưa các clip thử lên production.

Tham khảo điều khiển chuyển động và bàn phím: https://www.w3.org/WAI/tutorials/carousels/
