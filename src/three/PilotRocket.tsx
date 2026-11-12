// The pilot: the knitted doll's felt rocket that follows the player around the site
// (target and modes: src/lib/pilot.ts). One small transparent canvas with an
// orthographic camera in viewport pixels: world x = px - w/2, world y = h/2 - py.
// Orbit modes ('pod', 'planet', 'parked') circle a planet, bank into the turns and
// flip the layer's z-index front/back at the far ends of the orbit to fake depth.
// 'dive' circles a badge and dives into the pocket's light (or pops back out of it);
// 'portal' keeps the rocket hidden inside the pocket while the level page is open.
import { Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CraftLights, QuietBoundary } from './StitchDoll';
import {
  CRUISE_FLAME,
  ROCKET_LEN,
  RocketModel,
  makeRocketParts,
  orientRocket,
  updateFlame,
  useRocketKit,
  type RocketParts,
} from './RocketIntro';
import {
  PILOT_ORBIT_SECONDS,
  PILOT_START_ANGLE,
  getPilotState,
  pilotOrbit,
  pilotParkedPose,
  pilotPoseOnOrbit,
  subscribePilot,
  type PilotMode,
  type PilotOrbit,
  type PilotRect,
} from '../lib/pilot';

const TAU = Math.PI * 2;
const PUFFS = 14;

type Layer = 'front' | 'back' | 'portal';
const Z_INDEX: Record<Layer, string> = {
  front: 'var(--pilot-z-front, 4)',
  back: 'var(--pilot-z-back, 0)',
  portal: 'var(--pilot-z-portal, 1001)',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (v: number) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Same feel as the planet flights (cubic-bezier(0.65, 0, 0.35, 1)). */
const easeInOut = (v: number) => {
  const x = clamp(v, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const isOrbitMode = (m: PilotMode) => m === 'pod' || m === 'planet' || m === 'parked';

const ORBIT_KEYS = ['cx', 'cy', 'rx', 'ry', 'depth', 'size', 'length'] as const;
function lerpOrbit(out: PilotOrbit, a: PilotOrbit, b: PilotOrbit, k: number) {
  for (const key of ORBIT_KEYS) out[key] = lerp(a[key], b[key], k);
}

/** What the rocket looks like this frame (viewport px; dir: y up, z towards the viewer). */
interface Shot {
  x: number;
  y: number;
  length: number;
  dir: THREE.Vector3;
  bank: number;
  /** 0 = gone, 1 = full size. */
  show: number;
  layer: Layer;
}

function makeShot(): Shot {
  return { x: 0, y: 0, length: 40, dir: new THREE.Vector3(1, 0, 0), bank: 0, show: 0, layer: 'front' };
}

function copyShot(out: Shot, a: Shot) {
  out.x = a.x;
  out.y = a.y;
  out.length = a.length;
  out.dir.copy(a.dir);
  out.bank = a.bank;
  out.show = a.show;
  out.layer = a.layer;
}

/** out = a..b at k (out may be b). */
function blendShot(out: Shot, a: Shot, b: Shot, k: number) {
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.length = lerp(a.length, b.length, k);
  out.bank = lerp(a.bank, b.bank, k);
  out.show = lerp(a.show, b.show, k);
  const bx = b.dir.x;
  const by = b.dir.y;
  const bz = b.dir.z;
  out.dir.lerpVectors(a.dir, b.dir, k);
  if (out.dir.lengthSq() < 1e-6) out.dir.set(bx, by, bz);
  out.dir.normalize();
}

/** Heading from two screen points (y down) as a 3D direction (y up); keeps `fallback` if they coincide. */
function headingTo(out: THREE.Vector3, x0: number, y0: number, x1: number, y1: number, fallback: THREE.Vector3) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx * dx + dy * dy < 1e-4) return out.copy(fallback);
  return out.set(dx, -dy, 0).normalize();
}

interface Puff {
  born: number;
  life: number;
  size: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
}

const M4 = new THREE.Matrix4();
const Q_ID = new THREE.Quaternion();
const V_DIR = new THREE.Vector3();
const V_PARK = new THREE.Vector3();
const V_POS = new THREE.Vector3();
const V_SCALE = new THREE.Vector3();
const V_NOZZLE = new THREE.Vector3();

function PilotScene({ reduced, layer }: { reduced: boolean; layer: RefObject<HTMLDivElement | null> }) {
  const kit = useRocketKit();
  const size = useThree((st) => st.size);
  const invalidate = useThree((st) => st.invalidate);
  const group = useRef<THREE.Group>(null);
  const parts = useRef<RocketParts>(makeRocketParts());
  const puffMesh = useRef<THREE.InstancedMesh>(null);
  const sim = useRef({
    t: 0,
    theta: PILOT_START_ANGLE,
    bobFrom: 0,
    version: -1,
    takeOver: -1,
    mode: 'pod' as PilotMode,
    modeAt: 0,
    modeDur: 0,
    diveOut: false,
    // orbit to orbit
    cur: null as PilotOrbit | null,
    from: null as PilotOrbit | null,
    to: null as PilotOrbit | null,
    park: 0,
    parkFrom: 0,
    parkTo: 0,
    arc: 0,
    // anything else to an orbit: blend from the snapshot taken at the switch
    blend: false,
    blendDur: 0,
    snap: makeShot(),
    last: makeShot(),
    shot: makeShot(),
    probe: makeShot(),
    depth: '' as Layer | '',
    nextPuff: 0,
    cursor: 0,
    puffs: Array.from({ length: PUFFS }, (): Puff => ({ born: -10, life: 1, size: 1, p: new THREE.Vector3(), v: new THREE.Vector3() })),
  });

  // Store changes redraw the still (reduced motion) scene too.
  useEffect(() => subscribePilot(() => invalidate()), [invalidate]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = sim.current;
    const st = getPilotState();
    const dt = clamp(delta, 0, 1 / 20);
    s.t += dt;
    const t = s.t;
    const mesh = puffMesh.current;
    const target = st.target;
    if (!target) {
      g.visible = false;
      if (mesh) mesh.visible = false;
      s.last.show = 0;
      return;
    }
    if (mesh) mesh.visible = true;
    const mode = target.mode;
    const moving = !reduced && !st.held;

    // Handover from the start screen: begin exactly at the start pose.
    if (st.takeOver !== s.takeOver) {
      s.takeOver = st.takeOver;
      s.version = st.version;
      s.mode = mode;
      s.modeAt = t;
      s.modeDur = 0;
      s.diveOut = false;
      s.theta = PILOT_START_ANGLE;
      s.bobFrom = t;
      s.cur = pilotOrbit(target.rect, size);
      s.park = mode === 'parked' ? 1 : 0;
      s.from = null;
      s.blend = false;
    }

    // A new target: decide how to get there.
    if (st.version !== s.version) {
      s.version = st.version;
      const prev = s.mode;
      const instant = reduced || st.held || st.duration <= 0;
      s.mode = mode;
      s.modeAt = t;
      s.modeDur = instant ? 0 : st.duration / 1000;
      copyShot(s.snap, s.last);
      if (isOrbitMode(mode)) {
        const goal = pilotOrbit(target.rect, size);
        const goalPark = mode === 'parked' ? 1 : 0;
        s.blend = false;
        if (instant || !s.cur) {
          s.cur = { ...goal };
          s.park = goalPark;
          s.from = null;
        } else if (isOrbitMode(prev)) {
          s.from = { ...s.cur };
          s.to = goal;
          s.parkFrom = s.park;
          s.parkTo = goalPark;
          s.arc = Math.min(90, Math.hypot(goal.cx - s.cur.cx, goal.cy - s.cur.cy) * 0.14);
        } else {
          s.cur = { ...goal };
          s.park = goalPark;
          s.from = null;
          s.blend = true;
          s.blendDur = Math.max(0.6, s.modeDur);
        }
      } else {
        s.from = null;
        s.blend = false;
        s.diveOut = mode === 'dive' && prev === 'portal';
      }
    }

    const shot = s.shot;
    let flame = CRUISE_FLAME;
    if (isOrbitMode(mode)) {
      flame = orbitShot(shot, target.rect, t, dt, moving);
      if (s.blend) {
        const k = clamp((t - s.modeAt) / s.blendDur, 0, 1);
        const e = easeInOut(k);
        const arc = Math.min(90, Math.hypot(shot.x - s.snap.x, shot.y - s.snap.y) * 0.14);
        blendShot(shot, s.snap, shot, e);
        shot.y -= arc * Math.sin(Math.PI * e);
        if (e < 0.5) shot.layer = s.snap.layer;
        if (k >= 1) s.blend = false;
        flame *= 1.3;
      }
    } else if (mode === 'dive') {
      placeDive(shot, target.rect, t);
      placeDive(s.probe, target.rect, t + 1 / 60);
      headingTo(V_DIR, shot.x, shot.y, s.probe.x, s.probe.y, s.last.dir);
      shot.dir.copy(s.snap.dir).lerp(V_DIR, smooth((t - s.modeAt) / 0.2)).normalize();
      flame = CRUISE_FLAME * 1.4;
    } else {
      placePortal(shot, target.rect, t);
      placePortal(s.probe, target.rect, t + 1 / 60);
      headingTo(shot.dir, shot.x, shot.y, s.probe.x, s.probe.y, s.last.show > 0 ? s.last.dir : V_DIR.set(1, 0.05, 0));
      flame = CRUISE_FLAME * 0.9;
    }

    // Apply.
    g.visible = shot.show > 0.01;
    g.position.set(shot.x - size.width / 2, size.height / 2 - shot.y, 0);
    orientRocket(g.quaternion, shot.dir, shot.bank);
    const scale = (shot.length / ROCKET_LEN) * Math.max(0.0001, shot.show);
    g.scale.setScalar(scale);
    if (shot.layer !== s.depth && layer.current) {
      layer.current.style.zIndex = Z_INDEX[shot.layer];
      s.depth = shot.layer;
    }
    copyShot(s.last, shot);

    const P = parts.current;
    updateFlame(P, t, flame, !reduced);

    // Dotted cotton-puff trail.
    if (mesh && P.nozzle) {
      P.nozzle.getWorldPosition(V_NOZZLE);
      if (moving && shot.show > 0.3) {
        const interval = s.blend || s.from ? 0.05 : 0.09;
        if (s.nextPuff < t - 0.5) s.nextPuff = t;
        while (s.nextPuff <= t) {
          const pf = s.puffs[s.cursor];
          s.cursor = (s.cursor + 1) % PUFFS;
          pf.born = s.nextPuff;
          pf.life = 0.8 + Math.random() * 0.3;
          pf.size = scale * (0.75 + Math.random() * 0.5) * (1 - 0.5 * s.park);
          pf.p.copy(V_NOZZLE);
          pf.v.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16 + 6, 0);
          s.nextPuff += interval;
        }
      }
      for (let i = 0; i < PUFFS; i++) {
        const pf = s.puffs[i];
        const age = t - pf.born;
        let puff = 0;
        if (moving && age >= 0 && age < pf.life) {
          const k = age / pf.life;
          V_POS.copy(pf.p).addScaledVector(pf.v, age);
          puff = pf.size * (0.09 + 0.12 * k) * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.15)), 0.5);
        }
        if (puff <= 0) V_POS.set(0, -100000, 0);
        mesh.setMatrixAt(i, M4.compose(V_POS, Q_ID, V_SCALE.setScalar(Math.max(puff, 0.0001))));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  /** Orbit modes: around the planet, flying to a new orbit when it changes. Returns the flame size. */
  function orbitShot(out: Shot, rect: PilotRect, t: number, dt: number, moving: boolean) {
    const s = sim.current;
    const goal = pilotOrbit(rect, size);
    const orbit = s.cur ?? (s.cur = { ...goal });
    let lift = 0;
    let flying = false;
    if (s.from && s.to) {
      const k = clamp((t - s.modeAt) / Math.max(0.01, s.modeDur), 0, 1);
      const e = easeInOut(k);
      lerpOrbit(orbit, s.from, s.to, e);
      s.park = lerp(s.parkFrom, s.parkTo, e);
      lift = s.arc * Math.sin(Math.PI * e);
      flying = k < 1;
      if (k >= 1) s.from = null;
    }
    if (moving) s.theta -= ((dt * TAU) / PILOT_ORBIT_SECONDS) * (flying ? 1.6 : 1) * (1 - s.park);
    const pose = pilotPoseOnOrbit(orbit, s.theta);
    out.x = pose.x;
    out.y = pose.y;
    out.length = pose.length;
    out.bank = pose.bank;
    out.dir.set(pose.dir[0], pose.dir[1], pose.dir[2]).normalize();
    if (s.park > 0.001) {
      const parked = pilotParkedPose(orbit);
      out.x = lerp(out.x, parked.x, s.park);
      out.y = lerp(out.y, parked.y, s.park);
      out.length = lerp(out.length, parked.length, s.park);
      out.bank = lerp(out.bank, parked.bank, s.park);
      out.dir.lerp(V_PARK.set(parked.dir[0], parked.dir[1], parked.dir[2]).normalize(), s.park).normalize();
    }
    // A small hover bob, starting at zero so the handover is seamless.
    if (moving) out.y += Math.sin((t - s.bobFrom) * 2.1) * (2 + 2 * s.park);
    out.y -= lift;
    out.show = 1;
    // In front on the lower half of the orbit, behind on the upper half; the switch is
    // at the far left/right, where the rocket is clear of the planet's disc.
    out.layer = s.park < 0.5 && pose.front ? 'front' : 'back';
    return CRUISE_FLAME * (flying ? 1.4 : 1) * (1 - 0.3 * s.park);
  }

  /**
   * 'dive' in: fly to the badge (0-45%), circle it once (45-80%), spiral into its
   * centre while shrinking to nothing (80-100%). Out (after 'portal'): grow out of the
   * centre (0-20%) and keep circling until the next target.
   */
  function placeDive(out: Shot, rect: PilotRect, time: number) {
    const s = sim.current;
    const snap = s.snap;
    const bx = rect.left + rect.width / 2;
    const by = rect.top + rect.height / 2;
    const badge = Math.max(rect.width, rect.height);
    const rc = Math.max(16, badge * 0.9);
    const len = clamp(badge * 0.9, 22, Math.min(48, snap.length > 1 ? snap.length : 48));
    out.layer = 'portal';
    out.length = len;
    out.bank = -0.45;
    if (s.modeDur <= 0) {
      out.x = bx + (s.diveOut ? rc : 0);
      out.y = by;
      out.show = s.diveOut ? 1 : 0;
      return;
    }
    const f = (time - s.modeAt) / s.modeDur;
    const ring = (a: number, r: number) => {
      out.x = bx + r * Math.cos(a);
      out.y = by + 0.7 * r * Math.sin(a);
    };
    if (s.diveOut) {
      const k = clamp(f / 0.2, 0, 1);
      ring(-TAU * (f - 0.2) / 0.35, rc * smooth(k));
      out.show = smooth(k);
      return;
    }
    if (f < 0.45) {
      const k = easeInOut(f / 0.45);
      const ex = bx + rc;
      const ey = by;
      const arc = Math.min(60, Math.hypot(ex - snap.x, ey - snap.y) * 0.12);
      out.x = lerp(snap.x, ex, k);
      out.y = lerp(snap.y, ey, k) - arc * Math.sin(Math.PI * k);
      out.length = lerp(snap.length > 1 ? snap.length : len, len, k);
      out.bank = lerp(snap.bank, -0.45, k);
      out.show = lerp(snap.show, 1, smooth(k * 2));
    } else if (f < 0.8) {
      ring(-TAU * (f - 0.45) / 0.35, rc);
      out.show = 1;
    } else {
      const k = clamp((f - 0.8) / 0.2, 0, 1);
      ring(-TAU - Math.PI * k, rc * (1 - k));
      out.length = len * (1 - 0.3 * k);
      out.show = 1 - smooth(k);
    }
  }

  /**
   * 'portal': the rocket waits inside the pocket while the level page is open (it
   * dived in on the way). It stays hidden so it never sits on the page's content;
   * keeping the mode lets the closing 'dive' play in reverse, popping it back out.
   */
  function placePortal(out: Shot, rect: PilotRect, time: number) {
    out.layer = 'portal';
    out.x = rect.left + rect.width / 2;
    out.y = rect.top + rect.height / 2;
    out.length = clamp(Math.min(rect.width, rect.height) * 0.45, 24, 56);
    out.show = 0;
    void time;
  }


  return (
    <>
      <group ref={group} visible={false}>
        {/* Calm idle while following the player: the wave is only for the start screen. */}
        <RocketModel kit={kit} dollPose="cruise" reduced={reduced} parts={parts} />
      </group>
      <instancedMesh ref={puffMesh} args={[kit.geo.puff, kit.mats.puff, PUFFS]} frustumCulled={false} />
    </>
  );
}

const DPR: [number, number] = [1, 1.5];
const GL_OPTIONS = { antialias: true, alpha: true, powerPreference: 'low-power' as const };
const CAMERA = { position: [0, 0, 1000] as [number, number, number], near: 0.1, far: 4000, zoom: 1 };
const FILL_STYLE = { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const };

export interface PilotRocketProps {
  /** prefers-reduced-motion: no orbit or loops, a still rocket, instant changes. */
  reduced: boolean;
  /** Nothing to draw (no target): render only on demand. */
  idle: boolean;
  /** The layer whose z-index flips between front, back and portal. */
  layer: RefObject<HTMLDivElement | null>;
}

export function PilotRocket({ reduced, idle, layer }: PilotRocketProps) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  // Stop drawing while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <QuietBoundary>
      <Canvas
        orthographic
        frameloop={hidden ? 'never' : reduced || idle ? 'demand' : 'always'}
        dpr={DPR}
        flat
        gl={GL_OPTIONS}
        camera={CAMERA}
        style={FILL_STYLE}
      >
        <CraftLights />
        <Suspense fallback={null}>
          <PilotScene reduced={reduced} layer={layer} />
        </Suspense>
      </Canvas>
    </QuietBoundary>
  );
}
