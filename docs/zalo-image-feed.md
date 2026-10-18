# Ảnh Zalo từ Google Sheet

Quản trị → Ảnh Zalo từ Sheet (`/#/admin/anh-zalo`). Nguồn và lịch lưu riêng trong D1; không phụ thuộc tên Sheet/cột cố định.

Ngoài Google OAuth, có tùy chọn [Apps Script](zalo-apps-script.md) để chuyển dữ liệu/ảnh từ tài khoản Google mà không cần tự tạo OAuth client. Hai phương thức dùng chung lịch gửi và sổ chống trùng; chuyển phương thức không xóa quyền Google đã lưu.

## Giờ chỉ định

Trong Lịch gửi & đăng ký → Cách đặt lịch, chọn **Theo giờ chỉ định**, nhập các mốc `HH:mm` cách nhau bằng dấu phẩy hoặc xuống dòng, ví dụ `08:00, 12:30, 19:00`. Hỗ trợ tối đa 48 mốc/ngày, bỏ mốc trùng và sắp xếp theo giờ. Áp dụng múi giờ và các ngày trong tuần đã chọn; chu kỳ gửi/phần khung giờ được ẩn vì không dùng ở chế độ này. Lịch cũ không có `schedule` vẫn chạy theo khung giờ, không tự chuyển sang giờ chỉ định.

Mỗi mốc bắt đầu một lượt gửi, tối đa một ảnh đang chờ cho mỗi người đủ điều kiện. Một lượt có tối đa 10 phút để cron tiếp tục gửi lần lượt, bao gồm trường hợp cron chậm hoặc Apps Script đang chuyển ảnh. Nếu gặp mốc mới trong khoảng này, mốc mới bắt đầu lượt mới. Quá thời hạn, ảnh chưa gửi sẽ chờ mốc tiếp theo. Mốc gần nửa đêm được tiếp tục sang ngày hôm sau trong phần thời hạn còn lại, nhưng dùng ngày trong tuần của mốc bắt đầu. Không bảo đảm gửi chính xác tới giây hoặc gửi hết mọi người nếu hàng chờ vượt tốc độ tối đa 10 người/phút. Ảnh cần được đồng bộ và chuyển lên trước khi có thể gửi; không tự gửi lại ảnh đã giao thành công.

## Kết nối Google để đọc tệp riêng tư

Google Drive trong ChatGPT chỉ cấp quyền cho phiên chat, không cấp token cho Worker. Website sử dụng OAuth riêng, quyền `https://www.googleapis.com/auth/drive.readonly` để đọc Sheet và ảnh tham chiếu. Không yêu cầu quyền sửa/xóa Drive. Quyền này có thể cần Google xác minh nếu đưa ứng dụng OAuth ra công khai; tài khoản thử nghiệm được khai báo có thể dùng ở chế độ Testing, nhưng refresh token thường hết hạn sau 7 ngày ở chế độ này.

1. Trong Google Cloud của chủ website, bật **Google Drive API** và **Google Sheets API**. Cấu hình OAuth consent screen, thêm email chủ tài khoản làm test user nếu dùng Testing.
2. Tạo OAuth client loại **Web application**, thêm Authorized redirect URI chính xác:
   `https://net-ve-studio.netve-nj3kqr.workers.dev/api/image-feed/google/callback`
   Khi đổi domain, dùng địa chỉ hiển thị trong quản trị của domain mới.
3. Trong quản trị → Ảnh Zalo từ Sheet → Kết nối Google Drive, nhập tệp JSON OAuth (`web.client_id`, `web.client_secret`) hoặc nhập hai trường trực tiếp. Client secret chỉ ghi, không trả về giao diện. Không đưa tệp này vào chat, mã nguồn hoặc thư mục public.
4. Bấm **Kết nối Google**, chủ tài khoản tự đăng nhập và chấp thuận quyền đọc. Website kiểm tra phiên quản trị khởi tạo, state một lần 10 phút và PKCE, rồi lưu refresh/access token bằng AES-GCM với khóa dẫn xuất từ RUNNER_TOKEN. Token không gửi xuống trình duyệt và không nằm trong URL ảnh gửi Zalo.
5. Kết nối xong, bấm đọc cột & xem trước, lưu cấu hình và bật lịch gửi. Nguồn được xác minh: file `1362B6hviAe69_o5pgfOs_5RFvZi1-peaUxtQ4fwil20`, gid `102` (Biểu đồ), cột `Link ảnh Google Drive`, `ID`, `Caption đề xuất`. API tìm tab theo gid ở mỗi lần đọc nên đổi tên tab không làm hỏng kết nối.
6. **Ngắt kết nối** xóa token và state cục bộ, đồng thời thử thu hồi quyền ở Google. Giữ Client ID/secret cho lần kết nối sau. Đổi client/secret sẽ xóa token cũ. Đổi RUNNER_TOKEN cần nhập/cấp quyền lại.

Khi đã cấp quyền, Worker tự đọc qua Sheets API và Drive `files.get?alt=media`; không cần công khai Sheet/ảnh. Nếu chưa kết nối, hệ thống giữ phương án nguồn công khai bên dưới. Lỗi quyền truy cập không tự chuyển sang gửi link. Tác vụ không thể tự xin quyền Google hoặc tự tạo OAuth client thay chủ tài khoản khi chưa có thông tin xác thực Google Cloud.

Tài liệu Google: https://developers.google.com/identity/protocols/oauth2/web-server và https://developers.google.com/workspace/drive/api/guides/api-specific-auth

1. Dùng kết nối OAuth ở trên; hoặc cho phép xem Sheet và ảnh Drive bằng liên kết khi chưa dùng OAuth. Chỉ tải ảnh PNG/JPEG/WebP tối đa 8 MB qua các máy chủ Google cho phép; không gửi trang HTML hoặc link thay ảnh.
2. Dán link Sheet, chọn gid ổn định khi đổi tên tab, dòng tiêu đề, bấm đọc cột. Chọn cột ảnh và tùy chọn cột mã/chú thích. Tên cột theo tiêu đề được ưu tiên; có thể nhập các tên thay thế bằng dấu `|`, hoặc vị trí `#A`, `#B`. Khi đổi tên hoặc di chuyển cột không còn khớp, hệ thống báo lỗi để quản trị chọn lại; không đoán sai cột.
3. Chọn chu kỳ đọc, múi giờ IANA, ngày trong tuần và nhiều khung giờ không trùng (hỗ trợ qua nửa đêm). Mỗi người tối đa một ảnh mỗi khoảng gửi trong khung giờ. Ngoài giờ vẫn ghi nhận ảnh mới, để gửi trong khung tiếp theo. Tác vụ cron mỗi phút nên thời điểm có thể chậm khoảng một phút.
4. Lần đọc đầu: mặc định bỏ qua ảnh cũ. Tùy chọn đưa ảnh hiện có vào hàng chờ áp dụng cho người đã đăng ký trước thời điểm đọc nguồn. Người đăng ký mới chỉ nhận ảnh được phát hiện sau lần đăng ký đầu tiên, không nhận toàn bộ lịch sử. Hủy rồi đăng ký lại vẫn giữ thời điểm đăng ký đầu tiên và lịch sử chống trùng; ảnh phát sinh trong lúc tạm dừng có thể nhận sau khi đăng ký lại.
5. Người dùng nhắn `NHẬN ẢNH` / `ĐĂNG KÝ NHẬN ẢNH`, hoặc `HỦY NHẬN ẢNH`. `TAT` cũng dừng ảnh. `BAT` chỉ bật thông báo video, không tự đăng ký ảnh thay khách.

Danh tính ảnh gồm mã Sheet, gid và ID tệp Drive; cột mã tùy chọn được lưu để đối chiếu và không ảnh hưởng chống trùng. đổi URL chia sẻ của cùng tệp, sắp xếp dòng, đổi chú thích không tạo lượt gửi mới. Một tệp bị ghi đè nội dung với cùng ID không được coi là ảnh mới; hãy tạo tệp mới. Không xóa sổ giao nhận khi đổi cấu hình.

`sendPhoto` gửi ảnh gốc với chú thích, không thêm link Drive. Ảnh được lưu tạm R2 trong 24 giờ; URL có token ngẫu nhiên hết hạn. Sau đó cron xóa bản tạm; metadata chống trùng và trạng thái gửi vẫn nằm trong D1. Đây không phải cơ chế sao lưu hoặc xóa ảnh nguồn Google Drive.

Mỗi cron tối đa 10 người nhận, tiếp tục vào phút sau, ưu tiên ảnh cũ trong hàng chờ. Dữ liệu nguồn tối đa 10.000 dòng, CSV tối đa 2 MB. Chỉ thử tự động tối đa 5 lần nếu Zalo trả lỗi rõ ràng. Mất phản hồi/kết thúc tiến trình khi đang gửi được ghi `unknown`; quản trị kiểm tra Zalo rồi cho phép thử lại để tránh gửi kép. Không thể bảo đảm exactly-once nếu API bên ngoài không hỗ trợ khóa idempotency. Giao diện có 100 đăng ký và 50 giao nhận gần nhất; tải lại trang để xem trạng thái mới.

Kiểm tra nguồn bằng nút quét không tự gửi ảnh; khi chế độ tự động đang bật, ảnh mới ghi nhận sẽ được cron xử lý theo lịch. Muốn kiểm tra hoàn toàn không gửi, tắt tự động trước. Chưa có người đăng ký hoặc nguồn thiếu quyền sẽ không phát sinh tin gửi ảnh.
