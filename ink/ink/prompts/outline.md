Nhiệm vụ: dựng DÀN Ý giữ chân người xem từ chiến lược sau.

Chiến lược: {strategy}
Độ dài: khoảng {seconds} giây (khoảng {words} chữ lời đọc tổng cộng).

Cấu trúc bắt buộc:
- hook (khoảng 3 giây): dùng câu mở đầu tốt nhất trong chiến lược, có thể chỉnh cho mạnh hơn.
- problem: làm người xem thấy "đúng là mình", bằng một tình huống đời thường cụ thể.
- points: các ý chính (video ≤ 60 giây: 2–3 ý; 1–2 phút: 3–4 ý; 3–5 phút: 4–6 ý chia thành chương). Mỗi ý có: ý chính 1 câu, một ví dụ/con số/hình ảnh so sánh cụ thể để minh họa.
- turn (với video ≥ 45 giây): một câu chuyển mở vòng tò mò để giữ người xem tới cuối ("nhưng điều thay đổi mọi thứ lại là…").
- close: chốt thông điệp cốt lõi bằng một câu đáng nhớ, đưa ra hành động nhỏ làm ngay hôm nay, và lời mời tương tác tự nhiên (lưu lại, chia sẻ cho ai đó cần, bình luận trả lời một câu hỏi cụ thể).
Với video từ 2 phút: chia points thành các chương, mỗi chương có tên ngắn (≤ 5 chữ).

Phân bổ số giây cho từng phần sao cho tổng ≈ {seconds}.

JSON:
{{"beats": [{{"part": "hook|problem|point|turn|close", "chapter": "tên chương hoặc rỗng", "idea": "...", "example": "...", "seconds": 0}}]}}
