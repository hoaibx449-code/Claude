#!/usr/bin/env bash
# Cài phụ thuộc cho bộ dựng (chạy 1 lần mỗi phiên). Playwright + Chromium thường đã có sẵn trong môi trường Claude.
set -e
cd "$(dirname "$0")"
[ -d node_modules/three ] || npm install --silent
node -e "require('playwright')" 2>/dev/null || npm install --silent playwright
python3 -c "import PIL" 2>/dev/null || pip install --break-system-packages -q pillow
command -v ffmpeg >/dev/null || { echo "Thiếu ffmpeg"; exit 1; }
echo "Bộ dựng sẵn sàng."
