import { useSyncExternalStore } from 'react';
import type { GlobeBadge } from '../three/spec';

// The pod and the section pages are one scene. Opening a section focuses one of the
// pod's planets: that very planet glides to the section page's globe spot and grows,
// the others recede into the background. This module is the glue:
//   - the section page tells the scene where the focused planet goes (its spacer box);
//   - the section page drives the focused planet's level badges and pocket;
//   - anyone (e.g. a rocket orbiting the planet) can ask where the planets are.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** One value plus its listeners, for useSyncExternalStore. */
function createSlot<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe,
    use: () =>
      useSyncExternalStore(
        subscribe,
        () => value,
        () => initial,
      ),
  };
}

/* ---------- Where the focused planet goes ---------- */
const target = createSlot<HTMLElement | null>(null);

/** The section page's globe spacer: the focused planet sits exactly on it. */
export const setFocusTarget = target.set;
export const getFocusTarget = target.get;
export const useFocusTarget = target.use;

/* ---------- The focused planet's levels ---------- */
export interface FocusGlobe {
  badges: GlobeBadge[];
  selected: number;
  onSelectBadge?: (index: number) => void;
  pocketOpen: boolean;
  onPocketOpened?: () => void;
  onPocketClosed?: () => void;
  /** A drag on the planet brought this badge nearest the front. */
  onCentre?: (index: number) => void;
  /** The selected badge's centre on screen, as fractions of the planet box. */
  onBadgePoint?: (x: number, y: number, visible: boolean) => void;
}

const globe = createSlot<FocusGlobe | null>(null);

/** Set by the section page (PlanetLevels); the scene's focused planet shows it. */
export const setFocusGlobe = globe.set;
export const getFocusGlobe = globe.get;
export const useFocusGlobe = globe.use;

/* ---------- Where the planets are (for things that orbit or point at them) ---------- */
interface PlanetGetters {
  /** The planet in the carousel's centre (also while a section is focused). */
  centre: () => Rect | null;
  /** The focused planet, or null while no section is open. */
  focused: () => Rect | null;
}

let getters: PlanetGetters | null = null;
const sceneListeners = new Set<() => void>();

export function registerScenePlanets(next: PlanetGetters): () => void {
  getters = next;
  return () => {
    if (getters === next) getters = null;
  };
}

const visible = (r: Rect | null | undefined): Rect | null => (r && r.width > 0 && r.height > 0 ? r : null);

/** The carousel's centre planet on screen (viewport px), or null if the scene is hidden. */
export function podPlanetRect(): Rect | null {
  return visible(getters?.centre());
}

/** The focused planet on screen (viewport px) while a section is open, else null. */
export function focusedPlanetRect(): Rect | null {
  return visible(getters?.focused());
}

/**
 * Fires when the centre or focused planet changes, or a focus move starts or ends
 * (read the rects again then; during a move, read them every frame).
 */
export function subscribeScene(listener: () => void): () => void {
  sceneListeners.add(listener);
  return () => {
    sceneListeners.delete(listener);
  };
}

export function notifySceneChange(): void {
  sceneListeners.forEach((listener) => listener());
}
