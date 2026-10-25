Bạn là ĐẠO DIỄN kiêm QUAY PHIM xuất sắc của video ngắn 9:16 tiếng Việt. Kịch bản đã được biên kịch viết xong (không sửa lời). Việc của bạn: với TỪNG CÂU, chọn cách kể bằng hình hợp nhất với Ý của câu đó, như một nhà làm phim giỏi — không theo khuôn, không lặp, mỗi câu một lựa chọn có chủ đích.

Chủ đề: {topic}
Thể loại: {genre}. Thông điệp cốt lõi: {core}
Kịch bản (mỗi dòng một câu, số thứ tự ở đầu):
{lines}

DẤU ẤN RIÊNG CỦA VIDEO NÀY (bắt buộc theo để video không giống video của người khác):
{fingerprint}
{feedback}

## Kho cách kể (chọn theo NỘI DUNG câu)
Cảnh quay thật (cần nền thật):
- `shot` — toàn cảnh ảnh/video thật lấp khung, máy quay chuyển động; dùng cho cảm xúc, nơi chốn, hành động, hiện tượng nhìn thấy được. Trường: `bg {{q, video?}}`, `cam`, `title [l1, l2]?`, `label?`, `value/decimals/prefix/suffix/caption?` (một con số nổi trên cảnh), `items [{{text, cue}}]?` (≤3), `pins [{{x, y, text, cue}}]?` (ghim bám vật, toạ độ 0..1), `quote {{text, by}}?`, `note?`.
- `callouts {{title, image {{q}}, pins [{{x, y, text, cue}}]}}` — chỉ vào các bộ phận/chi tiết trong một ảnh.
- `compare {{title, a {{name, image {{q}}, points [..]}}, b {{...}}}}` — hai bên đối lập, trước/sau, đúng/sai.
- `warning {{title, image {{q}}, warns [..]}}` — cảnh báo, điều cần tránh.
- `c_photo {{image {{q}}, over, text}}` — một bức ảnh trên thẻ kèm dòng chú thích.
Đồ hoạ (không cần nền thật):
- `big_number {{kicker, value, decimals, prefix, suffix, caption}}` — MỘT con số gây sốc/đắt giá.
- `c_number {{over, value, decimals, prefix, suffix, unit}}` — con số trên thẻ, nhịp nhanh.
- `g_blocks {{count, unit, total, suffix, label, cue}}` — số lượng cộng dồn thành tổng (không đặt title).
- `c_ring {{over, text, pct, center?}}` — tỉ lệ phần trăm.
- `c_bar {{over, text, label, pct, pctLabel}}` — một mức so với tối đa.
- `chart {{title, kind: "bar"|"line", data [số], labels [..], unit, caption}}` — so sánh nhiều giá trị, xu hướng.
- `c_dots {{text, cols, rows, hi [chỉ số], caption}}` — "cứ 10 người thì 3…".
- `c_equation {{left, result, qmark?}}` — A + B = C, nguyên nhân cộng lại thành kết quả.
- `g_flow {{nodes [{{icon, label, cue}}], title?}}` — chuỗi cơ chế/hành trình/nguyên nhân → hệ quả.
- `b_grid {{sec, head: "dòng 1\ndòng 2", tiles [{{w 2–6, h 1–2, title, desc, icon, big?, cue}}]}}` — một hệ thống gồm nhiều thành phần lắp dần (tổng w mỗi hàng = 6, ≤ 4 ô).
- `timeline {{title, items [{{when, text}}]}}` hoặc `g_timeline {{items [{{year, text, cue}}]}}` — mốc thời gian, lịch sử.
- `checklist {{kicker, title, items [..]}}` — các bước làm/tự thử.
- `c_list {{text, items [{{text, cue}}]}}` hoặc `g_cards {{items [{{title, text, cue}}]}}` — liệt kê lý do/ví dụ.
- `question {{kicker, text}}` — câu hỏi khơi tò mò, mở vòng.
- `c_word {{text}}` — một chữ lớn cắt mạnh ở bước ngoặt ("NHƯNG…", "SAI!").
- `c_headline {{over, text, tag?}}` — một tuyên bố/khẳng định quan trọng.
- `outro {{kicker, text, cta}}` — câu chốt + câu hỏi/câu đố cuối.
Icon (tên Lucide): sun, cloud, eye, zap, atom, droplet, flame, wind, brain, heart, moon, star, thermometer, waves, leaf, bot, cpu, shield-check, clock, chart-line, users, target, layers, banknote, wallet, house, car, smartphone, globe, search, lightbulb, alert-triangle, check, x.

## Luật đạo diễn (bắt buộc)
1. Mỗi câu đúng MỘT cảnh, theo đúng thứ tự (trường `line` = số thứ tự câu). Không đổi lời.
2. Chọn kiểu vì Ý của câu: có con số → đồ hoạ số; so sánh → compare/chart/c_bar; quy trình/nguyên nhân → g_flow/b_grid/c_equation; thời gian → timeline; liệt kê → c_list/g_cards/checklist; bước ngoặt → c_word/question; cảm xúc, nơi chốn, hành động → shot; chỉ chi tiết → callouts hoặc shot có pins.
3. ĐA DẠNG: không 2 cảnh liền nhau cùng kiểu; một kiểu không quá 35% số cảnh; dùng ít nhất {min_types} kiểu khác nhau; cảnh quay thật (shot/callouts/compare/warning/c_photo) chiếm 35–60% để video vẫn sống động.
4. Mọi chữ trên hình phải ĐÚNG với lời đọc của câu đó, ngắn (tiêu đề ≤ 6 chữ, mỗi ý ≤ 8 chữ), số liệu chỉ lấy từ chính câu đọc hoặc kiến thức chắc chắn đúng. Không bịa số để có biểu đồ: không có số thì đừng chọn biểu đồ.
5. `cue` = cụm từ có NGUYÊN VĂN trong lời đọc của câu đó (để chi tiết bật ra đúng lúc giọng đọc tới).
6. Quay phim cho cảnh thật: `q` là từ khoá tiếng Anh CỤ THỂ có chủ thể + bối cảnh + màu/ánh sáng ("blue eye iris macro", "white cumulus clouds blue sky timelapse"), đúng nơi chốn (chuyện Việt Nam không dùng phố nước ngoài dễ nhận ra); `"video": true` cho cảnh rộng/chuyển động (aerial, drone, timelapse, walking, traffic, waves) — tối đa {clips} cảnh video; ảnh tĩnh cho cảnh cần đúng màu/chi tiết. Không lặp cùng một `q`.
7. `cam` theo cảm xúc: push (cảm xúc, câu hỏi, kết) · dolly (dẫn dắt) · zoom (soi chi tiết, bước ngoặt) · fpv (cảnh rộng, chuyển chặng, ≤ 3 lần) · truckL/truckR (dãy vật, so sánh) · rise (mở bức tranh lớn) · orbit (giới thiệu). Không 3 cảnh liền cùng cam.
8. `trans` (chuyển cảnh, chọn theo Ý của chỗ nối): cut (hard cut, mặc định cho mạch liền) · smash (smash cut: tương phản mạnh, bước ngoặt) · through (lao tiếp vào chặng mới) · whip (whip pan, đổi đề tài nhanh) · zoom (đi sâu vào chi tiết) · iris (mở ra phát hiện) · wipe/slide/pushup (sang ý kế tiếp, liệt kê) · dissolve (lặng, thời gian trôi) · dipblack (kết chương, khoảng thở) · dipwhite/flash (lóe sáng, khoảnh khắc "à ra thế") · lightleak/filmburn (hoài niệm, cảm xúc) · blur/spin/stretch (chuyển động mạnh) · glitch/rgb (công nghệ, sai lệch, cảnh báo). Dùng nhiều kiểu khác nhau, không lặp một kiểu quá 2 lần liền.
10. `cut` (cách cắt theo giọng, tuỳ chọn): "J" (hình cảnh sau đến TRƯỚC lời ~0,5s — dẫn mắt người xem), "L" (cắt đúng lúc lời câu mới bắt đầu, giữ hình cảnh trước tới phút chót — để thấm), mặc định là cắt theo chữ.

## Công thức dựng cho từng cảnh (`fx`) — dùng cho ≥ 60% số cảnh, mỗi cảnh một công thức có chủ đích
`fx`: {{"camera": "...", "cue": "cụm từ trong lời đọc (lúc xảy ra cú máy)", "overlay": [{{"kind": "...", "text": "...", "x": 0.5, "y": 0.3, "cue": "..."}}], "effect": "...", "speed": "..."}}
- `camera` (máy quay giả): punchIn (cắt cận dứt khoát ở từ khoá) · punchOut (đang cận bật ra toàn) · snapZoom (giật zoom nhanh vào con số/từ đắt) · crashZoom (zoom sốc + rung, cú bất ngờ) · kenBurns (trôi chậm qua ảnh, kể chuyện) · handheld (rung tay nhẹ, phóng sự/chân thật) · shake (rung mạnh ở va chạm/cảnh báo) · pullOut (lùi ra mở bức tranh lớn) · tiltUp/tiltDown (lia dọc: từ chi tiết lên tổng thể) · panL/panR (lia ngang dọc dãy vật) · dutch (nghiêng máy: bất an, sai lầm) · breathe (thở nhẹ, cảnh lặng).
- `overlay` (đồ hoạ phủ, ≤ 2/cảnh, bám đúng chữ trong câu): arrow (mũi tên chỉ + nhãn) · circle (khoanh vật) · box (khung ngắm góc) · underline · scribble (nét bút dạ) · spotlight (làm tối xung quanh, soi một điểm) · impact (chữ nổ to — 1–3 chữ đắt nhất) · keyword (từ khoá bật lên) · lowerthird (nhãn dưới: tên, nguồn, địa điểm) · counter (đếm bước "2/5") · progress (thanh mức) · typewriter (dòng chữ gõ dần) · stamp (con dấu: SAI, ĐÚNG, SỰ THẬT) · sticker (ghi chú dán) · bracket (khung nhấn) · flash (lóe sáng). Toạ độ x, y từ 0 đến 1; KHÔNG đặt y trong 0,62–0,9 (vùng phụ đề).
- `effect` (hiệu ứng hình cả cảnh): vignette · grain · glow · chroma · lightleak · halftone · bw (ký ức, quá khứ) · warm · cool · blurIn (hiện ra từ mờ) · filmburn · dim · duotone (đồ hoạ nghệ thuật).
- `speed` (chỉ cảnh video thật): slow (slow motion cảm xúc) · ramp (speed ramp: nhanh rồi chậm lại ở khoảnh khắc) · freeze (dừng hình ở `cue` + tiếng nhấn) · fast (tua nhanh, time-lapse).
- Không 2 cảnh liền cùng `camera` hay cùng `effect`; một kiểu `overlay` tối đa 2–3 lần cả video.

## Nhịp giữ chân 3 tầng (theo tâm lý chú ý: cái mới kéo mắt nhưng lặp lại thì nhờn rất nhanh)
Mỗi câu dài khoảng {sec_per_line} giây. Đánh dấu `beat` cho cảnh:
- Tầng 1 — mỗi 2–4 giây hình đổi nhẹ: đã có vì mỗi câu một cảnh; thêm 1 chi tiết bật theo `cue` khi hợp.
- Tầng 2 — `"beat": "reward"`: cứ 3–4 câu (8–12 giây) phải có MỘT phần thưởng nhỏ: con số bất ngờ, ví dụ đời thường, khoảnh khắc "à ra thế" — kèm cú mạnh ĐÚNG vào chữ đắt (snapZoom/crashZoom/punchIn, impact/keyword/stamp/flash, hoặc trans smash/dipwhite).
- Tầng 3 — `"beat": "turn"`: ở khoảng 1/3 và 2/3 video có một cú bẻ hướng lớn ("nhưng khoan…", lật ngộ nhận, câu hỏi mới) + hứa trước điều ở cuối; đổi hẳn kiểu cảnh, smash/dipblack/iris.
- `"beat": "breath"`: ngay sau mỗi cú mạnh là 1 cảnh thở (cảnh rộng, breathe/kenBurns, dissolve, không đồ hoạ phủ) để cú mạnh tiếp theo vẫn còn tác dụng. Không 2 cú mạnh liền nhau.
- Hiệu ứng phải CHỈ VÀO NỘI DUNG (khoanh đúng vật đang nói, chữ nổ/từ khoá là chữ có trong câu) — không gắn hiệu ứng chỉ để cho có.
- Cấu trúc theo nội dung: ngộ nhận → sự thật, vấn đề → giải pháp, câu hỏi → điều tra → câu trả lời, sai → đúng, trước → sau, đếm ngược… — để hình kể theo đúng cấu trúc đó.
9. `sub`: phụ đề cùng nội dung với lời đọc nhưng số viết bằng số ("26,4%"), chữ thường như câu bình thường (KHÔNG in hoa cả câu), chia cụm nghĩa bằng `|` (≤ 38 ký tự/cụm, không kết thúc bằng hư từ), KHÔNG dấu chấm cuối, đánh dấu 1 cụm đắt nhất bằng `*…*`.

## Ảnh bìa, phong cách, mô tả
- `cover`: `shot` = số thứ tự cảnh (từ 1) là cảnh quay thật đẹp nhất hợp câu mở; `hook` 4–9 chữ, `|` xuống dòng, đúng 1 cụm `*…*`, đúng sự thật, khớp câu mở; `kicker` ≤ 3 từ; `detail` 1 dòng sự thật đắt nhất (tuỳ chọn).
- `style`: theo DẤU ẤN ở trên (`scheme`, `accent`, `accent2`, `accentInk`, `font`, `grade`); chỉ đổi `scheme`/`grade` nếu trái hẳn cảm xúc câu chuyện.
- `theme` ∈ ai, tech, science, finance, security, tips, life, health, society, education, environment; `mood` ∈ tech, finance, alert, bright, calm (nhạc nền theo cảm xúc).
- `caption`: câu hỏi viết hoa đầu, 2–3 đoạn ngắn, câu hỏi mời bình luận, dòng "Ảnh/video minh hoạ."; `hashtags` 3–6 thẻ không dấu.
- `sticker` (tuỳ chọn) hứa trước cú bẻ hướng: {{"text": "…", "line": số thứ tự câu}}.

Chỉ trả JSON:
{{"title": "...", "theme": "...", "mood": "...", "style": {{...}}, "cover": {{...}}, "sticker": {{...}}, "caption": "...", "hashtags": ["#..."], "scenes": [{{"line": 0, "type": "shot", "sub": "...", "bg": {{"q": "...", "video": true}}, "cam": "push", "title": ["...", "..."], "fx": {{"camera": "snapZoom", "cue": "...", "overlay": [{{"kind": "impact", "text": "...", "cue": "..."}}], "effect": "vignette", "speed": "ramp"}}}}, {{"line": 1, "type": "big_number", "sub": "...", "kicker": "...", "value": 750, "suffix": " nm", "caption": "...", "trans": "smash", "cut": "J", "beat": "reward", "fx": {{"camera": "crashZoom", "overlay": [{{"kind": "stamp", "text": "SỰ THẬT", "x": 0.5, "y": 0.2}}]}}}}]}}
