# Rà soát định dạng — 16/10/2026

Danh mục công khai còn 8 cách kể: hoạt hình kể chuyện, sketchnote, biểu đồ vẽ tay, chữ chuyển động, so sánh hai bên, hội thoại, số liệu, đố vui. Đây là các cách trình bày khác nhau; không phải 8 mô hình AI tạo video.

| Định dạng | Quyết định | Lý do và giới hạn |
|---|---|---|
| act | Giữ | Bộ dựng người/đạo cụ chạy được; demo được viết storyboard riêng nên không đại diện cho chất lượng mọi kịch bản tự động. |
| classic-sketch | Giữ | Bố cục vẽ tay từ quy tắc; dùng thư viện vật thể có sẵn, không hiểu mọi ý tưởng như con người. |
| classic-diagram | Giữ | Phù hợp số liệu có sẵn; cần kiểm tra nhãn, đơn vị trước xuất. |
| kinetic | Giữ | Chữ chuyển động; không quảng cáo là hoạt hình minh họa. |
| split | Giữ, sửa logic | Bỏ gán “Cách sai/Cách đúng” khi kịch bản không có đánh giá đó; mặc định dùng Bên A/Bên B. |
| chat | Giữ | Hội thoại giả lập; không tự suy ra chính xác danh tính người nói. |
| data | Giữ, sửa bố cục | Thu biểu đồ theo số hàng để thanh cuối không đè phụ đề, đặc biệt khung ngang. Không dùng cho dữ liệu thiếu đơn vị mà chưa duyệt. |
| quiz | Giữ có giới hạn | Bộ miễn phí suy ra đáp án từ câu kế tiếp và tự tạo phương án nhiễu số học. Phải duyệt câu hỏi/đáp án trong bàn dựng. |
| director | Tạm ẩn | Kết nối AI thực tế đang lỗi; dự phòng tạo các hộp chữ lặp lại tiêu đề/lời đọc, chưa đạt yêu cầu kể chuyện thông minh. |
| whiteboard | Tạm ẩn | Unit test bộ dựng riêng qua cả hai tỉ lệ; chưa xác minh được máy xuất riêng đang hoạt động. Không coi unit test là xuất video production thành công. |
| illustrated | Tạm ẩn | Cần AI thiết kế lớp và tạo ảnh, máy dựng riêng. Chưa đủ điều kiện vận hành; chuyển động toàn ảnh không phải rig nhân vật/phim từng khung. |
| doc | Tạm ẩn | Demo chưa có ảnh chỉ hiện placeholder; AI ảnh đang không hoạt động. Không nên mở bán như một định dạng hoàn chỉnh. |
| story | Giữ ẩn | Nhân vật người que cũ trùng mục đích với act, chuyển động đơn giản và lặp. |
| classic (doodle) | Bỏ mục chọn riêng | Bộ ảnh có sẵn dựng được, nhưng trùng nhóm vẽ tay; tiếp tục đọc dự án cũ và dùng qua lựa chọn tự động. |

Migration cấu hình `rev:3` tạm ẩn 5 chế độ chưa đạt cho cài đặt cũ. Quản trị có thể bật lại sau khi xác minh AI và máy dựng. Không xóa mã nguồn, dự án, video hay dữ liệu khách hàng. Định dạng riêng dùng bộ dựng đang ẩn cũng không hiện công khai.

## Kiểm tra

`node tools/audit-formats.mjs <thư-mục-đầu-ra>` tạo contact sheet và JSON. Đã render 12 mẫu engine ở 2 tỉ lệ, kiểm tra đầu/giữa/cuối của từng cảnh; 24/24 bộ khung không phát sinh lỗi. Whiteboard có test riêng. Illustrated đã có kiểm tra routing/layout trong test suite; không có ảnh AI thật cho kiểm chứng đầu-cuối. Các kiểm tra này không xác nhận lời đọc, chất lượng AI hoặc xuất hàng đợi thật.

Trang định dạng hiển thị đầy đủ 9:16 mặc định, đổi sang 16:9 bằng cách dựng lại mẫu ở tỉ lệ mới. Trang cộng đồng lọc tỉ lệ ở API trước giới hạn 24 video; tránh tab ngang rỗng chỉ vì 24 video mới nhất đều dọc. Video dùng object-fit contain.

Chặn vận hành đã ghi nhận: OpenAI trả 401 do khóa không hợp lệ; Gemini trả lỗi vị trí không được hỗ trợ. Không tự đổi khóa hoặc vượt hạn chế vùng. Workflow cập nhật Cloud Run bị từ chối push vì dự án Google Cloud chưa bật billing; việc triển khai web không đồng nghĩa máy xuất đã được cập nhật.
