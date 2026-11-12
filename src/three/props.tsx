// Raised 3D craft objects for the planets: things stuck on the surface (map pins,
// a trophy, felt buttons, a graduation cap, a framed window under a striped
// awning) and things floating around it (felt clouds, a paper plane, bead rings,
// a moonlet, paper envelopes). Original art only.
//
// The planet is a unit sphere at the origin. Nothing here reaches past radius
// ~1.52 (the canvas bleed is 1.55). Geometries, materials and canvas textures are
// created lazily once per page and shared by every planet, so four pod planets
// cost little more than one.

import { useMemo, useRef, type JSX, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlanetKind } from '../content';
import { latLonToVec3 } from './spec';
import feltUrl from '../assets/textures/felt.jpg';
import cardboardUrl from '../assets/textures/cardboard.jpg';

type Vec3 = [number, number, number];
type LatLon = [number, number];

const DEG = Math.PI / 180;
const WHITE = new THREE.Color('#ffffff');
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

const INK = '#1b1b24';
const PINK = '#c8146a';
const CREAM_THREAD = '#fff3d6';
const FONT_STACK = "Fredoka, 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";

// ---------------------------------------------------------------------------
// Shared resources, created on first use and kept for the life of the page.

const cache = new Map<string, unknown>();

function shared<T>(key: string, make: () => T): T {
  let value = cache.get(key) as T | undefined;
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

const textureLoader = new THREE.TextureLoader();

/** A CC0 fabric photo, loaded once. */
function photo(url: string): THREE.Texture {
  return shared(`photo:${url}`, () => {
    const tex = textureLoader.load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
}

let fontsReady: Promise<void> | null = null;

/** Runs `repaint` once the display font has loaded (or failed to). */
function afterFonts(repaint: () => void): void {
  if (typeof document === 'undefined' || !document.fonts) return;
  fontsReady ??= Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.ready]).then(
    () => undefined,
    () => undefined,
  );
  void fontsReady.then(repaint);
}

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTexture(key: string, w: number, h: number, paint: Painter, hasText = false): THREE.CanvasTexture {
  return shared(`canvas:${key}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const draw = () => {
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        paint(ctx, w, h);
        ctx.restore();
        tex.needsUpdate = true;
      };
      draw();
      if (hasText) afterFonts(draw);
    }
    return tex;
  });
}

// ---------------------------------------------------------------------------
// Canvas drawing helpers.

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + 0.55 * s);
  ctx.bezierCurveTo(cx - 0.12 * s, cy + 0.42 * s, cx - 0.62 * s, cy + 0.12 * s, cx - 0.62 * s, cy - 0.2 * s);
  ctx.bezierCurveTo(cx - 0.62 * s, cy - 0.56 * s, cx - 0.12 * s, cy - 0.62 * s, cx, cy - 0.3 * s);
  ctx.bezierCurveTo(cx + 0.12 * s, cy - 0.62 * s, cx + 0.62 * s, cy - 0.56 * s, cx + 0.62 * s, cy - 0.2 * s);
  ctx.bezierCurveTo(cx + 0.62 * s, cy + 0.12 * s, cx + 0.12 * s, cy + 0.42 * s, cx, cy + 0.55 * s);
  ctx.closePath();
}

function cloudPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const puffs: Vec3[] = [
    [x, y, r],
    [x - r * 0.95, y + r * 0.35, r * 0.7],
    [x + r * 0.95, y + r * 0.32, r * 0.78],
  ];
  ctx.beginPath();
  for (const [cx, cy, pr] of puffs) {
    ctx.moveTo(cx + pr, cy);
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
  }
  ctx.rect(x - r * 0.95, y + r * 0.3, r * 1.9, r * 0.75);
}

/** Short felt fibres so a flat colour reads as fabric. */
function paintFibres(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number): void {
  const rand = rng(seed);
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const a = rand() * Math.PI;
    const len = 2 + rand() * 6;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** Running stitch: dashed thread with a soft shadow under it. `trace` adds path segments. */
function paintStitch(ctx: CanvasRenderingContext2D, trace: () => void, color: string, width: number, dash: number[]): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.strokeStyle = 'rgba(20,10,30,0.32)';
  ctx.translate(width * 0.25, width * 0.35);
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.translate(-width * 0.25, -width * 0.35);
  ctx.strokeStyle = color;
  ctx.beginPath();
  trace();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Painted textures.

/** Small studio environment so metal and plastic have something to reflect. */
function studioEnv(): THREE.Texture {
  return shared('env:studio', () => {
    const tex = canvasTexture('studio-env', 256, 128, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#fff4e2');
      sky.addColorStop(0.42, '#bccbe6');
      sky.addColorStop(0.53, '#4d4a66');
      sky.addColorStop(1, '#17141f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRectPath(ctx, w * 0.16, h * 0.14, w * 0.16, h * 0.18, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,196,140,0.9)';
      roundRectPath(ctx, w * 0.58, h * 0.6, w * 0.14, h * 0.12, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,190,255,0.85)';
      roundRectPath(ctx, w * 0.82, h * 0.25, w * 0.06, h * 0.2, 6);
      ctx.fill();
    });
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  });
}

function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture('contact-shadow', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(10,6,20,0.62)');
    g.addColorStop(0.55, 'rgba(10,6,20,0.3)');
    g.addColorStop(1, 'rgba(10,6,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

interface DiscArt {
  fill: string;
  /** Running-stitch rings, as fractions of the disc radius. */
  rings: number[];
  /** Lighter inner disc (nested patch look), fraction of the disc radius. */
  inner?: number;
  /** Four button holes with a thread cross. */
  holes?: boolean;
}

/** Top-down art for a felt disc; maps onto pillowGeo's planar UVs (disc radius 1 = half the canvas). */
function discTexture(art: DiscArt): THREE.CanvasTexture {
  const key = `disc:${art.fill}:${art.rings.join(',')}:${art.inner ?? 0}:${art.holes ? 1 : 0}`;
  return canvasTexture(key, 256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = art.fill;
    ctx.fillRect(0, 0, w, w);
    paintFibres(ctx, w, w, hashString(key), 420);
    if (art.inner) {
      ctx.fillStyle = `#${new THREE.Color(art.fill).lerp(WHITE, 0.22).getHexString()}`;
      ctx.beginPath();
      ctx.arc(c, c, art.inner * c, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,0,10,0.25)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const r of art.rings) {
      paintStitch(ctx, () => ctx.arc(c, c, r * c, 0, Math.PI * 2), CREAM_THREAD, 7, [13, 10]);
    }
    if (art.holes) {
      const off = 0.26 * c;
      const hr = 0.085 * c;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(c + sx * off, c + sy * off, hr * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1a22';
        ctx.beginPath();
        ctx.arc(c + sx * off, c + sy * off, hr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = CREAM_THREAD;
      ctx.lineWidth = hr * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c - off, c - off);
      ctx.lineTo(c + off, c + off);
      ctx.moveTo(c + off, c - off);
      ctx.lineTo(c - off, c + off);
      ctx.stroke();
    }
  });
}

function paintHelloPicture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#4fb3ea');
  sky.addColorStop(0.65, '#a9defa');
  sky.addColorStop(1, '#dff4ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun with short rays.
  const sx = w * 0.13;
  const sy = h * 0.55;
  const sr = h * 0.065;
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd84d';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * sr * 1.45, sy + Math.sin(a) * sr * 1.45);
    ctx.lineTo(sx + Math.cos(a) * sr * 1.95, sy + Math.sin(a) * sr * 1.95);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  cloudPath(ctx, w * 0.86, h * 0.53, h * 0.05);
  ctx.fill();
  cloudPath(ctx, w * 0.9, h * 0.2, h * 0.035);
  ctx.fill();

  // Rolling felt hills.
  ctx.fillStyle = '#86cf5c';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.bezierCurveTo(w * 0.2, h * 0.68, w * 0.42, h * 0.86, w * 0.62, h * 0.78);
  ctx.bezierCurveTo(w * 0.8, h * 0.7, w * 0.92, h * 0.74, w, h * 0.72);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5cad42';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.92);
  ctx.bezierCurveTo(w * 0.3, h * 0.82, w * 0.6, h * 0.98, w, h * 0.86);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Envelope with a heart seal.
  ctx.save();
  ctx.translate(w * 0.5, h * 0.64);
  ctx.rotate(-4 * DEG);
  const ew = w * 0.3;
  const eh = h * 0.32;
  ctx.fillStyle = 'rgba(20,40,80,0.2)';
  roundRectPath(ctx, -ew / 2 + 9, -eh / 2 + 11, ew, eh, 14);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  roundRectPath(ctx, -ew / 2, -eh / 2, ew, eh, 14);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(27,27,36,0.35)';
  ctx.beginPath();
  ctx.moveTo(-ew / 2 + 8, eh / 2 - 8);
  ctx.lineTo(-ew * 0.08, eh * 0.02);
  ctx.moveTo(ew / 2 - 8, eh / 2 - 8);
  ctx.lineTo(ew * 0.08, eh * 0.02);
  ctx.stroke();
  ctx.fillStyle = '#f3ede0';
  ctx.beginPath();
  ctx.moveTo(-ew / 2 + 5, -eh / 2 + 5);
  ctx.lineTo(0, eh * 0.1);
  ctx.lineTo(ew / 2 - 5, -eh / 2 + 5);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-ew / 2 + 5, -eh / 2 + 5);
  ctx.lineTo(0, eh * 0.1);
  ctx.lineTo(ew / 2 - 5, -eh / 2 + 5);
  ctx.stroke();
  heartPath(ctx, 0, eh * 0.1, eh * 0.42);
  ctx.fillStyle = '#e8364f';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();

  // Title.
  ctx.save();
  ctx.translate(w * 0.5, h * 0.3);
  ctx.rotate(-3 * DEG);
  ctx.font = `700 ${Math.round(h * 0.17)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = h * 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('Say hello!', 0, 0);
  ctx.fillStyle = PINK;
  ctx.fillText('Say hello!', 0, 0);
  ctx.restore();

  // Shade cast by the awning, then a stitched border.
  const shade = ctx.createLinearGradient(0, 0, 0, h * 0.2);
  shade.addColorStop(0, 'rgba(18,16,48,0.4)');
  shade.addColorStop(1, 'rgba(18,16,48,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h * 0.2);
  paintStitch(ctx, () => roundRectPath(ctx, 18, 18, w - 36, h - 36, 18), CREAM_THREAD, 6, [16, 12]);
}

/** Awning fabric: u runs west to east, v from the wall (top) down to the scalloped hem. */
function paintAwning(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const colors = ['#ff7eb6', '#2ec4b6', '#ffd23f'];
  const count = 12;
  const sw = w / count;
  const hem = h - sw / 2 - 3;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(i * sw - 0.5, 0, sw + 1, hem);
    ctx.beginPath();
    ctx.arc(i * sw + sw / 2, hem - 0.5, sw / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(40,10,40,0.12)';
  for (let i = 1; i < count; i++) ctx.fillRect(i * sw - 1, 0, 2, hem);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(30,10,40,0.2)');
  g.addColorStop(0.35, 'rgba(30,10,40,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  paintFibres(ctx, w, h, 77, 900);
  ctx.globalCompositeOperation = 'source-over';
  paintStitch(
    ctx,
    () => {
      ctx.moveTo(6, 15);
      ctx.lineTo(w - 6, 15);
    },
    '#ff8a1f',
    5,
    [13, 9],
  );
  paintStitch(
    ctx,
    () => {
      ctx.moveTo(6, hem - 12);
      ctx.lineTo(w - 6, hem - 12);
    },
    CREAM_THREAD,
    4,
    [10, 9],
  );
}

function paintEnvelopeFlap(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  paintFibres(ctx, w, h, 11, 160);
  ctx.strokeStyle = 'rgba(40,40,60,0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.5, h * 0.48);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.fillStyle = '#efebe4';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.5, h * 0.6);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,40,60,0.3)';
  ctx.stroke();
  heartPath(ctx, w * 0.5, h * 0.57, h * 0.26);
  ctx.fillStyle = '#e8364f';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,40,60,0.18)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
}

function paintEnvelopeAddress(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  paintFibres(ctx, w, h, 23, 160);
  // Stamp with a little sun.
  const sx = w * 0.72;
  const sy = h * 0.12;
  const sw = w * 0.2;
  const sh = h * 0.34;
  ctx.fillStyle = '#ff9fc4';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath();
  ctx.arc(sx + sw / 2, sy + sh * 0.55, sw * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(sx + 3, sy + 3, sw - 6, sh - 6);
  ctx.setLineDash([]);
  // Postmark waves.
  ctx.strokeStyle = 'rgba(50,60,110,0.3)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const y = h * (0.17 + k * 0.08);
    ctx.beginPath();
    ctx.moveTo(w * 0.46, y);
    ctx.quadraticCurveTo(w * 0.52, y - 6, w * 0.58, y);
    ctx.quadraticCurveTo(w * 0.64, y + 6, w * 0.7, y);
    ctx.stroke();
  }
  // Address lines.
  ctx.strokeStyle = 'rgba(50,60,110,0.45)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = h * (0.56 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(w * 0.22, y);
    ctx.lineTo(w * (0.66 - i * 0.08), y);
    ctx.stroke();
  }
}

function paintMoonlet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#d9a42c';
  ctx.fillRect(0, 0, w, h);
  paintFibres(ctx, w, h, 5, 500);
  const spots: [number, number, number, string][] = [
    [0.24, 0.42, 15, '#a97b19'],
    [0.6, 0.6, 10, '#b98a22'],
    [0.8, 0.36, 7, '#a97b19'],
  ];
  for (const [u, v, r, color] of spots) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(u * w, v * h, r, 0, Math.PI * 2);
    ctx.fill();
    paintStitch(ctx, () => ctx.arc(u * w, v * h, r + 5, 0, Math.PI * 2), '#fff0c4', 2.5, [5, 4]);
  }
}

// ---------------------------------------------------------------------------
// Materials.

function makeFelt(tint: string, params: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.9,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(tint).lerp(WHITE, 0.45),
    bumpMap: photo(feltUrl),
    bumpScale: 1.2,
    ...params,
  });
}

function felt(color: string): THREE.MeshPhysicalMaterial {
  return shared(`m:felt:${color}`, () => makeFelt(color));
}

/** Felt with painted art; `tint` only drives the sheen colour. */
function printedFelt(
  key: string,
  tint: string,
  map: THREE.Texture,
  params: THREE.MeshPhysicalMaterialParameters = {},
): THREE.MeshPhysicalMaterial {
  return shared(`m:felt-print:${key}`, () => makeFelt(tint, { color: '#ffffff', map, ...params }));
}

function plastic(color: string): THREE.MeshStandardMaterial {
  return shared(
    `m:plastic:${color}`,
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.33, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.35 }),
  );
}

function metal(color: string, roughness = 0.3): THREE.MeshStandardMaterial {
  return shared(
    `m:metal:${color}:${roughness}`,
    () => new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness, envMap: studioEnv(), envMapIntensity: 1 }),
  );
}

function woodMaterial(): THREE.MeshStandardMaterial {
  return shared(
    'm:wood',
    () => new THREE.MeshStandardMaterial({ color: '#e09a62', map: photo(cardboardUrl), roughness: 0.62 }),
  );
}

function shadowMaterial(): THREE.MeshBasicMaterial {
  return shared(
    'm:shadow',
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: false,
      }),
  );
}

function paperPlaneMaterial(): THREE.MeshStandardMaterial {
  return shared(
    'm:paper-plane',
    () => new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.8, side: THREE.DoubleSide }),
  );
}

function ringMaterial(): THREE.MeshStandardMaterial {
  return shared(
    'm:ring',
    () => new THREE.MeshStandardMaterial({ color: '#fffdf6', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.18 }),
  );
}

function pictureMaterial(): THREE.MeshStandardMaterial {
  return shared('m:picture', () => {
    const map = canvasTexture('hello-picture', 768, 500, paintHelloPicture, true);
    // A little self-light keeps "Say hello!" readable on the dark side of the scene.
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.32 });
  });
}

function awningMaterial(): THREE.MeshPhysicalMaterial {
  return printedFelt('awning', '#ff9ccc', canvasTexture('awning', 576, 160, paintAwning), {
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
}

function envelopeMaterials(tint: string): THREE.Material[] {
  return shared(`m:envelope:${tint}`, () => {
    const edge = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85 });
    const flap = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.8,
      map: canvasTexture('envelope-flap', 256, 174, paintEnvelopeFlap),
    });
    const back = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.8,
      map: canvasTexture('envelope-address', 256, 174, paintEnvelopeAddress),
    });
    // BoxGeometry groups: +x, -x, +y, -y, +z (flap side), -z (address side).
    return [edge, edge, edge, edge, flap, back];
  });
}

// ---------------------------------------------------------------------------
// Geometries (unit sized where possible and scaled per mesh).

function sphereGeo(): THREE.SphereGeometry {
  return shared('g:sphere', () => new THREE.SphereGeometry(1, 24, 16));
}

function smoothSphereGeo(): THREE.SphereGeometry {
  return shared('g:sphere-smooth', () => new THREE.SphereGeometry(1, 36, 24));
}

function cylinderGeo(): THREE.CylinderGeometry {
  return shared('g:cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 12));
}

function boxGeo(): THREE.BoxGeometry {
  return shared('g:box', () => new THREE.BoxGeometry(1, 1, 1));
}

function shadowGeo(): THREE.BufferGeometry {
  return shared('g:shadow', () => new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
}

/**
 * A soft felt disc: radius 1, top at y = 1, rounded (bevelled) edge, and a
 * skirt down to y = -0.9 that hides the gap on the curved planet. UVs are a
 * top-down projection so flat canvas art (stitch rings, button holes) is not
 * distorted.
 */
function pillowGeo(): THREE.BufferGeometry {
  return shared('g:pillow', () => {
    const profile: LatLon[] = [
      [0, -0.9],
      [1, -0.9],
      [1, 0.35],
      [0.99, 0.6],
      [0.955, 0.8],
      [0.89, 0.94],
      [0.8, 1],
      [0, 1],
    ];
    const geo = new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    );
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) * 0.5, 0.5 - pos.getZ(i) * 0.5);
    uv.needsUpdate = true;
    return geo;
  });
}

/** Trophy cup, stem and foot in one lathe profile (height ~0.164). */
function trophyCupGeo(): THREE.LatheGeometry {
  return shared('g:trophy-cup', () => {
    const profile: LatLon[] = [
      [0, 0],
      [0.034, 0],
      [0.036, 0.006],
      [0.03, 0.012],
      [0.012, 0.02],
      [0.009, 0.038],
      [0.016, 0.045],
      [0.009, 0.052],
      [0.013, 0.064],
      [0.03, 0.074],
      [0.046, 0.086],
      [0.056, 0.102],
      [0.061, 0.125],
      [0.064, 0.148],
      [0.067, 0.162],
      [0.061, 0.164],
      [0.058, 0.15],
      [0.054, 0.126],
      [0.044, 0.104],
      [0, 0.094],
    ];
    return new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      32,
    );
  });
}

function trophyHandleGeo(): THREE.TorusGeometry {
  return shared('g:trophy-handle', () => new THREE.TorusGeometry(0.024, 0.0062, 8, 20, Math.PI));
}

function capBodyGeo(): THREE.CylinderGeometry {
  return shared('g:cap-body', () => new THREE.CylinderGeometry(0.094, 0.104, 0.075, 28));
}

function tasselGeo(): THREE.CylinderGeometry {
  return shared('g:tassel', () => new THREE.CylinderGeometry(0.0055, 0.016, 0.04, 12));
}

function ringGeo(radius: number): THREE.TorusGeometry {
  return shared(`g:ring:${radius}`, () => new THREE.TorusGeometry(radius, 0.008, 6, 160));
}

function envelopeGeo(): THREE.BoxGeometry {
  return shared('g:envelope', () => new THREE.BoxGeometry(0.17, 0.115, 0.008));
}

/** Folded paper dart, nose toward -z (the direction of travel in a +y orbit). */
function paperPlaneGeo(): THREE.BufferGeometry {
  return shared('g:paper-plane', () => {
    const nose: Vec3 = [0, 0, -0.085];
    const tail: Vec3 = [0, 0, 0.06];
    const left: Vec3 = [-0.062, 0.016, 0.066];
    const right: Vec3 = [0.062, 0.016, 0.066];
    const keel: Vec3 = [0, -0.03, 0.06];
    const triangles = [nose, left, tail, nose, tail, right, nose, keel, tail];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(), 3));
    geo.computeVertexNormals();
    return geo;
  });
}

/** A path over the sphere at fixed radius, linear in lat/lon (latitude circles and meridians). */
class SphereArc extends THREE.Curve<THREE.Vector3> {
  readonly from: LatLon;
  readonly to: LatLon;
  readonly radius: number;

  constructor(from: LatLon, to: LatLon, radius: number) {
    super();
    this.from = from;
    this.to = to;
    this.radius = radius;
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const lat = this.from[0] + (this.to[0] - this.from[0]) * t;
    const lon = this.from[1] + (this.to[1] - this.from[1]) * t;
    const [x, y, z] = latLonToVec3(lat, lon, this.radius);
    return target.set(x, y, z);
  }
}

// ---------------------------------------------------------------------------
// Placement and motion helpers.

const _basis = new THREE.Matrix4();
const _east = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _south = new THREE.Vector3();
const _turn = new THREE.Quaternion();

/**
 * Orientation for an object standing on the sphere at lat/lon: local +Y along
 * the surface normal, local +X east, local +Z south. Then `spinDeg` turns it
 * about the normal and `tiltDeg` leans it about its (spun) local X.
 */
function surfaceQuaternion(lat: number, lon: number, spinDeg = 0, tiltDeg = 0, out = new THREE.Quaternion()): THREE.Quaternion {
  const [x, y, z] = latLonToVec3(lat, lon);
  _normal.set(x, y, z).normalize();
  const phi = (lon + 180) * DEG;
  _east.set(Math.sin(phi), 0, Math.cos(phi));
  _south.crossVectors(_east, _normal);
  _basis.makeBasis(_east, _normal, _south);
  out.setFromRotationMatrix(_basis);
  if (spinDeg) out.multiply(_turn.setFromAxisAngle(AXIS_Y, spinDeg * DEG));
  if (tiltDeg) out.multiply(_turn.setFromAxisAngle(AXIS_X, tiltDeg * DEG));
  return out;
}

function OnSurface({
  lat,
  lon,
  spin = 0,
  radius = 1,
  children,
}: {
  lat: number;
  lon: number;
  spin?: number;
  radius?: number;
  children: ReactNode;
}) {
  const frame = useMemo(() => {
    const [x, y, z] = latLonToVec3(lat, lon, radius);
    return { position: new THREE.Vector3(x, y, z), quaternion: surfaceQuaternion(lat, lon, spin) };
  }, [lat, lon, spin, radius]);
  return (
    <group position={frame.position} quaternion={frame.quaternion}>
      {children}
    </group>
  );
}

/** Calls `step` every frame with accumulated time, unless motion is reduced. */
function useMotion(reducedMotion: boolean, step: (time: number, dt: number) => void): void {
  const time = useRef(0);
  useFrame((_, delta) => {
    if (reducedMotion) return;
    const dt = Math.min(delta, 0.1);
    time.current += dt;
    step(time.current, dt);
  });
}

/** Group that turns about one local axis at `speed` rad/s, starting at `phase`. */
function Spinner({
  axis = 'y',
  speed,
  phase = 0,
  reducedMotion,
  children,
}: {
  axis?: 'y' | 'z';
  speed: number;
  phase?: number;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useMotion(reducedMotion, (_, dt) => {
    if (ref.current) ref.current.rotation[axis] += dt * speed;
  });
  const rotation: Vec3 = axis === 'y' ? [0, phase, 0] : [0, 0, phase];
  return (
    <group ref={ref} rotation={rotation}>
      {children}
    </group>
  );
}

/** Soft dark disc under a standing object (no real shadows are used). */
function ContactShadow({ radius }: { radius: number }) {
  return (
    <mesh
      geometry={shadowGeo()}
      material={shadowMaterial()}
      position={[0, 0.0025, 0]}
      scale={[radius, 1, radius]}
      renderOrder={2}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared felt pieces.

interface DiscDef {
  lat: number;
  lon: number;
  radius: number;
  color: string;
  top: string;
  spin?: number;
}

/** A felt disc with a smaller stitched disc on top (optionally a 4-hole button). */
function FeltDisc({ disc, holes }: { disc: DiscDef; holes: boolean }) {
  const base = printedFelt(`disc-base:${disc.color}`, disc.color, discTexture({ fill: disc.color, rings: [0.8] }));
  const top = printedFelt(
    `disc-top:${disc.top}:${holes ? 1 : 0}`,
    disc.top,
    discTexture({ fill: disc.top, rings: [0.7], holes }),
  );
  const topRadius = disc.radius * 0.62;
  return (
    <OnSurface lat={disc.lat} lon={disc.lon} spin={disc.spin ?? 0}>
      <mesh geometry={pillowGeo()} material={base} scale={[disc.radius, 0.024, disc.radius]} />
      <mesh geometry={pillowGeo()} material={top} position={[0, 0.021, 0]} scale={[topRadius, 0.018, topRadius]} />
    </OnSurface>
  );
}

function lighter(hex: string, amount: number): string {
  return `#${new THREE.Color(hex).lerp(WHITE, amount).getHexString()}`;
}

// ---------------------------------------------------------------------------
// 'knit' (Experience): map pins on a yarn route, felt clouds, a paper plane.

interface PinDef {
  lat: number;
  lon: number;
  color: string;
  spin: number;
  tilt: number;
}

const PINS: PinDef[] = [
  { lat: 42.87, lon: 74.59, color: '#e3262e', spin: 35, tilt: 11 }, // Bishkek
  { lat: 43.65, lon: -79.38, color: '#ffc61a', spin: 160, tilt: 9 }, // Toronto
  { lat: 49.28, lon: -123.12, color: '#ff5fa2', spin: 250, tilt: 13 }, // Vancouver
];

const NEEDLE = { length: 0.15, sunk: 0.03, radius: 0.0055, head: 0.038, tie: 0.075 };
const YARN = '#d8283a';

function MapPin({ pin }: { pin: PinDef }) {
  const headY = NEEDLE.length - NEEDLE.sunk + NEEDLE.head * 0.6;
  return (
    <OnSurface lat={pin.lat} lon={pin.lon} spin={pin.spin}>
      <ContactShadow radius={0.034} />
      <group rotation={[pin.tilt * DEG, 0, 0]}>
        <mesh
          geometry={cylinderGeo()}
          material={metal('#d9dde3', 0.25)}
          position={[0, NEEDLE.length / 2 - NEEDLE.sunk, 0]}
          scale={[NEEDLE.radius, NEEDLE.length, NEEDLE.radius]}
        />
        <mesh geometry={smoothSphereGeo()} material={plastic(pin.color)} position={[0, headY, 0]} scale={NEEDLE.head} />
      </group>
    </OnSurface>
  );
}

/** Where the yarn is tied on a pin's needle, in planet coordinates. */
function pinTiePoint(pin: PinDef): THREE.Vector3 {
  const [x, y, z] = latLonToVec3(pin.lat, pin.lon);
  return new THREE.Vector3(0, NEEDLE.tie, 0)
    .applyQuaternion(surfaceQuaternion(pin.lat, pin.lon, pin.spin, pin.tilt))
    .add(new THREE.Vector3(x, y, z));
}

/** Yarn tied between two pins, lying on the surface along the great circle. */
function yarnGeo(from: PinDef, to: PinDef): THREE.TubeGeometry {
  return shared(`g:yarn:${from.lat},${from.lon}:${to.lat},${to.lon}`, () => {
    const a = pinTiePoint(from);
    const b = pinTiePoint(to);
    const da = a.clone().normalize();
    const db = b.clone().normalize();
    const omega = Math.acos(THREE.MathUtils.clamp(da.dot(db), -1, 1));
    const steps = Math.max(6, Math.round(omega / (8 * DEG)));
    const points = [a];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const wa = Math.sin((1 - t) * omega) / Math.sin(omega);
      const wb = Math.sin(t * omega) / Math.sin(omega);
      points.push(new THREE.Vector3().addScaledVector(da, wa).addScaledVector(db, wb).normalize().multiplyScalar(1.012));
    }
    points.push(b);
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, steps * 8, 0.0042, 5, false);
  });
}

function KnitSurface() {
  return (
    <group>
      {PINS.map((pin) => (
        <MapPin key={pin.lon} pin={pin} />
      ))}
      <mesh geometry={yarnGeo(PINS[0], PINS[1])} material={felt(YARN)} />
      <mesh geometry={yarnGeo(PINS[1], PINS[2])} material={felt(YARN)} />
    </group>
  );
}

type Puff = [number, number, number, number]; // x, y, z, radius

interface CloudDef {
  orbit: number;
  height: number;
  tilt: Vec3;
  speed: number;
  phase: number;
  puffs: Puff[];
}

const CLOUDS: CloudDef[] = [
  {
    orbit: 1.3,
    height: 0.05,
    tilt: [0.28, 0, 0.12],
    speed: 0.07,
    phase: 0.6,
    puffs: [
      [0, 0, 0, 0.075],
      [0.07, -0.01, 0.01, 0.058],
      [-0.07, -0.012, 0, 0.06],
      [0.025, 0.035, -0.01, 0.055],
      [-0.03, 0.028, 0.015, 0.05],
    ],
  },
  {
    orbit: 1.29,
    height: -0.04,
    tilt: [-0.22, 0, -0.3],
    speed: 0.055,
    phase: 2.8,
    puffs: [
      [0, 0, 0, 0.065],
      [0.06, -0.008, 0, 0.05],
      [-0.055, -0.01, 0.01, 0.048],
      [0.01, 0.03, 0, 0.045],
    ],
  },
  {
    orbit: 1.34,
    height: 0.02,
    tilt: [0.12, 0, 0.36],
    speed: 0.06,
    phase: 4.7,
    puffs: [
      [0, 0, 0, 0.07],
      [0.075, -0.012, 0, 0.055],
      [-0.072, -0.01, 0.005, 0.056],
      [0.035, 0.033, 0.008, 0.05],
      [-0.03, 0.035, -0.01, 0.048],
      [0.12, -0.02, 0, 0.04],
    ],
  },
];

function FeltCloud({ cloud, reducedMotion }: { cloud: CloudDef; reducedMotion: boolean }) {
  const mat = felt('#fbfaf3');
  return (
    <group rotation={cloud.tilt}>
      <Spinner speed={cloud.speed} phase={cloud.phase} reducedMotion={reducedMotion}>
        {/* Turned so the cloud's long side runs along its path. */}
        <group position={[cloud.orbit, cloud.height, 0]} rotation={[0, Math.PI / 2, 0]}>
          {cloud.puffs.map(([x, y, z, r], i) => (
            <mesh key={i} geometry={sphereGeo()} material={mat} position={[x, y, z]} scale={[r, r * 0.76, r]} />
          ))}
        </group>
      </Spinner>
    </group>
  );
}

function PaperPlane({ reducedMotion }: { reducedMotion: boolean }) {
  const bob = useRef<THREE.Group>(null);
  useMotion(reducedMotion, (t) => {
    const g = bob.current;
    if (!g) return;
    g.position.y = Math.sin(t * 1.4) * 0.035;
    g.rotation.z = 0.35 + Math.sin(t * 1.1) * 0.12;
  });
  return (
    <group rotation={[0.42, 0, -0.22]}>
      <Spinner speed={0.32} phase={1.2} reducedMotion={reducedMotion}>
        <group position={[1.3, 0, 0]}>
          <group ref={bob} rotation={[0, 0, 0.35]}>
            <mesh geometry={paperPlaneGeo()} material={paperPlaneMaterial()} />
          </group>
        </group>
      </Spinner>
    </group>
  );
}

function KnitSky({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      {CLOUDS.map((cloud, i) => (
        <FeltCloud key={i} cloud={cloud} reducedMotion={reducedMotion} />
      ))}
      <PaperPlane reducedMotion={reducedMotion} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// 'stickers' (Projects): gold trophy, felt buttons, bead orbit rings.

const STICKER_BUTTONS: DiscDef[] = [
  { lat: -14, lon: -122, radius: 0.1, color: '#1fa59a', top: '#ffd34d', spin: 10 },
  { lat: -38, lon: -58, radius: 0.09, color: '#ef6a4c', top: '#ffe0cf', spin: 40 },
  { lat: 8, lon: 35, radius: 0.1, color: '#7a5af0', top: '#ff8fc0', spin: 75 },
  { lat: -20, lon: 140, radius: 0.095, color: '#ffb12b', top: '#2f63a8', spin: 20 },
];

function Trophy() {
  const gold = metal('#f3bd3c', 0.26);
  return (
    <OnSurface lat={55} lon={-82}>
      <ContactShadow radius={0.105} />
      {/* Stepped base: dark plinth, gold step, gold name plate. */}
      <mesh geometry={boxGeo()} material={plastic('#283063')} position={[0, 0.012, 0]} scale={[0.11, 0.046, 0.11]} />
      <mesh geometry={boxGeo()} material={gold} position={[0, 0.045, 0]} scale={[0.08, 0.02, 0.08]} />
      <mesh geometry={boxGeo()} material={gold} position={[0, 0.014, 0.0555]} scale={[0.062, 0.018, 0.003]} />
      <group position={[0, 0.055, 0]}>
        <mesh geometry={trophyCupGeo()} material={gold} />
        <mesh
          geometry={trophyHandleGeo()}
          material={gold}
          position={[0.057, 0.125, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          scale={[1, 1.1, 1]}
        />
        <mesh
          geometry={trophyHandleGeo()}
          material={gold}
          position={[-0.057, 0.125, 0]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[1, 1.1, 1]}
        />
      </group>
    </OnSurface>
  );
}

function StickerSurface() {
  return (
    <group>
      <Trophy />
      {STICKER_BUTTONS.map((disc) => (
        <FeltDisc key={`${disc.lat},${disc.lon}`} disc={disc} holes />
      ))}
    </group>
  );
}

interface RingDef {
  radius: number;
  tilt: Vec3;
  speed: number;
  beads: { angle: number; size: number; color: string }[];
}

const RINGS: RingDef[] = [
  {
    radius: 1.32,
    tilt: [Math.PI / 2 - 0.42, 0.22, 0.12],
    speed: 0.34,
    beads: [
      { angle: 0.3, size: 0.026, color: '#ff5fa2' },
      { angle: 2.4, size: 0.022, color: '#ffd23f' },
      { angle: 4.4, size: 0.026, color: '#2ec4b6' },
    ],
  },
  {
    radius: 1.45,
    tilt: [Math.PI / 2 + 0.5, -0.38, -0.2],
    speed: -0.24,
    beads: [
      { angle: 1.1, size: 0.03, color: '#ffffff' },
      { angle: 4.0, size: 0.027, color: '#8e63d2' },
    ],
  },
];

function BeadRings({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      {RINGS.map((ring) => (
        <group key={ring.radius} rotation={ring.tilt}>
          <mesh geometry={ringGeo(ring.radius)} material={ringMaterial()} />
          <Spinner axis="z" speed={ring.speed} reducedMotion={reducedMotion}>
            {ring.beads.map((bead, i) => (
              <mesh
                key={i}
                geometry={smoothSphereGeo()}
                material={plastic(bead.color)}
                position={[Math.cos(bead.angle) * ring.radius, Math.sin(bead.angle) * ring.radius, 0]}
                scale={bead.size}
              />
            ))}
          </Spinner>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// 'moon' (About): graduation cap with a swaying tassel, cherry felt patches, a moonlet.

const CHERRY = '#c51d3a';
const MUSTARD = '#d9a42c';

interface PatchDef {
  lat: number;
  lon: number;
  sx: number;
  sz: number;
  spin: number;
  nested?: boolean;
}

const MOON_PATCHES: PatchDef[] = [
  { lat: 24, lon: -50, sx: 0.12, sz: 0.12, spin: 0 },
  { lat: -22, lon: -114, sx: 0.14, sz: 0.085, spin: 28 },
  { lat: -14, lon: -8, sx: 0.13, sz: 0.13, spin: 0, nested: true },
  { lat: 28, lon: 110, sx: 0.12, sz: 0.08, spin: -35 },
];

function FeltPatch({ patch }: { patch: PatchDef }) {
  const art: DiscArt = patch.nested ? { fill: CHERRY, rings: [0.74, 0.36], inner: 0.48 } : { fill: CHERRY, rings: [0.72] };
  const mat = printedFelt(`patch:${patch.nested ? 'nested' : 'plain'}`, CHERRY, discTexture(art));
  return (
    <OnSurface lat={patch.lat} lon={patch.lon} spin={patch.spin}>
      <mesh geometry={pillowGeo()} material={mat} scale={[patch.sx, 0.016, patch.sz]} />
    </OnSurface>
  );
}

const CAP = { board: 0.27, boardY: 0.07, boardThickness: 0.014 };

function GradCap({ reducedMotion }: { reducedMotion: boolean }) {
  const sway = useRef<THREE.Group>(null);
  useMotion(reducedMotion, (t) => {
    const g = sway.current;
    if (!g) return;
    g.rotation.z = 0.08 + 0.2 * Math.sin(t * 1.7);
    g.rotation.x = 0.13 * Math.sin(t * 1.15 + 0.8);
  });
  const fabric = felt('#232846');
  const gold = felt('#f2b630');
  const corner = CAP.board / Math.SQRT2; // the board is turned 45 degrees, so a corner points east
  const boardTop = CAP.boardY + CAP.boardThickness / 2;
  return (
    <OnSurface lat={70} lon={-90}>
      <ContactShadow radius={0.135} />
      <mesh geometry={capBodyGeo()} material={fabric} position={[0, 0.0255, 0]} />
      <mesh
        geometry={boxGeo()}
        material={fabric}
        position={[0, CAP.boardY, 0]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[CAP.board, CAP.boardThickness, CAP.board]}
      />
      <mesh geometry={cylinderGeo()} material={gold} position={[0, boardTop + 0.004, 0]} scale={[0.015, 0.008, 0.015]} />
      <mesh
        geometry={cylinderGeo()}
        material={gold}
        position={[corner / 2, boardTop + 0.002, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.0035, corner, 0.0035]}
      />
      <group ref={sway} position={[corner - 0.004, boardTop, 0]} rotation={[0, 0, 0.08]}>
        <mesh geometry={cylinderGeo()} material={gold} position={[0, -0.014, 0]} scale={[0.0032, 0.028, 0.0032]} />
        <mesh geometry={sphereGeo()} material={gold} position={[0, -0.03, 0]} scale={0.0075} />
        <mesh geometry={tasselGeo()} material={gold} position={[0, -0.056, 0]} />
      </group>
    </OnSurface>
  );
}

function MoonSurface({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      <GradCap reducedMotion={reducedMotion} />
      {MOON_PATCHES.map((patch) => (
        <FeltPatch key={`${patch.lat},${patch.lon}`} patch={patch} />
      ))}
    </group>
  );
}

const MOONLET_RADIUS = 0.13;

function Moonlet({ reducedMotion }: { reducedMotion: boolean }) {
  const self = useRef<THREE.Group>(null);
  useMotion(reducedMotion, (_, dt) => {
    if (self.current) self.current.rotation.y += dt * 0.35;
  });
  const skin = printedFelt('moonlet', MUSTARD, canvasTexture('moonlet', 256, 128, paintMoonlet));
  const patch = printedFelt('moonlet-patch', '#9a6d14', discTexture({ fill: '#9a6d14', rings: [0.66] }));
  return (
    <group rotation={[0.45, 0, -0.2]}>
      <Spinner speed={0.2} phase={2.4} reducedMotion={reducedMotion}>
        <group position={[1.38, 0, 0]} rotation={[0.2, 0, 0.3]}>
          <group ref={self}>
            <mesh geometry={smoothSphereGeo()} material={skin} scale={MOONLET_RADIUS} />
            <OnSurface lat={-15} lon={100} radius={MOONLET_RADIUS}>
              <mesh geometry={pillowGeo()} material={patch} scale={[0.048, 0.012, 0.048]} />
            </OnSurface>
          </group>
        </group>
      </Spinner>
    </group>
  );
}

// ---------------------------------------------------------------------------
// 'letter' (Contact): felt discs, a framed "Say hello!" window under a striped
// awning, floating envelopes.

const LETTER_PINK = '#ff6fae';
const LETTER_GREEN = '#5cbf62';
const LETTER_PURPLE = '#8e63d2';
const LETTER_ORANGE = '#ff9233';

const LETTER_DISCS: DiscDef[] = [
  { lat: -24, lon: -128, radius: 0.12, color: LETTER_PINK, top: lighter(LETTER_PINK, 0.4) },
  { lat: 38, lon: -140, radius: 0.1, color: LETTER_GREEN, top: lighter(LETTER_GREEN, 0.4) },
  { lat: -32, lon: -64, radius: 0.11, color: LETTER_PURPLE, top: lighter(LETTER_PURPLE, 0.4) },
  { lat: 46, lon: -42, radius: 0.095, color: LETTER_ORANGE, top: lighter(LETTER_ORANGE, 0.4) },
  { lat: -6, lon: -28, radius: 0.12, color: LETTER_GREEN, top: lighter(LETTER_GREEN, 0.4) },
  { lat: 24, lon: 24, radius: 0.11, color: LETTER_PINK, top: lighter(LETTER_PINK, 0.4) },
  { lat: -30, lon: 72, radius: 0.12, color: LETTER_ORANGE, top: lighter(LETTER_ORANGE, 0.4) },
  { lat: 30, lon: 130, radius: 0.11, color: LETTER_PURPLE, top: lighter(LETTER_PURPLE, 0.4) },
];

/** Window on the front of the planet (lon -90 faces the camera before rotation). */
const WINDOW = { latBottom: 1.5, latTop: 22.5, lonWest: -106.5, lonEast: -73.5, picture: 1.006, bar: 1.014 };
const AWNING = { lat: 27, lonWest: -110.5, lonEast: -69.5, wall: 1.004, depth: 0.1, drop: 0.095 };

function windowPictureGeo(): THREE.SphereGeometry {
  return shared(
    'g:window-picture',
    () =>
      new THREE.SphereGeometry(
        WINDOW.picture,
        24,
        16,
        (WINDOW.lonWest + 180) * DEG,
        (WINDOW.lonEast - WINDOW.lonWest) * DEG,
        (90 - WINDOW.latTop) * DEG,
        (WINDOW.latTop - WINDOW.latBottom) * DEG,
      ),
  );
}

type BarSide = 'top' | 'bottom' | 'west' | 'east';

function frameBarGeo(side: BarSide): THREE.TubeGeometry {
  return shared(`g:window-bar:${side}`, () => {
    const { latBottom: b, latTop: t, lonWest: w, lonEast: e } = WINDOW;
    const ends: Record<BarSide, [LatLon, LatLon]> = {
      top: [[t, w], [t, e]],
      bottom: [[b, w], [b, e]],
      west: [[b, w], [t, w]],
      east: [[b, e], [t, e]],
    };
    const [from, to] = ends[side];
    return new THREE.TubeGeometry(new SphereArc(from, to, WINDOW.bar), 28, 0.015, 8, false);
  });
}

/**
 * Open partial cylinder that follows the planet's curve: attached to the wall
 * along a latitude line, bulging out and curling down to a vertical hem.
 */
function awningGeo(): THREE.BufferGeometry {
  return shared('g:awning', () => {
    const nx = 28;
    const ny = 10;
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    const n = new THREE.Vector3();
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i <= nx; i++) {
      const lon = AWNING.lonWest + (AWNING.lonEast - AWNING.lonWest) * (i / nx);
      const [x, y, z] = latLonToVec3(AWNING.lat, lon);
      n.set(x, y, z);
      const phi = (lon + 180) * DEG;
      east.set(Math.sin(phi), 0, Math.cos(phi));
      north.crossVectors(n, east);
      for (let j = 0; j <= ny; j++) {
        const s = j / ny;
        const a = (s * Math.PI) / 2;
        p.copy(n)
          .multiplyScalar(AWNING.wall + AWNING.depth * Math.sin(a))
          .addScaledVector(north, -AWNING.drop * (1 - Math.cos(a)));
        positions.push(p.x, p.y, p.z);
        uvs.push(i / nx, 1 - s);
      }
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const a = i * (ny + 1) + j;
        const b = (i + 1) * (ny + 1) + j;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  });
}

function HelloWindow() {
  const corners = useMemo(() => {
    const { latBottom: b, latTop: t, lonWest: w, lonEast: e, bar } = WINDOW;
    const at = (lat: number, lon: number): Vec3 => latLonToVec3(lat, lon, bar + 0.002);
    return [at(t, w), at(t, e), at(b, w), at(b, e)];
  }, []);
  const wood = woodMaterial();
  const teal = plastic('#16a596');
  return (
    <group>
      <mesh geometry={windowPictureGeo()} material={pictureMaterial()} />
      <mesh geometry={frameBarGeo('top')} material={wood} />
      <mesh geometry={frameBarGeo('bottom')} material={wood} />
      <mesh geometry={frameBarGeo('west')} material={teal} />
      <mesh geometry={frameBarGeo('east')} material={teal} />
      {corners.map((position, i) => (
        <mesh key={i} geometry={smoothSphereGeo()} material={teal} position={position} scale={0.023} />
      ))}
      <mesh geometry={awningGeo()} material={awningMaterial()} />
    </group>
  );
}

function LetterSurface() {
  return (
    <group>
      <HelloWindow />
      {LETTER_DISCS.map((disc) => (
        <FeltDisc key={`${disc.lat},${disc.lon}`} disc={disc} holes={false} />
      ))}
    </group>
  );
}

interface EnvelopeDef {
  orbit: number;
  tilt: Vec3;
  speed: number;
  phase: number;
  tint: string;
  roll: number;
}

const ENVELOPES: EnvelopeDef[] = [
  { orbit: 1.31, tilt: [0.3, 0, 0.18], speed: 0.09, phase: 0.4, tint: '#fff7e8', roll: 0.2 },
  { orbit: 1.35, tilt: [-0.35, 0, -0.1], speed: -0.07, phase: 2.6, tint: '#ffe4ee', roll: -0.25 },
  { orbit: 1.28, tilt: [0.1, 0, -0.4], speed: 0.06, phase: 4.6, tint: '#e6f3ff', roll: 0.1 },
];

function FloatingEnvelope({ envelope, reducedMotion }: { envelope: EnvelopeDef; reducedMotion: boolean }) {
  const wobble = useRef<THREE.Mesh>(null);
  useMotion(reducedMotion, (t) => {
    const m = wobble.current;
    if (!m) return;
    m.rotation.z = envelope.roll + Math.sin(t * 0.9 + envelope.phase) * 0.18;
    m.rotation.x = Math.sin(t * 0.7 + envelope.phase * 2) * 0.2;
    m.position.y = Math.sin(t * 1.1 + envelope.phase) * 0.02;
  });
  return (
    <group rotation={envelope.tilt}>
      <Spinner speed={envelope.speed} phase={envelope.phase} reducedMotion={reducedMotion}>
        {/* Turned so the flap side faces away from the planet. */}
        <group position={[envelope.orbit, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh
            ref={wobble}
            geometry={envelopeGeo()}
            material={envelopeMaterials(envelope.tint)}
            rotation={[0, 0, envelope.roll]}
          />
        </group>
      </Spinner>
    </group>
  );
}

function FloatingEnvelopes({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      {ENVELOPES.map((envelope, i) => (
        <FloatingEnvelope key={i} envelope={envelope} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Public components.

/** 3D bits stuck on the surface. Render INSIDE the spinning planet group. */
export function SurfaceProps({ kind, reducedMotion }: { kind: PlanetKind; reducedMotion: boolean }): JSX.Element | null {
  switch (kind) {
    case 'knit':
      return <KnitSurface />;
    case 'stickers':
      return <StickerSurface />;
    case 'moon':
      return <MoonSurface reducedMotion={reducedMotion} />;
    case 'letter':
      return <LetterSurface />;
    default:
      return null;
  }
}

/** Things around the planet. Render in the tilted parent, OUTSIDE the spinning group. */
export function Satellites({ kind, reducedMotion }: { kind: PlanetKind; reducedMotion: boolean }): JSX.Element | null {
  switch (kind) {
    case 'knit':
      return <KnitSky reducedMotion={reducedMotion} />;
    case 'stickers':
      return <BeadRings reducedMotion={reducedMotion} />;
    case 'moon':
      return <Moonlet reducedMotion={reducedMotion} />;
    case 'letter':
      return <FloatingEnvelopes reducedMotion={reducedMotion} />;
    default:
      return null;
  }
}
