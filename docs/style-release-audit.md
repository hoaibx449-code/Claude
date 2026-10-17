# Rà soát luồng tạo video — 17/10/2026

Quyết định: chỉ mở tạo mới Whiteboard (bộ sketch trong engine chính) và Chữ chuyển động. Đây là hai ngôn ngữ hình ảnh có bộ xuất trình duyệt hiện hữu, không phải cam kết AI đã kết nối thành công. Cả hai cần AI thiết kế cảnh; lỗi AI phải dừng, không thay bằng mẫu/quy tắc.

| Dạng cũ | Quyết định | Lý do |
|---|---|---|
| classic-sketch | Đổi tên Whiteboard, dùng AI | Có bộ Canvas xuất được. AI trả bố cục theo từng câu, không dùng composer theo từ khoá để tạo mới. Giới hạn ở chữ, icon, sơ đồ, người que; không phải phim nhân vật. |
| kinetic | Giữ, tên Chữ chuyển động | Bộ dựng chữ hoạt động, yêu cầu AI chọn từ nhấn có trong lời đọc. Không quảng cáo là phim minh hoạ. |
| act | Bỏ tạo mới | Kịch bản tự suy ra diễn xuất/đạo cụ chưa bảo đảm đúng ý, demo dàn dựng tay không chứng minh luồng tự động. |
| split | Bỏ tạo mới | Hai cột cố định không giải quyết dựng nội dung đa dạng, trùng chức năng so sánh trong Whiteboard. |
| chat | Bỏ tạo mới | Gán người nói và danh tính theo quy tắc không đáng tin cho kịch bản bất kỳ. |
| data | Bỏ tạo mới | Không nên suy số/đơn vị từ văn bản rồi coi như video dữ liệu hoàn chỉnh. |
| quiz | Bỏ tạo mới | Suy đáp án và phương án nhiễu không bảo đảm chính xác; cần quy trình kiểm duyệt riêng. |
| classic-diagram | Gộp, bỏ lựa chọn riêng | Sơ đồ là một công cụ của Whiteboard, không phải một phong cách video cần chọn thêm. |
| classic/doodle | Bỏ tạo mới | Chọn tranh có sẵn theo từ khoá không hiểu toàn bộ ý kịch bản, dễ lặp. |
| story | Tiếp tục bỏ | Người que cũ lặp chuyển động, trùng mục đích với act. |
| director | Tiếp tục bỏ | Scene graph có giới hạn, dự phòng thành các hộp chữ. Không gọi nó là VOX. |
| whiteboard (addon riêng) | Tiếp tục bỏ | Máy dựng riêng chưa được xác minh production; khác bộ sketch trong engine chính. |
| illustrated | Tiếp tục bỏ | Cần AI ảnh/lớp và runner riêng; chưa có kiểm chứng đầu-cuối. |
| doc / VOX | Không mở | Chưa có luồng tư liệu, chọn tài sản, căn thời gian và xuất đủ tin cậy. Ảnh placeholder/chữ chuyển động không thay thế một video VOX. |
| Định dạng riêng dựa trên các dạng đã bỏ | Không công khai | Nhãn quản trị hoặc stage live không chứng minh bộ dựng đủ chất lượng. |

## Thay đổi hành vi

- Người dùng chọn phong cách và nhập chủ đề/kịch bản. Bỏ mẫu kịch bản, lựa chọn tự dựng theo luật và nút xem thử theo luật khỏi luồng tạo.
- Whiteboard dùng AI đặt vật thể trong không gian khai báo có giới hạn. Không sinh mã thực thi. Mô hình được hướng dẫn chọn cấu trúc theo nội dung, không buộc mọi video cùng hook/danh sách/CTA.
- Không tự chuyển sang composer khi AI lỗi hoặc hết ngân sách. Không tạo dự án nếu thiết kế thiếu hình, sai số cảnh, lặp nguyên thiết kế hoặc từ nhấn không có trong lời đọc.
- Thiết kế lại cảnh cũng gọi AI, kiểm tra hạn mức/ngân sách và phiên bản trước khi lưu. Cảnh cũ giữ nguyên nếu thất bại.
- Zalo không tự chuyển sang dựng miễn phí khi thiếu AI; chế độ trình duyệt trả liên kết mở dự án, không đưa việc vào hàng đợi Cloud.
- Dự án/video cũ được giữ. Chặn tạo mới các dạng đã bỏ ở API, không chỉ ẩn nút. Không xóa mã engine để tránh mất khả năng đọc dự án cũ.

## Giới hạn và bằng chứng

Kiểm tra engine 12 mẫu, 2 tỉ lệ, các thời điểm đầu/giữa/cuối cảnh không phát sinh lỗi vẽ. Đây là kiểm tra kỹ thuật, không xác nhận đúng nghĩa câu chuyện hoặc chất lượng AI. Whiteboard sketch và kinetic có đường xuất Canvas/MediaRecorder; bản thử trình duyệt trước đó xuất được MP4 H264 720×1280. Các mẫu addon riêng không được coi là đã xuất production thành công.

Kết nối production đã ghi nhận OpenAI trả 401 và Gemini từ chối vị trí; giọng AI cũng lỗi ở lần xuất mẫu trước. Không đổi khoá, không vượt hạn chế vùng. Cần khôi phục kết nối AI hợp lệ trước khi xác nhận luồng tự thiết kế hoạt động đầu-cuối. Kiểm tra cấu trúc không thể bảo đảm AI hiểu đúng mọi nội dung hoặc tạo video hay như một biên tập viên.
