import { useSyncExternalStore } from 'react';

/*
 * Background music. The theme (the first audio file in src/assets/audio/) loops once
 * the loading screen is done; browsers that block sound until the visitor interacts
 * start it on the first click or tap instead. It pauses while the tab is hidden. On/off
 * and volume are shared by every sound stitch (SoundStitch.tsx) and remembered for
 * the next visit, and the button sounds (src/lib/uiSounds.ts) follow them too. With no
 * audio file in that folder there is simply no music.
 */

const TRACKS = import.meta.glob<string>('../assets/audio/*.{mp3,ogg,m4a,opus}', { eager: true, query: '?url', import: 'default' });
const TRACK: string | null = Object.values(TRACKS)[0] ?? null;

export interface SoundState {
  /** There is a track to play. */
  available: boolean;
  /** The visitor wants music (default on). */
  on: boolean;
  /** 0..1 */
  volume: number;
}

const STORAGE_KEY = 'jz-sound';
const DEFAULT_VOLUME = 0.45;
/**
 * Interactions that start blocked music: a click or tap only. Not key presses, so a
 * screen-reader user's first Tab never starts music over their reader (they can
 * still turn it on with the Sound button, which is a user gesture of its own).
 */
const GESTURES = ['pointerdown', 'touchend'] as const;

function loadPrefs(): Pick<SoundState, 'on' | 'volume'> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SoundState>;
      return {
        on: typeof p.on === 'boolean' ? p.on : true,
        volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULT_VOLUME,
      };
    }
  } catch {
    // No storage (private window, blocked): defaults.
  }
  return { on: true, volume: DEFAULT_VOLUME };
}

function savePrefs() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ on: state.on, volume: state.volume }));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

let state: SoundState = { available: TRACK !== null, on: true, volume: DEFAULT_VOLUME };
let audio: HTMLAudioElement | null = null;
let waitingForGesture = false;
const listeners = new Set<() => void>();

function set(next: Partial<SoundState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

/** Plays or pauses to match the visitor's choice and the tab's visibility. */
function sync() {
  if (!audio) return;
  audio.volume = state.volume;
  if (state.on && state.volume > 0 && !document.hidden) {
    if (audio.paused) audio.play().catch(waitForGesture);
  } else if (!audio.paused) {
    audio.pause();
  }
}

/** Autoplay was blocked: start on the visitor's first interaction (not on the sound stitch itself). */
function waitForGesture() {
  if (waitingForGesture) return;
  waitingForGesture = true;
  const go = (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-sound-control]')) return; // that control decides for itself
    stop();
    sync();
  };
  const stop = () => {
    waitingForGesture = false;
    for (const type of GESTURES) window.removeEventListener(type, go, true);
  };
  for (const type of GESTURES) window.addEventListener(type, go, true);
}

let prefsLoaded = false;

/** Loads the visitor's sound settings (call once, at page open). */
export function initSound(): void {
  if (prefsLoaded || typeof window === 'undefined') return;
  prefsLoaded = true;
  set(loadPrefs()); // the button sounds follow these too, music or not
}

/**
 * Starts the music. Call it once the loading screen's work is done, so the track
 * (a few MB) never competes with the site's own downloads.
 */
export function startMusic(): void {
  initSound();
  if (audio || !TRACK || typeof window === 'undefined') return;
  audio = new Audio(TRACK);
  audio.loop = true;
  audio.preload = 'auto';
  document.addEventListener('visibilitychange', sync);
  sync();
}

export function setSoundOn(on: boolean): void {
  set({ on, volume: on && state.volume === 0 ? DEFAULT_VOLUME : state.volume });
  savePrefs();
  sync();
}

export function setSoundVolume(volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  // Turning the volume up switches the music back on; all the way down is "off".
  set({ volume: v, on: v > 0 });
  savePrefs();
  sync();
}

export function getSoundState(): SoundState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSound(): SoundState {
  return useSyncExternalStore(subscribe, getSoundState, getSoundState);
}
