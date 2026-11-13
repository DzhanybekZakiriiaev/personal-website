import { getSoundState } from './sound';

/*
 * Button sounds: soft felt pops and woody plucks, made with Web Audio (original
 * sounds, no files). Every link and button gets one through a single listener on the
 * page (initUiSounds): a pop on press, a quiet tick on hover (mouse only), and a
 * named sound where an element (or an ancestor) has data-sound="start" | "back" |
 * "open" | "toggle" | "press"; data-no-sound turns it off for that element. They
 * follow the sound stitch (on/off and volume, src/lib/sound.ts).
 *
 * To use recorded sounds instead, drop files named after the sounds (press.mp3,
 * hover.ogg, back.wav, ...) into src/assets/audio/ui/: a file wins over the
 * generated sound of the same name.
 */

export type UiSound = 'hover' | 'press' | 'open' | 'back' | 'start' | 'toggle';

const FILES = import.meta.glob<string>('../assets/audio/ui/*.{mp3,ogg,wav,m4a,opus}', { eager: true, query: '?url', import: 'default' });
const FILE_FOR: Partial<Record<UiSound, string>> = {};
for (const [path, url] of Object.entries(FILES)) {
  const name = path.split('/').pop()?.replace(/\.[^.]+$/, '') as UiSound | undefined;
  if (name) FILE_FOR[name] = url;
}

/** Effects sit a little under the music. */
const SFX_LEVEL = 0.7;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const buffers = new Map<UiSound, Promise<AudioBuffer | null>>();

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function envelope(c: AudioContext, t0: number, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(master as GainNode);
  return g;
}

/** A pitch-dropping blip: the "pop" of a felt button. */
function blip(c: AudioContext, t0: number, from: number, to: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.7);
  o.connect(envelope(c, t0, peak, 0.004, dur));
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** A soft wooden pluck (fundamental plus a quick bright partial), like a toy marimba. */
function pluck(c: AudioContext, t0: number, freq: number, dur: number, peak: number) {
  for (const [mult, level, len] of [
    [1, 1, 1],
    [4, 0.22, 0.3],
  ] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * mult, t0);
    o.connect(envelope(c, t0, peak * level, 0.003, dur * len));
    o.start(t0);
    o.stop(t0 + dur * len + 0.05);
  }
}

/** A short filtered noise tap: the felt being pressed. */
function tap(c: AudioContext, t0: number, freq: number, dur: number, peak: number) {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = 1.1;
  src.connect(band).connect(envelope(c, t0, peak, 0.002, dur));
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const SYNTH: Record<UiSound, (c: AudioContext, t: number) => void> = {
  hover: (c, t) => blip(c, t, 1500, 1150, 0.05, 0.05),
  press: (c, t) => {
    tap(c, t, 1700, 0.035, 0.22);
    blip(c, t, 620, 300, 0.12, 0.32);
  },
  toggle: (c, t) => {
    tap(c, t, 2200, 0.03, 0.18);
    blip(c, t, 880, 520, 0.08, 0.22, 'triangle');
  },
  open: (c, t) => {
    tap(c, t, 1600, 0.03, 0.18);
    pluck(c, t, 523.25, 0.22, 0.28);
    pluck(c, t + 0.07, 783.99, 0.32, 0.28);
  },
  back: (c, t) => {
    tap(c, t, 1300, 0.03, 0.18);
    pluck(c, t, 659.25, 0.2, 0.26);
    pluck(c, t + 0.07, 440, 0.3, 0.26);
  },
  start: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => pluck(c, t + i * 0.065, f, 0.28 + i * 0.04, 0.24));
  },
};

function loadFile(c: AudioContext, name: UiSound): Promise<AudioBuffer | null> {
  let hit = buffers.get(name);
  if (!hit) {
    const url = FILE_FOR[name] as string;
    hit = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, hit);
  }
  return hit;
}

/** Plays one button sound (if sound is on). */
export function playUiSound(name: UiSound): void {
  const { on, volume } = getSoundState();
  if (!on || volume <= 0 || typeof window === 'undefined') return;
  const c = audio();
  if (!c || !master) return;
  master.gain.setValueAtTime(volume * SFX_LEVEL, c.currentTime);
  if (FILE_FOR[name]) {
    void loadFile(c, name).then((buffer) => {
      if (!buffer || !master) return;
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(master);
      src.start();
    });
    return;
  }
  SYNTH[name](c, c.currentTime + 0.005);
}

const INTERACTIVE = 'a[href], button, [role="button"], summary';
const NAMES = new Set<UiSound>(['hover', 'press', 'open', 'back', 'start', 'toggle']);

function soundFor(el: Element): UiSound | null {
  if (el.closest('[data-no-sound]')) return null;
  const named = el.closest('[data-sound]')?.getAttribute('data-sound');
  return named && NAMES.has(named as UiSound) ? (named as UiSound) : 'press';
}

let installed = false;

/** Gives every link and button its sounds (call once, at page open). */
export function initUiSounds(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  let hovered: Element | null = null;
  let lastHoverAt = 0;

  document.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const name = soundFor(el);
      if (name) playUiSound(name);
    },
    true,
  );

  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      if (el === hovered) return;
      hovered = el;
      const now = performance.now();
      if (!el || el.closest('[inert]') || now - lastHoverAt < 70 || !soundFor(el)) return;
      lastHoverAt = now;
      playUiSound('hover');
    },
    true,
  );

  // Letting go of the volume slider: a tick at the new level.
  document.addEventListener(
    'change',
    (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'range' && e.target.closest('[data-sound-control]')) {
        playUiSound('hover');
      }
    },
    true,
  );
}
