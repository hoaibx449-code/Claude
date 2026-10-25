#!/usr/bin/env bash
# Faciup Ink Studio: cài máy dựng video lên một máy chủ Linux (Ubuntu 22.04+/Debian 12+).
#   curl -fsSL __SITE__/api/ink-setup.sh | sudo bash -s -- MÃ_KẾT_NỐI
# Mã kết nối tạo ở Quản trị → Ink Studio → Máy dựng → Thêm máy chủ. Chạy lại lệnh này bao nhiêu lần cũng được.
set -euo pipefail
SITE="__SITE__"; CODE="${1:-}"; NAME="${2:-$(hostname)}"
D=/opt/faciup-ink
say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng sudo (xem lệnh trong trang quản trị)."; exit 1; }
[[ "$CODE" =~ ^ink_[a-f0-9]{48}$ ]] || { echo "Thiếu hoặc sai mã kết nối. Tạo mã ở Quản trị → Ink Studio → Máy dựng."; exit 1; }
command -v apt-get >/dev/null || { echo "Bộ cài này dành cho Ubuntu/Debian."; exit 1; }

say "Cài FFmpeg, Python và công cụ cần thiết"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ffmpeg python3 python3-venv python3-pip curl ca-certificates tar nodejs npm >/dev/null

say "Tạo người dùng riêng cho máy dựng"
id faciup >/dev/null 2>&1 || useradd --system --create-home --home-dir "$D" --shell /usr/sbin/nologin faciup
install -d -o faciup -g faciup -m 750 "$D"

say "Lưu kết nối tới $SITE"
umask 077
cat > "$D/runner.env" <<ENV
NV_API_URL=$SITE
RUNNER_TOKEN=$CODE
INK_RUNNER_NAME=$NAME
INK_CACHE=$D/cache/voice
HF_HOME=$D/cache/huggingface
PLAYWRIGHT_BROWSERS_PATH=$D/browsers
ENV
chown faciup:faciup "$D/runner.env"

# update.sh: lấy bản máy dựng mới nhất từ trang mỗi lần khởi động (trang có bản mới thì máy dựng tự khởi động lại)
cat > "$D/update.sh" <<'UPD'
#!/usr/bin/env bash
set -euo pipefail
D=/opt/faciup-ink; set -a; . "$D/runner.env"; set +a
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if curl -fsS -m 120 -A faciup-ink-setup -H "authorization: Bearer $RUNNER_TOKEN" -D "$tmp/h" -o "$tmp/b.tgz" "$NV_API_URL/api/ink-runner/bundle"; then
  v=$(grep -i '^x-ink-version:' "$tmp/h" | tr -d '\r' | awk '{print $2}')
  if [ "$v" != "$(cat "$D/version" 2>/dev/null)" ] || [ ! -d "$D/app/ink" ]; then
    rm -rf "$D/app.new"; mkdir -p "$D/app.new"; tar -xzf "$tmp/b.tgz" -C "$D/app.new"
    [ -x "$D/venv/bin/python" ] || python3 -m venv "$D/venv"
    "$D/venv/bin/pip" install -q --upgrade pip
    "$D/venv/bin/pip" install -q -r "$D/app.new/requirements.txt"
    (cd "$D/app.new/hbx" && npm ci --no-audit --no-fund --silent) || echo "Chưa cài được thư viện cho kiểu Điện ảnh"
    rm -rf "$D/app"; mv "$D/app.new" "$D/app"; echo "$v" > "$D/version"
    echo "Đã cập nhật máy dựng lên bản $v"
  fi
else
  [ -d "$D/app/ink" ] || { echo "Không tải được máy dựng từ $NV_API_URL (kiểm tra mã kết nối)"; exit 1; }
  echo "Chưa cập nhật được, chạy bản đang có"
fi
echo "INK_VERSION=$(cat "$D/version" 2>/dev/null)" > "$D/version.env"
UPD
chmod 755 "$D/update.sh"; chown faciup:faciup "$D/update.sh"
install -d -o faciup -g faciup "$D/cache"

say "Tải máy dựng lần đầu (cài thư viện, khoảng 1–3 phút)"
sudo -u faciup "$D/update.sh"

say "Cài trình duyệt cho kiểu video Điện ảnh"
if PLAYWRIGHT_BROWSERS_PATH=$D/browsers "$D/venv/bin/python" -m playwright install --with-deps chromium >/dev/null; then chown -R faciup:faciup "$D/browsers"
else echo "Chưa cài được trình duyệt: kiểu Điện ảnh sẽ chưa dùng được trên máy này"; fi

say "Tạo dịch vụ chạy nền, tự bật lại khi máy khởi động"
cat > /etc/systemd/system/faciup-ink.service <<SVC
[Unit]
Description=Faciup Ink Studio - máy dựng video
After=network-online.target
Wants=network-online.target

[Service]
User=faciup
WorkingDirectory=$D/app
EnvironmentFile=$D/runner.env
ExecStartPre=$D/update.sh
ExecStart=/bin/bash -c 'set -a; . $D/version.env; exec $D/venv/bin/python -m ink.site --loop'
Restart=always
RestartSec=10
Nice=5

[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload
systemctl enable faciup-ink >/dev/null
systemctl restart faciup-ink
sleep 3
if systemctl is-active --quiet faciup-ink; then
  say "Xong! Máy dựng \"$NAME\" đang chạy và đã nối với $SITE"
  echo "  Xem nhật ký:   sudo journalctl -u faciup-ink -f"
  echo "  Khởi động lại: sudo systemctl restart faciup-ink"
  echo "  Gỡ bỏ:         sudo systemctl disable --now faciup-ink && sudo rm -rf $D /etc/systemd/system/faciup-ink.service"
else
  echo "Dịch vụ chưa chạy được. Xem lỗi: sudo journalctl -u faciup-ink -n 50"; exit 1
fi
