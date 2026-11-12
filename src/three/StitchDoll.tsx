// An original little knitted yarn doll (teal egg body, cream felt head, pink
// beanie, mustard scarf) on a round felt stage. Built only from three.js
// primitives and procedural textures. Poses: 'dance' (looping hip-hop routine),
// 'wave' (friendly avatar), 'idle' (breathing only). Reduced motion forces idle.
// DollModel is the same doll as a plain R3F group (wrap it in <Suspense>), with
// two extra poses for the title-screen rocket: 'cockpit' and 'control'.
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import knitUrl from '../assets/textures/knit.jpg';
import feltUrl from '../assets/textures/felt.jpg';

export type StitchDollPose = 'dance' | 'wave' | 'idle';

/**
 * DollModel poses: the StitchDoll ones plus 'cockpit' (sitting in the rocket,
 * one arm on the rim, waving every few seconds) and 'control' (grabs the
 * joystick with the left mitten, thumbs-up with the right, two nods).
 */
export type DollPose = StitchDollPose | 'cockpit' | 'control';

export interface DollModelProps {
  pose: DollPose;
  /** Round felt stage disc under the feet (default true). */
  stage?: boolean;
  /** Soft blob shadow under the feet (default true). */
  shadow?: boolean;
  /** Turns off blinking; pass true under prefers-reduced-motion. */
  reduced?: boolean;
}

export interface StitchDollProps {
  /** 'dance' = looping routine, 'wave' = waves now and then, 'idle' = breathing only. */
  pose?: StitchDollPose;
  /** Show the round felt stage disc under the doll (default true). */
  stage?: boolean;
}

/* =========================================================
   Proportions (scene units; the doll is about 2 units tall)
   ========================================================= */
const TAU = Math.PI * 2;
const BPM = 100;
const BODY_H = 1;
const BODY_R = 0.47;
const BODY_K = 0.12; // > 0 makes the egg wider at the bottom
const HIPS_Y = 0.1;
const NECK_Y = 0.86;
const SHOULDER_Y = 0.6;
const SHOULDER_X = 0.42;
const HEAD_LIFT = 0.38;
const HEAD_R = 0.4;
const HEAD_SCALE: [number, number, number] = [1.06, 0.96, 1];
const FOOT_Y = 0.088;
const MODES: DollPose[] = ['dance', 'wave', 'idle', 'cockpit', 'control'];

/* =========================================================
   Small math helpers
   ========================================================= */
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
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU);
const hash2 = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A soft on/off window over [start, end) with fades centred on both edges. */
function windowW(b: number, start: number, end: number, fade: number) {
  return smooth((b - start) / fade + 0.5) * (1 - smooth((b - end) / fade + 0.5));
}
function loopWindow(b: number, start: number, end: number, fade: number, len: number) {
  return Math.max(windowW(b, start, end, fade), windowW(b + len, start, end, fade), windowW(b - len, start, end, fade));
}
/** Quick rise then slow settle, 0 at both ends: a landing squash. */
function impact(l: number) {
  return l < 0.15 ? smooth(l / 0.15) : 1 - smooth((l - 0.15) / 0.7);
}

/* =========================================================
   Poses. Arms: Out = sideways raise, Fwd = forward raise,
   Bend = elbow bends forward, Lift = elbow bends up in the
   sideways plane, Wrist = 1 turns the thumb to point along the
   forearm, Thumb = extra thumb size. l = screen-left arm,
   r = screen-right arm.
   ========================================================= */
const POSE_KEYS = [
  'x', 'hop', 'spin', 'twist', 'bob', 'squash', 'hipZ', 'lean',
  'headX', 'headY', 'headZ',
  'lOut', 'lFwd', 'lBend', 'lLift', 'rOut', 'rFwd', 'rBend', 'rLift',
  'lWrist', 'rWrist', 'lThumb', 'rThumb',
  'lFoot', 'rFoot',
] as const;
type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;

function makePose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

function zeroPose(p: Pose) {
  for (const k of POSE_KEYS) p[k] = 0;
}

function restPose(p: Pose) {
  zeroPose(p);
  p.lOut = p.rOut = 0.42;
  p.lFwd = p.rFwd = 0.08;
  p.lBend = p.rBend = 0.3;
}

function addPose(out: Pose, src: Pose, w: number) {
  for (const k of POSE_KEYS) out[k] += src[k] * w;
}

/** Step-touch with knee bounce, hip sway, alternating arm pumps and head nods. */
function groove(p: Pose, b: number) {
  restPose(p);
  const ph = b - Math.floor(b);
  const down = 0.5 + 0.5 * Math.cos(TAU * ph); // 1 on the beat
  const sway = Math.sin((Math.PI * b) / 2);
  p.x = 0.2 * Math.sign(sway) * Math.pow(Math.abs(sway), 0.6);
  p.bob = -0.075 * down;
  p.squash = 0.09 * down - 0.03;
  p.hipZ = 0.13 * Math.sin(Math.PI * b);
  p.twist = 0.16 * Math.cos((Math.PI * b) / 2);
  p.lean = 0.06 * down;
  p.headX = 0.17 * down - 0.05;
  p.headY = 0.1 * Math.cos((Math.PI * b) / 2);
  p.headZ = -0.09 * Math.sin(Math.PI * b);
  const punch = ph < 0.2 ? smooth(ph / 0.2) : 1 - smooth((ph - 0.2) / 0.8);
  const even = Math.floor(b) % 2 === 0;
  const pl = even ? punch : 0;
  const pr = even ? 0 : punch;
  p.lFwd = 0.55 + 1.75 * pl;
  p.lBend = 1.25 - 0.95 * pl;
  p.lOut = 0.38 + 0.25 * pl;
  p.rFwd = 0.55 + 1.75 * pr;
  p.rBend = 1.25 - 0.95 * pr;
  p.rOut = 0.38 + 0.25 * pr;
  const lift = Math.sin(Math.PI * b);
  p.lFoot = 0.07 * Math.max(0, lift);
  p.rFoot = 0.07 * Math.max(0, -lift);
}

/** Arm wave: a ripple runs hand, elbow, shoulder, head, shoulder, elbow, hand and back. */
function armWave(p: Pose, b: number) {
  restPose(p);
  const ph = b - Math.floor(b);
  const down = 0.5 + 0.5 * Math.cos(TAU * ph);
  const s = b < 2 ? b / 2 : 2 - b / 2;
  const pos = smooth(s) * 7 - 0.5;
  const at = (i: number) => Math.exp(-((pos - i) ** 2) * 1.1);
  p.lOut = 1.4 + 0.5 * at(2);
  p.lFwd = 0.12;
  p.lBend = 0.05;
  p.lLift = 1.0 * at(1) + 0.5 * at(0) - 0.35 * at(2);
  p.rOut = 1.4 + 0.5 * at(4);
  p.rFwd = 0.12;
  p.rBend = 0.05;
  p.rLift = 1.0 * at(5) + 0.5 * at(6) - 0.35 * at(4);
  const tilt = at(2) - at(4);
  p.headZ = -0.22 * tilt;
  p.headX = 0.08 * down - 0.04 - 0.12 * at(3);
  p.hipZ = 0.1 * tilt;
  p.bob = -0.04 * down;
  p.squash = 0.05 * down - 0.02;
}

/** Crouch, hop with a full spin and hands up, then a squashy landing. u: 0..1 over two beats. */
function hopSpin(p: Pose, u: number, dir: number) {
  restPose(p);
  if (u < 0.2) {
    const a = smooth(u / 0.2);
    p.bob = -0.12 * a;
    p.squash = 0.17 * a;
    p.lean = 0.12 * a;
    p.headX = 0.1 * a;
    p.lFwd = p.rFwd = lerp(0.08, -0.45, a);
    p.lBend = p.rBend = lerp(0.3, 0.5, a);
  } else if (u < 0.74) {
    const a = (u - 0.2) / 0.54;
    const arc = Math.sin(Math.PI * a);
    const up = smooth(a / 0.3);
    p.hop = 0.36 * arc;
    p.spin = dir * TAU * easeInOut(a);
    p.bob = -0.12 * (1 - up);
    p.squash = a < 0.5 ? lerp(0.17, -0.1, smooth(a / 0.2)) : lerp(-0.1, 0, smooth((a - 0.5) / 0.5));
    p.lean = 0.12 * (1 - up);
    p.headX = lerp(0.1, -0.16, up);
    p.lOut = p.rOut = lerp(0.42, 2.5, up);
    p.lFwd = p.rFwd = lerp(-0.45, 0.2, up);
    p.lBend = p.rBend = lerp(0.5, 0.25, up);
    p.lFoot = p.rFoot = 0.05 * arc;
  } else {
    // A full turn equals no turn, so spin is back to 0 here (blends stay clean).
    const l = (u - 0.74) / 0.26;
    const imp = impact(l);
    const settle = smooth(l / 0.7);
    p.squash = 0.18 * imp;
    p.bob = -0.1 * imp;
    p.headX = lerp(-0.16, 0.06, settle);
    p.lOut = p.rOut = lerp(2.5, 0.42, settle);
    p.lFwd = p.rFwd = lerp(0.2, 0.08, settle);
    p.lBend = p.rBend = lerp(0.25, 0.3, settle);
  }
}

const MOVE = makePose();

/** 16-beat loop: groove 8, arm wave 4, groove 2, hop and spin 2. */
function dancePose(p: Pose, t: number) {
  const b = (t * BPM) / 60;
  const loop = Math.floor(b / 16);
  const lb = b - loop * 16;
  const fade = 0.35;
  const wGroove = loopWindow(lb, 0, 8, fade, 16) + loopWindow(lb, 12, 14, fade, 16);
  const wWave = loopWindow(lb, 8, 12, fade, 16);
  const wHop = loopWindow(lb, 14, 16, fade, 16);
  zeroPose(p);
  groove(MOVE, b);
  addPose(p, MOVE, wGroove);
  if (wWave > 0) {
    armWave(MOVE, clamp(lb - 8, 0, 4));
    addPose(p, MOVE, wWave);
  }
  if (wHop > 0) {
    // Just after the loop restarts, the hop is still fading out: treat it as finished.
    const hb = lb < 8 ? lb + 16 : lb;
    hopSpin(MOVE, clamp((hb - 14) / 2, 0, 1), loop % 2 === 0 ? 1 : -1);
    addPose(p, MOVE, wHop);
  }
}

/** Avatar: waves one mitten every few seconds, with an occasional happy hop. */
function wavePose(p: Pose, t: number) {
  restPose(p);
  const cycle = 6.4;
  const k = Math.floor(t / cycle);
  const c = t - k * cycle;
  const w = smooth((c - 0.8) / 0.45) * (1 - smooth((c - 3.1) / 0.45));
  const wag = Math.sin(TAU * 2 * Math.max(0, c - 0.8));
  p.rOut = lerp(0.42, 2.35, w);
  p.rFwd = lerp(0.08, 0.3, w);
  p.rBend = lerp(0.3, 0.12, w);
  p.rLift = (0.35 + 0.35 * wag) * w;
  p.lOut = 0.42 + 0.06 * w;
  p.headZ = 0.12 * w;
  p.headX = -0.04 * w;
  p.hipZ = -0.035 * wag * w;
  p.squash = 0.012 * wag * w;

  if (k % 3 === 2) {
    const h = (c - 3.7) / 0.9;
    if (h > 0 && h < 1) {
      if (h < 0.2) {
        const a = smooth(h / 0.2);
        p.squash = 0.1 * a;
        p.bob = -0.06 * a;
      } else if (h < 0.7) {
        const a = (h - 0.2) / 0.5;
        p.hop = 0.16 * Math.sin(Math.PI * a);
        p.squash = a < 0.5 ? lerp(0.1, -0.06, smooth(a / 0.25)) : lerp(-0.06, 0, smooth((a - 0.5) / 0.5));
        p.bob = -0.06 * (1 - smooth(a / 0.25));
        p.headX = -0.1 * Math.sin(Math.PI * a);
      } else {
        const imp = impact((h - 0.7) / 0.3);
        p.squash = 0.1 * imp;
        p.bob = -0.05 * imp;
      }
      const arms = 0.55 * Math.sin(Math.PI * h);
      p.lOut += arms;
      p.rOut += arms;
    }
  }
}

/** Sitting in the rocket: left arm resting on the hull, right mitten waves every few seconds. */
function cockpitPose(p: Pose, t: number) {
  restPose(p);
  p.lOut = 1.2;
  p.lFwd = 0.15;
  p.lBend = 0.35;
  const cycle = 3.8;
  const c = t - Math.floor(t / cycle) * cycle;
  const w = smooth((c - 0.3) / 0.4) * (1 - smooth((c - 2.6) / 0.4));
  const wag = Math.sin(TAU * 2 * Math.max(0, c - 0.3));
  p.rOut = lerp(1.2, 2.35, w);
  p.rFwd = lerp(0.15, 0.3, w);
  p.rBend = lerp(0.35, 0.12, w);
  p.rLift = (0.35 + 0.35 * wag) * w;
  p.headZ = 0.12 * w;
  p.headX = -0.04 * w + 0.03 * Math.sin((TAU * t) / 2.4);
  p.hipZ = -0.03 * wag * w;
}

/** "Takes control": grab the joystick, thumbs-up, two nods. tc = seconds since it started. */
function controlPose(p: Pose, tc: number) {
  restPose(p);
  const grab = smooth(tc / 0.25);
  p.lOut = lerp(1.2, 0.15, grab);
  p.lFwd = lerp(0.15, 1.2, grab);
  p.lBend = lerp(0.35, 0.5, grab);
  p.lean = 0.05 * grab;
  const up = smooth((tc - 0.1) / 0.3);
  p.rOut = lerp(1.2, 0.3, up);
  p.rFwd = lerp(0.15, 0.9, up);
  p.rBend = lerp(0.35, 1.9, up);
  p.rWrist = up;
  p.rThumb = 0.7 * up;
  const nod = clamp((tc - 0.15) / 0.7, 0, 1);
  const n = Math.sin(TAU * nod) ** 2;
  p.headX = 0.18 * n;
  p.squash = 0.04 * n;
}

/* =========================================================
   Procedural textures (built from the CC0 photos)
   ========================================================= */
function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Grey version of a photo, contrast-stretched into [lo, hi] so a material colour can tint it. */
function levels(img: CanvasImageSource, lo: number, hi: number, size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0, size, size);
  try {
    const data = ctx.getImageData(0, 0, size, size);
    const px = data.data;
    const n = size * size;
    const lum = new Float32Array(n);
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < n; i++) {
      const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      lum[i] = l;
      sum += l;
      sum2 += l * l;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(1e-6, sum2 / n - mean * mean));
    const mid = (lo + hi) * 127.5;
    const spread = ((hi - lo) * 255) / 4; // +-2 sd fills the range
    for (let i = 0; i < n; i++) {
      const v = mid + ((lum[i] - mean) / sd) * spread;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // A tainted canvas keeps the raw photo; still fine as a texture.
  }
  return c;
}

/** Chunky stockinette: 8 x 10 rows of V stitches per tile, with the yarn fibre multiplied in. */
function knitCanvas(fibre: HTMLCanvasElement) {
  const size = 512;
  const cols = 8;
  const rows = 10;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = '#7c7c7c';
  ctx.fillRect(0, 0, size, size);
  const w = size / cols;
  const h = size / rows;
  for (let r = -1; r <= rows; r++) {
    for (let q = -1; q <= cols; q++) {
      const tone = 230 + Math.round(hash2((q + cols) % cols, (r + rows) % rows) * 25);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate((q + 0.5) * w + side * w * 0.21, (r + 0.5) * h);
        ctx.rotate(side * 0.52);
        const g = ctx.createRadialGradient(0, -h * 0.12, h * 0.05, 0, 0, h * 0.64);
        g.addColorStop(0, `rgb(${tone} ${tone} ${tone})`);
        g.addColorStop(0.55, `rgb(${tone - 32} ${tone - 32} ${tone - 32})`);
        g.addColorStop(1, 'rgb(128 128 128)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.23, h * 0.62, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(fibre, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** Mustard and cream scarf stripes. */
function stripeCanvas() {
  const c = makeCanvas(256, 32);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const n = 12;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f2ae2f' : '#fff0cc';
    ctx.fillRect((i * 256) / n, 0, 256 / n + 1, 32);
  }
  return c;
}

/** Soft round blob for the contact shadow (used as an alpha map). */
function blobCanvas() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, '#b8b8b8');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

function eggPoints() {
  const pts: THREE.Vector2[] = [];
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI;
    const r = BODY_R * Math.sin(th) * (1 + BODY_K * Math.cos(th));
    pts.push(new THREE.Vector2(Math.max(0, r), (BODY_H / 2) * (1 - Math.cos(th))));
  }
  return pts;
}

/** A slightly slouchy, pointed dome, from the brim up to the crown. */
function beaniePoints() {
  const pts: THREE.Vector2[] = [];
  const n = 20;
  const start = 0.24;
  for (let i = 0; i <= n; i++) {
    const phi = start + (i / n) * (Math.PI / 2 - start);
    const s = Math.sin(phi);
    pts.push(new THREE.Vector2(Math.max(0, 0.428 * Math.cos(phi)), 0.428 * s + 0.07 * Math.pow(s, 8)));
  }
  return pts;
}

/* =========================================================
   Materials and shared geometry
   ========================================================= */
/**
 * Knit and felt fabric materials from the CC0 photos: knit(color, repeatU, repeatV)
 * and felt(...) give tinted MeshPhysicalMaterials with sheen and bump. Shared by
 * the doll and the title-screen rocket. dispose() frees the textures it made.
 */
export function makeCraftKit(knitImg: CanvasImageSource, feltImg: CanvasImageSource) {
  const knitC = knitCanvas(levels(knitImg, 0.8, 1));
  const feltC = levels(feltImg, 0.86, 1);

  const textures: THREE.Texture[] = [];
  const base = (canvas: HTMLCanvasElement | HTMLImageElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    textures.push(t);
    return t;
  };
  const knitMap = base(knitC, true);
  const knitBump = base(knitC, false);
  const feltMap = base(feltC, true);
  const feltBump = base(feltC, false);

  // Clones share the image source, so each picture is uploaded once.
  const rep = (src: THREE.Texture, u: number, v: number, rotation = 0) => {
    const t = src.clone();
    t.repeat.set(u, v);
    if (rotation) {
      t.center.set(0.5, 0.5);
      t.rotation = rotation;
    }
    textures.push(t);
    return t;
  };

  const fabric = (color: string, map: THREE.Texture, bump: THREE.Texture, bumpScale: number, roughness = 0.92) =>
    new THREE.MeshPhysicalMaterial({
      color,
      map,
      bumpMap: bump,
      bumpScale,
      roughness,
      metalness: 0,
      sheen: 0.85,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
    });
  const knit = (color: string, u: number, v: number, bump = 3) => fabric(color, rep(knitMap, u, v), rep(knitBump, u, v), bump);
  const felt = (color: string, u: number, v: number, bump = 1.4) => fabric(color, rep(feltMap, u, v), rep(feltBump, u, v), bump);

  return {
    base,
    rep,
    fabric,
    knit,
    felt,
    knitBump,
    dispose() {
      for (const t of textures) t.dispose();
    },
  };
}

export type CraftKit = ReturnType<typeof makeCraftKit>;

function makeKit(knitImg: CanvasImageSource, feltImg: CanvasImageSource) {
  const craft = makeCraftKit(knitImg, feltImg);
  const { base, rep, fabric, knit, felt, knitBump } = craft;
  const stripeMap = base(stripeCanvas(), true);
  const blob = base(blobCanvas(), false);

  const mats = {
    body: knit('#47d1c1', 3, 2),
    arm: knit('#47d1c1', 0.5, 0.75),
    beanie: knit('#ff86b8', 3, 0.75),
    brim: knit('#f86aa6', 4, 0.5, 3.5),
    mitten: knit('#ff86b8', 0.75, 0.5),
    cuff: knit('#ffc54a', 1, 0.25),
    scarf: fabric('#ffffff', rep(stripeMap, 1, 1), rep(knitBump, 3, 0.5), 3),
    tail: fabric('#ffffff', rep(stripeMap, 0.42, 0.42, Math.PI / 2), rep(knitBump, 0.5, 0.75), 3),
    head: felt('#fff4e3', 2, 1),
    cheek: felt('#ff9fbd', 0.3, 0.3),
    foot: felt('#3d4b8a', 0.6, 0.6),
    pom: felt('#ffd0e2', 1.5, 1, 5),
    discBase: felt('#ef7f61', 1.5, 1.5),
    discTop: felt('#fbb38f', 1.2, 1.2),
    eye: new THREE.MeshPhysicalMaterial({ color: '#16121b', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    smile: new THREE.MeshStandardMaterial({ color: '#4a2230', roughness: 0.75 }),
    thread: new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.8 }),
  };
  const shadow = new THREE.MeshBasicMaterial({
    color: '#2a1838',
    transparent: true,
    opacity: 0.42,
    alphaMap: blob,
    depthWrite: false,
  });
  const geo = {
    body: new THREE.LatheGeometry(eggPoints(), 48),
    beanie: new THREE.LatheGeometry(beaniePoints(), 40),
    stitch: new THREE.CapsuleGeometry(0.011, 0.05, 2, 6),
    smileStitch: new THREE.CapsuleGeometry(0.0105, 0.018, 2, 6),
  };

  return {
    mats,
    shadow,
    geo,
    dispose() {
      craft.dispose();
      for (const m of Object.values(mats)) m.dispose();
      shadow.dispose();
      for (const g of Object.values(geo)) g.dispose();
    },
  };
}

type Kit = ReturnType<typeof makeKit>;

/* =========================================================
   Scene pieces
   ========================================================= */
/** Places children on the head surface, facing outwards (az: around, el: up). */
function OnHead({ az, el, lift = 0, children }: { az: number; el: number; lift?: number; children: ReactNode }) {
  const r = HEAD_R + lift;
  const position: [number, number, number] = [
    r * Math.sin(az) * Math.cos(el) * HEAD_SCALE[0],
    r * Math.sin(el) * HEAD_SCALE[1],
    r * Math.cos(az) * Math.cos(el) * HEAD_SCALE[2],
  ];
  return (
    <group position={position} rotation={[-el, az, 0, 'YXZ']}>
      {children}
    </group>
  );
}

/** A running stitch around a circle: little capsules lying along the tangent. */
function StitchRing({ radius, y, count, kit }: { radius: number; y: number; count: number; kit: Kit }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      p.set(Math.sin(a) * radius, y, Math.cos(a) * radius);
      e.set(Math.PI / 2, a + Math.PI / 2, 0, 'YXZ');
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [radius, y, count]);
  return <instancedMesh ref={ref} args={[kit.geo.stitch, kit.mats.thread, count]} />;
}

function Stage({ kit }: { kit: Kit }) {
  return (
    <group>
      <mesh material={kit.mats.discBase} position={[0, -0.085, 0]}>
        <cylinderGeometry args={[1.08, 1.12, 0.11, 64]} />
      </mesh>
      <mesh material={kit.mats.discTop} position={[0, -0.015, 0]}>
        <cylinderGeometry args={[0.9, 0.92, 0.03, 64]} />
      </mesh>
      <StitchRing radius={0.82} y={0.004} count={38} kit={kit} />
      <StitchRing radius={1.0} y={-0.026} count={46} kit={kit} />
    </group>
  );
}

type Bind = (name: PartName) => (o: THREE.Object3D | null) => void;

function Arm({ side, kit, bind }: { side: 1 | -1; kit: Kit; bind: Bind }) {
  return (
    <group ref={bind(side < 0 ? 'shoulderL' : 'shoulderR')} position={[side * SHOULDER_X, SHOULDER_Y, 0]}>
      <mesh material={kit.mats.arm} position={[0, -0.11, 0]}>
        <capsuleGeometry args={[0.085, 0.12, 4, 12]} />
      </mesh>
      <group ref={bind(side < 0 ? 'elbowL' : 'elbowR')} position={[0, -0.21, 0]}>
        <mesh material={kit.mats.arm} position={[0, -0.085, 0]}>
          <capsuleGeometry args={[0.08, 0.1, 4, 12]} />
        </mesh>
        <mesh material={kit.mats.cuff} position={[0, -0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.08, 0.032, 8, 20]} />
        </mesh>
        <group ref={bind(side < 0 ? 'handL' : 'handR')} position={[0, -0.2, 0]}>
          <mesh material={kit.mats.mitten} scale={[1, 1.08, 0.9]}>
            <sphereGeometry args={[0.115, 20, 16]} />
          </mesh>
          <mesh ref={bind(side < 0 ? 'thumbL' : 'thumbR')} material={kit.mats.mitten} position={[-side * 0.075, 0.035, 0.05]}>
            <sphereGeometry args={[0.048, 12, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Eye({ side, kit, bind }: { side: 1 | -1; kit: Kit; bind: Bind }) {
  return (
    <OnHead az={side * 0.3} el={-0.12}>
      <group ref={bind(side < 0 ? 'eyeL' : 'eyeR')}>
        <mesh material={kit.mats.eye} scale={[0.8, 1.25, 0.5]}>
          <sphereGeometry args={[0.062, 20, 16]} />
        </mesh>
        <mesh material={kit.mats.glint} position={[-0.019, 0.034, 0.024]}>
          <sphereGeometry args={[0.016, 10, 8]} />
        </mesh>
        <mesh material={kit.mats.glint} position={[0.016, -0.026, 0.024]}>
          <sphereGeometry args={[0.008, 8, 6]} />
        </mesh>
      </group>
    </OnHead>
  );
}

/** Five running stitches along a lower arc. */
function Smile({ kit }: { kit: Kit }) {
  const stitches = useMemo(() => {
    const out: { pos: [number, number, number]; rot: number }[] = [];
    const radius = 0.085;
    const cy = 0.05;
    for (let i = 0; i < 5; i++) {
      const phi = -2.55 + (i * 1.96) / 4;
      const x = radius * Math.cos(phi);
      const y = cy + radius * Math.sin(phi);
      out.push({ pos: [x, y, 0.004 - (x * x + y * y) / (2 * HEAD_R)], rot: phi });
    }
    return out;
  }, []);
  return (
    <OnHead az={0} el={-0.36}>
      {stitches.map((s, i) => (
        <mesh key={i} geometry={kit.geo.smileStitch} material={kit.mats.smile} position={s.pos} rotation={[0, 0, s.rot]} />
      ))}
    </OnHead>
  );
}

/* =========================================================
   The animated doll
   ========================================================= */
const PART_NAMES = [
  'rig', 'hips', 'body', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
  'thumbL', 'thumbR', 'neck', 'headPivot', 'eyeL', 'eyeR', 'pom', 'tailA', 'tailB', 'footL', 'footR',
] as const;
type PartName = (typeof PART_NAMES)[number] | 'shadow';
type Parts = Record<(typeof PART_NAMES)[number], THREE.Object3D> & { shadow?: THREE.Object3D };

function hasAll(p: Partial<Parts>): p is Parts {
  return PART_NAMES.every((n) => p[n] !== undefined);
}

interface Spring {
  p: THREE.Vector3;
  v: THREE.Vector3;
}

const OUT = makePose();
const TMP = makePose();
const V_ANCHOR = new THREE.Vector3();
const V_D = new THREE.Vector3();
const V_ACC = new THREE.Vector3();
const V_G = new THREE.Vector3();
const Q_INV = new THREE.Quaternion();

/** Damped spring chasing a target point, sub-stepped so it is frame-rate independent. */
function stepSpring(sp: Spring, target: THREE.Vector3, dt: number, k: number, c: number) {
  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    V_ACC.subVectors(target, sp.p).multiplyScalar(k).addScaledVector(sp.v, -c);
    sp.v.addScaledVector(V_ACC, h);
    sp.p.addScaledVector(sp.v, h);
  }
}

/** Lag of a spring behind its anchor, in the anchor parent's local frame. */
function lagLocal(obj: THREE.Object3D, sp: Spring, dt: number, k: number, c: number) {
  obj.getWorldPosition(V_ANCHOR);
  stepSpring(sp, V_ANCHOR, dt, k, c);
  V_D.subVectors(sp.p, V_ANCHOR);
  if (obj.parent) {
    obj.parent.getWorldQuaternion(Q_INV).invert();
    V_D.applyQuaternion(Q_INV);
  }
  return V_D;
}

/** The doll as a plain R3F group (feet on y = 0, about 2 units tall). Suspends while textures load. */
export function DollModel({ pose, stage = true, shadow = true, reduced = false }: DollModelProps) {
  const images = useLoader(THREE.ImageLoader, [knitUrl, feltUrl]) as unknown as HTMLImageElement[];
  const kit = useMemo(() => makeKit(images[0], images[1]), [images]);
  useEffect(() => () => kit.dispose(), [kit]);

  const parts = useRef<Partial<Parts>>({});
  const bind = useMemo<Bind>(() => {
    const cache = new Map<PartName, (o: THREE.Object3D | null) => void>();
    return (name) => {
      let fn = cache.get(name);
      if (!fn) {
        fn = (o) => {
          if (o) parts.current[name] = o;
          else delete parts.current[name];
        };
        cache.set(name, fn);
      }
      return fn;
    };
  }, []);

  const settings = useRef({ pose, reduced });
  useEffect(() => {
    settings.current = { pose, reduced };
  }, [pose, reduced]);

  const sim = useRef({
    t: 0,
    weights: { dance: 0, wave: 0, idle: 0, cockpit: 0, control: 0, [pose]: 1 } as Record<DollPose, number>,
    target: pose,
    since: 0,
    started: false,
    prevSpin: 0,
    flare: 0,
    blinkAt: 2.2,
    pom: { p: new THREE.Vector3(), v: new THREE.Vector3() } as Spring,
    tailA: { p: new THREE.Vector3(), v: new THREE.Vector3() } as Spring,
    tailB: { p: new THREE.Vector3(), v: new THREE.Vector3() } as Spring,
  });

  useFrame((_, delta) => {
    const P = parts.current;
    if (!hasAll(P)) return;
    const s = sim.current;
    const { pose: target, reduced: still } = settings.current;
    const dt = clamp(delta, 0, 1 / 20);
    s.t += dt;
    const t = s.t;

    if (target !== s.target) {
      s.target = target;
      s.since = t;
    }

    // Fade between modes so switching never pops ('control' snaps in quickly).
    const rate = 1 - Math.exp(-dt * (target === 'control' ? 12 : 3));
    let total = 0;
    for (const m of MODES) {
      s.weights[m] += ((m === target ? 1 : 0) - s.weights[m]) * rate;
      total += s.weights[m];
    }
    zeroPose(OUT);
    if (s.weights.dance > 0.001) {
      dancePose(TMP, t);
      addPose(OUT, TMP, s.weights.dance / total);
    }
    if (s.weights.wave > 0.001) {
      wavePose(TMP, t);
      addPose(OUT, TMP, s.weights.wave / total);
    }
    if (s.weights.idle > 0.001) {
      restPose(TMP);
      addPose(OUT, TMP, s.weights.idle / total);
    }
    if (s.weights.cockpit > 0.001) {
      cockpitPose(TMP, t);
      addPose(OUT, TMP, s.weights.cockpit / total);
    }
    if (s.weights.control > 0.001) {
      controlPose(TMP, target === 'control' ? t - s.since : 2);
      addPose(OUT, TMP, s.weights.control / total);
    }

    // Slow breathing under everything.
    const breath = Math.sin((TAU * t) / 3.8);
    OUT.squash -= 0.022 * breath;
    OUT.lOut += 0.03 * breath;
    OUT.rOut += 0.03 * breath;
    OUT.headX -= 0.02 * breath;

    // Apply the pose.
    P.rig.position.set(OUT.x, OUT.hop, 0);
    P.rig.rotation.y = OUT.spin;
    P.hips.position.y = HIPS_Y + OUT.bob;
    P.hips.rotation.set(OUT.lean, OUT.twist, OUT.hipZ);
    const sy = 1 - OUT.squash;
    const sx = 1 + OUT.squash * 0.6;
    P.body.scale.set(sx, sy, sx);
    P.shoulderL.position.set(-SHOULDER_X * sx, SHOULDER_Y * sy, 0);
    P.shoulderL.rotation.set(-OUT.lFwd, 0, -OUT.lOut);
    P.shoulderR.position.set(SHOULDER_X * sx, SHOULDER_Y * sy, 0);
    P.shoulderR.rotation.set(-OUT.rFwd, 0, OUT.rOut);
    P.elbowL.rotation.set(-OUT.lBend, 0, -OUT.lLift);
    P.elbowR.rotation.set(-OUT.rBend, 0, OUT.rLift);
    P.handL.rotation.z = (-OUT.lWrist * Math.PI) / 2;
    P.handR.rotation.z = (OUT.rWrist * Math.PI) / 2;
    // A bigger thumb also sits further out, so a thumbs-up reads even when small.
    P.thumbL.scale.setScalar(1 + OUT.lThumb);
    P.thumbL.position.set(0.075 * (1 + 0.5 * OUT.lThumb), 0.035 * (1 + 0.5 * OUT.lThumb), 0.05);
    P.thumbR.scale.setScalar(1 + OUT.rThumb);
    P.thumbR.position.set(-0.075 * (1 + 0.5 * OUT.rThumb), 0.035 * (1 + 0.5 * OUT.rThumb), 0.05);
    P.neck.position.y = NECK_Y * sy;
    P.headPivot.rotation.set(OUT.headX, OUT.headY, OUT.headZ);
    P.footL.position.y = FOOT_Y + OUT.lFoot;
    P.footR.position.y = FOOT_Y + OUT.rFoot;

    if (P.shadow) {
      const air = clamp(OUT.hop / 0.4, 0, 1);
      P.shadow.position.x = OUT.x;
      P.shadow.scale.setScalar(1 - 0.45 * air);
      kit.shadow.opacity = 0.42 * (1 - 0.5 * air);
    }

    // Blink now and then (not under reduced motion).
    let lid = 1;
    if (!still) {
      if (t > s.blinkAt + 0.16) s.blinkAt = t + 2.6 + Math.random() * 2.4;
      const u = (t - s.blinkAt) / 0.16;
      if (u > 0 && u < 1) lid = 1 - 0.88 * Math.sin(Math.PI * u);
    }
    P.eyeL.scale.y = lid;
    P.eyeR.scale.y = lid;

    // Follow-through: pom-pom and scarf tails lag behind on springs.
    if (!s.started) {
      P.pom.getWorldPosition(s.pom.p);
      P.tailA.getWorldPosition(s.tailA.p);
      P.tailB.getWorldPosition(s.tailB.p);
      s.started = true;
    }
    const pomLag = lagLocal(P.pom, s.pom, dt, 140, 10);
    P.pom.rotation.z = clamp(-pomLag.x * 14, -0.75, 0.75);
    P.pom.rotation.x = clamp(pomLag.z * 14, -0.75, 0.75);

    const spinStep = wrapAngle(OUT.spin - s.prevSpin);
    s.prevSpin = OUT.spin;
    const omega = dt > 0 ? Math.abs(spinStep) / dt : 0;
    s.flare += (Math.min(1.1, omega * 0.12) - s.flare) * (1 - Math.exp(-dt * 8));

    const scarf = P.tailA.parent;
    if (scarf) {
      // Tails hang with gravity, whatever the body is doing.
      scarf.getWorldQuaternion(Q_INV).invert();
      V_G.set(0, -1, 0).applyQuaternion(Q_INV);
      const gz = Math.atan2(V_G.x, -V_G.y);
      const gx = Math.atan2(-V_G.z, -V_G.y);
      const tails: [THREE.Object3D, Spring, number, number][] = [
        [P.tailA, s.tailA, 120, 9],
        [P.tailB, s.tailB, 95, 7],
      ];
      for (const [tail, spring, k, c] of tails) {
        const lag = lagLocal(tail, spring, dt, k, c);
        tail.rotation.z = gz + clamp(lag.x * 22, -1.1, 1.1) + s.flare * 0.35;
        tail.rotation.x = Math.min(-0.3, -0.3 + gx + clamp(-lag.z * 22, -1.1, 1.1) - s.flare);
      }
    }
  });

  return (
    <group>
      {stage ? <Stage kit={kit} /> : null}
      {shadow ? (
        <mesh
          ref={bind('shadow')}
          material={kit.shadow}
          position={[0, stage ? 0.006 : 0.003, 0.02]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <circleGeometry args={[0.62, 40]} />
        </mesh>
      ) : null}

      <group ref={bind('rig')}>
        <group ref={bind('footL')} position={[-0.2, FOOT_Y, 0.07]} rotation={[0, -0.18, 0]}>
          <mesh material={kit.mats.foot} scale={[1, 0.55, 1.3]}>
            <sphereGeometry args={[0.16, 24, 16]} />
          </mesh>
        </group>
        <group ref={bind('footR')} position={[0.2, FOOT_Y, 0.07]} rotation={[0, 0.18, 0]}>
          <mesh material={kit.mats.foot} scale={[1, 0.55, 1.3]}>
            <sphereGeometry args={[0.16, 24, 16]} />
          </mesh>
        </group>

        <group ref={bind('hips')} position={[0, HIPS_Y, 0]}>
          <group ref={bind('body')}>
            <mesh geometry={kit.geo.body} material={kit.mats.body} />
          </group>
          <Arm side={-1} kit={kit} bind={bind} />
          <Arm side={1} kit={kit} bind={bind} />

          <group ref={bind('neck')} position={[0, NECK_Y, 0]}>
            {/* Scarf: a striped ring with a knot and two swinging tails */}
            <group rotation={[0, 0, 0.06]}>
              <mesh material={kit.mats.scarf} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.29, 0.085, 14, 48]} />
              </mesh>
              <mesh material={kit.mats.scarf} position={[0.13, -0.025, 0.33]}>
                <sphereGeometry args={[0.075, 16, 12]} />
              </mesh>
              <group ref={bind('tailA')} position={[0.09, -0.03, 0.32]} rotation={[-0.3, -0.15, 0]}>
                <mesh material={kit.mats.tail} position={[0, -0.2, 0]} scale={[1, 1, 0.38]}>
                  <capsuleGeometry args={[0.068, 0.26, 4, 12]} />
                </mesh>
              </group>
              <group ref={bind('tailB')} position={[0.18, -0.035, 0.29]} rotation={[-0.3, -0.35, 0]}>
                <mesh material={kit.mats.tail} position={[0, -0.165, 0]} scale={[1, 1, 0.38]}>
                  <capsuleGeometry args={[0.062, 0.2, 4, 12]} />
                </mesh>
              </group>
            </group>

            <group ref={bind('headPivot')}>
              <group position={[0, HEAD_LIFT, 0]}>
                <mesh material={kit.mats.head} scale={HEAD_SCALE}>
                  <sphereGeometry args={[HEAD_R, 40, 28]} />
                </mesh>
                <group scale={HEAD_SCALE}>
                  <mesh geometry={kit.geo.beanie} material={kit.mats.beanie} />
                  <mesh material={kit.mats.brim} position={[0, 0.112, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.405, 0.058, 12, 64]} />
                  </mesh>
                </group>
                <group ref={bind('pom')} position={[0, 0.46, 0]}>
                  <mesh material={kit.mats.pom} position={[0, 0.105, 0]}>
                    <sphereGeometry args={[0.115, 24, 18]} />
                  </mesh>
                </group>

                <Eye side={-1} kit={kit} bind={bind} />
                <Eye side={1} kit={kit} bind={bind} />
                {[-1, 1].map((side) => (
                  <OnHead key={side} az={side * 0.62} el={-0.26}>
                    <mesh material={kit.mats.cheek} rotation={[Math.PI / 2, 0, 0]}>
                      <cylinderGeometry args={[0.062, 0.062, 0.014, 24]} />
                    </mesh>
                  </OnHead>
                ))}
                <Smile kit={kit} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/* =========================================================
   Camera, lights, canvas
   ========================================================= */
/** Frames the doll (and stage) for any box shape; narrow boxes pull the camera back. */
function CameraFit({ stage }: { stage: boolean }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  useLayoutEffect(() => {
    const aspect = width / Math.max(1, height);
    const base = stage ? 6 : 5.4;
    const minAspect = stage ? 0.72 : 0.68;
    const scale = Math.max(1, minAspect / aspect);
    const lookY = stage ? 1 : 1.05;
    const rise = stage ? 0.5 : 0.4;
    camera.position.set(0, lookY + rise * scale, base * scale);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
  }, [camera, width, height, stage]);
  return null;
}

/** Warm key front-left, cool rim back-right, warm glow from low right. */
export function CraftLights() {
  return (
    <>
      <hemisphereLight args={['#fff6ea', '#6a5a7a', 1.15]} />
      {/* warm key, front left */}
      <directionalLight position={[-2.6, 3.6, 3.4]} intensity={2.5} color="#ffdcb4" />
      {/* cool rim, back right */}
      <directionalLight position={[2.2, 1.6, -3.4]} intensity={2.4} color="#9ccbff" />
      {/* warm glow from low right */}
      <pointLight position={[1.9, 0.35, 2.2]} intensity={5} distance={7} decay={2} color="#ffb070" />
    </>
  );
}

// Stable references, so re-renders never rebuild the camera.
const DPR: [number, number] = [1, 1.75];
const GL_OPTIONS = { antialias: true, alpha: true, powerPreference: 'low-power' as const };
const CAMERA = { fov: 32, near: 0.1, far: 40, position: [0, 1.5, 6] as [number, number, number] };
const CANVAS_STYLE = { pointerEvents: 'none' as const };
const WRAP_STYLE = { position: 'relative' as const, width: '100%', height: '100%', pointerEvents: 'none' as const };

let webglSupport: boolean | null = null;
/** True when a WebGL context can be created (checked once, then cached). */
export function canUseWebGL() {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webglSupport = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export function prefersReducedMotionNow() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** If anything in the 3D view throws (lost context, driver trouble), quietly show nothing. */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StitchDoll({ pose = 'dance', stage = true }: StitchDollProps) {
  const reducedPref = useReducedMotion();
  const [webgl] = useState(canUseWebGL);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  // Only render frames while the doll is on screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [webgl]);

  if (!webgl) return null;

  const reduced = reducedPref ?? prefersReducedMotionNow();
  const shown: StitchDollPose = reduced ? 'idle' : pose;

  return (
    <div ref={wrapRef} aria-hidden="true" style={WRAP_STYLE}>
      <QuietBoundary>
        <Canvas
          frameloop={onScreen ? 'always' : 'never'}
          dpr={DPR}
          flat
          gl={GL_OPTIONS}
          camera={CAMERA}
          style={CANVAS_STYLE}
        >
          <CameraFit stage={stage} />
          <CraftLights />
          <Suspense fallback={null}>
            <DollModel pose={shown} reduced={reduced} stage={stage} />
          </Suspense>
        </Canvas>
      </QuietBoundary>
    </div>
  );
}
