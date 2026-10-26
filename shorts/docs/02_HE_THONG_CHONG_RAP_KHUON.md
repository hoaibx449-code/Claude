# 02 · Hệ thống chống rập khuôn

Mục tiêu: 100 video cùng **thể loại**, cùng **nhận diện kênh**, nhưng không có 2 video nào trông như nhau và không video nào giống kênh tham khảo.

---

## 1. Ba tầng — cái gì cố định, cái gì phải đổi

| Tầng | Là gì | Ai quyết | Tần suất đổi |
|---|---|---|---|
| **A. Ngữ pháp thể loại** | Hộp phim 16:9 trong khung 9:16, hook cố định trên, phụ đề karaoke song ngữ, 1 khái niệm = 1 vật ẩn dụ 3D, thẻ khái niệm/nguồn/checklist, kịch bản tiểu luận (file 01, mục 2) | Cố định | Không đổi |
| **B. Bộ nhận diện kênh (Brand kit)** | Màu highlight phụ đề, font, kiểu dải hook, "chữ ký" mở/kết, âm thanh nhận diện, tên series | Bạn chọn 1 lần (mục 4) | Không đổi (để kênh nhận ra được) |
| **C. Bộ gen từng video** | Thế giới, vật ẩn dụ, bảng màu cảnh, ánh sáng, chất liệu, ngôn ngữ máy quay, kiểu chữ trong cảnh, khung kịch bản, kiểu hook, nhạc | **Rút thăm + suy ra từ nội dung** | **Bắt buộc đổi mỗi video** |

AI sản xuất chỉ được nhìn thấy tầng A + B (dạng chữ) và tầng C đã rút cho video đó. **Không bao giờ đưa video mẫu vào AI khi sản xuất.**

---

## 2. Sáu luật vàng

1. **Nội dung trước, hình sau.** Thế giới và vật ẩn dụ được *suy ra từ cơ chế của khái niệm* (động từ của nó), không bắt đầu từ "trông nó thế nào".
2. **Không mẫu hình ảnh.** Khi sản xuất, không đính kèm video/ảnh tham khảo. Chỉ mô tả ngữ pháp bằng chữ.
3. **Phân kỳ trước, hội tụ sau.** Luôn sinh ≥ 5 ẩn dụ từ ≥ 5 lĩnh vực khác nhau (thiên nhiên, máy móc, kiến trúc, cơ thể, trò chơi, bếp, thời tiết, thể thao, giao thông, vũ trụ…), chấm điểm, rồi mới chọn 1.
4. **Rút thăm có trí nhớ.** Các thuộc tính hình ảnh (môi trường, chất liệu, ánh sáng, bảng màu, máy quay, kiểu chữ) được rút ngẫu nhiên từ ma trận (file `03_THU_VIEN/the_gioi_ma_tran.md`), loại bỏ thứ đã dùng trong 8 video gần nhất. Script `world_roll.py` làm việc này tự động và ghi vào `history.json`.
5. **Danh sách cấm sống.** Danh sách cấm = kênh tham khảo (mục 3) + vật ẩn dụ chính của 15 video gần nhất của chính bạn (tự thêm từ `history.json`).
6. **Có giám khảo.** Trước khi dựng, chạy Prompt P8 (Giám khảo trùng lặp): chấm độ giống với lịch sử và danh sách cấm; ≥ 4/10 → làm lại phần bị trùng.

---

## 3. Danh sách cấm (từ kênh tham khảo — không dùng làm vật/thế giới chính)
- Ống/đường ống thuỷ tinh chở đồng xu sáng, rò rỉ đỏ
- Đầm lầy sương mù + ếch + lá sen + đá bước; quả cà chua đồng hồ
- Các trụ/ống nghiệm thuỷ tinh đo mức đầy–vơi trên sàn studio tối
- Bánh răng neon, kẹo xoáy cầu vồng, khối màu nổ tung, đồng hồ neon
- Phòng be + giá sách + băng chuyền + cổng kiểm tra
- Não người trong chuông kính, hologram trụ kính + tia laser, cuộn phim nhựa
- Bảng số "79", bảng neon "10 TRIỆU"
- Bộ màu chữ ký của họ: phụ đề hộp vàng + dòng tiếng Anh + nhãn giấy kem góc trái (dùng **bộ nhận diện riêng** của bạn)
- Câu hook/câu thoại của họ (không chép, không "viết lại na ná")

> Ngữ pháp (hộp phim, hook cố định, karaoke song ngữ, thẻ khái niệm) **được** dùng — đó là đặc điểm thể loại, không phải tài sản riêng của ai.

---

## 4. Bộ nhận diện kênh — chọn 1 lần, ghi vào `brand.json`
Gợi ý 3 bộ (hoặc tự đặt). Chỉ cần khác kênh tham khảo và giữ nhất quán:

| | **Bộ 1 · "Mực & Đồng"** | **Bộ 2 · "Phấn & Ngọc"** | **Bộ 3 · "Giấy than"** |
|---|---|---|---|
| Nền dải trên/dưới | Xanh mực rất đậm `#0B1020` | Đen than `#111111` | Trắng ngà `#F3EFE6` (chữ đen) |
| Highlight phụ đề | Đồng ánh kim `#E8A15A` (chữ đổi màu, không hộp) | Xanh ngọc `#3EE6C1` gạch chân dày | Đỏ son `#D8432F` hộp bo tròn |
| Font hook / phụ đề | Be Vietnam Pro ExtraBold / SemiBold | Inter Black / Inter Bold | Lora Bold (serif) / Inter SemiBold |
| Dòng tiếng Anh | Có, nghiêng, 60% độ mờ | Có, nhỏ, chữ thường | Không (thay bằng nghĩa Việt của thuật ngữ khi có) |
| Chữ ký mở | Logo nhỏ "chấm sáng" bay vào góc | Âm "tick" + hook gõ chữ | Trang giấy lật |

Brand kit nằm trong `skill/video-tu-duy-3d/brand.json`, mọi script đọc từ đó.

---

## 5. Ma trận biến thể (tóm tắt — chi tiết ở `03_THU_VIEN`)
Mỗi video rút 1 giá trị cho từng cột, cộng thêm vật ẩn dụ suy ra từ nội dung:

- **Họ môi trường** (20): sa mạc muối, đáy biển sâu, nhà kính, ga tàu bỏ hoang, thư viện vô tận, sân thượng mưa đêm, hang pha lê, bàn mô hình thu nhỏ, phòng thí nghiệm trắng, quỹ đạo vũ trụ, cánh đồng lúa gió, xưởng gốm, mê cung hàng rào, phòng tranh bảo tàng, chợ nổi lúc rạng sáng, khu rừng tre sương, bàn cờ khổng lồ, mặt hồ đóng băng, nhà máy giấy origami, thành phố tí hon trên bàn làm việc…
- **Chất liệu chủ đạo** (14): gốm men, kính mờ, đất sét nặn, giấy origami, gỗ sồi, kim loại chải xước, nhựa bóng đồ chơi, đá cẩm thạch, len nỉ, nước, cát, băng, đồng thau, phát quang sinh học…
- **Ánh sáng** (10): giờ vàng xiên, đèn rọi sân khấu đơn, ánh sáng mềm phòng trắng, ngược sáng viền, đèn neon đơn sắc, ánh trăng lạnh, ánh lửa ấm lập loè, nắng xuyên sương thành tia, đèn bàn đêm, ánh sáng dưới nước gợn sóng…
- **Bảng màu** (12 bộ 3 màu, mỗi bộ gắn cảm xúc): xem file ma trận.
- **Ngôn ngữ máy quay** (8): trượt ngang song song, theo vật (follow), xoay quỹ đạo chậm, nhìn từ trên xuống (god's eye), macro cận cảnh nông DOF, đẩy vào liên tục (push-in), cần cẩu nâng lên tiết lộ toàn cảnh, máy cầm tay rung nhẹ tài liệu…
- **Kiểu chữ trong cảnh** (6): chữ khổng lồ đặt trên sàn 3D, chữ khắc trên vật, chữ in bóng đổ lên tường, chữ máy đánh chữ, chữ viết tay phấn, chữ cắt giấy.
- **Khung kịch bản** (6) và **kiểu hook** (12): file `03_THU_VIEN/cau_truc_kich_ban.md`.

Số tổ hợp: 20 × 14 × 10 × 12 × 8 × 6 × 6 × 12 ≈ **58 triệu** — trước cả khi tính vật ẩn dụ.

---

## 6. Quy trình 1 video (rút gọn)
```
Chủ đề/khái niệm ─► Cơ chế (3 động từ) ─► 5+ ẩn dụ từ 5 lĩnh vực ─► chấm điểm ─► chọn
        │                                                              │
        ▼                                                              ▼
 world_roll.py (rút môi trường/chất liệu/ánh sáng/màu/máy quay/chữ, né 8 video gần nhất)
        │
        ▼
 Kịch bản (khung + hook đã rút) ─► Storyboard JSON ─► P8 Giám khảo trùng lặp ─► (đạt) ─► Dựng
        │                                                                              │
        └──────────────────────── ghi history.json ◄───────────────────────────────────┘
```

## 7. Khi vẫn thấy video "na ná nhau" — kiểm tra theo thứ tự
1. Có ai đính kèm video mẫu vào AI không? → bỏ.
2. Vật ẩn dụ có được suy ra từ động từ cơ chế không, hay từ "danh từ" chủ đề (tiền → đồng xu)? → làm lại bước ẩn dụ, cấm danh từ hiển nhiên.
3. `history.json` có được cập nhật sau mỗi video không? → chạy `world_roll.py commit`.
4. Khung kịch bản có bị lặp 2 video liền không? → `world_roll.py` đã chặn; kiểm tra lại.
5. Máy quay có dùng cùng 1 kiểu cả video không? → mỗi video tối thiểu 3 kiểu chuyển động, cắt 2–4 s.
