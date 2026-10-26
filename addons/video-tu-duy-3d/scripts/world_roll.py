#!/usr/bin/env python3
"""Rút "bộ gen" hình ảnh cho 1 video và chống trùng lặp bằng lịch sử.

  python world_roll.py roll   --topic "lạm phát lối sống" [--seed 7] [--out world.json]
  python world_roll.py check  --storyboard storyboard.json
  python world_roll.py commit --storyboard storyboard.json
  python world_roll.py list

history.json nằm cạnh thư mục data/ (đổi bằng --history).
"""
import argparse, json, random, re, sys, unicodedata
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
AVOID = {  # số video gần nhất cần né cho từng nhóm
    "environment": 12, "material": 6, "light": 4, "palette": 5,
    "camera": 3, "scene_type": 3, "script_frame": 1, "hook_type": 4,
}
GROUPS = list(AVOID)


def load(p, default):
    p = Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def norm_words(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    stop = {"va", "cua", "cho", "voi", "mot", "nhung", "the", "a", "of", "and", "in", "on", "with", "trong", "tren", "duoi", "la", "co"}
    return {w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 2 and w not in stop}


def jacc(a, b):
    a, b = norm_words(a), norm_words(b)
    return len(a & b) / max(1, len(a | b))


def cmd_roll(a):
    m = load(DATA / "matrix.json", {})
    hist = load(a.history, [])
    rng = random.Random(a.seed)
    world = {"topic": a.topic, "rolled_at": datetime.now().isoformat(timespec="seconds"), "seed": a.seed}
    for g in GROUPS:
        recent = {h.get("world", {}).get(g, {}).get("id") for h in hist[-AVOID[g]:]}
        pool = [x for x in m[g] if x["id"] not in recent] or m[g]
        world[g] = rng.choice(pool)
    # 2 kiểu máy quay phụ để mỗi video có ≥ 3 kiểu chuyển động
    extra = [c for c in m["camera"] if c["id"] != world["camera"]["id"]]
    world["camera_extra"] = rng.sample(extra, 2)
    ban = load(DATA / "ban_list.json", {})
    world["banned"] = ban.get("reference_channel", []) + ban.get("obvious_nouns", []) + ban.get("demo_trong_bo", []) + \
        [h.get("metaphor", "") for h in hist[-15:] if h.get("metaphor")]
    w = world
    world["style_line_en"] = (
        f"{w['environment']['en']}, objects made of {w['material']['en']}, {w['light']['en']}, "
        f"color palette {', '.join(w['palette']['colors'])}, minimalist stylized 3D render, soft volumetric haze, "
        f"cinematic shallow depth of field, no people faces, no text"
    )
    out = json.dumps(world, ensure_ascii=False, indent=2)
    if a.out:
        Path(a.out).write_text(out, encoding="utf-8")
    print(out)
    print("\n# Gợi ý: thế giới + chất liệu là KHUNG; vật ẩn dụ phải suy ra từ cơ chế (references/an_du_co_che.md).\n"
          "# Nếu tổ hợp không hợp cảm xúc chủ đề, roll lại với --seed khác hoặc đổi 1 nhóm và ghi lý do.", file=sys.stderr)


def similarity(sb, h):
    """0..10: độ giống giữa storyboard hiện tại và 1 video cũ."""
    w1, w2 = sb.get("world", {}), h.get("world", {})
    groups = [g for g in GROUPS if not (sb.get("series_world") and g in ("environment", "material", "light", "palette"))]
    same = sum(1 for g in groups if w1.get(g, {}).get("id") and w1.get(g, {}).get("id") == w2.get(g, {}).get("id"))
    score = same / len(groups) * 5
    score += jacc(sb.get("metaphor", ""), h.get("metaphor", "")) * 3
    score += jacc(sb.get("hook", ""), h.get("hook", "")) * 2
    return round(score, 1)


def cmd_check(a):
    sb = load(a.storyboard, None)
    if sb is None:
        sys.exit("Không đọc được storyboard")
    hist = load(a.history, [])
    rows = sorted(((similarity(sb, h), h) for h in hist), key=lambda x: -x[0])[:5]
    ban = load(DATA / "ban_list.json", {})
    hits = [b for b in ban.get("reference_channel", []) + ban.get("obvious_nouns", [])
            if jacc(sb.get("metaphor", "") + " " + sb.get("world", {}).get("environment", {}).get("vi", ""), b) >= 0.25]
    worst = rows[0][0] if rows else 0
    print(json.dumps({
        "diem_giong_cao_nhat": worst,
        "top_giong": [{"id": h.get("id"), "title": h.get("title"), "score": s} for s, h in rows],
        "trung_danh_sach_cam": hits,
        "ket_luan": "ĐẠT" if worst < 4 and not hits else "LÀM LẠI phần bị trùng (vật ẩn dụ / thế giới / hook)",
    }, ensure_ascii=False, indent=2))
    if worst >= 4 or hits:
        sys.exit(2)


def cmd_commit(a):
    sb = load(a.storyboard, None)
    hist = load(a.history, [])
    entry = {k: sb.get(k) for k in ("id", "title", "hook", "concepts", "metaphor", "script_frame")}
    entry["world"] = {g: {"id": sb.get("world", {}).get(g, {}).get("id")} for g in GROUPS}
    entry["committed_at"] = datetime.now().isoformat(timespec="seconds")
    hist.append(entry)
    Path(a.history).write_text(json.dumps(hist, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Đã ghi lịch sử: {entry['id']} — tổng {len(hist)} video")


def cmd_list(a):
    for h in load(a.history, []):
        print(f"{h.get('id')} | {h.get('title')} | {h.get('metaphor')} | {h.get('world', {}).get('environment', {}).get('id')}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["roll", "check", "commit", "list"])
    p.add_argument("--topic", default="")
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--out")
    p.add_argument("--storyboard")
    p.add_argument("--history", default=str(ROOT / "history.json"))
    a = p.parse_args()
    {"roll": cmd_roll, "check": cmd_check, "commit": cmd_commit, "list": cmd_list}[a.cmd](a)
