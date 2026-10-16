# Chọn nơi dựng video

Quản trị → Cài đặt & khoá API → Máy dựng video → Nơi dựng video:

- Cloud: đưa việc vào hàng đợi và kích hoạt Google Cloud Run.
- Máy cá nhân: đưa việc vào hàng đợi, không gọi Google Cloud; PC/VPS chạy `npm run runner` chủ động nhận việc.
- Trình duyệt: xuất trực tiếp bằng Canvas + Web Audio + MediaRecorder. Giữ tab ở phía trước. Tải tệp về máy; bản tạm thời chưa lưu kết quả vào thư viện server và chưa trộn nhạc nền/hiệu ứng.

Cài đặt hiện có mặc định Cloud; quản trị chọn Trình duyệt và lưu để tạm dùng. Cron không đánh thức Cloud Run trong hai chế độ còn lại. Không xóa việc cũ hoặc cấu hình Google Cloud. Zalo không thể tự xuất bằng trình duyệt; hệ thống hướng dẫn mở dự án trên web.

Trình duyệt thử MP4 trước; nếu không hỗ trợ thì xuất WebM đúng tên và MIME, không đổi đuôi để giả MP4. Hỗ trợ tối đa 3 phút, 720p, mục tiêu 24fps (tốc độ thực tế phụ thuộc thiết bị), giới hạn bộ đệm 120 MB. Cần thiết bị đủ tài nguyên, tab không bị ẩn/ngủ. Bị gián đoạn sẽ báo lỗi; không báo thành công cho bản bị hủy.

Giọng AI: endpoint riêng lấy nội dung từ dự án của chính tài khoản, dùng khoá đã lưu trên máy chủ; không chuyển khoá vào JavaScript. Hiện hỗ trợ EverAI hoặc Google TTS có khoá riêng. Cache giọng theo tài khoản/nội dung/cấu hình, kiểm tra ngân sách, hạn mức và ghi chi phí. Không tự dùng service account Google Cloud làm đường dự phòng. Khi dịch vụ lỗi, chọn Giọng của tôi để tải MP3/M4A/WAV hoặc chủ động chọn Không lời. Không âm thầm bỏ lời đọc.

Giọng tải lên được chia cảnh theo trọng số độ dài câu, chưa phải căn từng từ bằng speech alignment. SRT căn theo audio đã giải mã; bố cục và chuyển động dùng engine hiện có. TTS từng cảnh được phát đúng thời điểm trên timeline. Âm thanh không cần thu màn hình hay micro.

Tài liệu nền tảng: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static và https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
