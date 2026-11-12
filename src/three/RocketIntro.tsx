// Title-screen flight: the knitted doll rides an original felt-and-cardboard
// rocket through felt stars and paper clouds, waving. When `launching` turns
// on, it grabs the joystick, gives a thumbs-up and nods while the knitted flame
// flares. When `exiting` turns on, the rocket swoops up, loops round with a
// barrel roll and dives into the scene, shrinking with distance, until it sits
// exactly on the pilot's start pose (src/lib/pilot.ts); then pilotTakeOver()
// hands it to the <Pilot /> layer and onFlightEnd fires.
// The rocket itself (useRocketKit, RocketModel) is shared with the pilot.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CraftLights, DollModel, QuietBoundary, canUseWebGL, makeCraftKit, type DollPose } from './StitchDoll';
import { getPilotState, pilotStartPose, pilotTakeOver, type PilotPose } from '../lib/pilot';
import knitUrl from '../assets/textures/knit.jpg';
import feltUrl from '../assets/textures/felt.jpg';
import cardboardUrl from '../assets/textures/cardboard.jpg';

/** Where the rocket should sit, as fractions of the canvas box (centre and size). */
export interface RocketFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface RocketIntroProps {
  /** "Takes control": joystick, thumbs-up, nods, flame flares and rumbles. */
  launching: boolean;
  /** Fly down onto the pilot's start pose (EXIT_TIME), take over, then call onFlightEnd. */
  exiting?: boolean;
  onFlightEnd?: () => void;
  /** prefers-reduced-motion: no flight, bob or flicker; a still scene. */
  reduced: boolean;
  frame: RocketFrame;
}

/* =========================================================
   Layout (scene units). The rocket flies along +x, top is +y,
   the camera looks down -z.
   ========================================================= */
const TAU = Math.PI * 2;
const FOV = 30;
const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const VIEW_CENTER = { x: -0.12, y: 0.12 };
const VIEW_HALF = { x: 2.15, y: 1.5 };
const ROCKET_BASE = { x: 0.35, y: -0.35 };
const PITCH = 0.18;
const COCKPIT_X = 0.1;
const COCKPIT_A = 0.43; // cockpit ring radius
const DOLL_Y = 0.23;
const DOLL_SCALE = 0.75;
/** Seconds from the exit starting to the rocket landing on the pilot's start pose. */
export const EXIT_TIME = 1.4;
/** Nose to flame tip in model units (the pilot scales the model by length / ROCKET_LEN). */
export const ROCKET_LEN = 3.6;
/** The flame size the pilot cruises with (the exit flight ends on it). */
export const CRUISE_FLAME = 1.2;
const PUFFS = 24;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (v: number) => {
  const x = clamp(v, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

function bezier(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number) {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return out.set(
    p0.x * a + p1.x * b + p2.x * c + p3.x * d,
    p0.y * a + p1.y * b + p2.y * c + p3.y * d,
    p0.z * a + p1.z * b + p2.z * c + p3.z * d,
  );
}

/** Small seeded random, so the sky looks the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- Hull profile: radius along the axis ---------- */
const HULL_PROFILE = new THREE.SplineCurve(
  [
    [0.001, -1.38],
    [0.4, -1.36],
    [0.55, -1.0],
    [0.62, -0.5],
    [0.63, 0],
    [0.6, 0.45],
    [0.5, 0.88],
    [0.32, 1.22],
    [0.13, 1.43],
    [0.001, 1.5],
  ].map(([r, y]) => new THREE.Vector2(r, y)),
)
  .getPoints(72)
  .map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y));

function hullRadius(a: number) {
  const pts = HULL_PROFILE;
  if (a <= pts[0].y) return pts[0].x;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y >= a) {
      const p = pts[i - 1];
      const q = pts[i];
      const f = (a - p.y) / Math.max(1e-6, q.y - p.y);
      return p.x + (q.x - p.x) * f;
    }
  }
  return pts[pts.length - 1].x;
}

/** A slightly larger slice of the hull between two axial positions (felt layers). */
function shell(y0: number, y1: number, grow: number) {
  const out = [new THREE.Vector2(hullRadius(y0) * grow, y0)];
  for (const p of HULL_PROFILE) if (p.y > y0 && p.y < y1) out.push(new THREE.Vector2(p.x * grow, p.y));
  out.push(new THREE.Vector2(hullRadius(y1) * grow, y1));
  return out;
}

/** A ring around the rocket's axis at axial position a. */
function ringPoints(a: number, r: number, n = 72) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    pts.push(new THREE.Vector3(a, r * Math.cos(t), r * Math.sin(t)));
  }
  return pts;
}

/** A closed loop lying on the hull's top surface around the cockpit. */
function saddlePoints(radius: number, lift: number, n = 96) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = COCKPIT_X + radius * Math.cos(t);
    const z = radius * Math.sin(t);
    const r = hullRadius(x);
    pts.push(new THREE.Vector3(x, Math.sqrt(Math.max(0, r * r - z * z)) + lift, z));
  }
  return pts;
}

/* ---------- Flat shapes ---------- */
function finShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0.45);
  s.quadraticCurveTo(-0.95, 0.62, -1.36, 1.02);
  s.quadraticCurveTo(-1.5, 1.1, -1.57, 0.96);
  s.quadraticCurveTo(-1.5, 0.6, -1.3, 0.3);
  s.lineTo(-0.55, 0.45);
  return s;
}

function starShape(outer = 0.22, inner = 0.1) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a));
    else s.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  s.closePath();
  return s;
}

function cloudShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.7, -0.15);
  s.bezierCurveTo(-0.88, -0.15, -0.88, 0.14, -0.62, 0.13);
  s.bezierCurveTo(-0.6, 0.4, -0.24, 0.44, -0.17, 0.24);
  s.bezierCurveTo(-0.1, 0.54, 0.33, 0.52, 0.35, 0.24);
  s.bezierCurveTo(0.62, 0.3, 0.8, 0.04, 0.62, -0.15);
  s.lineTo(-0.7, -0.15);
  return s;
}

/** Points along a shape's outline, pulled a fixed distance towards its centre. */
function insetOutline(shape: THREE.Shape, inset: number, z: number) {
  const pts = shape.getSpacedPoints(64);
  const c = new THREE.Vector2();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  return pts.slice(0, -1).map((p) => {
    const d = p.clone().sub(c);
    const len = d.length();
    const k = len > inset ? (len - inset) / len : 0;
    return new THREE.Vector3(c.x + d.x * k, c.y + d.y * k, z);
  });
}

// Precomputed stitch paths (scene units, rocket frame)
const FIN_SHAPE = finShape();
const FIN_FACE = 0.035 + 0.025 + 0.003;
const FIN_STITCH_FRONT = insetOutline(FIN_SHAPE, 0.075, FIN_FACE);
const FIN_STITCH_BACK = insetOutline(FIN_SHAPE, 0.075, -FIN_FACE);
const SEAMS = [
  ringPoints(0.9, hullRadius(0.9) * 1.025 + 0.006),
  ringPoints(-0.585, hullRadius(-0.585) * 1.02 + 0.006),
  ringPoints(-0.395, hullRadius(-0.395) * 1.02 + 0.006),
  ringPoints(-1.115, hullRadius(-1.115) * 1.02 + 0.006),
];
const RIM_STITCH = saddlePoints(COCKPIT_A, 0.078);
const FIN_ANGLES = [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3];

/* =========================================================
   Materials and geometry
   ========================================================= */
function makeRocketKit(knitImg: HTMLImageElement, feltImg: HTMLImageElement, cardImg: HTMLImageElement) {
  const craft = makeCraftKit(knitImg, feltImg);
  const { felt, knit, base, rep } = craft;
  const card = base(cardImg, true);
  const glow = (m: THREE.MeshPhysicalMaterial, color: string, k: number) => {
    m.emissive.set(color);
    m.emissiveIntensity = k;
    return m;
  };

  const mats = {
    hull: felt('#fff1dc', 3, 1.5),
    red: felt('#e5483f', 2, 1),
    fin: felt('#e5483f', 1.2, 1.2),
    rim: felt('#ffc54a', 4, 0.4),
    gap: felt('#2c2a4f', 2, 0.3),
    nozzle: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: rep(card, 1.5, 0.4),
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    soot: new THREE.MeshStandardMaterial({ color: '#3a2a3a', roughness: 1 }),
    flameOuter: glow(knit('#ff7a2a', 0.75, 0.6), '#ff5a14', 0.45),
    flameMid: glow(felt('#ffc93a', 0.6, 0.6), '#ffb020', 0.5),
    flameCore: glow(felt('#fff6cf', 0.4, 0.4), '#fff0b0', 0.6),
    puff: felt('#ffffff', 1, 1, 4),
    cloud: felt('#fdfcf7', 1, 1, 0.8),
    buttonTeal: felt('#2fb3a8', 0.3, 0.3),
    buttonPink: felt('#ff6fa6', 0.3, 0.3),
    rivet: new THREE.MeshPhysicalMaterial({ color: '#c9ccd6', metalness: 0.6, roughness: 0.35 }),
    stick: new THREE.MeshStandardMaterial({ color: '#2b2d3a', roughness: 0.6 }),
    ball: new THREE.MeshPhysicalMaterial({ color: '#e5483f', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    thread: new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.8 }),
    threadDark: new THREE.MeshStandardMaterial({ color: '#7a4a12', roughness: 0.8 }),
  };
  const stars = [felt('#ffd04d', 1, 1), felt('#fff3d0', 1, 1), felt('#ff9cc4', 1, 1), felt('#7fe0d4', 1, 1)];

  const fin = new THREE.ExtrudeGeometry(FIN_SHAPE, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 3,
    curveSegments: 16,
  });
  fin.translate(0, 0, -0.035);
  const star = new THREE.ExtrudeGeometry(starShape(), {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  star.translate(0, 0, -0.02);
  const cloud = new THREE.ExtrudeGeometry(cloudShape(), {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 14,
  });

  const geo = {
    hull: new THREE.LatheGeometry(HULL_PROFILE, 64),
    nose: new THREE.LatheGeometry(shell(0.86, 1.5, 1.025), 64),
    band: new THREE.LatheGeometry(shell(-0.62, -0.36, 1.02), 64),
    tailBand: new THREE.LatheGeometry(shell(-1.34, -1.08, 1.02), 64),
    rim: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(saddlePoints(COCKPIT_A, 0), true), 120, 0.075, 10, true),
    gap: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(saddlePoints(COCKPIT_A - 0.07, 0), true), 120, 0.035, 8, true),
    fin,
    star,
    cloud,
    stitch: new THREE.CapsuleGeometry(0.012, 0.045, 2, 6),
    puff: new THREE.SphereGeometry(1, 16, 12),
  };

  return {
    mats,
    stars,
    geo,
    dispose() {
      craft.dispose();
      for (const m of Object.values(mats)) m.dispose();
      for (const m of stars) m.dispose();
      for (const g of Object.values(geo)) g.dispose();
    },
  };
}

type RocketKit = ReturnType<typeof makeRocketKit>;

/* =========================================================
   Pieces
   ========================================================= */
const UP = new THREE.Vector3(0, 1, 0);

/** Running stitch along a polyline: capsules lying along the path. */
function StitchPath({
  points,
  geometry,
  material,
  period = 0.12,
  closed = true,
}: {
  points: THREE.Vector3[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  period?: number;
  closed?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => {
    const pts = closed ? [...points, points[0]] : points;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = lens[lens.length - 1];
    const n = Math.max(1, Math.floor(total / period));
    const step = total / n;
    const out: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * step;
      while (seg < lens.length - 2 && lens[seg + 1] < s) seg++;
      const a = pts[seg];
      const b = pts[seg + 1];
      const f = (s - lens[seg]) / Math.max(1e-6, lens[seg + 1] - lens[seg]);
      out.push({ pos: a.clone().lerp(b, f), dir: b.clone().sub(a).normalize() });
    }
    return out;
  }, [points, period, closed]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    placements.forEach((p, i) => {
      q.setFromUnitVectors(UP, p.dir);
      mesh.setMatrixAt(i, m.compose(p.pos, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  return <instancedMesh key={placements.length} ref={ref} args={[geometry, material, placements.length]} />;
}

/** Something sewn onto the hull at axial position a, angle th (0 = top, towards the camera as th grows). */
function OnHull({ a, th, lift = 0, children }: { a: number; th: number; lift?: number; children: ReactNode }) {
  const r = hullRadius(a) * 1.02 + lift;
  return (
    <group position={[a, r * Math.cos(th), r * Math.sin(th)]} rotation={[th, 0, 0]}>
      {children}
    </group>
  );
}

function SewnButton({ kit, material }: { kit: RocketKit; material: THREE.Material }) {
  return (
    <group>
      <mesh material={material}>
        <cylinderGeometry args={[0.055, 0.058, 0.026, 20]} />
      </mesh>
      <mesh material={kit.mats.stick} position={[-0.017, 0.013, 0]}>
        <sphereGeometry args={[0.01, 8, 6]} />
      </mesh>
      <mesh material={kit.mats.stick} position={[0.017, 0.013, 0]}>
        <sphereGeometry args={[0.01, 8, 6]} />
      </mesh>
    </group>
  );
}

function RocketBody({ kit }: { kit: RocketKit }) {
  const { mats, geo } = kit;
  return (
    <group>
      {/* Felt layers, turned so the lathe axis runs along +x */}
      <group rotation={[0, 0, -Math.PI / 2]}>
        <mesh geometry={geo.hull} material={mats.hull} />
        <mesh geometry={geo.nose} material={mats.red} />
        <mesh geometry={geo.band} material={mats.red} />
        <mesh geometry={geo.tailBand} material={mats.red} />
      </group>
      {SEAMS.map((pts, i) => (
        <StitchPath key={i} points={pts} geometry={geo.stitch} material={mats.thread} />
      ))}

      {/* Open cockpit: a padded rim lying on the hull, with a dark gap inside */}
      <mesh geometry={geo.rim} material={mats.rim} />
      <mesh geometry={geo.gap} material={mats.gap} />
      <StitchPath points={RIM_STITCH} geometry={geo.stitch} material={mats.threadDark} period={0.1} />

      {/* Cardboard nozzle */}
      <mesh material={mats.nozzle} position={[-1.49, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.38, 0.3, 32, 1, true]} />
      </mesh>
      <mesh material={mats.soot} position={[-1.45, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[0.3, 32]} />
      </mesh>

      {/* Three fins with running stitches on both faces */}
      {FIN_ANGLES.map((th) => (
        <group key={th} rotation={[th, 0, 0]}>
          <mesh geometry={geo.fin} material={mats.fin} />
          <StitchPath points={FIN_STITCH_FRONT} geometry={geo.stitch} material={mats.thread} period={0.11} />
          <StitchPath points={FIN_STITCH_BACK} geometry={geo.stitch} material={mats.thread} period={0.11} />
        </group>
      ))}

      {/* Sewn buttons near the nose, rivets on the tail band */}
      <OnHull a={0.68} th={1.15}>
        <SewnButton kit={kit} material={mats.buttonTeal} />
      </OnHull>
      <OnHull a={0.68} th={1.7}>
        <SewnButton kit={kit} material={mats.buttonPink} />
      </OnHull>
      {[0.85, 1.3, 1.75, 2.2].map((th) => (
        <OnHull key={th} a={-1.22} th={th}>
          <mesh material={mats.rivet} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.03, 10, 8]} />
          </mesh>
        </OnHull>
      ))}
    </group>
  );
}

/* =========================================================
   The rocket as a reusable model (title flight and pilot)
   ========================================================= */
/** Loads the textures (suspends) and builds the rocket's materials; disposed on unmount. */
export function useRocketKit(): RocketKit {
  const images = useLoader(THREE.ImageLoader, [knitUrl, feltUrl, cardboardUrl]) as unknown as HTMLImageElement[];
  const kit = useMemo(() => makeRocketKit(images[0], images[1], images[2]), [images]);
  useEffect(() => () => kit.dispose(), [kit]);
  return kit;
}

/** Starts loading the rocket's photos into useLoader's cache, so useRocketKit need not suspend. */
export function preloadRocketTextures() {
  useLoader.preload(THREE.ImageLoader, [knitUrl, feltUrl, cardboardUrl]);
}

/**
 * One mesh per rocket material (plus the instanced puff and stitch variants), only
 * for compiling the rocket's shader programs ahead of time (see craftWarmup.ts).
 */
export function makeRocketWarmup(knitImg: HTMLImageElement, feltImg: HTMLImageElement, cardImg: HTMLImageElement) {
  const kit = makeRocketKit(knitImg, feltImg, cardImg);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const objects: THREE.Object3D[] = [...Object.values(kit.mats), ...kit.stars].map((m) => new THREE.Mesh(sphere, m));
  objects.push(new THREE.InstancedMesh(kit.geo.puff, kit.mats.puff, 1), new THREE.InstancedMesh(kit.geo.stitch, kit.mats.thread, 1));
  return {
    objects,
    dispose() {
      kit.dispose();
      sphere.dispose();
    },
  };
}

export type { RocketKit };

/** Animated parts of a RocketModel, filled in by its refs. */
export interface RocketParts {
  cones: (THREE.Group | null)[];
  stick: THREE.Group | null;
  /** A marker just behind the nozzle, where exhaust puffs come out. */
  nozzle: THREE.Group | null;
}

export function makeRocketParts(): RocketParts {
  return { cones: [], stick: null, nozzle: null };
}

/** Rocket body, the doll in its cockpit with the joystick, and the knitted flame. Origin mid-hull, nose along +x. */
export function RocketModel({
  kit,
  dollPose,
  reduced,
  parts,
}: {
  kit: RocketKit;
  dollPose: DollPose;
  reduced: boolean;
  parts: RefObject<RocketParts>;
}) {
  return (
    <group>
      <RocketBody kit={kit} />

      {/* The doll in the cockpit, with its little joystick */}
      <group position={[COCKPIT_X, DOLL_Y, 0]} rotation={[0, 0, -0.08]} scale={DOLL_SCALE}>
        <Suspense fallback={null}>
          <DollModel pose={dollPose} stage={false} shadow={false} reduced={reduced} />
        </Suspense>
        <group
          ref={(o) => {
            parts.current.stick = o;
          }}
          position={[-0.48, 0.42, 0.39]}
        >
          <mesh material={kit.mats.stick} scale={[1, 0.5, 1]}>
            <sphereGeometry args={[0.07, 14, 10]} />
          </mesh>
          <mesh material={kit.mats.stick} position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.16, 10]} />
          </mesh>
          <mesh material={kit.mats.ball} position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.055, 16, 12]} />
          </mesh>
        </group>
      </group>

      {/* Knitted flame: three felt cones pointing back from the nozzle */}
      <group position={[-1.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        {(
          [
            [0.3, 0.95, kit.mats.flameOuter],
            [0.2, 0.7, kit.mats.flameMid],
            [0.11, 0.42, kit.mats.flameCore],
          ] as const
        ).map(([radius, length, material], i) => (
          <group
            key={i}
            ref={(o) => {
              parts.current.cones[i] = o;
            }}
          >
            <mesh material={material} position={[0, length / 2, 0]}>
              <coneGeometry args={[radius, length, 20]} />
            </mesh>
          </group>
        ))}
      </group>
      <group
        ref={(o) => {
          parts.current.nozzle = o;
        }}
        position={[-1.75, 0, 0]}
      />
    </group>
  );
}

/** Flicker the knitted flame with squash and stretch. `flame` = overall size (1 = idle). */
export function updateFlame(parts: RocketParts, t: number, flame: number, live: boolean) {
  parts.cones.forEach((c, i) => {
    if (!c) return;
    const flick = live ? 1 + 0.16 * Math.sin(t * (21 + i * 7) + i * 1.7) + 0.08 * Math.sin(t * (39 + i * 5) + i) : 1;
    const len = flame * flick;
    const wid = Math.pow(flame, 0.45) / Math.sqrt(flick);
    c.scale.set(wid, len, wid);
  });
}

const OR_X = new THREE.Vector3();
const OR_Y = new THREE.Vector3();
const OR_Z = new THREE.Vector3();
const OR_M = new THREE.Matrix4();
const OR_Q = new THREE.Quaternion();
const OR_AXIS = new THREE.Vector3(1, 0, 0);

/** Points the rocket's nose (+x) along `dir`, keeping its top up, then rolls it by `bank`. */
export function orientRocket(out: THREE.Quaternion, dir: THREE.Vector3, bank: number) {
  OR_X.copy(dir).normalize();
  OR_Z.crossVectors(OR_X, UP);
  if (OR_Z.lengthSq() < 1e-6) OR_Z.set(0, 0, 1);
  OR_Z.normalize();
  OR_Y.crossVectors(OR_Z, OR_X);
  out.setFromRotationMatrix(OR_M.makeBasis(OR_X, OR_Y, OR_Z));
  return out.multiply(OR_Q.setFromAxisAngle(OR_AXIS, bank));
}

/* =========================================================
   Camera
   ========================================================= */
interface RigInfo {
  ready: boolean;
  dist: number;
  tx: number;
  ty: number;
  aspect: number;
}

/** Fits the rocket into `frame` (part of the canvas) at any screen size. */
function CameraRig({ frame, rig }: { frame: RocketFrame; rig: RefObject<RigInfo> }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const aspect = width / Math.max(1, height);
    const fh = clamp(frame.h, 0.2, 1);
    const fw = clamp(frame.w, 0.3, 1);
    const dist = Math.max(VIEW_HALF.y / (TAN_HALF * fh), VIEW_HALF.x / (TAN_HALF * aspect * fw), 6);
    const halfH = dist * TAN_HALF;
    const halfW = halfH * aspect;
    // Shift the view so the rocket lands on the frame's centre, not the canvas centre.
    const tx = VIEW_CENTER.x - (frame.cx * 2 - 1) * halfW;
    const ty = VIEW_CENTER.y - (1 - frame.cy * 2) * halfH;
    camera.position.set(tx, ty + dist * 0.06, dist);
    camera.lookAt(tx, ty, 0);
    camera.far = dist + 240; // the exit flight goes deep into the scene
    camera.updateProjectionMatrix();
    rig.current = { ready: true, dist, tx, ty, aspect };
    invalidate();
  }, [camera, width, height, frame.cx, frame.cy, frame.w, frame.h, rig, invalidate]);
  return null;
}

/* =========================================================
   The flight
   ========================================================= */
interface Puff {
  born: number;
  life: number;
  size: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
}

interface Drifter {
  cloud: boolean;
  x: number;
  y: number;
  z: number;
  speed: number;
  spin: number;
  rot: number;
  scale: number;
  mat: number;
}

function makeDrifters(): Drifter[] {
  const r = rng(7);
  const out: Drifter[] = [];
  for (let i = 0; i < 12; i++) {
    out.push({
      cloud: false,
      x: 0,
      y: 0,
      z: -1 - r() * 4.5,
      speed: 0.9 + r() * 0.5,
      spin: (r() - 0.5) * 1.2,
      rot: r() * TAU,
      scale: 0.6 + r() * 0.6,
      mat: i % 4,
    });
  }
  for (let i = 0; i < 5; i++) {
    out.push({
      cloud: true,
      x: 0,
      y: 0,
      z: -3 - r() * 3.5,
      speed: 0.6 + r() * 0.3,
      spin: 0,
      rot: 0,
      scale: 0.9 + r() * 0.7,
      mat: 0,
    });
  }
  return out;
}

const M4 = new THREE.Matrix4();
const Q_ID = new THREE.Quaternion();
const Q_PATH = new THREE.Quaternion();
const Q_MID = new THREE.Quaternion();
const V_POS = new THREE.Vector3();
const V_SCALE = new THREE.Vector3();
const V_NOZZLE = new THREE.Vector3();
const V_AHEAD = new THREE.Vector3();
const V_RAY = new THREE.Vector3();
const V_DIR = new THREE.Vector3();

interface FlightProps {
  launching: boolean;
  exiting: boolean;
  onFlightEnd?: () => void;
  reduced: boolean;
  rig: RefObject<RigInfo>;
}

/** Where to land when nothing gives the pilot a target: low in the middle of the screen. */
function fallbackPose(vw: number, vh: number): PilotPose {
  return { x: vw / 2, y: vh * 0.6, length: 90, dir: [1, -0.1, 0.3], bank: -0.32, speed: 200, front: true };
}

function Flight({ launching, exiting, onFlightEnd, reduced, rig }: FlightProps) {
  const kit = useRocketKit();
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);

  const rocket = useRef<THREE.Group>(null);
  const parts = useRef<RocketParts>(makeRocketParts());
  const puffMesh = useRef<THREE.InstancedMesh>(null);
  const drifterObjs = useRef<(THREE.Mesh | null)[]>([]);
  const live = useRef({ launching, exiting, onFlightEnd });
  useEffect(() => {
    live.current = { launching, exiting, onFlightEnd };
  }, [launching, exiting, onFlightEnd]);

  // Partway through the exit the doll settles into 'cruise', the pilot's resting pose,
  // so the handover to the pilot layer doesn't pop.
  const [cruising, setCruising] = useState(false);
  const drifters = useMemo(makeDrifters, []);
  const sim = useRef({
    t: 0,
    launchAt: -1,
    exitAt: -1,
    cruiseSet: false,
    nextPuff: 0,
    placed: false,
    random: rng(11),
    puffs: Array.from({ length: PUFFS }, (): Puff => ({ born: -10, life: 1, size: 1, p: new THREE.Vector3(), v: new THREE.Vector3() })),
    cursor: 0,
    // exit flight: a curve from where the rocket is to the pilot's start pose
    p0: new THREE.Vector3(),
    p1: new THREE.Vector3(),
    p2: new THREE.Vector3(),
    p3: new THREE.Vector3(),
    q0: new THREE.Quaternion(),
    qEnd: new THREE.Quaternion(),
    dirEnd: new THREE.Vector3(1, 0, 0),
    ended: false,
  });

  useFrame((_, delta) => {
    const s = sim.current;
    const R = rocket.current;
    if (!R) return;
    const props = live.current;
    const dt = clamp(delta, 0, 1 / 20);
    s.t += dt;
    const t = s.t;
    const moving = !reduced;
    if (props.launching && s.launchAt < 0) s.launchAt = t;
    const lt = s.launchAt >= 0 ? t - s.launchAt : -1;

    // Exit setup: land on the pilot's start pose. Its screen spot and size give the
    // world point (at the depth where the model looks that big), and the last stretch
    // of the curve arrives along the orbit's heading at about the orbit's speed.
    if (props.exiting && s.exitAt < 0) {
      s.exitAt = t;
      s.p0.copy(R.position);
      s.q0.copy(R.quaternion);
      const vw = Math.max(1, size.width);
      const vh = Math.max(1, size.height);
      const pose = pilotStartPose(getPilotState().target) ?? fallbackPose(vw, vh);
      const depth = clamp((ROCKET_LEN * vh) / (2 * TAN_HALF * Math.max(8, pose.length)), 3, 200);
      V_RAY.set((pose.x / vw) * 2 - 1, 1 - (pose.y / vh) * 2, 0.5).unproject(camera).sub(camera.position).normalize();
      // Distance along the ray whose depth in front of the camera is `depth`.
      V_AHEAD.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const along = depth / Math.max(0.2, V_RAY.dot(V_AHEAD));
      s.p3.copy(camera.position).addScaledVector(V_RAY, along);
      s.dirEnd.set(pose.dir[0], pose.dir[1], pose.dir[2]).normalize();
      const pxPerUnit = vh / (2 * TAN_HALF * depth);
      // Lead-in length so the arrival speed matches the orbit, capped to stay on screen.
      const halfW = depth * TAN_HALF * Math.max(0.3, rig.current.aspect);
      const lead = clamp(pose.speed / pxPerUnit / ((3 * 0.35) / EXIT_TIME), 3, Math.min(30, halfW * 1.2));
      s.p2.copy(s.p3).addScaledVector(s.dirEnd, -lead);
      // The first swoop goes up and to the right; on narrow (portrait) screens it stays
      // mostly upward so the rocket doesn't leave the side of the screen.
      const wide = clamp(rig.current.aspect / 1.2, 0.15, 1);
      s.p1.copy(s.p0).add(V_DIR.set(1.2 * wide, 2.2, 1.0));
      orientRocket(s.qEnd, s.dirEnd, pose.bank);
    }

    let flame = 1;
    if (s.exitAt >= 0) {
      const e = t - s.exitAt;
      const f = clamp(e / EXIT_TIME, 0, 1);
      const u = 0.35 * f + 0.65 * smooth(f);
      bezier(V_POS, s.p0, s.p1, s.p2, s.p3, u);
      R.position.copy(V_POS);
      if (u < 0.995) {
        bezier(V_AHEAD, s.p0, s.p1, s.p2, s.p3, Math.min(1, u + 0.005));
        V_DIR.subVectors(V_AHEAD, V_POS);
      } else {
        V_DIR.copy(s.dirEnd);
      }
      // Nose along the path with a bank and one barrel roll, then settle exactly on
      // the pilot's start orientation.
      const bank = 0.6 * Math.sin(Math.PI * f) + TAU * easeInOut((f - 0.15) / 0.4);
      orientRocket(Q_PATH, V_DIR, bank);
      Q_MID.slerpQuaternions(s.q0, Q_PATH, smooth(e / 0.25));
      R.quaternion.slerpQuaternions(Q_MID, s.qEnd, smooth((f - 0.72) / 0.28));
      flame = lerp(2.2, CRUISE_FLAME, smooth((f - 0.7) / 0.3));
      if (f > 0.3 && !s.cruiseSet) {
        s.cruiseSet = true;
        setCruising(true);
      }
      if (f >= 1 && !s.ended) {
        s.ended = true;
        pilotTakeOver();
        props.onFlightEnd?.();
      }
    } else {
      // Gentle bob and bank; on launch the flame flares and the hull rumbles.
      let px = ROCKET_BASE.x;
      let py = ROCKET_BASE.y + (moving ? 0.08 * Math.sin(t * 1.6) : 0);
      const pitch = PITCH + (moving ? 0.04 * Math.sin(t * 1.3 + 1) : 0);
      const roll = moving ? 0.12 * Math.sin(t * 1.1) : 0;
      if (lt >= 0) {
        const rumble = smooth((lt - 0.15) / 0.25);
        px += Math.sin(t * 61) * 0.015 * rumble;
        py += Math.sin(t * 53 + 1) * 0.015 * rumble;
        flame = 1 + 0.7 * smooth((lt - 0.2) / 0.25);
      }
      R.position.set(px, py, 0);
      R.rotation.set(roll, 0, pitch, 'ZYX');
    }
    const exitT = s.exitAt >= 0 ? t - s.exitAt : -1;

    const P = parts.current;
    updateFlame(P, t, flame, moving);
    // Joystick leans back as the doll pulls it.
    if (P.stick) P.stick.rotation.x = lt >= 0 ? -0.25 * smooth((lt - 0.3) / 0.2) : 0;

    // Cotton-ball puffs, left behind in world space (a dotted trail on the exit).
    const mesh = puffMesh.current;
    if (mesh && P.nozzle) {
      P.nozzle.getWorldPosition(V_NOZZLE);
      R.getWorldQuaternion(Q_MID);
      V_DIR.set(-1, 0, 0).applyQuaternion(Q_MID); // straight out of the nozzle
      if (moving) {
        const interval = exitT >= 0 ? 0.045 : lt >= 0 ? 0.07 : 0.13;
        if (s.nextPuff < t - 0.5) s.nextPuff = t;
        while (s.nextPuff <= t) {
          const pf = s.puffs[s.cursor];
          s.cursor = (s.cursor + 1) % PUFFS;
          const r = s.random;
          pf.born = s.nextPuff;
          pf.life = exitT >= 0 ? 0.8 + r() * 0.3 : 1.2 + r() * 0.5;
          pf.size = (0.75 + r() * 0.5) * (lt >= 0 ? 1.3 : 1);
          pf.p.set(V_NOZZLE.x + (r() - 0.5) * 0.1, V_NOZZLE.y + (r() - 0.5) * 0.1, V_NOZZLE.z + (r() - 0.5) * 0.1);
          if (exitT >= 0) {
            pf.v.set((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3).addScaledVector(V_DIR, 0.4);
          } else {
            const sp = 1.3 + r() * 0.5;
            pf.v.copy(V_DIR).multiplyScalar(sp).add(V_AHEAD.set(-0.6, -0.15 + (r() - 0.5) * 0.35, (r() - 0.5) * 0.3));
          }
          s.nextPuff += interval;
        }
      }
      for (let i = 0; i < PUFFS; i++) {
        let puff = 0;
        if (moving) {
          const pf = s.puffs[i];
          const age = t - pf.born;
          if (age >= 0 && age < pf.life) {
            const k = age / pf.life;
            V_POS.copy(pf.p).addScaledVector(pf.v, age);
            puff = pf.size * (0.1 + 0.16 * k) * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.15)), 0.5);
          }
        } else if (i < 5) {
          // Still scene: a short trail of puffs behind the nozzle.
          V_POS.set(V_NOZZLE.x - 0.45 - i * 0.42, V_NOZZLE.y - 0.08 - i * 0.07, V_NOZZLE.z);
          puff = 0.1 + i * 0.035;
        }
        if (puff <= 0) V_POS.set(0, -1000, 0);
        mesh.setMatrixAt(i, M4.compose(V_POS, Q_ID, V_SCALE.setScalar(Math.max(puff, 0.0001))));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Felt stars and paper clouds drift past; on the exit they shrink away quickly.
    const info = rig.current;
    if (info.ready) {
      const r = s.random;
      const away = exitT >= 0 ? 1 - smooth(exitT / 0.3) : 1;
      drifters.forEach((d, i) => {
        const obj = drifterObjs.current[i];
        if (!obj) return;
        const hh = (info.dist - d.z) * TAN_HALF;
        const hw = hh * info.aspect;
        if (!s.placed) {
          d.x = info.tx + (r() * 2 - 1) * hw;
          d.y = info.ty + (r() * 2 - 1) * hh;
        }
        if (moving) {
          d.x -= d.speed * dt * 1.6;
          d.y -= d.speed * dt * 0.5;
          d.rot += d.spin * dt;
        }
        const margin = d.cloud ? 1.4 * d.scale : 0.4;
        if (d.x < info.tx - hw - margin) {
          d.x = info.tx + hw + margin;
          d.y = info.ty + (r() * 2 - 1) * hh;
        }
        if (d.y < info.ty - hh - margin) {
          d.y = info.ty + hh + margin;
          d.x = info.tx + (r() * 2 - 1) * hw;
        }
        obj.position.set(d.x, d.y, d.z);
        obj.rotation.z = d.rot;
        obj.scale.setScalar(Math.max(0.0001, d.scale * away));
      });
      s.placed = true;
    }
  });

  return (
    <>
      <group ref={rocket} position={[ROCKET_BASE.x, ROCKET_BASE.y, 0]} rotation={[0, 0, PITCH]}>
        <RocketModel kit={kit} dollPose={cruising ? 'cruise' : launching ? 'control' : 'cockpit'} reduced={reduced} parts={parts} />
      </group>

      <instancedMesh ref={puffMesh} args={[kit.geo.puff, kit.mats.puff, PUFFS]} frustumCulled={false} />

      {drifters.map((d, i) => (
        <mesh
          key={i}
          ref={(o) => {
            drifterObjs.current[i] = o;
          }}
          geometry={d.cloud ? kit.geo.cloud : kit.geo.star}
          material={d.cloud ? kit.mats.cloud : kit.stars[d.mat]}
          scale={d.scale}
        />
      ))}
    </>
  );
}

/* =========================================================
   Canvas
   ========================================================= */
const DPR: [number, number] = [1, 1.5];
const GL_OPTIONS = { antialias: true, alpha: true, powerPreference: 'default' as const };
const CAMERA = { fov: FOV, near: 0.1, far: 60, position: [0, 0, 12] as [number, number, number] };
const FILL_STYLE = { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const };

export function RocketIntro({ launching, exiting = false, onFlightEnd, reduced, frame }: RocketIntroProps) {
  const [webgl] = useState(canUseWebGL);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const rig = useRef<RigInfo>({ ready: false, dist: 12, tx: 0, ty: 0, aspect: 1 });

  // Stop drawing while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!webgl) return null;

  return (
    <div aria-hidden="true" style={FILL_STYLE}>
      <QuietBoundary>
        <Canvas
          frameloop={hidden ? 'never' : reduced ? 'demand' : 'always'}
          dpr={DPR}
          flat
          gl={GL_OPTIONS}
          camera={CAMERA}
          style={FILL_STYLE}
        >
          <CameraRig frame={frame} rig={rig} />
          <CraftLights />
          <Suspense fallback={null}>
            <Flight launching={launching} exiting={exiting} onFlightEnd={onFlightEnd} reduced={reduced} rig={rig} />
          </Suspense>
        </Canvas>
      </QuietBoundary>
    </div>
  );
}
