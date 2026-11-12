import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, CSSProperties, DependencyList, ReactNode, RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotion } from 'motion/react';
import type { PlanetKind } from '../content';
import { Planet } from '../components/Planets';
import { SurfaceProps, Satellites } from './props';
import { loadSurfaceImages, paintBadge, paintSurface } from './surfaces';
import { FRONT_SPOT, latLonToVec3 } from './spec';
import type { BadgeStyle, Globe3DProps, GlobeBadge, PreloadRequest, SurfaceImages, SurfaceMaps } from './spec';
import './globe.css';

// A real 3D craft planet: a unit sphere wrapped in painted fabric maps, lit like a
// felt toy in a night garden (warm key light, cool rim, orange glow from a tent).
// On section pages every level is a badge sewn into the surface inside its own
// zipper ring; the selected one turns to FRONT_SPOT and can open as a glowing pocket.
// The flat SVG <Planet> appears only when WebGL is missing or the context is lost.

type Detail = 'pod' | 'hero';
type Loop = 'always' | 'demand' | 'never';

/* ------------------------------------------------------------------ tuning */

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

const FOV = 20; // small fov: little perspective distortion, sphere still reads round
const TILT = -13.5 * DEG; // axial tilt, north pole leaning right
const FREE_PITCH = 8 * DEG; // free-spinning planets show a little more of the north
const SPIN_CALM = 0.12; // rad/s
const SPIN_EXCITED = 0.45;
const SETTLE_OMEGA = 8; // critically damped spring, settles in about 0.6 s
const POCKET_OMEGA = 14; // locks on faster while a pocket opens
const INTRO_SWING = 0.5; // rad the hero planet swings in from on first show
const WOBBLE = 2.6 * DEG; // idle twist about the selected badge (keeps it on FRONT_SPOT)
const BOB = 0.014;
const DRAG_RETURN_S = 2.5;
const CLICK_SLOP_PX = 6;

const BADGE_EXIT_MS = 420; // badges sink back into the fabric before they are dropped
const BADGE_SINK = 0.045; // how far (in radii) the badge layer sinks when hidden

const OPEN_S = 1.0;
const CLOSE_S = 0.7;
const REDUCED_FADE_S = 0.15;
const FLAP_ANGLE = 112 * DEG;
const PUSH_IN = 0.12; // fraction of the way the camera moves towards the pocket
const POCKET_LIGHT = 0.55;

const MAP_PX: Record<Detail, number> = { pod: 1024, hero: 2048 };
const BADGE_PX: Record<Detail, number> = { pod: 256, hero: 512 };
const DPR: Record<Detail, [number, number]> = { pod: [1, 1.75], hero: [1, 2] };
// three's bump strength is per screen pixel; the pod is minified a bit more, so it needs less.
const BUMP_SCALE: Record<Detail, number> = { pod: 2.4, hero: 3.2 };

const BADGE_R = 1.02;
const BADGE_LIFT = 0.016; // extra lift of the selected badge
const SHADOW_R = 1.006;
const RING_R = 1.026;
const HOLE_R = 1.009;
const TAPE_R = 1.003;
const SHADOW_SCALE = 1.22; // shadow patch size relative to the badge patch
const ROSETTE_SCALE = 1.12;
const HOVER_SCALE = 1.12;
const ZIP_SCALE = 1.15; // zipper ring radius, x the badge's visible radius
const ZIP_TEETH = 44; // per row
const ZIP_START = -Math.PI / 2; // pulls rest at the bottom of each ring
const GLOW_RING_AT = 1.36; // selection glow ring radius, x the badge's visible radius
const RING_TEX_R = 0.385; // glow ring radius inside its texture (fraction of width)
const HALO_R = 1.09;
const RIM_R = 1.004;

// Where the round part of each badge sits in paintBadge's square canvas.
const ART: Record<BadgeStyle, { cy: number; r: number }> = {
  sticker: { cy: 0.488, r: 0.45 },
  rosette: { cy: 0.36, r: 0.33 }, // pleated disc; ribbon tails hang below it
};

const TONES: Record<PlanetKind, { base: string; glow: string }> = {
  knit: { base: '#2f63a8', glow: '#8cc2ff' },
  stickers: { base: '#7fae3f', glow: '#d2f5a0' },
  moon: { base: '#b6a57c', glow: '#ffe6b0' },
  letter: { base: '#d9487e', glow: '#ffb4d2' },
};

const GL_OPTIONS: THREE.WebGLRendererParameters = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: true,
  stencil: false,
  powerPreference: 'default',
};
const CAMERA_OPTIONS = { fov: FOV, near: 0.1, far: 40, position: [0, 0, 9] as [number, number, number] };
// offsetSize: measure layout size, so CSS transforms on ancestors (carousel scale, zoom) don't resize the canvas.
const RESIZE_OPTIONS: ComponentProps<typeof Canvas>['resize'] = { scroll: false, offsetSize: true, debounce: 0 };

/* ------------------------------------------------------------ small maths */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutBack = (x: number) => {
  if (x <= 0) return 0;
  const c1 = 1.2;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/* ----------------------------------------------------- texture caches */

interface SurfaceTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

interface BadgeTextures {
  map: THREE.CanvasTexture;
  shadow: THREE.CanvasTexture;
  back: THREE.CanvasTexture; // the flap's felt lining
}

type Priority = 0 | 1 | 2; // 0 = loading screen (full speed), 1 = on screen, 2 = background preload

interface PaintJob {
  priority: Priority;
  run: () => void;
}

interface SurfaceEntry {
  priority: Priority;
  job?: PaintJob;
  promise: Promise<SurfaceTextures>;
}

const surfaceReady = new Map<string, SurfaceTextures>();
const surfacePending = new Map<string, SurfaceEntry>();
const badgeReady = new Map<string, BadgeTextures>();
const badgePending = new Map<string, Promise<BadgeTextures>>();
const paintQueue: PaintJob[] = [];
let pumping = false;
let imagesPromise: Promise<SurfaceImages> | null = null;

function getImages(): Promise<SurfaceImages> {
  if (!imagesPromise) {
    const p = loadSurfaceImages();
    imagesPromise = p;
    p.catch(() => {
      if (imagesPromise === p) imagesPromise = null; // let a later call retry
    });
  }
  return imagesPromise;
}

function whenIdle(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout });
    else window.setTimeout(resolve, 24);
  });
}

// Lets one frame paint (loading-screen animation), with a timer for hidden tabs.
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => window.setTimeout(finish, 0));
    window.setTimeout(finish, 60);
  });
}

// Paints one map per slot: loading-screen jobs back to back (yielding a frame
// between them), on-screen planets in idle time, background preloads last.
function pump() {
  if (pumping || paintQueue.length === 0) return;
  pumping = true;
  const best = Math.min(...paintQueue.map((j) => j.priority));
  const wait = best === 0 ? nextFrame() : whenIdle(best === 1 ? 250 : 2500);
  void wait.then(() => {
    let pick = 0;
    for (let i = 1; i < paintQueue.length; i += 1) if (paintQueue[i].priority < paintQueue[pick].priority) pick = i;
    const [job] = paintQueue.splice(pick, 1);
    try {
      job?.run();
    } finally {
      pumping = false;
      pump();
    }
  });
}

function makeSurfaceTextures({ map, bump }: SurfaceMaps): SurfaceTextures {
  const colour = new THREE.CanvasTexture(map);
  colour.colorSpace = THREE.SRGBColorSpace;
  colour.wrapS = THREE.RepeatWrapping; // filter across the date-line seam
  colour.anisotropy = 8; // three clamps to the GPU's maximum
  const height = new THREE.CanvasTexture(bump);
  height.wrapS = THREE.RepeatWrapping;
  height.anisotropy = 8;
  return { map: colour, bump: height };
}

function requestSurface(kind: PlanetKind, size: number, priority: Priority): Promise<SurfaceTextures> {
  const key = `${kind}:${size}`;
  const done = surfaceReady.get(key);
  if (done) return Promise.resolve(done);
  const pending = surfacePending.get(key);
  if (pending) {
    if (priority < pending.priority) {
      pending.priority = priority;
      if (pending.job) pending.job.priority = priority;
    }
    return pending.promise;
  }
  const entry = { priority } as SurfaceEntry;
  entry.promise = getImages().then(
    (images) =>
      new Promise<SurfaceTextures>((resolve, reject) => {
        const job: PaintJob = {
          priority: entry.priority,
          run: () => {
            try {
              const textures = makeSurfaceTextures(paintSurface(kind, images, size));
              surfaceReady.set(key, textures);
              resolve(textures);
            } catch (error) {
              reject(error);
            }
          },
        };
        entry.job = job;
        paintQueue.push(job);
        pump();
      }),
  );
  const forget = () => {
    if (surfacePending.get(key) === entry) surfacePending.delete(key);
  };
  entry.promise.then(forget, forget);
  surfacePending.set(key, entry);
  return entry.promise;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Used only if paintBadge fails: a plain coloured disc with a white die-cut edge.
function fallbackBadgeCanvas(color: string, size: number): HTMLCanvasElement {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = size / 2;
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.45, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.37, 0, TWO_PI);
    ctx.fill();
  }
  return canvas;
}

// The badge's own silhouette, blurred: a soft shadow that matches stickers and rosette tails.
function shadowCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const inner = size / SHADOW_SCALE;
  const offset = (size - inner) / 2;
  const away = size * 4; // draw the badge off-canvas so only its shadow lands
  ctx.shadowColor = 'rgba(0, 0, 0, 1)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetX = away;
  ctx.drawImage(src, offset - away, offset, inner, inner);
  return canvas;
}

// The same silhouette in cream felt: the back of the flap when the pocket opens.
function liningCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(src, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#eee2c8';
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function badgeKey(badge: GlobeBadge, px: number): string {
  return `${badge.icon}|${badge.color}|${badge.style ?? 'sticker'}|${badge.logo ?? ''}|${px}`;
}

function requestBadge(badge: GlobeBadge, px: number): Promise<BadgeTextures> {
  const key = badgeKey(badge, px);
  const done = badgeReady.get(key);
  if (done) return Promise.resolve(done);
  const pending = badgePending.get(key);
  if (pending) return pending;
  const promise = paintBadge(badge.icon, badge.color, px, badge.style ?? 'sticker', badge.logo)
    .catch(() => fallbackBadgeCanvas(badge.color, px))
    .then((canvas) => {
      const map = canvasTexture(canvas);
      map.anisotropy = 4;
      const textures: BadgeTextures = {
        map,
        shadow: canvasTexture(shadowCanvas(canvas), false),
        back: canvasTexture(liningCanvas(canvas)),
      };
      badgeReady.set(key, textures);
      badgePending.delete(key);
      return textures;
    });
  badgePending.set(key, promise);
  return promise;
}

function lazyTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size: number): () => THREE.CanvasTexture {
  let texture: THREE.CanvasTexture | null = null;
  return () => {
    if (!texture) {
      const canvas = makeCanvas(size);
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, size);
      texture = canvasTexture(canvas);
    }
    return texture;
  };
}

// Glowing white selection ring, just outside the zipper teeth.
const getRingTexture = lazyTexture((ctx, size) => {
  const r = size * RING_TEX_R;
  ctx.translate(size / 2, size / 2);
  const halo = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, size * 0.5);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0)');
  halo.addColorStop(0.35, 'rgba(255, 255, 255, 0.38)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = size * 0.04;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.026;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.stroke();
}, 256);

// Inside of the pocket: white light with a dark, stitched fabric rim.
const getHoleTexture = lazyTexture((ctx, size) => {
  const c = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c, c, c * 0.82, 0, TWO_PI);
  ctx.fill();
  const depth = ctx.createRadialGradient(c, c, c * 0.56, c, c, c * 0.82);
  depth.addColorStop(0, 'rgba(18, 22, 36, 0)');
  depth.addColorStop(1, 'rgba(18, 22, 36, 0.6)');
  ctx.fillStyle = depth;
  ctx.fill();
  ctx.strokeStyle = '#151a28';
  ctx.lineWidth = c * 0.15;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.87, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([c * 0.07, c * 0.05]);
  ctx.strokeStyle = 'rgba(240, 230, 208, 0.85)';
  ctx.lineWidth = c * 0.025;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.87, 0, TWO_PI);
  ctx.stroke();
}, 256);

// Soft round glow (premultiplied-friendly: white with falling alpha).
const getGlowTexture = lazyTexture((ctx, size) => {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.18, 'rgba(255, 255, 255, 0.85)');
  g.addColorStop(0.45, 'rgba(255, 252, 240, 0.32)');
  g.addColorStop(1, 'rgba(255, 250, 235, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}, 256);

const getBlankTexture = lazyTexture(() => undefined, 1);

/* -------------------------------------------------------- lights */

const LIGHT = {
  key: '#ffdfb2',
  cool: '#74a8ff',
  warm: '#ff8a3c',
  fill: '#c8d4ff',
  sky: '#b7c6ff',
  ground: '#2b1d36',
};

function directional(color: string, intensity: number, x: number, y: number, z: number): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(x, y, z);
  return light;
}

// One source of truth for the rig, so preloadGlobes warms identical shader programs.
function createLights(): THREE.Light[] {
  return [
    new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, 0.6),
    directional(LIGHT.key, 2.7, -3.2, 3.4, 4.2), // warm key from the front left, above
    directional(LIGHT.fill, 0.35, 2.2, -0.6, 4), // faint fill: far side deep but not black
    directional(LIGHT.cool, 3.2, -4.5, 1.6, -3.5), // cool moonlight rim, behind left
    directional(LIGHT.warm, 2.6, 4.2, -2.6, -2.4), // orange tent glow, behind right, below
  ];
}

// Always in hero scenes (intensity 0 when closed): a changing light count would recompile every shader.
function createPocketLight(): THREE.PointLight {
  return new THREE.PointLight('#ffffff', 0, 1.6, 2);
}

/* --------------------------------------------------------- materials */

function makePlanetMaterial(surface: { map: THREE.Texture; bump: THREE.Texture }, kind: PlanetKind, detail: Detail) {
  return new THREE.MeshPhysicalMaterial({
    map: surface.map,
    bumpMap: surface.bump,
    bumpScale: BUMP_SCALE[detail],
    roughness: 0.86,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(TONES[kind].base).lerp(new THREE.Color('#ffffff'), 0.6),
  });
}

function makeBadgeMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap: map, // keeps badges readable on the shadow side
    emissive: '#ffffff',
    emissiveIntensity: 0.22,
    roughness: 0.5, // a little sticker gloss
    metalness: 0,
    transparent: true,
    alphaTest: 0.04,
  });
}

function makeLiningMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92, transparent: true, alphaTest: 0.04, side: THREE.BackSide });
}

function makeShadowMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.5, depthWrite: false });
}

// Additive light that keeps alpha valid on the transparent canvas.
function additive(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    toneMapped: false,
  });
}

const makeRingMaterial = () => additive(getRingTexture());

function makeGlowMaterial(): THREE.MeshBasicMaterial {
  const material = additive(getGlowTexture());
  material.depthTest = false; // a camera-facing glow would otherwise cut into the sphere
  return material;
}

function makeHoleMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: getHoleTexture(), transparent: true, depthWrite: false, toneMapped: false });
}

function makeBrassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#d9b25c',
    metalness: 0.6,
    roughness: 0.32,
    emissive: '#3a2a08',
    emissiveIntensity: 0.5,
  });
}

function makeTapeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#25314c', roughness: 0.95, metalness: 0 });
}

const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

// Outputs display-ready (sRGB) premultiplied colour; blended additively.
const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform float uIntensity;
uniform float uPower;
uniform float uLimb;
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  vec3 n = normalize(vNormalV);
  float f = dot(n, normalize(-vPosV));
#ifdef HALO
  // back faces of a larger shell: brightest at the planet's limb, 0 at the shell's edge
  float a = pow(clamp(-f / uLimb, 0.0, 1.0), uPower);
#else
  // thin fresnel glow on the planet's own edge
  float a = pow(1.0 - clamp(f, 0.0, 1.0), uPower);
#endif
  // cool on the left/top edge, warm on the lower right, like the rim lights
  float side = smoothstep(-0.75, 0.75, -n.x * 0.85 + n.y * 0.4);
  vec3 col = mix(mix(uWarm, uCool, side), uTint, 0.45);
  a *= uIntensity;
  gl_FragColor = vec4(col * a, a);
}
`;

// Light ray: soft along its length and at its silhouette edges, so a cone reads as a beam.
const RAY_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  float along = vUv.y; // 0 at the pocket, 1 at the tip
  float fade = smoothstep(0.0, 0.08, along) * pow(1.0 - along, 1.6);
  float facing = abs(dot(normalize(vNormalV), normalize(-vPosV)));
  float a = fade * pow(facing, 1.4) * uOpacity;
  gl_FragColor = vec4(vec3(1.0, 0.985, 0.94) * a, a);
}
`;

const RAY_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vPosV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

function srgb(hex: string): THREE.Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function makeAtmosphere(kind: PlanetKind, halo: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    defines: halo ? { HALO: '' } : {},
    uniforms: {
      uTint: { value: srgb(TONES[kind].glow) },
      uCool: { value: srgb('#8fb8ff') },
      uWarm: { value: srgb('#ffa060') },
      uIntensity: { value: halo ? 0.6 : 0.3 },
      uPower: { value: halo ? 1.8 : 3.2 },
      uLimb: { value: Math.sqrt(1 - 1 / (HALO_R * HALO_R)) },
    },
    side: halo ? THREE.BackSide : THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    toneMapped: false,
  });
}

function makeRayMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RAY_VERTEX,
    fragmentShader: RAY_FRAGMENT,
    uniforms: { uOpacity: { value: 0 } },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    toneMapped: false,
  });
}

/* --------------------------------------------------------- geometry */

// A square patch (half-size `half` on the tangent plane at z = 1) bent onto a
// sphere of `radius`, facing +z. `shiftY` moves the texture so the badge's round
// part, not the canvas centre, sits on the axis. Stickers hug the surface.
function capGeometry(half: number, radius: number, segments: number, shiftY = 0): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(2 * half, 2 * half, segments, segments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.set(pos.getX(i), pos.getY(i) + shiftY, 1).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    pos.setXYZ(i, v.x * radius, v.y * radius, v.z * radius);
  }
  geo.computeBoundingSphere();
  return geo;
}

// A flat annulus between two angular radii, bent onto the sphere around +z.
function annulusGeometry(inner: number, outer: number, radius: number): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(Math.tan(inner), Math.tan(outer), 72, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.set(pos.getX(i), pos.getY(i), 1).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    pos.setXYZ(i, v.x * radius, v.y * radius, v.z * radius);
  }
  geo.computeBoundingSphere();
  return geo;
}

interface BadgeShape {
  art: number; // angular radius of the badge's round part (rad)
  zip: number; // zipper ring angular radius (rad)
  hinge: [number, number, number]; // flap hinge: top edge of the round part
  unhinge: [number, number, number];
  badge: THREE.BufferGeometry;
  shadow: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
  hole: THREE.BufferGeometry;
  tape: THREE.BufferGeometry;
}

function makeShape(style: BadgeStyle, artDeg: number): BadgeShape {
  const art = Math.max(1, artDeg) * DEG;
  const artTan = Math.tan(art);
  const { cy, r } = ART[style];
  const half = artTan / (2 * r);
  const shift = -half * (1 - 2 * cy);
  const zip = art * ZIP_SCALE;
  const hingeDir = new THREE.Vector3(0, artTan, 1).normalize().multiplyScalar(BADGE_R);
  return {
    art,
    zip,
    hinge: [0, hingeDir.y, hingeDir.z],
    unhinge: [0, -hingeDir.y, -hingeDir.z],
    badge: capGeometry(half, BADGE_R, 14, shift),
    shadow: capGeometry(half * SHADOW_SCALE, SHADOW_R, 8, shift),
    ring: capGeometry(Math.tan(art * GLOW_RING_AT) / (2 * RING_TEX_R), RING_R, 16),
    hole: capGeometry(artTan / 0.94, HOLE_R, 12),
    tape: annulusGeometry(zip * 0.84, zip * 1.16, TAPE_R),
  };
}

function disposeShape(shape: BadgeShape) {
  shape.badge.dispose();
  shape.shadow.dispose();
  shape.ring.dispose();
  shape.hole.dispose();
  shape.tape.dispose();
}

/* ------------------------------------------------------ badge layout */

interface Spot {
  vec: THREE.Vector3; // planet-local unit vector of the badge centre
  quat: THREE.Quaternion; // +z along the normal, +y toward north
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ROLL_JITTER = [-4, 3, -2, 5, -5, 2, 4, -3]; // stuck on by hand, never quite straight

function arcDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const [ax, ay, az] = latLonToVec3(a.lat, a.lon);
  const [bx, by, bz] = latLonToVec3(b.lat, b.lon);
  return Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz))) / DEG;
}

// Zig-zag rows all the way round, between about 40°S and 50°N: consecutive levels
// are neighbours, so Previous/Next turns the planet one step. `art` is the sticker
// radius (deg): about 11° (22° across) for 7 badges, smaller for more, with clear
// fabric between the zipper rings.
function layoutBadges(count: number): { spots: Spot[]; art: number } {
  if (count <= 0) return { spots: [], art: 11 };
  const rows = count <= 3 ? [6] : count <= 9 ? [26, -16] : [42, 6, -30];
  const step = 360 / count;
  const places = Array.from({ length: count }, (_, i) => ({ lat: rows[i % rows.length], lon: -90 + i * step }));
  let closest = 180;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) closest = Math.min(closest, arcDeg(places[i], places[j]));
  }
  const cap = 24 * Math.min(1, Math.sqrt(7 / count));
  const diameter = count === 1 ? 24 : Math.max(9, Math.min(cap, closest * 0.48));
  const up = new THREE.Vector3(0, 1, 0);
  const spots = places.map(({ lat, lon }, i) => {
    const vec = new THREE.Vector3(...latLonToVec3(lat, lon));
    const north = up.clone().addScaledVector(vec, -vec.dot(up)).normalize();
    const east = new THREE.Vector3().crossVectors(north, vec);
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, vec));
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, ROLL_JITTER[i % ROLL_JITTER.length] * DEG));
    return { vec, quat };
  });
  return { spots, art: diameter / 2 };
}

/* ---------------------------------------------------------- zippers */

const zDir = new THREE.Vector3();
const zEr = new THREE.Vector3();
const zEx = new THREE.Vector3();
const zU = new THREE.Vector3();
const zN = new THREE.Vector3();
const zPos = new THREE.Vector3();
const zScale = new THREE.Vector3();
const zMat = new THREE.Matrix4();

// Frame on the sphere at angle theta on a ring of angular radius rho around +z:
// zEx along the ring, zEr away from the badge centre, zDir = surface normal.
function ringFrame(theta: number, rho: number) {
  const sr = Math.sin(rho);
  const cr = Math.cos(rho);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  zDir.set(sr * ct, sr * st, cr);
  zEr.set(cr * ct, cr * st, -sr);
  zEx.crossVectors(zEr, zDir);
}

function boxMatrix(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, pos: THREE.Vector3, size: THREE.Vector3, rot: THREE.Matrix4) {
  return zMat.makeBasis(x, y, z).scale(size).setPosition(pos).premultiply(rot);
}

interface ZipRing {
  rot: THREE.Matrix4;
  rho: number;
}

interface ZipperSet {
  objects: THREE.Object3D[];
  write: (index: number, slider: number) => void;
  dispose: () => void;
}

// All zippers in a handful of draw calls: one InstancedMesh for every tooth, one
// for the sliders, one for the pulls, one tape mesh per badge shape.
function buildZippers(spots: Spot[], shapes: BadgeShape[], box: THREE.BufferGeometry, brass: THREE.Material, tape: THREE.Material): ZipperSet {
  const n = spots.length;
  if (n === 0) return { objects: [], write: () => undefined, dispose: () => undefined };
  const rings: ZipRing[] = spots.map((spot, i) => ({ rot: new THREE.Matrix4().makeRotationFromQuaternion(spot.quat), rho: shapes[i].zip }));
  const teeth = new THREE.InstancedMesh(box, brass, n * 2 * ZIP_TEETH);
  const sliders = new THREE.InstancedMesh(box, brass, n);
  const pulls = new THREE.InstancedMesh(box, brass, n);
  const tapes: THREE.InstancedMesh[] = [];
  const byShape = new Map<BadgeShape, number[]>();
  shapes.forEach((shape, i) => byShape.set(shape, [...(byShape.get(shape) ?? []), i]));
  for (const [shape, indices] of byShape) {
    const mesh = new THREE.InstancedMesh(shape.tape, tape, indices.length);
    indices.forEach((i, k) => mesh.setMatrixAt(k, rings[i].rot));
    tapes.push(mesh);
  }
  const all = [...tapes, teeth, sliders, pulls];
  for (const mesh of all) mesh.frustumCulled = false;

  // `slider` 0..1: how far round the pull has travelled; teeth behind it part slightly.
  const write = (index: number, slider: number) => {
    const ring = rings[index];
    if (!ring) return;
    const rho = ring.rho;
    const delta = 0.04 * rho;
    const gap = 0.035 * rho;
    const h = 0.04 * rho;
    const pitch = (TWO_PI * Math.sin(rho)) / ZIP_TEETH;
    zScale.set(pitch * 0.55, 0.12 * rho, h);
    const r = 1 + h / 2 + 0.0015;
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < ZIP_TEETH; k += 1) {
        const f = (k + row * 0.5) / ZIP_TEETH;
        const parted = clamp01(((slider * (1 + 3 / ZIP_TEETH) - f) * ZIP_TEETH) / 3);
        ringFrame(ZIP_START + TWO_PI * f, row === 0 ? rho - delta - gap * parted : rho + delta + gap * parted);
        teeth.setMatrixAt((index * 2 + row) * ZIP_TEETH + k, boxMatrix(zEx, zEr, zDir, zPos.copy(zDir).multiplyScalar(r), zScale, ring.rot));
      }
    }
    // slider body riding on the teeth
    ringFrame(ZIP_START + TWO_PI * slider, rho);
    const rb = 1 + h + 0.045 * rho + 0.0015;
    sliders.setMatrixAt(index, boxMatrix(zEx, zEr, zDir, zPos.copy(zDir).multiplyScalar(rb), zScale.set(0.3 * rho, 0.24 * rho, 0.09 * rho), ring.rot));
    // pull tab hanging off its outer edge, tilted up off the fabric
    const tilt = 28 * DEG;
    zU.copy(zEr).multiplyScalar(Math.cos(tilt)).addScaledVector(zDir, Math.sin(tilt));
    zN.crossVectors(zEx, zU);
    zPos.copy(zDir).multiplyScalar(rb + 0.03 * rho).addScaledVector(zEr, 0.12 * rho).addScaledVector(zU, 0.17 * rho);
    pulls.setMatrixAt(index, boxMatrix(zEx, zU, zN, zPos, zScale.set(0.11 * rho, 0.34 * rho, 0.03 * rho), ring.rot));
    teeth.instanceMatrix.needsUpdate = true;
    sliders.instanceMatrix.needsUpdate = true;
    pulls.instanceMatrix.needsUpdate = true;
  };
  for (let i = 0; i < n; i += 1) write(i, 0);

  return {
    objects: all,
    write,
    dispose: () => all.forEach((mesh) => mesh.dispose()),
  };
}

/* --------------------------------------------------- rotation maths */

const scratchDir = new THREE.Vector3();
const scratchFront = new THREE.Vector3();
const scratchPocket = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();
const scratchWobble = new THREE.Quaternion();

interface Fit {
  frac: number; // sphere diameter / canvas width
  aspect: number;
  distance: number; // camera at (0, 0, distance)
}

// Where the camera ray through FRONT_SPOT meets a sphere of `radius`, in world space.
function frontSpotWorld(fit: Fit, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const tanHalf = Math.tan((FOV * DEG) / 2);
  const nx = 2 * (FRONT_SPOT.x - 0.5) * fit.frac;
  const ny = 2 * (0.5 - FRONT_SPOT.y) * fit.frac * fit.aspect;
  scratchDir.set(nx * tanHalf * fit.aspect, ny * tanHalf, -1).normalize();
  const b = fit.distance * scratchDir.z;
  const t = -b - Math.sqrt(Math.max(0, b * b - (fit.distance * fit.distance - radius * radius)));
  return out.set(scratchDir.x * t, scratchDir.y * t, fit.distance + scratchDir.z * t);
}

// Yaw about the planet's axis, then pitch about the horizontal, so that `local`
// lands on `target` with the poles staying in the screen's vertical plane.
function solveOrientation(local: THREE.Vector3, target: THREE.Vector3): { yaw: number; pitch: number } {
  const rho = Math.max(1e-4, Math.hypot(local.x, local.z));
  const px = Math.min(rho, Math.max(-rho, target.x));
  const yaw = Math.atan2(local.z, local.x) - Math.acos(px / rho);
  const z1 = Math.sqrt(Math.max(0, rho * rho - px * px));
  const pitch = Math.atan2(target.z, target.y) - Math.atan2(z1, local.y);
  return { yaw, pitch: Math.atan2(Math.sin(pitch), Math.cos(pitch)) };
}

// Exact critically damped spring step (frame-rate independent).
function spring(x: number, v: number, target: number, omega: number, dt: number): [number, number] {
  const d = x - target;
  const e = Math.exp(-omega * dt);
  const k = (v + omega * d) * dt;
  return [target + (d + k) * e, (v - omega * k) * e];
}

function nearestAngle(angle: number, to: number): number {
  return angle + TWO_PI * Math.round((to - angle) / TWO_PI);
}

/* ------------------------------------------------------------ helpers */

function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

let webglSupport: boolean | null = null;
function supportsWebGL(): boolean {
  if (webglSupport === null) {
    // three needs WebGL 2. A blocklisted GPU still fails later; the boundary catches that.
    webglSupport = typeof window !== 'undefined' && typeof window.WebGL2RenderingContext === 'function';
  }
  return webglSupport;
}

class Boundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface DragState {
  active: boolean;
  offset: number; // radians of yaw since the drag started
  velocity: number; // rad/s
}

// Pocket timeline, written by the scene each frame and read by the badge, zipper and pocket parts.
interface PocketAnim {
  t: number; // 0..1 along the opening timeline (played backwards to close)
  slider: number; // 0..1 trip of the pull round the ring
  flap: number; // 0..1 of FLAP_ANGLE (overshoots a little)
  hole: number; // brightness of the opening
  light: number; // glow, rays and point light
  push: number; // camera push-in
  ringFade: number; // selection glow ring
  time: number;
  active: boolean;
  engaged: boolean;
  openedSent: boolean;
}

function newPocketAnim(): PocketAnim {
  return { t: 0, slider: 0, flap: 0, hole: 0, light: 0, push: 0, ringFade: 1, time: 0, active: false, engaged: false, openedSent: false };
}

/* -------------------------------------------------------------- badge */

interface BadgeProps {
  index: number;
  spot: Spot;
  shape: BadgeShape;
  textures: BadgeTextures;
  selected: boolean;
  /** The badges are being taken off: shrink away. */
  leaving: boolean;
  reduced: boolean;
  pocket: PocketAnim;
  onPick: (index: number) => void;
  onHover: (index: number, on: boolean) => void;
}

function Badge({ index, spot, shape, textures, selected, leaving, reduced, pocket, onPick, onHover }: BadgeProps) {
  const invalidate = useThree((s) => s.invalidate);
  const scaleRef = useRef<THREE.Group>(null);
  const liftRef = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Group>(null);
  const liningRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const anim = useRef({ hover: false, scale: 1, appear: 0, appearV: 0, lift: 0, ring: 0, t: 0 });
  const material = useDisposable(() => makeBadgeMaterial(textures.map), [textures.map]);
  const lining = useDisposable(() => makeLiningMaterial(textures.back), [textures.back]);
  const shadow = useDisposable(() => makeShadowMaterial(textures.shadow), [textures.shadow]);
  const ring = useDisposable(makeRingMaterial, []);
  const hoverRef = useLatest(onHover);

  const setHover = (on: boolean) => {
    if (anim.current.hover === on) return;
    anim.current.hover = on;
    onHover(index, on);
    invalidate();
  };

  useEffect(
    () => () => {
      if (anim.current.hover) hoverRef.current(index, false);
    },
    [index, hoverRef],
  );

  // Start flat (not yet stuck on); the frame loop pops it into its zipper ring.
  useLayoutEffect(() => {
    scaleRef.current?.scale.set(1e-4, 1e-4, 1);
  }, []);

  useFrame((_, delta) => {
    const g = scaleRef.current;
    const l = liftRef.current;
    const f = flapRef.current;
    const back = liningRef.current;
    const r = ringRef.current;
    if (!g || !l || !f || !back || !r) return;
    const s = anim.current;
    const dt = Math.min(delta, 0.1);
    const on = selected ? 1 : 0;
    const hovered = s.hover && !pocket.active;
    s.t += dt;
    if (reduced) {
      s.appear = leaving ? 0 : 1;
      s.scale = hovered ? HOVER_SCALE : 1;
      s.lift = on;
      s.ring = on;
    } else {
      if (leaving) {
        // peeled off again: a quick shrink, no bounce
        s.appear += (0 - s.appear) * (1 - Math.exp(-dt * 11));
        s.appearV = 0;
      } else if (s.t > index * 0.07) {
        // slapped on: a springy pop with a little overshoot, staggered per badge
        for (let left = dt; left > 0; left -= 1 / 120) {
          const h = Math.min(left, 1 / 120);
          s.appearV += (-324 * (s.appear - 1) - 16 * s.appearV) * h;
          s.appear += s.appearV * h;
        }
      }
      s.scale += ((hovered ? HOVER_SCALE : 1) - s.scale) * (1 - Math.exp(-dt * 16));
      const k = 1 - Math.exp(-dt * 9);
      s.lift += (on - s.lift) * k;
      s.ring += (on - s.ring) * k;
    }
    const sc = Math.max(1e-4, s.scale * s.appear);
    g.visible = sc > 0.002;
    g.scale.set(sc, sc, 1 + (s.scale - 1) * 0.08);
    l.scale.set(1, 1, 1 + (BADGE_LIFT / BADGE_R) * s.lift);
    const flap = selected ? pocket.flap : 0;
    f.rotation.x = -flap * FLAP_ANGLE;
    back.visible = flap > 0.01;
    shadow.opacity = 0.5 * (1 - smoothstep(0, 0.4, flap));
    ring.opacity = s.ring * (selected ? pocket.ringFade : 1) * (reduced ? 0.9 : 0.7 + 0.3 * Math.sin(s.t * 3.3));
    r.visible = ring.opacity > 0.005;
  });

  return (
    <group quaternion={spot.quat}>
      <group ref={scaleRef}>
        <mesh geometry={shape.shadow} material={shadow} rotation={[0.028, 0.018, 0]} renderOrder={1} dispose={null} />
        <group ref={liftRef}>
          {/* the flap: hinged on the top edge of the badge's round part */}
          <group ref={flapRef} position={shape.hinge}>
            <group position={shape.unhinge}>
              <mesh
                geometry={shape.badge}
                material={material}
                renderOrder={2}
                dispose={null}
                onPointerMove={(e) => {
                  e.stopPropagation();
                  setHover(true);
                }}
                onPointerOut={() => setHover(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!pocket.active && e.delta < CLICK_SLOP_PX) onPick(index);
                }}
              />
              <mesh ref={liningRef} geometry={shape.badge} material={lining} renderOrder={2} visible={false} dispose={null} />
            </group>
          </group>
          <mesh ref={ringRef} geometry={shape.ring} material={ring} renderOrder={3} visible={false} dispose={null} />
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------ zippers */

function Zippers({ zippers, selected, pocket }: { zippers: ZipperSet; selected: number; pocket: PocketAnim }) {
  const state = useRef({ zippers, selected: -1, slider: 0 });

  useFrame(() => {
    const s = state.current;
    if (s.zippers !== zippers) {
      s.zippers = zippers;
      s.selected = -1;
      s.slider = 0;
    }
    if (s.selected !== selected) {
      if (s.selected >= 0 && s.slider !== 0) zippers.write(s.selected, 0);
      s.selected = selected;
      s.slider = 0;
    }
    const slider = selected >= 0 ? pocket.slider : 0;
    if (selected >= 0 && slider !== s.slider) {
      zippers.write(selected, slider);
      s.slider = slider;
    }
  });

  return (
    <>
      {zippers.objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------- pocket */

// Light rays fanning out of the opening (badge-local: hole on +z).
const RAYS = Array.from({ length: 8 }, (_, i) => ({
  theta: (i / 8) * TWO_PI + [0.1, -0.15, 0.2, -0.05, 0.12, -0.2, 0.05, 0.18][i],
  splay: (14 + ((i * 5) % 4) * 9) * DEG,
  base: 0.25 + ((i * 3) % 4) * 0.12, // fraction of the hole radius
  length: 0.5 + ((i * 7) % 4) * 0.12,
  width: 0.045 + (i % 3) * 0.018,
  speed: 5 + (i % 4) * 1.7,
  phase: i * 1.9,
}));

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const billboardQuat = new THREE.Quaternion();

function Pocket({ spot, shape, pocket, reduced }: { spot: Spot | null; shape: BadgeShape; pocket: PocketAnim; reduced: boolean }) {
  const camera = useThree((s) => s.camera);
  const groupRef = useRef<THREE.Group>(null);
  const holeRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const raysRef = useRef<THREE.Group>(null);
  const light = useMemo(createPocketLight, []);
  const hole = useDisposable(makeHoleMaterial, []);
  const glow = useDisposable(makeGlowMaterial, []);
  const plane = useDisposable(() => new THREE.PlaneGeometry(1, 1), []);
  const cone = useDisposable(() => new THREE.CylinderGeometry(1, 0.32, 1, 16, 1, true).translate(0, 0.5, 0), []);
  const rays = useDisposable(() => {
    const materials = RAYS.map(makeRayMaterial);
    return { materials, dispose: () => materials.forEach((m) => m.dispose()) };
  }, []);
  const placements = useMemo(
    () =>
      RAYS.map((ray) => {
        const rho = ray.base * shape.art;
        const position = new THREE.Vector3(
          Math.sin(rho) * Math.cos(ray.theta),
          Math.sin(rho) * Math.sin(ray.theta),
          Math.cos(rho),
        ).multiplyScalar(HOLE_R);
        const axis = new THREE.Vector3(
          Math.sin(ray.splay) * Math.cos(ray.theta),
          Math.sin(ray.splay) * Math.sin(ray.theta),
          Math.cos(ray.splay),
        );
        return { position, quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, axis) };
      }),
    [shape],
  );

  useEffect(() => () => light.dispose(), [light]);

  useFrame(() => {
    const g = groupRef.current;
    const h = holeRef.current;
    const gl = glowRef.current;
    const rg = raysRef.current;
    if (!g || !h || !gl || !rg) return;
    const P = pocket;
    // the group stays visible so the light count (and every shader) never changes
    if (spot) g.quaternion.copy(spot.quat);
    const lit = spot !== null && P.light > 0.001;
    h.visible = spot !== null && (P.hole > 0.001 || P.flap > 0.001);
    hole.color.setScalar(0.3 + 0.7 * P.hole);
    light.intensity = spot ? P.light * POCKET_LIGHT * (reduced ? 1 : 0.94 + 0.06 * Math.sin(P.time * 11)) : 0;
    gl.visible = lit;
    rg.visible = lit;
    if (!lit) return;
    g.getWorldQuaternion(billboardQuat);
    gl.quaternion.copy(billboardQuat.invert().multiply(camera.quaternion));
    gl.scale.setScalar(reduced ? 1.5 : 0.35 + 1.75 * P.light);
    glow.opacity = P.light * (reduced ? 1 : 0.93 + 0.07 * Math.sin(P.time * 7.7));
    rg.children.forEach((child, i) => {
      const ray = RAYS[i];
      if (!ray) return;
      const flicker = reduced ? 1 : 0.78 + 0.22 * Math.sin(P.time * ray.speed + ray.phase) * Math.sin(P.time * 2.3 + i);
      rays.materials[i].uniforms.uOpacity.value = P.light * 0.6 * flicker;
      child.scale.set(ray.width, ray.length * (reduced ? 1 : 0.45 + 0.55 * P.light), ray.width);
    });
  });

  return (
    <group ref={groupRef}>
      <primitive object={light} position={[0, 0, 1.2]} />
      <mesh ref={holeRef} geometry={shape.hole} material={hole} renderOrder={2} visible={false} dispose={null} />
      <group ref={raysRef} visible={false}>
        {placements.map((p, i) => (
          <mesh key={i} geometry={cone} material={rays.materials[i]} position={p.position} quaternion={p.quaternion} renderOrder={6} dispose={null} />
        ))}
      </group>
      <mesh ref={glowRef} geometry={plane} material={glow} position={[0, 0, 1.08]} renderOrder={7} visible={false} dispose={null} />
    </group>
  );
}

/* -------------------------------------------------------------- scene */

interface SceneProps {
  kind: PlanetKind;
  detail: Detail;
  surface: SurfaceTextures;
  badges: GlobeBadge[];
  badgeTextures: (BadgeTextures | null)[];
  selected: number; // -1 = free spin
  /** The badges are on their way off (shrinking, sinking); the planet spins freely again. */
  leaving: boolean;
  pocketOpen: boolean;
  excited: boolean;
  reduced: boolean;
  loop: Loop;
  bleed: number;
  hitRef: RefObject<HTMLDivElement | null>;
  drag: DragState;
  onPick: (index: number) => void;
  onHover: (index: number, on: boolean) => void;
  onCompiled: () => void;
  onReady: () => void;
  onLost: () => void;
  onPocketOpened: () => void;
  onPocketClosed: () => void;
}

function Scene(p: SceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const bobRef = useRef<THREE.Group>(null);
  const orientRef = useRef<THREE.Group>(null);
  const badgeLayerRef = useRef<THREE.Group>(null);
  const fit = useRef<Fit>({ frac: 1 / (1 + 2 * p.bleed), aspect: 1, distance: 9 });
  const pocket = useMemo(newPocketAnim, []);
  const onLost = useLatest(p.onLost);
  const onReady = useLatest(p.onReady);

  // Solve the camera distance so the sphere's silhouette is exactly the box width:
  // silhouette angular radius = asin(1 / d), and it must span frac of the canvas width.
  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const box = p.hitRef.current?.offsetWidth ?? 0;
    const frac = box > 0 ? Math.min(1, box / size.width) : 1 / (1 + 2 * p.bleed);
    const aspect = size.width / size.height;
    const t = frac * Math.tan((FOV * DEG) / 2) * aspect; // tan of the silhouette's angular radius
    const distance = Math.sqrt(1 + t * t) / t;
    camera.fov = FOV;
    camera.aspect = aspect;
    camera.near = Math.max(0.1, distance - 2.2);
    camera.far = distance + 2.2;
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    fit.current = { frac, aspect, distance };
    invalidate();
  }, [camera, size.width, size.height, p.bleed, p.hitRef, invalidate]);

  // Context loss: hand over to the SVG planet.
  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const lost = () => onLost.current();
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);

  const lights = useDisposable(() => {
    const list = createLights();
    return { list, dispose: () => list.forEach((l) => l.dispose()) };
  }, []);
  const sphere = useDisposable(() => new THREE.SphereGeometry(1, 96, 64), []);
  const shell = useDisposable(() => new THREE.SphereGeometry(1, 64, 40), []);
  const planet = useDisposable(() => makePlanetMaterial(p.surface, p.kind, p.detail), [p.surface, p.kind, p.detail]);
  const halo = useDisposable(() => makeAtmosphere(p.kind, true), [p.kind]);
  const rim = useDisposable(() => makeAtmosphere(p.kind, false), [p.kind]);

  const count = p.badges.length;
  const layout = useMemo(() => layoutBadges(count), [count]);
  const shapes = useDisposable(() => {
    const sticker = makeShape('sticker', layout.art);
    const rosette = makeShape('rosette', layout.art * ROSETTE_SCALE);
    return {
      sticker,
      rosette,
      dispose() {
        disposeShape(sticker);
        disposeShape(rosette);
      },
    };
  }, [layout.art]);
  const styleKey = p.badges.map((b) => b.style ?? 'sticker').join(',');
  const badgeShapes = useMemo(
    () => p.badges.map((b) => (b.style === 'rosette' ? shapes.rosette : shapes.sticker)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapes, styleKey],
  );
  const zipParts = useDisposable(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const brass = makeBrassMaterial();
    const tape = makeTapeMaterial();
    return {
      box,
      brass,
      tape,
      dispose() {
        box.dispose();
        brass.dispose();
        tape.dispose();
      },
    };
  }, []);
  const zippers = useDisposable(
    () => buildZippers(layout.spots, badgeShapes, zipParts.box, zipParts.brass, zipParts.tape),
    [layout, badgeShapes, zipParts],
  );

  // Invisible stand-ins with the badge materials' exact shader setup, so compileAsync
  // builds those programs too and nothing hitches when badges land or a pocket opens.
  const warm = useDisposable(() => {
    const geometry = new THREE.PlaneGeometry(0.01, 0.01);
    const blank = getBlankTexture();
    const materials = [makeBadgeMaterial(blank), makeLiningMaterial(blank), makeShadowMaterial(blank), makeRingMaterial()];
    return {
      geometry,
      materials,
      dispose() {
        geometry.dispose();
        materials.forEach((m) => m.dispose());
      },
    };
  }, []);

  // Cached textures outlive this renderer. On unmount, dispose() them so the dying
  // renderer drops its GPU copy and its listener on them (else every page round trip
  // would keep a dead renderer alive). The canvases stay cached, so the next renderer
  // just re-uploads them without repainting.
  const used = useRef(new Set<THREE.Texture>());
  used.current.add(p.surface.map);
  used.current.add(p.surface.bump);
  used.current.add(getBlankTexture()); // the warm-up stand-ins
  if (count > 0) {
    used.current.add(getRingTexture());
    used.current.add(getHoleTexture());
    used.current.add(getGlowTexture());
  }
  p.badgeTextures.forEach((t) => {
    if (t) {
      used.current.add(t.map);
      used.current.add(t.shadow);
      used.current.add(t.back);
    }
  });
  useEffect(() => {
    const textures = used.current;
    return () => {
      textures.forEach((t) => t.dispose());
      textures.clear();
    };
  }, []);

  // Compile every shader, including the hidden pocket parts, in parallel where the
  // GPU allows (KHR_parallel_shader_compile).
  useEffect(() => {
    let cancelled = false;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) p.onCompiled();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  // In 'demand' mode (reduced motion) nothing renders unless asked.
  useEffect(() => {
    invalidate();
  }, [invalidate, p.loop, p.selected, p.badgeTextures, p.reduced, p.excited, p.surface, p.pocketOpen, p.leaving]);

  const motion = useRef({
    yaw: 0,
    yawV: 0,
    pitch: FREE_PITCH,
    pitchV: 0,
    spin: SPIN_CALM,
    wobble: 0,
    t: 0,
    mode: 'spring' as 'spring' | 'drag' | 'coast',
    dragBase: 0,
    coastV: 0,
    coastT: 0,
    lastSelected: -1,
    returnNow: false,
    started: false,
    spun: false, // has spun freely on screen (so badges arriving later ease in, no intro swing)
    lastTarget: new THREE.Vector3(0, 0, 1),
    bobAmp: 1,
    badgeIn: 0, // 0 = badge layer sunk into the fabric, 1 = out
    readySent: false,
    pushed: false,
  });

  // Runs before the badge/zipper/pocket frames (priority -1 keeps auto-rendering on).
  useFrame((_, delta) => {
    const s = motion.current;
    if (!s.readySent) {
      s.readySent = true;
      requestAnimationFrame(() => onReady.current()); // after this frame is on screen
    }
    const orient = orientRef.current;
    const bob = bobRef.current;
    if (!orient || !bob) return;
    const dt = Math.min(delta, 0.1);
    s.t += dt;
    const badgeMode = !p.leaving && p.selected >= 0 && p.selected < layout.spots.length;

    // ---- badge layer: rises out of the fabric when badges arrive, sinks back when they go
    const layer = badgeLayerRef.current;
    if (layer) {
      const want = count > 0 && !p.leaving ? 1 : 0;
      const before = s.badgeIn;
      s.badgeIn = p.reduced ? want : s.badgeIn + (want - s.badgeIn) * (1 - Math.exp(-dt * (want ? 7 : 10)));
      if (Math.abs(s.badgeIn - want) < 1e-3) s.badgeIn = want;
      layer.scale.setScalar(1 - BADGE_SINK * (1 - s.badgeIn));
      layer.visible = s.badgeIn > 0.002;
      if (s.badgeIn !== before) invalidate();
    }

    // ---- pocket timeline
    const P = pocket;
    const want = p.pocketOpen && badgeMode;
    const before = P.t;
    const span = p.reduced ? REDUCED_FADE_S : want ? OPEN_S : CLOSE_S;
    P.t = clamp01(P.t + ((want ? 1 : -1) * dt) / span);
    P.time += dt;
    if (want) P.engaged = true;
    if (p.reduced) {
      P.slider = 0;
      P.flap = 0;
      P.hole = 0;
      P.push = 0;
      P.light = P.t;
      P.ringFade = 1 - P.t;
    } else {
      P.slider = easeInOut(clamp01(P.t / 0.45)); // 0.00-0.45 s: the pull goes once round
      P.flap = easeOutBack(clamp01((P.t - 0.42) / 0.36)); // 0.42-0.78 s: the flap swings open
      P.hole = smoothstep(0.42, 0.7, P.t);
      P.light = smoothstep(0.5, 1, P.t); // 0.50-1.00 s: light pours out
      P.push = easeInOut(clamp01((P.t - 0.1) / 0.9));
      P.ringFade = 1 - smoothstep(0, 0.15, P.t);
    }
    P.active = want || P.t > 0;
    if (want && P.t >= 1 && !P.openedSent) {
      P.openedSent = true;
      p.onPocketOpened();
    }
    if (!want && P.t <= 0 && P.engaged) {
      P.engaged = false;
      P.openedSent = false;
      p.onPocketClosed();
    }
    if (P.t !== before) invalidate(); // keeps 'demand' mode rendering through the fade

    // ---- orientation
    let wobble = 0;
    let target: THREE.Vector3 | null = null;
    if (badgeMode) {
      // aim the (lifted) selected badge's centre exactly at FRONT_SPOT
      target = frontSpotWorld(fit.current, BADGE_R + BADGE_LIFT, scratchFront).normalize().applyAxisAngle(Z_AXIS, -TILT);
      s.lastTarget.copy(target);
      const goal = solveOrientation(layout.spots[p.selected].vec, target);
      let ty = nearestAngle(goal.yaw, s.yaw);
      if (!s.started) {
        s.started = true;
        if (s.spun && !p.reduced) {
          // badges arriving on a planet that was spinning on screen: carry its spin
          // into the spring, which then eases it round to the selected badge
          s.mode = 'spring';
          s.yawV = s.spin;
          s.pitchV = 0;
        } else {
          s.yaw = p.reduced ? ty : ty - INTRO_SWING;
          s.pitch = goal.pitch;
          s.yawV = 0;
          s.pitchV = 0;
        }
      }
      if (s.lastSelected !== p.selected) s.returnNow = s.mode !== 'spring'; // picked a tab mid-drag
      s.lastSelected = p.selected;
      const d = p.drag;

      if (p.reduced) {
        s.yaw = ty;
        s.pitch = goal.pitch;
        s.yawV = 0;
        s.pitchV = 0;
        s.mode = 'spring';
        s.wobble = 0;
      } else {
        const omega = P.active ? POCKET_OMEGA : SETTLE_OMEGA;
        if (P.active && s.mode !== 'spring') {
          s.mode = 'spring'; // the pocket locks the planet
          ty = nearestAngle(goal.yaw, s.yaw);
        }
        if (d.active && !P.active) {
          if (s.mode !== 'drag') {
            s.mode = 'drag';
            s.dragBase = s.yaw - d.offset;
          }
          s.yaw = s.dragBase + d.offset;
          s.yawV = 0;
        } else if (s.mode === 'drag') {
          s.mode = 'coast';
          s.coastV = d.velocity;
          s.coastT = 0;
        }
        if (s.mode === 'coast') {
          s.yaw += s.coastV * dt;
          s.coastV *= Math.exp(-2.6 * dt);
          s.coastT += dt;
          if (s.coastT >= DRAG_RETURN_S || s.returnNow) {
            s.mode = 'spring';
            s.returnNow = false;
            s.yawV = s.coastV;
            ty = nearestAngle(goal.yaw, s.yaw);
          }
        }
        if (s.mode === 'spring') [s.yaw, s.yawV] = spring(s.yaw, s.yawV, ty, omega, dt);
        [s.pitch, s.pitchV] = spring(s.pitch, s.pitchV, goal.pitch, omega, dt);
        const settled =
          !P.active &&
          s.mode === 'spring' &&
          Math.abs(s.yaw - ty) < 0.02 &&
          Math.abs(s.yawV) < 0.05 &&
          Math.abs(s.pitch - goal.pitch) < 0.02;
        s.wobble += ((settled ? 1 : 0) - s.wobble) * (1 - Math.exp(-dt * (settled ? 0.8 : 6)));
        wobble = s.wobble * WOBBLE * (0.8 * Math.sin(s.t * 0.55) + 0.2 * Math.sin(s.t * 1.3 + 1));
      }
    } else {
      if (s.started) {
        // badges taken off: spin on from the speed the spring had, then pick up pace
        s.started = false;
        s.spin = s.yawV;
        s.yawV = 0;
      }
      s.mode = 'spring';
      if (p.reduced) {
        s.pitch = FREE_PITCH;
        s.pitchV = 0;
        s.wobble = 0;
      } else {
        s.spun = true;
        s.spin += ((p.excited ? SPIN_EXCITED : SPIN_CALM) - s.spin) * (1 - Math.exp(-dt * 2.2));
        s.yaw = (s.yaw + s.spin * dt) % TWO_PI;
        [s.pitch, s.pitchV] = spring(s.pitch, s.pitchV, FREE_PITCH, SETTLE_OMEGA / 2, dt);
        // the idle rock about the last badge dies away instead of snapping off
        s.wobble *= Math.exp(-dt * 3);
        if (s.wobble > 1e-3) {
          target = s.lastTarget;
          wobble = s.wobble * WOBBLE * (0.8 * Math.sin(s.t * 0.55) + 0.2 * Math.sin(s.t * 1.3 + 1));
        }
      }
    }
    // free planets float gently; one showing its badges holds still
    s.bobAmp = p.reduced ? 0 : s.bobAmp + ((badgeMode ? 0 : 1) - s.bobAmp) * (1 - Math.exp(-dt * 3));
    bob.position.y = Math.sin(s.t * 1.15) * BOB * s.bobAmp;
    scratchQuat.setFromEuler(scratchEuler.set(s.pitch, s.yaw, 0, 'XYZ'));
    if (target && wobble !== 0) {
      // twist about the axis through the selected badge: the planet rocks, the badge stays put
      orient.quaternion.multiplyQuaternions(scratchWobble.setFromAxisAngle(target, wobble), scratchQuat);
    } else {
      orient.quaternion.copy(scratchQuat);
    }

    // ---- camera push-in along the ray through the pocket (it stays on FRONT_SPOT)
    const f = fit.current;
    if (P.push > 1e-4) {
      frontSpotWorld(f, BADGE_R + BADGE_LIFT, scratchPocket);
      camera.position.set(0, 0, f.distance).lerp(scratchPocket, PUSH_IN * P.push);
      const dist = camera.position.length();
      camera.near = Math.max(0.1, dist - 2.2);
      camera.far = dist + 2.2;
      camera.updateProjectionMatrix();
      s.pushed = true;
    } else if (s.pushed) {
      camera.position.set(0, 0, f.distance);
      camera.near = Math.max(0.1, f.distance - 2.2);
      camera.far = f.distance + 2.2;
      camera.updateProjectionMatrix();
      s.pushed = false;
    }
  }, -1);

  const selectedSpot = p.selected >= 0 ? (layout.spots[p.selected] ?? null) : null;
  const selectedShape = (p.selected >= 0 ? badgeShapes[p.selected] : undefined) ?? shapes.sticker;

  return (
    <>
      {lights.list.map((light) => (
        <primitive key={light.uuid} object={light} />
      ))}
      <group ref={bobRef}>
        <group rotation={[0, 0, TILT]}>
          <Boundary>
            <Satellites kind={p.kind} reducedMotion={p.reduced} />
          </Boundary>
          <group ref={orientRef}>
            <mesh geometry={sphere} material={planet} dispose={null} />
            <Boundary>
              <SurfaceProps kind={p.kind} reducedMotion={p.reduced} />
            </Boundary>
            {/* Badges, zippers and pocket: one layer that rises out of the fabric when
                the badges arrive and sinks back in when they go. */}
            <group ref={badgeLayerRef} visible={false}>
              {count > 0 ? (
                <>
                  <Zippers zippers={zippers} selected={p.selected} pocket={pocket} />
                  <Pocket spot={selectedSpot} shape={selectedShape} pocket={pocket} reduced={p.reduced} />
                </>
              ) : null}
              {layout.spots.map((spot, i) => {
                const badge = p.badges[i];
                const textures = p.badgeTextures[i];
                const shape = badgeShapes[i];
                if (!badge || !textures || !shape) return null;
                return (
                  <Badge
                    key={`${badge.id}-${i}`}
                    index={i}
                    spot={spot}
                    shape={shape}
                    textures={textures}
                    selected={i === p.selected}
                    leaving={p.leaving}
                    reduced={p.reduced}
                    pocket={pocket}
                    onPick={p.onPick}
                    onHover={p.onHover}
                  />
                );
              })}
            </group>
          </group>
        </group>
        {/* soft glowing edge: halo just outside the limb plus a fresnel rim on the surface */}
        <mesh geometry={shell} material={halo} scale={HALO_R} renderOrder={0} dispose={null} />
        <mesh geometry={shell} material={rim} scale={RIM_R} renderOrder={5} dispose={null} />
      </group>
      {/* always there: a planet may get its badges later (focused from the pod) */}
      <group visible={false}>
        {warm.materials.map((m) => (
          <mesh key={m.uuid} geometry={warm.geometry} material={m} dispose={null} />
        ))}
      </group>
    </>
  );
}

/* ------------------------------------------------------------- globe */

/** Globe3DProps plus a cap on the canvas pixel ratio (e.g. for a planet shown small). */
export type Globe3DViewProps = Globe3DProps & { maxDpr?: number };

function GlobeInner({
  kind,
  badges,
  selected,
  onSelectBadge,
  pocketOpen = false,
  onPocketOpened,
  onPocketClosed,
  detail = 'pod',
  excited = false,
  bleed = 0.3,
  className,
  maxDpr,
}: Globe3DViewProps) {
  const reduced = useReducedMotion() ?? false;
  const [webgl] = useState(supportsWebGL);
  const mapPx = MAP_PX[detail];
  const surfaceKey = `${kind}:${mapPx}`;
  // Maps already cached (preloadGlobes): show the 3D planet on the first frame, no fade.
  const [instant] = useState(() => surfaceReady.has(surfaceKey));
  const [loaded, setLoaded] = useState<SurfaceTextures | null>(null);
  const surface = loaded ?? surfaceReady.get(surfaceKey) ?? null;
  const [failed, setFailed] = useState(false);
  const [compiled, setCompiled] = useState(instant);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pocketShown, setPocketShown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ active: false, offset: 0, velocity: 0 });
  const hoverRef = useRef(-1);
  const alive = useRef(true);
  const answered = useRef(false); // last pocket state reported to the page

  // Badges can come and go on a live planet (a pod planet getting focused). When they
  // are taken away, keep drawing them for a moment so they shrink and sink away.
  const incoming = useMemo(() => badges ?? [], [badges]);
  const [shown, setShown] = useState<{ list: GlobeBadge[]; leaving: boolean }>(() => ({ list: incoming, leaving: false }));
  if (incoming.length > 0) {
    if (shown.list !== incoming || shown.leaving) setShown({ list: incoming, leaving: false });
  } else if (shown.list.length > 0 && !shown.leaving) {
    setShown({ list: shown.list, leaving: true });
  }
  useEffect(() => {
    if (!shown.leaving) return undefined;
    const id = window.setTimeout(() => setShown({ list: [], leaving: false }), reduced ? 0 : BADGE_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [shown, reduced]);
  const list = shown.list;
  const leaving = shown.leaving;

  const listRef = useLatest(list);
  const selectRef = useLatest(onSelectBadge);
  const openedRef = useLatest(onPocketOpened);
  const closedRef = useLatest(onPocketClosed);
  const count = list.length;
  const sel = count > 0 && !leaving ? Math.min(count - 1, Math.max(0, Math.round(selected ?? 0))) : -1;
  const pocketActive = pocketOpen || pocketShown;
  const pocketActiveRef = useLatest(pocketActive);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!webgl || surface) return;
    let cancelled = false;
    requestSurface(kind, mapPx, 1).then(
      (textures) => {
        if (!cancelled) setLoaded(textures);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [webgl, surface, kind, mapPx]);

  // Badge stickers: painted once per icon/colour/style/logo/size and shared.
  const badgePx = BADGE_PX[detail];
  const keys = list.map((b) => badgeKey(b, badgePx));
  const keySignature = keys.join('~');
  const [badgeLoaded, setBadgeLoaded] = useState<Record<string, BadgeTextures>>({});
  const badgeTextures = keys.map((k) => badgeLoaded[k] ?? badgeReady.get(k) ?? null);

  useEffect(() => {
    if (!webgl) return;
    let cancelled = false;
    for (const badge of listRef.current) {
      const key = badgeKey(badge, badgePx);
      if (badgeReady.has(key)) continue;
      void requestBadge(badge, badgePx).then((textures) => {
        if (!cancelled) setBadgeLoaded((prev) => ({ ...prev, [key]: textures }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [webgl, keySignature, badgePx, listRef]);

  // Stop rendering while scrolled out of view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setVisible(last.isIntersecting);
      },
      { rootMargin: '80px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fail = useCallback(() => {
    if (!alive.current) return;
    setFailed(true);
    setReady(false);
  }, []);
  const onCompiled = useCallback(() => {
    if (alive.current) setCompiled(true);
  }, []);
  const onReady = useCallback(() => {
    if (alive.current) setReady(true);
  }, []);

  const reportOpened = useCallback(() => {
    if (!alive.current || answered.current) return;
    answered.current = true;
    setPocketShown(true);
    openedRef.current?.();
  }, [openedRef]);
  const reportClosed = useCallback(() => {
    if (!alive.current) return;
    answered.current = false;
    setPocketShown(false);
    closedRef.current?.();
  }, [closedRef]);

  const live = webgl && !failed && surface !== null;
  const sceneDrivesPocket = live && ready && count > 0;

  // No 3D pocket to animate (fallback, still loading, lost context): answer anyway,
  // so the page never waits on a pocket that cannot open.
  useEffect(() => {
    if (sceneDrivesPocket || pocketOpen === answered.current) return;
    const id = window.setTimeout(() => (pocketOpen ? reportOpened() : reportClosed()), reduced ? 0 : 150);
    return () => window.clearTimeout(id);
  }, [pocketOpen, sceneDrivesPocket, reduced, reportOpened, reportClosed]);

  const applyCursor = useCallback(() => {
    const el = hitRef.current;
    if (!el) return;
    const hovered = hoverRef.current;
    el.style.cursor = dragRef.current.active ? 'grabbing' : hovered >= 0 ? 'pointer' : '';
    const title = hovered >= 0 ? listRef.current[hovered]?.title : undefined;
    if (title) el.title = title;
    else el.removeAttribute('title');
  }, [listRef]);

  const onHover = useCallback(
    (index: number, on: boolean) => {
      if (on) hoverRef.current = index;
      else if (hoverRef.current === index) hoverRef.current = -1;
      applyCursor();
    },
    [applyCursor],
  );
  const onPick = useCallback(
    (index: number) => {
      if (!pocketActiveRef.current) selectRef.current?.(index);
    },
    [selectRef, pocketActiveRef],
  );

  const interactive = live && ready && count > 0 && !leaving && !pocketActive;

  // Drag to spin, with inertia; the scene eases back to the selected badge 2.5 s after release.
  useEffect(() => {
    const el = hitRef.current;
    if (!el || !interactive || reduced) return;
    const drag = dragRef.current;
    let pointer: { id: number; x: number; lastX: number; lastT: number } | null = null;

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointer = { id: e.pointerId, x: e.clientX, lastX: e.clientX, lastT: e.timeStamp };
    };
    const move = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const dx = e.clientX - pointer.x;
      if (!drag.active) {
        if (Math.abs(dx) < CLICK_SLOP_PX) return;
        drag.active = true;
        drag.velocity = 0;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // pointer already released
        }
        applyCursor();
      }
      // the surface under the pointer roughly follows it: 1 radius of travel = 1 radian
      const perPx = 1.8 / Math.max(1, el.getBoundingClientRect().width);
      drag.offset = dx * perPx;
      const dt = (e.timeStamp - pointer.lastT) / 1000;
      if (dt > 0.001) drag.velocity = drag.velocity * 0.5 + (((e.clientX - pointer.lastX) * perPx) / dt) * 0.5;
      pointer.lastX = e.clientX;
      pointer.lastT = e.timeStamp;
    };
    const up = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      if (drag.active) {
        if (e.timeStamp - pointer.lastT > 100) drag.velocity = 0; // held still before letting go
        drag.velocity = Math.max(-6, Math.min(6, drag.velocity));
        drag.active = false;
        applyCursor();
      }
      pointer = null;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      drag.active = false;
      hoverRef.current = -1;
      el.style.cursor = '';
      el.removeAttribute('title');
    };
  }, [interactive, reduced, applyCursor]);

  const onCreated = useCallback((state: RootState) => {
    const renderer = state.gl;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    // Events arrive on the hit circle, not the canvas; map them through the canvas rect
    // (handles the bleed and any CSS transform on the way).
    state.setEvents({
      compute: (event, root) => {
        const rect = root.gl.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        root.pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        root.raycaster.setFromCamera(root.pointer, root.camera);
      },
    });
  }, []);

  const loop: Loop = !compiled || (!visible && !pocketActive) ? 'never' : reduced ? 'demand' : 'always';
  const dprMax = DPR[detail][1];
  const dpr = useMemo<[number, number]>(
    () => [1, maxDpr ? Math.max(1, Math.min(dprMax, maxDpr)) : dprMax],
    [maxDpr, dprMax],
  );
  const classes = ['globe3d', instant ? 'is-instant' : '', ready ? 'is-ready' : '', interactive ? 'is-interactive' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={wrapRef} className={classes} style={{ '--globe-bleed': String(bleed) } as CSSProperties} aria-hidden="true">
      <div ref={hitRef} className="globe3d-hit" />
      {!webgl || failed ? (
        <div className="globe3d-fallback">
          <Planet kind={kind} />
        </div>
      ) : null}
      {live && surface ? (
        <div className="globe3d-stage">
          <Boundary onError={fail}>
            <Canvas
              frameloop={loop}
              dpr={dpr}
              gl={GL_OPTIONS}
              camera={CAMERA_OPTIONS}
              resize={RESIZE_OPTIONS}
              eventSource={hitRef as RefObject<HTMLElement>}
              onCreated={onCreated}
            >
              <Scene
                kind={kind}
                detail={detail}
                surface={surface}
                badges={list}
                badgeTextures={badgeTextures}
                selected={sel}
                leaving={leaving}
                pocketOpen={pocketOpen}
                excited={excited}
                reduced={reduced}
                loop={loop}
                bleed={bleed}
                hitRef={hitRef}
                drag={dragRef.current}
                onPick={onPick}
                onHover={onHover}
                onCompiled={onCompiled}
                onReady={onReady}
                onLost={fail}
                onPocketOpened={reportOpened}
                onPocketClosed={reportClosed}
              />
            </Canvas>
          </Boundary>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A 3D craft planet that exactly fills its parent box (diameter = box width).
 * With cached maps (preloadGlobes) it shows on the first frame; otherwise it stays
 * transparent until painted, then fades in.
 */
export function Globe3D(props: Globe3DViewProps) {
  // A different planet or detail level starts fresh.
  return <GlobeInner key={`${props.kind}:${props.detail ?? 'pod'}`} {...props} />;
}

/** Paints and caches a planet's maps in idle time, so opening it later is instant. */
export function preloadPlanet(kind: PlanetKind, detail: 'pod' | 'hero'): void {
  if (!supportsWebGL()) return;
  requestSurface(kind, MAP_PX[detail], 2).catch(() => undefined);
}

/* ------------------------------------------------------------ preload */

let shadersWarmed = false;

// Compiles the globes' shader programs once in a throwaway context. Browsers keep a
// program cache keyed by shader source (Chrome shares it across contexts), so each
// globe's own compile on mount becomes a cache hit. Mirrors Scene's lights and
// materials exactly; the props' own materials are not covered.
async function warmShaders(base: boolean, withBadges: boolean): Promise<void> {
  if (shadersWarmed || (!base && !withBadges)) return;
  const canvas = makeCanvas(8);
  const renderer = new THREE.WebGLRenderer({ canvas, ...GL_OPTIONS });
  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(item: T): T => {
    trash.push(item);
    return item;
  };
  try {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
    camera.position.set(0, 0, 9);
    const blank = keep(canvasTexture(makeCanvas(1)));
    const sphere = keep(new THREE.SphereGeometry(1, 8, 6));
    const box = keep(new THREE.BoxGeometry(1, 1, 1));
    const scenes: THREE.Scene[] = [];
    for (const badges of [false, true]) {
      if (badges ? !withBadges : !base) continue;
      const scene = new THREE.Scene();
      for (const light of createLights()) scene.add(light);
      const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => scene.add(new THREE.Mesh(geometry, keep(material)));
      add(sphere, makePlanetMaterial({ map: blank, bump: blank }, 'knit', 'hero'));
      add(sphere, makeAtmosphere('knit', true));
      add(sphere, makeAtmosphere('knit', false));
      if (badges) {
        scene.add(createPocketLight());
        for (const material of [
          makeBadgeMaterial(blank),
          makeLiningMaterial(blank),
          makeShadowMaterial(blank),
          additive(blank),
          makeGlowMaterial(),
          makeHoleMaterial(),
          makeRayMaterial(),
        ]) {
          add(sphere, material);
        }
        scene.add(new THREE.InstancedMesh(box, keep(makeBrassMaterial()), 1));
        scene.add(new THREE.InstancedMesh(box, keep(makeTapeMaterial()), 1));
      }
      scenes.push(scene);
    }
    for (const scene of scenes) await renderer.compileAsync(scene, camera);
    shadersWarmed = true;
  } finally {
    trash.forEach((item) => item.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/**
 * Paints every listed surface map and badge texture at full speed (the app shows a
 * loading screen meanwhile), warms the shader programs, and resolves when all of it
 * is cached. Rejects only if the fabric photos cannot load at all.
 */
export async function preloadGlobes(requests: PreloadRequest[], onProgress?: (done: number, total: number) => void): Promise<void> {
  if (!supportsWebGL()) {
    onProgress?.(0, 0); // nothing 3D will show; the SVG planets need no preload
    return;
  }
  const surfaces = new Map<string, { kind: PlanetKind; size: number }>();
  const badges = new Map<string, { badge: GlobeBadge; px: number }>();
  let base = false;
  let withBadges = false;
  for (const request of requests) {
    const size = MAP_PX[request.detail];
    surfaces.set(`${request.kind}:${size}`, { kind: request.kind, size });
    const list = request.badges ?? [];
    if (list.length > 0) withBadges = true;
    else base = true;
    for (const badge of list) {
      const px = BADGE_PX[request.detail];
      badges.set(badgeKey(badge, px), { badge, px });
    }
  }
  const total = surfaces.size + badges.size + 1; // + shader warm-up
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(done, total);
  };
  onProgress?.(0, total);

  await getImages(); // the only failure that rejects
  await Promise.all([
    ...[...surfaces.values()].map(({ kind, size }) => requestSurface(kind, size, 0).then(tick, tick)),
    ...[...badges.values()].map(({ badge, px }) => requestBadge(badge, px).then(tick, tick)),
  ]);
  await nextFrame();
  await warmShaders(base, withBadges).catch(() => undefined);
  tick();
}
