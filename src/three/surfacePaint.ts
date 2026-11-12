// The painting core behind surfaces.ts: procedural fabric maps for the 3D planets
// (a colour canvas and a bump canvas in the equirectangular layout three.js
// SphereGeometry expects). All shapes are original procedural craft art (layered
// felt, knit, running stitches, stickers, stamps). The CC0 photo textures only add
// fibre detail. Geometry is defined in degrees of arc, so the 1024 and 2048 maps of
// a planet are identical apart from resolution; line widths scale with size/2048.
//
// No DOM, React or asset imports here: the same code runs on the page (canvas
// elements) and in the paint worker (OffscreenCanvas, see surfaceWorker.ts).
import type { PlanetKind } from '../content';
import type { SurfaceImageName } from './spec';

/** A 2D canvas: an HTMLCanvasElement on the page, an OffscreenCanvas in the paint worker. */
export type Cv = HTMLCanvasElement | OffscreenCanvas;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A decoded photo: an <img> on the page, an ImageBitmap in the paint worker. */
export type PaintImage = HTMLImageElement | ImageBitmap;
export type PaintImages = Record<SurfaceImageName, PaintImage>;

/** [lat, lon] in degrees. */
type LL = [number, number];
/** Local tangent offsets in degrees of arc: u = east, v = north. */
type UV = [number, number];
type RFn = (t: number) => number;

const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
/** Degrees of arc covered by one pixel of a 2048 px wide map. */
const PX = 360 / 2048;
/** Running stitch distance inside a felt edge (7 px at 2048). */
const INSET = 7 * PX;
/** Canvas text font (weight 700); the paint worker loads the same face before painting. */
export const FONT = "'Fredoka', 'Atkinson Hyperlegible Next', sans-serif";
const BASE = 128;
export const PAPER = '#fffdf7';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const cosc = (lat: number): number => Math.max(Math.cos(lat * DEG), 0.1);

// ---------------------------------------------------------------------------
// Seeded random numbers (mulberry32), so every load paints the same planet.

class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  f(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.f();
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.f() * list.length))];
  }

  /** Latitude with uniform density over the sphere's area. */
  lat(min: number, max: number): number {
    return Math.asin(this.range(Math.sin(min * DEG), Math.sin(max * DEG))) / DEG;
  }

  shuffle<T>(list: readonly T[]): T[] {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.f() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Colour helpers.

type RGB = [number, number, number];

/** A canvas element on the page, an OffscreenCanvas in a worker (no document there). */
export function makeCanvas(w: number, h: number): [Cv, Ctx] {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  if (typeof document === 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    return [canvas, ctx];
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return [canvas, ctx];
}

let colorCtx: Ctx | null = null;
const colorCache = new Map<string, RGB>();

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toRgb(color: string): RGB {
  const hit = colorCache.get(color);
  if (hit) return hit;
  let out = hexToRgb(color);
  if (!out) {
    // Any other CSS colour: let a 1x1 canvas normalise it.
    if (!colorCtx) colorCtx = makeCanvas(1, 1)[1];
    colorCtx.fillStyle = '#808080';
    colorCtx.fillStyle = color;
    const v = String(colorCtx.fillStyle);
    out = hexToRgb(v);
    if (!out) {
      const nums = v.match(/[\d.]+/g);
      out = nums && nums.length >= 3 ? [Number(nums[0]), Number(nums[1]), Number(nums[2])] : [128, 128, 128];
    }
  }
  colorCache.set(color, out);
  return out;
}

function rgba(c: RGB, a = 1): string {
  const ch = (v: number) => Math.round(clamp(v, 0, 255));
  return `rgba(${ch(c[0])},${ch(c[1])},${ch(c[2])},${a})`;
}

/** amt > 0 mixes toward white, amt < 0 toward black. */
export function shade(color: string, amt: number, alpha = 1): string {
  const c = toRgb(color);
  const t = amt < 0 ? 0 : 255;
  const f = Math.min(Math.abs(amt), 1);
  return rgba([c[0] + (t - c[0]) * f, c[1] + (t - c[1]) * f, c[2] + (t - c[2]) * f], alpha);
}

function grey(v: number, a = 1): string {
  const g = Math.round(clamp(v, 0, 255));
  return `rgba(${g},${g},${g},${a})`;
}

// ---------------------------------------------------------------------------
// Geometry. Shapes are built in local degrees (u east, v north) around a centre
// and projected point by point, so they look round on the sphere at any latitude.

function local(lat0: number, lon0: number, u: number, v: number): LL {
  const lat = lat0 + v;
  return [lat, lon0 + u / cosc(lat)];
}

function at(lat0: number, lon0: number, u: number, v: number, rot = 0): LL {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return local(lat0, lon0, u * c - v * s, u * s + v * c);
}

function densify(uv: UV[], step: number, closed: boolean): UV[] {
  const out: UV[] = [];
  const n = uv.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < n; i += 1) {
    const a = uv[i];
    out.push(a);
    if (i >= segs) continue;
    const q = uv[(i + 1) % n];
    const m = Math.floor(Math.hypot(q[0] - a[0], q[1] - a[1]) / step);
    for (let j = 1; j <= m; j += 1) {
      const t = j / (m + 1);
      out.push([a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Rotate (CCW, radians) and project a local shape around (lat0, lon0). */
function place(lat0: number, lon0: number, uv: UV[], rot = 0, closed = true): LL[] {
  return densify(uv, 1.2, closed).map(([u, v]) => at(lat0, lon0, u, v, rot));
}

function shiftUV(uv: UV[], du: number, dv: number): UV[] {
  return uv.map(([u, v]) => [u + du, v + dv]);
}

/** Great-circle distance in degrees. */
function arcDist(a: LL, b: LL): number {
  const la1 = a[0] * DEG;
  const la2 = b[0] * DEG;
  const c = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos((b[1] - a[1]) * DEG);
  return Math.acos(clamp(c, -1, 1)) / DEG;
}

function ellipseUV(rx: number, ry: number, n = 72): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TAU;
    out.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  return out;
}

function circleUV(r: number, n = 72): UV[] {
  return ellipseUV(r, r, n);
}

interface BlobOpts {
  amp?: number;
  harm?: number;
  ax?: number;
  ay?: number;
  rot?: number;
}

/** Organic radius function: a rotated ellipse with a few sine harmonics. */
function blobR(rng: Rng, R: number, o: BlobOpts = {}): RFn {
  const amp = o.amp ?? 0.12;
  const harm = o.harm ?? 4;
  const ax = o.ax ?? 1;
  const ay = o.ay ?? 1;
  const rot = o.rot ?? 0;
  const terms: [number, number, number][] = [];
  for (let i = 0; i < harm; i += 1) {
    const extra = Math.floor(rng.f() * 2) * (i > 0 ? 1 : 0);
    terms.push([2 + i + extra, (amp * rng.range(0.55, 1)) / Math.pow(1 + i, 0.55), rng.range(0, TAU)]);
  }
  return (t) => {
    const a = t - rot;
    const base = R / Math.sqrt((Math.cos(a) / ax) ** 2 + (Math.sin(a) / ay) ** 2);
    let m = 1;
    for (const [f, am, ph] of terms) m += am * Math.sin(f * t + ph);
    return base * Math.max(m, 0.4);
  };
}

/** Grow a blob so each point lies at least `margin` degrees inside its edge. */
function coverPoints(rf: RFn, lat0: number, lon0: number, pts: LL[], margin: number): RFn {
  const bumps: [number, number][] = [];
  for (const [lat, lon] of pts) {
    const v = lat - lat0;
    const u = (lon - lon0) * cosc(lat);
    const th = Math.atan2(v, u);
    const need = Math.hypot(u, v) + margin - rf(th);
    if (need > 0) bumps.push([th, need * 1.3]);
  }
  if (!bumps.length) return rf;
  return (t) => {
    let r = rf(t);
    for (const [th, a] of bumps) {
      const d = Math.atan2(Math.sin(t - th), Math.cos(t - th));
      r += a * Math.exp(-(d * d) / (2 * 0.3 * 0.3));
    }
    return r;
  };
}

function blobUV(rf: RFn, n = 128, inset = 0, du = 0, dv = 0): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TAU;
    const rr = Math.max(rf(t) - inset, 0.15);
    out.push([du + Math.cos(t) * rr, dv + Math.sin(t) * rr]);
  }
  return out;
}

function roundRectUV(w: number, h: number, rad: number, nc = 6): UV[] {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.max(0.01, Math.min(rad, hw, hh));
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, Math.PI * 1.5],
  ];
  const out: UV[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= nc; i += 1) {
      const a = a0 + (i / nc) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return out;
}

function starUV(ro: number, ri: number, n: number, a0 = Math.PI / 2): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = a0 + (i * Math.PI) / n;
    const rr = i % 2 ? ri : ro;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function polygonUV(r: number, n: number, a0 = Math.PI / 2): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = a0 + (i / n) * TAU;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function spiralUV(r0: number, r1: number, turns: number, n: number, dir = 1): UV[] {
  const out: UV[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const a = dir * t * turns * TAU;
    const r = r0 + (r1 - r0) * t;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Closed outline of a strip of varying width following an open centre line. */
function ribbonUV(line: UV[], w0: number, w1: number): UV[] {
  const left: UV[] = [];
  const right: UV[] = [];
  const n = line.length;
  for (let i = 0; i < n; i += 1) {
    const a = line[Math.max(0, i - 1)];
    const q = line[Math.min(n - 1, i + 1)];
    const len = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1;
    const nx = -(q[1] - a[1]) / len;
    const ny = (q[0] - a[0]) / len;
    const hw = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([line[i][0] + nx * hw, line[i][1] + ny * hw]);
    right.push([line[i][0] - nx * hw, line[i][1] - ny * hw]);
  }
  return left.concat(right.reverse());
}

function waveUV(len: number, amp: number, periods: number, n = 30): UV[] {
  const out: UV[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push([-len / 2 + len * t, amp * Math.sin(t * periods * TAU)]);
  }
  return out;
}

/** Postage stamp outline: a rectangle with semicircular perforation bites. */
function perforatedUV(w: number, h: number, rh: number, step: number): UV[] {
  const hw = w / 2;
  const hh = h / 2;
  const corners: UV[] = [
    [-hw, hh],
    [hw, hh],
    [hw, -hh],
    [-hw, -hh],
  ];
  const out: UV[] = [];
  for (let e = 0; e < 4; e += 1) {
    const a = corners[e];
    const q = corners[(e + 1) % 4];
    const len = Math.hypot(q[0] - a[0], q[1] - a[1]);
    const holes = Math.max(2, Math.round(len / step));
    const st = len / holes;
    const dx = (q[0] - a[0]) / len;
    const dy = (q[1] - a[1]) / len;
    const samples = holes * 12;
    for (let i = 0; i < samples; i += 1) {
      const s = (i / samples) * len;
      const ph = (s % st) - st / 2;
      const d = Math.abs(ph) < rh ? Math.sqrt(rh * rh - ph * ph) : 0;
      out.push([a[0] + dx * s + dy * d, a[1] + dy * s - dx * d]);
    }
  }
  return out;
}

/** Speech bubble: an ellipse with a pointed tail at angle `ta`. */
function bubbleUV(rx: number, ry: number, ta: number, tail: number, n = 96): UV[] {
  const half = 0.28;
  const out: UV[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = ta + half + ((TAU - 2 * half) * i) / n;
    out.push([Math.cos(t) * rx, Math.sin(t) * ry]);
  }
  const tt = ta + 0.12;
  out.push([Math.cos(tt) * rx * (1 + tail), Math.sin(tt) * ry * (1 + tail)]);
  return out;
}

function tapeUV(L: number, w: number, rng: Rng): UV[] {
  const teeth = 7;
  const out: UV[] = [];
  for (let i = 0; i <= teeth; i += 1) out.push([-L / 2 + (i % 2) * rng.range(0.25, 0.55), -w / 2 + (w * i) / teeth]);
  for (let i = 0; i <= teeth; i += 1) out.push([L / 2 - (i % 2) * rng.range(0.25, 0.55), w / 2 - (w * i) / teeth]);
  return out;
}

// ---------------------------------------------------------------------------
// Texture tiles. Photos become seamless grey detail tiles (mean 128) used with
// soft-light / overlay for colour and at low alpha for bump relief.

const normCache = new WeakMap<PaintImage, Cv>();

export function normalizedTile(img: PaintImage): Cv {
  const hit = normCache.get(img);
  if (hit) return hit;
  const natural = 'naturalWidth' in img;
  const w = (natural ? img.naturalWidth : img.width) || 512;
  const h = (natural ? img.naturalHeight : img.height) || 512;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    const n = w * h;
    const lum = new Float32Array(n);
    let sum = 0;
    let sum2 = 0;
    for (let i = 0, j = 0; i < n; i += 1, j += 4) {
      const l = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      lum[i] = l;
      sum += l;
      sum2 += l * l;
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(sum2 / n - mean * mean, 0));
    const gain = std > 1 ? 44 / std : 1;
    for (let i = 0, j = 0; i < n; i += 1, j += 4) {
      const v = clamp(128 + (lum[i] - mean) * gain, 0, 255);
      d[j] = v;
      d[j + 1] = v;
      d[j + 2] = v;
      d[j + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    // Unreadable pixels (should not happen for same-origin assets): keep the photo as is.
  }
  normCache.set(img, canvas);
  return canvas;
}

const scaledCache = new WeakMap<Cv, Map<number, Cv>>();

function scaledTile(src: Cv, px: number): Cv {
  if (px === src.width) return src;
  let byPx = scaledCache.get(src);
  if (!byPx) {
    byPx = new Map();
    scaledCache.set(src, byPx);
  }
  const hit = byPx.get(px);
  if (hit) return hit;
  const [canvas, ctx] = makeCanvas(px, px);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, px, px);
  byPx.set(px, canvas);
  return canvas;
}

const knitCache = new Map<number, Cv>();
const KNIT_ROWS = 10;

/**
 * Procedural stocking-stitch knit (rows of V loops), greyscale. 16 x 10 cells;
 * a cell is size/128 wide, so the tile repeats exactly 8 times around the map.
 */
function knitTile(size: number): Cv {
  const hit = knitCache.get(size);
  if (hit) return hit;
  const cols = 16;
  const rows = KNIT_ROWS;
  const cw = size / 128;
  const ch = cw * 0.8;
  const tw = Math.max(cols, Math.round(cw * cols));
  const th = Math.max(rows, Math.round(ch * rows));
  const [canvas, ctx] = makeCanvas(tw, th);
  ctx.fillStyle = grey(62);
  ctx.fillRect(0, 0, tw, th);
  ctx.scale(tw / (cw * cols), th / (ch * rows));
  const rng = new Rng(0x6b6e6974);
  const jit: number[] = [];
  for (let i = 0; i < cols * rows; i += 1) jit.push(rng.range(-1, 1));
  const lean = Math.atan2(cw * 0.36, ch);
  for (let j = -1; j <= rows; j += 1) {
    for (let i = -1; i <= cols; i += 1) {
      const jj = ((j % rows) + rows) % rows;
      const ii = ((i % cols) + cols) % cols;
      const g = 170 + 20 * jit[jj * cols + ii];
      const cx = (i + 0.5) * cw;
      const cy = (j + 0.5) * ch;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + side * cw * 0.23, cy);
        ctx.rotate(side * lean);
        ctx.scale(cw * 0.26, ch * 0.68);
        const grad = ctx.createRadialGradient(0, -0.15, 0, 0, 0, 1);
        grad.addColorStop(0, grey(g + 38));
        grad.addColorStop(0.6, grey(g));
        grad.addColorStop(1, grey(g - 85));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  knitCache.set(size, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Painter: draws every shape into the colour map and the bump map together.
// A path is stored relative to its centre x and squeezed by k = 1/cos(lat), and
// drawn under translate(cx) * scale(k, 1): geometry stays exact while stroke
// widths, dashes and fabric patterns look even on the sphere. Shapes that cross
// the left/right edge are drawn again shifted by the map width.

interface Box {
  cx: number;
  k: number;
  x0: number;
  x1: number;
  noWrap?: boolean;
}

interface Poly extends Box {
  path: Path2D;
}

interface PolyOpts {
  latRef?: number;
  /** Round k so the felt tile still repeats seamlessly around a full-width band. */
  periodic?: boolean;
  noWrap?: boolean;
}

interface FeltOpts extends PolyOpts {
  color: string;
  /** Bump grey of the top surface (128 = base fabric). */
  height: number;
  /** Detail tile; default felt, null for none. */
  tex?: Cv | null;
  texAlpha?: number;
  /** Ambient occlusion strength 0..1. */
  shadow?: number;
  /** Ambient occlusion blur in 2048 px. */
  blur?: number;
  /** Cut-edge darkening alpha. */
  edge?: number;
  bevel?: boolean;
  crease?: boolean;
  bumpTex?: number;
  alpha?: number;
}

interface StitchOpts {
  color: string;
  w?: number;
  dash?: number;
  gap?: number;
}

interface LineOpts {
  color: string;
  w: number;
  alpha?: number;
  op?: GlobalCompositeOperation;
  bump?: number;
  bumpW?: number;
}

interface FillOpts {
  alpha?: number;
  op?: GlobalCompositeOperation;
  bump?: number;
}

class Painter {
  readonly size: number;
  readonly W: number;
  readonly H: number;
  readonly S: number;
  readonly ppd: number;
  readonly map: Cv;
  readonly bump: Cv;
  readonly c: Ctx;
  readonly b: Ctx;
  readonly rng: Rng;
  readonly images: PaintImages;
  readonly feltTex: Cv;
  private readonly patC = new Map<Cv, CanvasPattern | null>();
  private readonly patB = new Map<Cv, CanvasPattern | null>();

  constructor(size: number, images: PaintImages, seed: number) {
    this.size = size;
    this.W = size;
    this.H = Math.round(size / 2);
    this.S = size / 2048;
    this.ppd = size / 360;
    this.images = images;
    this.rng = new Rng(seed);
    const [map, c] = makeCanvas(this.W, this.H);
    const [bump, b] = makeCanvas(this.W, this.H);
    this.map = map;
    this.c = c;
    this.bump = bump;
    this.b = b;
    for (const ctx of [c, b]) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.imageSmoothingQuality = 'high';
    }
    this.feltTex = this.photo('felt');
  }

  X(lon: number): number {
    return ((lon + 180) / 360) * this.W;
  }

  Y(lat: number): number {
    return ((90 - lat) / 180) * this.H;
  }

  /** Photo detail tile; f = texture scale (1 = 512 px per tile at 2048). */
  photo(name: SurfaceImageName, f = 1): Cv {
    return scaledTile(normalizedTile(this.images[name]), Math.max(8, Math.round(512 * this.S * f)));
  }

  pattern(ctx: Ctx, tile: Cv): CanvasPattern | string {
    const store = ctx === this.c ? this.patC : this.patB;
    let pat = store.get(tile);
    if (pat === undefined) {
      pat = ctx.createPattern(tile, 'repeat');
      store.set(tile, pat);
    }
    return pat ?? grey(BASE);
  }

  offsets(x0: number, x1: number): number[] {
    const out = [0];
    if (x0 < 0) out.push(this.W);
    if (x1 > this.W) out.push(-this.W);
    return out;
  }

  on(ctx: Ctx, box: Box, fn: () => void, ox = 0, oy = 0): void {
    const m = 30 * this.S * box.k;
    const offs = box.noWrap ? [0] : this.offsets(box.x0 - m, box.x1 + m);
    for (const dx of offs) {
      ctx.save();
      ctx.translate(box.cx + dx + ox, oy);
      ctx.scale(box.k, 1);
      fn();
      ctx.restore();
    }
  }

  /** Small affine items (text) drawn around one point with the local stretch. */
  affine(lat: number, lon: number, rot: number, half: number, fn: () => void, ctx: Ctx = this.c): void {
    const x = this.X(lon);
    const y = this.Y(lat);
    const k = 1 / cosc(lat);
    for (const dx of this.offsets(x - half * k - 4, x + half * k + 4)) {
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(k, 1);
      ctx.rotate(-rot);
      fn();
      ctx.restore();
    }
  }

  poly(pts: LL[], closed = true, o: PolyOpts = {}): Poly {
    const n = pts.length;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let x0 = Infinity;
    let x1 = -Infinity;
    let la0 = Infinity;
    let la1 = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const [lat, lon] = pts[i];
      xs[i] = this.X(lon);
      ys[i] = this.Y(lat);
      x0 = Math.min(x0, xs[i]);
      x1 = Math.max(x1, xs[i]);
      la0 = Math.min(la0, lat);
      la1 = Math.max(la1, lat);
    }
    const cx = n ? (x0 + x1) / 2 : 0;
    let k = 1 / cosc(o.latRef ?? (n ? (la0 + la1) / 2 : 0));
    if (o.periodic) k = 4 / Math.max(1, Math.round(4 / k));
    const path = new Path2D();
    for (let i = 0; i < n; i += 1) {
      const px = (xs[i] - cx) / k;
      if (i) path.lineTo(px, ys[i]);
      else path.moveTo(px, ys[i]);
    }
    if (closed) path.closePath();
    return { path, cx, k, x0, x1, noWrap: o.noWrap };
  }

  /** Base fabric over the whole map: colour, optional extra paint, tinted tiles, bump relief. */
  fabric(
    color: string,
    layers: [Cv, GlobalCompositeOperation, number][],
    bumpLayers: [Cv, number][],
    under?: () => void,
  ): void {
    const { c, b, W, H } = this;
    c.fillStyle = color;
    c.fillRect(0, 0, W, H);
    if (under) under();
    for (const [tile, op, a] of layers) {
      c.save();
      c.globalCompositeOperation = op;
      c.globalAlpha = a;
      c.fillStyle = this.pattern(c, tile);
      c.fillRect(0, 0, W, H);
      c.restore();
    }
    b.fillStyle = grey(BASE);
    b.fillRect(0, 0, W, H);
    for (const [tile, a] of bumpLayers) {
      b.save();
      b.globalAlpha = a;
      b.fillStyle = this.pattern(b, tile);
      b.fillRect(0, 0, W, H);
      b.restore();
    }
  }

  /** A raised piece of felt (or paper / tape with options). */
  felt(pts: LL[], o: FeltOpts): Poly {
    const pl = this.poly(pts, true, o);
    const { c, b, S } = this;
    const tex = o.tex === undefined ? this.feltTex : o.tex;
    const sh = o.shadow ?? 1;
    this.on(c, pl, () => {
      c.save();
      if (o.alpha !== undefined) c.globalAlpha = o.alpha;
      if (sh > 0) {
        c.shadowColor = 'rgba(18,10,4,' + 0.42 * sh + ')';
        c.shadowBlur = (o.blur ?? 7) * S;
        c.shadowOffsetY = 1.4 * S;
      }
      c.fillStyle = o.color;
      c.fill(pl.path);
      c.restore();
      if (tex) {
        c.save();
        c.globalCompositeOperation = 'soft-light';
        c.globalAlpha = (o.texAlpha ?? 0.8) * (o.alpha ?? 1);
        c.fillStyle = this.pattern(c, tex);
        c.fill(pl.path);
        c.restore();
      }
      const ed = o.edge ?? 0.35;
      if (ed > 0) {
        c.strokeStyle = shade(o.color, -0.4, ed);
        c.lineWidth = 1.5 * S;
        c.stroke(pl.path);
      }
    });
    const h = o.height;
    const under = h - 34;
    this.on(b, pl, () => {
      if (o.crease !== false) {
        b.strokeStyle = grey(under - 26, 0.8);
        b.lineWidth = 6 * S;
        b.stroke(pl.path);
      }
      b.save();
      if (o.alpha !== undefined) b.globalAlpha = o.alpha;
      b.fillStyle = grey(h);
      b.fill(pl.path);
      b.restore();
      const bt = o.bumpTex ?? 0.16;
      if (tex && bt > 0) {
        b.save();
        b.globalAlpha = bt;
        b.fillStyle = this.pattern(b, tex);
        b.fill(pl.path);
        b.restore();
      }
      if (o.bevel !== false) {
        b.strokeStyle = grey((h + under) / 2, 0.85);
        b.lineWidth = 2.6 * S;
        b.stroke(pl.path);
      }
    });
    return pl;
  }

  fillShape(pts: LL[], color: string, o: FillOpts = {}): void {
    const pl = this.poly(pts, true);
    const { c, b } = this;
    this.on(c, pl, () => {
      if (o.alpha !== undefined) c.globalAlpha = o.alpha;
      if (o.op) c.globalCompositeOperation = o.op;
      c.fillStyle = color;
      c.fill(pl.path);
    });
    const bh = o.bump;
    if (bh !== undefined) {
      this.on(b, pl, () => {
        b.fillStyle = grey(bh);
        b.fill(pl.path);
      });
    }
  }

  strokeLine(pts: LL[], closed: boolean, o: LineOpts): void {
    const pl = this.poly(pts, closed);
    const { c, b, S } = this;
    this.on(c, pl, () => {
      if (o.alpha !== undefined) c.globalAlpha = o.alpha;
      if (o.op) c.globalCompositeOperation = o.op;
      c.strokeStyle = o.color;
      c.lineWidth = o.w * S;
      c.stroke(pl.path);
    });
    const bh = o.bump;
    if (bh !== undefined) {
      this.on(b, pl, () => {
        b.strokeStyle = grey(bh);
        b.lineWidth = (o.bumpW ?? o.w) * S;
        b.stroke(pl.path);
      });
    }
  }

  /** Thread segments (flat canvas x0,y0,x1,y1 list) near one latitude. */
  threads(flat: number[], lat: number, color: string, w: number): void {
    if (!flat.length) return;
    const { c, b, S } = this;
    const k = 1 / cosc(lat);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      x0 = Math.min(x0, flat[i]);
      x1 = Math.max(x1, flat[i]);
    }
    const cx = x0;
    const path = new Path2D();
    for (let i = 0; i < flat.length; i += 4) {
      path.moveTo((flat[i] - cx) / k, flat[i + 1]);
      path.lineTo((flat[i + 2] - cx) / k, flat[i + 3]);
    }
    const box: Box = { cx, k, x0, x1 };
    const lw = w * S;
    this.on(
      c,
      box,
      () => {
        c.strokeStyle = 'rgba(12,8,4,0.42)';
        c.lineWidth = lw * 1.3;
        c.stroke(path);
      },
      0.6 * S,
      1.1 * S,
    );
    this.on(c, box, () => {
      c.strokeStyle = color;
      c.lineWidth = lw;
      c.stroke(path);
    });
    this.on(c, box, () => {
      c.strokeStyle = 'rgba(255,255,255,0.28)';
      c.lineWidth = lw * 0.35;
      c.stroke(path);
    });
    this.on(b, box, () => {
      b.strokeStyle = grey(58);
      b.lineWidth = lw * 1.6;
      b.stroke(path);
    });
    this.on(b, box, () => {
      b.strokeStyle = grey(150);
      b.lineWidth = lw * 0.6;
      b.stroke(path);
    });
  }

  /** Running stitch along a lat/lon outline, dashes measured on the sphere. */
  stitch(pts: LL[], closed: boolean, o: StitchOpts): void {
    const n = pts.length;
    if (n < 2) return;
    const dash = o.dash ?? 8;
    const gap = o.gap ?? 6;
    const w = o.w ?? 2.6;
    const segs = closed ? n : n - 1;
    const cum = new Float64Array(segs + 1);
    for (let i = 0; i < segs; i += 1) {
      const a = pts[i];
      const q = pts[(i + 1) % n];
      const du = (q[1] - a[1]) * cosc((a[0] + q[0]) / 2);
      cum[i + 1] = cum[i] + Math.hypot(du, q[0] - a[0]);
    }
    const L = cum[segs];
    if (!(L > 0)) return;
    const count = Math.max(1, Math.round(L / ((dash + gap) * PX)));
    const per = L / count;
    const dl = (per * dash) / (dash + gap);
    let seg = 0;
    const pointAt = (s: number): LL => {
      while (seg < segs - 1 && cum[seg + 1] < s) seg += 1;
      const a = pts[seg];
      const q = pts[(seg + 1) % n];
      const len = cum[seg + 1] - cum[seg];
      const t = len > 0 ? clamp((s - cum[seg]) / len, 0, 1) : 0;
      return [a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t];
    };
    let flat: number[] = [];
    let lat0 = 0;
    for (let i = 0; i < count; i += 1) {
      const s0 = i * per + (per - dl) / 2;
      const p0 = pointAt(s0);
      const p1 = pointAt(s0 + dl);
      const lat = (p0[0] + p1[0]) / 2;
      if (flat.length && (Math.abs(lat - lat0) > 3 || flat.length >= 240)) {
        this.threads(flat, lat0, o.color, w);
        flat = [];
      }
      if (!flat.length) lat0 = lat;
      flat.push(this.X(p0[1]), this.Y(p0[0]), this.X(p1[1]), this.Y(p1[0]));
    }
    this.threads(flat, lat0, o.color, w);
  }

  /** Small cross stitch: 'x', 'plus' or both. */
  cross(lat: number, lon: number, s: number, color: string, kind: 'x' | 'plus' | 'both', rot = 0, w = 2.2): void {
    const arms: [UV, UV][] = [];
    if (kind !== 'plus') {
      arms.push([[-s, -s], [s, s]], [[-s, s], [s, -s]]);
    }
    if (kind !== 'x') {
      const t = s * 1.3;
      arms.push([[0, -t], [0, t]], [[-t, 0], [t, 0]]);
    }
    const flat: number[] = [];
    for (const [a, q] of arms) {
      const pa = at(lat, lon, a[0], a[1], rot);
      const pq = at(lat, lon, q[0], q[1], rot);
      flat.push(this.X(pa[1]), this.Y(pa[0]), this.X(pq[1]), this.Y(pq[0]));
    }
    this.threads(flat, lat, color, w);
  }

  /** Round dot (French knot, felt bead), radius in degrees. */
  dot(lat: number, lon: number, r: number, color: string, height?: number, shadow = 0): void {
    const { c, b, S } = this;
    const x = this.X(lon);
    const y = this.Y(lat);
    const k = 1 / cosc(lat);
    const ry = Math.max(r * this.ppd, 0.3);
    const rx = ry * k;
    for (const dx of this.offsets(x - rx - 4, x + rx + 4)) {
      if (shadow > 0) {
        c.fillStyle = 'rgba(10,6,2,' + shadow + ')';
        c.beginPath();
        c.ellipse(x + dx + 0.6 * S, y + 1.1 * S, rx * 1.06, ry * 1.06, 0, 0, TAU);
        c.fill();
      }
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(x + dx, y, rx, ry, 0, 0, TAU);
      c.fill();
      if (height !== undefined) {
        b.fillStyle = grey(height);
        b.beginPath();
        b.ellipse(x + dx, y, rx, ry, 0, 0, TAU);
        b.fill();
      }
    }
  }

  /** Bold rounded text, size in degrees. */
  text(
    lat: number,
    lon: number,
    str: string,
    size: number,
    rot: number,
    fill: string,
    outline?: { color: string; w: number },
    op?: GlobalCompositeOperation,
  ): void {
    const fs = Math.max(4, size * this.ppd);
    const c = this.c;
    this.affine(lat, lon, rot, fs * str.length * 0.36, () => {
      if (op) c.globalCompositeOperation = op;
      c.font = '700 ' + fs + 'px ' + FONT;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (outline) {
        c.strokeStyle = outline.color;
        c.lineWidth = outline.w * fs;
        c.strokeText(str, 0, fs * 0.04);
      }
      c.fillStyle = fill;
      c.fillText(str, 0, fs * 0.04);
    });
  }
}

// ---------------------------------------------------------------------------
// Shared planet pieces.

/** Slight yarn colour variation between knit rows. */
function yarnRows(p: Painter, knit: Cv, dark: string, light: string): void {
  const rowPx = knit.height / KNIT_ROWS;
  const rows = Math.round(p.H / rowPx);
  for (let i = 0; i < rows; i += 1) {
    const v = p.rng.f();
    if (v < 0.22 || v > 0.86) {
      p.c.fillStyle = v < 0.22 ? dark : light;
      p.c.fillRect(0, i * rowPx, p.W, rowPx);
    }
  }
}

/** Two layers of felt over a pole: a scalloped cap and a wavy smaller one, both stitched. */
function polarCap(
  p: Painter,
  north: boolean,
  edgeLat: number,
  scallops: number,
  depth: number,
  c1: string,
  c2: string,
  thread: string,
): void {
  const sg = north ? 1 : -1;
  const scallop = (from: number, to: number, inset: number): LL[] => {
    const steps = scallops * 12;
    const out: LL[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const lon = from + ((to - from) * i) / steps;
      const lobe = Math.abs(Math.sin((Math.PI * scallops * (lon + 180)) / 360));
      out.push([edgeLat - sg * depth * lobe + sg * inset, lon]);
    }
    return out;
  };
  const cap1 = scallop(-182, 182, 0);
  cap1.push([sg * 93, 182], [sg * 93, -182]);
  p.felt(cap1, { color: c1, height: 170, latRef: edgeLat - (sg * depth) / 2, periodic: true, noWrap: true });
  p.stitch(scallop(-180, 180, INSET * 1.2), false, { color: thread });

  const e2 = edgeLat + sg * 6.5;
  const ph = p.rng.range(0, TAU);
  const wavy = (from: number, to: number, inset: number): LL[] => {
    const out: LL[] = [];
    for (let i = 0; i <= 240; i += 1) {
      const lon = from + ((to - from) * i) / 240;
      const wob = 1.1 * Math.sin(lon * 3 * DEG + ph) + 0.6 * Math.sin(lon * 7 * DEG + 2 * ph);
      out.push([e2 + sg * inset + wob, lon]);
    }
    return out;
  };
  const cap2 = wavy(-182, 182, 0);
  cap2.push([sg * 93, 182], [sg * 93, -182]);
  p.felt(cap2, { color: c2, height: 196, latRef: e2, periodic: true, noWrap: true });
  p.stitch(wavy(-180, 180, INSET * 1.2), false, { color: thread });

  // Tiny cross stitches between the two layers.
  for (let i = 0; i < 12; i += 1) {
    const lon = -180 + (i + p.rng.range(0.2, 0.8)) * 30;
    p.cross(edgeLat + sg * p.rng.range(2.8, 3.4), lon, 0.55, thread, 'x', p.rng.range(-0.3, 0.3), 1.8);
  }
}

// ---------------------------------------------------------------------------
// 1. 'knit' (Experience): felt continents on a blue knitted ocean.

const BISHKEK: LL = [42.87, 74.59];
const TORONTO: LL = [43.65, -79.38];
const VANCOUVER: LL = [49.28, -123.12];
const CREAM = '#f7eed6';
const ORANGE = '#ff8a1f';
const GREENS = ['#6f9a3c', '#8aa84b', '#7da544', '#a3bb5c'];
const TREE_GREENS = ['#2f6b2c', '#3d7a34', '#2b5e2e', '#4a8a3a'];
const FLOWER_COLORS = ['#ffffff', '#ff8fb8', '#ffd23a', '#ff6b4a', '#c9a6ff'];

interface ContDef {
  lat: number;
  lon: number;
  R: number;
  ax: number;
  ay: number;
  rot: number;
  colors: string[];
  covers: LL[];
  /** Where trees and flowers go, as a fraction of the outline radius. */
  zone: [number, number];
}

const CONTINENTS: ContDef[] = [
  { lat: 46, lon: -101, R: 22, ax: 1.35, ay: 0.85, rot: -0.12, colors: ['#6f9a3c', '#8aa84b', '#a3bb5c'], covers: [VANCOUVER, TORONTO], zone: [0.15, 0.8] },
  { lat: 48, lon: 80, R: 21, ax: 1.5, ay: 0.8, rot: 0.08, colors: ['#7b8a35', '#8aa84b', '#a3bb5c'], covers: [BISHKEK], zone: [0.15, 0.8] },
  { lat: 3, lon: 19, R: 17, ax: 0.85, ay: 1.3, rot: 0.12, colors: ['#6f9a3c', '#c9a25f', '#dcbc7e'], covers: [], zone: [0.74, 0.86] },
  { lat: -19, lon: -61, R: 14, ax: 0.75, ay: 1.3, rot: -0.3, colors: ['#8aa84b', '#a3bb5c', '#bdd07a'], covers: [], zone: [0.1, 0.8] },
  { lat: -25, lon: 133, R: 11, ax: 1.35, ay: 0.85, rot: 0.05, colors: ['#7da544', '#a3bb5c'], covers: [], zone: [0.1, 0.8] },
];

function tree(p: Painter, ll: LL, s: number, rot: number, col: string): void {
  const [lat, lon] = ll;
  p.felt(place(lat, lon, shiftUV(roundRectUV(0.26 * s, 0.42 * s, 0.06 * s, 3), 0, -0.38 * s), rot), {
    color: '#7a4b25',
    height: 222,
    blur: 3,
    edge: 0.3,
    crease: false,
    texAlpha: 0.5,
  });
  p.felt(place(lat, lon, [[-0.5 * s, -0.22 * s], [0.5 * s, -0.22 * s], [0, 0.42 * s]], rot), {
    color: col,
    height: 230,
    blur: 4,
    crease: false,
  });
  p.felt(place(lat, lon, [[-0.38 * s, 0.08 * s], [0.38 * s, 0.08 * s], [0, 0.62 * s]], rot), {
    color: shade(col, 0.12),
    height: 238,
    blur: 3,
    crease: false,
  });
}

function flower(p: Painter, ll: LL, s: number, col: string): void {
  const [lat, lon] = ll;
  const rot = p.rng.range(0, TAU);
  for (let i = 0; i < 5; i += 1) {
    const a = rot + (i / 5) * TAU;
    const q = local(lat, lon, Math.cos(a) * 0.5 * s, Math.sin(a) * 0.5 * s);
    p.dot(q[0], q[1], 0.36 * s, col, 200, 0.25);
  }
  p.dot(lat, lon, 0.3 * s, '#ffc928', 210);
}

function paintKnit(p: Painter): void {
  const r = p.rng;
  const knit = knitTile(p.size);
  const fuzz = p.photo('felt');
  const knitPhoto = p.photo('knit');
  p.fabric(
    '#2f63a8',
    [
      [knit, 'overlay', 0.55],
      [knit, 'soft-light', 0.4],
      [fuzz, 'soft-light', 0.3],
      [knitPhoto, 'soft-light', 0.25],
    ],
    [
      [knit, 0.55],
      [fuzz, 0.06],
    ],
    () => yarnRows(p, knit, 'rgba(6,20,64,0.09)', 'rgba(255,255,255,0.05)'),
  );

  const pins: LL[] = [BISHKEK, TORONTO, VANCOUVER];
  const conts = CONTINENTS.map((d) => {
    const rf = coverPoints(blobR(r, d.R, { amp: 0.13, harm: 4, ax: d.ax, ay: d.ay, rot: d.rot }), d.lat, d.lon, d.covers, 5);
    const layers = d.colors.map((color, i) => {
      if (i === 0) return { color, rf, du: 0, dv: 0 };
      const sc = i === 1 ? 0.64 : 0.36;
      const ph = r.range(0, TAU);
      const wob = r.range(0.04, 0.09);
      const ang = r.range(0, TAU);
      const off = r.range(0, 0.07) * d.R;
      const inner: RFn = (t) => rf(t) * sc * (1 + wob * Math.sin(3 * t + ph));
      return { color, rf: inner, du: Math.cos(ang) * off, dv: Math.sin(ang) * off };
    });
    return { d, rf, layers, reach: d.R * Math.max(d.ax, d.ay) * 1.2 };
  });
  const nearLand = (ll: LL, pad: number): boolean => conts.some((c) => arcDist(ll, [c.d.lat, c.d.lon]) < c.reach + pad);

  // Ocean features are placed first (so they avoid land), then drawn under it.
  const islands: { ll: LL; R: number }[] = [];
  for (let i = 0; i < 300 && islands.length < 14; i += 1) {
    const ll: LL = [r.lat(-52, 58), r.range(-180, 180)];
    const R = r.range(1.8, 3.8);
    if (nearLand(ll, R + 3) || islands.some((o) => arcDist(ll, o.ll) < o.R + R + 4)) continue;
    islands.push({ ll, R });
  }
  const swirls: { ll: LL; R: number; rot: number; dir: number }[] = [];
  for (let i = 0; i < 200 && swirls.length < 7; i += 1) {
    const ll: LL = [r.lat(-50, 52), r.range(-180, 180)];
    const R = r.range(4, 6.5);
    const rot = r.range(0, TAU);
    const dir = r.f() < 0.5 ? -1 : 1;
    if (nearLand(ll, R + 1)) continue;
    if (islands.some((o) => arcDist(ll, o.ll) < o.R + R + 2)) continue;
    if (swirls.some((o) => arcDist(ll, o.ll) < o.R + R + 6)) continue;
    swirls.push({ ll, R, rot, dir });
  }
  const waves: { ll: LL; rot: number }[] = [];
  for (let i = 0; i < 300 && waves.length < 22; i += 1) {
    const ll: LL = [r.lat(-55, 60), r.range(-180, 180)];
    const rot = r.range(-0.25, 0.25);
    if (nearLand(ll, 4)) continue;
    if (islands.some((o) => arcDist(ll, o.ll) < o.R + 5)) continue;
    if (swirls.some((o) => arcDist(ll, o.ll) < o.R + 5)) continue;
    if (waves.some((o) => arcDist(ll, o.ll) < 8)) continue;
    waves.push({ ll, rot });
  }

  for (const s of swirls) {
    const line = spiralUV(s.R * 0.18, s.R, 1.7, 90, s.dir);
    p.felt(place(s.ll[0], s.ll[1], ribbonUV(line, 1.0, 2.6), s.rot), { color: '#24508f', height: 150, blur: 5, texAlpha: 0.7 });
    p.stitch(place(s.ll[0], s.ll[1], line, s.rot, false), false, { color: '#9cc0ea', w: 2, dash: 6, gap: 5 });
  }
  for (const wv of waves) {
    p.stitch(place(wv.ll[0], wv.ll[1], waveUV(5.5, 0.55, 1.5), wv.rot, false), false, { color: '#a9c8ee', w: 2, dash: 6, gap: 4 });
  }
  for (const is of islands) {
    const rf = blobR(r, is.R, { amp: 0.16, harm: 3 });
    const col = r.pick(GREENS);
    const [lat, lon] = is.ll;
    p.felt(place(lat, lon, blobUV(rf, 64)), { color: col, height: 168, blur: 5 });
    if (is.R > 2.4) p.stitch(place(lat, lon, blobUV(rf, 64, INSET * 0.8)), true, { color: CREAM, w: 2.2, dash: 6, gap: 5 });
    if (is.R > 3.2) {
      const inner: RFn = (t) => rf(t) * 0.45;
      p.felt(place(lat, lon, blobUV(inner, 48)), { color: shade(col, 0.15), height: 194, blur: 4 });
    }
  }

  // Continents: three layers of felt, each with a cream running stitch.
  for (const c of conts) {
    c.layers.forEach((L, i) => {
      p.felt(place(c.d.lat, c.d.lon, blobUV(L.rf, 160, 0, L.du, L.dv)), { color: L.color, height: 168 + i * 25 });
      p.stitch(place(c.d.lat, c.d.lon, blobUV(L.rf, 160, INSET, L.du, L.dv)), true, { color: CREAM });
    });
  }

  // Little felt trees and flower dots on land, kept clear of the pins.
  for (const c of conts) {
    const [z0, z1] = c.d.zone;
    const scatter = (count: number, draw: (ll: LL) => void): void => {
      for (let made = 0, tries = 0; made < count && tries < count * 12; tries += 1) {
        const t = r.range(0, TAU);
        const rr = c.rf(t) * r.range(z0, z1);
        const ll = local(c.d.lat, c.d.lon, Math.cos(t) * rr, Math.sin(t) * rr);
        if (ll[0] > 64 || pins.some((pp) => arcDist(pp, ll) < 4.5)) continue;
        draw(ll);
        made += 1;
      }
    };
    scatter(Math.round(c.d.R / 3.5), (ll) => tree(p, ll, r.range(2.6, 3.6), r.range(-0.15, 0.15), r.pick(TREE_GREENS)));
    scatter(Math.round(c.d.R / 2.6), (ll) => flower(p, ll, r.range(0.9, 1.25), r.pick(FLOWER_COLORS)));
  }

  polarCap(p, true, 71, 22, 2.6, '#f2efe7', '#ffffff', '#9fb8d8');
  polarCap(p, false, -70, 22, 2.6, '#f2efe7', '#ffffff', '#9fb8d8');

  // Orange running-stitch route Vancouver -> Toronto -> Bishkek.
  const arc = (a: LL, q: LL, bulge: number, n: number): LL[] => {
    const out: LL[] = [];
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      out.push([a[0] + (q[0] - a[0]) * t + bulge * Math.sin(Math.PI * t), a[1] + (q[1] - a[1]) * t]);
    }
    return out;
  };
  const route = arc(VANCOUVER, TORONTO, 7, 40).concat(arc(TORONTO, BISHKEK, 17, 150).slice(1));
  p.stitch(route, false, { color: ORANGE, w: 3.4, dash: 11, gap: 7 });

  // Felt circles under the 3D pins.
  for (const [lat, lon] of pins) {
    p.felt(place(lat, lon, circleUV(2.5, 48)), { color: '#fff1d0', height: 232, blur: 4 });
    p.stitch(place(lat, lon, circleUV(2.5 - INSET * 0.85, 48)), true, { color: ORANGE, w: 2.2, dash: 5, gap: 4 });
  }
}

// ---------------------------------------------------------------------------
// 2. 'stickers' (Projects): cream cardboard covered in abstract die-cut stickers,
// marker scribbles and masking tape. No pictograms: only the 3D badges carry icons.

type StickerShape = 'circle' | 'square' | 'hex' | 'pill' | 'burst' | 'scallop';
type StickerFill = 'block' | 'stripes' | 'checker' | 'zigzag' | 'polka' | 'rings' | 'squiggle' | 'plain';
type Scribble = 'swirl' | 'zigzag' | 'loops' | 'ring' | 'dots' | 'wave' | 'hatch' | 'xs';

const STICKER_COLORS = [
  '#3b4fb8', '#f08a24', '#2e9e6a', '#d6336c', '#7a5af0', '#0f8b8d', '#b5482f', '#26306e',
  '#1aa3a3', '#e0418a', '#ffb02e', '#5aa9e6', '#8aa84b', '#c8146a', '#2f63a8', '#ffd84d',
];
const MARKERS = ['#ff3d7f', '#14b8c8', '#ffb400', '#5cc93b', '#8e5cff', '#ff6a1a', '#2f63a8'];
const SCRIBBLES: Scribble[] = ['swirl', 'zigzag', 'loops', 'ring', 'dots', 'wave', 'hatch', 'xs'];
const WORDS = ['WIN!', '1st!', 'hack!', '8x'];
const FILLS: StickerFill[] = ['block', 'stripes', 'checker', 'zigzag', 'polka', 'rings', 'squiggle', 'block', 'stripes', 'polka'];
const SHAPES: StickerShape[] = ['circle', 'circle', 'circle', 'square', 'square', 'hex', 'pill', 'scallop'];

function stickerUV(shape: StickerShape, R: number): UV[] {
  switch (shape) {
    case 'square':
      return roundRectUV(R * 1.7, R * 1.7, R * 0.38, 6);
    case 'hex':
      return polygonUV(R * 1.05, 6);
    case 'pill':
      return roundRectUV(R * 2.3, R * 1.15, R * 0.575, 8);
    case 'burst':
      return starUV(R * 1.06, R * 0.86, 14);
    case 'scallop':
      return blobUV((t) => R * (0.94 + 0.07 * Math.cos(10 * t)), 120);
    default:
      return circleUV(R, 72);
  }
}

interface StickerDef {
  ll: LL;
  R: number;
  shape: StickerShape;
  fill: StickerFill;
  c1: string;
  c2: string;
  rot: number;
  ang: number;
  word: string | null;
}

/** Pattern inside a sticker, in local px around its centre (Rp = radius in px). */
function stickerPattern(c: Ctx, fill: StickerFill, Rp: number, color: string, ang: number): void {
  const big = Rp * 2.4;
  c.fillStyle = color;
  c.strokeStyle = color;
  c.rotate(ang);
  switch (fill) {
    case 'block':
      c.fillRect(0, -big, big, big * 2);
      break;
    case 'stripes': {
      const sw = Rp * 0.27;
      for (let i = -10; i <= 10; i += 2) c.fillRect(i * sw, -big, sw, big * 2);
      break;
    }
    case 'checker': {
      const cell = Rp * 0.44;
      for (let i = -6; i <= 6; i += 1) {
        for (let j = -6; j <= 6; j += 1) if ((i + j) % 2 === 0) c.fillRect(i * cell, j * cell, cell, cell);
      }
      break;
    }
    case 'zigzag': {
      c.lineWidth = Rp * 0.2;
      for (const y0 of [-Rp * 0.5, Rp * 0.2]) {
        c.beginPath();
        for (let i = 0; i <= 12; i += 1) {
          const x = -big + (i * big * 2) / 12;
          const y = y0 + (i % 2 ? -1 : 1) * Rp * 0.16;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.stroke();
      }
      break;
    }
    case 'polka': {
      const gap = Rp * 0.46;
      for (let j = -6; j <= 6; j += 1) {
        for (let i = -6; i <= 6; i += 1) {
          c.beginPath();
          c.arc(i * gap + (j % 2 ? gap / 2 : 0), j * gap * 0.87, Rp * 0.12, 0, TAU);
          c.fill();
        }
      }
      break;
    }
    case 'rings':
      c.lineWidth = Rp * 0.13;
      for (const rr of [0.24, 0.52, 0.8]) {
        c.beginPath();
        c.arc(0, 0, Rp * rr, 0, TAU);
        c.stroke();
      }
      break;
    case 'squiggle':
      c.lineWidth = Rp * 0.16;
      for (const y0 of [-Rp * 0.35, Rp * 0.35]) {
        c.beginPath();
        for (let i = 0; i <= 40; i += 1) {
          const x = -big / 2 + (i * big) / 40;
          const y = y0 + Math.sin((x / Rp) * 5) * Rp * 0.14;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.stroke();
      }
      break;
    default:
      break;
  }
}

function sticker(p: Painter, s: StickerDef, z: number): void {
  const { c, b, S } = p;
  const [lat, lon] = s.ll;
  const pl = p.poly(place(lat, lon, stickerUV(s.shape, s.R), s.rot));
  const bpx = (s.R * 0.12 + 0.5) * p.ppd;
  const Rp = s.R * p.ppd;
  const x = p.X(lon);
  const y = p.Y(lat);
  p.on(c, pl, () => {
    c.save();
    c.shadowColor = 'rgba(40,24,8,0.38)';
    c.shadowBlur = 7 * S;
    c.shadowOffsetX = 1.2 * S;
    c.shadowOffsetY = 2.2 * S;
    c.fillStyle = PAPER;
    c.strokeStyle = PAPER;
    c.lineWidth = bpx * 2;
    c.fill(pl.path);
    c.stroke(pl.path);
    c.restore();
    c.fillStyle = s.c1;
    c.fill(pl.path);
    c.save();
    c.clip(pl.path);
    c.translate((x - pl.cx) / pl.k, y);
    c.rotate(-s.rot);
    if (s.word) {
      const fs = Math.min(Rp * 0.82, (Rp * (s.shape === 'pill' ? 2.0 : 1.55)) / (s.word.length * 0.58));
      c.font = '700 ' + fs + 'px ' + FONT;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.strokeStyle = '#1b1b24';
      c.lineWidth = fs * 0.14;
      c.strokeText(s.word, 0, fs * 0.05);
      c.fillStyle = PAPER;
      c.fillText(s.word, 0, fs * 0.05);
    } else {
      stickerPattern(c, s.fill, Rp, s.c2, s.ang);
    }
    c.restore();
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.35;
    c.fillStyle = p.pattern(c, p.feltTex);
    c.fill(pl.path);
    c.restore();
    c.strokeStyle = shade(s.c1, -0.3, 0.45);
    c.lineWidth = 1.2 * S;
    c.stroke(pl.path);
  });
  // Bump: flat vinyl, raised with a crisp die-cut edge; later stickers sit a touch higher.
  p.on(b, pl, () => {
    b.fillStyle = grey(176 + z);
    b.strokeStyle = grey(176 + z);
    b.lineWidth = bpx * 2;
    b.fill(pl.path);
    b.stroke(pl.path);
  });
}

function scribble(p: Painter, ll: LL, kind: Scribble, s: number, rot: number, color: string, under: boolean): void {
  const [lat, lon] = ll;
  const op: GlobalCompositeOperation = under ? 'multiply' : 'source-over';
  const alpha = under ? 0.85 : 0.95;
  const w = 4.4;
  const line = (uv: UV[], closed = false): void => p.strokeLine(place(lat, lon, uv, rot, closed), closed, { color, w, alpha, op });
  switch (kind) {
    case 'swirl':
      line(spiralUV(0.1 * s, s, 2.2, 80, 1));
      break;
    case 'zigzag': {
      const pts: UV[] = [];
      for (let i = 0; i <= 7; i += 1) pts.push([-s + (2 * s * i) / 7, i % 2 ? s * 0.3 : -s * 0.3]);
      line(pts);
      break;
    }
    case 'loops': {
      const pts: UV[] = [];
      for (let i = 0; i <= 100; i += 1) {
        const t = i / 100;
        const a = t * 3.5 * TAU;
        pts.push([-s + 2 * s * t - 0.32 * s * Math.sin(a), 0.32 * s * Math.cos(a)]);
      }
      line(pts);
      break;
    }
    case 'ring': {
      const pts: UV[] = [];
      for (let i = 0; i <= 70; i += 1) {
        const a = (i / 70) * 1.2 * TAU;
        const rr = s * (1 + 0.08 * Math.sin(3 * a));
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.8]);
      }
      line(pts);
      break;
    }
    case 'dots':
      for (let i = 0; i < 6; i += 1) {
        const q = at(lat, lon, p.rng.range(-s, s), p.rng.range(-s * 0.6, s * 0.6), rot);
        p.dot(q[0], q[1], p.rng.range(0.3, 0.55), color);
      }
      break;
    case 'wave':
      line(waveUV(2 * s, s * 0.25, 2.5, 50));
      break;
    case 'hatch':
      for (let i = -2; i <= 2; i += 1) {
        line([
          [i * s * 0.32 - s * 0.3, -s * 0.5],
          [i * s * 0.32 + s * 0.3, s * 0.5],
        ]);
      }
      break;
    default:
      for (let i = -1; i <= 1; i += 1) {
        const u = i * s * 0.75;
        line([
          [u - s * 0.25, -s * 0.25],
          [u + s * 0.25, s * 0.25],
        ]);
        line([
          [u - s * 0.25, s * 0.25],
          [u + s * 0.25, -s * 0.25],
        ]);
      }
      break;
  }
}

function tape(p: Painter, ll: LL, L: number, w: number, rot: number, paper: Cv): void {
  const [lat, lon] = ll;
  p.felt(place(lat, lon, tapeUV(L, w, p.rng), rot), {
    color: '#efe2b6',
    height: 166,
    tex: paper,
    texAlpha: 0.5,
    alpha: 0.86,
    blur: 4,
    shadow: 0.5,
    edge: 0.18,
    crease: false,
    bevel: false,
    bumpTex: 0.1,
  });
  for (const v of [-w * 0.18, w * 0.22]) {
    p.strokeLine(place(lat, lon, [[-L * 0.4, v], [L * 0.38, v + 0.15]], rot, false), false, { color: 'rgba(255,255,255,0.32)', w: 1.2 });
  }
}

function paintStickers(p: Painter): void {
  const r = p.rng;
  const card = p.photo('cardboard', 2);
  const paper = p.photo('cardboard', 1);
  const wool = p.photo('wool', 0.5);
  const fuzz = p.photo('felt');
  p.fabric(
    '#f0e2c0',
    [
      [card, 'soft-light', 0.75],
      [wool, 'soft-light', 0.16],
      [fuzz, 'soft-light', 0.3],
    ],
    [
      [card, 0.22],
      [wool, 0.1],
      [fuzz, 0.06],
    ],
  );

  // Pale stitched felt shapes underneath, for layering.
  const PALE = ['#f6d3c2', '#d6ebcd', '#cde1f3', '#f3e0a2', '#e6d3f1', '#f9d9e6'];
  for (let i = 0; i < 8; i += 1) {
    const lat = r.lat(-48, 52);
    const lon = -180 + (i + r.range(0.15, 0.85)) * 45;
    const rf = blobR(r, r.range(11, 17), { amp: 0.14, harm: 4, ax: r.range(0.9, 1.4), ay: 1, rot: r.range(0, TAU) });
    p.felt(place(lat, lon, blobUV(rf, 128)), { color: r.pick(PALE), height: 150, texAlpha: 0.7 });
    p.stitch(place(lat, lon, blobUV(rf, 128, INSET)), true, { color: '#c49a68', w: 2.2 });
  }

  for (let i = 0; i < 30; i += 1) {
    scribble(p, [r.lat(-62, 66), r.range(-180, 180)], r.pick(SCRIBBLES), r.range(2.4, 4.8), r.range(-0.7, 0.7), r.pick(MARKERS), true);
  }
  for (let i = 0; i < 2; i += 1) {
    p.text(r.lat(-40, 45), -180 + (i + r.range(0.2, 0.8)) * 180, '8x', 6.5, r.range(-0.3, 0.3), r.pick(MARKERS), undefined, 'multiply');
  }

  // Overlapping die-cut stickers.
  const spots: { ll: LL; R: number }[] = [];
  for (let i = 0; i < 700 && spots.length < 54; i += 1) {
    const ll: LL = [r.lat(-56, 60), r.range(-180, 180)];
    const R = r.range(7, 13) * (0.72 + 0.28 * Math.cos(ll[0] * DEG));
    if (spots.some((o) => arcDist(o.ll, ll) < 0.66 * (o.R + R))) continue;
    spots.push({ ll, R });
  }
  const defs: StickerDef[] = spots.map((sp, i) => {
    const isWord = i % 5 === 2;
    const c1 = r.pick(STICKER_COLORS);
    let c2 = r.f() < 0.35 ? PAPER : r.pick(STICKER_COLORS);
    if (c2 === c1) c2 = PAPER;
    const shape: StickerShape = isWord ? (r.f() < 0.5 ? 'burst' : 'pill') : r.pick(SHAPES);
    return {
      ll: sp.ll,
      R: shape === 'pill' ? sp.R * 0.85 : sp.R,
      shape,
      fill: r.pick(FILLS),
      c1,
      c2,
      rot: r.range(-0.35, 0.35),
      ang: r.range(0, Math.PI),
      word: isWord ? WORDS[Math.floor(i / 5) % WORDS.length] : null,
    };
  });
  defs.forEach((d, i) => sticker(p, d, (i % 8) * 3));

  // Masking tape over a few sticker edges.
  for (let i = 0; i < 6; i += 1) {
    const d = defs[(i * 9 + 4) % Math.max(1, defs.length)];
    if (!d) break;
    const a = r.range(0, TAU);
    const q = local(d.ll[0], d.ll[1], Math.cos(a) * d.R, Math.sin(a) * d.R);
    tape(p, q, r.range(12, 17), r.range(2.8, 3.4), a + Math.PI / 2 + r.range(-0.3, 0.3), paper);
  }

  for (let i = 0; i < 10; i += 1) {
    scribble(p, [r.lat(-58, 62), r.range(-180, 180)], r.pick(SCRIBBLES), r.range(2, 3.6), r.range(-0.7, 0.7), r.pick(MARKERS), false);
  }
  p.text(r.lat(-20, 30), r.range(-180, 180), '8x', 5.5, r.range(-0.25, 0.25), r.pick(MARKERS), { color: PAPER, w: 0.22 });
  p.text(r.lat(-35, 20), r.range(-180, 180), 'WIN!', 4.2, r.range(-0.25, 0.25), r.pick(MARKERS), { color: PAPER, w: 0.22 });
}

// ---------------------------------------------------------------------------
// 3. 'moon' (About): navy denim with stitched red felt crater patches.

const WHITE_THREAD = '#fbf7ee';
const REDS: string[][] = [
  ['#c0392b', '#8f1d24', '#e0574f'],
  ['#b8233f', '#e04a62', '#7e1630'],
  ['#d1453b', '#9e2a2b', '#f07a6a'],
  ['#a8262e', '#d84a4a', '#741a22'],
];
const MUSTARD = ['#d9a32b', '#f2c75a', '#a87916'];
const TEAL = ['#1aa3a3', '#4fd0c4', '#0d6f73'];

function equatorSeam(p: Painter): void {
  const { c, b, W, S } = p;
  const y = p.Y(0);
  const band = 2.2 * p.ppd;
  c.fillStyle = 'rgba(0,0,0,0.1)';
  c.fillRect(0, y - band * 0.35, W, band * 0.7);
  c.fillStyle = 'rgba(5,8,20,0.6)';
  c.fillRect(0, y - 1.2 * S, W, 2.4 * S);
  b.fillStyle = grey(150, 0.6);
  b.fillRect(0, y - band, W, band * 2);
  b.fillStyle = grey(70);
  b.fillRect(0, y - 1.5 * S, W, 3 * S);
  const line = (lat: number): LL[] => {
    const out: LL[] = [];
    for (let i = 0; i <= 120; i += 1) out.push([lat, -180 + i * 3]);
    return out;
  };
  p.stitch(line(1.2), false, { color: '#d9a441', w: 2.4, dash: 8, gap: 5 });
  p.stitch(line(-1.2), false, { color: '#d9a441', w: 2.4, dash: 8, gap: 5 });
}

function paintMoon(p: Painter): void {
  const r = p.rng;
  const denim = p.photo('denim');
  const fuzz = p.photo('felt');
  const burlap = p.photo('burlap');
  p.fabric(
    '#1d2a5a',
    [
      [denim, 'soft-light', 0.95],
      [denim, 'overlay', 0.2],
      [fuzz, 'soft-light', 0.25],
    ],
    [
      [denim, 0.35],
      [burlap, 0.08],
    ],
  );
  equatorSeam(p);

  const SIZES = [14, 12.5, 11.5, 10.5, 9.5, 9, 8.5, 8, 7.5, 7, 7, 6.5, 6, 6, 5.5, 5, 5, 4.5, 4.5, 4, 4, 3.5, 3.5, 3, 3, 2.6];
  const patches: { ll: LL; R: number; idx: number }[] = [];
  SIZES.forEach((R, idx) => {
    for (let t = 0; t < 120; t += 1) {
      const ll: LL = [r.lat(-58, 62), r.range(-180, 180)];
      if (patches.some((o) => arcDist(o.ll, ll) < (o.R + R) * 1.3 + 1.5)) continue;
      patches.push({ ll, R, idx });
      break;
    }
  });

  for (const pt of patches) {
    const [lat, lon] = pt.ll;
    const pal = pt.idx === 7 || pt.idx === 17 ? MUSTARD : pt.idx === 10 || pt.idx === 20 ? TEAL : r.pick(REDS);
    const oval = r.f() < 0.35;
    const rf0 = blobR(r, pt.R, { amp: 0.035, harm: 3, ax: oval ? 1.3 : 1, ay: oval ? 0.82 : 1, rot: r.range(0, TAU) });
    const levels = pt.R >= 9 ? 3 : pt.R >= 5.5 ? 2 : 1;
    let du = 0;
    let dv = 0;
    for (let L = 0; L < levels; L += 1) {
      const sc = [1, 0.62, 0.32][L];
      if (L > 0) {
        const a = r.range(0, TAU);
        const off = r.range(0.04, 0.1) * pt.R;
        du += Math.cos(a) * off;
        dv += Math.sin(a) * off;
      }
      const rfL: RFn = (t) => rf0(t) * sc;
      p.felt(place(lat, lon, blobUV(rfL, 120, 0, du, dv)), { color: pal[L], height: 170 + L * 25 });
      p.stitch(place(lat, lon, blobUV(rfL, 120, INSET, du, dv)), true, { color: WHITE_THREAD, w: 2.4, dash: 7, gap: 5 });
    }
  }

  const clear = (ll: LL, pad: number): boolean => patches.every((o) => arcDist(o.ll, ll) > o.R * 1.3 + pad);
  const KINDS: ('x' | 'plus' | 'both')[] = ['x', 'x', 'plus', 'both'];
  for (let i = 0, made = 0; i < 400 && made < 64; i += 1) {
    const ll: LL = [r.lat(-62, 66), r.range(-180, 180)];
    const s = r.range(0.55, 1.1);
    const kind = r.pick(KINDS);
    const rot = r.range(-0.4, 0.4);
    if (!clear(ll, s + 1) || Math.abs(ll[0]) < 3) continue;
    p.cross(ll[0], ll[1], s, WHITE_THREAD, kind, rot, 2.1);
    made += 1;
  }
  for (let i = 0, made = 0; i < 500 && made < 120; i += 1) {
    const ll: LL = [r.lat(-64, 68), r.range(-180, 180)];
    const rad = r.range(0.3, 0.55);
    const col = r.f() < 0.18 ? '#f2c75a' : WHITE_THREAD;
    if (!clear(ll, 0.8)) continue;
    p.dot(ll[0], ll[1], rad, col, 172, 0.4);
    made += 1;
  }
}

// ---------------------------------------------------------------------------
// 4. 'letter' (Contact): striped knitted wool with stamps, postmarks and bubbles.

/** [top latitude, colour] for each knitted band, north to south. */
const LETTER_BANDS: [number, string][] = [
  [90, '#2f63a8'],
  [67, '#ffcf3a'],
  [63, '#e0418a'],
  [45, '#1aa3a3'],
  [-3, '#ffcf3a'],
  [-7, '#e0418a'],
  [-25, '#2f63a8'],
  [-47, '#ffcf3a'],
  [-51, '#1aa3a3'],
];
const STAMP_COLORS = ['#2f63a8', '#e0418a', '#1aa3a3', '#f08a24', '#7a5af0', '#2e9e6a', '#d6336c'];
type StampArt = 'landscape' | 'stripes' | 'polka' | 'checker' | 'zigzag' | 'rings';
const STAMP_ART: StampArt[] = ['landscape', 'stripes', 'polka', 'landscape', 'checker', 'zigzag', 'landscape', 'rings', 'stripes'];
const INK = '#2a2440';

function knitBands(p: Painter, knit: Cv): void {
  const { c, W, H } = p;
  const rowPx = knit.height / KNIT_ROWS;
  const cw = W / 128;
  for (let i = 1; i < LETTER_BANDS.length; i += 1) {
    const [top, color] = LETTER_BANDS[i];
    const y = Math.round(p.Y(top) / rowPx) * rowPx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, H + 1);
    c.lineTo(0, y);
    // Knitted colour change: the new colour's loops poke up into the row above.
    for (let k = 0; k < 128; k += 1) {
      c.lineTo(k * cw + cw / 2, y - rowPx * 0.5);
      c.lineTo((k + 1) * cw, y);
    }
    c.lineTo(W, H + 1);
    c.closePath();
    c.fill();
  }
}

function stamp(p: Painter, ll: LL, w: number, h: number, rot: number, color: string, art: StampArt, paper: Cv): void {
  const [lat, lon] = ll;
  p.felt(place(lat, lon, perforatedUV(w, h, 0.42, 1.2), rot), {
    color: '#fffaf0',
    height: 166,
    tex: paper,
    texAlpha: 0.3,
    blur: 6,
    edge: 0.12,
    crease: false,
    bevel: false,
    bumpTex: 0.08,
  });
  const iw = w - 2.2;
  const ih = h - 2.2;
  const inner = p.felt(place(lat, lon, roundRectUV(iw, ih, 0.3, 3), rot), {
    color: art === 'landscape' ? shade(color, 0.55) : color,
    height: 170,
    tex: paper,
    texAlpha: 0.35,
    shadow: 0,
    edge: 0.25,
    crease: false,
    bevel: false,
    bumpTex: 0.06,
  });
  const c = p.c;
  const x = p.X(lon);
  const y = p.Y(lat);
  const iwp = iw * p.ppd;
  const ihp = ih * p.ppd;
  const ang = p.rng.range(0.3, 1.2);
  p.on(c, inner, () => {
    c.clip(inner.path);
    c.translate((x - inner.cx) / inner.k, y);
    c.rotate(-rot);
    if (art === 'landscape') {
      // Tiny landscape: sun, two rolling hills and a lake strip.
      c.fillStyle = '#ffd84d';
      c.beginPath();
      c.arc(iwp * 0.2, -ihp * 0.22, iwp * 0.14, 0, TAU);
      c.fill();
      c.fillStyle = shade(color, -0.15);
      c.beginPath();
      c.ellipse(-iwp * 0.25, ihp * 0.42, iwp * 0.6, ihp * 0.4, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#5fae4e';
      c.beginPath();
      c.ellipse(iwp * 0.3, ihp * 0.5, iwp * 0.55, ihp * 0.36, 0, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillRect(-iwp, ihp * 0.36, iwp * 2, ihp * 0.04);
    } else {
      stickerPattern(c, art, Math.min(iwp, ihp) * 0.5, shade(color, 0.45), ang);
    }
  });
  p.strokeLine(place(lat, lon, roundRectUV(iw - 1.1, ih - 1.1, 0.25, 3), rot), true, { color: 'rgba(255,250,240,0.75)', w: 1.3 });
}

function postmark(p: Painter, ll: LL, rot: number, ring: boolean): void {
  const [lat, lon] = ll;
  const ink: LineOpts = { color: INK, w: 2.2, alpha: 0.6, op: 'multiply' };
  const R = 3.6;
  if (ring) {
    p.strokeLine(place(lat, lon, circleUV(R, 64), rot), true, ink);
    p.strokeLine(place(lat, lon, circleUV(R * 0.76, 64), rot), true, { ...ink, w: 1.4 });
    for (const v of [-0.9, 0, 0.9]) {
      p.strokeLine(place(lat, lon, [[-R * 0.45, v], [R * 0.45, v]], rot, false), false, { ...ink, w: 1.6 });
    }
  }
  for (let k = 0; k < 5; k += 1) {
    const v = (k - 2) * 1.05;
    const pts: UV[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const u = (ring ? R * 1.15 : -8) + (16 * i) / 40;
      pts.push([u, v + 0.45 * Math.sin((u / 4) * TAU)]);
    }
    p.strokeLine(place(lat, lon, pts, rot, false), false, ink);
  }
}

function speechBubble(p: Painter, ll: LL, rx: number, ry: number, rot: number, color: string, thread: string, lines: boolean, ta: number): void {
  const [lat, lon] = ll;
  p.felt(place(lat, lon, bubbleUV(rx, ry, ta, 0.55), rot), { color, height: 174 });
  p.stitch(place(lat, lon, bubbleUV(rx - INSET, ry - INSET, ta, 0.45), rot), true, { color: thread });
  if (lines) {
    for (const v of [ry * 0.25, -ry * 0.2]) {
      p.stitch(place(lat, lon, shiftUV(waveUV(rx * 1.1, 0.3, 2), 0, v), rot, false), false, { color: thread, w: 2.2, dash: 6, gap: 4 });
    }
  } else {
    for (let k = -1; k <= 1; k += 1) {
      const q = at(lat, lon, k * rx * 0.36, 0, rot);
      p.dot(q[0], q[1], ry * 0.15, thread, 200, 0.3);
    }
  }
}

function paintLetter(p: Painter): void {
  const r = p.rng;
  const knit = knitTile(p.size);
  const wool = p.photo('wool', 0.5);
  const fuzz = p.photo('felt');
  const paper = p.photo('cardboard');
  p.fabric(
    LETTER_BANDS[0][1],
    [
      [knit, 'overlay', 0.55],
      [knit, 'soft-light', 0.45],
      [wool, 'soft-light', 0.16],
      [fuzz, 'soft-light', 0.28],
    ],
    [
      [knit, 0.55],
      [wool, 0.08],
    ],
    () => knitBands(p, knit),
  );
  polarCap(p, true, 75, 20, 2.2, '#fff4dc', '#ffd84d', '#e0418a');
  polarCap(p, false, -75, 20, 2.2, '#fff4dc', '#ffd84d', '#e0418a');

  // Keep lat 0..25, lon -120..-60 calm: the framed window prop sits there.
  const calm = (ll: LL, R: number): boolean => {
    const pad = R + 3;
    const dl = Math.abs(((ll[1] + 90 + 540) % 360) - 180);
    return ll[0] > -pad && ll[0] < 25 + pad && dl < 30 + pad / cosc(ll[0]);
  };
  const occ: { ll: LL; R: number }[] = [];
  const spot = (R: number, latMin: number, latMax: number, gap: number): LL | null => {
    for (let i = 0; i < 150; i += 1) {
      const ll: LL = [r.lat(latMin, latMax), r.range(-180, 180)];
      if (calm(ll, R)) continue;
      if (occ.some((o) => arcDist(o.ll, ll) < o.R + R + gap)) continue;
      occ.push({ ll, R });
      return ll;
    }
    return null;
  };

  // Loose postmark waves straight on the wool.
  for (let i = 0; i < 4; i += 1) {
    const ll = spot(9, -50, 55, 1);
    if (ll) postmark(p, ll, r.range(-0.3, 0.3), false);
  }
  occ.length = 0;

  for (let i = 0; i < 9; i += 1) {
    const w = r.range(9, 11);
    const h = w * 1.2;
    const rot = r.range(-0.28, 0.28);
    const color = r.pick(STAMP_COLORS);
    const ll = spot(Math.hypot(w, h) / 2, -56, 60, 2);
    if (!ll) continue;
    stamp(p, ll, w, h, rot, color, STAMP_ART[i % STAMP_ART.length], paper);
    if (i % 2 === 0) postmark(p, at(ll[0], ll[1], w * 0.45, -h * 0.3, rot), rot + r.range(-0.4, 0.4), true);
  }

  const BUBBLES: [string, string][] = [
    ['#fffaf0', '#2f63a8'],
    ['#fff0a6', '#e0418a'],
    ['#c9f0e6', '#2f63a8'],
    ['#ffd1e3', '#1aa3a3'],
    ['#ffffff', '#e0418a'],
  ];
  for (let i = 0; i < BUBBLES.length; i += 1) {
    const rx = r.range(7.5, 9);
    const ry = r.range(5, 6);
    const rot = r.range(-0.2, 0.2);
    const ta = r.f() < 0.5 ? -Math.PI * 0.7 : -Math.PI * 0.3;
    const ll = spot(rx * 1.25, -50, 56, 2);
    if (!ll) continue;
    speechBubble(p, ll, rx, ry, rot, BUBBLES[i][0], BUBBLES[i][1], i % 2 === 1, ta);
  }

  // Small cross stitches and felt dots in the gaps.
  const THREADS = ['#fffaf0', '#ffcf3a', '#e0418a', '#2f63a8'];
  for (let i = 0; i < 40; i += 1) {
    const ll = spot(1.2, -62, 66, 0.6);
    if (!ll) continue;
    if (i % 3 === 0) p.dot(ll[0], ll[1], r.range(0.45, 0.7), r.pick(THREADS), 176, 0.35);
    else p.cross(ll[0], ll[1], r.range(0.6, 0.9), r.pick(THREADS), 'x', r.range(-0.3, 0.3), 2.2);
  }
}

// ---------------------------------------------------------------------------
// Public: one planet's maps.

const SEEDS: Record<PlanetKind, number> = { knit: 0x1f2e3d, stickers: 0x5713c4, moon: 0x0a11ce, letter: 0x1e77e2 };

/** The map width actually painted for a requested size (even, at least 64). */
export function mapWidth(size: number): number {
  return Math.max(64, Math.round(size / 2) * 2);
}

/** Planets whose maps draw text (and so need the web font loaded first). */
export const KINDS_WITH_TEXT: readonly PlanetKind[] = ['stickers'];

/** Paints one planet's colour and bump maps at width mapWidth(size). Not cached. */
export function paintMaps(kind: PlanetKind, images: PaintImages, size: number): { map: Cv; bump: Cv } {
  const p = new Painter(mapWidth(size), images, SEEDS[kind] ?? 1);
  switch (kind) {
    case 'knit':
      paintKnit(p);
      break;
    case 'stickers':
      paintStickers(p);
      break;
    case 'letter':
      paintLetter(p);
      break;
    default:
      paintMoon(p);
      break;
  }
  return { map: p.map, bump: p.bump };
}
