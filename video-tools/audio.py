import json, numpy as np
from scipy.io import wavfile

SR = 48000
LEN = 40.0
rng = np.random.default_rng(7)
mix = np.zeros((int(SR * LEN), 2), np.float32)
ev = json.load(open('events.json'))

def place(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(mix): return
    sig = sig[: len(mix) - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(sig), 0] += sig * gain * l * 1.414
    mix[i:i + len(sig), 1] += sig * gain * r * 1.414

def env(n, attack=0.002, release=None):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    return a * (np.exp(-t / release) if release else 1)

def lowpass(x, cutoff):
    # one-pole low-pass; cutoff may be an array
    cutoff = np.broadcast_to(cutoff, x.shape)
    y = np.zeros_like(x); acc = 0.0
    k = 1 - np.exp(-2 * np.pi * cutoff / SR)
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc); y[i] = acc
    return y

def click():
    n = int(0.05 * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.008)
    thump = np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.018)
    noise = rng.standard_normal(n) * np.exp(-t / 0.003) * 0.4
    return (tone * 0.5 + thump * 0.8 + noise) * 0.5

def pop():
    n = int(0.12 * SR); t = np.arange(n) / SR
    f = 320 + 900 * (1 - np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045) * env(n, 0.003)

def blip():
    n = int(0.09 * SR); t = np.arange(n) / SR
    f = np.where(t < 0.04, 880, 1320)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05) * env(n, 0.002)

def whoosh(dur=0.7):
    n = int(dur * SR); t = np.arange(n) / SR
    shape = np.sin(np.pi * t / dur) ** 2
    cut = 300 + 2600 * np.sin(np.pi * t / dur)
    return lowpass(rng.standard_normal(n).astype(np.float32), cut) * shape * 1.6

def charge(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 180 * (880 / 180) ** (t / dur) * (1 + 0.012 * np.sin(2 * np.pi * 9 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    return sig * (0.15 + 0.85 * (t / dur) ** 1.5) * env(n, 0.05) * 0.35

def zap():
    n = int(0.9 * SR); t = np.arange(n) / SR
    f = 150 + 2100 * np.exp(-t / 0.09)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.tanh(2.5 * np.sin(ph)) * np.exp(-t / 0.22)
    noise = lowpass(rng.standard_normal(n).astype(np.float32), 5000) * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.25)
    sig = body * 0.55 + noise * 0.5 + boom * 0.7
    out = sig.copy()
    for d, g in ((0.11, 0.35), (0.23, 0.18)):  # small echo
        k = int(d * SR); out[k:] += sig[:-k] * g
    return out * env(n, 0.002)

def pluck(freq, dur=1.1):
    # Karplus-Strong plucked string (ukulele-ish)
    n = int(dur * SR); period = int(SR / freq)
    buf = rng.uniform(-1, 1, period).astype(np.float32)
    out = np.zeros(n, np.float32)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = 0.996 * 0.5 * (buf[j] + buf[(j + 1) % period])
    return lowpass(out, 4200) * env(n, 0.001)

NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)

# hero clip: paper rustle, rip and "Hi!"
sr, hero = wavfile.read('hero.wav')
hero = hero.astype(np.float32) / 32768.0
hero_t = next(e['t'] for e in ev if e['type'] == 'hero')
i = int(hero_t * SR); mix[i:i + len(hero)] += hero[: len(mix) - i] * 1.15

# flower delivery clip: re-cut to the segments the site actually played
fsr, flow = wavfile.read('flowers.wav')
flow = flow.astype(np.float32) / 32768.0
segs, start = [], None
for e in ev:
    if e['type'] == 'fplay': start = e
    elif e['type'] == 'fpause' and start:
        segs.append((start['t'], start['ct'], e['ct'])); start = None
if start: segs.append((start['t'], start['ct'], start['ct'] + (LEN - start['t'])))
for t, c0, c1 in segs:
    piece = flow[int(c0 * SR): int(c1 * SR)].copy()
    n = min(len(piece), 400)
    piece[:n] *= np.linspace(0, 1, n)[:, None]; piece[-n:] *= np.linspace(1, 0, n)[:, None]
    i = int(t * SR); piece = piece[: len(mix) - i]
    # duck it as the camera leaves the section (scroll to the footer at ~37 s)
    tt = t + np.arange(len(piece)) / SR
    gain = np.clip(1 - (tt - 37.0) / 0.9, 0.12, 1)[:, None]
    mix[i:i + len(piece)] += piece * gain * 0.95

# title + outro chimes
for k, m in enumerate((67, 72, 76, 79)):
    place(pluck(NOTE(m)), 0.12 + k * 0.07, 0.32, pan=-0.3 + k * 0.2)
outro_t = next((e['t'] for e in ev if e['type'] == 'outro'), 38.5)
for k, m in enumerate((72, 76, 79, 84, 88)):
    place(pluck(NOTE(m), 1.6), outro_t + 0.05 + k * 0.08, 0.34, pan=-0.4 + k * 0.2)

# caption blips (caption appears ~0.18 s after it is queued)
for e in ev:
    if e['type'] == 'caption': place(blip(), e['t'] + 0.02, 0.16)

# interactions
charge_t = next(e['t'] for e in ev if e['type'] == 'charge')
zap_t = next(e['t'] for e in ev if e['type'] == 'zap')
for e in ev:
    if e['type'] == 'whoosh': place(whoosh(), e['t'] - 0.1, 0.22)
    if e['type'] == 'down' and not (charge_t - 0.05 <= e['t'] <= zap_t):
        place(click(), e['t'], 0.55, pan=0.15)
        place(pop(), e['t'] + 0.06, 0.28, pan=0.1)
place(click(), charge_t, 0.55, pan=0.15)
place(charge(zap_t - charge_t), charge_t, 1.0)
place(zap(), zap_t, 0.95)

# scroll whooshes (soft)
for t in (12.9, 17.2, 20.6, 24.3, 26.4):
    place(whoosh(0.9), t, 0.08)

# master: gentle limiter + fades
peak = np.max(np.abs(mix))
mix = np.tanh(mix / max(peak, 1e-6) * 1.15) * 0.89
fade = int(0.6 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
wavfile.write('mix.wav', SR, (mix * 32767).astype(np.int16))
print('peak before limit', round(float(peak), 3), 'hero at', hero_t, 'charge', charge_t, 'zap', zap_t)
