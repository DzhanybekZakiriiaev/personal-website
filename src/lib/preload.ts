// Everything the site needs before the loading screen may go away, in one call:
//   fonts (every family and weight the CSS uses), every photo texture and logo,
//   the lazily imported 3D modules, the planets' fabric maps (painted in workers
//   when the browser can, see surfaces.ts), the level badges, Globe3D's own
//   preload (maps + badges cached, globe shaders warmed), the craft scenes'
//   textures and shaders (title rocket, pilot, doll), then a two-frame settle.
// Work starts on the first call (main.tsx calls it before React renders) and is
// shared by every later call. Progress is weighted by rough cost; every step has a
// timeout and the whole thing has a hard cap, so it never hangs and never rejects.
import { sections } from '../content';
import { levelsFor } from '../pages/levels';
import { preloadGlobes } from '../three/Globe3D';
import { paintBadge, prepaintSurfaces } from '../three/surfaces';
import type { GlobeBadge, PreloadRequest } from '../three/spec';
import knitUrl from '../assets/textures/knit.jpg';
import feltUrl from '../assets/textures/felt.jpg';
import cardboardUrl from '../assets/textures/cardboard.jpg';

export type PreloadProgress = (done: number, total: number) => void;

// Keep in step with Globe3D.tsx (MAP_PX / BADGE_PX for detail 'hero').
const HERO_MAP_PX = 2048;
const HERO_BADGE_PX = 512;

const HARD_CAP_MS = 30000; // after this the site shows anyway; globes then finish painting on screen

// Every photo texture in the project (CSS backgrounds, SVG patterns, 3D photos).
const TEXTURE_URLS = Object.values(
  import.meta.glob<string>('../assets/textures/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' }),
);

// Every family and weight the stylesheets use (see --font-display / --font-body).
const FONTS = [
  '400 1em "Atkinson Hyperlegible Next"',
  '600 1em "Atkinson Hyperlegible Next"',
  '700 1em "Atkinson Hyperlegible Next"',
  '500 1em "Fredoka"',
  '600 1em "Fredoka"',
  '700 1em "Fredoka"',
];

/** The same list App builds: every planet as a hero planet with its level badges. */
export function preloadRequests(): PreloadRequest[] {
  return sections.map((s) => ({
    kind: s.planet,
    detail: 'hero' as const,
    badges: levelsFor(s.id).map<GlobeBadge>((it) => ({
      id: it.id,
      icon: it.icon,
      color: it.color,
      style: it.badgeStyle ?? 'sticker',
      title: it.title,
      logo: it.logo,
    })),
  }));
}

/* ------------------------------------------------------------ helpers */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Resolves when `work` settles or after `ms`, whichever is first. Never rejects. */
function settle(work: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([work.then(
    () => undefined,
    () => undefined,
  ), delay(ms)]);
}

/** Lets a frame paint (the loading screen keeps moving); a timer covers hidden tabs. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => window.setTimeout(go, 0));
    window.setTimeout(go, 60);
  });
}

const imageLoads = new Map<string, Promise<HTMLImageElement>>();

/** Fetches and decodes an image (HTTP cache + decoded-image cache warm). */
function loadImage(url: string): Promise<HTMLImageElement> {
  let hit = imageLoads.get(url);
  if (!hit) {
    hit = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
        else resolve(img);
      };
      img.onerror = () => reject(new Error(`Could not load ${url.slice(0, 60)}`));
      img.src = url;
    });
    imageLoads.set(url, hit);
  }
  return hit;
}

/* ------------------------------------------------------------ the run */

const listeners = new Set<PreloadProgress>();
let progress = { done: 0, total: 1 };
let running: Promise<void> | null = null;

function report(done: number, total: number) {
  progress = { done: Math.min(done, total), total };
  for (const listener of listeners) {
    try {
      listener(progress.done, progress.total);
    } catch {
      // A broken listener must not stop the preload.
    }
  }
}

async function run(): Promise<void> {
  const requests = preloadRequests();
  const badges = new Map<string, GlobeBadge>();
  for (const request of requests) {
    for (const badge of request.badges ?? []) {
      badges.set(`${badge.icon}|${badge.color}|${badge.style ?? 'sticker'}|${badge.logo ?? ''}`, badge);
    }
  }
  const logos = [...new Set([...badges.values()].map((b) => b.logo).filter((u): u is string => Boolean(u)))];
  const planets = [...new Set(requests.map((r) => r.kind))];

  // Weights: rough share of the wait each step stands for.
  const W = { fonts: 1, images: 1, modules: 0.5, maps: 2 * planets.length, badges: 0.25 * badges.size, globes: 2, craft: 2, settle: 0.5 };
  const total = Object.values(W).reduce((a, b) => a + b, 0);
  let done = 0;
  const add = (w: number) => {
    done += w;
    report(done, total);
  };
  report(0, total);

  /** Runs one step with a timeout; credits whatever weight it had not reported yet. */
  const step = (weight: number, ms: number, work: (part: (fraction: number) => void) => Promise<unknown>) => {
    let credited = 0;
    const part = (fraction: number) => {
      const want = Math.min(weight, weight * fraction);
      if (want > credited) {
        add(want - credited);
        credited = want;
      }
    };
    let started: Promise<unknown>;
    try {
      started = work(part);
    } catch (error) {
      started = Promise.reject(error);
    }
    return settle(started, ms).then(() => part(1));
  };

  // 1. Fonts (each family and weight the CSS uses).
  const fonts = step(W.fonts, 5000, (part) => {
    const set = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!set) return Promise.resolve();
    let n = 0;
    return Promise.allSettled(FONTS.map((f) => set.load(f).finally(() => part(++n / FONTS.length))));
  });

  // 2. Photo textures and logos: in the HTTP cache and decoded before anything shows them.
  const imageUrls = [...TEXTURE_URLS, ...logos];
  const images = step(W.images, 10000, (part) => {
    let n = 0;
    return Promise.allSettled(imageUrls.map((u) => loadImage(u).finally(() => part(++n / imageUrls.length))));
  });

  // 3. Planet maps in workers (no-op without OffscreenCanvas; the main thread paints them then).
  let painted = 0;
  const maps = step(W.maps, 25000, (part) =>
    prepaintSurfaces(
      planets.map((kind) => ({ kind, size: HERO_MAP_PX })),
      () => part(++painted / planets.length),
    ),
  );

  // 4. Badges, one per frame on the main thread, while the workers paint the maps.
  const badgeList = [...badges.values()];
  const badgesDone = step(W.badges, 15000, (part) => {
    let n = 0;
    return Promise.allSettled(
      badgeList.map((b) => paintBadge(b.icon, b.color, HERO_BADGE_PX, b.style ?? 'sticker', b.logo).finally(() => part(++n / badgeList.length))),
    );
  });

  // 5. Globe3D's own preload: finds the maps and badges cached, warms the globe shaders.
  const globes = step(W.globes, 28000, (part) => preloadGlobes(requests, (d, t) => part(t > 0 ? d / t : 1)));

  // 6. Lazily imported 3D modules, then the craft scenes (title rocket, pilot, doll).
  const craftModules = () =>
    Promise.all([import('../three/StitchDoll'), import('../three/RocketIntro'), import('../three/craftWarmup'), import('../three/Sackboy')]);
  const modules = Promise.allSettled([craftModules()]);
  const modulesDone = step(W.modules, 10000, () => modules);
  const craft = step(W.craft, 12000, async (part) => {
    const [doll, rocket, warmup, sackboy] = await craftModules();
    doll.preloadDollTextures();
    rocket.preloadRocketTextures();
    // The rocket's pilot model (fetched and rigged in the background meanwhile).
    const pilot = sackboy.loadSackboy().catch(() => null);
    const [knit, felt, cardboard] = await Promise.all([loadImage(knitUrl), loadImage(feltUrl), loadImage(cardboardUrl)]);
    await nextFrame();
    doll.prewarmCraftCanvases(knit, felt);
    part(0.4);
    await nextFrame();
    await warmup.warmCraftShaders({ knit, felt, cardboard, sackboy: await pilot });
  });

  await Promise.all([fonts, images, maps, badgesDone, globes, modulesDone, craft]);

  // 7. Settle: let the textures upload and a couple of frames draw before revealing.
  await nextFrame();
  await nextFrame();
  add(W.settle);
}

/**
 * Preloads everything the site shows (see the top of this file) and resolves when
 * it is all ready. Never rejects and never hangs (per-step timeouts plus a 30 s cap).
 * Safe to call many times: the work runs once; each caller's onProgress gets the
 * current progress right away and every update after it, as (done, total).
 */
export function preloadEverything(onProgress?: PreloadProgress): Promise<void> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(progress.done, progress.total);
  }
  if (!running) {
    running = settle(
      run().catch(() => undefined),
      HARD_CAP_MS,
    ).then(() => report(progress.total, progress.total));
  }
  if (!onProgress) return running;
  const listener = onProgress;
  return running.then(() => {
    listeners.delete(listener);
  });
}
