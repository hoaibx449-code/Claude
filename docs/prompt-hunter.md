# Prompt Hunter

Public route: `#/prompt-hunter`; moderation: `#/admin/prompt-hunter`.

The public library contains published posts only. Anyone may read/copy; signed-in, unblocked users can submit (5/day), see their own pending/rejected posts and private moderator notes, or report a published prompt (10/day). The content is displayed as text, never executed or inserted as HTML. URLs accept HTTP(S) only. Secret-like content is refused. These checks are heuristic, not a claim that all published prompts are safe.

AI proposes Vietnamese title, category, description and tool, preserving the original prompt. It receives prompt content as quoted untrusted data and is told not to follow embedded instructions. Existing AI provider/model fallback and budget limits apply. Failure saves the submission with an explicit metadata-failure state; administration can edit or retry. Moderation is manual by default. Optional auto approval still keeps suspicious content pending. Admins can edit metadata/content, publish, unpublish to pending, reject with feedback, and resolve reports. Writes use an optimistic version check. Reports never appear in the public API. Cursor pagination includes time and id.

Zalo: `PROMPT <full content>` from the claimed owner chat or a linked administrator. The command is deferred to the existing background message worker. Delivery retries use a unique message key to avoid duplicate posts. Unauthorized chats get a web-submission hint. Administrators publish directly and can edit the AI metadata in the moderation page. Test this with the actual linked owner before advertising the command to others.

Schema additions in `web/schema.sql` are idempotent and applied by the existing deploy workflow. No existing data is removed. Account export includes submitted prompts; account deletion removes the user's submissions/reports.

Launch suggestions: prioritize tested prompts with an optional result example and the model/version used; add bookmarks and collections after the library has useful content. Avoid a raw popularity ranking initially, since it rewards clickbait and copied submissions. Preserve attribution and use human review by default.


## Release verification

Local validation: 144 passing tests, one platform skip; TypeScript and web build pass. Browser automation was unavailable during this implementation. Verify real owner-Zalo publishing, pending-to-published moderation, auto-approval settings, copy behavior and narrow-screen layout on the deployed build before announcing availability. The existing Triển khai web workflow applies schema.sql before deployment.


### Đọc prompt từ ảnh qua Zalo

Gửi ảnh PNG/JPG/WebP trực tiếp đến bot (tối đa 8 MB). Webhook chỉ xác nhận nhận ảnh, công việc OCR chạy trong hàng chờ nền. AI nhìn ảnh dùng thứ tự/model trong quản trị; model không hỗ trợ ảnh được thử sang model dự phòng. Bot chép nguyên văn, không thực thi chỉ dẫn trong ảnh. Chỗ chưa rõ đánh dấu `[?]`; ảnh không chữ hoặc không tải được báo lỗi rõ.

Bot trả văn bản để kiểm tra. Gửi `PROMPT ANH` để đăng kết quả ảnh gần nhất: quản trị đăng trực tiếp; thành viên phải liên kết tài khoản và dùng quy trình duyệt/auto-duyệt hiện có. Một ảnh không tạo trùng bài khi lệnh được gửi lại. OCR không tự tạo video.

Bật/tắt tại Quản trị → Zalo → Đọc prompt từ ảnh (OCR). Giới hạn 20 ảnh/ngày/chat thường, 100 cho quản trị và ngân sách AI hiện có. Bản OCR phục vụ lệnh đăng lưu 7 ngày trong D1, dọn bởi cron; không sao chép ảnh gốc sang R2. Chỉ tải từ các CDN Zalo được cho phép, kiểm tra lại từng bước chuyển hướng, giới hạn kích thước tải và xác minh chữ ký định dạng ảnh. OCR có thể sai; người đăng cần kiểm tra trước khi dùng/chia sẻ.
