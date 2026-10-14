# FACIUP Whiteboard — bộ dựng bổ sung

Bộ dựng này nằm riêng và không thay thế `src/engine/render.ts`, `src/node/pipeline.ts`, `src/cli/runner.ts`, API hàng đợi, giao diện hoặc workflow triển khai hiện có.

Chạy từ thư mục gốc repository:

```sh
node addons/faciup-whiteboard/cli.ts examples/faciup-whiteboard/project.json --out out/whiteboard.mp4 --tts everai
node --test addons/faciup-whiteboard/renderer.test.ts
```

Node >=22.18, dependency Canvas của repository, FFmpeg và ffprobe. Giọng lấy từ biến môi trường hiện có. `--tts mock` chỉ dùng kiểm tra hình, không phải giọng thật. Audio tải lên được dùng nguyên bản qua `audio.voice=upload` và `audio.voiceFile`; không gửi API key trong project JSON.

Đầu vào: project `look=whiteboard`, ratio 9:16 hoặc 16:9, mỗi cảnh có `lines`, `panels:[]`, `whiteboard:{title,meaning,objects}`. Đối tượng được kiểm tra bằng schema trước dựng. Có hình custom bằng tọa độ hữu hạn; không thực thi mã AI.

Ảnh bàn tay do chủ FACIUP cung cấp. Font Patrick Hand có giấy phép OFL kèm assets. Không tự thêm thương hiệu/tập/nhân vật hoặc phụ đề bên dưới.

Web có lựa chọn **Whiteboard vẽ tay đa sắc**. API `/api/whiteboard-runner/claim` chỉ giao video `look=whiteboard` cho job `faciup-whiteboard-runner`. Claim của máy cũ bỏ qua riêng loại mới này; tất cả định dạng cũ giữ tuyến cũ. Hai máy dùng chung giao thức lease, tiến độ, lưu MP4/SRT và thông báo để người dùng vẫn có một thư viện video.

Workflow `Triển khai máy Whiteboard bổ sung` tạo Cloud Run Job và image riêng, dùng tài khoản runtime hiện có; cấp `nv-trigger` quyền bật riêng job mới. Không xoay khóa, đổi image hoặc cập nhật máy `net-ve-runner`. Sau đó chạy workflow triển khai web hiện có để đưa lựa chọn và bộ xem trước bổ sung lên. GitHub Actions chỉ kiểm thử/triển khai, máy phục vụ khách chạy Cloud Run.

Giọng đọc mỗi cảnh được lưu kín trong R2 theo tài khoản, dự án và hash nội dung + cài đặt giọng. Dựng lại dùng bản này; thay lời hoặc giọng không dùng nhầm bản cũ. Lease hết hạn không được ghi cache hoặc hoàn tất video.

Máy chủ dùng thời lượng giọng đọc thực đo bằng ffprobe. Thiết kế và MP3 không bị xóa khi lỗi; file MP4 chỉ báo hoàn tất sau FFmpeg. Tái sử dụng TTS cache của thư viện hiện có. Không phải căn hành động chính xác từng từ.

Các tệp `.work` tạm và cache thuộc bộ dựng này. Đầu ra MP4/SRT và các nguồn nằm trong thư mục người gọi chọn.
