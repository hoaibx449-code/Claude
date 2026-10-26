#!/usr/bin/env python3
"""Dựng MP4 9:16 hoàn chỉnh theo ngữ pháp thể loại.

Chế độ code3d (cảnh 3D đã render thành 1 file 16:9):
  python assemble.py --storyboard storyboard.json --timeline timeline.json --film film.mp4 \
      --voice voice.mp3 [--music music.mp3] --out video.mp4
Chế độ ai_clips (mỗi shot 1 clip AI: clips/S01.mp4, S02.mp4 … hoặc shot["clip"]):
  python assemble.py --storyboard storyboard.json --timeline timeline.json --clips clips/ \
      --voice voice.mp3 --out video.mp4
Thêm --preview để chỉ xuất 6 khung hình kiểm tra (preview.jpg), không mã hoá video.
"""
import argparse, json, os, re, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
FY, FH = 640, 608          # vùng phim 16:9
FPS = 30


# ---------- tiện ích ----------
def hex2rgba(h, a=255):
    h = h.lstrip("#")
    if len(h) == 8:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4, 6))
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def ass_color(h):
    r, g, b, a = hex2rgba(h)
    return f"&H{255 - a:02X}{b:02X}{g:02X}{r:02X}"


def font(path, size):
    return ImageFont.truetype(path, size)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:])
        raise SystemExit(f"Lỗi lệnh: {' '.join(map(str, cmd[:6]))}…")
    return r


def is_caps(w):
    core = re.sub(r"[^\w]", "", w)
    return len(core) > 1 and core.upper() == core and any(c.isalpha() for c in core)


def wrap(draw, words, f, maxw):
    lines, cur = [], []
    for w in words:
        t = " ".join(cur + [w])
        if cur and draw.textlength(t, font=f) > maxw:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


# ---------- nền: 2 dải + hook + CTA ----------
def make_background(sb, brand, path):
    img = Image.new("RGBA", (W, H), hex2rgba(brand["band_bg"]))
    d = ImageDraw.Draw(img)
    size = 60
    while True:
        f = font(brand["font_bold_file"], size)
        lines = wrap(d, sb["hook"].split(), f, 940)
        if len(lines) <= 3 or size <= 40:
            break
        size -= 4
    best = lines
    for mw in range(940, 560, -20):  # cân dòng: thu hẹp tới khi sắp tăng số dòng (tránh 1 chữ mồ côi)
        cand = wrap(d, sb["hook"].split(), f, mw)
        if len(cand) > len(lines):
            break
        best = cand
    lines = best
    lh = int(size * 1.25)
    y = FY - 56 - lh * len(lines)
    for ln in lines:
        x = (W - d.textlength(" ".join(ln), font=f)) / 2
        for w in ln:
            col = brand["hook_accent"] if is_caps(w) else brand["hook_color"]
            d.text((x, y), w, font=f, fill=hex2rgba(col))
            x += d.textlength(w + " ", font=f)
        y += lh
    cta = sb.get("bottom_cta") or brand.get("bottom_cta")
    if cta:
        f2 = font(brand["font_regular_file"], 40)
        for i, ln in enumerate(wrap(d, cta.split(), f2, 900)):
            t = " ".join(ln)
            d.text(((W - d.textlength(t, font=f2)) / 2, FY + FH + 70 + i * 52), t, font=f2, fill=hex2rgba(brand["hook_color"], 230))
    # Không vẽ tên kênh/watermark: TikTok đã hiện avatar + @tên kênh.
    img.save(path)


# ---------- thẻ chữ ----------
def card_box(d, xy, brand):
    d.rounded_rectangle(xy, radius=14, fill=hex2rgba(brand["card_bg"]))
    x0, y0, x1, y1 = xy
    d.rounded_rectangle((x0, y0 + 12, x0 + 6, y1 - 12), radius=3, fill=hex2rgba(brand["card_accent"]))


def render_overlay(ov, brand, path, check_state=None):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fb, fr, fi = brand["font_bold_file"], brand["font_regular_file"], brand.get("font_italic_file", brand["font_regular_file"])
    t = ov["type"]
    if t in ("concept", "source"):
        big = ov.get("en") or ov.get("author", "")
        small = ov.get("vi") or ov.get("work", "")
        f1, f2 = font(fb, 34 if t == "concept" else 26), font(fi if t == "source" else fr, 24 if t == "concept" else 21)
        wbox = max(d.textlength(big, font=f1), d.textlength(small, font=f2)) + 56
        hbox = 96 if t == "concept" else 82
        x0 = 30 if t == "concept" else W - 30 - wbox
        y0 = FY + 26
        card_box(d, (x0, y0, x0 + wbox, y0 + hbox), brand)
        d.text((x0 + 26, y0 + 14), big, font=f1, fill=hex2rgba(brand["card_text"]))
        d.text((x0 + 26, y0 + hbox - 38), small, font=f2, fill=hex2rgba(brand["card_accent"]))
    elif t == "bigtext":
        txt = ov["text"].upper()
        size = 150
        while size > 60:
            f = font(fb, size)
            lines = wrap(d, txt.split(), f, 960)
            if len(lines) <= 2:
                break
            size -= 10
        lh = int(size * 1.05)
        y = FY + (FH - lh * len(lines)) / 2 - 20
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sh)
        for i, ln in enumerate(lines):
            s = " ".join(ln)
            x = (W - d.textlength(s, font=f)) / 2
            ds.text((x + 4, y + i * lh + 6), s, font=f, fill=(0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
        for i, ln in enumerate(lines):
            s = " ".join(ln)
            x = (W - d.textlength(s, font=f)) / 2
            d.text((x, y + i * lh), s, font=f, fill=hex2rgba(brand["card_text"] if i == 0 else brand["card_accent"]))
    elif t == "quote":
        f = font(fb, 44)
        lines = wrap(d, ov["text"].split(), f, 820)
        lh = 58
        hbox = lh * len(lines) + 56
        y0 = FY + (FH - hbox) / 2 - 30
        d.rounded_rectangle((110, y0, W - 110, y0 + hbox), radius=18, fill=hex2rgba(brand["card_bg"]))
        for i, ln in enumerate(lines):
            s = " ".join(ln)
            d.text(((W - d.textlength(s, font=f)) / 2, y0 + 28 + i * lh), s, font=f,
                   fill=hex2rgba(brand["card_text"] if i == 0 else brand["card_accent"]))
    elif t == "checklist":
        items = ov["items"][:check_state]
        f = font(fr, 26)
        wbox = max(d.textlength(s, font=f) for s in ov["items"]) + 96
        y0 = FY + 24
        card_box(d, (30, y0, 30 + wbox, y0 + 24 + 44 * len(items)), brand)
        for i, s in enumerate(items):
            y = y0 + 14 + i * 44
            d.rounded_rectangle((56, y + 6, 80, y + 30), radius=5, outline=hex2rgba(brand["card_accent"]), width=3)
            d.line((61, y + 18, 67, y + 25, 76, y + 10), fill=hex2rgba(brand["card_accent"]), width=4)
            d.text((96, y + 2), s, font=f, fill=hex2rgba(brand["card_text"]))
    elif t == "cta":
        f = font(fb, 28)
        txt = ov["text"]
        wbox = d.textlength(txt, font=f) + 48
        x0, y0 = W - 30 - wbox, FY + 26
        d.rounded_rectangle((x0, y0, x0 + wbox, y0 + 54), radius=27, fill=hex2rgba(brand["card_accent"]))
        d.text((x0 + 24, y0 + 10), txt, font=f, fill=hex2rgba(brand["band_bg"]))
    img.save(path)


def plan_overlays(sb, tl, brand, tmp):
    """Trả về danh sách (png, start, end)."""
    out, n = [], 0
    shots = tl["shots"]
    for si, sh in enumerate(sb["shots"]):
        s0, s1 = shots[si]["start"], shots[si]["end"]
        for ov in sh.get("overlays", []):
            st = s0 + ov.get("delay", 0.15)
            if ov["type"] == "checklist":
                # mỗi mục hiện ở 1 shot: items_at = [chỉ số shot bắt đầu hiện mục i] (mặc định shot hiện tại + i)
                at = ov.get("items_at") or [si + i for i in range(len(ov["items"]))]
                end_all = shots[min(len(shots) - 1, ov.get("until_shot", len(shots) - 1))]["end"]
                for k in range(len(ov["items"])):
                    a = shots[min(at[k], len(shots) - 1)]["start"] + 0.1
                    b = shots[min(at[k + 1], len(shots) - 1)]["start"] + 0.1 if k + 1 < len(at) else end_all
                    p = tmp / f"ov{n:03d}.png"; n += 1
                    render_overlay(ov, brand, p, check_state=k + 1)
                    out.append((p, a, b))
                continue
            span = ov.get("shots", 1)
            en = shots[min(len(shots) - 1, si + span - 1)]["end"] - 0.05
            if "dur" in ov:
                en = min(tl["duration"], st + ov["dur"])
            p = tmp / f"ov{n:03d}.png"; n += 1
            render_overlay(ov, brand, p)
            out.append((p, st, en))
    return out


# ---------- phụ đề karaoke ----------
def fmt(t):
    t = max(0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def make_ass(sb, tl, brand, path):
    fam = brand.get("font_bold", "Inter ExtraBold")
    hi = ass_color(brand["sub_highlight"])
    base = ass_color(brand["sub_color"])
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: VI,{fam},46,{base},{base},&H96000000,&H00000000,1,0,0,0,100,100,1,0,1,2.2,1.5,2,40,40,0,1
Style: EN,{brand.get('font_regular', 'Inter Medium')},24,&H3CFFFFFF,&H3CFFFFFF,&H96000000,&H00000000,0,1,0,0,100,100,0,0,1,1.2,0.8,2,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    words = tl["words"]
    maxw = int(brand.get("sub_words", 4))
    y_vi = FY + FH - (64 if brand.get("sub_english", True) else 40)
    chunks, cur = [], []
    for i, w in enumerate(words):
        if cur and (words[cur[-1]]["shot"] != w["shot"] or len(cur) >= maxw):
            chunks.append(cur); cur = []
        cur.append(i)
        if re.search(r"[.,!?;:…]$", w["w"]):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    for ci, ch in enumerate(chunks):
        end_chunk = words[chunks[ci + 1][0]]["start"] if ci + 1 < len(chunks) else tl["duration"]
        end_chunk = min(end_chunk, words[ch[-1]]["end"] + 0.6)
        for k, wi in enumerate(ch):
            st = words[wi]["start"]
            en = words[ch[k + 1]]["start"] if k + 1 < len(ch) else end_chunk
            parts = []
            for kk, wj in enumerate(ch):
                txt = words[wj]["w"].upper().replace("{", "(").replace("}", ")")
                on = (kk == k) if brand.get("sub_mode") == "color" else (kk <= k)
                parts.append(("{\\c" + hi + "}" + txt + "{\\c" + base + "}") if on else txt)
            ev.append(f"Dialogue: 1,{fmt(st)},{fmt(en)},VI,,0,0,0,,{{\\pos(540,{y_vi})}}" + " ".join(parts))
    if brand.get("sub_english", True):
        for si, sh in enumerate(sb["shots"]):
            if sh.get("en"):
                s = tl["shots"][si]
                ev.append(f"Dialogue: 0,{fmt(s['start'])},{fmt(s['end'])},EN,,0,0,0,,{{\\pos(540,{FY + FH - 26})}}{sh['en']}")
    Path(path).write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


# ---------- vùng phim ----------
def film_from_clips(sb, tl, clips_dir, tmp):
    parts = []
    for si, sh in enumerate(sb["shots"]):
        s = tl["shots"][si]
        dur = round(s["end"] - s["start"], 3)
        src = Path(sh.get("clip") or Path(clips_dir) / f"{sh['id']}.mp4")
        if not src.exists():
            raise SystemExit(f"Thiếu clip cho {sh['id']}: {src}")
        cd = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)]).stdout)
        slow = min(1.5, max(1.0, dur / cd))  # chậm tối đa 1.5x, thiếu nữa thì giữ khung cuối
        out = tmp / f"part{si:03d}.mp4"
        vf = (f"setpts={slow}*PTS,scale={W}:{FH}:force_original_aspect_ratio=increase,crop={W}:{FH},"
              f"tpad=stop_mode=clone:stop_duration={dur},fps={FPS},trim=duration={dur},setsar=1")
        run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        parts.append(out)
    lst = tmp / "parts.txt"
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    film = tmp / "film_clips.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(film)])
    return film


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--storyboard", required=True)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--film")
    ap.add_argument("--clips")
    ap.add_argument("--voice", required=True)
    ap.add_argument("--music")
    ap.add_argument("--music_db", type=float, default=-22)
    ap.add_argument("--brand", default=str(ROOT / "brand.json"))
    ap.add_argument("--out", default="video.mp4")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    sb = json.loads(Path(a.storyboard).read_text(encoding="utf-8"))
    tl = json.loads(Path(a.timeline).read_text(encoding="utf-8"))
    brand = json.loads(Path(a.brand).read_text(encoding="utf-8"))
    tmp = Path(tempfile.mkdtemp(prefix="asm_"))
    dur = tl["duration"]

    film = Path(a.film) if a.film else film_from_clips(sb, tl, a.clips, tmp)
    bg = tmp / "bg.png"
    make_background(sb, brand, bg)
    ovs = plan_overlays(sb, tl, brand, tmp)
    ass = tmp / "subs.ass"
    make_ass(sb, tl, brand, ass)
    fontsdir = str(Path(brand["font_bold_file"]).parent)

    inputs = ["-loop", "1", "-framerate", str(FPS), "-t", str(dur), "-i", str(bg),
              "-stream_loop", "-1", "-i", str(film)]
    for p, s, e in ovs:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", str(round(e - s, 3)), "-i", str(p)]
    vi = 2 + len(ovs)
    inputs += ["-i", a.voice]
    if a.music:
        inputs += ["-stream_loop", "-1", "-i", a.music]

    fc = [f"[1:v]scale={W}:{FH}:force_original_aspect_ratio=increase,crop={W}:{FH},fps={FPS},setsar=1,trim=duration={dur},setpts=PTS-STARTPTS[film]",
          f"[0:v][film]overlay=0:{FY}:shortest=0[v0]"]
    last = "v0"
    for i, (p, s, e) in enumerate(ovs):
        fd = min(0.25, (e - s) / 3)
        fc.append(f"[{2 + i}:v]format=rgba,fade=in:st=0:d={fd:.2f}:alpha=1,fade=out:st={max(0, e - s - fd):.2f}:d={fd:.2f}:alpha=1,"
                  f"setpts=PTS-STARTPTS+{s:.3f}/TB[o{i}]")
        fc.append(f"[{last}][o{i}]overlay=0:0:eof_action=pass[v{i + 1}]")
        last = f"v{i + 1}"
    ass_esc = str(ass).replace(":", "\\:")
    fc.append(f"[{last}]ass='{ass_esc}':fontsdir='{fontsdir}',format=yuv420p[vout]")
    if a.music:
        fc.append(f"[{vi + 1}:a]volume={a.music_db}dB,afade=t=out:st={max(0, dur - 2):.2f}:d=2[mus]")
        fc.append(f"[{vi}:a][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]")
    else:
        fc.append(f"[{vi}:a]anull[aout]")

    out = str(tmp / "draft.mp4") if a.preview else a.out
    q = ["-preset", "ultrafast", "-crf", "32"] if a.preview else ["-preset", "veryfast", "-crf", "20"]
    run(["ffmpeg", "-y", "-v", "error"] + inputs + ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
         "-t", str(dur), "-r", str(FPS), "-c:v", "libx264"] + q + ["-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out])
    if a.preview:
        times = [round(dur * k / 9, 2) for k in range(1, 9)]
        sel = "+".join(f"between(t,{t},{t + 0.034})" for t in times)
        pv = Path(a.out).with_name("preview.jpg")
        run(["ffmpeg", "-y", "-v", "error", "-i", out, "-vf", f"select='{sel}',scale=270:-1,tile=8x1", "-frames:v", "1", str(pv)])
        print("preview:", pv, "— khung tại", times)
    shutil.rmtree(tmp, ignore_errors=True)
    if not a.preview:
        print(f"Xong: {a.out} ({dur:.1f}s, {len(ovs)} thẻ chữ)")


if __name__ == "__main__":
    main()
