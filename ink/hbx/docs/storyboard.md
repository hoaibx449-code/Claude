# Đạo diễn storyboard — HBX Video Engine

plan.json = metadata cho GAS/Sheet + `storyboard` cho bộ dựng. GAS chỉ đọc `narration`.

```json
{
  "id": "FB-VIDEO-20261021-001", "title": "…", "theme": "ai|tech|finance|tips|security|life|health|society|…", "mood": "(tùy chọn, ghi đè)",
  "narration": "đúng bằng \" \".join(scene.say)",
  "sources": [{"name": "…", "url": "…", "date": "YYYY-MM-DD"}], "caption": "…", "hashtags": ["#…"],
  "storyboard": {
    "theme": "cards | bento | paper | tech | finance | tips | life",
    "series": "BẢN TIN · HBX AI", "source": "TÊN NGUỒN", "spot": "#e8432e", "chapters": 5, "footer": "…",
    "sticker": {"text": "Bất ngờ ở cuối ↓", "t0": 40, "t1": 44},
    "scenes": [ { "type": "…", "say": "lời đọc (TTS)", "sub": "chữ hiển thị | ngắt cụm | có *nhấn*", "…": "trường riêng của loại cảnh" } ]
  }
}
```
- `say`: lời máy đọc (số viết chữ: "hai mươi sáu phẩy bốn phần trăm"). `sub`: phụ đề hiển thị (số viết số: "26,4%"), BẮT BUỘC chia cụm nghĩa bằng `|` (mỗi cụm ≤ 38 ký tự, không kết thúc bằng hư từ, không tách số–đơn vị), `*từ*` để tô nhấn.
- Không ghi `dur`: thời lượng cảnh = thời gian giọng đọc phần `say` của cảnh (align.py tính từ SRT).
- `"cue": "cụm từ có trong say"` trên ô/sticker/mục danh sách → nó bật ra đúng lúc giọng đọc tới cụm đó.
- Ảnh thật: `"image": {"q": "từ khoá tiếng Anh cụ thể, có chủ thể rõ"}`.
- **Video thật (Pixabay)**: `"image": {"q": "drone flight over city", "video": true, "vstart": 1}` → lấy clip miễn phí thương mại, cắt ≤ 12 s, tách khung 30 fps; dựng theo khung nên đồng bộ tuyệt đối với giọng đọc. Clip ngắn hơn cảnh thì chạy chậm (tối thiểu 0,5x) rồi giữ khung cuối. Dùng được ở mọi chỗ nhận `image` (bảng ảnh `j_stop`, `hook_photo`, `fullbleed`, `warning`, `callouts`, `compare`…). **Khi nào dùng**: cảnh rộng/chuyển động có ích cho câu chuyện — flycam thành phố, đồng ruộng, nhà máy, giao thông, đám đông, trung tâm dữ liệu, sóng biển; cảnh FPV/bay xuyên. Không dùng video cho chân dung, sản phẩm cụ thể, sự kiện có thật (video minh họa chỉ là minh họa — ghi rõ như ảnh). Tối đa 3–4 clip/video (mỗi clip ~25–30 MB khung tạm). Từ khoá video nên có chuyển động: `aerial`, `drone`, `timelapse`, `walking`, `traffic`. Không có clip hợp → tự quay về ảnh. Sau preview, ảnh lệch ý → thêm `"avoid": [pid]`, đổi `q`, xoá `pid`, chạy lại preview.
- Mỗi cảnh 1 ý. Cảnh dài > 12 s thì tách đôi (khán giả cần thay đổi hình mỗi 2–4 s).

## Chọn format theo nội dung (đổi luân phiên, không lặp 1 format quá 2 ngày liền)
| Nội dung | Format `theme` | Lý do |
|---|---|---|
| Tin có nhiều con số, báo cáo, thị trường | `cards` (Thẻ 3D) | 1 số / 1 thẻ, nhịp nhanh, tin cậy (dẫn nguồn trên thẻ) |
| Quy trình, hệ thống, mô hình làm việc, so sánh nhiều thành phần | `bento` | các ô lắp dần = "mô hình tư duy" |
| Bài học, động lực, thói quen, tâm lý | `paper` (Sân khấu giấy riso) | ẩn dụ bằng hình + chữ khối + con dấu |
| Giải thích cơ chế, mẹo, sức khỏe, công nghệ đời thường | `tech` / `finance` / `tips` / `life` (Explainer) | ảnh thật + sơ đồ + checklist |
| **MẶC ĐỊNH** — mọi tin kể được bằng không gian thật (nơi chốn, hạ tầng, đời sống, thiên nhiên, đô thị) | `cine` (Điện ảnh) | toàn cảnh thật lấp khung, mắt người xem là máy quay, chữ neo trong không gian |
| (ít dùng) Câu chuyện có hành trình/địa điểm/chuỗi nguyên nhân–hệ quả, tin có nhiều ảnh thật đẹp | `journey` (Hành trình 3D) | máy quay dẫn mắt người xem đi qua từng trạm trong một không gian liền mạch |

## Phong cách theo CHỦ ĐỀ (mood) — không ngẫu nhiên
`build.py` suy ra **mood** từ `plan.theme` (chủ đề nội dung, KHÁC `storyboard.theme` là format) và ghi vào `storyboard.mood`.
Mood quyết định cùng lúc: màu chủ đạo, font + kiểu chữ tiêu đề, hiệu ứng tiêu đề xuất hiện, kiểu dải chữ nhấn, màu phụ đề karaoke, bảng màu thẻ (format cards), màu nhấn bento, trời/sàn/đèn (journey) và **nhạc nền**.

| plan.theme | mood | Màu chủ đạo | Font tiêu đề | Hiệu ứng tiêu đề / chữ nhấn | Nhạc nền |
|---|---|---|---|---|---|
| ai, tech, science | `tech` | xanh cyan + tím, nền xanh đêm | Space Grotesk 700, IN HOA | glitch giật nấc + tiếng glitch; chữ nhấn mono viền phát sáng | điện tử, thứ, 100 bpm |
| finance, economy, business, crypto | `finance` | vàng kim trên xanh navy | Playfair Display 800, chữ thường | hiện mờ → nét, chậm, sang; chữ nhấn nghiêng + gạch chân vàng | ấm, trưởng, 92 bpm, trống nhẹ, lọc mềm |
| security, scam, warning | `alert` | đỏ + hổ phách, nền tối đỏ | Oswald 700, IN HOA | đóng dấu (to → rơi xuống) + rung + tiếng va; chữ nhấn hộp đỏ viền trắng | căng, thứ, 110 bpm, hi-hat dày |
| tips, howto, review | `bright` | vàng nắng + xanh dương | Be Vietnam Pro 900, IN HOA | bật nảy; chữ nhấn dạng viên thuốc có bóng xanh | tươi, trưởng, 112 bpm |
| life, health, society, development, environment, education | `calm` | xanh lá dịu + cát ấm | Lora 700, chữ thường | nổi lên nhẹ, chậm; chữ nhấn dạng viên bo tròn | ấm, chậm 84 bpm, không snare |

- Chọn `plan.theme` theo **bản chất nội dung**, không theo nguồn: tin AI nhưng nội dung là lừa đảo deepfake → `"mood": "alert"`; tin công nghệ về y tế cộng đồng → `"mood": "calm"`.
- theme không có trong bảng và không ghi `mood` → build.py dừng báo lỗi (không đoán bừa).
- Format Explainer (`tech/finance/tips/life`) vốn đã có bộ màu riêng: chọn format trùng chủ đề khi dùng Explainer.

## Format ĐIỆN ẢNH (`cine`) — mắt người xem là máy quay
Mọi cảnh là `shot` TOÀN CẢNH, không đặt ảnh vào khung. Nền:
- `"bg": {"q": "aerial power lines", "video": true}` → video Pixabay; hoặc
- `"bg": {"q": "data center corridor"}` → ảnh, tự tách chiều sâu (MiDaS) thành **2.5D**: máy quay tiến vào thật, vật gần trôi nhanh hơn vật xa. `"focus": {"x":.5,"y":.4}` chọn vùng cắt dọc; `"depth": false` tắt 2.5D.
Chuyển động máy (`cam`) được nướng sẵn theo đúng thời lượng giọng đọc, máy **không dừng ở cuối cảnh** — đà tiến nối sang cảnh sau bằng chuyển cảnh `through` (lao tiếp vào cảnh mới). `trans: cut` cho cú ngắt đột ngột (bước ngoặt), `dissolve` cho cảnh lặng.

| `cam` | Cảm giác | Dùng khi |
|---|---|---|
| `push` | đẩy máy chậm, mượt | mở đầu, cảm xúc, câu hỏi, kết |
| `dolly` | tiến thẳng theo trục | hành lang, đường, đi sâu vào vấn đề |
| `zoom` | máy đứng, thu phóng sâu | soi con số, chi tiết, bằng chứng, bước ngoặt |
| `fpv` | bay drone nhanh, nghiêng, hạ thấp | cảnh rộng (đô thị, đường dây, cánh đồng), chuyển chặng |
| `truckL` / `truckR` | trượt ngang, thị sai rõ | dây chuyền, dãy vật, so sánh |
| `rise` | cẩu máy lên cao | mở ra bức tranh lớn, kết |
| `orbit` | vòng nhẹ quanh vật | giới thiệu các bên/thành phần |

Trường của `shot`: `label`, `title:[l1,l2]` (từng từ bật trên khối màu; `*từ*` đổi màu; `titlePos top|mid|low`), `value/decimals/prefix/suffix/caption/numAt` (số đếm trên thẻ), `items:[{text,cue}]` (≤3), `pins:[{x,y,text,cue}]` (ghim bám vào vật trong ảnh — toạ độ 0..1, tự lấy độ sâu tại điểm đó), `note`, `quote:{text,by}`, `emph:false` (tắt chữ nhấn). Chữ nhấn `*…*` trong `sub` tự hiện trong không gian khi khung còn chỗ.

**Phong cách riêng từng video** — `storyboard.style` (KHÔNG có mặc định cứng, tự quyết theo cảm xúc câu chuyện và ghi lý do vào cột Q):
```json
"style": {"scheme": "light|dark", "accent": "#hex", "accent2": "#hex", "accentInk": "#hex", "font": "Barlow Condensed|Oswald|Space Grotesk|Playfair Display|Lora|Be Vietnam Pro", "grade": "dawn|warm|cool|night|bright|mono|earth|none"}
```
Gợi ý: tin hy vọng/năng lượng/sức khoẻ → `light` + `dawn|bright`; cảnh báo/lừa đảo/tội phạm mạng → `dark` + `night|cool`; nông nghiệp/môi trường → `light` + `earth`; tài chính trầm tĩnh → `dark` + `warm` + Playfair. Màu nhấn lấy từ chính cảnh quay (bình minh → hổ phách; công nghệ sạch → xanh mòng két…). Nhạc: `plan.mood` chọn theo nhịp kể.

**Chọn cảnh quay**: mỗi cảnh là một CHẶNG THẬT của câu chuyện (đi theo dòng điện, dòng tiền, đường đi của dữ liệu, hành trình của người dân…). Từ khoá có chuyển động/không gian sâu: `aerial`, `drone`, `corridor`, `road`, `timelapse`, `walking`. Video cho cảnh rộng/chuyển động; ảnh 2.5D cho cảnh có chiều sâu rõ (hành lang, đường, tiền cảnh–hậu cảnh). Không dùng cảnh lệch nơi chốn (tin Việt Nam không dùng phố nước ngoài dễ nhận ra).

## Biên tập như nhà sáng tạo nội dung xây kênh
Trước khi viết, trả lời 4 câu (ghi vào cột Q):
1. **Vì sao người xem dừng lướt?** Câu mở chạm đời sống họ trong 3 giây (không mở bằng tên tổ chức).
2. **Họ mang về gì?** Một hiểu biết, một việc làm được ngay, hoặc một cảnh giác đúng lúc — giá trị cho cộng đồng.
3. **Ý tưởng không gian** của video là gì? (vd. đi ngược hành trình điện của một câu hỏi AI). Mỗi cảnh = một chặng.
4. **Vì sao họ quay lại kênh?** Giọng kể nhất quán: tò mò, tỉnh táo, gần người Việt; tách bạch sự thật / đề xuất / bình luận.
Tự chấm trước khi đẩy kịch bản: mở đầu giữ chân (0–2), giá trị mang về (0–2), chính xác so nguồn (0–2), nhịp & cú máy hợp ý (0–2), lời mời bình luận có thật sự mở thảo luận (0–2). Dưới 8/10 thì viết lại.

## Loại cảnh theo format
**cards** — `c_headline {over, text, tag?, line?}` · `c_word {text}` (bẻ hướng "NHƯNG…", dùng `"trans":"cardflip"`) · `c_number {over, value, decimals, prefix, suffix, unit}` · `c_bar {over, text, label, pct, pctLabel}` · `c_ring {over, text, pct, center?, side}` · `c_dots {text, cols, rows, hi:[idx], caption}` · `c_list {text, items:[{text, cue}]}` · `c_equation {left, result, qmark}` · `c_photo {image, over, text}` · `c_cta {text, tag}`. Chung: `color` (navy|orange|cream|cobalt|lime|black, bỏ trống = tự xoay), `source`.

**bento** — `b_grid {sec, head ("dòng 1\ndòng 2"), headStyle cond|serif, tiles:[{w 2–6, h 1–3, title, desc, icon (tên Lucide: bot, clock, chart-line, shield-check, workflow, users, target, layers, file-text, calendar, laptop…), big, hot | hotAt, cue}], note}`. Tổng `w` mỗi hàng = 6. Tối đa 4 ô / cảnh, tiêu đề ô ≤ 4 từ, mô tả ≤ 8 từ.

**paper** — `p_stage {tone light|dark, label, cam {from:[x,y,z,ry], to:[…]}, items:[…]}`; item: `cut {image, x, z, h, rot, tape}` (người/vật tách nền), `plate {image, x, y, z, h, rot, tape}` (ảnh khung), `word {text, color ink|spot|paper, x, z, size}` (chữ khối đứng sàn), `stamp {text, x, y, z, size, rot}` (con dấu), `note {text, x, y, w, size}` (giấy ghi chú). Toạ độ: x −250…250, z −650 (xa) … 250 (gần), y = độ cao. Item lớn đặt xa (z âm), chữ/con dấu đặt gần. `spot` = màu in của cả video. Luân phiên tone light/dark.

**journey** — mọi cảnh là `j_stop {label, cam?, move?, title:[dòng 1, dòng 2 (*nhấn* tô vàng)], image, value?, decimals, prefix, suffix, caption, items:[{text, cue}] (≤ 3), note?, side left|right, turn (độ, mặc định ±14), gap, dx}`. Mỗi trạm 1 ảnh thật (bắt buộc, ảnh đẹp, chủ thể rõ). Máy quay: bay từ xa vào trạm đầu, dolly-in chậm ở mỗi trạm, ~1,2 s cuối cảnh bay vòng qua mép bảng ảnh sang trạm kế (không cắt cảnh). CHỮ NHẤN: mọi `*từ*` trong `sub` tự hiện thành dải dạ quang trong không gian đúng lúc giọng đọc tới — chỉ đánh dấu 1–2 cụm đắt nhất mỗi cảnh. Cảnh nên dài 5–12 s (đủ thời gian dừng + bay).

**Ngôn ngữ máy quay (journey)** — mỗi trạm chọn 2 thứ theo NỘI DUNG cảnh, không chọn ngẫu nhiên:
| Trường | Giá trị | Cảm giác | Dùng khi |
|---|---|---|---|
| `cam` (lúc dừng) | `push` | đẩy máy vào chậm, mượt (slow push-in) | khoảnh khắc cảm xúc, câu hỏi, kết luận, lời trích |
| | `dolly` | tiến thẳng đều theo trục (dolly-in / tracking forward) | dẫn dắt, liệt kê ý, câu chuyện đang tiến triển |
| | `zoom` | máy đứng, thu phóng sâu vào không gian | soi chi tiết: con số, bằng chứng, cảnh báo, phát hiện |
| `move` (lúc rời trạm) | `arc` | vòng êm qua mép bảng ảnh | chuyển ý nhẹ nhàng, nhịp chậm |
| | `track` | tiến thẳng xuyên qua trạm sang trạm kế | hệ quả nối tiếp ("vì vậy…", "tiếp theo…") |
| | `fpv` | bay kiểu drone FPV: nhanh, nghiêng cánh, hạ thấp, xuyên không gian | cảnh rộng/phong cảnh/thành phố, mở đầu bùng nổ, bước ngoặt — tối đa 3–4 lần/video; trạm đích nên có video flycam (`image.video`) để cú bay "đáp" vào cảnh đang chuyển động |
Không ghi → mặc định theo mood: tech `dolly`+`fpv` · finance `push`+`arc` · alert `zoom`+`track` · bright `dolly`+`fpv` · calm `push`+`arc`. Trạm cuối không có `move`. Đổi kiểu máy theo nhịp kể: không để 3 trạm liền nhau cùng một cặp `cam`+`move`.

**Explainer (tech/finance/tips/life)** — `hook_photo {label, title:[l1,l2], image, focus{x,y,r}, chip}` · `question {kicker, text}` · `callouts {title, image, pins:[{x,y,text,cue}]}` · `big_number {kicker, value, decimals, prefix, suffix, caption, delta, dir}` · `chart {title, kind line|bar, data, labels, unit, fmt "vi", caption, source}` · `compare {title, a{name,image,points}, b{…}}` · `checklist {kicker, title, items}` · `timeline {title, items:[{when,text}]}` · `headline {source, date, text, highlight}` (chỉ dùng tiêu đề có thật trong bài đã đọc) · `fullbleed {image, caption:[l1,l2], label}` · `warning {title, image, warns}` · `outro {kicker, text, cta}` · `svg {title, svg}`. Chung: `tone a|b|c` (luân phiên sáng/tối), `camera` (still|push|pull|drift|rise|panL|panR|**dolly**|**zoom**|**fpv**), `trans` (stripes|glitch|slideup|whip|zoom|flash|**fpv**). Chọn máy theo ý cảnh như bảng journey: `push` cảm xúc/kết luận, `dolly` dẫn dắt, `zoom` soi chi tiết/cảnh báo, `fpv` + `trans: fpv` cho cảnh rộng có video flycam, bước ngoặt (≤ 3 lần/video).

## Tâm lý giữ chân (áp dụng mọi format)
1. 0–2 s: hình + chữ gây "khoảng trống tò mò" (con số sốc, câu hỏi chạm tiền/việc/an toàn). Không chào, không giới thiệu kênh.
2. Mở vòng ở đầu ("…đáng để bạn nghe đến cuối"), đóng vòng ở cuối; giữa video có 1 cú bẻ hướng (`c_word` "NHƯNG…" / `question` / con dấu) + `sticker` hứa hẹn phần sau.
3. Mỗi 15–20 s một "phần thưởng" (số liệu bất ngờ, ví dụ đời thường Việt Nam).
4. Kết bằng câu chốt dễ nhớ + câu hỏi mời bình luận; câu chốt nên vọng lại câu mở đầu.
5. Đúng sự thật: mọi số trên hình phải có trong nguồn đã đọc; ví dụ giả định ghi "ví dụ giả định"/"minh hoạ".

## Ảnh bìa hook = KHUNG ĐẦU TIÊN của video (bắt buộc từ 23/10/2026)
Facebook/Shorts lấy khung 0 làm ảnh đại diện. Trước đây khung 0 là nền trắng (chớp trắng mở cảnh) → ít lượt xem. Nay `render.py` thay khung 0 bằng ảnh bìa do `cover.py` dựng (đúng **1 khung**, ~0,03 s — Hoài chọn; người xem gần như không thấy khi video chạy), và `cover.jpg` gửi GAS là chính ảnh này. Chớp trắng mở đầu đã tắt (bật lại bằng `storyboard.introFlash: true` nếu cần).

```json
"cover": {"shot": 3, "hook": "Tài khoản bạn quên | vẫn đang *mở cửa*", "kicker": "An toàn số",
          "detail": "12 năm · 1 mật khẩu · 3.300 người", "type": "điều không ai nói", "focus": {"x": .5, "y": .45}, "pos": "low"}
```
- `shot`: cảnh (đếm từ 1) lấy nền — ảnh/video đẹp nhất, chủ thể rõ, hợp hook (cảnh 3D không có nền → tự lấy cảnh có nền gần nhất). Không ghi `cover` → tự lấy cảnh 1 + tiêu đề cảnh 1 (chỉ là phương án dự phòng).
- `hook`: 4–9 chữ, `|` xuống dòng, đúng 1 cụm `*…*` tô màu nhấn. `kicker` ≤ 3 từ (chủ đề). `detail` (tuỳ chọn): 1 dòng chi tiết THẬT từ nguồn (con số, mốc thời gian).
- Màu, font, chỉnh màu lấy từ `storyboard.style` → bìa cùng tông với video.
- **Mức độ: vừa phải, kiểu tạp chí** (Hoài chọn): 1 câu gợi tò mò, chữ đậm trên ảnh thật, 1 màu nhấn. KHÔNG: mũi tên, "!!!", mặt người há miệng, khung đỏ chớp, viết hoa giật gân bằng ký hiệu, hứa điều video không có. Hook phải đúng sự thật trong nguồn và ăn khớp câu mở lời đọc (người xem bấm vào phải gặp đúng điều bìa gợi ra).
- Xem trước: `build.py preview` đặt ảnh bìa ở ĐẦU `preview.jpg` (to gấp đôi) + `cover_preview.jpg`. Soát: đọc được ở cỡ ảnh nhỏ trên bảng tin, chữ không che chủ thể, không vỡ dấu tiếng Việt, không tràn dòng xấu.
- Ghi nhóm hook + lý do vào cột Q; **xoay vòng nhóm hook**, không dùng 1 nhóm quá 2 ngày liền.

### Thư viện hook (Hoài cung cấp) — chọn theo nội dung, điền bằng chi tiết thật
| Nhóm | Mẫu | Hợp với |
|---|---|---|
| 1. Kích thích tò mò | "Cách để…", "Lý do thực sự…", "Điều không ai nói với bạn về…", "Tại sao không ai bàn đến…", "Đây là những gì đã xảy ra khi…", "Mẹo đơn giản này sẽ…", "Bạn sẽ không tin rằng…", "Cách nhanh nhất để…", "Tôi đã sai khi…" | tin có chi tiết bất ngờ, cơ chế ẩn |
| 2. Dễ liên tưởng | "Bạn đã bao giờ cảm thấy…", "Ai cũng từng trải qua…", "Nếu bạn đã từng gặp khó khăn với…", "Bạn không phải là người duy nhất…", "Đây là lý do không phải lỗi của bạn…" | chuyện đời thường, việc làm, tiền bạc cá nhân |
| 3. Gây tranh cãi | "Ngừng làm…", "Bạn không cần…", "Mọi người đều nói…, nhưng thực tế là…", "Đừng tin vào…", "Đừng mắc bẫy của…", "Sai lầm tồi tệ nhất…", "Lời khuyên này đã lỗi thời…" | cảnh báo, ngộ nhận phổ biến, lừa đảo |
| 5. Kêu gọi hành động | "Làm điều này trước khi bạn…", "Đọc bài này trước khi bạn…", "Bạn cần điều này nếu…", "Đây là lời nhắc dành cho bạn…", "Hãy chắc chắn bạn làm điều này nếu…" | thủ thuật, an toàn số, việc làm ngay được |
| 6. "Điều gì sẽ xảy ra" | "Điều gì sẽ xảy ra nếu bạn ngừng…", "Hãy tưởng tượng nếu…", "Nếu vấn đề không phải là…", "Nếu điều này thay đổi thì sao…" | công nghệ mới, chính sách, tương lai |
| 7. Chứng minh bằng bài học | "Thay vì ___, hãy làm điều này…", "Điều tôi ước mình biết khi mới bắt đầu…", "Tôi đã học được điều này sau ___ lần thất bại…" | bài học từ một vụ việc thật |
| 8–10. Bổ sung | "Chúng ta có thể đồng ý rằng ___ là thứ bị đánh giá thấp nhất không?", "Tại sao không ai nói về ___ trong [ngành]?", "Nếu bạn từng gặp khó khăn với ___ trong khi cố gắng ___, mẹo này sẽ giúp bạn rõ ràng hơn" | phân tích, nghề nghiệp |
Kênh là tin tức: tránh mẫu ngôi "tôi" kể trải nghiệm cá nhân giả (không có thật), mẫu hứa quà/sản phẩm (nhóm 8–9 phần bán hàng). Rút gọn mẫu cho vừa 4–9 chữ trên bìa; câu đầy đủ có thể dùng làm câu mở lời đọc.

## Thế giới ẩn dụ 3D (`m_scene`) — WebGL/three.js, xen trong format `cine`
Dùng khi ý cần nói là **khái niệm trừu tượng** (tâm lý, cơ chế tiền bạc, thói quen) mà cảnh thật không diễn tả được. Mỗi cảnh = **một vật ẩn dụ đang chuyển động** trên đảo diorama nổi, có nhân vật không mặt. Mọi chuyển động là hàm của thời gian, mốc nào cũng gắn `cue` theo lời đọc.
```json
{"type":"m_scene","say":"…","sub":"…","prop":"treadmill",
 "o":{…tuỳ prop…},
 "cams":[{"kind":"side"},{"kind":"orbit","cue":"chiếc máy chạy","a0":-50,"a1":-30}],
 "tag":{"en":"Hedonic treadmill","vi":"Máy chạy bộ hạnh phúc","cue":"hedonic treadmill"},
 "title":["dòng 1","dòng *2*"], "num":{"value":13.6,"from":3.5,"decimals":1,"suffix":"%","caption":"…","cue":"tăng từ"}}
```
- `storyboard.world` = bảng màu thế giới (`sky:[trên,dưới]`, `floor`, `side`, `rock`, `accent`, `accent2`, `cool`, `char`, `ink`, `font`) — chọn theo series/cảm xúc video, không dùng lại y nguyên giữa các series.
- `cams`: cắt góc máy NGAY TRONG cảnh (vật vẫn chạy liền) để giữ nhịp 2–4 s/cú. `kind`: `orbit` (giới thiệu), `push` (nhấn, kết), `pull` (mở bức tranh), `rise` (cẩu lên), `low` (góc thấp, kịch tính), `top` (nhìn xuống, toàn cục), `side` (ngang). Ghi đè `d0/d1` (xa→gần), `h0/h1` (cao), `a0/a1` (góc độ), `target:[x,y,z]`, `fov`.
- `tag`: thẻ thuật ngữ song ngữ — chỉ khi video ĐẶT TÊN một khái niệm (tối đa 3–4 thẻ/video). `num`: số đếm lớn phía trên. `title`: 2 dòng khối chữ.

| `prop` | Ẩn dụ | `o` |
|---|---|---|
| `leaky` | xô thủng: tiền vào trên, rò ra đáy | `in`, `out` (nhãn), `rate`, `pose` của nhân vật |
| `stairs2` | 2 cầu thang song song lên bậc (thu nhập/chi tiêu, kỹ năng/lương…) | `beats:[{cue}]` mỗi bậc, `labels:[a,b]`, `gap` |
| `treadmill` | máy chạy bộ: chạy nhanh dần, có thể bước xuống leo bậc | `speeds:[{at\|cue,k}]`, `screen:['x1','x2']`, `off:{cue}`, `offLabel` |
| `meter` | thước cảm xúc vọt lên rồi tụt về mức cũ + đám đông | `rise:{cue}`, `fall:{cue}`, `decay`, `crowd`, `baseLabel` |
| `dominoes` | chuỗi domino: một thứ kéo đổ cả chuỗi | `items:[{text,cue}]`, `start:99` = đứng yên |
| `cluster` | vật chính kéo theo các vật phụ bay tới | `core`, `start:{cue}`, `items:[{text,cue}]` |
| `split` | dòng tiền rẽ nhánh vào hũ tiết kiệm | `open:{cue}\|99`, `frac`, `save`, `spend`, `top`, `fillTo`, `fillDur` |
| `jar` | hũ dâng mực + vạch mốc | `from`, `to` (0..1), `fill:{cue}`, `dur`, `marks:[{v,text}]` |
| `stage` | nhân vật một mình (câu hỏi, kết) | `pose` idle\|think\|point\|cheer\|slump\|walk\|run, `ry` |
Thêm vật mới: viết hàm trong `PROPS` của `engine/meta3d.js` (trả `{g, focus, size, update(t)}`), chỉ dùng hình khối dựng sẵn của three.js — không tải mô hình ngoài, không vẽ nhân vật/biểu tượng có bản quyền.
Đan xen: 3D ~45–55% thời lượng; cảnh thật Pixabay cho ví dụ đời thường, cảm xúc, nơi chốn. Không đặt 3 cảnh 3D liền nhau mà không đổi góc máy. Cùng một prop dùng lại được (≤ 3 lần/video) với góc máy và vai trò khác.
