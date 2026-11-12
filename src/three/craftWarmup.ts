// Compiles the craft scenes' shader programs (title rocket, pilot rocket, knitted
// doll, Sackboy) during the loading screen, in a throwaway WebGL context. Browsers with a
// GPU program cache shared across contexts (Chrome, Edge) then link the real
// canvases' programs from cache, so the title screen does not stall on its first
// frame. Mirrors the craft canvases: <Canvas flat> (no tone mapping), sRGB output,
// CraftLights, and every kit material.
import * as THREE from 'three';
import { canUseWebGL, createCraftLights, makeDollWarmup } from './StitchDoll';
import { makeRocketWarmup } from './RocketIntro';
import { makeSackboyWarmup, type SackboySource } from './Sackboy';

export interface CraftImages {
  knit: HTMLImageElement;
  felt: HTMLImageElement;
  cardboard: HTMLImageElement;
  /** The loaded pilot model, when it loaded (its skinned materials need their own programs). */
  sackboy?: SackboySource | null;
}

let warming: Promise<void> | null = null;

async function warm(images: CraftImages): Promise<void> {
  if (!canUseWebGL()) return;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'default' });
  const parts: { dispose: () => void }[] = [];
  try {
    // Without parallel compilation (Firefox) compiling here would block the page
    // just as long as compiling later, and its program cache is not shared anyway.
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) return;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    for (const light of createCraftLights()) scene.add(light);
    const warmups = [makeDollWarmup(images.knit, images.felt), makeRocketWarmup(images.knit, images.felt, images.cardboard)];
    if (images.sackboy) warmups.push(makeSackboyWarmup(images.sackboy));
    for (const part of warmups) {
      parts.push(part);
      scene.add(...part.objects);
    }
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 0, 6);
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const part of parts) part.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Compiles the craft shader programs once; resolves when done (never rejects). */
export function warmCraftShaders(images: CraftImages): Promise<void> {
  if (!warming) warming = warm(images).catch(() => undefined);
  return warming;
}
