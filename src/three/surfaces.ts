// Painted fabric maps for the 3D planets (a colour canvas and a bump canvas in the
// equirectangular layout three.js SphereGeometry expects) plus round level badges.
// The painting itself lives in surfacePaint.ts so it can also run in a worker:
// prepaintSurfaces() paints maps off the main thread (OffscreenCanvas) and caches
// them, so paintSurface() then returns instantly. Without worker support (or if a
// worker fails) paintSurface() paints on the main thread exactly as before.
import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ICONS } from '../components/icons';
import type { IconName, PlanetKind } from '../content';
import type { BadgeStyle, SurfaceImageName, SurfaceImages, SurfaceMaps } from './spec';
import { FONT, KINDS_WITH_TEXT, PAPER, TAU, makeCanvas, mapWidth, normalizedTile, paintMaps, shade, type Ctx, type Cv } from './surfacePaint';
import burlapUrl from '../assets/textures/burlap.jpg';
import cardboardUrl from '../assets/textures/cardboard.jpg';
import denimUrl from '../assets/textures/denim.jpg';
import feltUrl from '../assets/textures/felt.jpg';
import knitUrl from '../assets/textures/knit.jpg';
import woolUrl from '../assets/textures/wool.jpg';

// ---------------------------------------------------------------------------
// Loading: the six photo textures (for the maps) and icon images (badges only).

const TEXTURE_URLS: Record<SurfaceImageName, string> = {
  knit: knitUrl,
  wool: woolUrl,
  burlap: burlapUrl,
  denim: denimUrl,
  felt: feltUrl,
  cardboard: cardboardUrl,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Give a web font a short chance to load so canvas text uses it; never blocks for long. */
function fontsReady(): Promise<void> {
  try {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return Promise.resolve();
    const load = fonts.load(`700 32px ${FONT}`).then(
      () => undefined,
      () => undefined,
    );
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 1200);
    });
    return Promise.race([load, timeout]);
  } catch {
    return Promise.resolve();
  }
}

let photosPromise: Promise<SurfaceImages> | null = null;

/** The six photos, decoded (shared by the maps and the badges). */
function loadPhotos(): Promise<SurfaceImages> {
  if (!photosPromise) {
    const names = Object.keys(TEXTURE_URLS) as SurfaceImageName[];
    const p = Promise.all(names.map((n) => loadImage(TEXTURE_URLS[n]))).then((imgs) => {
      const out = {} as SurfaceImages;
      names.forEach((n, i) => {
        out[n] = imgs[i];
      });
      return out;
    });
    photosPromise = p;
    p.catch(() => {
      if (photosPromise === p) photosPromise = null;
    });
  }
  return photosPromise;
}

let imagesPromise: Promise<SurfaceImages> | null = null;

/**
 * The photos plus the canvas font. If maps are being painted in a worker right now
 * (prepaintSurfaces), this also waits for them, so a caller that paints next
 * (Globe3D's paint queue) finds them cached instead of painting them twice.
 */
export function loadSurfaceImages(): Promise<SurfaceImages> {
  if (!imagesPromise) {
    const p = Promise.all([loadPhotos(), fontsReady()]).then(async ([imgs]) => {
      if (inflight) await inflight;
      return imgs;
    });
    imagesPromise = p;
    p.catch(() => {
      if (imagesPromise === p) imagesPromise = null;
    });
  }
  return imagesPromise;
}

// React SVG prop names that differ from the SVG attribute (the icons use only a few).
const SVG_ATTRS: Record<string, string> = {
  className: 'class',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  strokeWidth: 'stroke-width',
  textAnchor: 'text-anchor',
  vectorEffect: 'vector-effect',
  xlinkHref: 'xlink:href',
};

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Static SVG markup for icon artwork (plain SVG elements, no hooks). Replaces
 * react-dom/server's renderToStaticMarkup, which pulled about 190 kB of server
 * renderer into the page bundle for this one job.
 */
function svgMarkup(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return escapeXml(String(node));
  if (Array.isArray(node)) return node.map((child: ReactNode) => svgMarkup(child)).join('');
  if (!isValidElement(node)) return '';
  const { type, props } = node as ReactElement<Record<string, unknown>>;
  const children = props.children as ReactNode;
  if (type === Fragment) return svgMarkup(children);
  if (typeof type === 'function') return svgMarkup((type as (p: Record<string, unknown>) => ReactNode)(props));
  if (typeof type !== 'string') return '';
  let attrs = '';
  for (const [name, value] of Object.entries(props)) {
    if (name === 'children' || value === null || value === undefined || value === false || typeof value === 'function') continue;
    if (name === 'style' && typeof value === 'object') {
      const css = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(v)}`)
        .join(';');
      attrs += ` style="${escapeXml(css)}"`;
      continue;
    }
    attrs += ` ${SVG_ATTRS[name] ?? name}="${escapeXml(value === true ? '' : String(value))}"`;
  }
  return `<${type}${attrs}>${svgMarkup(children)}</${type}>`;
}

const iconLoads = new Map<IconName, Promise<HTMLImageElement | null>>();

/** Icon artwork as an image, for badges only (maps never show icons). */
function loadIcon(name: IconName): Promise<HTMLImageElement | null> {
  let hit = iconLoads.get(name);
  if (!hit) {
    let url = '';
    try {
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">${svgMarkup(ICONS[name])}</svg>`;
      url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    } catch {
      url = '';
    }
    hit = url
      ? loadImage(url).then(
          (img) => img,
          () => null,
        )
      : Promise.resolve(null);
    iconLoads.set(name, hit);
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Public: surfaces.

const surfaceCache = new Map<string, SurfaceMaps>();

/** A planet's maps, from the cache (prepaintSurfaces) or painted right here. */
export function paintSurface(kind: PlanetKind, images: SurfaceImages, size: number): SurfaceMaps {
  const key = kind + ':' + mapWidth(size);
  const hit = surfaceCache.get(key);
  if (hit) return hit;
  const { map, bump } = paintMaps(kind, images, size);
  // On the page makeCanvas always makes canvas elements.
  const maps: SurfaceMaps = { map: map as HTMLCanvasElement, bump: bump as HTMLCanvasElement };
  surfaceCache.set(key, maps);
  return maps;
}

// ---------------------------------------------------------------------------
// Off the main thread: maps painted in workers (see surfaceWorker.ts).

export interface PaintRequest {
  kind: PlanetKind;
  /** Map width in px, as passed to paintSurface (1024 or 2048). */
  size: number;
}

/** The web font a worker needs for canvas text, as found in the page's @font-face rules. */
export interface WorkerFont {
  family: string;
  source: string;
  weight: string;
  unicodeRange: string;
}

export type WorkerRequest = {
  id: number;
  kind: PlanetKind;
  size: number;
  photos: Record<SurfaceImageName, Blob>;
  font: WorkerFont | null;
};

export type WorkerReply = { id: number; ok: true; map: ImageBitmap; bump: ImageBitmap } | { id: number; ok: false; error: string };

const JOB_TIMEOUT_MS = 15000;
const PREPAINT_CAP_MS = 20000;
let inflight: Promise<void> | null = null;

function canPaintInWorker(): boolean {
  try {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap === 'function' &&
      typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
    );
  } catch {
    return false;
  }
}

function weightCovers(weight: string, want: number): boolean {
  const nums = weight.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return weight.trim() === 'bold' ? want === 700 : want === 400;
  return nums.length === 1 ? nums[0] === want : want >= nums[0] && want <= nums[1];
}

function rangeCovers(range: string, code: number): boolean {
  return range.split(',').some((part) => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'f'), 16);
    return code >= lo && code <= hi;
  });
}

/** The page's Fredoka 700 face (basic Latin), read from the Google Fonts stylesheet. */
async function findCanvasFont(): Promise<WorkerFont | null> {
  try {
    const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
    if (!link) return null;
    const response = await fetch(link.href);
    if (!response.ok) return null;
    const css = await response.text();
    for (const block of css.split('@font-face').slice(1)) {
      const prop = (name: string) => new RegExp(`${name}\\s*:\\s*([^;}]+)`, 'i').exec(block)?.[1]?.trim() ?? '';
      const family = prop('font-family').replace(/['"]/g, '');
      if (family !== 'Fredoka' || (prop('font-style') || 'normal') !== 'normal') continue;
      const weight = prop('font-weight') || '400';
      const unicodeRange = prop('unicode-range');
      const source = prop('src');
      if (!source || !weightCovers(weight, 700) || (unicodeRange && !rangeCovers(unicodeRange, 0x41))) continue;
      return { family, source, weight, unicodeRange };
    }
  } catch {
    // No font for the worker: planets with text are painted on the page instead.
  }
  return null;
}

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function runJob(worker: Worker, request: WorkerRequest): Promise<{ map: ImageBitmap; bump: ImageBitmap }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('worker timed out')), JOB_TIMEOUT_MS);
    function finish(error: Error | null, reply?: { map: ImageBitmap; bump: ImageBitmap }) {
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (reply) resolve(reply);
      else reject(error ?? new Error('worker failed'));
    }
    function onMessage(event: MessageEvent<WorkerReply>) {
      const data = event.data;
      if (data.id !== request.id) return;
      if (data.ok) finish(null, { map: data.map, bump: data.bump });
      else finish(new Error(data.error));
    }
    function onError(event: ErrorEvent) {
      event.preventDefault();
      finish(new Error('worker error'));
    }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(request);
  });
}

async function paintInWorkers(jobs: PaintRequest[], onPainted?: () => void): Promise<void> {
  const needsFont = jobs.some((job) => KINDS_WITH_TEXT.includes(job.kind));
  const names = Object.keys(TEXTURE_URLS) as SurfaceImageName[];
  const [blobs, font] = await Promise.all([
    Promise.all(
      names.map((n) =>
        fetch(TEXTURE_URLS[n]).then((r) => {
          if (!r.ok) throw new Error(`Could not load ${n}`);
          return r.blob();
        }),
      ),
    ),
    needsFont ? findCanvasFont() : Promise.resolve(null),
  ]);
  const photos = {} as Record<SurfaceImageName, Blob>;
  names.forEach((n, i) => {
    photos[n] = blobs[i];
  });
  // Text planets with no usable worker font are left to the main thread.
  const queue = jobs.filter((job) => font || !KINDS_WITH_TEXT.includes(job.kind));
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const count = Math.min(queue.length, cores >= 4 ? 2 : 1);
  let nextId = 1;
  const lane = async () => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./surfaceWorker.ts', import.meta.url), { type: 'module', name: 'surface-paint' });
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const { map, bump } = await runJob(worker, { id: nextId++, kind: job.kind, size: job.size, photos, font });
          surfaceCache.set(job.kind + ':' + mapWidth(job.size), { map: bitmapToCanvas(map), bump: bitmapToCanvas(bump) });
          onPainted?.();
        } catch (error) {
          // A dead or stuck worker ends this lane; a job it declined (say, no canvas
          // font) is just left for the main thread and the lane carries on.
          if (error instanceof Error && /^worker /.test(error.message)) throw error;
        }
      }
    } catch {
      // Whatever is left is painted on the main thread when asked for.
    } finally {
      worker?.terminate();
    }
  };
  await Promise.all(Array.from({ length: count }, lane));
}

/**
 * Paints the listed maps in background workers (OffscreenCanvas) and caches them,
 * so a later paintSurface() for the same planet and size returns instantly. Resolves
 * when done (never rejects); anything a worker could not paint is simply left for
 * paintSurface() to paint on the main thread. No-op without worker support.
 * onPainted fires once per map pair a worker delivered (for progress bars).
 */
export function prepaintSurfaces(requests: PaintRequest[], onPainted?: () => void): Promise<void> {
  const seen = new Set<string>();
  const jobs = requests.filter((r) => {
    const key = r.kind + ':' + mapWidth(r.size);
    if (seen.has(key) || surfaceCache.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (jobs.length === 0 || !canPaintInWorker()) return inflight ?? Promise.resolve();
  const previous = inflight;
  const work = (previous ?? Promise.resolve()).then(() =>
    paintInWorkers(
      jobs.filter((r) => !surfaceCache.has(r.kind + ':' + mapWidth(r.size))),
      onPainted,
    ),
  );
  // Never keep the page waiting on workers for long: after the cap, paintSurface()
  // paints whatever is still missing itself.
  const cap = new Promise<void>((resolve) => setTimeout(resolve, PREPAINT_CAP_MS));
  const run = Promise.race([work, cap]).catch(() => undefined);
  inflight = run;
  void run.then(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

// ---------------------------------------------------------------------------
// Public: level badges (round photo-sticker or ribbon rosette).

type BadgeArt = { kind: 'icon'; img: HTMLImageElement | null } | { kind: 'logo'; img: HTMLImageElement };

const logoLoads = new Map<string, Promise<HTMLImageElement | null>>();

function loadLogo(url: string): Promise<HTMLImageElement | null> {
  let hit = logoLoads.get(url);
  if (!hit) {
    hit = loadImage(url).then(
      (img) => img,
      () => null,
    );
    logoLoads.set(url, hit);
  }
  return hit;
}

function feltDisc(ctx: Ctx, cx: number, cy: number, rad: number, color: string, felt: Cv | null, texAlpha: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(rad, 0.5), 0, TAU);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  if (felt) {
    const pat = ctx.createPattern(felt, 'repeat');
    if (pat) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = texAlpha;
      ctx.fillStyle = pat;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }
  ctx.restore();
}

function stickerBadge(ctx: Ctx, cx: number, cy: number, R: number, color: string, art: BadgeArt, felt: Cv | null): void {
  const ring = R * 0.17;
  let Rd = R - ring;
  const circle = (rad: number): void => {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(rad, 0.5), 0, TAU);
  };
  // White die-cut edge with a soft drop shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(20,12,30,0.38)';
  ctx.shadowBlur = R * 0.1;
  ctx.shadowOffsetY = R * 0.04;
  ctx.fillStyle = PAPER;
  circle(R);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,40,20,0.16)';
  ctx.lineWidth = Math.max(1, R * 0.012);
  circle(R - ctx.lineWidth / 2);
  ctx.stroke();

  if (art.kind === 'logo') {
    // Thin coloured ring, then a clean white felt disc holding the logo.
    feltDisc(ctx, cx, cy, Rd, color, felt, 0.5);
    Rd -= R * 0.075;
    feltDisc(ctx, cx, cy, Rd, '#fffefb', felt, 0.22);
    ctx.save();
    circle(Rd);
    ctx.clip();
    const vg = ctx.createRadialGradient(cx, cy, Rd * 0.6, cx, cy, Rd);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - Rd, cy - Rd, Rd * 2, Rd * 2);
    const iw = art.img.naturalWidth || 1;
    const ih = art.img.naturalHeight || 1;
    const D = Rd * 2;
    const k = Math.min((0.72 * D) / iw, (0.72 * D) / ih, (0.9 * D) / Math.hypot(iw, ih));
    const w = iw * k;
    const h = ih * k;
    try {
      ctx.drawImage(art.img, cx - w / 2, cy - h / 2, w, h);
    } catch {
      // A logo that cannot be drawn leaves the disc plain.
    }
    ctx.restore();
    ctx.strokeStyle = shade(color, -0.3, 0.5);
    ctx.lineWidth = Math.max(1, R * 0.014);
    circle(Rd + R * 0.075);
    ctx.stroke();
  } else {
    feltDisc(ctx, cx, cy, Rd, color, felt, 0.65);
    ctx.save();
    circle(Rd);
    ctx.clip();
    const vg = ctx.createRadialGradient(cx, cy, Rd * 0.45, cx, cy, Rd);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - Rd, cy - Rd, Rd * 2, Rd * 2);
    ctx.restore();
    ctx.strokeStyle = shade(color, -0.35, 0.55);
    ctx.lineWidth = Math.max(1, R * 0.022);
    circle(Rd);
    ctx.stroke();
    if (art.img) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = R * 0.05;
      ctx.shadowOffsetY = R * 0.025;
      const s = Rd * 1.62;
      try {
        ctx.drawImage(art.img, cx - s / 2, cy - s / 2, s, s);
      } catch {
        // Broken icon image: leave the disc plain.
      }
      ctx.restore();
    }
  }

  // Small gloss arc at the top left.
  ctx.save();
  circle(Rd);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = art.kind === 'logo' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = R * 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, Rd * 0.78, Math.PI * 1.08, Math.PI * 1.36);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(Math.PI * 1.47) * Rd * 0.78, cy + Math.sin(Math.PI * 1.47) * Rd * 0.78, R * 0.035, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function ribbonTails(ctx: Ctx, N: number, cx: number, cy: number, color: string, felt: Cv | null): void {
  const w = N * 0.15;
  const L = N * 0.48;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + side * N * 0.07, cy + N * 0.12);
    ctx.rotate(-side * 0.28);
    const tail = new Path2D();
    tail.moveTo(-w / 2, 0);
    tail.lineTo(w / 2, 0);
    tail.lineTo(w / 2, L);
    tail.lineTo(0, L - w * 0.42);
    tail.lineTo(-w / 2, L);
    tail.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(20,12,30,0.32)';
    ctx.shadowBlur = N * 0.025;
    ctx.shadowOffsetY = N * 0.01;
    ctx.fillStyle = shade(color, -0.12);
    ctx.fill(tail);
    ctx.restore();
    ctx.save();
    ctx.clip(tail);
    if (felt) {
      const pat = ctx.createPattern(felt, 'repeat');
      if (pat) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = pat;
        ctx.fillRect(-w, 0, w * 2, L);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-w / 2 + w * 0.12, 0, w * 0.2, L);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(w / 2 - w * 0.2, 0, w * 0.2, L);
    ctx.restore();
    ctx.setLineDash([N * 0.022, N * 0.016]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,253,247,0.85)';
    ctx.lineWidth = Math.max(1, N * 0.008);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + w * 0.17, N * 0.04);
    ctx.lineTo(-w / 2 + w * 0.17, L - w * 0.3);
    ctx.moveTo(w / 2 - w * 0.17, N * 0.04);
    ctx.lineTo(w / 2 - w * 0.17, L - w * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function pleatedRing(ctx: Ctx, cx: number, cy: number, Ri: number, Ro: number, color: string, felt: Cv | null): void {
  const n = 28;
  const pt = (a: number, rad: number): [number, number] => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  const outline = new Path2D();
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const [x0, y0] = pt(a0, Ro);
    const [qx, qy] = pt((a0 + a1) / 2, Ro * 1.07);
    const [x1, y1] = pt(a1, Ro);
    if (i === 0) outline.moveTo(x0, y0);
    outline.quadraticCurveTo(qx, qy, x1, y1);
  }
  outline.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(20,12,30,0.35)';
  ctx.shadowBlur = Ro * 0.08;
  ctx.shadowOffsetY = Ro * 0.03;
  ctx.fillStyle = shade(color, -0.12);
  ctx.fill(outline);
  ctx.restore();
  const light = shade(color, 0.22);
  const dark = shade(color, -0.12);
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const am = (a0 + a1) / 2;
    const wedge = new Path2D();
    const [ix0, iy0] = pt(a0, Ri);
    const [ox0, oy0] = pt(a0, Ro);
    const [qx, qy] = pt(am, Ro * 1.07);
    const [ox1, oy1] = pt(a1, Ro);
    const [ix1, iy1] = pt(a1, Ri);
    wedge.moveTo(ix0, iy0);
    wedge.lineTo(ox0, oy0);
    wedge.quadraticCurveTo(qx, qy, ox1, oy1);
    wedge.lineTo(ix1, iy1);
    wedge.closePath();
    ctx.fillStyle = i % 2 ? light : dark;
    ctx.fill(wedge);
    const [fx0, fy0] = pt(am, Ri);
    const [fx1, fy1] = pt(am, Ro * 1.02);
    ctx.strokeStyle = shade(color, -0.4, 0.22);
    ctx.lineWidth = Math.max(1, Ro * 0.008);
    ctx.beginPath();
    ctx.moveTo(fx0, fy0);
    ctx.lineTo(fx1, fy1);
    ctx.stroke();
  }
  ctx.save();
  ctx.clip(outline);
  if (felt) {
    const pat = ctx.createPattern(felt, 'repeat');
    if (pat) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = pat;
      ctx.fillRect(cx - Ro * 1.1, cy - Ro * 1.1, Ro * 2.2, Ro * 2.2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
  const ao = ctx.createRadialGradient(cx, cy, Ri, cx, cy, Ri + (Ro - Ri) * 0.5);
  ao.addColorStop(0, 'rgba(0,0,0,0.28)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(cx - Ro * 1.1, cy - Ro * 1.1, Ro * 2.2, Ro * 2.2);
  ctx.restore();
  ctx.setLineDash([Ro * 0.06, Ro * 0.045]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,253,247,0.9)';
  ctx.lineWidth = Math.max(1, Ro * 0.022);
  ctx.beginPath();
  ctx.arc(cx, cy, Ri + (Ro - Ri) * 0.62, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Badges are painted one per frame, so a planet's worth of them never adds up to
// one long main-thread task (the loading screen keeps animating meanwhile).
let badgeQueue: Promise<unknown> = Promise.resolve();

function afterFrame(): Promise<void> {
  // A hidden tab draws nothing and throttles timers: no point spacing work out there.
  if (typeof document !== 'undefined' && document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50); // hidden tabs get no frames
  });
}

function inTurn<T>(work: () => T): Promise<T> {
  const run = badgeQueue.then(afterFrame).then(work);
  badgeQueue = run.catch(() => undefined);
  return run;
}

async function drawBadge(icon: IconName, color: string, size: number, style: BadgeStyle, logo?: string): Promise<HTMLCanvasElement> {
  const [images, logoImg] = await Promise.all([loadPhotos().catch(() => null), logo ? loadLogo(logo) : Promise.resolve(null)]);
  const art: BadgeArt = logoImg ? { kind: 'logo', img: logoImg } : { kind: 'icon', img: await loadIcon(icon) };
  return inTurn(() => {
    const felt = images ? normalizedTile(images.felt) : null;
    const N = size;
    const [canvas, ctx] = makeCanvas(N, N);
    ctx.lineJoin = 'round';
    if (style === 'rosette') {
      const cx = N / 2;
      const cy = N * 0.36;
      const Ro = N * 0.33;
      const Rs = N * 0.225;
      ribbonTails(ctx, N, cx, cy, color, felt);
      pleatedRing(ctx, cx, cy, Rs * 0.92, Ro, color, felt);
      stickerBadge(ctx, cx, cy, Rs, color, art, felt);
    } else {
      stickerBadge(ctx, N / 2, N / 2 - N * 0.012, N * 0.45, color, art, felt);
    }
    return canvas as HTMLCanvasElement; // a canvas element on the page
  });
}

const badgeCache = new Map<string, Promise<HTMLCanvasElement>>();

export function paintBadge(icon: IconName, color: string, size: number, style: BadgeStyle = 'sticker', logo?: string): Promise<HTMLCanvasElement> {
  const px = Math.max(16, Math.round(size));
  const key = [icon, color, px, style, logo ?? ''].join('|');
  let hit = badgeCache.get(key);
  if (!hit) {
    const p = drawBadge(icon, color, px, style, logo);
    p.catch(() => {
      if (badgeCache.get(key) === p) badgeCache.delete(key);
    });
    badgeCache.set(key, p);
    hit = p;
  }
  return hit;
}
