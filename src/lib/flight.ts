import { useSyncExternalStore } from 'react';
import { animate, cubicBezier } from 'motion/react';
import type { SectionId } from '../content';

// The flight between the pod and a section page: the pod's centre planet and the
// section's big globe are two different 3D planets, so one hands over to the other.
// Opening: the pod records where its centre planet is and navigates; the section page
// starts its globe at that spot and flies it into place while the pod's planet is
// hidden. Returning: the section flies its globe back to the pod's centre planet,
// which reappears as the globe lands.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const FLIGHT_MS = 750;
/** How long the pod stays on screen (side planets flying off) after opening a section. */
export const POD_LEAVE_MS = 600;
/** Progress at which the returning globe hands over to the pod's planet (crossfade). */
const LAND_AT = 0.85;
const FADE_IN_UNTIL = 0.12;
/** Never blow a WebGL canvas up beyond this factor of its rendered size. */
const MAX_UPSCALE = 1.6;
const ease = cubicBezier(0.65, 0, 0.35, 1);

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/* ---------- The opening flight the pod hands to the section page ---------- */
let pending: { section: SectionId; from: Rect } | null = null;

export function startFlight(section: SectionId, from: Rect): void {
  pending = { section, from };
}

export function hasPendingFlight(): boolean {
  return pending !== null;
}

/** Where the pod planet for `section` was, if the pod just opened it (does not consume it). */
export function peekFlight(section: SectionId): Rect | null {
  return pending && pending.section === section ? pending.from : null;
}

export function clearFlight(): void {
  pending = null;
}

/* ---------- The pod's centre planet ---------- */
let podRect: (() => Rect | null) | null = null;

/** The pod registers how to find its centre planet's sphere box. Returns an unregister function. */
export function registerPodPlanet(getter: () => Rect | null): () => void {
  podRect = getter;
  return () => {
    if (podRect === getter) podRect = null;
  };
}

/** The pod's centre planet on screen, or null while the pod is hidden. */
export function podPlanetRect(): Rect | null {
  const r = podRect?.() ?? null;
  return r && r.width > 0 && r.height > 0 ? r : null;
}

// Whether the pod's centre planet is "away" (hidden because its big twin is flying).
let away = false;
const listeners = new Set<() => void>();

export function setPlanetAway(value: boolean): void {
  if (away === value) return;
  away = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlanetAway(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => away,
    () => false,
  );
}

/* ---------- Moving an element from one screen rect to another ---------- */
export interface Flight {
  stop: () => void;
}

interface FlyOptions {
  from: Rect;
  to: Rect;
  /** The element's own untransformed rect (where it sits in the layout). */
  layout: Rect;
  /** 'in': fade in at the start (handover from the pod). 'out': fade out at the end (handover back). */
  fade: 'in' | 'out';
  /** Linear progress 0..1, every frame. */
  onProgress?: (progress: number) => void;
  onDone?: () => void;
}

let flying = 0;
function markFlying(delta: number): void {
  flying = Math.max(0, flying + delta);
  document.documentElement.toggleAttribute('data-flying', flying > 0);
}

/**
 * Flies `el` (a square sphere box) from one rect to another along a slight arc, with
 * transform and opacity only (one style write per frame, no layout reads). The scale
 * is capped so a canvas is never blown up past MAX_UPSCALE: a much bigger target just
 * means the sphere starts or ends a little smaller than it, around the same centre.
 */
export function flyElement(el: HTMLElement, options: FlyOptions): Flight {
  const { from, to, layout, fade } = options;
  const maxWidth = layout.width * MAX_UPSCALE;
  const a = { x: from.left + from.width / 2, y: from.top + from.height / 2, w: Math.min(from.width, maxWidth) };
  const b = { x: to.left + to.width / 2, y: to.top + to.height / 2, w: Math.min(to.width, maxWidth) };
  const home = { x: layout.left + layout.width / 2, y: layout.top + layout.height / 2, w: Math.max(1, layout.width) };
  const arc = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.14);

  const apply = (progress: number) => {
    const t = ease(progress);
    const x = a.x + (b.x - a.x) * t - home.x;
    const y = a.y + (b.y - a.y) * t - arc * Math.sin(Math.PI * t) - home.y;
    const scale = (a.w + (b.w - a.w) * t) / home.w;
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    const opacity =
      fade === 'in' ? Math.min(1, progress / FADE_IN_UNTIL) : 1 - Math.max(0, (progress - LAND_AT) / (1 - LAND_AT));
    el.style.opacity = opacity >= 1 ? '' : opacity.toFixed(3);
  };

  el.style.willChange = 'transform, opacity';
  el.style.zIndex = '5';
  markFlying(1);
  apply(0);

  let finished = false;
  const settle = () => {
    if (finished) return false;
    finished = true;
    el.style.willChange = '';
    markFlying(-1);
    return true;
  };

  const controls = animate(0, 1, {
    duration: FLIGHT_MS / 1000,
    ease: 'linear',
    onUpdate: (progress) => {
      apply(progress);
      options.onProgress?.(progress);
    },
    onComplete: () => {
      if (!settle()) return;
      // Landed in place: hand the element back to the layout. (After a fade-out the
      // element is about to be removed, so it stays where it ended.)
      if (fade === 'in') resetFlightStyles(el);
      options.onDone?.();
    },
  });

  return {
    // Stops where it is; a new flight can carry on from the current transform.
    stop: () => {
      if (!settle()) return;
      controls.stop();
    },
  };
}

export function resetFlightStyles(el: HTMLElement): void {
  el.style.transform = '';
  el.style.opacity = '';
  el.style.zIndex = '';
  el.style.willChange = '';
}

/** Progress at which a returning flight should show the pod's planet again. */
export const HANDOVER_AT = LAND_AT;
