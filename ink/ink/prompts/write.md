Nhiệm vụ: viết LỜI ĐỌC hoàn chỉnh từ dàn ý.

Chiến lược: {strategy}
Thể loại: {genre}. Giọng và cấu trúc theo thể loại:
{structure}
Dàn ý: {outline}
Tổng độ dài: khoảng {seconds} giây, tức khoảng {words} chữ (giọng đọc máy khoảng 2,8 chữ mỗi giây). Sai lệch không quá 10%.
{feedback}

Yêu cầu viết:
- Mỗi phần tử trong "lines" là MỘT câu hoặc vế câu đọc trọn ý, NGẮN: 6–14 chữ (video ngắn cần nhịp nhanh, mỗi câu là một cảnh vẽ tay đổi liên tục). Câu dài thì tách thành 2 vế.
- Các câu NỐI MẠCH vào nhau như một dòng chảy không ngắt: câu sau tiếp lời câu trước (dùng "Nhưng", "Vì sao?", "Kết quả là", "Thử nghĩ xem", "Đây mới là điều quan trọng"...), tạo cảm giác dồn dập, cuốn người xem đi tiếp. Tránh mỗi câu là một ý rời rạc tự đứng một mình.
- Câu đầu tiên chính là hook: TỐI ĐA 10 chữ, đọc trong khoảng 3 giây, gây tò mò hoặc phản bác điều người xem tin. KHÔNG nói đáp án trong hook.
- Câu thứ hai đẩy tò mò lên tiếp, đúng thể loại (giai_thich: điều ai cũng thấy nhưng ít ai hiểu; các thể loại khác: tình huống cụ thể của người xem), không giải thích dài.
- Khoảng 20–35% thời lượng phải có một câu "mở vòng" giữ chân tới cuối (ví dụ "Nhưng sai lầm lớn nhất là điều thứ ba", "Điều thay đổi mọi thứ nằm ở cuối video"), và phải giữ lời ở phần sau.
- Cứ 3–4 câu lại có một điểm bất ngờ nhỏ (một con số, một ví dụ lạ, một phép so sánh mới) để người xem không lướt đi.
- Mỗi ý chính phải có ví dụ, con số hoặc hình ảnh so sánh cụ thể. Không liệt kê khô khan.
- Nhịp: xen câu ngắn mạnh với câu giải thích; có câu hỏi tu từ khi cần; có chỗ nhấn mạnh.
- Cách kết theo thể loại: {ending} Câu hỏi cuối phải cụ thể, trả lời được bằng vài chữ; KHÔNG dùng câu chung chung như "hãy comment cho tôi biết nhé", "bạn nghĩ sao".
- Không bao giờ nói ra kỹ thuật làm video với người xem (sai: "điều này giữ chân bạn tới cuối", "xem hết video nhé", "hook"); câu mở vòng phải là nội dung thật (ví dụ "Nhưng chi tiết thú vị nhất là…").
- Văn nói tự nhiên, chuẩn chính tả, không ký hiệu, không emoji, không viết tắt; số viết sao cho máy đọc đúng (ví dụ "30 phút", "1 triệu đồng").
- "emphasis": 1–3 từ khóa quan trọng nhất của câu (dùng để nhấn trên hình), lấy nguyên văn từ câu.
- "chapter": tên chương nếu câu mở đầu một chương mới (video dài), còn lại để rỗng.

JSON:
{{"title": "...", "core_message": "...", "lines": [{{"say": "...", "emphasis": ["..."], "part": "hook|setup|point|turn|close", "chapter": ""}}]}}
