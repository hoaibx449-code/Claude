# Đường dẫn và điều hướng thống nhất

Các trang ứng dụng dùng URL thông thường: `/prompt-hunter`, `/cong-dong`, `/goi`, `/tao`, `/tro-giup`, `/dieu-khoan`, `/bao-mat`, `/hoan-tien`. Thư viện giải pháp tiếp tục dùng `/kham-pha` và `/giai-phap/{slug}`.

`navigation.js` chuyển bookmark dạng `/#/...` bằng History API, giữ truy vấn và hỗ trợ quay lại/tiến tới. Menu được sinh từ `PRIMARY_NAVIGATION` trong `page-routes.ts`; nhãn và khả năng hiển thị tiếp tục theo cấu hình quản trị. Link trong Zalo, chatbot và thông báo mới dùng cùng địa chỉ.

Worker xử lý cả URL truy cập trực tiếp, cung cấp title/description/canonical/robots theo trang. Trang pháp lý có nội dung HTML ban đầu; Prompt Hunter chỉ xuất nội dung đã công khai. Trang lạ trả 404, `/index.html` và dấu `/` cuối trang ứng dụng chuyển hướng 301. Sitemap công khai: `/sitemap.xml` và `/sitemap-solutions.xml`. Trang quản trị, dự án và tài khoản không được đưa vào sitemap và có noindex; đây không thay thế xác thực/quyền truy cập API.

Việc chuyển khỏi fragment giúp các trang có địa chỉ riêng phù hợp với cách Google xử lý URL; không bảo đảm phê duyệt sản phẩm Google hay thứ hạng tìm kiếm.

Kiểm tra: `npm run typecheck`, `node --test test/page-routes.test.ts`, `node tools/check-page-routes.mjs`. Kiểm tra trình duyệt mô phỏng dữ liệu, không thay đổi dữ liệu production.
