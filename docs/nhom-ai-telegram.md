# Nhóm AI nội dung — riêng cho quản trị

Mở `/admin/nhom-ai` sau khi đăng nhập quản trị. Bản mới tắt sẵn, không tự gọi AI.

## Kích hoạt

1. Mục API & token: lưu khóa Gemini của dự án Free tier. Kiểm tra AI Studio về
   mô hình có quyền dùng, quota thực tế và trạng thái thanh toán. Gói thuê bao ứng dụng
   chat không chứng minh API miễn phí. Tùy chọn Ollama Cloud: chỉ chọn starter model
   có trong tài khoản và không bật nạp thêm credits tự động.
2. Mục Nhóm AI nội dung: chỉnh kiến thức thương hiệu, hướng dẫn vai trò và danh sách
   mô hình riêng. Dòng có dạng `gemini:gemini-3.5-flash-lite`. Lưu cấu hình trước
   khi nhập token cho trợ lý mới. 5 vai trò mặc định; có thể dùng 2–8 trợ lý.
3. Telegram: tìm **@BotFather có dấu xác minh**, gửi `/newbot`. Đặt tên, username
   kết thúc bằng `bot`. Dán token vào ô Tổng biên tập trên trang quản trị, Lưu token.
   Token không gửi qua hội thoại hoặc GitHub. Có thể tạo thêm bot cho mỗi chuyên gia.
   Nếu chỉ có một bot, tin nhắn vẫn ghi tên vai trò và mô hình thực tế.
4. Tạo **nhóm riêng chỉ gồm quản trị tin cậy**, thêm các bot. Thành viên trong nhóm
   đọc được tin nhắn dù chưa được ghép; không thêm khách hàng hoặc người dùng thường.
5. Bấm Kết nối webhook, Tạo mã ghép. Trang tự lấy username thật của bot và tạo
   lệnh đầy đủ (ví dụ `/link@Faciup_bot mã`). Sao chép nguyên lệnh gửi trong nhóm
   trong 10 phút. Bot báo thành công, thiếu mã, mã sai/hết hạn hoặc gửi nhầm tin
   riêng; không tự suy luận im lặng là đã ghép. Mã ngẫu nhiên, dùng một lần;
   server chỉ giữ hash. Mỗi quản trị ghép
   tài khoản Telegram riêng từ phiên đăng nhập Faciup của mình. Không dựa vào username
   hoặc quyền admin Telegram để cấp quyền Faciup.
   Nếu bot vẫn im lặng, bấm Kiểm tra kết nối Telegram: kiểm tra username bot,
   webhook trỏ đúng Faciup và tin đang chờ. Lệnh `/link@username_bot` trong tài liệu
   cũ chỉ là ví dụ, không được gửi nguyên chữ `username_bot`.
6. Xác nhận đã kiểm tra tài khoản miễn phí, giữ bật Chỉ dùng lựa chọn miễn phí,
   bật nhóm và Lưu cấu hình. Mặc định tối đa 20 lượt AI/ngày UTC, 1 vòng thảo luận.

## Dùng

Gửi `/brief@username_bot Lên ý tưởng nội dung cà phê 7 ngày, đối tượng dân văn phòng,
Facebook/TikTok/YouTube/Instagram, mục tiêu tăng nhận diện, giọng gần gũi.`

Mỗi phút máy chủ xử lý tối đa một lời trả lời AI. AI sau nhận brief, tài liệu và
ý kiến trước đó. Sau số vòng đã chọn, tổng biên tập đưa bản trình duyệt, giữ cả
bất đồng và dữ kiện cần xác minh. Nhóm không có trình duyệt web hay công cụ đăng bài.

Ngay khi nhận brief hợp lệ, bot điều phối gửi mã phiên, xác nhận nhận việc,
phân công từng chuyên gia và thứ tự thảo luận. Xác nhận này không gọi mô hình AI.
Trước từng lượt, bot báo trợ lý nào đang làm; khi lỗi, đổi mô hình hoặc đạt trần ngày,
bot báo trạng thái để bạn biết vì sao phải chờ. Tin được lưu để thử gửi lại khi mạng lỗi.

Gửi `/tientrinh@Faciup_bot` để xem phiên gần nhất trong nhóm, hoặc thêm ID phiên để
xem một phiên cụ thể; thay username nếu bạn dùng bot khác. Chỉ quản trị đã ghép
đúng nhóm mới đọc được tiến độ. Tin thông thường chưa phải lệnh giao việc sẽ được
hướng dẫn dùng `/brief`, tránh hiểu lầm rằng hệ thống đã nhận nhiệm vụ.

Giao nhiệm vụ trên web mở ngay phần phân công và tiến độ phiên. Phần này tự cập nhật
khoảng 12 giây/lần khi còn đang chạy hoặc chờ duyệt. Có thể đóng web: công việc vẫn
tiếp tục trên máy chủ. Bot không tự chọn lại vai trò ngoài cấu hình đã lưu cho phiên.

Chọn **Duyệt**, **Yêu cầu sửa**, **Từ chối** trên Faciup hoặc Telegram. Duyệt chỉ
ghi nhận quyết định; không tạo video hay đăng bài. Sau Yêu cầu sửa, dùng
`/sua@username_bot ID nội dung sửa`, hoặc mở phiên trên web và nhập phản hồi.
Chủ đề AI tự đề xuất chỉ mở phiên mới khi quản trị gửi brief mới.

## Giới hạn và bảo mật

- API `/api/admin/council/*` yêu cầu phiên đăng nhập quản trị, kiểm tra khóa tài khoản
  và CSRF như phần quản trị sẵn có. Truy cập API trực tiếp không vượt được quyền.
- Token bot và secret webhook mã hóa AES-GCM bằng cơ chế khóa hiện có của Faciup;
  API chỉ trả cờ đã thiết lập, không trả giá trị. Chỉ server gọi nhà cung cấp.
- Telegram kiểm tra secret header, ID số người gửi và nhóm đã ghép; chặn bot,
  người lạ, quản trị ẩn danh, phát lại update và nút duyệt đã xử lý.
- Thu hồi quản trị/khóa tài khoản chặn lệnh Telegram, xử lý nền và gửi tin còn chờ.
  Ngắt ghép chặn tin tương lai tới nhóm cũ. Đổi token điều phối yêu cầu ghép lại.
- Mô hình chỉ tạo văn bản; không có quyền truy cập token, API nội bộ hoặc thực thi.
  Nội dung hiển thị dưới dạng văn bản, không nội suy HTML từ câu trả lời AI.
- Chế độ miễn phí chặn OpenAI và Gemini ngoài danh sách Flash-Lite cho phép.
  Không tự thêm nhà cung cấp bên ngoài danh sách của trợ lý. Tắt chế độ này là
  quyết định chủ động của quản trị và có thể phát sinh chi phí.
- Không thể xác định trạng thái billing/quota chỉ bằng ID mô hình. Dùng khóa trên
  tài khoản trả phí vẫn có thể bị tính tiền. Đây là trần **lượt gọi**, không phải
  cam kết miễn phí từ nhà cung cấp hoặc giới hạn tiền của tài khoản cloud.
- Ollama từ máy cá nhân không dùng cho luồng cloud này. Ollama Cloud cố định
  `https://ollama.com`; không chuyển khóa theo địa chỉ tùy ý hay redirect.
- Lỗi/quota thử mô hình dự phòng ở tick sau, mỗi mô hình một lần/lượt. Hết lựa chọn
  thì tạm dừng để quản trị kiểm tra rồi Tiếp tục. Đạt trần ngày tự chờ ngày UTC tiếp theo
  (07:00 sáng giờ Việt Nam). Tối đa 3 phiên hoạt động và 20 phiên/24 giờ.
- Máy chủ lưu D1: brief, snapshot vai trò, ý kiến, tiến trình, mô hình thực tế và
  quyết định. Lease và giao dịch ngăn chạy trùng, có thể tiếp tục sau khi Worker nghỉ.
  Gửi Telegram có tối đa 4 lần thử, xem trạng thái gửi trong phiên; khi mạng không rõ
  kết quả có thể nhận tin trùng, vì Telegram không có khóa idempotency cho sendMessage.
- Nội dung đi đến các nhà cung cấp được cấu hình. Free tier có thể có điều khoản
  dùng dữ liệu để cải thiện sản phẩm; không nhập dữ liệu mật chưa được phép chia sẻ.
- Chưa có kiểm chứng web, tạo ảnh/video, fine-tuning hay chạy vô hạn tới đồng thuận.

## Kiểm tra

`node --test test/council.test.ts` kiểm tra API thật với SQLite: quyền, CSRF,
ghép Telegram, chống phát lại, thu hồi quyền, trần lượt gọi, fallback, lease,
duyệt và chặn redirect/SSRF. Không gọi dịch vụ trả phí trong các kiểm thử này.
Kiểm tra nhóm Telegram thật cần quản trị tự tạo bot và nhập token.

## Nguồn đối chiếu 21/10/2026

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ollama.com/pricing
- https://core.telegram.org/bots/api#setwebhook
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
