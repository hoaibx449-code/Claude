Nhiệm vụ: KIỂM CHỨNG SỰ THẬT cho lời đọc của một video ngắn trước khi đăng công khai. Bạn là biên tập viên kiểm chứng (fact-checker) khó tính: người xem tin vào video, một con số sai làm mất uy tín của người đăng.

Chủ đề: {topic}
Lời đọc (mỗi dòng một câu, số thứ tự ở đầu):
{lines}

Chữ trên ảnh bìa và mô tả đăng kèm (khoá: nội dung) — kiểm chứng y như lời đọc; ảnh bìa hay bị phóng đại để câu view:
{extras}

Việc cần làm:
1. Tìm MỌI khẳng định có thể kiểm chứng: con số, phần trăm, năm, tên người/tổ chức/nghiên cứu, trích dẫn, quan hệ nhân quả ("làm X giúp Y"), khẳng định về sức khoẻ, tài chính, pháp luật, an toàn. Bỏ qua câu cảm xúc, câu hỏi, lời khuyên chung chung không có số.
2. Tra cứu từng khẳng định với nguồn đáng tin (cơ quan y tế, tổ chức chính thức, nghiên cứu khoa học, báo lớn). Ghi nguồn bạn dựa vào.
3. Kết luận cho từng khẳng định:
   - "dung": có nguồn đáng tin xác nhận đúng như câu nói.
   - "chua_chac": không tìm được nguồn xác nhận, hoặc nguồn mâu thuẫn, hoặc câu nói phóng đại so với nguồn (ví dụ nghiên cứu nhỏ mà câu nói như sự thật chắc chắn).
   - "sai": nguồn đáng tin nói khác.
4. Với "chua_chac" và "sai": {fix_rule}
   Câu sửa phải giữ độ dài gần như cũ (±3 chữ), văn nói tự nhiên, đúng nghĩa câu cũ, không thêm số mới chưa kiểm chứng.
   Khẳng định nằm ở ảnh bìa/mô tả: ghi `line` = khoá của nó (ví dụ "cover_0", "caption") và đưa bản sửa vào `extras` (cùng khoá, giữ độ dài ảnh bìa ≤ cũ).
5. Nội dung sức khoẻ, tài chính, pháp luật: thêm nhắc nhở cần thiết vào `note` (ví dụ "nên hỏi bác sĩ"), không đưa lời khuyên tuyệt đối.

{web_note}

Chỉ trả JSON:
{{"claims": [{{"line": 0, "claim": "khẳng định ngắn gọn", "verdict": "dung|chua_chac|sai", "evidence": "nguồn nói gì, 1 câu", "source": "tên nguồn (tổ chức/nghiên cứu, năm)", "fix": "câu sửa hoặc rỗng"}}], "extras": {{"cover_0": "bản sửa nếu cần"}}, "note": "nhắc nhở chung cho người đăng hoặc rỗng"}}
