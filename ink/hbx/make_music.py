#!/usr/bin/env python3
"""Tạo nhạc nền không bản quyền (tự tổng hợp bằng numpy) + hiệu ứng âm thanh.

Dùng:
  python make_music.py --duration 110 --mood tech --seed 20261020 --out music.wav
  python make_music.py --sfx --out-dir sfx/        # whoosh.wav, pop.wav, riser.wav, hit.wav

Mood: tech (điện tử nhẹ, 100bpm), finance (piano/pad ấm, 92bpm), alert (căng, 110bpm).
Seed theo ngày để mỗi video một giai điệu khác nhau nhưng tái lập được.
"""
import argparse, os, wave
import numpy as np

SR = 44100

PROGRESSIONS = {
    # các vòng hợp âm (bậc so với tông chủ, dạng [gốc, quãng 3, quãng 5, quãng 7])
    "tech":    [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 21]],   # i - VI - III - VII
    "finance": [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]],    # I - vi - IV - V
    "alert":   [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [7, 11, 14, 17]],    # i - iv - VI - V
    "bright":  [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 17]],   # I - IV - vi - V (trưởng, tươi)
    "calm":    [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [0, 4, 7, 14]],     # I - vi - IV - Iadd9 (ấm, chậm)
}
BPM = {"tech": 100, "finance": 92, "alert": 110, "bright": 112, "calm": 84}
# đặc tính từng mood: độ sáng (lọc), lượng trống, có snare/hi-hat 16 không, độ to arpeggio
CHAR = {
    "tech":    dict(lp=6000, kick=.32, snare=.06, hat=.025, hat16=False, arp=.05),
    "finance": dict(lp=4500, kick=.22, snare=.03, hat=.015, hat16=False, arp=.06),
    "alert":   dict(lp=6500, kick=.36, snare=.08, hat=.03, hat16=True, arp=.04),
    "bright":  dict(lp=7500, kick=.30, snare=.07, hat=.03, hat16=False, arp=.065),
    "calm":    dict(lp=3800, kick=.16, snare=0.0, hat=.012, hat16=False, arp=.07),
}


def write_wav(path, data):
    data = np.clip(data, -1, 1)
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    pcm = (data * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.ones(n) * s
    e[t < a] = t[t < a] / max(a, 1e-6)
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-6)
    rm = t > dur - r
    e[rm] *= np.clip((dur - t[rm]) / max(r, 1e-6), 0, 1)
    return e


def lowpass(x, alpha):
    # IIR một cực, đủ để làm mềm âm sắc
    y = np.empty_like(x)
    acc = 0.0
    for i in range(0, len(x), 4096):
        seg = x[i:i + 4096]
        out = np.empty_like(seg)
        for j, v in enumerate(seg):
            acc += alpha * (v - acc)
            out[j] = acc
        y[i:i + 4096] = out
    return y


def lowpass_fast(x, cutoff_hz):
    # lọc thông thấp bằng FFT (nhanh, đủ dùng cho nhạc nền)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (f / cutoff_hz) ** 4)
    if X.ndim == 2:
        H = H[:, None]
    return np.fft.irfft(X * H, n=len(x), axis=0)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def make_music(duration, mood, seed, bpm=None):
    rng = np.random.default_rng(seed)
    bpm = bpm or BPM.get(mood, 100)
    ch = CHAR.get(mood, CHAR["tech"])
    beat = 60 / bpm
    bar = beat * 4
    n = int(duration * SR)
    out = np.zeros((n, 2))
    root = 45 + int(rng.integers(0, 7))  # A2..D#3
    prog = PROGRESSIONS.get(mood, PROGRESSIONS["tech"])
    if rng.random() < 0.5:
        prog = prog[1:] + prog[:1]

    t_bar = np.arange(int(bar * SR)) / SR
    nbars = int(np.ceil(duration / bar))

    for b in range(nbars):
        chord = prog[b % len(prog)]
        start = int(b * bar * SR)
        seg_n = min(len(t_bar), n - start)
        if seg_n <= 0:
            break
        tt = t_bar[:seg_n]
        # pad: sóng răng cưa nhẹ, lệch tông trái/phải cho rộng âm trường
        pad_l = np.zeros(seg_n)
        pad_r = np.zeros(seg_n)
        for k, iv in enumerate(chord):
            f = midi_hz(root + 12 + iv)
            for det, arr in ((0.997, pad_l), (1.003, pad_r)):
                ph = 2 * np.pi * f * det * tt
                arr += 0.5 * np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
        e = env_adsr(seg_n, a=0.4, d=0.5, s=0.8, r=0.5)
        out[start:start + seg_n, 0] += 0.06 * pad_l * e
        out[start:start + seg_n, 1] += 0.06 * pad_r * e
        # bass theo phách
        for q in range(4):
            bs = start + int(q * beat * SR)
            bn = min(int(beat * 0.9 * SR), n - bs)
            if bn <= 0:
                continue
            tb = np.arange(bn) / SR
            fb = midi_hz(root + chord[0] - 12 + (7 if q == 3 and rng.random() < 0.4 else 0))
            bass = np.sin(2 * np.pi * fb * tb) + 0.3 * np.sin(4 * np.pi * fb * tb)
            out[bs:bs + bn] += (0.11 * bass * env_adsr(bn, 0.005, 0.15, 0.5, 0.1))[:, None]
        # arpeggio (pluck) nốt móc
        pattern = rng.permutation([0, 1, 2, 3, 2, 1, 3, 0])
        for s8 in range(8):
            if rng.random() < 0.25:
                continue
            ps = start + int(s8 * beat / 2 * SR)
            pn = min(int(beat / 2 * SR), n - ps)
            if pn <= 0:
                continue
            tp = np.arange(pn) / SR
            fp = midi_hz(root + 24 + chord[pattern[s8] % 4])
            pl = np.sin(2 * np.pi * fp * tp) * np.exp(-tp * 9)
            pan = 0.3 + 0.4 * (s8 % 2)
            out[ps:ps + pn, 0] += ch['arp'] * pl * (1 - pan)
            out[ps:ps + pn, 1] += ch['arp'] * pl * pan

    # trống: kick, snare (noise), hi-hat
    nbeats = int(duration / beat) + 1
    for i in range(nbeats):
        s = int(i * beat * SR)
        if s >= n:
            break
        # kick ở phách 1,3 (và thêm nhịp lấp)
        if i % 4 in (0, 2) or (i % 8 == 7 and rng.random() < 0.5):
            kn = min(int(0.35 * SR), n - s)
            tk = np.arange(kn) / SR
            f = 50 + 90 * np.exp(-tk * 30)
            kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 9)
            out[s:s + kn] += (ch['kick'] * kick)[:, None]
        if i % 4 in (1, 3) and ch['snare'] > 0:
            sn = min(int(0.2 * SR), n - s)
            noise = rng.standard_normal(sn) * np.exp(-np.arange(sn) / SR * 22)
            out[s:s + sn] += (ch['snare'] * noise)[:, None]
        for h in ((0, 0.25, 0.5, 0.75) if ch['hat16'] else (0, 0.5)):
            hs = s + int(h * beat * SR)
            hn = min(int(0.05 * SR), n - hs)
            if hn <= 0:
                continue
            hat = rng.standard_normal(hn)
            hat = np.diff(np.concatenate([[0], hat])) * np.exp(-np.arange(hn) / SR * 80)
            out[hs:hs + hn] += (ch['hat'] * hat)[:, None]

    out = lowpass_fast(out, ch['lp'])
    # fade in/out
    fi = int(1.0 * SR)
    fo = int(2.5 * SR)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    peak = np.max(np.abs(out)) + 1e-9
    return out / peak * 0.8


def make_sfx(out_dir, seed=7):
    rng = np.random.default_rng(seed)
    os.makedirs(out_dir, exist_ok=True)
    # whoosh: nhiễu lọc quét
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = np.zeros(n)
    X = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= np.exp(-((f - 1800) / 2500) ** 2) + 0.2
    sweep = np.fft.irfft(X, n=n)
    envw = np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 2
    L = sweep * envw * np.linspace(1.2, 0.3, n)
    R = sweep * envw * np.linspace(0.3, 1.2, n)
    w = np.stack([L, R], 1)
    write_wav(os.path.join(out_dir, "whoosh.wav"), w / np.max(np.abs(w)) * 0.7)
    # pop: bong bóng
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    fpop = 900 * np.exp(-t * 12) + 400
    pop = np.sin(2 * np.pi * np.cumsum(fpop) / SR) * np.exp(-t * 35)
    write_wav(os.path.join(out_dir, "pop.wav"), pop * 0.6)
    # riser
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    fr = 200 + 1400 * (t / 1.6) ** 2
    riser = np.sin(2 * np.pi * np.cumsum(fr) / SR) * 0.4 + rng.standard_normal(n) * 0.15 * (t / 1.6)
    riser *= (t / 1.6) ** 1.5
    write_wav(os.path.join(out_dir, "riser.wav"), riser / np.max(np.abs(riser)) * 0.55)
    # hit: cú đánh mạnh mở đầu
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    fk = 45 + 120 * np.exp(-t * 25)
    hit = np.sin(2 * np.pi * np.cumsum(fk) / SR) * np.exp(-t * 4)
    hit += rng.standard_normal(n) * np.exp(-t * 18) * 0.4
    write_wav(os.path.join(out_dir, "hit.wav"), hit / np.max(np.abs(hit)) * 0.8)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration", type=float, default=110)
    ap.add_argument("--mood", default="tech", choices=list(PROGRESSIONS))
    ap.add_argument("--bpm", type=int, default=0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="music.wav")
    ap.add_argument("--sfx", action="store_true")
    ap.add_argument("--out-dir", default="sfx")
    a = ap.parse_args()
    if a.sfx:
        make_sfx(a.out_dir)
        print("sfx ->", a.out_dir)
    else:
        write_wav(a.out, make_music(a.duration, a.mood, a.seed, a.bpm or None))
        print("music ->", a.out)
