// Chamber sounds, synthesised with the Web Audio API (no audio files): the Speaker's gavel and the voting chime.
// Off by default; the choice is kept in this browser only.

const KEY = "parlament.sound";
const EVENT = "parlament-sound";
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage blocked: the toggle still works for this page view
  }
  // Turning sound on is a click, so the audio context may start now.
  if (on) void audio()?.resume();
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeSound(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** One knock of the gavel: a short filtered noise burst on top of a low wooden thump. */
function knock(c: AudioContext, at: number): void {
  const thump = c.createOscillator();
  const thumpGain = c.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150, at);
  thump.frequency.exponentialRampToValueAtTime(55, at + 0.12);
  thumpGain.gain.setValueAtTime(0.9, at);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(at);
  thump.stop(at + 0.2);

  const len = Math.floor(c.sampleRate * 0.05);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const noiseGain = c.createGain();
  noise.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  noiseGain.gain.value = 0.6;
  noise.connect(filter).connect(noiseGain).connect(c.destination);
  noise.start(at);
}

export function gavel(times = 1): void {
  if (!soundEnabled()) return;
  const c = audio();
  if (!c) return;
  for (let i = 0; i < times; i++) knock(c, c.currentTime + 0.02 + i * 0.32);
}

/** The voting signal: two soft bell tones. */
export function chime(): void {
  if (!soundEnabled()) return;
  const c = audio();
  if (!c) return;
  [784, 622].forEach((freq, i) => {
    const at = c.currentTime + 0.02 + i * 0.35;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + 1.25);
  });
}
