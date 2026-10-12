// Default legal documents (admin-editable on the admin page → Nội dung → Pháp lý).
// Format: "## " headings, "- " bullets, blank lines between paragraphs; {placeholders} are
// filled from the company details. They are a starting point drafted for Vietnamese law
// (Luật Bảo vệ dữ liệu cá nhân 2025, Nghị định 13/2023/NĐ-CP, Luật Bảo vệ quyền lợi người
// tiêu dùng 2023, Luật An ninh mạng 2018, Bộ luật Dân sự 2015) and should be reviewed by a lawyer.

export const LEGAL_VERSION = '2026-10-12';

export const DEFAULT_TERMS = `## 1. Giới thiệu
{brand} ("chúng tôi") cung cấp công cụ tạo video bàn tay vẽ từ kịch bản. Khi đăng nhập hoặc sử dụng dịch vụ, bạn đồng ý với Điều khoản này và Chính sách bảo mật. Nếu không đồng ý, vui lòng không sử dụng dịch vụ.

## 2. Tài khoản
- Bạn đăng nhập bằng tài khoản Google hoặc Zalo của chính mình và chịu trách nhiệm về mọi hoạt động trong tài khoản.
- Bạn phải từ đủ 16 tuổi, hoặc có sự đồng ý của cha mẹ/người giám hộ.
- Chúng tôi có thể khoá tài khoản vi phạm Điều khoản, sau khi thông báo nếu có thể.

## 3. Nội dung của bạn
- Kịch bản, hình ảnh và video bạn tạo thuộc về bạn. Bạn cấp cho chúng tôi quyền xử lý nội dung đó chỉ để tạo, lưu và gửi video cho bạn.
- Bạn cam kết có quyền hợp pháp với nội dung đưa lên và không tạo nội dung: vi phạm pháp luật Việt Nam; xúc phạm, bôi nhọ, phân biệt đối xử; xâm phạm quyền sở hữu trí tuệ, quyền riêng tư của người khác; lừa đảo, giả mạo tổ chức/cá nhân; thông tin sai sự thật gây hoang mang.
- Nội dung do AI hỗ trợ có thể chưa chính xác. Bạn tự kiểm tra trước khi đăng, đặc biệt với thông tin tài chính, sức khoẻ, pháp lý.

## 4. Dịch vụ và giới hạn
- Gói miễn phí có giới hạn số lượt mỗi ngày. Gói trả phí mở rộng giới hạn theo mô tả tại trang Bảng giá.
- Chúng tôi cố gắng duy trì dịch vụ liên tục nhưng không cam kết không gián đoạn. Video được lưu tối thiểu 30 ngày; bạn nên tải về bản cần giữ lâu dài.
- Không dùng công cụ tự động, khai thác lỗi hoặc làm quá tải hệ thống.

## 5. Thanh toán
- Giá hiển thị bằng Việt Nam đồng, đã bao gồm thuế nếu có. Gói được kích hoạt khi chúng tôi nhận đủ tiền với đúng nội dung chuyển khoản.
- Chính sách hoàn tiền được nêu tại trang Hoàn tiền.

## 6. Sở hữu trí tuệ
Phần mềm, giao diện, thương hiệu {brand} thuộc về chúng tôi. Thư viện hình nét vẽ dùng giấy phép mở (MIT) và phông chữ dùng giấy phép SIL OFL; bạn được dùng chúng trong video tạo ra từ dịch vụ, kể cả mục đích thương mại.

## 7. Trách nhiệm
Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp phát sinh từ việc sử dụng video, và tổng trách nhiệm không vượt quá số tiền bạn đã trả trong 3 tháng gần nhất.

## 8. Thay đổi và luật áp dụng
Chúng tôi có thể cập nhật Điều khoản và sẽ thông báo trên trang web; bạn được yêu cầu đồng ý lại khi đăng nhập. Điều khoản được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được ưu tiên thương lượng; nếu không thành, giải quyết tại toà án có thẩm quyền tại Việt Nam.

## 9. Liên hệ
{company} · {address} · Email: {email}`;

export const DEFAULT_PRIVACY = `## 1. Chúng tôi là ai
{company} ("bên kiểm soát và xử lý dữ liệu") vận hành {brand}. Liên hệ về dữ liệu cá nhân: {email}.

## 2. Dữ liệu chúng tôi thu thập
- Khi đăng nhập Google: tên, địa chỉ email, ảnh đại diện, mã định danh tài khoản Google. Chúng tôi KHÔNG nhận mật khẩu và không có quyền đăng bài hay đọc thư của bạn.
- Khi dùng Zalo: tên hiển thị và mã cuộc trò chuyện với bot.
- Nội dung bạn tạo: kịch bản, cài đặt video, hình ảnh, video và phụ đề.
- Dữ liệu sử dụng: thao tác trên trang (trang đã xem, nút đã bấm, lỗi), thời điểm, loại trình duyệt, địa chỉ IP đã được làm mờ (bỏ phần cuối).
- Khi thanh toán: mã đơn, số tiền, mã giao dịch ngân hàng. Chúng tôi không lưu số thẻ hay thông tin đăng nhập ngân hàng.

## 3. Mục đích xử lý
- Cung cấp dịch vụ: tạo kịch bản, hình vẽ, giọng đọc, dựng và gửi video.
- Bảo mật, chống gian lận và lạm dụng; giới hạn lượt dùng.
- Hỗ trợ, thông báo về video và đơn hàng.
- Thống kê ẩn danh để cải thiện sản phẩm.
Chúng tôi không bán dữ liệu cá nhân và không dùng nội dung của bạn để quảng cáo.

## 4. Cơ sở xử lý
Sự đồng ý của bạn khi đăng nhập (có thể rút lại bất cứ lúc nào), việc thực hiện hợp đồng dịch vụ, và nghĩa vụ pháp lý (ví dụ lưu chứng từ thanh toán).

## 5. Bên xử lý dữ liệu và chuyển dữ liệu ra nước ngoài
Để vận hành, một phần dữ liệu được xử lý bởi nhà cung cấp có máy chủ ở nước ngoài:
- Cloudflare (lưu trữ và vận hành trang web), Google Cloud (máy dựng video, giọng đọc).
- Nhà cung cấp AI khi bạn dùng tính năng AI: Google Gemini, OpenAI (chỉ gửi kịch bản/chủ đề, không gửi email của bạn).
- Nhà cung cấp giọng đọc: EverAI, Google Text-to-Speech.
- Zalo (khi bạn dùng bot), SePay và ngân hàng (khi thanh toán).
Chúng tôi chỉ chia sẻ phần dữ liệu cần thiết cho từng việc và lập hồ sơ đánh giá tác động chuyển dữ liệu ra nước ngoài theo quy định.

## 6. Thời gian lưu
- Tài khoản và video: đến khi bạn xoá tài khoản.
- Nhật ký sử dụng: tối đa 180 ngày.
- Chứng từ thanh toán: theo thời hạn pháp luật về kế toán, thuế.

## 7. Quyền của bạn
Bạn có quyền được biết, đồng ý hoặc rút lại đồng ý, truy cập, chỉnh sửa, xoá dữ liệu, hạn chế xử lý, phản đối xử lý, nhận bản sao dữ liệu và khiếu nại. Tại trang Tài khoản, bạn có thể tự tải toàn bộ dữ liệu của mình và xoá tài khoản. Yêu cầu khác gửi về {email}; chúng tôi phản hồi trong thời hạn luật định.

## 8. Bảo mật
Kết nối được mã hoá (HTTPS). Phiên đăng nhập dùng cookie bảo mật (HttpOnly, Secure, SameSite) và chỉ lưu bản băm. Khoá dịch vụ được mã hoá. Quyền truy cập dữ liệu được giới hạn cho người vận hành. Nếu có sự cố lộ dữ liệu, chúng tôi sẽ thông báo cho bạn và cơ quan có thẩm quyền theo quy định.

## 9. Cookie và lưu trữ trên trình duyệt
Chúng tôi chỉ dùng cookie cần thiết cho đăng nhập và lưu trên trình duyệt một mã ngẫu nhiên để thống kê thao tác, không dùng cookie quảng cáo của bên thứ ba.

## 10. Trẻ em
Dịch vụ không dành cho người dưới 16 tuổi khi chưa có sự đồng ý của cha mẹ hoặc người giám hộ.

## 11. Thay đổi
Khi chính sách thay đổi, chúng tôi cập nhật phiên bản và đề nghị bạn đồng ý lại ở lần đăng nhập tiếp theo.`;

export const DEFAULT_REFUND = `## Hoàn tiền
- Trong 7 ngày kể từ khi thanh toán, nếu bạn chưa dựng video nào bằng quyền lợi của gói trả phí, bạn được hoàn 100% số tiền.
- Nếu dịch vụ lỗi khiến bạn không dùng được quá 3 ngày liên tục, chúng tôi gia hạn gói tương ứng hoặc hoàn tiền phần chưa dùng.
- Chuyển khoản sai nội dung hoặc thiếu tiền: liên hệ {email} kèm ảnh giao dịch, chúng tôi xử lý trong 1-3 ngày làm việc.
- Tiền được hoàn về đúng tài khoản đã chuyển trong tối đa 7 ngày làm việc.

## Liên hệ
{company} · {address} · {email}`;

export interface LegalConfig { company: string; email: string; address: string; taxId: string; version: string; terms: string; privacy: string; refund: string }

export function fillLegal(text: string, l: LegalConfig, brand: string) {
  return text.replace(/\{(brand|company|email|address|taxId)\}/g, (_, k) => (k === 'brand' ? brand : (l as any)[k] || '…'));
}
