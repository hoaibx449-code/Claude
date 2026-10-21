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

## Giao nhiệm vụ không cần nhớ lệnh

1. Trên Faciup, bấm **Mở menu Telegram**. Bot gửi các nút vào nhóm đã ghép.
2. Trong Telegram, bấm **Giao nhiệm vụ** và trả lời tin nhắn của bot bằng lời bình thường.
   Ví dụ: “Lên nội dung cà phê 7 ngày cho dân văn phòng, Facebook/TikTok/YouTube/
   Instagram, mục tiêu nhận diện thương hiệu, giọng gần gũi.”
3. Bot tự lấy tên từ yêu cầu, gửi **Đã nhận nhiệm vụ**, phân công và thứ tự thảo luận.
   Bấm **Đổi tên phiên** nếu muốn tên khác. Mã kỹ thuật không dùng làm tên hiển thị.
4. Bấm **Tiến độ** hoặc **Phiên gần đây** để chọn phiên theo tên. Không cần gõ ID.

Trên web, điền **Tên phiên** và **Yêu cầu**, rồi bấm Mở phiên thảo luận. Có thể để
trống tên để tự đặt. Lịch sử hiển thị tên, trạng thái và thời gian tạo. Cài đặt kết nối,
khóa và vai trò được tách vào phần **Kết nối và cài đặt nhóm AI**.

Mỗi phút máy chủ xử lý tối đa một lời trả lời AI. AI sau nhận brief, tài liệu và
ý kiến trước đó. Sau số vòng đã chọn, tổng biên tập đưa bản trình duyệt, giữ cả
bất đồng và dữ kiện cần xác minh. Nhóm không có trình duyệt web hay công cụ đăng bài.

Ngay khi nhận brief hợp lệ, bot điều phối gửi tên phiên, xác nhận nhận việc,
phân công từng chuyên gia và thứ tự thảo luận. Xác nhận này không gọi mô hình AI.
Trước từng lượt, bot báo trợ lý nào đang làm; khi lỗi, đổi mô hình hoặc đạt trần ngày,
bot báo trạng thái để bạn biết vì sao phải chờ. Tin được lưu để thử gửi lại khi mạng lỗi.

Chỉ quản trị đã ghép đúng nhóm mới đọc được tiến độ hoặc dùng các nút. Tin thông
thường chỉ được dùng làm nhiệm vụ sau khi bạn bấm Giao nhiệm vụ; không tự mở phiên
từ mọi câu chuyện trong nhóm. Lượt nhập có hiệu lực 15 phút và gắn riêng người/nhóm.
Trong Telegram, trả lời tin hỏi của bot giúp bot nhận được nội dung khi bật Privacy Mode.
Các lệnh cũ vẫn được giữ tương thích nhưng không bắt buộc cho quy trình mới.

Giao nhiệm vụ trên web mở ngay phần phân công và tiến độ phiên. Phần này tự cập nhật
khoảng 12 giây/lần khi còn đang chạy hoặc chờ duyệt. Có thể đóng web: công việc vẫn
tiếp tục trên máy chủ. Bot không tự chọn lại vai trò ngoài cấu hình đã lưu cho phiên.

## Sau khi duyệt

Chọn **Duyệt nội dung**, **Yêu cầu sửa**, **Từ chối** bằng nút. Sau khi duyệt:

- Bản nội dung được chốt và lưu, trạng thái là **Đã duyệt**.
- **Xem nội dung** trong Telegram hoặc **Tải nội dung đã duyệt** trên web để lấy bản cuối.
- **Làm phiên bản tiếp**: bot hỏi điều bạn muốn thay đổi, tạo phiên mới có liên kết
  với bản gốc và giữ nguyên nội dung/quyết định của phiên đã duyệt.
- **Giao nhiệm vụ** để mở một việc khác.

Duyệt chỉ ghi nhận quyết định, chưa tự dựng video hoặc đăng bài. Chủ đề AI tự đề xuất
chỉ mở phiên mới khi quản trị giao việc. Telegram dùng entities in đậm và khoảng trống
giữa các mục, không in nguyên các dấu Markdown như ba dấu sao. Không diễn giải HTML
từ câu trả lời của AI.

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


### Thứ tự mô hình và xử lý khi phiên tạm dừng

Mặc định các trợ lý dùng thứ tự nhà cung cấp và mô hình trong API & token. Ví dụ Ollama đứng đầu thì Ollama Cloud được thử trước, nếu có mô hình và khóa hợp lệ. Ollama chạy trên máy tính cá nhân không dùng được cho nhóm chạy trên máy chủ khi máy tắt. Trong cài đặt từng trợ lý, có thể bỏ chọn “Theo thứ tự và mô hình trong cài đặt API & token” để dùng danh sách dự phòng riêng. Danh sách Gemini mặc định từ bản cũ được chuyển sang kế thừa cài đặt chung; danh sách riêng đã tùy chỉnh được giữ.

Chính sách miễn phí vẫn áp dụng: OpenAI và Gemini ngoài danh sách cho phép bị chặn khi bật chỉ dùng miễn phí. Mục “Thứ tự mô hình và các lựa chọn bị bỏ qua” giải thích lựa chọn thực tế, thiếu khóa và các mô hình bị chặn. Lỗi mới được lưu theo lượt, nhà cung cấp, mô hình và thời gian; không lưu nội dung lỗi thô hay khóa bí mật. Không thể khôi phục chi tiết lỗi cũ chưa được lưu.

Khi đã sửa cấu hình hoặc hạn mức, mở phiên và bấm “Tiếp tục với cấu hình hiện tại”. Phiên giữ nguyên các lượt đã hoàn tất, cập nhật lựa chọn mô hình của từng trợ lý và tiếp tục tại lượt còn thiếu. Tin báo lỗi Telegram không còn bị chặn bởi tin cũ gửi thất bại; nếu Telegram cũng gặp lỗi, web hiển thị tin hết số lần thử và nút “Thử gửi lại tin Telegram bị lỗi”.


### Trò chuyện tự nhiên với trợ lý chung

Quản trị đã ghép có thể gửi câu hỏi thông thường, không cần lệnh hoặc chọn Giao nhiệm vụ trước. Trợ lý xác nhận đã nhận tin ngay, sau đó xử lý trên máy chủ theo lịch khoảng một phút. Trợ lý trả lời trực tiếp, hỏi thêm khi thiếu thông tin hoặc mở phiên thảo luận để chuyên gia cùng làm. Trợ lý chỉ tư vấn, viết nháp và điều phối; chưa có quyền truy cập lịch, gửi thư, đăng bài hay thực hiện bên ngoài. Lịch sử gần đây chỉ lấy từ cùng quản trị và cùng nhóm để hiểu câu tiếp nối.

Nếu Telegram bật Group Privacy và bot không là quản trị nhóm, tin nhắn thường có thể không được chuyển tới web. Cách dùng ngay: chọn Trả lời (Reply) vào tin của bot rồi gửi nội dung. Để bot nhận tin thường trong nhóm riêng: mở @BotFather, gửi /setprivacy, chọn @Faciup_bot, chọn Disable; xóa bot khỏi nhóm rồi thêm lại theo hướng dẫn Telegram. Không đổi token và không cần cấp quyền quản trị nhóm. Kiểm tra lại mục Kết nối Telegram trên web: trạng thái nhận tin thường và thời điểm cuối nhận tin giúp phân biệt Telegram chưa chuyển tin với AI đang xử lý. Việc tắt Group Privacy cho phép bot nhận tin trong các nhóm đã tham gia; chỉ thêm bot vào nhóm riêng tin cậy. Server vẫn chỉ xử lý quản trị đã ghép còn quyền, không phản hồi người lạ hay bot khác.

Menu bị trôi: bấm Mở menu Telegram trên web để đăng ký danh sách lệnh /menu, /troly, /tientrinh, gửi bảng điều khiển mới và thử ghim tin (nếu bot đã có quyền ghim). Không có quyền ghim thì bạn tự ghim tin; các chức năng khác vẫn hoạt động. Mỗi bảng điều khiển có nút Trò chuyện với trợ lý chung.


### Chất lượng nội dung và nhật ký gửi tin

Bản cập nhật chuẩn hóa dấu Markdown khi hiển thị, giữ font văn bản thường, chuyển bảng thành từng mục và chia tin theo đoạn/câu. Tin dài có số phần cùng tên phiên, vai trò; các phần đang gửi được ưu tiên liền nhau. Nếu một phần hết số lần thử, phần tiếp theo chờ thử gửi lại thay vì âm thầm bỏ qua phần mất. Nội dung gốc của lịch sử được giữ; cách hiển thị được chuẩn hóa và đánh dấu các lỗi cơ học phát hiện được. Nhật ký gửi Telegram trong chi tiết phiên cho biết từng tin, nội dung và số lần thử.

Đầu ra mới lẫn hệ chữ bất thường so với yêu cầu tiếng Việt, bản cuối thiếu ngày được yêu cầu hoặc còn chỗ trống chưa điền sẽ bị từ chối trước khi lưu thành kết quả; hệ thống thử mô hình dự phòng trong hạn mức hiện có. Đây chỉ là kiểm tra cấu trúc, không bảo đảm đúng nghĩa, đúng dữ kiện hoặc văn phong tự nhiên. Đồng thuận của các vai trò dùng cùng mô hình không phải kiểm chứng độc lập. Khi làm nội dung chuyên ngành hoặc nội dung dùng thật, cần biên tập và xác minh nguồn. Không tự tăng trần lượt AI và không tự viết lại các phiên đã duyệt.
