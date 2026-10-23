# Nhánh web-demo

Nhánh này được tách từ `812d9ae628a44cdfc45e699b39e8d55be2761b02` để duyệt thay đổi Faciup Live ngay trong dự án.

- Giữ nguyên toàn bộ giao diện web và ảnh văn phòng của phiên bản mới nhất.
- Chỉnh khung hội thoại vào khu tiếp khách, bảng tên theo mặt bàn, luồng sáng và phần tiêu đề.
- Workflow `Web demo — Faciup Live` chỉ upload version với alias `web-demo` của Worker `net-ve-studio`. Không chạy lệnh deploy production, không áp dụng schema, không cài secrets, không đổi traffic production.
- Entry `src/preview.ts` không có D1, R2 hoặc cron. Dữ liệu duyệt giao diện nằm trong `preview-data.ts`; không đọc tài khoản hay gọi API production. Mọi API khác và mọi yêu cầu ghi đều bị chặn.
- Nút “Thử tin nhắn” chỉ hiển thị lời giới thiệu minh họa trong giao diện, không gửi tin Zalo thật.

Sau khi người dùng duyệt, đưa các thay đổi giao diện đã duyệt vào nhánh chính qua PR riêng. Không tự động gộp nhánh demo hay triển khai bản chính thức.
