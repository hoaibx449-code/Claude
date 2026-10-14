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

Workflow `FACIUP Whiteboard bổ sung` là kiểm thử độc lập và dựng demo thủ công. Không tự lấy hàng chờ của máy dựng cũ. Việc nối bộ dựng này vào web/hàng đợi phải là một bước bổ sung riêng, chỉ định Whiteboard rõ ràng; không đổi tuyến của video hiện có.

Máy chủ dùng thời lượng giọng đọc thực đo bằng ffprobe. Thiết kế và MP3 không bị xóa khi lỗi; file MP4 chỉ báo hoàn tất sau FFmpeg. Tái sử dụng TTS cache của thư viện hiện có. Không phải căn hành động chính xác từng từ.

Các tệp `.work` tạm và cache thuộc bộ dựng này. Đầu ra MP4/SRT và các nguồn nằm trong thư mục người gọi chọn.
