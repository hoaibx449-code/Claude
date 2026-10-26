# storyboard.json — schema

```jsonc
{
  "id": "TD3D-YYYYMMDD-NN",              // duy nhất
  "title": "Tiêu đề nội bộ",
  "hook": "Câu dải trên, IN HOA 1–3 từ khoá", // từ viết hoa toàn bộ được tô brand.hook_accent
  "bottom_cta": "",                       // tuỳ chọn, câu cố định ở dải dưới
  "concepts": ["Lifestyle creep"],
  "mechanism": ["động từ 1", "động từ 2", "động từ 3"],
  "metaphor": "1 câu: vật chính + chuyển động + lối ra",   // dùng để chống trùng
  "script_frame": "awakening|daily_math|myth_break|list_traps|story_case|one_concept",
  "levers": ["A1", "B4", "C1"],
  "world": { /* dán nguyên world.json do world_roll.py tạo (bỏ "banned") */ },
  "render_mode": "code3d | ai_clips",
  "sources": [{ "name": "Tác giả — tác phẩm (năm)", "url": "https://…" }],
  "shots": [
    {
      "id": "S01",
      "say": "Đúng 1 câu lời đọc (ghép tất cả say = toàn bộ lời đọc gửi TTS)",
      "en": "Bản dịch tiếng Anh ngắn (hiện dưới phụ đề nếu brand.sub_english)",
      "camera": "lateral_track|follow|orbit|top_down|macro|push_in|crane_reveal|handheld_doc|dolly_zoom",
      "visual": "Trạng thái ẩn dụ ở shot này",
      "ai_prompt": "Chỉ với ai_clips — prompt theo P5",
      "clip": "đường dẫn clip (tuỳ chọn; mặc định clips/<id>.mp4)",
      "overlays": [
        { "type": "concept", "en": "Lifestyle Creep", "vi": "Lạm phát lối sống", "shots": 2 },
        { "type": "source", "author": "C. N. Parkinson · 1955", "work": "The Economist" },
        { "type": "bigtext", "text": "Vẫn là số 0", "delay": 1.2 },
        { "type": "checklist", "items": ["Bước 1", "Bước 2", "Bước 3"], "items_at": [10, 11, 12], "until_shot": 13 },
        { "type": "quote", "text": "Câu chốt ≤ 12 từ" },
        { "type": "cta", "text": "Lưu lại để làm tối nay" }
      ]
    }
  ],
  "caption": "…", "hashtags": ["#…"]
}
```

Thời gian overlay: bắt đầu tại đầu shot + `delay` (mặc định 0,15 s); kết thúc sau `shots` shot (mặc định 1) hoặc sau `dur` giây.
Checklist: mục i hiện ở đầu shot `items_at[i]` (chỉ số shot, đếm từ 0), giữ tới hết shot `until_shot`.
