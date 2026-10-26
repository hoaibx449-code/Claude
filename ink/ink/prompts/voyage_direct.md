Bạn là ĐẠO DIỄN của một video truyền cảm hứng, kể hoàn toàn bằng một HÀNH TRÌNH 3D: máy quay luôn di chuyển như mắt người xem được dẫn đi qua từng không gian, mỗi không gian là ẩn dụ cho một bước của câu chuyện. Lời đọc đã viết xong (không sửa lời).

Chủ đề: {topic}
Thông điệp: {message}
Câu chốt: {closing}
Lời đọc (từng câu, đánh số):
{lines}

Các KHÔNG GIAN có sẵn (chọn theo ý nghĩa, không theo thứ tự này):
- office: văn phòng vắng, hàng bàn ghế trống (công việc, mất mát, sự trống trải)
- corridor: hành lang dài, cột hai bên, cuối có khe sáng (chờ đợi, đi tìm lối ra, bế tắc)
- door: phòng tối, cánh cửa hắt sáng, máy đẩy vào khe sáng (bước ngoặt, cơ hội, quyết định)
- road: con đường dài có đèn hai bên (hành trình, kiên trì, bắt đầu lại)
- stairs: bậc thang đi lên, mỗi bậc một cột mốc (tiến bộ từng bước, học lại)
- bridge: cây cầu qua khoảng mù sương (chuyển đổi, vượt qua nỗi sợ)
- city: phố cao tầng, cửa sổ sáng (xã hội, áp lực, cơ hội ngoài kia)
- peak: đỉnh núi, mặt trời mọc (bứt phá, đến nơi)
- sky: khoảng trời mở, mây (tự do, tầm nhìn rộng)

ÁNH SÁNG (mood) đi theo cảm xúc: cold (tối lạnh, khó khăn) → dim (u ám, lưỡng lự) → warm (ấm, hy vọng hé ra) → bright (rực sáng, cao trào) → dawn (bình minh, lắng lại ở câu chốt). Có thể dùng mood2 để ánh sáng chuyển dần trong một không gian (vd cold → warm đúng câu bước ngoặt).

LUẬT
- Chia lời đọc thành {spaces} không gian liên tiếp, phủ kín mọi câu từ 0 đến {last}, không chồng nhau. Mỗi không gian một bước của mạch: nỗi đau/khó khăn → bước ngoặt → bứt phá → thông điệp chốt.
- Không gian cuối là peak hoặc sky với mood dawn hoặc bright, chứa câu chốt.
- Không lặp một loại không gian hai lần liền nhau.
- CHỮ BẬT NẢY ("pops"): chỉ cho con số, từ khoá, thuật ngữ quan trọng; tối đa một chữ cho mỗi 2 câu; chữ ngắn (≤ 4 từ), lấy nguyên văn con số hoặc từ trong câu; "cue" là cụm từ NGUYÊN VĂN trong câu đó để chữ hiện đúng lúc giọng đọc nói tới.
- Tiêu đề mở đầu (title): 2 dòng ngắn (mỗi dòng ≤ 5 từ), gây tò mò, đúng sự thật, khác câu đầu của lời đọc.
- "peak": số thứ tự câu cao trào (nhạc bùng nổ, ánh sáng rực nhất). "closing": số thứ tự câu chốt. "pause_before": các câu cần quãng nghỉ trước khi đọc (tối đa 3, thường là câu bước ngoặt và câu chốt).

Trả về JSON:
{{"title": ["dòng 1", "dòng 2"],
 "spaces": [{{"kind": "corridor", "mood": "cold", "mood2": "dim", "from": 0, "to": 2, "why": "ẩn dụ cho bước nào (tiếng Việt, ngắn)", "camera": "chuyển động máy (tiếng Việt, ngắn)"}}],
 "pops": [{{"line": 1, "text": "29,3%", "kind": "num|term|word", "cue": "cụm từ nguyên văn"}}],
 "peak": 7, "closing": 9, "pause_before": [5, 9]}}
