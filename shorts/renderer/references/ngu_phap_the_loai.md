# Ngữ pháp thể loại (bản dành cho AI sản xuất — chỉ chữ, không hình mẫu)

Đây là những điều MỌI video phải có. Mọi thứ không nằm ở đây (thế giới, vật, màu, ánh sáng, máy quay, kiểu chữ trong cảnh) đều là biến số, lấy từ `world.json` của video đó.

## 1. Bố cục khung 1080×1920
| Vùng | Toạ độ (px) | Nội dung |
|---|---|---|
| Dải trên | y 0 → 640 | Nền màu `brand.band_bg`. Câu hook cố định cả video, căn giữa, đáy khối chữ cách vùng phim ~50 px, 1–3 dòng, cỡ ~58 px, từ khoá IN HOA tô `brand.hook_accent`. |
| Vùng phim | y 640 → 1248 (1080×608, 16:9) | Cảnh 3D / clip AI. Phụ đề karaoke nằm trong vùng phim, sát đáy (cách đáy ~40 px). Thẻ khái niệm góc trên trái, thẻ nguồn góc trên phải, checklist góc trên trái (thay thẻ khái niệm khi xuất hiện). |
| Dải dưới | y 1248 → 1920 | Nền `brand.band_bg`. Trống, hoặc 1 câu CTA/khêu gợi cố định (cỡ ~40 px) cách vùng phim ~70 px. Phần dưới ~300 px để trống cho UI TikTok. |

Vì sao: hook luôn hiện cho người lướt giữa chừng; vùng phim 16:9 cho cảm giác điện ảnh; các dải đen tránh UI TikTok che nội dung.

## 2. Hình ảnh
- Cảnh 3D tối giản, không người thật, không mặt người, không chữ "nướng" trong clip (mọi chữ là lớp phủ do bộ dựng thêm).
- 1 thế giới nhất quán / video (tối đa 2 trạng thái: vấn đề → giải pháp). 1 vật ẩn dụ chính, ≤ 3 vật phụ.
- Mỗi shot 2–5 s, mỗi câu thoại ≈ 1 shot. Tối thiểu 3 kiểu chuyển động máy trong một video. Không lặp cùng góc máy liền nhau.
- Nhịp: shot đầu tiên đã chuyển động; 3 s đầu có ≥ 2 lần cắt.

## 3. Lớp chữ (các `overlay` trong storyboard)
| type | Vị trí | Khi dùng | Giới hạn |
|---|---|---|---|
| `concept` | Trên trái vùng phim | Lần đầu gọi tên thuật ngữ | `en` ≤ 4 từ, `vi` ≤ 6 từ; ≤ 4 thẻ/video |
| `source` | Trên phải vùng phim | Khi nhắc nghiên cứu/sách | "Tác giả · năm" + tác phẩm ≤ 6 từ; phải có trong nguồn đã kiểm chứng |
| `bigtext` | Giữa vùng phim | Câu đắt nhất | 1–4 từ; ≤ 5 lần/video |
| `checklist` | Trên trái | Phần hành động | 3 dòng (tối đa 4), hiện dần |
| `quote` | Giữa vùng phim | Câu chốt | ≤ 2 dòng, ≤ 12 từ |
| `cta` | Trên phải hoặc dải dưới | 1 lần giữa video | ≤ 5 từ |
| Phụ đề | Đáy vùng phim | Luôn có | 3–5 từ/cụm, IN HOA, từ đang đọc tô `brand.sub_highlight`; dòng tiếng Anh nhỏ bên dưới nếu `brand.sub_english` = true |

## 4. Âm thanh
- Giọng TTS rõ, nhịp nhanh (≈ 3,5–4 từ/giây). Nhạc nền không lời, -20 đến -24 dB dưới giọng, có "nhịp đập"/swell ở chuyển hồi.
- 0,4–0,6 s khoảng lặng trước câu đắt nhất (đánh dấu `pause_before` trong storyboard).

## 5. Kịch bản
Xem `cau_truc_kich_ban.md` (6 khung + 12 hook) và `don_tam_ly.md` (đòn giữ chân + giới hạn đạo đức).
