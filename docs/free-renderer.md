# Thay Google Cloud bằng máy dựng không tốn phí thuê

## Đề xuất chính: Cloudflare + PC đang có

Giữ nguyên website/API/D1/R2 trên Cloudflare. Chạy runner Node + Canvas + FFmpeg trên PC. Runner chủ động lấy việc qua HTTPS và tải MP4/SRT lên R2, không cần mở port hay đưa PC lên Internet. Khi PC tắt hoặc ngủ, hàng đợi phải chờ; vẫn có điện, mạng, dung lượng R2 và chi phí AI/TTS nếu dùng dịch vụ có phí. Đây không phải cam kết toàn bộ sản phẩm miễn phí.

Cần Node >=22.18, FFmpeg và ffprobe có trong PATH. Tải từ nguồn chính thức, chạy `npm ci` trong repository. Tạo `.env` tại gốc (đã gitignore), điền bằng trình soạn thảo trên máy:

```dotenv
NV_API_URL=https://net-ve-studio.netve-nj3kqr.workers.dev
RUNNER_TOKEN=<token đang dùng cho máy dựng của chính bạn>
```

Token có quyền nhận việc và đọc cấu hình giọng của hệ thống: giữ kín, không gửi vào chat hoặc commit GitHub. Dùng token hiện có; nếu cần tạo/đổi token, chủ tài khoản thực hiện trong quản trị dịch vụ.

Kiểm tra và chạy:

```powershell
node --version
ffmpeg -version
ffprobe -version
npm run runner
```

Dừng bằng Ctrl+C khi không có việc đang dựng. Không dùng `--once` để kiểm tra kết nối production: nó có thể lấy một việc thật. Chạy runner nghĩa là phục vụ hàng đợi thật. Không tự tạo Windows service hay bật khởi động cùng máy.

Runner chính chỉ phục vụ các định dạng engine. Whiteboard/Illustrated có runner riêng, đang ẩn khỏi tạo mới. Những lượt cũ của các định dạng đó không được máy chính nhận thay.

Khi chuyển chính thức: kiểm tra một video ngắn thuộc tài khoản chủ web, xác nhận hình/giọng/MP4 tải được; sau đó mới ngừng cơ chế kích hoạt Cloud Run. Không cần xóa dữ liệu hoặc đổi URL website. Không chạy workflow triển khai Cloud Run nếu chưa xử lý billing.

## Phương án cloud: Oracle Always Free

Tài liệu Oracle được kiểm tra ngày 16/10/2026 hiện ghi Ampere A1 miễn phí tương đương **2 OCPU / 12 GB RAM**, 1.500 OCPU-giờ và 9.000 GB-giờ mỗi tháng; 200 GB tổng boot/block volume. Không dùng con số 4 OCPU/24 GB cũ.

Có thể thử Ubuntu ARM64, Node, Canvas ARM64 và FFmpeg để chạy cùng runner; cần kiểm tra native Canvas trên image thực tế và đo thời gian dựng. Chưa provision hay benchmark nên chưa coi là backend thay thế đã sẵn sàng. Có thể hết capacity tại home region; máy ít sử dụng có thể bị Oracle thu hồi. Chọn đúng Always Free và không vượt quota; không dựa vào trial credit để gọi là miễn phí lâu dài.

Nguồn: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Không chuyển FFmpeg sang Workers Free

Workers Free có giới hạn CPU rất nhỏ và 128 MB RAM; không phù hợp pipeline Node/native Canvas/FFmpeg hiện tại. Workers tiếp tục làm web/API và hàng đợi, máy PC/VM đảm nhiệm dựng video.

Nguồn: https://developers.cloudflare.com/workers/platform/limits/

GitHub Actions chỉ dùng CI/triển khai hoặc thử nghiệm do người vận hành kích hoạt; không đề xuất dùng như máy phục vụ video miễn phí chạy liên tục cho khách hàng.
