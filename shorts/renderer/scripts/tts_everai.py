#!/usr/bin/env python3
"""Tạo giọng đọc bằng EverAI API -> voice.mp3 + voice.srt

  python tts_everai.py --config everai.json --text narration.txt --outdir work/

API (help.everai.vn/api-docs): POST https://www.everai.vn/api/v1/tts (Bearer key, generate_srt=true)
-> request_id; GET /api/v1/tts/{request_id} tới khi status=done -> tải audio_link, srt_link.
Môi trường Claude chặn mạng mặc định: cần thêm tên miền www.everai.vn (và everai.vn) vào danh sách được phép.
"""
import argparse, json, os, sys, time, urllib.error, urllib.request
from urllib.parse import urlparse
from pathlib import Path

BASE = os.environ.get("EVERAI_BASE", "https://www.everai.vn")


def call(method, url, key, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"EverAI trả lỗi HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:500]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SystemExit(f"KHÔNG KẾT NỐI ĐƯỢC EverAI ({e}). Nếu đang chạy trong môi trường Claude: "
                         "thêm www.everai.vn và everai.vn vào danh sách tên miền được phép (network allowlist) rồi chạy lại.")


def download(url, path, key):
    # link có chữ ký (S3/R2 presigned) không được kèm Authorization; chỉ gửi khoá khi tải từ chính everai.vn
    host = urlparse(url).hostname
    if urlparse(url).scheme != 'https':
        raise SystemExit('Chỉ tải giọng qua HTTPS')
    hdr = {"Authorization": f"Bearer {key}"} if host in {'everai.vn', 'www.everai.vn'} else {}
    req = urllib.request.Request(url, headers=hdr)
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--text", required=True, help="file narration.txt")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--timeout", type=int, default=900, help="giây chờ tối đa")
    ap.add_argument("--resume", help="request_id đã tạo: chỉ chờ + tải, không tạo mới (không tốn ký tự)")
    a = ap.parse_args()
    cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
    key = (os.environ.get('EVERAI_API_KEY') or cfg.get('api_key', '')).strip()
    voice = (os.environ.get('EVERAI_VOICE_CODE') or cfg.get('voice_code', '')).strip()
    if not key or not voice:
        raise SystemExit("everai.json thiếu api_key hoặc voice_code")
    text = Path(a.text).read_text(encoding="utf-8").strip()
    out = Path(a.outdir); out.mkdir(parents=True, exist_ok=True)

    body = {"input_text": text, "voice_code": voice, "generate_srt": True, "response_type": "indirect",
            "audio_type": cfg.get("audio_type", "mp3"), "bitrate": cfg.get("bitrate", 128),
            "speed_rate": round(float(cfg.get("speed_rate", 1.0)), 1), "pitch_rate": round(float(cfg.get("pitch_rate", 1.0)), 1),
            "volume": int(cfg.get("volume", 100))}
    if cfg.get("model_id"):
        body["model_id"] = cfg["model_id"]
    if a.resume:
        rid = a.resume
    else:
        r = call("POST", f"{BASE}/api/v1/tts", key, body)
        if r.get("status") != 1:
            raise SystemExit(f"EverAI từ chối: {r.get('error_code')} {r.get('error_message')}")
        rid = r["result"]["request_id"]
        print(f"Đã gửi: request_id={rid}, {r['result'].get('characters')} ký tự", flush=True)
        (out / "everai_request.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")

    t0, res = time.time(), {}
    first = True
    while time.time() - t0 < a.timeout:
        if not first:
            time.sleep(4)
        first = False
        g = call("GET", f"{BASE}/api/v1/tts/{rid}", key)
        if g.get("status") != 1:
            raise SystemExit(f"EverAI lỗi khi kiểm tra: {g.get('error_code')} {g.get('error_message')}")
        res = g["result"]
        st = str(res.get("status", "")).lower()
        print(f"  trạng thái {st} {res.get('progress', '')}%", flush=True)
        if res.get("audio_link") and (st in ("done", "success", "completed", "hoàn thành") or float(res.get("progress") or 0) >= 100):
            break
        if st in ("failure", "failed", "error"):
            raise SystemExit(f"EverAI tạo giọng thất bại: {res}")
    else:
        raise SystemExit(f"Hết {a.timeout}s chưa xong — chạy lại sau với request_id {rid}")

    ext = cfg.get("audio_type", "mp3")
    try:
        download(res["audio_link"], out / f"voice.{ext}", key)
    except (urllib.error.URLError, OSError) as e:
        host = res["audio_link"].split("/")[2]
        raise SystemExit(f"Giọng đã tạo xong (request_id {rid}) nhưng KHÔNG TẢI ĐƯỢC file từ {host} ({e}). "
                         f"Thêm tên miền này vào danh sách được phép rồi chạy lại với --resume {rid}")
    if res.get("srt_link"):
        download(res["srt_link"], out / "voice.srt", key)
    else:
        print("Cảnh báo: không có srt_link — timeline.py sẽ ước lượng thời gian theo độ dài chữ")
    print(f"Xong: {out / ('voice.' + ext)}" + (" + voice.srt" if res.get("srt_link") else ""))


if __name__ == "__main__":
    main()
