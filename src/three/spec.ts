import type { IconName, PlanetKind } from '../content';

// Shared contract for the 3D planets. Globe3D.tsx (scene), surfaces.ts (painted
// fabric maps) and props.tsx (3D bits stuck on or orbiting a planet) all build
// against this file. The planet is always a unit sphere (radius 1) at the origin.

export type BadgeStyle = 'sticker' | 'rosette';

export interface GlobeBadge {
  id: string;
  icon: IconName;
  color: string;
  style?: BadgeStyle;
  /**
   * Image URL (Vite asset) of the hackathon's logo. When set, the badge shows the
   * logo on a white disc instead of the icon; the icon stays as the fallback.
   * Passed through as paintBadge(icon, color, size, style, logo).
   */
  logo?: string;
  /** Accessible name is handled by the HTML tabs; this is only for hover titles. */
  title?: string;
}

export interface Globe3DProps {
  kind: PlanetKind;
  /** Level badges stuck on the surface (section pages). Leave out on the pod. */
  badges?: GlobeBadge[];
  /** Selected badge. The globe turns so this badge sits at FRONT_SPOT. */
  selected?: number;
  onSelectBadge?: (index: number) => void;
  /**
   * Open the selected badge as a POCKET on the planet itself: a zipper around the
   * badge unzips, the badge flap lifts open on a hinge, white light pours out of
   * the opening (glow, light rays, a point light washing the nearby surface) and
   * the camera pushes in towards it. false = zip it closed again.
   */
  pocketOpen?: boolean;
  /** Fires once the pocket is fully open (immediately under reduced motion). */
  onPocketOpened?: () => void;
  /** Fires once the pocket has zipped fully closed again. */
  onPocketClosed?: () => void;
  /** 'pod' = small hanging planet (1024 px maps), 'hero' = big section planet (2048 px maps). */
  detail?: 'pod' | 'hero';
  /** Spin a little faster, e.g. the highlighted planet on the pod. */
  excited?: boolean;
  /**
   * How far the canvas spills past the sphere on every side, as a fraction of the
   * sphere's diameter, so props (orbit rings, a cap on top) are not clipped.
   * The SPHERE always exactly fills the Globe3D's parent box.
   */
  bleed?: number;
  className?: string;
}

/** One thing to have ready before the site appears (see preloadGlobes in Globe3D.tsx). */
export interface PreloadRequest {
  kind: PlanetKind;
  detail: 'pod' | 'hero';
  badges?: GlobeBadge[];
}

/**
 * Globe3D.tsx also exports:
 *   preloadGlobes(requests: PreloadRequest[], onProgress?: (done: number, total: number) => void): Promise<void>
 * It paints every surface map and badge texture listed (and warms whatever else a
 * globe needs on first show), resolving when all are cached. The app shows its
 * loading screen until this resolves, so a Globe3D whose textures are cached must
 * render its 3D planet on the very first frame, and a Globe3D never shows the flat
 * SVG planet except as the no-WebGL / lost-context fallback.
 */

/** Where the selected badge's centre ends up, as fractions of the sphere's box (0..1). */
export const FRONT_SPOT = { x: 0.5, y: 0.34 } as const;

export type SurfaceImageName = 'knit' | 'wool' | 'burlap' | 'denim' | 'felt' | 'cardboard';
export type SurfaceImages = Record<SurfaceImageName, HTMLImageElement>;

/** Equirectangular maps, width = 2 * height. Canvas top row = north pole. */
export interface SurfaceMaps {
  /** Colour (albedo) map. */
  map: HTMLCanvasElement;
  /** Height map, greyscale: white = raised felt, black = recessed stitches/seams. */
  bump: HTMLCanvasElement;
}

const DEG = Math.PI / 180;

/**
 * Lat/lon (degrees) to a point on a sphere of radius r, matching the UVs of
 * three.js SphereGeometry with a CanvasTexture (flipY default):
 * canvas x = (lon + 180) / 360 * width, canvas y = (90 - lat) / 180 * height.
 * With no rotation, lon = -90 faces the camera (+z) and lat = 90 is the top.
 */
export function latLonToVec3(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return [-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta)];
}

/** Lat/lon (degrees) to canvas pixel coordinates on an equirectangular map. */
export function latLonToCanvas(lat: number, lon: number, width: number, height: number): [number, number] {
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
}
