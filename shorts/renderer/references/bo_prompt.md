# 04 · Bộ prompt sản xuất (dùng được với Claude, ChatGPT, Gemini)

Mỗi prompt có ô `{{...}}` để điền. Chạy theo thứ tự P1 → P8. Skill `video-tu-duy-3d` chạy chuỗi này tự động; file này để bạn dùng tay hoặc với AI khác.

**Luật chung dán kèm mọi prompt (bắt buộc):**
```
LUẬT: Không xem/không bắt chước bất kỳ video mẫu nào. Chỉ dùng ngữ pháp thể loại mô tả bằng chữ.
Không dùng các vật/thế giới trong DANH SÁCH CẤM. Không chọn hình theo danh từ hiển nhiên của chủ đề
(tiền→đồng xu, thời gian→đồng hồ, tư duy→bộ não, AI→robot). Không bịa số liệu/nghiên cứu.
Viết tiếng Việt tự nhiên, xưng "bạn".
```

---

## P1 · Chọn chủ đề & khái niệm
```
Bạn là biên tập viên kênh TikTok giáo dục "Anti-Brainrot" về tiền bạc, năng suất, tư duy, tâm lý hành vi, AI & sự nghiệp, khán giả là người đi làm Việt Nam 20–35 tuổi.
Đề xuất 6 ý tưởng video cho tuần này. Mỗi ý tưởng gồm:
- Khái niệm có tên (tiếng Anh + nghĩa Việt) và nhóm chủ đề
- Nỗi đau đời thường người Việt gặp hằng tuần (1 câu cụ thể, có bối cảnh: lương, Shopee, trà sữa, deadline, sếp, Zalo…)
- Nguồn gốc có thể kiểm chứng (tác giả, năm, sách/nghiên cứu) — chỉ ghi nếu bạn chắc chắn; không chắc thì ghi "CẦN KIỂM CHỨNG"
- 1 hành động làm được trong 24 giờ
- Chấm 0–2: chạm đời thật / có tên gọi / có bằng chứng / có lối ra / mới so với danh sách đã làm
Danh sách đã làm (không trùng): {{CHU_DE_DA_LAM}}
Xếp theo tổng điểm. Đổi nhóm chủ đề so với 2 video gần nhất: {{2_NHOM_GAN_NHAT}}.
```

## P2 · Cơ chế → ẩn dụ (bước quyết định chống rập khuôn)
```
Khái niệm: {{KHAI_NIEM}}.
Bước 1: Viết cơ chế thành đúng 3 động từ/cụm động từ (cái khái niệm LÀM gì theo trình tự).
Bước 2: Sinh 6 ẩn dụ hình ảnh 3D, mỗi cái từ một lĩnh vực KHÁC NHAU trong: thiên nhiên, máy móc, kiến trúc, cơ thể/ánh sáng, trò chơi, bếp/ẩm thực, thời tiết, thể thao, giao thông, vũ trụ, nghề thủ công Việt.
  Mỗi ẩn dụ: 1 vật chính + chuyển động thể hiện 3 động từ + cách cùng thế giới đó thể hiện LỐI RA.
Bước 3: Chấm 0–2 mỗi tiêu chí: hiểu trong 1 giây / chuyển động được / có chỗ cho lối ra / mới (không trong danh sách cấm) / dựng được bằng {{CONG_CU: code 3D khối cơ bản | AI video}}.
Bước 4: Chọn 1, giải thích 2 câu. Ghép với khung thế giới đã rút: môi trường "{{ENV}}", chất liệu "{{MATERIAL}}", ánh sáng "{{LIGHT}}", bảng màu {{PALETTE}} — nếu không hợp, đề xuất cách "dịch" ẩn dụ sang môi trường đó (vd. cầu thang → bậc ruộng nếu môi trường là đồi chè).
DANH SÁCH CẤM: {{BAN_LIST}}
```

## P3 · Kịch bản lời đọc
```
Viết lời đọc video TikTok {{GIAY}} giây (≈ {{SO_TU}} từ, giọng đọc ~3,7 từ/giây).
Khái niệm: {{KHAI_NIEM}} | Cơ chế: {{3_DONG_TU}} | Ẩn dụ đã chọn: {{AN_DU}}
Khung kịch bản: {{KHUNG}} (theo mô tả: {{MO_TA_KHUNG}})
Kiểu hook: {{KIEU_HOOK}} | Nguồn đã kiểm chứng: {{NGUON}}
Yêu cầu:
- Câu ≤ 18 từ, mỗi 2–3 câu có 1 câu rất ngắn. Thuật ngữ đọc tiếng Anh 1 lần rồi nói nghĩa Việt.
- Có: 1 ví dụ đời thường người Việt, 1 câu cân bằng (giới hạn của khái niệm), 1 hành động trong 24 giờ, câu chốt ≤ 10 từ vọng lại hình ảnh mở đầu, câu cuối là câu hỏi mời bình luận (không "hãy follow").
- Lời đọc phải "kể được bằng hình": mỗi câu gợi ra một trạng thái của ẩn dụ.
- Không hù doạ, không hứa làm giàu, không khuyên mua sản phẩm/mã cụ thể.
Xuất:
1) HOOK_TREN (≤ 14 chữ, IN HOA 1–3 từ khoá) — câu cố định ở dải trên, KHÁC câu mở lời đọc
2) CTA_DUOI (≤ 8 chữ, tuỳ chọn)
3) Lời đọc chia thành các SHOT, mỗi shot 1 câu (2–5 giây), kèm bản dịch tiếng Anh ngắn.
Tự chấm 0–2: hook / khái niệm có tên + ẩn dụ rõ / chính xác so nguồn / giá trị làm ngay / lời mời bình luận. < 8 thì viết lại.
```

## P4 · Storyboard JSON
```
Chuyển kịch bản sau thành storyboard.json đúng schema (đính kèm storyboard.schema.md). Với mỗi shot:
- "camera": chọn trong {{CAMERA_CHINH}} + {{CAMERA_PHU}} — tối thiểu 3 kiểu trong video, không lặp kiểu liền nhau.
- "visual": mô tả trạng thái ẩn dụ ở shot đó (vật gì, làm gì, thay đổi gì so với shot trước).
- "overlays": concept (lần đầu gọi tên, ≤ 4/video), source (khi nhắc nguồn), bigtext (câu đắt, ≤ 5), checklist (phần hành động), quote (câu chốt), cta (1 lần giữa video).
- "ai_prompt": chỉ điền nếu render_mode = ai_clips (theo P5).
Ghi "levers" (6–9 id đòn tâm lý), "metaphor", "mechanism", "world" (dán world.json).
Kịch bản: {{KICH_BAN}}
```

## P5 · Prompt cảnh cho AI video (Veo 3.1 · Kling · Hailuo · Runway)
Công thức 1 shot (tiếng Anh cho kết quả ổn định nhất), **1 shot = 1 hành động**:
```
[CAMERA] {{camera_en}}.
[SUBJECT+ACTION] {{vật chính}} {{làm gì, thay đổi gì}} — {{chi tiết trạng thái của ẩn dụ ở shot này}}.
[WORLD] {{environment_en}}, objects made of {{material_en}}.
[LIGHT/COLOR] {{light_en}}, color palette {{3 mã màu}}, {{mood}} mood.
[STYLE] minimalist stylized 3D render, clean geometric shapes, soft volumetric haze, cinematic shallow depth of field, smooth motion, 16:9.
[NEGATIVE] no text, no letters, no numbers, no logos, no watermarks, no human faces, no realistic people, no dialogue, no music.
```
Quy tắc:
- Giữ **câu WORLD + LIGHT/COLOR + STYLE giống hệt nhau** ở mọi shot của 1 video (để thế giới nhất quán) — chỉ thay CAMERA và SUBJECT+ACTION.
- Clip 5–8 s, tỉ lệ 16:9 (bộ dựng tự cắt vào vùng phim). Tạo dư 1–2 clip cho shot quan trọng để chọn.
- Nhân vật: "faceless wooden mannequin" / "smooth clay figure without facial features" — mô tả lại y hệt ở mọi shot.
- Không yêu cầu chữ trong clip; mọi chữ do bộ dựng thêm.
- Đặt tên file đúng id shot: `S01.mp4`, `S02.mp4`…

Ví dụ (minh hoạ cách viết — không dùng lại):
`Slow crane-up reveal. A small wooden boat loaded with golden crates sits low in still water, then a red lacquer float slides under its hull and the boat rises gently. Floating market at dawn, mist over the river, objects made of raw concrete and brass. Volumetric sun rays through haze, palette #1A1A1A #D4AF37 #7B2D26, hopeful mood. Minimalist stylized 3D render… [NEGATIVE]`

## P6 · Viết cảnh 3D bằng code (three.js — cho Claude)
```
Viết work/scene.html dùng engine/kit.js (createStage, camMove, material, softBeam, prog, ease, rng).
Dữ liệu: world.json (môi trường/chất liệu/ánh sáng/màu đã rút), storyboard.json (shots: camera, visual), timeline.json (thời điểm shot).
Yêu cầu:
- Dựng thế giới "{{ENV}}" bằng khối cơ bản three.js (Box, Cylinder, Sphere, Capsule, Extrude, Lathe, Torus…), chất liệu theo material(), không tải mô hình ngoài, không nhân vật có bản quyền.
- Vật ẩn dụ "{{AN_DU}}" biến đổi đúng theo "visual" từng shot; dùng prog(t, start, end) theo timeline, không dùng Math.random (dùng rng(seed)).
- Máy quay: đọc sh.shot.camera, dùng camMove(type, p, {target, r, h, a, dir}); chỉnh target/khoảng cách cho từng shot để vật chính rõ.
- Bố cục an toàn: vật chính nằm giữa 60% khung ngang; chừa 20% đáy cho phụ đề, góc trên trái/phải cho thẻ chữ.
- Không vẽ chữ trong cảnh trừ khi scene_type = engraved/cast_shadow (chữ khắc/bóng đổ ngắn, ≤ 3 từ).
- Gọi S.run((t, sh) => {...}) ở cuối.
Sau khi viết: chụp still 5 khung (render_scene.js --still) để tự soát trước khi render cả phim.
```

## P7 · Tiêu đề, caption, hashtag
```
Viết cho video: {{TOM_TAT}}. Khái niệm: {{KHAI_NIEM}}. Nguồn: {{NGUON}}.
1) Caption TikTok 2–4 câu: nỗi đau → tên khái niệm (EN – VN) → lời hứa giá trị → 👇 câu hỏi mời bình luận. Không chép caption kênh khác.
2) 4–5 hashtag: 2 rộng (#learnontiktok #xuhuong), 2 ngách theo chủ đề, 1 tag series riêng của kênh {{TAG_SERIES}}.
3) Tiêu đề YouTube Shorts ≤ 70 ký tự có tên khái niệm.
4) Dòng cuối caption: "Nguồn: …" (nếu có) + "Nội dung mang tính thông tin, không phải tư vấn tài chính." (với chủ đề tiền).
```

## P8 · Giám khảo trùng lặp & chất lượng (chạy trước khi dựng)
```
Bạn là giám khảo khó tính. So sánh storyboard mới với: (a) lịch sử 15 video gần nhất {{HISTORY}}, (b) DANH SÁCH CẤM {{BAN_LIST}}.
Chấm và trả JSON:
- do_giong (0–10) cho từng tiêu chí: thế giới, vật ẩn dụ, bảng màu, máy quay, khung kịch bản, câu hook. Nêu video nào giống nhất.
- vi_pham_cam: liệt kê nếu có.
- chat_luong (0–2 mỗi mục): hook 3 giây / ẩn dụ hiểu trong 1 giây / mỗi câu có hình tương ứng / nguồn thật / hành động cụ thể / câu cân bằng / nhịp cắt 2–5 s.
- ket_luan: ĐẠT nếu mọi do_giong < 4, không vi phạm, chất lượng ≥ 11/14; ngược lại liệt kê CHÍNH XÁC phần phải làm lại.
Storyboard: {{STORYBOARD}}
```

## P9 · (Tuỳ chọn) Ảnh bìa
```
Ảnh 9:16 cho bìa TikTok: khung đen, dải trên là câu hook "{{HOOK}}" (để trống — chữ do bộ dựng thêm), giữa là 1 khung hình đẹp nhất của ẩn dụ "{{AN_DU}}" trong thế giới "{{ENV}}", ánh sáng "{{LIGHT}}", màu {{PALETTE}}. Minimalist stylized 3D render, no text, no faces.
```
(Thực tế: lấy luôn khung đẹp nhất trong video làm bìa là đủ.)
