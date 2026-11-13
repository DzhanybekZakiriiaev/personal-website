import { useSyncExternalStore } from 'react';

/*
 * The pilot: Sackboy in his felt rocket, flying around whatever the
 * site is showing. One small transparent canvas (<Pilot />, src/components/Pilot.tsx,
 * mounted once when the site phase starts) draws it; everything else talks to it
 * through this store. No React context needed.
 *
 * CONTRACT
 * - setPilotTarget({ rect, mode }, options?)
 *     rect: the planet's sphere box in viewport pixels (like getBoundingClientRect).
 *     mode: 'pod'    orbit the pod's centre planet,
 *           'planet' orbit a section's globe,
 *           'parked' hover at the globe's top right, smaller, behind the page,
 *           'dive'   rect = the opened badge (the small box at the planet's front spot).
 *                    The rocket flies to it, circles it once and dives into the
 *                    pocket's light, shrinking to nothing exactly when `duration` ends
 *                    (pass the pocket's opening time, about 1000 ms); then it stays hidden.
 *                    If the previous mode was 'portal', it plays in reverse: the rocket
 *                    pops out of the badge and circles it until the next target
 *                    (call 'dive' with the badge when the pocket starts closing, then
 *                    'planet' with the globe).
 *           'portal' rect = the opened badge again. The rocket waits HIDDEN inside the
 *                    pocket while the level page is open, so it never covers the page;
 *                    the closing 'dive' then plays in reverse and pops it back out.
 *     options.duration: ms for the change (default PILOT_RETARGET_MS). Orbit modes: the
 *                       flight to the new orbit (pass FLIGHT_MS to match a planet flight).
 *                       'dive': the whole fly, circle and dive.
 *     options.instant: jump there (resize, scroll, first placement).
 *     Calling it again with the same rect and mode is a no-op, so it is cheap to call
 *     on every resize or scroll. setPilotTarget(null) hides the rocket.
 * - pilotHold(): the start screen's own rocket is flying; the pilot stays hidden.
 * - pilotTakeOver(): the start screen's rocket has landed on pilotStartPose(target);
 *     the pilot appears exactly there and carries on around the orbit.
 * - getPilotLivePose(): where the pilot is on screen this frame ("Back to start" flies
 *     the start screen's rocket on from there, then calls pilotHold()).
 * - Depth: the pilot layer's z-index switches between var(--pilot-z-front, 4) and
 *     var(--pilot-z-back, 0) at the far left and right of the orbit, where the rocket is
 *     clear of the planet's disc, so the swap never shows. Define those two custom
 *     properties so 'back' sits under the planet layer and 'front' above it.
 *     'parked' always uses back. 'dive' and 'portal' use var(--pilot-z-portal, 1001),
 *     above the portal dialog (z-index 1000).
 * - The rocket always ignores the pointer and stays small (about a fifth of the planet,
 *   capped by the viewport), so it never blocks a tap.
 * - Reduced motion: no orbit or loops; the rocket rests at the start pose, 'dive' hides it
 *   at once, 'portal' keeps it hidden, and every change is instant.
 */

export type PilotMode = 'pod' | 'planet' | 'parked' | 'dive' | 'portal';

export interface PilotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PilotTarget {
  rect: PilotRect;
  mode: PilotMode;
}

export interface PilotRetarget {
  instant?: boolean;
  duration?: number;
}

export interface PilotState {
  target: PilotTarget | null;
  /** Bumps on every target change; the pilot flies from wherever it is. */
  version: number;
  /** Duration of the latest change in ms (0 = jump). */
  duration: number;
  /** True while the start screen's rocket is flying. */
  held: boolean;
  /** Bumps on every pilotTakeOver(); the pilot restarts at the start pose. */
  takeOver: number;
}

export const PILOT_RETARGET_MS = 800;
/** Seconds for one lap of the orbit. */
export const PILOT_ORBIT_SECONDS = 7.5;
/** Where on the orbit the pilot starts (radians; a little before the front-most point). */
export const PILOT_START_ANGLE = 1.95;

let state: PilotState = { target: null, version: 0, duration: 0, held: false, takeOver: 0 };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function sameTarget(a: PilotTarget | null, b: PilotTarget | null) {
  if (a === b) return true;
  if (!a || !b || a.mode !== b.mode) return false;
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
  return (
    near(a.rect.left, b.rect.left) &&
    near(a.rect.top, b.rect.top) &&
    near(a.rect.width, b.rect.width) &&
    near(a.rect.height, b.rect.height)
  );
}

export function setPilotTarget(target: PilotTarget | null, options: PilotRetarget = {}): void {
  if (sameTarget(state.target, target)) return;
  const copy = target ? { mode: target.mode, rect: { ...target.rect } } : null;
  state = {
    ...state,
    target: copy,
    version: state.version + 1,
    duration: options.instant ? 0 : Math.max(0, options.duration ?? PILOT_RETARGET_MS),
  };
  emit();
}

export function pilotHold(): void {
  if (state.held) return;
  state = { ...state, held: true };
  emit();
}

export function pilotTakeOver(): void {
  state = { ...state, held: false, takeOver: state.takeOver + 1 };
  emit();
}

export function getPilotState(): PilotState {
  return state;
}

/* The pilot's pose on screen right now (written every frame by the pilot layer), so
   "Back to start" can pick the rocket up exactly where it is. Null while hidden. */
let livePose: PilotPose | null = null;

export function reportPilotPose(pose: PilotPose | null): void {
  livePose = pose;
}

/** Where the pilot is on screen this frame, or null if it is not showing. */
export function getPilotLivePose(): PilotPose | null {
  return livePose;
}

export function subscribePilot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePilotState(): PilotState {
  return useSyncExternalStore(subscribePilot, getPilotState, getPilotState);
}

/* =========================================================
   Geometry, shared by the pilot and the start screen's flight
   ========================================================= */

/** An orbit in viewport pixels: centre, radii, depth (for the 3D heading), planet size and rocket length. */
export interface PilotOrbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  depth: number;
  size: number;
  length: number;
}

/**
 * The rocket's pose on screen. x, y: viewport px. length: nose to flame tip in px.
 * dir: heading in 3D with y up and z towards the viewer. bank: roll about the heading.
 * speed: on-screen speed in px/s. front: in front of the planet (vs behind it).
 */
export interface PilotPose {
  x: number;
  y: number;
  length: number;
  dir: [number, number, number];
  bank: number;
  speed: number;
  front: boolean;
}

const OMEGA = (Math.PI * 2) / PILOT_ORBIT_SECONDS;

/**
 * The orbit around a planet box. The rocket scales with the planet (about a fifth of
 * its size) and is capped by the viewport, so it stays small on phones. The orbit is
 * pulled in to stay on screen, but never inside the planet's disc plus the rocket's
 * half width, so the front/back swap at its far ends stays hidden.
 */
export function pilotOrbit(rect: PilotRect, viewport?: { width: number; height: number }): PilotOrbit {
  const vw = viewport?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const vh = viewport?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 800);
  const d = Math.max(40, Math.min(rect.width, rect.height));
  const cx = rect.left + rect.width / 2;
  const length = Math.min(96, Math.min(vw, vh) * 0.2, Math.max(28, d * 0.22));
  const margin = length * 0.35 + 6;
  const room = Math.min(cx - margin, vw - cx - margin);
  // Hug the planet: just outside its edge, so the orbit never reaches into the
  // neighbouring planets on the carousel (they sit close on either side).
  const rx = Math.max(d * 0.5 + length * 0.2, Math.min(d * 0.5 + length * 0.42, room));
  return {
    cx,
    cy: rect.top + rect.height / 2,
    rx,
    ry: d * 0.16,
    depth: d * 0.5,
    size: d,
    length,
  };
}

/**
 * Pose at angle theta. The rocket travels with theta decreasing: right along the
 * bottom (in front of the planet), up the right side, left across the top (behind),
 * down the left side.
 */
export function pilotPoseOnOrbit(o: PilotOrbit, theta: number): PilotPose {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  return {
    x: o.cx + o.rx * c,
    y: o.cy + o.ry * s,
    length: o.length * (1 + 0.16 * s),
    dir: [o.rx * s, o.ry * c, -o.depth * c],
    bank: -0.32,
    speed: OMEGA * Math.hypot(o.rx * s, o.ry * c),
    front: s > 0,
  };
}

/** Hovering at the planet's top right (kept on screen), a little smaller, nose to the right. */
export function pilotParkedPose(o: PilotOrbit): PilotPose {
  const d = o.size;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  return {
    x: Math.min(o.cx + d * 0.62, vw - o.length * 0.5 - 8),
    y: Math.max(o.cy - d * 0.42, o.length * 0.4 + 8),
    length: o.length * 0.75,
    dir: [1, 0.06, 0],
    bank: 0,
    speed: 0,
    front: false,
  };
}

/** Where the pilot appears on pilotTakeOver(), for the current target (null if none). */
export function pilotStartPose(target: PilotTarget | null): PilotPose | null {
  if (!target) return null;
  const orbit = pilotOrbit(target.rect);
  return target.mode === 'parked' ? pilotParkedPose(orbit) : pilotPoseOnOrbit(orbit, PILOT_START_ANGLE);
}
