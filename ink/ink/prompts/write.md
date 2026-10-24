Nhiệm vụ: viết LỜI ĐỌC hoàn chỉnh từ dàn ý.

Chiến lược: {strategy}
Dàn ý: {outline}
Tổng độ dài: khoảng {seconds} giây, tức khoảng {words} chữ (giọng đọc máy khoảng 2,8 chữ mỗi giây). Sai lệch không quá 10%.
{feedback}

Yêu cầu viết:
- Mỗi phần tử trong "lines" là MỘT câu đọc trọn ý (8–20 chữ), sẽ thành một cảnh vẽ tay. Câu quá dài thì tách.
- Câu đầu tiên chính là hook, đọc lên phải giật người xem lại ngay.
- Mỗi ý chính phải có ví dụ, con số hoặc hình ảnh so sánh cụ thể. Không liệt kê khô khan.
- Nhịp: xen câu ngắn mạnh với câu giải thích; có câu hỏi tu từ khi cần; có chỗ nhấn mạnh.
- Kết bằng câu đáng nhớ + hành động nhỏ làm ngay + lời mời tương tác tự nhiên (hỏi người xem một câu cụ thể để họ bình luận).
- Văn nói tự nhiên, chuẩn chính tả, không ký hiệu, không emoji, không viết tắt; số viết sao cho máy đọc đúng (ví dụ "30 phút", "1 triệu đồng").
- "emphasis": 1–3 từ khóa quan trọng nhất của câu (dùng để nhấn trên hình), lấy nguyên văn từ câu.
- "chapter": tên chương nếu câu mở đầu một chương mới (video dài), còn lại để rỗng.

JSON:
{{"title": "...", "core_message": "...", "lines": [{{"say": "...", "emphasis": ["..."], "part": "hook|problem|point|turn|close", "chapter": ""}}]}}
