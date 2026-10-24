"""Sound effects, made by the program (no licence question): the marker scratching while the hand draws,
a soft pop when a picture lands, a whoosh when the scene slides away. They sit under the voice."""
import math, wave
import numpy as np

SR = 44100
R = np.random.RandomState(7)


def _band(x, lo, hi):
    """crude band-pass by FFT, enough for noise textures"""
    f = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR); f[(fr < lo) | (fr > hi)] = 0
    return np.fft.irfft(f, len(x))


def scratch(dur):
    """a felt marker on paper: band noise in short strokes"""
    n = max(1, int(dur * SR)); t = np.arange(n) / SR
    x = _band(R.randn(n), 1800, 7000)
    strokes = 0.55 + 0.45 * np.abs(np.sin(2 * math.pi * (3.2 + R.rand()) * t + R.rand() * 6))  # the pen moves in strokes
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.06).clip(0)
    x = x * strokes * env
    return 0.16 * x / (np.abs(x).max() + 1e-9)


def pop():
    t = np.arange(int(0.16 * SR)) / SR; f = 520 * np.exp(-t * 18) + 180
    return 0.22 * np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 26)


def whoosh(dur=0.32):
    n = int(dur * SR); t = np.arange(n) / SR
    x = _band(R.randn(n), 300, 3200); env = np.sin(math.pi * t / dur) ** 2
    return 0.18 * x * env / (np.abs(x).max() + 1e-9)


def track(seconds, events, path):
    """events: [(time, kind, duration)] with kind scratch | pop | whoosh; writes a mono wav"""
    out = np.zeros(int((seconds + 1) * SR))
    for at, kind, dur in events:
        sig = scratch(dur) if kind == 'scratch' else pop() if kind == 'pop' else whoosh()
        i = int(at * SR); j = min(len(out), i + len(sig))
        if 0 <= i < len(out): out[i:j] += sig[:j - i]
    out = np.clip(out, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
    return path
