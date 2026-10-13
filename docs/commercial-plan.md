# Nét Vẽ Studio: đề xuất sản phẩm và điều kiện ra mắt

Ngày rà soát: 13/10/2026. Đối tượng ưu tiên: người làm kênh kiến thức tiếng Việt, giáo viên và doanh nghiệp nhỏ cần video giải thích. Đây là kế hoạch sản phẩm cùng kết quả sửa lỗi trong repository; không phải chứng nhận hệ thống production đã an toàn hoặc vận hành ổn định.

## 1. Sản phẩm nên bán

**“Biến kịch bản của bạn thành video giải thích có nhịp kể chuyện, giọng đọc tự nhiên và hình minh họa đúng ý.”** Bàn tay vẽ là một cách thể hiện, không phải toàn bộ lợi ích. Khách mua thời gian tiết kiệm, khả năng sửa và chất lượng video xuất ra.

Bản đầu tập trung video 30–90 giây, khung dọc cho Shorts/Reels/TikTok và khung ngang cho bài giảng. Không cạnh tranh bằng việc tạo mọi loại phim AI hoặc hứa video tự động viral. Chọn một ngách trước, đo khách có xuất và đăng lại video lần hai hay không, rồi mở rộng.

Ba luồng tạo:

1. **Rẻ nhất:** dán kịch bản → hệ thống chia ý → icon, người que, biểu đồ tự thiết kế → chọn giọng → xem nháp → dựng MP4 trên máy chủ.
2. **AI hỗ trợ:** nhập chủ đề → AI viết bản nháp → người dùng sửa → minh họa bằng quy tắc. Chỉ gọi AI một lần cho kịch bản khi có thể.
3. **Nâng cao:** ảnh AI cho những cảnh thật sự cần hình đặc thù; tái sử dụng nhân vật, ảnh sản phẩm và cảnh nền. Hiện repository có ảnh tham chiếu nhưng chưa bảo đảm nhất quán nhân vật từ AI giữa các ảnh.

Bản nháp trong trình duyệt giúp chỉnh bố cục. MP4 cuối được dựng bằng Node/Skia/FFmpeg và hàng đợi máy chủ; người dùng đóng tab vẫn phải nhận được kết quả.

## 2. Phản biện các đề xuất

| Đề xuất | Vấn đề thương mại | Hướng chọn |
| --- | --- | --- |
| Càng nhiều phong cách càng tốt | Quá nhiều lựa chọn khiến khó bắt đầu, tăng kiểm thử và hỗ trợ | Trưng bày 4 cách kể chính, mỗi cách có vài bảng màu; chọn mẫu theo mục tiêu |
| Miễn phí càng nhiều càng tốt | Video, lưu trữ và giọng đọc đều có chi phí; tài khoản Google cũng không ngăn tạo nhiều tài khoản | Xem nháp miễn phí, hạn mức xuất rõ ràng; trả phí cho giá trị thật, đặt trần chi phí |
| Mỗi câu vẽ rồi đọc lần lượt | Nhịp đều đều, giọng mất ngữ cảnh và khoảng lặng tích lũy | Đọc liền đoạn; chuyển hình trong lúc lời kể tiếp tục; mỗi cảnh một ý, không phải một câu |
| Toàn bộ cảnh phải có bàn tay | Người xem phải đợi cả những hình không cần quá trình vẽ | Dùng bàn tay ở ý cần giải thích, chuyển động/chữ ở điểm nhấn; phối chế độ trong một video là tính năng tiếp theo |
| Giọng miễn phí đủ để bán | espeak là giọng máy, không tương đương giọng người; Google có hạn mức và điều kiện tính phí | Cho nghe trước, công bố nguồn giọng; không thay giọng trả phí bằng giọng máy âm thầm |
| Có Google login là đủ an toàn | Xác thực không thay phân quyền, chống lạm dụng, an toàn upload hoặc vận hành | Kiểm tra sở hữu dự án, chủ tài khoản admin rõ ràng, giới hạn chi phí và audit log |
| Nhiều ảnh AI làm video hấp dẫn hơn | Tốn tiền, hình có thể không đúng ý; chữ và số dễ sai | Icon/biểu đồ xác định trước cho kiến thức, ảnh AI chỉ dùng khi tăng giá trị |
| Web có thể hứa video giữ chân người xem | Chưa có dữ liệu chứng minh | Kiểm thử mẫu nội dung thật; đo khả năng xuất, đăng và quay lại, không cam kết lượt xem |

## 3. Bốn họ phong cách và demo

Mở [demo so sánh](commercial-demo.html). Tạo lại video bằng `node tools/commercial-demo.mjs` từ thư mục gốc. Bốn MP4 thật nằm trong `out/commercial-demo/`, cùng kịch bản, khung 360×640, 15 FPS, khoảng 15,8 giây. **Âm thanh là mock im lặng**, có phụ đề trên hình. Demo này minh chứng engine dựng hình, chưa minh chứng chất lượng TTS thật.

| Họ | Biến thể phù hợp | Nội dung tốt nhất | Điều nên tránh |
| --- | --- | --- | --- |
| Bàn tay vẽ | Bảng trắng, sổ tay, phấn, kraft, bút chì | Giải thích, kể chuyện, bài giảng | Vẽ quá nhiều chữ, đợi hoàn thành từng nét mới đọc tiếp |
| Đồ họa chuyển động | Cosmos, pastel, neon, sunset | Mẹo ngắn, so sánh, giới thiệu sản phẩm | Quá nhiều chuyển động và màu cùng lúc |
| Biểu đồ/quy trình | Manim, blueprint, darkboard | Dữ liệu, tài chính giáo dục, các bước | Biểu đồ đẹp nhưng không có nguồn hoặc không đúng số liệu |
| Chữ chuyển động | Bold, newspaper, comic | Hook, câu chốt, thông điệp ngắn | Cả bài dài thành màn hình đầy chữ |

Engine hiện có 17 phong cách màu/chất liệu và 4 chế độ. Phối nhiều chế độ trong một video, zoom thông minh theo ý và nhạc nền tự hạ âm lượng là đề xuất, chưa triển khai trong đợt này.

## 4. Sửa cảm giác đọc chậm, ngắt quãng

Đã thay EverAI từ một lần gọi cho mỗi câu sang **một lần gọi cho cả đoạn trong cảnh**, tối đa 5.000 ký tự mỗi request. Đoạn dài tách ở ranh giới câu. Giữ dấu câu tự nhiên, không thêm khoảng nghỉ 250 ms giữa các câu. Cache theo nội dung + cấu hình giọng; đổi đường dẫn output không làm mất cache cục bộ.

Google TTS vẫn dùng SSML mark trước câu, bỏ break cưỡng bức sau câu. Khi không có mốc hợp lệ, phân bố câu theo thời lượng audio thực tế. espeak đọc cả đoạn một lần qua stdin, tránh câu bắt đầu bằng dấu gạch bị hiểu thành tùy chọn dòng lệnh.

**Giới hạn cần hiểu:** EverAI không cung cấp timestamp trong tích hợp hiện tại. Mốc câu được ước lượng theo độ dài và khớp tổng audio, không phải forced alignment hoặc đồng bộ chính xác từng từ. Các cảnh vẫn được đọc riêng và timeline vẫn có khoảng chuyển cảnh. Một bài dài vẫn có thể nghe thiếu liền mạch giữa cảnh; cần bước tiếp theo là audio toàn bài + timestamp/alignment để tách cảnh theo lời nói, cùng thử nghe giọng thật.

Quy trình chất lượng đề xuất:

1. Viết hook vào ngay lời đầu; không mặc định mở logo 1,8 giây trước hook.
2. Mỗi đoạn 2–3 ý nối tự nhiên; xen câu ngắn nhấn với câu giải thích dài. Đã điều chỉnh prompt AI bỏ yêu cầu mọi câu đều rất ngắn.
3. Nghe thử 15–20 giây trước khi dựng. Người dùng chọn tốc độ, cách phát âm tên riêng và nơi muốn nghỉ. UI nghe thử và từ điển phát âm chưa triển khai.
4. Khi có timestamp, đồng bộ theo cụm ý. Khi chỉ có estimate, báo rõ mốc gần đúng.
5. Không kéo dài audio để chờ vẽ xong; giản lược hình hoặc vẽ chồng theo lời kể. Timeline hiện có thể kéo cảnh để hoàn thành nhiều panel; cần tối ưu tiếp.
6. Nếu giọng trả phí lỗi, phải xin chọn giọng khác hoặc thông báo trước xuất. Hiện fallback tự động vẫn tồn tại và cần sửa UX trước bán gói giọng cao cấp.

## 5. Trải nghiệm cần hoàn thiện

Màn tạo bắt đầu bằng mục tiêu “giải thích / kể chuyện / bán hàng / hướng dẫn”, sau đó kịch bản, phong cách và giọng. Hiện web đã có phân loại ý định và template; cần thử với khách để điều chỉnh tên gọi.

Màn biên tập cần ba vùng: câu chuyện, storyboard và xem/nghe nháp. Hiển thị cảnh lỗi cụ thể; chỉ tạo lại cảnh đó. Trước xuất, báo độ dài dự kiến, giọng thực tế, hạn mức sẽ trừ và phần trả phí. Không đưa tên hạ tầng hoặc model vào luồng cơ bản trừ khi ảnh hưởng chi phí/quyền lựa chọn.

Sau xuất: trạng thái có tiến độ, cho rời trang, lịch sử video, tải MP4/SRT, tạo phiên bản mới và thông báo khi xong. Hiện có queue và lịch sử; cần kiểm chứng timeout/retry/upload trong production.

Tiếp cận: tương phản, thao tác bàn phím, giảm chuyển động, chữ dễ đọc trên điện thoại; phụ đề SRT mặc định được xuất, phụ đề trên video do người dùng chọn.

## 6. Chi phí và gói bán

Không gọi hạ tầng miễn phí là miễn phí vô hạn. Giá dưới đây là phép tính từ bảng giá hiện đang lưu trong repository, **không phải báo giá nhà cung cấp được kiểm chứng ở ngày ra mắt**.

- 60 ảnh/ngày × 30 ngày × 0,039 USD = **70,2 USD/tháng**, chưa tính voice/render. Nếu dùng mức 0,063 USD thì **113,4 USD/tháng**.
- Gói Pro mặc định đang là 199.000đ/tháng; với tỷ giá cấu hình 26.000đ/USD là khoảng **7,65 USD**.
- Vì vậy hạn mức Pro hiện tại (60 ảnh/ngày, 10 video/ngày, tối đa 600 giây/video) **không đủ cơ sở kinh tế để mở bán**. Hạn mức miễn phí cho phép mọi giọng cũng cần giới hạn trước production. Chưa tự thay các cấu hình kinh doanh đã lưu của chủ web.

Đề xuất tách hai ngân sách: phút xuất video và credit cho API trả phí. Free: xem nháp, minh họa theo quy tắc, hạn mức video ngắn nhỏ, giọng offline hoặc upload giọng có quyền sử dụng. Creator: cấp quota theo tháng; ảnh và giọng cao cấp trừ credit có giá dự kiến trước thao tác. Studio: brand kit, xử lý hàng loạt, thêm thành viên sau khi chứng minh nhu cầu.

Không nên thu phí theo số cảnh: người dùng chia một ý thành nhiều cảnh sẽ cảm thấy bị phạt. Phút xuất và dịch vụ API minh bạch hơn. Gói/credit theo tháng, đặt chỗ ngân sách trước API và trần chi phí toàn hệ thống **chưa được triển khai**; quota hiện là theo ngày.

Công thức kiểm định mỗi gói:

`Chi phí tháng = lời đọc + AI văn bản + ảnh + CPU/GPU dựng + lưu trữ + DB/Worker + thanh toán + hỗ trợ + dự phòng lỗi`

Chọn giá sau khi đo ít nhất một nhóm video thật. Mục tiêu biên lợi nhuận và giới hạn gói là giả thuyết kinh doanh; thử mức sử dụng xấu nhất, không chỉ người dùng trung bình. Ưu tiên cache theo người dùng/nội dung, reuse ảnh, sửa cảnh mà không dựng lại mọi audio, có TTL video và cảnh báo ngân sách. Cache voice cục bộ đã sửa; cache chia sẻ qua các instance Cloud Run và cache thông tin chi phí thực tế chưa có.

## 7. Kiến trúc và an toàn

Kiến trúc hiện có phù hợp bản đầu: Cloudflare Worker phục vụ web/API, D1 cho metadata và trạng thái, R2 cho assets/video, Cloud Run Jobs cho dựng. Một job chạy khi cần, hết hàng đợi thì tắt; không phụ thuộc tab trình duyệt. Không cần GPU cho engine vẽ hiện tại.

Biện pháp bắt buộc trước ra mắt:

- Google OAuth: kiểm chứng trên domain production, consent/nonce, logout, app trình duyệt trong Zalo/Facebook. Local dev login không phải bằng chứng Google production đã chạy.
- Admin: `ADMIN_EMAIL` chỉ định chủ bootstrap, hoặc danh sách admin đã lưu. Đã bỏ “người Google đầu tiên tự thành admin”. Đặt GitHub Actions variable `ADMIN_EMAIL` và deploy lại; không còn tự cấp quyền cho khách đầu tiên.
- Worker và runner chỉ có quyền đúng tài nguyên; không dùng tài khoản Owner làm tài khoản runtime. Workflow Cloud Run đã chỉ định service account runtime `nv-render` riêng và không cấp quyền toàn dự án cho nó. Giọng Google qua metadata cần quyền TTS/billing được cấu hình riêng; mặc định có giọng offline. Khóa dài hạn để trigger vẫn tồn tại; cần chuyển sang identity/rotation có kiểm soát. Chưa chạy deploy thực tế để xác nhận IAM.
- Secret chỉ nằm ở cài đặt môi trường/vault, không nằm trong Git hoặc gửi về trình duyệt. Quyền ghi khóa admin và xoay khóa phải được kiểm thử trên hạ tầng thật.
- Có lease theo lần claim job, heartbeat từ lúc tải asset/TTS đến upload, không cho worker cũ ghi đè sau reclaim. Đã thêm lease theo lần claim, heartbeat và output riêng theo lease; test reclaim từ chối cập nhật/hoàn tất từ worker cũ. Cần load test và mô phỏng lỗi mạng trên production trước scale.
- Timeout, chặn URL nội bộ/metadata cho download từ provider, giới hạn kích thước ảnh/audio/video và tài nguyên FFmpeg. JSON request đã kiểm tra số byte trong lúc đọc; các đường upload/download khác cần rà soát bổ sung.
- Sao lưu D1, chính sách giữ/xóa R2, thử khôi phục, telemetry chi phí và cảnh báo lỗi. Xóa tài khoản phải kiểm tra cả assets/community/payment records theo yêu cầu lưu trữ hợp pháp.
- Kiểm thử chống lạm dụng xem thử vô danh và đăng nhập, chống nhiều request đồng thời, và trần CPU/API tổng thể. Quota theo người dùng không thay được ngân sách toàn dịch vụ.

Cloud Run free allowance hoặc Google TTS miễn phí phụ thuộc điều kiện và mức sử dụng, không phải cam kết không phát sinh tiền. Đặt budget alert vẫn chưa phải hard cap; hard cap phải có ở ứng dụng/quota provider.

## 8. Những lỗi đã sửa trong đợt này

| Vấn đề xác nhận | Thay đổi | Bằng chứng |
| --- | --- | --- |
| EverAI ngắt câu, nhiều API request | Đọc đoạn + cache ổn định ngoài thư mục job | Fake provider kiểm tra 1 request cho 2 câu và reuse cache |
| Google tự chèn khoảng nghỉ | Bỏ SSML break; fallback cue theo audio đo được | Kiểm thử cue; Google live chưa chạy |
| Chiều cao 427 làm FFmpeg lỗi/EPIPE | Làm tròn kích thước chẵn, xử lý lỗi encoder, dọn scratch | Test MP4 240×426, test encoder cố ý thất bại |
| Render đồng thời dùng chung scene audio | Thư mục tạm duy nhất mỗi render | Test render và kiểm tra dọn thư mục |
| Hạn mức 0 vẫn dùng một lần | Từ chối trước ghi quota | Test quota 0/âm/NaN/Infinity |
| JSON tính ký tự, đọc hết trước kiểm tra | Giới hạn UTF-8 byte khi đọc stream | Test tiếng Việt và request chunked |
| Khách đầu tiên chiếm quyền quản trị | Bootstrap email rõ ràng, mặc định từ chối | Test chủ được chỉ định và khách bất kỳ |
| Đơn đã thanh toán nhưng cấp gói có thể lỗi giữa chừng | D1 batch nguyên tử, unique transaction receipt | SQLite thực thi SQL thật, test retry và hai request đồng thời |
| Một giao dịch dùng cho nhiều đơn / sai tài khoản / tiền ra | Khóa receipt, kiểm tra account/type/amount/expiry | Test webhook với các trường hợp từ chối |
| Worker cũ ghi đè sau reclaim / task lỗi nhưng exit 0 | Lease riêng, output riêng, heartbeat, exit code lỗi | Test SQL reclaim và end-to-end runner mới |
| Wrangler cũ có cảnh báo bảo mật mức cao | Nâng Wrangler 4.149.0 và Workers types 5.20261013.1, cập nhật lockfile | npm audit: 0 cảnh báo tại lần kiểm tra |
| Hai request vượt số video đang chờ | INSERT có điều kiện đếm active ngay tại DB; hoàn quota khi không insert | Đã sửa, cần load test trên D1 thật |

Khi cập nhật giao thức lease, dừng nhận tác vụ mới, cho tác vụ đang chạy kết thúc rồi cập nhật cả Worker và runner cùng phiên bản. Video cũ vẫn đọc được từ khóa lưu trữ cũ; runner cũ không được hoàn tất job mới. Artifact của lượt thất bại cần TTL/cleanup R2 trong production.

Áp `web/schema.sql` trước triển khai code thanh toán mới: bảng `payment_receipts` là bổ sung tương thích, không xóa dữ liệu. Với giao dịch ngân hàng đã xử lý từ trước khi có bảng này, cần đối soát/backfill receipt trước bật webhook để tránh reuse lịch sử. Giữ nguyên đơn đã trả và quyền admin đã cấu hình.

## 9. Thứ tự hoàn thiện và điều kiện mở bán

**Giai đoạn nền tảng:** các sửa lỗi hiện tại; CI chạy test, typecheck, build; local end-to-end tạo → queue → render → tải. Kết quả hiện tại ghi trong `docs/validation-commercial.md`.

**Giai đoạn beta giới hạn:** load test lease/retry/heartbeat, hard cap chi phí và hạn mức giọng/ảnh; kiểm thử Google OAuth và một provider giọng thật; UI không âm thầm đổi giọng; đo p95 thời gian dựng; tạo bộ 20 kịch bản khách mục tiêu và cho nghe/xem thử. Ví dụ KPI mục tiêu: ít nhất 80% video thử được khách chấp nhận không sửa lớn; đây là tiêu chí đề xuất, chưa đo.

**Giai đoạn thu tiền:** kiểm thử webhook SePay staging + đối soát giao dịch lịch sử, Google production, backup/restore, giới hạn tác vụ, retention, pháp lý/chính sách hoàn tiền, quyền sử dụng font/hình/tay/giọng và tài khoản dịch vụ đúng quyền. Kiểm thử giả lập thanh toán không xác nhận SePay thật đã tích hợp.

**Giai đoạn mở rộng:** credit theo tháng, brand kit, voice toàn bài + alignment, phối phong cách theo đoạn, cộng tác và render từng phần. Đánh giá dữ liệu trước làm tính năng marketing phụ như Zalo/affiliate/community; chúng hiện có trong repository nhưng tăng bề mặt bảo mật và hỗ trợ.

Không đưa toàn bộ người dùng vào gói trả phí chỉ vì test unit đạt. Các điều kiện production còn thiếu ở trên là công việc thực, không được che bằng nhãn “sẵn sàng thương mại”.
