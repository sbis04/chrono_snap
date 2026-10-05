// Tiny WebAudio synth so the game needs no audio assets.
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("cs-muted") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("cs-muted", m ? "1" : "0");
  } catch {}
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(c: AudioContext, at: number, dur: number, freq: number, gain: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(at);
}

function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export const sfx = {
  /** Camera shutter: two clicks. */
  shutter() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    noiseBurst(c, t, 0.05, 3200, 0.9);
    noiseBurst(c, t + 0.07, 0.08, 1800, 0.7);
  },
  tick(urgent = false) {
    const c = ac();
    if (!c) return;
    tone(c, c.currentTime, urgent ? 1320 : 880, 0.06, 0.12, "square");
  },
  /** Split-flap clatter. */
  flaps(count = 14) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < count; i++) noiseBurst(c, t + i * 0.045 + Math.random() * 0.01, 0.025, 2400 + Math.random() * 1500, 0.35);
  },
  join() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 660, 0.15, 0.1, "triangle");
    tone(c, t + 0.09, 990, 0.2, 0.1, "triangle");
  },
  fanfare() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, 0.5, 0.12, "triangle"));
  },
  detent() {
    const c = ac();
    if (!c) return;
    tone(c, c.currentTime, 2200, 0.015, 0.05, "square");
  },
};
