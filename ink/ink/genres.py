"""Kinds of video and how each is built: a knowledge video answers its question, a how-to teaches steps, only a
motivation video ends with a small action for today. The strategy step picks the kind from the user's topic."""

GENRES = {
    'giai_thich': ('Giải thích kiến thức', """- hook: một câu hỏi hay hiện tượng gây tò mò, hoặc một sự thật bất ngờ về chủ đề (không lộ đáp án). Hook phải ĐÚNG sự thật: không phủ nhận điều đúng chỉ để gây sốc (sai: "hoàng hôn thực ra không đỏ").
- setup: điều ai cũng từng thấy/nghe nhưng ít ai hiểu vì sao; nêu rõ câu hỏi video sẽ trả lời.
- points: giải thích theo chuỗi nhân quả, từng bước một, mỗi bước một hình ảnh so sánh đời thường dễ hình dung ("tưởng tượng…", "giống như…"); kiến thức phải CHÍNH XÁC, đúng khoa học; có một khoảnh khắc "à, ra thế".
- turn: một chi tiết thú vị hơn nữa hoặc hệ quả bất ngờ ít ai biết, giữ người xem tới cuối.
- close: tóm lại câu trả lời trong một câu dễ nhớ, rồi một câu đố hay câu hỏi kiến thức liên quan để người xem bình luận.
- KHÔNG có "nỗi đau", KHÔNG khuyên sống, KHÔNG "hành động làm ngay hôm nay", KHÔNG gán bài học cuộc sống.""",
                   'tóm lại câu trả lời trong một câu dễ nhớ + một câu đố/câu hỏi kiến thức liên quan để bình luận (không khuyên sống, không bài học gượng ép).'),
    'huong_dan': ('Hướng dẫn, mẹo', """- hook: kết quả người xem sẽ có, hoặc sai lầm phổ biến khi làm việc này.
- setup: vì sao cách làm thường gặp không hiệu quả (ngắn).
- points: các bước đánh số rõ ràng, mỗi bước cụ thể, đo lường được (bao nhiêu, bao lâu, dùng gì), kèm mẹo nhỏ hoặc cảnh báo.
- turn: mẹo quan trọng nhất hay bước hay bị bỏ qua, để ở gần cuối.
- close: nhắc lại các bước trong một câu, mời làm thử ngay bước 1 và hỏi kết quả.""",
                  'nhắc gọn các bước + mời làm thử bước đầu tiên ngay + hỏi người xem kết quả hoặc bước họ hay quên.'),
    'dong_luc': ('Truyền động lực, phát triển bản thân', """- hook: tuyên bố ngược đời hoặc chỉ ra điều người xem đang làm sai mà không biết.
- setup: tình huống đời thường làm người xem thấy "đúng là mình".
- points: góc nhìn mới, có ví dụ/so sánh/con số cụ thể, không sáo rỗng.
- turn: điều thay đổi mọi thứ, mở vòng tò mò.
- close: một câu đáng nhớ + một hành động nhỏ làm được ngay hôm nay + câu hỏi cụ thể.""",
                 'một câu đáng nhớ + một hành động nhỏ làm được ngay hôm nay + một câu hỏi cụ thể.'),
    'ke_chuyen': ('Kể chuyện', """- hook: bắt đầu ngay giữa khoảnh khắc kịch tính nhất hoặc một chi tiết lạ.
- setup: bối cảnh ngắn gọn: ai, ở đâu, khi nào.
- points: diễn biến với xung đột tăng dần, chi tiết cụ thể, có thời gian, con số.
- turn: bước ngoặt bất ngờ.
- close: kết cục và điều câu chuyện cho thấy (nói tự nhiên, không giảng đạo), câu hỏi gợi suy nghĩ.""",
                  'kết cục câu chuyện + điều nó cho thấy (không giảng đạo) + câu hỏi gợi suy nghĩ.'),
    'danh_sach': ('Danh sách, so sánh, review', """- hook: điều bất ngờ nhất trong danh sách hoặc kết quả so sánh gây tranh luận.
- setup: tiêu chí chọn/so sánh trong một câu.
- points: từng mục được đánh số, mỗi mục một điểm nổi bật cụ thể (số liệu, ví dụ).
- turn: mục bất ngờ hoặc đáng giá nhất để cuối.
- close: tóm lại nên chọn gì cho ai, hỏi người xem chọn mục nào.""",
                  'tóm lại nên chọn gì cho ai + hỏi người xem chọn mục nào.'),
    'phan_tich': ('Tin tức, phân tích', """- hook: sự kiện hoặc con số đáng chú ý nhất.
- setup: chuyện gì đang xảy ra, ngắn gọn, trung lập.
- points: vì sao nó xảy ra, các bên liên quan, số liệu, ảnh hưởng tới người xem bình thường.
- turn: điều ít ai để ý hoặc điều có thể xảy ra tiếp theo.
- close: tóm lại ý nghĩa với người xem, hỏi họ nhìn nhận thế nào.""",
                  'tóm lại ý nghĩa với người xem + hỏi quan điểm của họ một cách cụ thể.'),
}


def genre_of(strategy):
    g = str((strategy or {}).get('genre', '')).strip().lower()
    return g if g in GENRES else 'giai_thich' if any(w in str((strategy or {}).get('core_message', '')).lower() for w in ('vì sao', 'tại sao', 'là gì')) else 'dong_luc'


def genre_text(g):
    name, structure, ending = GENRES[g]
    return {'genre': f'{g} ({name})', 'structure': structure, 'ending': ending}
