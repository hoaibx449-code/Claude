Nhiệm vụ: làm BẢNG PHÂN CẢNH vẽ tay cho từng câu đọc. Mỗi câu là một cảnh; người xem nghe câu đó trong lúc bàn tay vẽ hình.

Thông điệp cốt lõi: {core}
Các câu đọc (đánh số từ 0):
{lines}

Tư duy hình ảnh:
- Mỗi cảnh chọn MỘT ẩn dụ trực quan sát nghĩa câu đọc, người xem hiểu trong 2 giây. Không minh họa chung chung.
- Công thức mạnh: trước/sau; nhỏ → lớn theo thời gian; bậc thang đi lên; so sánh hai cột; chọn 1 trong vài lựa chọn; con số lớn gây sốc; vượt chướng ngại; hành trình nhiều chặng.
- Nhãn chữ trên hình rất ngắn (1–4 chữ, hoặc con số/mốc thời gian), KHÔNG chép lại nguyên câu đọc. Dùng từ khóa nhấn mạnh của câu khi phù hợp.
- Không dùng cùng một bố cục cho 2 cảnh liền nhau; luân phiên để có nhịp. Câu hook dùng big_number, before_after, hero có nhân vật biểu cảm, hoặc obstacle. Câu kết có lời mời tương tác dùng cta.
- Câu mở đầu một chương mới (có "chapter") dùng bố cục chapter.
- Nhân vật (figure) giúp người xem đồng cảm: chọn tư thế và nét mặt đúng cảm xúc câu đọc.

Các bố cục (layout) và ô cần điền:
{layouts}

Đồ vật (prop) chỉ được chọn trong danh sách này (tên: từ khóa):
{props}

Tư thế nhân vật (pose): {poses}
Nét mặt (face): {faces}
figure là đối tượng {{"pose": "...", "face": "..."}}.

Camera mỗi cảnh: {{"type": "push"}} (mặc định, chậm rãi), {{"type": "pull"}}, hoặc {{"type": "push", "punch": true}} cho câu nhấn mạnh. transition: "cut" (mặc định), "whoosh" khi sang ý mới, "zoom" khi sang chương mới.

Ngoài ra thiết kế ẢNH BÌA (cover) chuẩn video ngắn:
- "lines": tiêu đề 2–3 dòng, tổng tối đa 8 chữ, gây tò mò mạnh, đọc được trong 1 giây.
- "highlight": một từ/cụm trong tiêu đề được tô khối vàng (từ đắt giá nhất).
- "badge": nhãn phụ rất ngắn (ví dụ "7 NGÀY", "SAI LẦM #1") hoặc rỗng.
- "prop" và "figure": hình chủ đạo thể hiện cảm xúc/kết quả của video.
Và "caption" (2–3 câu mời xem, có câu hỏi) cùng "hashtags" (5–8 hashtag tiếng Việt không dấu và phổ biến).

JSON:
{{"scenes": [{{"line": 0, "visual": {{"layout": "...", "...": "..."}}, "camera": {{"type": "push"}}, "transition": "cut"}}], "cover": {{"lines": ["...", "..."], "highlight": "...", "badge": "", "prop": "...", "figure": {{"pose": "...", "face": "..."}}}}, "caption": "...", "hashtags": ["#..."]}}
