# Tạo video theo mô tả sáng tạo

Luồng web thay danh mục định dạng cố định bằng gợi ý sáng tạo. Người dùng nhập chủ đề hoặc lời đọc, mô tả kết quả mong muốn, rồi tuỳ chọn hướng tham khảo. VOX, Whiteboard, chữ chuyển động và tối giản là câu gợi ý gửi AI; không gắn với một mẫu cảnh hay ép chọn bộ dựng tương ứng.

AI chọn nhịp, bố cục từng cảnh, cách dùng chữ/hình, mode và bảng màu trong khả năng engine. Kịch bản có sẵn được giữ nguyên lời. Đầu ra phải có mô tả hướng dựng và giới hạn liên quan; server kiểm tra cấu trúc, danh sách khả năng hỗ trợ và thiết kế trước khi lưu dự án. Không dùng fallback theo mẫu khi AI lỗi. Bản nháp chưa tự xuất video.

Trong bàn dựng, phần Hướng dựng AI hiển thị kết quả dự kiến. Người dùng gửi góp ý bằng lời; AI trả đề xuất giữ nguyên lời đọc. Chỉ bấm Áp dụng đề xuất mới lưu. Phiên bản dự án được kiểm tra để tránh ghi đè chỉnh sửa mới hơn; lỗi hoặc đóng đề xuất giữ nguyên bản hiện tại. Hướng dẫn và tối đa năm góp ý gần nhất được lưu cùng spec, không cần migration database.

Giới hạn thực tế: đường sáng tạo này dùng Canvas, chữ, icon, sơ đồ, biểu đồ và người que. Nó không có tìm clip tư liệu, quay phim thật, ảnh chân thực tự sinh, 3D hoặc lip-sync. VOX có thể là cảm hứng về biên tập giải thích bằng đồ hoạ, không được hứa có tư liệu hình ảnh chưa tồn tại. Nếu mong muốn bắt buộc một khả năng không hỗ trợ, AI cần trả cannotFulfill và API báo 422, không tự thay bằng một video khác ý. Việc nhận diện mọi yêu cầu vượt khả năng vẫn phụ thuộc mô hình; đây không phải bảo đảm AI hiểu đúng mọi mong muốn.

Đây là thay đổi luồng sáng tạo, chưa thay thế toàn bộ engine hoặc nâng chất lượng hình ảnh lên ngang các công cụ sinh video chuyên dụng. Máy xuất vẫn theo lựa chọn Cloud / máy cá nhân / trình duyệt. Lượt thiết kế và góp ý dùng hạn mức/ngân sách AI hiện có.
