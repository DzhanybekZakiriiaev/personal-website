import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { decideViewMode, switchToSimple, viewUrl } from '../lib/viewMode';
import './loading.css';

/** "Show the simple version" appears after this much time with the page on screen. */
const OFFER_SIMPLE_MS = 2500;
/** Still loading after this much on-screen time: switch to the simple version by itself. */
const AUTO_SIMPLE_MS = 9000;

/**
 * Offers the simple version once loading takes a while, and switches to it if it
 * takes much longer (not when the visitor asked for the 3D site with ?view=3d).
 * Only time with the page visible counts: a background tab is slow on purpose.
 */
function useSimpleFallback(active: boolean): boolean {
  const [offer, setOffer] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const forced3d = decideViewMode().forced3d;
    let shown = document.hidden ? 0 : performance.now(); // since the page opened
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      if (!document.hidden) shown += now - last;
      last = now;
      if (shown >= OFFER_SIMPLE_MS) setOffer(true);
      if (shown >= AUTO_SIMPLE_MS && !forced3d) switchToSimple('slow');
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active]);
  return offer;
}

const LINES = [
  'Knitting the oceans…',
  'Sewing on the continents…',
  'Sticking on the stickers…',
  'Ironing the felt…',
  'Untangling the yarn…',
  'Polishing the trophy…',
  'Teaching the doll to dance…',
  'Counting the stitches…',
];
const LINE_MS = 1300; // one status line per loading-pop cycle (loading.css)

const R = 92; // radius of the stitch ring
const RING = 2 * Math.PI * R;

// When the boot splash's CSS animations started (performance.now() time), if
// index.html's splash was on screen before React. null = no splash.
let bootClock: number | null = null;

/**
 * Call once before React's first render (main.tsx). Notes the phase of the boot
 * splash's animations, so <LoadingScreen> picks them up exactly where the static
 * splash was: the bobbing planet, rolling yarn and needle never jump.
 */
export function adoptBootSplash(): void {
  try {
    const splash = document.getElementById('boot-splash');
    if (!splash || typeof splash.getAnimations !== 'function') return;
    for (const animation of splash.getAnimations({ subtree: true })) {
      const t = animation.currentTime;
      if (typeof t === 'number') {
        bootClock = performance.now() - t;
        return;
      }
    }
  } catch {
    // No phase to keep: the loading screen simply starts its animations fresh.
  }
}

/** Eases the shown progress towards the real one, so the needle glides instead of jumping. */
function useSmoothProgress(target: number, instant: boolean): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (instant || target >= 1 || target < shownRef.current) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const gap = target - shownRef.current;
      const next = gap < 0.002 ? target : shownRef.current + Math.min(gap, Math.max(gap * (1 - Math.exp(-dt * 7)), dt * 0.12));
      shownRef.current = next;
      setShown(next);
      if (next < target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, instant]);

  return shown;
}

// Shown until everything is preloaded: a felt planet being stitched round its edge,
// the needle moving with the real progress, and a rotating silly status line.
export function LoadingScreen({ progress }: { progress: number }) {
  const reduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState(0);
  const target = Math.min(Math.max(progress, 0), 1);
  // While fading out the job is done: show it finished.
  const smooth = useSmoothProgress(isPresent ? target : 1, Boolean(reduceMotion) || !isPresent);
  const pct = Math.round(smooth * 100);
  const angle = smooth * 360 - 90; // start at the top
  const offerSimple = useSimpleFallback(isPresent);

  // Take over from the boot splash (React has already replaced #root's content) and
  // continue its CSS animations from the same phase.
  useLayoutEffect(() => {
    document.getElementById('boot-splash')?.remove();
    document.getElementById('boot-backdrop')?.remove();
    const root = rootRef.current;
    if (bootClock === null || !root || typeof root.getAnimations !== 'function') return;
    const t = performance.now() - bootClock;
    for (const animation of root.getAnimations({ subtree: true })) {
      if ('animationName' in animation) animation.currentTime = t; // CSS animations only
    }
  }, []);

  // Status line: changes at the start of each loading-pop cycle, while it is invisible.
  useEffect(() => {
    if (reduceMotion) return undefined;
    const origin = bootClock ?? performance.now();
    const base = Math.floor((performance.now() - origin) / LINE_MS);
    let id = 0;
    const schedule = () => {
      const elapsed = performance.now() - origin;
      id = window.setTimeout(tick, LINE_MS - (elapsed % LINE_MS) + 4);
    };
    const tick = () => {
      const k = Math.floor((performance.now() - origin) / LINE_MS) - base;
      setLine(((k % LINES.length) + LINES.length) % LINES.length);
      schedule();
    };
    schedule();
    return () => window.clearTimeout(id);
  }, [reduceMotion]);

  return (
    <motion.div
      ref={rootRef}
      className="loading"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.55, ease: 'easeInOut' }}
    >
      {/* The progress bar is the planet alone: a progressbar's content is hidden from
          screen readers, and the simple-version link below must stay reachable. */}
      <div
        className="loading-stage"
        role="progressbar"
        aria-label="Loading the planets"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(target * 100)}
      >
        <span className="loading-yarn" />
        <div className="loading-planet">
          <svg viewBox="0 0 240 240" className="loading-art">
            <defs>
              <clipPath id="loading-clip">
                <circle cx="120" cy="120" r="86" />
              </clipPath>
              <mask id="loading-sewn">
                <circle
                  cx="120"
                  cy="120"
                  r={R}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - smooth)}
                  transform="rotate(-90 120 120)"
                />
              </mask>
            </defs>
            <g clipPath="url(#loading-clip)">
              <circle cx="120" cy="120" r="86" className="loading-ocean" />
              <path className="loading-land" d="M58 92c14-22 46-26 60-10 10 12 0 30-16 34-12 3-14 22-28 24-16 2-24-16-22-30 1-8-2-12 6-18z" />
              <path className="loading-land loading-land--2" d="M132 60c20-10 46-2 54 16 6 14-6 26-22 26-12 0-18 12-30 8-12-4-16-20-12-32 2-8 2-14 10-18z" />
              <path className="loading-land loading-land--3" d="M128 150c14-8 34-2 38 12 4 16-10 26-24 24-12-2-22-10-22-22 0-6 2-10 8-14z" />
              <circle cx="120" cy="120" r="86" className="loading-shade" />
            </g>
            <circle cx="120" cy="120" r={R} className="loading-guide" />
            <circle cx="120" cy="120" r={R} className="loading-stitch" mask="url(#loading-sewn)" />
            <g
              transform={`translate(${(120 + R * Math.cos((angle * Math.PI) / 180)).toFixed(2)} ${(120 + R * Math.sin((angle * Math.PI) / 180)).toFixed(2)}) rotate(${(angle + 90).toFixed(1)})`}
            >
              <path className="loading-thread" d="M0 0c-8 10-4 18-16 26" />
              <g className="loading-needle">
                <path d="M-3 -26 L3 -26 L1.2 18 L0 26 L-1.2 18 Z" />
                <ellipse cx="0" cy="-19" rx="1.3" ry="4" className="loading-needle-eye" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div className="loading-tag">
        <p className="loading-title">Stitching your planets</p>
        <p className="loading-line" aria-hidden="true">
          {reduceMotion ? 'Almost there…' : LINES[line]}
        </p>
        <p className="loading-pct" aria-hidden="true">
          {pct}%
        </p>
      </div>

      {offerSimple ? (
        <a className="loading-skip" href={viewUrl('simple')}>
          Taking a while? <strong>Show the simple version</strong>
        </a>
      ) : null}
    </motion.div>
  );
}
