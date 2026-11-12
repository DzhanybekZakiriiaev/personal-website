import { useSyncExternalStore } from 'react';

/*
 * The pilot: Johnny's knitted doll in its felt rocket, flying around whatever the
 * site is showing. One small transparent canvas (<Pilot />, src/components/Pilot.tsx,
 * mounted once when the site phase starts) draws it; everything else talks to it
 * through this store. No React context needed.
 *
 * CONTRACT
 * - setPilotTarget({ rect, mode }, options?)
 *     rect: the planet's sphere box in viewport pixels (like getBoundingClientRect).
 *     mode: 'pod'    orbit the pod's centre planet,
 *           'planet' orbit a section's globe,
 *           'parked' hover at the globe's top right, smaller, behind the page
 *                    (use while a portal pocket is open).
 *     options.duration: ms to fly from the current orbit to the new one
 *                       (default PILOT_RETARGET_MS; pass FLIGHT_MS to match a planet flight).
 *     options.instant: jump there (resize, scroll, first placement).
 *     Calling it again with the same rect and mode is a no-op, so it is cheap to call
 *     on every resize or scroll. setPilotTarget(null) hides the rocket.
 * - pilotHold(): the start screen's own rocket is flying; the pilot stays hidden.
 * - pilotTakeOver(): the start screen's rocket has landed on pilotStartPose(target);
 *     the pilot appears exactly there and carries on around the orbit.
 * - Depth: the pilot layer's z-index switches between var(--pilot-z-front, 4) and
 *     var(--pilot-z-back, 0) at the far left and right of the orbit, where the rocket is
 *     clear of the planet's disc, so the swap never shows. Define those two custom
 *     properties so 'back' sits under the planet layer and 'front' above it.
 *     'parked' always uses back.
 * - Reduced motion: no orbit; the rocket rests at the start pose and retargets instantly.
 */

export type PilotMode = 'pod' | 'planet' | 'parked';

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

/** An orbit in viewport pixels: centre, radii, depth (for the 3D heading) and rocket length. */
export interface PilotOrbit {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  depth: number;
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

export function pilotOrbit(rect: PilotRect): PilotOrbit {
  const d = Math.max(40, Math.min(rect.width, rect.height));
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    rx: d * 0.64,
    ry: d * 0.16,
    depth: d * 0.5,
    length: Math.min(110, Math.max(44, d * 0.24)),
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

/** Hovering at the planet's top right, a little smaller, nose to the right. */
export function pilotParkedPose(o: PilotOrbit): PilotPose {
  const d = o.rx / 0.64;
  return {
    x: o.cx + d * 0.62,
    y: o.cy - d * 0.42,
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
