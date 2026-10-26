# Máy dựng Shorts 3D

Nhập từ `May dung short/BoSanXuat_VideoTuDuy3D`. Mã nguồn và tài liệu được giữ riêng trong `shorts/`, không thay đổi website hay máy dựng hiện có.

## Dựng trên GitHub

Workflow **Dựng Shorts 3D** kiểm tra adapter web khi đẩy nhánh `codex/shorts-renderer`. Bản demo đầy đủ chạy bằng **Run workflow**. Vào **Actions → Dựng Shorts 3D → lần chạy mới nhất → Artifacts** để tải kết quả.

## Tạo từ website

Trong **Tạo video → Shorts 3D**, nhập chủ đề hoặc kịch bản, chọn giọng và độ dài tối đa 2 phút. AI dùng cấu hình AI của Ink Studio, kiểm chứng lời đọc, nghĩ ẩn dụ và bố trí các vật thể/chuyển động cho từng cảnh. Có thể duyệt ảnh phân cảnh trước khi dựng. Giọng đọc thật dùng cấu hình hiện tại; không dùng audio im lặng của demo cho yêu cầu người dùng. Hỗ trợ nhạc tự tạo hoặc tải lên, phụ đề SRT, từ điển phát âm và màu nhấn.

Video trả về đúng tài khoản trong **Video của tôi**, dùng cùng hàng đợi, hạn mức, thông báo và hoàn lượt khi lỗi. Cần bật máy dựng **GitHub** và có kết nối GitHub của Ink Studio. Bản tích hợp đầu tiên chỉ cho máy GitHub mới nhận tác vụ này; các máy chủ/cloud cũ không nhận nhầm. Sau khi gộp mã cần triển khai web và dùng workflow `ink-runner.yml` mới.

Đây là 3D hình học tối giản: AI ghép khối, màu, vị trí và chuyển động theo nội dung; chưa tạo vật thể chi tiết như phim AI. AI không được sinh JavaScript thực thi hay tải tài nguyên ngoài. Những ẩn dụ của 8 video gần nhất trong cùng tài khoản được đưa vào danh sách tránh lặp. Chưa hỗ trợ logo hay khung ngang cho kiểu này.

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
