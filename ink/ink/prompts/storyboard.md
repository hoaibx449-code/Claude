Nhiệm vụ: làm BẢNG PHÂN CẢNH vẽ tay cho từng câu đọc. Mỗi câu là một cảnh; người xem nghe câu đó trong lúc bàn tay vẽ hình.

Thông điệp cốt lõi: {core}
Các câu đọc (đánh số từ 0):
{lines}

Tư duy hình ảnh:
- Mỗi cảnh chọn MỘT ẩn dụ trực quan sát nghĩa câu đọc, người xem hiểu trong 2 giây. Không minh họa chung chung.
- Công thức mạnh: trước/sau; nhỏ → lớn theo thời gian; bậc thang đi lên; so sánh hai cột; chọn 1 trong vài lựa chọn; con số lớn gây sốc; vượt chướng ngại; hành trình nhiều chặng.
- Con số luôn viết bằng chữ số trên hình và ảnh bìa (80%, 3 ngày, 1 phút), không viết bằng chữ.
- Nhãn chữ trên hình rất ngắn để nằm trên MỘT dòng: 1–3 chữ (tối đa 4), hoặc con số/mốc thời gian; viết thường như chữ viết tay (không viết HOA toàn bộ), KHÔNG chép lại nguyên câu đọc. Dùng từ khóa nhấn mạnh của câu khi phù hợp.
- Câu số 0 (hook) được đọc trên ẢNH BÌA (khung mở đầu video): vẫn trả về một cảnh cho câu 0 nhưng có thể dùng bố cục bất kỳ, nó sẽ được thay bằng ảnh bìa.
- Đa dạng: bố cục "hero" không quá 1/4 số cảnh; ưu tiên các bố cục có nhân vật, so sánh, con số, danh sách để mỗi khung hình đầy đặn và có câu chuyện.
- Không dùng cùng một bố cục cho 2 cảnh liền nhau; luân phiên để có nhịp. Câu hook dùng big_number, before_after, hero có nhân vật biểu cảm, hoặc obstacle. Câu kết có lời mời tương tác dùng cta.
- Câu mở đầu một chương mới (có "chapter") dùng bố cục chapter.
- Nhân vật (figure) giúp người xem đồng cảm: chọn tư thế và nét mặt đúng cảm xúc câu đọc.
- Đồ vật phải đúng NGHĨA ĐEN của từ trong câu để người xem nhận ra ngay (ba lô → backpack, cắt giảm → scissors, nằm lướt điện thoại → sofa hoặc phone, quá nhiều việc → todo_long). Không thay bằng đồ vật na ná (không dùng boulder cho ba lô).
- Mỗi khung hình phải đầy đặn, có câu chuyện: ưu tiên bố cục có 2–3 thành phần (nhân vật + đồ vật + nhãn) hơn một đồ vật đứng trơ trọi.

Các bố cục (layout) và ô cần điền:
{layouts}

Đồ vật (prop) chỉ được chọn trong danh sách này (tên: từ khóa):
{props}

Tư thế nhân vật (pose): {poses}
Nét mặt (face): {faces}
figure là đối tượng {{"pose": "...", "face": "..."}}.

Camera mỗi cảnh: {{"type": "push"}} (mặc định, chậm rãi), {{"type": "pull"}}, hoặc {{"type": "push", "punch": true}} cho câu nhấn mạnh. transition: "cut" (mặc định), "whoosh" khi sang ý mới, "zoom" khi sang chương mới.

Phụ đề: "phrases" chia NGUYÊN VĂN câu đọc thành các cụm 2–6 chữ theo nhịp đọc và nghĩa (giữ đủ mọi chữ, đúng thứ tự, kể cả dấu câu); KHÔNG tách đôi từ ghép (bản thân, kiên trì, mục tiêu, điện thoại…) hay cụm danh từ; câu ≤ 6 chữ thì chỉ một cụm.

Ngoài ra thiết kế ẢNH BÌA (cover) chuẩn video ngắn:
- "lines": tiêu đề 2–3 dòng, tổng tối đa 8 chữ, đọc được trong 1 giây; viết hoa chữ cái đầu câu; con số viết bằng chữ số. Tiêu đề phải tạo KHOẢNG TRỐNG TÒ MÒ: nêu vấn đề, nghịch lý hoặc lời hứa, TUYỆT ĐỐI KHÔNG nói ra đáp án/bí quyết (sai: "Bạn bỏ cuộc vì vác quá nặng"; đúng: "Bạn không lười / Bạn đang sai chỗ này").
- Ảnh bìa đồng thời là KHUNG MỞ ĐẦU video, đọc câu hook trên nó: tiêu đề phải khớp và tăng sức nặng cho câu hook.
- "highlight": một cụm 1–3 chữ có trong tiêu đề, được tô bút dạ vàng và gạch chân đỏ (từ đắt giá nhất).
- "badge": nhãn phụ rất ngắn gắn với ĐÚNG nội dung video (con số, mốc thời gian, tên quy tắc: "7 NGÀY", "SAI LẦM #1", "QUY TẮC 1 DÒNG") hoặc rỗng. Không dùng nhãn chung chung vô nghĩa như "MẸO HAY", "HOT", "XEM NGAY", "BÍ QUYẾT".
- "prop" và "figure": hình chủ đạo thể hiện cảm xúc/kết quả của video.
Và "caption" (2–3 câu mời xem, có câu hỏi) cùng "hashtags" (5–8 hashtag tiếng Việt không dấu và phổ biến).
"music": không khí nhạc nền hợp nội dung, một trong: motivating (truyền động lực), calm (nhẹ nhàng, suy ngẫm), upbeat (vui tươi, sôi động), emotional (cảm xúc, lắng đọng).

JSON:
{{"scenes": [{{"line": 0, "phrases": ["...", "..."], "visual": {{"layout": "...", "...": "..."}}, "camera": {{"type": "push"}}, "transition": "cut"}}], "cover": {{"lines": ["...", "..."], "highlight": "...", "badge": "", "prop": "...", "figure": {{"pose": "...", "face": "..."}}}}, "caption": "...", "hashtags": ["#..."], "music": "motivating"}}
