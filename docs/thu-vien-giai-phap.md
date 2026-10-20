# Thư viện giải pháp FACIUP

## Đường dẫn và nội dung

- Khám phá: `/kham-pha`.
- Danh mục: `/kham-pha/bot-tro-ly`, `/kham-pha/tu-dong-hoa`, `/kham-pha/cong-cu`, `/kham-pha/skill-tai-nguyen`, `/kham-pha/huong-dan`.
- Một sản phẩm: `/giai-phap/ten-giai-phap`.
- Quản trị: `/#/admin/giai-phap`.

Không tạo sẵn sản phẩm mẫu trên website thật. Các sản phẩm trong kiểm thử chỉ tồn tại trong cơ sở dữ liệu tạm.

## Đăng một giải pháp

1. Mở **Quản trị → Giải pháp & tài nguyên → Thêm giải pháp**.
2. Nhập tên, lợi ích, phân loại, nền tảng và nội dung. Có thể dùng **AI gợi ý tên & mô tả** sau khi nhập thông tin thực tế; quản trị kiểm tra lại trước khi lưu.
3. Thêm các tài nguyên vào cùng một bài: liên kết công cụ, kho mã nguồn, video, tài liệu, tệp tải về hoặc nội dung có nút sao chép. Mỗi tài nguyên có nhãn, định dạng và phiên bản riêng.
4. Thêm lịch sử phiên bản, điều kiện và hướng dẫn khi cần. Ảnh đại diện nhận URL HTTPS; video demo hỗ trợ YouTube hoặc MP4/WebM trực tiếp.
5. Chọn trạng thái và lưu. Bài công khai cần mô tả từ 15 ký tự, nội dung từ 80 ký tự và ít nhất một tài nguyên hợp lệ. Đường dẫn tự tạo từ tên; sau lần công khai đầu tiên không đổi đường dẫn để giữ liên kết.

Trạng thái gồm **Nháp**, **Chờ duyệt**, **Công khai**, **Ngừng hỗ trợ**. Chỉ quản trị viên được tạo, sửa, tải tệp và công khai. Hai người cùng sửa một bài sẽ nhận thông báo xung đột thay vì âm thầm ghi đè. Bài ngừng hỗ trợ giữ trang chi tiết kèm thông báo và `noindex`, không nằm trong danh sách gợi ý.

Tên menu **Khám phá** và **Giải pháp & tài nguyên** có thể đổi tại **Nội dung & menu**, sử dụng hệ thống tên menu hiện có.

## Tệp, mã và phiên bản

Mỗi bài tối đa 30 tài nguyên và 30 ghi chú phiên bản. Một tệp tải lên tối đa 50 MB; có thanh tiến độ, báo thành công/thất bại và yêu cầu chờ tải xong trước khi lưu. Quản trị có thể tải tối đa 50 tệp/ngày theo hạn mức của tính năng.

Tệp lưu trong R2 ở vùng `solutions/`, metadata lưu D1. Tệp chỉ được đọc công khai nếu một bài công khai hoặc ngừng hỗ trợ đang tham chiếu tới nó. Tệp gắn với bài nháp không thể tải bằng cách đoán URL.

Tệp thông thường được trả dưới dạng tải xuống với `nosniff`, không tự chạy. MP4/WebM có chữ ký phù hợp được xem trực tiếp khi chọn loại Video; phục vụ Range cho trình phát. Mã hiển thị là văn bản đã escape và chỉ sao chép khi người dùng bấm nút. Tệp không được tự động quét mã độc; quản trị cần kiểm tra nội dung và quyền phân phối trước khi đăng.

Tệp tải lên nhưng chưa gắn với bất kỳ bài đã lưu nào được dọn sau 7 ngày, theo lô giới hạn mỗi giờ. Tệp của bài đã lưu ở mọi trạng thái đều được giữ. Hàng đợi dọn tệp có cơ chế thử lại khi R2 lỗi; kiểm tra tham chiếu trong SQLite ngăn gắn tệp đã hết hạn vào bài mới.

Nhãn trả phí và giá là thông tin giới thiệu; chức năng này không tự tạo giao dịch hay cấp quyền tải có trả phí. Nếu cung cấp sản phẩm trả phí, quản trị dùng liên kết dịch vụ/đặt mua phù hợp, không tải tài nguyên cần giữ riêng vào bài công khai.

## SEO và trợ lý AI

Trang danh sách, phân loại và chi tiết trả HTML từ Worker, đọc được khi không chạy JavaScript. Mỗi trang có title, mô tả, canonical, Open Graph và JSON-LD theo nội dung (CreativeWork/Article và BreadcrumbList). Bộ lọc có `noindex,follow`; phân trang có URL riêng. Sitemap tại `/sitemap-solutions.xml` chỉ chứa trang công khai và các danh mục có bài công khai; `/robots.txt` khai báo sitemap. Có thể gửi sitemap vào Google Search Console sau triển khai; không bảo đảm thứ hạng hay hiển thị đặc biệt.

Tìm kiếm thư viện và phân trang dùng dữ liệu D1 hiện tại. Trợ lý AI truy xuất toàn bộ chỉ mục tìm kiếm của bài công khai, lấy tối đa 5 gợi ý phù hợp mỗi lượt; không giới hạn tìm kiếm trong 200 bài gần đây. Bài nháp/chờ duyệt/ngừng hỗ trợ không được đưa vào nguồn trả lời. Prompt Hunter giữ riêng. Trợ lý và các liên kết nguồn hoạt động cả trong ứng dụng lẫn trang Khám phá.

## Kiểm chứng

- `npm run typecheck`
- `node --test test/solutions.test.ts test/help.test.ts test/security-advanced.test.ts`
- `node tools/check-solutions-ui.mjs` với Chromium của Playwright; có thể đặt `CHROMIUM_EXECUTABLE_PATH` khi dùng Chrome cài sẵn.

Kiểm thử giao diện dùng cơ sở dữ liệu riêng và chặn yêu cầu trình duyệt vào dữ liệu giả: danh sách/chi tiết ở 390/800/1440 px, trợ lý kèm liên kết giải pháp, tạo bài, tải tệp thật qua XHR, thêm phiên bản, công khai, kiểm tra trình biên tập trên điện thoại và tải tệp trở lại.
