"""Background music, written by the program for each video, so there is never a licence question.

Moods: motivating (warm piano and a soft beat), calm (slow piano and pads), upbeat (plucks and a light
groove), emotional (slow minor-key piano). A user's own track can be used instead (--music file.mp3)."""
import math, subprocess, wave
import numpy as np

SR = 44100
MOODS = {
    # bpm, chords as MIDI roots with quality, beat on/off, base octave
    'motivating': (96, [(60, 'maj'), (67, 'maj'), (69, 'min'), (65, 'maj')], True),
    'calm': (72, [(62, 'min7'), (67, 'maj7'), (60, 'maj7'), (65, 'maj7')], False),
    'upbeat': (112, [(65, 'maj'), (67, 'maj'), (64, 'min'), (69, 'min')], True),
    'emotional': (70, [(57, 'min'), (65, 'maj'), (60, 'maj'), (67, 'maj')], False),
}
SHAPES = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10]}
hz = lambda m: 440 * 2 ** ((m - 69) / 12)


def piano(f, dur, vel=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    env = np.exp(-t * (2.2 + f / 900)) * (1 - np.exp(-t * 180))
    tone = sum(a * np.sin(2 * math.pi * f * k * t) for k, a in ((1, 1), (2, 0.42), (3, 0.18), (4, 0.08)))
    return vel * env * tone


def pad(f, dur, vel=0.12):
    n = int(dur * SR); t = np.arange(n) / SR
    env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6).clip(0)
    tone = sum(np.sin(2 * math.pi * f * d * t) for d in (1, 1.004, 0.996)) / 3
    return vel * env * tone


def kick(dur=0.35):
    t = np.arange(int(dur * SR)) / SR; f = 50 + 70 * np.exp(-t * 30)
    return 0.6 * np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def hat(dur=0.08):
    t = np.arange(int(dur * SR)) / SR; n = np.random.RandomState(4).randn(len(t))
    n = np.diff(n, prepend=0)  # brighter
    return 0.06 * n * np.exp(-t * 60)


def reverb(x, mix=0.22):
    ir_t = np.arange(int(1.6 * SR)) / SR; ir = np.random.RandomState(9).randn(len(ir_t)) * np.exp(-ir_t * 3.2)
    ir[0] = 0; ir = ir / np.abs(ir).sum() * 30
    m = 1 << int(math.ceil(math.log2(len(x) + len(ir))))  # FFT convolution: fast even for five minutes
    wet = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:len(x)]
    return x * (1 - mix) + wet * mix


def compose(seconds, mood='motivating', seed=0):
    bpm, prog, beat = MOODS.get(mood, MOODS['motivating']); beat_s = 60 / bpm; bar = beat_s * 4
    n = int((seconds + 2) * SR); out = np.zeros(n); rng = np.random.RandomState(seed)
    def put(sig, at):
        i = int(at * SR); j = min(n, i + len(sig))
        if i < n: out[i:j] += sig[:j - i]
    t = 0.0; k = 0
    while t < seconds + 1:
        root, q = prog[k % len(prog)]; notes = [root + s for s in SHAPES[q]]
        for m in notes: put(pad(hz(m - 12), bar), t)
        put(piano(hz(root - 24), bar, 0.35), t)
        # broken-chord piano: eighth notes up and down the chord, a little humanised
        pattern = notes + [notes[1] + 12, notes[2] + 12 if len(notes) > 2 else notes[0] + 12] + notes[::-1][:3]
        for e in range(8):
            if mood in ('calm', 'emotional') and e % 2: continue
            put(piano(hz(pattern[e % len(pattern)]), beat_s * 1.6, 0.16 + 0.05 * rng.rand()), t + e * beat_s / 2 + rng.rand() * 0.008)
        if beat and k >= 1:
            for b in range(4):
                if b in (0, 2): put(kick(), t + b * beat_s)
                put(hat(), t + b * beat_s + beat_s / 2)
        t += bar; k += 1
    out = reverb(out)
    fade = int(1.5 * SR); out[:fade] *= np.linspace(0, 1, fade); end = int(seconds * SR); out = out[:end + SR]
    out[end - fade:end] *= np.linspace(1, 0, fade); out[end:] = 0
    return out / (np.abs(out).max() + 1e-9) * 0.7


def write(seconds, path, mood='motivating', seed=0):
    x = (compose(seconds, mood, seed) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    return path
