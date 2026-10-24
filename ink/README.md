# Ink Studio — máy dựng video vẽ tay

Từ một chủ đề hoặc một kịch bản có sẵn, tạo video dọc 9:16 (tối đa 5 phút): bàn tay cầm bút vẽ dần từng hình
theo lời đọc EverAI, kèm ảnh bìa, caption và hashtag. Hình vẽ bằng code (không dùng AI tạo ảnh), nên chi phí
dựng gần như bằng 0; AI (OpenAI/Gemini) chỉ viết kịch bản và phân cảnh.

Lõi vẽ nét và bàn tay dựa trên gói `handdrawn-video-package`.

## Cấu trúc
- `ink/prompts/` — bộ prompt tiếng Việt: chiến lược → dàn ý → lời đọc → biên tập chấm điểm (chế độ chủ đề);
  chuẩn hoá giữ nguyên ý tác giả + góp ý (chế độ kịch bản); phân cảnh + ảnh bìa + caption (chung).
- `ink/ai.py` — OpenAI/Gemini theo thứ tự `INK_AI_ORDER`, mỗi bên có mô hình dự phòng.
- `ink/layouts.py` — các khuôn bố cục (phân cảnh là dữ liệu, không phải code).
- `ink/props.py` — kho hình vẽ bằng code và nhân vật.
- `ink/render.py` — vẽ nét, bàn tay, camera, chuyển cảnh, ghép giọng; `ink/cover.py` — ảnh bìa.

## Chạy
```bash
pip install -r requirements.txt   # cần thêm ffmpeg
python -m ink.cli --topic "Thói quen nhỏ thay đổi cuộc đời" --seconds 60 --out out
python -m ink.preview storyboard.json --out overview.png
```
Trên GitHub: tab Actions → "Ink Studio — dựng video vẽ tay" → Run workflow. Kết quả ở mục Artifacts.
Secrets cần: `GEMINI_API_KEY` và/hoặc `OPENAI_API_KEY`, `EVERAI_API_KEY`, `EVERAI_VOICE_CODE`.
Biến (Variables) tuỳ chọn: `INK_AI_ORDER` (vd `openai,gemini`), `INK_GEMINI_MODELS`, `INK_OPENAI_MODELS`.

## Nhịp video
`--pace slow | normal | fast | faster` (hoặc một hệ số, vd `1.15`): tốc độ đọc, thời gian vẽ mỗi cảnh và độ dài
chuyển cảnh cùng đổi theo, hình vẫn khớp từng chữ. Dựng lại một video đã có với nhịp khác, không gọi AI:
```bash
python -m ink.cli --from out --pace fast --out out-nhanh
```

## Chạy cho trang web
Trang web giữ hàng chờ (`web/src/ink.ts`); khi có video mới, nó gọi GitHub API chạy workflow
`.github/workflows/ink-runner.yml`. Máy dựng (`ink/site.py`) nhận lần lượt các video đang chờ, dựng xong gửi
video, ảnh bìa, bảng phân cảnh về trang rồi dừng. Khoá AI, giọng đọc và thứ tự ưu tiên lấy từ trang
Quản trị → Ink Studio và API & khoá, gửi kèm từng việc và được che trong nhật ký GitHub.
Cần: secrets `NV_API_URL`, `RUNNER_TOKEN` của repo; GitHub token (fine-grained, quyền Actions: Read and write
cho repo này) nhập ở Quản trị → Ink Studio.
