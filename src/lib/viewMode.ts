/*
 * 3D site or simple version? Decided once, before any 3D code is downloaded
 * (main.tsx), so a visitor on a weak machine gets the simple page straight away.
 *
 *   ?view=simple  always the simple version (link to it from a CV, say)
 *   ?view=3d      always the 3D site (the simple page's "Try the 3D version")
 *   otherwise     the 3D site, unless this device can't draw it well:
 *                 no WebGL; WebGL only in software (the browser reports a "major
 *                 performance caveat", or the renderer is SwiftShader, llvmpipe,
 *                 Microsoft Basic Render Driver, ...); data saver on; or very little
 *                 memory. The loading screen also offers the simple version, and
 *                 switches to it by itself if the 3D takes too long (LoadingScreen).
 */

export type ViewMode = '3d' | 'simple';

/** Why the simple version is showing (the simple page tells the visitor). */
export type SimpleReason = 'asked' | 'slow' | 'no-webgl' | 'software' | 'save-data' | 'low-memory';

export interface ViewDecision {
  mode: ViewMode;
  /** Set when the simple version is showing. */
  reason: SimpleReason | null;
  /** The visitor asked for the 3D site (?view=3d): never switch away by ourselves. */
  forced3d: boolean;
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|lavapipe/i;

/** Why this device should get the simple version, or null if it can draw the 3D site. */
function weakDeviceReason(): SimpleReason | null {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return 'save-data';
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 2) return 'low-memory';
  try {
    const canvas = document.createElement('canvas');
    const opts: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl = (canvas.getContext('webgl2', opts) ?? canvas.getContext('webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) {
      // No context with the caveat flag: either no WebGL at all, or only a software one.
      const probe = document.createElement('canvas');
      const any = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null;
      any?.getExtension('WEBGL_lose_context')?.loseContext();
      return any ? 'software' : 'no-webgl';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (SOFTWARE_RENDERER.test(renderer)) return 'software';
  } catch {
    return 'no-webgl';
  }
  return null;
}

let decided: ViewDecision | null = null;

export function decideViewMode(): ViewDecision {
  if (decided) return decided;
  const asked = new URLSearchParams(window.location.search).get('view');
  const slow = new URLSearchParams(window.location.search).get('why') === 'slow';
  if (asked === 'simple') decided = { mode: 'simple', reason: slow ? 'slow' : 'asked', forced3d: false };
  else if (asked === '3d') decided = { mode: '3d', reason: null, forced3d: true };
  else {
    const weak = weakDeviceReason();
    decided = weak ? { mode: 'simple', reason: weak, forced3d: false } : { mode: '3d', reason: null, forced3d: false };
  }
  return decided;
}

/** The address of this page in the given mode (the hash is kept, other params dropped). */
export function viewUrl(mode: ViewMode, why?: 'slow'): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('view', mode);
  if (why) url.searchParams.set('why', why);
  return url.toString();
}

/** Reloads into the simple version (frees the 3D scenes, workers and audio in one go). */
export function switchToSimple(why?: 'slow'): void {
  window.location.replace(viewUrl('simple', why));
}
