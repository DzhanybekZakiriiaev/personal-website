// Paint worker: paints a planet's colour and bump maps on an OffscreenCanvas with
// the same code the page uses (surfacePaint.ts) and hands them back as
// ImageBitmaps (transferred, no copy). Started by prepaintSurfaces in surfaces.ts.
import type { SurfaceImageName } from './spec';
import type { WorkerFont, WorkerReply, WorkerRequest } from './surfaces';
import { FONT, KINDS_WITH_TEXT, paintMaps, type PaintImages } from './surfacePaint';

// The page's tsconfig types the DOM, not workers; this is all the worker scope we use.
interface PaintScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply, transfer?: Transferable[]): void;
  fonts?: FontFaceSet;
}
const scope = self as unknown as PaintScope;

let photos: Promise<PaintImages> | null = null;
let fontState: Promise<boolean> | null = null;

function decodePhotos(blobs: Record<SurfaceImageName, Blob>): Promise<PaintImages> {
  if (!photos) {
    const names = Object.keys(blobs) as SurfaceImageName[];
    photos = Promise.all(names.map((n) => createImageBitmap(blobs[n]))).then((bitmaps) => {
      const out = {} as PaintImages;
      names.forEach((n, i) => {
        out[n] = bitmaps[i];
      });
      return out;
    });
  }
  return photos;
}

const SAMPLE = 'WIN! 1st! hack! 8x';

/** True when canvas text in this worker really uses the web font (not a fallback). */
function fontActive(): boolean {
  const ctx = new OffscreenCanvas(8, 8).getContext('2d');
  if (!ctx) return false;
  ctx.font = `700 40px ${FONT}`;
  const withFont = ctx.measureText(SAMPLE).width;
  ctx.font = '700 40px sans-serif';
  return Math.abs(withFont - ctx.measureText(SAMPLE).width) > 0.5;
}

function loadFont(font: WorkerFont | null): Promise<boolean> {
  if (!fontState) {
    fontState = (async () => {
      const fonts = scope.fonts;
      if (!font || !fonts || typeof FontFace === 'undefined') return false;
      const face = new FontFace(font.family, font.source, {
        weight: font.weight,
        ...(font.unicodeRange ? { unicodeRange: font.unicodeRange } : {}),
      });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('font timeout')), 4000));
      await Promise.race([face.load(), timeout]);
      fonts.add(face);
      return fontActive();
    })().catch(() => false);
  }
  return fontState;
}

scope.onmessage = (event) => {
  const { id, kind, size, photos: blobs, font } = event.data;
  void (async () => {
    try {
      const [images, fontOk] = await Promise.all([
        decodePhotos(blobs),
        KINDS_WITH_TEXT.includes(kind) ? loadFont(font) : Promise.resolve(true),
      ]);
      // Text in a fallback font would change the look: let the page paint this one.
      if (!fontOk) throw new Error('canvas font unavailable in worker');
      const { map, bump } = paintMaps(kind, images, size);
      if (!(map instanceof OffscreenCanvas) || !(bump instanceof OffscreenCanvas)) throw new Error('no OffscreenCanvas');
      const mapBitmap = map.transferToImageBitmap();
      const bumpBitmap = bump.transferToImageBitmap();
      scope.postMessage({ id, ok: true, map: mapBitmap, bump: bumpBitmap }, [mapBitmap, bumpBitmap]);
    } catch (error) {
      scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
};
