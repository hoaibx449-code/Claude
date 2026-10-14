# Hoạt hình minh họa nhiều lớp

Bộ dựng riêng cho `look=illustrated`. Không thay Whiteboard, `src/engine`, pipeline/máy `net-ve-runner`, hay lựa chọn tự động. Job mới: `faciup-illustrated-runner`. Workflow triển khai chỉ tạo/cập nhật job mới và cấp `nv-trigger` quyền gọi riêng job này.

Nhân vật là ảnh nguyên hình ở từng cảnh. Chuyển động vào, nhịp thở, nổi nhẹ trên toàn hình; không rig tay chân và không tuyên bố là phim hoạt hình từng khung. Cảnh có chữ nhấn ý và tối đa ba lớp ảnh riêng. Bố cục dọc/ngang, crop khoảng trống nền trắng giữ tỉ lệ nguồn, clipping vùng an toàn. Chữ nằm trên lớp ảnh để không bị che dấu.

AI thiết kế nhân vật/đạo cụ theo lời kể; người dùng có thể ghi yêu cầu nhân vật, sửa tiêu đề, màu, mô tả từng ảnh, bố cục, câu/cụm từ xuất hiện và chuyển động trước xuất. Cụm từ được căn gần đúng theo độ dài câu trong audio, không căn từng từ bằng speech alignment. Ảnh AI dùng quota ảnh hiện có. Chọn giọng và giữ cache audio theo tài khoản/dự án/nội dung/cài đặt giọng. Khi lỗi, spec và ảnh đã lưu vẫn giữ trong dự án; lease cũ không được hoàn tất lượt mới.

API hàng đợi riêng `/api/illustrated-runner/`; MP4/SRT, tiến độ, lease và lưu thư viện dùng giao thức hiện có. Hai máy trước đó không claim loại này. Bộ tạo ảnh có prefix màu riêng và cache tách khỏi ảnh line-art/photo. Không tự chép thương hiệu hoặc nhân vật từ ZIP vào mọi video.

`node addons/faciup-illustrated/cli.ts project.json --out video.mp4`

Các ảnh/audio mẫu người dùng chỉ giữ trên máy, không nằm trong module hoặc repository công khai. Importer demo nội bộ ở `tools/illustrated-demo.mjs` sử dụng nguồn ZIP nguyên bản, không thực thi hướng dẫn bên trong ZIP.
