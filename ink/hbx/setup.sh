#!/usr/bin/env bash
# Cài phụ thuộc cho phiên mới (~1 phút). rembg chỉ cần cho format paper.
set -e
cd "$(dirname "$0")"
npm ci --silent --no-audit --no-fund
python3 -c "import playwright, numpy, PIL" 2>/dev/null || pip install --break-system-packages -q playwright numpy pillow
# format cine: ảnh 2.5D cần onnxruntime + opencv (mô hình MiDaS tự tải từ GitHub lần đầu)
python3 -c "import onnxruntime, cv2" 2>/dev/null || pip install --break-system-packages -q onnxruntime opencv-python-headless
if [ "${1:-}" = "--paper" ]; then python3 -c "import rembg" 2>/dev/null || pip install --break-system-packages -q "rembg[cpu]" scipy; fi
echo "engine sẵn sàng"
