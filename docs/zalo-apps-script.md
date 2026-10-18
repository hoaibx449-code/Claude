# Apps Script: tùy chọn bổ sung cho ảnh Zalo

Kết nối Google OAuth hiện có được giữ nguyên. Chọn phương thức tại Quản trị → Ảnh Zalo từ Sheet. Mỗi lần chỉ dùng một phương thức để lấy dữ liệu/ảnh, dùng chung lịch gửi, người đăng ký và sổ chống trùng. Cấu hình cũ không có `transport` vẫn dùng Google OAuth hoặc nguồn công khai như trước.

## Cài một lần

1. Chọn **Apps Script**, kiểm tra file Sheet, gid, dòng tiêu đề và ánh xạ cột. Nguồn mặc định là tab Biểu đồ gid `102`, ảnh `Link ảnh Google Drive`, mã `ID`, chú thích `Caption đề xuất`.
2. Bấm **Tạo mã cài đặt**. Web lưu cấu hình hiện tại và tạo khóa ngẫu nhiên riêng cho bridge; chỉ hash khóa nằm trong D1. Mã hiển thị một lần, có nút sao chép/tải `.gs`. Tạo lại mã sẽ thu hồi khóa cũ. Không đưa mã có khóa lên GitHub hoặc chia sẻ công khai.
3. Trong Sheet, mở **Tiện ích mở rộng → Apps Script**, tạo một tệp `.gs` riêng, dán toàn bộ mã, lưu. Không ghi đè mã chức năng khác. Chạy hàm **caiDat**, chủ tài khoản tự chấp thuận quyền Google. Không cần Client ID, Client secret, Advanced Services hoặc triển khai Web App.
4. `caiDat` cài một trigger 5 phút và chạy đồng bộ đầu tiên. Khi cài lại, chỉ thay trigger có handler `dongBoAnh`; các trigger khác giữ nguyên. Chạy `dongBoAnh` để kiểm tra thêm. Hàm `dungDongBo` chỉ gỡ trigger chức năng này.
5. Làm mới trạng thái trên web để xem giờ đồng bộ và lỗi. Chọn lại cột từ bản xem trước nếu tên cột thay đổi. Lưu cấu hình, đợi đồng bộ kế tiếp hoặc chạy `dongBoAnh`, rồi bật tự động gửi khi đã sẵn sàng.

## Luồng và giới hạn

Script chỉ đọc Sheet/tab đã cấu hình theo ID/gid, chuyển tối đa 10.000 dòng × 200 cột (payload JSON tối đa 2 MB). Header, tên cột và thứ tự cột không cố định. Các thay đổi ánh xạ được lấy từ web, không phải sửa mã script. Tab được tìm theo gid nên đổi tên không làm mất kết nối. Thay dòng tiêu đề cần đồng bộ lại trước khi xem trước.

Mỗi lần chạy script hỏi web về cấu hình và ảnh còn thiếu. Nếu đến kỳ đọc, script dùng `SpreadsheetApp` đọc dữ liệu và đẩy qua HTTPS; cùng một ảnh Drive không tạo mục mới khi sắp xếp dòng, sửa caption hoặc thay phương thức. Nếu ánh xạ sai, snapshot vẫn được giữ để quản trị xem trước và chọn lại, lỗi được hiện rõ.

Web yêu cầu tối đa 3 ảnh còn thiếu mỗi lượt, chỉ từ nguồn đang chọn và có người đăng ký đủ điều kiện. Script dùng `DriveApp` lấy ảnh gốc và chuyển byte qua HTTPS. Tối đa 8 MB/ảnh; server kiểm tra chữ ký PNG/JPEG/WebP, không nhận HTML giả ảnh. Ảnh lỗi quyền/định dạng được lùi lịch thử để không chặn mãi những ảnh kế tiếp. Cache R2 giữ 24 giờ, sau đó xóa như nguồn Google; metadata chống trùng vẫn giữ ở D1. Ảnh hết cache nhưng còn chờ gửi được yêu cầu chuyển lại.

Trong chế độ Apps Script, cron không gọi Google OAuth hoặc tải Drive công khai, và chỉ lấy ảnh đã chuyển thành công để gửi, không tiêu hao số lần gửi cho ảnh còn thiếu. Lịch ngày/khung giờ và chu kỳ gửi vẫn do Worker quản lý. Script không chứa token Zalo, không biết danh sách người nhận và không tự gửi tin. Có thể đồng bộ dữ liệu khi lịch gửi đang tắt; điều đó không tự bật gửi cho khách.

Trigger chạy khoảng mỗi 5 phút, nên cài chu kỳ đọc 1–4 phút vẫn bị giới hạn bởi nhịp trigger. Mỗi lượt chỉ chuyển 3 ảnh để kiểm soát thời gian và dung lượng; hàng chờ lớn sẽ cần nhiều lượt. Apps Script có hạn mức Google theo tài khoản, đây không phải cam kết vận hành không giới hạn. Google chấp thuận quyền theo các dịch vụ script sử dụng; script không gọi thao tác sửa/xóa Sheet/Drive.

## Thu hồi và đổi phương thức

Nút **Thu hồi khóa Apps Script** vô hiệu ngay các yêu cầu mới với khóa đó, không xóa kết nối Google OAuth, metadata hoặc lịch sử gửi. Gỡ trigger trong Apps Script hoặc chạy `dungDongBo` để ngừng các lượt gọi bị từ chối. Có thể chọn lại Google và lưu để quay về phương án trước; script sẽ nhận `active:false` và không đọc/chuyển dữ liệu nữa. Snapshot gồm dữ liệu nguồn riêng tư chỉ được đọc qua quản trị đã xác thực.

Chưa cài/chấp thuận Apps Script trong tài khoản Google thì trạng thái phải là chưa nhận dữ liệu, không được coi là đã kết nối thực tế. Nút tạo mã không tự đổi quyền chia sẻ Sheet/Drive và không triển khai script trong tài khoản người dùng.

Tài liệu: https://developers.google.com/apps-script/guides/triggers/installable và https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
