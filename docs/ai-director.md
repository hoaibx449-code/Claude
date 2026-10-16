> Cập nhật 16/10/2026: director tạm ẩn khỏi tạo mới theo đợt rà soát rev 3. Xem [kết quả rà soát](format-audit.md). Chỉ bật lại khi AI và máy xuất đã được xác minh.

# AI đạo diễn và giao diện gọn

Chế độ `director` thiết kế từng cảnh bằng đồ thị hình ảnh: nhãn, icon, vị trí,
kích thước, liên kết, cách vào hình và thời điểm theo câu. `composition` mô tả
ý đồ, không chọn một template cố định. Các định dạng cũ vẫn đọc được.

Khi chọn **AI chọn cách kể**, dự án mới dùng director nếu quản trị bật chế độ
này. AI nhận chuỗi bố cục của tối đa 5 dự án gần đây; có một lượt sửa storyboard
nếu thiết kế chồng vật hoặc lặp. Nhãn và liên kết được kiểm tra trước khi lưu.
Nếu không gọi được AI, hệ thống dùng quy tắc nội dung; không đảm bảo sáng tạo
ngang với một storyboard được AI thiết kế và con người duyệt.

Trong bàn dựng, **AI rà soát** gửi tối đa 6 khung hình xem trước và storyboard
cho nhà cung cấp AI đã cấu hình. Tính 1 lượt AI, ghi chi phí API. Kết quả là đề
xuất; bấm Áp dụng mới lưu, giữ nguyên lời đọc. Bản đã bị chỉnh trong lúc chờ
không được ghi đè. Kiểm tra này lấy mẫu hình, không kiểm tra toàn bộ chuyển động
hay âm thanh. Timeline xem trước vẫn ước tính; bản xuất căn theo audio thực tế.

Trang chủ chỉ giới thiệu và phát một mẫu. Danh mục, tạo video, trợ giúp và giá
có trang riêng. Trang tạo video ưu tiên nội dung, cách kể, giọng và khung hình;
thông số phụ nằm trong Nâng cao. Mô tả mở bằng `?` có hỗ trợ bàn phím/Escape.
Tiêu đề ngắn, xuống dòng tự nhiên; các đoạn mô tả căn đều. Không ép chữ dài
thành một dòng bằng cắt chữ hoặc giảm font quá nhỏ.

## Kiểm tra và triển khai

```
npm ci
npm test
npm run typecheck
npm run web:build
# Khi wrangler dev đã chạy DEV_LOGIN=1 và đã áp schema local:
node tools/check-director.mjs
npm run render -- examples/ai-director/project.json --tts mock --out out/director.mp4
```

`mock` không có lời đọc, chỉ dùng kiểm tra hình và encode. API AI được kiểm tra
bằng mock trong test; cần cấu hình khoá thực để đánh giá chất lượng sáng tạo.

Triển khai cả **Triển khai web** và **Cập nhật bộ dựng hiện có** từ cùng commit.
Workflow cập nhật bộ dựng chỉ thay image Cloud Run Job đã tồn tại, giữ cấu hình
dịch vụ và thông tin kết nối. Không cần migration dữ liệu riêng cho director.
Service worker đổi phiên bản cache; reload trang sau triển khai.

Trên Windows, kiểm tra SQLite dùng `python` (hoặc biến `PYTHON`), các kiểm tra
media cần `ffmpeg` và `ffprobe` trên PATH. Bài kiểm tra giả lập lỗi encoder bằng
shell POSIX chỉ chạy trên Linux/macOS; CI Linux vẫn chạy bài đó.
