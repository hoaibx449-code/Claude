# Máy dựng Shorts 3D

Nhập từ `May dung short/BoSanXuat_VideoTuDuy3D`. Mã nguồn và tài liệu được giữ riêng trong `shorts/`, không thay đổi website hay máy dựng hiện có.

## Dựng trên GitHub

Workflow **Dựng Shorts 3D** chạy một bản demo khi đẩy nhánh `codex/shorts-renderer`. Vào **Actions → Dựng Shorts 3D → lần chạy mới nhất → Artifacts** để tải gói `shorts-3d-…` gồm MP4 1080×1920, ảnh bìa, ảnh kiểm tra từng cảnh, phụ đề, kịch bản và kết quả kiểm tra.

Sau khi workflow có trên nhánh mặc định, có thể bấm **Run workflow** và chọn:

- `project`: thư mục cảnh trong `shorts/renderer/examples/`, mặc định `demo_ghe_cho_noi`.
- `voice`: `demo` để kiểm tra hình bằng audio im lặng có sẵn; `everai` để tạo giọng thật.
- `voice_code`: mã giọng, có thể để trống nếu đã đặt secret `EVERAI_VOICE_CODE`.

**Bản demo mặc định không có lời đọc.** Chỉ có chuyển động 3D, thẻ chữ và phụ đề theo timeline mẫu. Muốn video có lời đọc, đặt `EVERAI_API_KEY` và `EVERAI_VOICE_CODE` trong **Settings → Secrets and variables → Actions** rồi chọn `everai`. Tạo giọng có thể tiêu hao hạn mức EverAI; không tự chuyển sang im lặng khi API lỗi.

Nhánh công khai đồng nghĩa mã, cảnh đầu vào, log và artifact có thể được xem bởi người có quyền tương ứng trên GitHub. Không đưa nội dung khách hàng, khóa API hoặc dữ liệu riêng tư vào ví dụ. Artifact giữ 7 ngày; tải về trước khi hết hạn.

## Thêm video mới

Tạo một thư mục riêng trong `renderer/examples/` với `storyboard.json`, `world.json`, `scene.html`. Thêm `voice.mp3` và `voice.srt` nếu đã có giọng; nếu dùng EverAI thì lời đọc lấy từ `shots[].say` trong storyboard. `scene.html` được viết riêng cho từng nội dung qua hạ tầng `engine/kit.js`, không phải hệ thống tự sinh cảnh bằng AI khi bấm chạy workflow.

Ví dụ có sẵn chỉ để kiểm tra máy dựng, không tự đổi chủ đề rồi tái sử dụng cảnh ghe cho mọi video. Đọc hướng dẫn chống lặp trong `docs/` và `renderer/references/` để chuẩn bị nội dung mới.

## Chạy cục bộ

Yêu cầu Python 3.12+, Node 22+, FFmpeg/FFprobe và font DejaVu hỗ trợ tiếng Việt.

```bash
python -m pip install -r shorts/requirements.txt
npm ci --prefix shorts/renderer/engine
cd shorts/renderer/engine && npx playwright install chromium && cd ../../..
python shorts/run.py --project demo_ghe_cho_noi --voice demo
```

Kết quả trong `shorts/out/`. Với giọng thật, đặt biến môi trường `EVERAI_API_KEY`, `EVERAI_VOICE_CODE` rồi dùng `--voice everai`. Không tải file cấu hình EverAI thật lên kho. Bản gốc trên Desktop được giữ nguyên; ZIP gốc, dữ liệu khóa và video xuất sẵn không được đưa lên.
