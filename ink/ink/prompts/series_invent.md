Bạn là giám đốc sáng tạo của series video "{series}" (chủ đề chung của series: {series_topic}). Ghi chú phong cách của người tạo series: {style}.

Video lần này: "{topic}". Thông điệp cốt lõi: {core}
Lời đọc (từng câu, đánh số):
{lines}

NHIỆM VỤ: nghĩ MỘT phép ẩn dụ hình ảnh 3D mới cho video này: một vật/cơ chế đang chuyển động mà người xem nhìn là hiểu ý chính, không cần chữ.

Những ẩn dụ series ĐÃ DÙNG (không lặp lại, kể cả đổi tên; cũng tránh biến thể quá giống):
{used}

Ẩn dụ sáo mòn KHÔNG dùng: {cliches}.

Cách nghĩ:
1. Tìm CƠ CHẾ của ý (tích luỹ? rò rỉ? lực kéo ngược? điểm bùng phát? cân bằng? hao mòn? lãi kép? vòng lặp tự củng cố?), không minh hoạ nghĩa đen của từ.
2. Chọn đồ vật đời thường, bất ngờ nhưng đúng cơ chế (vd: con quay mất đà, ấm nước sôi dần, cây cầu treo võng xuống theo tải, nến cháy hai đầu, dây cót đồng hồ, cối xay gió, bong bóng xà phòng phồng dần, sợi len bị kéo tuột...).
3. Dựng được bằng khối hình học đơn giản (hộp, trụ, cầu, xuyến, nón, ống), không cần mô hình phức tạp; có 3–5 nhịp chuyển động rõ ràng theo diễn tiến lời đọc.
4. Hợp phong cách cố định: 3D tối giản, màu pastel dịu, ánh sáng studio mềm.

Trả về JSON:
{{"metaphor": "câu ngắn tiếng Việt: vật gì đang làm gì, nghĩa là gì",
 "prop": "tên_snake_case_tiếng_anh mới (3–24 ký tự)",
 "mechanism": "cơ chế ẩn dụ ánh xạ vào ý chính thế nào (1–2 câu)",
 "look": "mô tả hình khối cụ thể để lập trình: các bộ phận, kích thước tương đối, màu theo vai trò (accent/accent2/cool/side/char)",
 "beats": ["nhịp 1: ...", "nhịp 2: ...", "nhịp 3: ..."],
 "params": {{"tên_tham_số": "ý nghĩa, kiểu, mặc định (vd at: giây bắt đầu, from/to 0..1, items [{{text, cue}}])"}},
 "subject": "English: one-line description of the prop and figure on screen (no style words)"}}
