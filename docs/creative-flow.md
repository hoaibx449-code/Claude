# Tạo video theo mô tả sáng tạo

Luồng web thay danh mục định dạng cố định bằng gợi ý sáng tạo. Người dùng nhập chủ đề hoặc lời đọc, mô tả kết quả mong muốn, rồi tuỳ chọn hướng tham khảo. VOX, Whiteboard, chữ chuyển động và tối giản là câu gợi ý gửi AI; không gắn với một mẫu cảnh hay ép chọn bộ dựng tương ứng.

AI chọn nhịp, bố cục từng cảnh, cách dùng chữ/hình, mode và bảng màu trong khả năng engine. Kịch bản có sẵn được giữ nguyên lời. Đầu ra phải có mô tả hướng dựng và giới hạn liên quan; server kiểm tra cấu trúc, danh sách khả năng hỗ trợ và thiết kế trước khi lưu dự án. Không dùng fallback theo mẫu khi AI lỗi. Bản nháp chưa tự xuất video.

Trong bàn dựng, phần Hướng dựng AI hiển thị kết quả dự kiến. Người dùng gửi góp ý bằng lời; AI trả đề xuất giữ nguyên lời đọc. Chỉ bấm Áp dụng đề xuất mới lưu. Phiên bản dự án được kiểm tra để tránh ghi đè chỉnh sửa mới hơn; lỗi hoặc đóng đề xuất giữ nguyên bản hiện tại. Hướng dẫn và tối đa năm góp ý gần nhất được lưu cùng spec, không cần migration database.

Giới hạn thực tế: đường sáng tạo này dùng Canvas, chữ, icon, sơ đồ, biểu đồ và người que. Nó không có tìm clip tư liệu, quay phim thật, ảnh chân thực tự sinh, 3D hoặc lip-sync. VOX có thể là cảm hứng về biên tập giải thích bằng đồ hoạ, không được hứa có tư liệu hình ảnh chưa tồn tại. Nếu mong muốn bắt buộc một khả năng không hỗ trợ, AI cần trả cannotFulfill và API báo 422, không tự thay bằng một video khác ý. Việc nhận diện mọi yêu cầu vượt khả năng vẫn phụ thuộc mô hình; đây không phải bảo đảm AI hiểu đúng mọi mong muốn.

Đây là thay đổi luồng sáng tạo, chưa thay thế toàn bộ engine hoặc nâng chất lượng hình ảnh lên ngang các công cụ sinh video chuyên dụng. Máy xuất vẫn theo lựa chọn Cloud / máy cá nhân / trình duyệt. Lượt thiết kế và góp ý dùng hạn mức/ngân sách AI hiện có.


## Freeform drawing and current administration (2026-10-17)

New creative requests use AI-authored vector paths and text, not stock icons, people, chart templates or asset libraries. Each vector supplies bounded 0–100 coordinates, its own color, stroke/fill and optional motion translation/rotation/scale. The renderer preserves intentional vector layering; it does not rearrange illustration parts. A custom palette can replace the background and ink colors of the base pen style. Kinetic is text-only; vector scenes must use hand or motion. Invalid geometry and stock items enter the existing bounded AI repair pass, then fail explicitly if still invalid. No generated JavaScript is executed. Legacy projects keep their existing assets and renderers.

Administration removes training/template/legacy visibility pages from the normal navigation, obsolete default look/style/image-provider inputs and script templates from content. Browser mode hides music settings it cannot render. Main and admin menu labels live under labels.navigation and labels.adminMenu, with known-route validation and defaults.

The avatar opens account details in a modal (plan, quota, credits, data export, optional account deletion behind a disclosure). Admin user rows open a separate details modal containing plan grants, credits, account status, projects, jobs and collapsed activity. Pricing is only an explicit action. The voice modal includes source, search/filter, per-row preview, speed, upload and volume; edits commit on Apply and cancel cleanly.
