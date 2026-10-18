# Ảnh Zalo từ Google Sheet

Quản trị → Ảnh Zalo từ Sheet (`/#/admin/anh-zalo`). Nguồn và lịch lưu riêng trong D1; không phụ thuộc tên Sheet/cột cố định.

1. Cho phép xem Sheet và ảnh Drive bằng liên kết. Phiên bản này không dùng OAuth và không đọc Drive riêng tư. Chỉ tải ảnh PNG/JPEG/WebP tối đa 8 MB qua các máy chủ Google cho phép; không gửi trang HTML hoặc link thay ảnh.
2. Dán link Sheet, chọn gid ổn định khi đổi tên tab, dòng tiêu đề, bấm đọc cột. Chọn cột ảnh và tùy chọn cột mã/chú thích. Tên cột theo tiêu đề được ưu tiên; có thể nhập các tên thay thế bằng dấu `|`, hoặc vị trí `#A`, `#B`. Khi đổi tên hoặc di chuyển cột không còn khớp, hệ thống báo lỗi để quản trị chọn lại; không đoán sai cột.
3. Chọn chu kỳ đọc, múi giờ IANA, ngày trong tuần và nhiều khung giờ không trùng (hỗ trợ qua nửa đêm). Mỗi người tối đa một ảnh mỗi khoảng gửi trong khung giờ. Ngoài giờ vẫn ghi nhận ảnh mới, để gửi trong khung tiếp theo. Tác vụ cron mỗi phút nên thời điểm có thể chậm khoảng một phút.
4. Lần đọc đầu: mặc định bỏ qua ảnh cũ. Tùy chọn đưa ảnh hiện có vào hàng chờ áp dụng cho người đã đăng ký trước thời điểm đọc nguồn. Người đăng ký mới chỉ nhận ảnh được phát hiện sau lần đăng ký đầu tiên, không nhận toàn bộ lịch sử. Hủy rồi đăng ký lại vẫn giữ thời điểm đăng ký đầu tiên và lịch sử chống trùng; ảnh phát sinh trong lúc tạm dừng có thể nhận sau khi đăng ký lại.
5. Người dùng nhắn `NHẬN ẢNH` / `ĐĂNG KÝ NHẬN ẢNH`, hoặc `HỦY NHẬN ẢNH`. `TAT` cũng dừng ảnh. `BAT` chỉ bật thông báo video, không tự đăng ký ảnh thay khách.

Danh tính ảnh gồm mã Sheet, gid và ID tệp Drive; cột mã tùy chọn được lưu để đối chiếu và không ảnh hưởng chống trùng. đổi URL chia sẻ của cùng tệp, sắp xếp dòng, đổi chú thích không tạo lượt gửi mới. Một tệp bị ghi đè nội dung với cùng ID không được coi là ảnh mới; hãy tạo tệp mới. Không xóa sổ giao nhận khi đổi cấu hình.

`sendPhoto` gửi ảnh gốc với chú thích, không thêm link Drive. Ảnh được lưu tạm R2 trong 24 giờ; URL có token ngẫu nhiên hết hạn. Sau đó cron xóa bản tạm; metadata chống trùng và trạng thái gửi vẫn nằm trong D1. Đây không phải cơ chế sao lưu hoặc xóa ảnh nguồn Google Drive.

Mỗi cron tối đa 10 người nhận, tiếp tục vào phút sau, ưu tiên ảnh cũ trong hàng chờ. Dữ liệu nguồn tối đa 10.000 dòng, CSV tối đa 2 MB. Chỉ thử tự động tối đa 5 lần nếu Zalo trả lỗi rõ ràng. Mất phản hồi/kết thúc tiến trình khi đang gửi được ghi `unknown`; quản trị kiểm tra Zalo rồi cho phép thử lại để tránh gửi kép. Không thể bảo đảm exactly-once nếu API bên ngoài không hỗ trợ khóa idempotency. Giao diện có 100 đăng ký và 50 giao nhận gần nhất; tải lại trang để xem trạng thái mới.

Kiểm tra nguồn bằng nút quét không tự gửi ảnh; khi chế độ tự động đang bật, ảnh mới ghi nhận sẽ được cron xử lý theo lịch. Muốn kiểm tra hoàn toàn không gửi, tắt tự động trước. Chưa có người đăng ký hoặc nguồn thiếu quyền sẽ không phát sinh tin gửi ảnh.
