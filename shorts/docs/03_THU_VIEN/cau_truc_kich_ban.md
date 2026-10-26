# Cấu trúc kịch bản: 6 khung + 12 kiểu hook

## Quy tắc chung cho mọi khung
- Độ dài lời đọc: **220–480 từ** (≈ 60–130 s ở tốc độ ~3,7 từ/giây; đo lại với giọng bạn dùng và sửa số này).
- Xưng "bạn". Câu ≤ 18 từ. Mỗi 2–3 câu có 1 câu rất ngắn (2–5 từ) để tạo nhịp.
- Thuật ngữ: đọc tiếng Anh 1 lần rồi nói nghĩa Việt ngay ("Parkinson's Law, định luật Parkinson").
- Mỗi video có: ≥ 1 khái niệm có tên · 1 nguồn thật (tác giả + năm, đã kiểm chứng) · 1 ví dụ đời thường của người Việt · 1 hành động làm được trong 24 giờ · 1 câu chốt ≤ 10 từ.
- 1 câu cân bằng (giới hạn của khái niệm / khi nào không đúng) — làm kênh đáng tin.
- Không hù doạ quá mức, không hứa làm giàu, không khuyên mua mã/coin/sản phẩm cụ thể.
- 2 điểm CTA: giữa video (≈ 40–60%) nhẹ nhàng; cuối video là **câu hỏi mời bình luận** (không phải "hãy follow").

---

## 6 khung kịch bản (world_roll.py rút, không lặp 2 video liền)

### 1. `awakening` — Tiểu luận thức tỉnh (90–130 s)
Nỗi đau (0–5 s) → "Vấn đề không phải X" → đặt tên khái niệm → 3 ví dụ nhịp ba → vì sao (cơ chế + nguồn) → "Tin tốt là…" → hệ thống 3 bước → câu cân bằng → câu chốt vọng lại hình mở đầu → câu hỏi bình luận.

### 2. `daily_math` — Phép tính đời thường (60–100 s)
Một con số nhỏ mỗi ngày ("45 phút lướt", "35 nghìn trà sữa") → phép nhân qua tháng/năm/10 năm (số hiện to trong cảnh) → điều bất ngờ → khái niệm có tên giải thích → cách đổi chiều phép tính → con số mới.

### 3. `myth_break` — Bẻ lời khuyên phổ biến (80–120 s)
"Ai cũng bảo…" → "Nhưng nghiên cứu của [tác giả, năm] cho thấy…" → cơ chế → khi nào lời khuyên cũ vẫn đúng → nguyên tắc thay thế → thử ngay.

### 4. `list_traps` — Danh sách N cái bẫy (110–170 s)
Hook hứa con số → mỗi mục: tên bẫy (thẻ khái niệm) + 1 câu cơ chế + 1 ví dụ + 1 lối thoát; mỗi mục = 1 biến thể của cùng thế giới (không đổi thế giới giữa các mục) → tổng kết bằng checklist.
N = 3, 4 hoặc 5. Mục mạnh nhất để cuối.

### 5. `story_case` — Một câu chuyện – một bài học (90–140 s)
Nhân vật không mặt trong thế giới ẩn dụ (hoặc nhân vật lịch sử có thật, đã kiểm chứng) → khoảnh khắc sai lầm → hậu quả → khái niệm có tên giải thích vì sao → bước ngoặt → bài học cho bạn.

### 6. `one_concept` — Một khái niệm, một tập (55–80 s)
Tên khái niệm ngay câu 2 → ẩn dụ → 2 ví dụ → 1 việc làm tối nay → câu chốt. Dùng khi cần video ngắn, nhịp dày.

---

## 12 kiểu hook (câu đầu đọc + câu hook cố định ở dải trên)
Câu hook dải trên ≤ 14 chữ, IN HOA 1–3 từ khoá. Câu mở lời đọc phải KHÁC câu dải trên (bổ sung, không lặp).

| id | Công thức | Ví dụ minh hoạ (đừng dùng lại nguyên văn) |
|---|---|---|
| pain_question | Bạn có bao giờ [tình huống đau quen thuộc]? | Lương về ngày 5, ngày 20 đã hết — bạn có thấy quen? |
| counter_intuitive | [Điều được tin là tốt] đang [làm hại] bạn | Chăm chỉ hơn có thể khiến bạn NGHÈO đi |
| number_list | [N] [thứ] khiến bạn [hậu quả] | 3 thói quen nhỏ ĂN MÒN quỹ tiết kiệm |
| hidden_cost | Thứ bạn trả mỗi ngày mà không thấy hoá đơn | Khoản phí VÔ HÌNH bạn trả mỗi sáng |
| identity | Người [kiểu A] làm X, người [kiểu B] làm Y | Người bận rộn làm nhiều, người HIỆU QUẢ làm ít |
| time_shock | [Số thời gian lớn bất ngờ] | Bạn sẽ dành 9 NĂM đời để lướt điện thoại |
| secret_name | Có một cái tên cho [cảm giác ai cũng có] | Cảm giác ấy có TÊN khoa học |
| mistake_you_make | Sai lầm [nhóm người] mắc mà không biết | Sai lầm của người đi làm 3–5 năm |
| before_after | Năm thứ 1 vs năm thứ 5 khi [làm X] | 1 năm sau khi tắt THÔNG BÁO |
| challenge | Thử [việc nhỏ] trong [thời gian] | Thử 7 ngày KHÔNG mở app trước 9h sáng |
| research_shock | Một nghiên cứu [năm] phát hiện [điều sốc] | Nghiên cứu 1955 giải thích vì sao bạn LUÔN trễ hạn |
| villain | [Thứ vô hình] đang [đánh cắp] [thứ quý] | Thứ đang LẤY TRỘM sự tập trung của bạn |

## Mẫu đoạn mở 5 giây (3 nhịp)
1. Hình: vật ẩn dụ ở trạng thái "vấn đề", máy quay đang chuyển động. Lời: câu hook đọc.
2. Hình: cắt cận chi tiết bất thường (vết nứt, rò rỉ, bóng đổ sai). Lời: câu xoáy ("Và nó xảy ra mỗi ngày.").
3. Hình: thẻ khái niệm hoặc chữ khổng lồ. Lời: lời hứa ("Đây là cách nó vận hành — và cách thoát.").
