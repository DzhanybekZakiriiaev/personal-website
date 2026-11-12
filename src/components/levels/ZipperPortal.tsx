import './zipper.css';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from 'motion/react';
import type { ZipperPortalProps } from './types';

// A level opens out of the zipper pocket on the planet: warm light pours out,
// then the level page rises out of it. The page is the inside of an opened jeans
// pocket (denim, double gold topstitching, copper rivets
// and a leather label) with the level's details pinned
// into it as craft pieces. The pieces themselves are styled in zipper.css.
// Closing sends the pocket back to the planet and the light contracts after it.

/* ---------------------------------------------------------
   Timeline (seconds)
   --------------------------------------------------------- */
const LIGHT_IN = 0.45; // light floods out of the pocket
const CARD_AT = 0.36; // pocket starts rising (slightly before the light settles)
const CARD_IN = 0.35; // pocket rises with a little overshoot
const CARD_OUT = 0.24; // pocket shrinks back toward the planet
const LIGHT_OUT_AT = 0.1; // light starts contracting
const LIGHT_OUT = 0.3; // light contracts back into the pocket
const FADE = 0.15; // reduced motion: plain fades
const INTRO_MS = 2600; // the pieces' drop-in show (CSS) is over by then

const EASE_OUT: [number, number, number, number] = [0.2, 0.7, 0.3, 1];
const EASE_IN: [number, number, number, number] = [0.5, 0, 0.75, 0];
const EASE_RISE: [number, number, number, number] = [0.34, 1.45, 0.64, 1];

// Root padding on wide screens, mirrored from zipper.css, so the pocket can start
// exactly at the planet. On phones (see COMPACT in zipper.css) it is full-screen.
const PAD_TOP = 28;
const PAD_BOTTOM = 40;
const isCompact = (w: number, h: number) => w <= 600 || h <= 500;

const DEFAULT_ACCENT = '#c8146a';

// Cut-paper tag with irregular clipped corners, in a 0..100 box stretched to the button.
const TAG_POINTS = '5,0 93,2 100,24 100,82 95,100 7,97 0,76 0,20';

/** Where the light comes from, in viewport px, and how far it has to reach. */
interface Geometry {
  ox: number;
  oy: number;
  /** Distance from the pocket to the farthest viewport corner. */
  reach: number;
  /** Offset from the dialog's resting centre to the pocket. */
  dx: number;
  dy: number;
}

/* ---------------------------------------------------------
   Variants: "closed" is both the starting and the exit state
   --------------------------------------------------------- */
const rootFull: Variants = {
  closed: { opacity: 0, transition: { delay: LIGHT_OUT_AT + LIGHT_OUT - 0.06, duration: 0.08 } },
  open: { opacity: 1, transition: { duration: 0.01 } },
};

const rootReduced: Variants = {
  closed: { opacity: 0, transition: { duration: FADE } },
  open: { opacity: 1, transition: { duration: FADE } },
};

const glowFull: Variants = {
  closed: {
    scale: 0.03,
    opacity: 0,
    transition: {
      default: { delay: LIGHT_OUT_AT, duration: LIGHT_OUT, ease: EASE_IN },
      opacity: { delay: LIGHT_OUT_AT + LIGHT_OUT * 0.6, duration: LIGHT_OUT * 0.4 },
    },
  },
  open: {
    scale: 1,
    opacity: 1,
    transition: {
      default: { duration: LIGHT_IN, ease: EASE_OUT },
      opacity: { duration: 0.12 },
    },
  },
};

const raysFull: Variants = {
  closed: { scale: 0.2, opacity: 0, transition: { duration: LIGHT_OUT_AT + LIGHT_OUT * 0.6, ease: EASE_IN } },
  open: {
    scale: 1,
    opacity: 1,
    transition: {
      default: { duration: LIGHT_IN + 0.15, ease: EASE_OUT },
      opacity: { delay: 0.05, duration: 0.4 },
    },
  },
};

const motesFull: Variants = {
  closed: { opacity: 0, transition: { duration: 0.15 } },
  open: { opacity: 1, transition: { delay: 0.2, duration: 0.4 } },
};

// Warm glow right behind the pocket.
const haloFull: Variants = {
  closed: { opacity: 0, transition: { duration: 0.2 } },
  open: { opacity: 1, transition: { delay: CARD_AT, duration: 0.4 } },
};

const dialogFull: Variants = {
  closed: (g: Geometry) => ({
    x: g.dx,
    y: g.dy,
    scale: 0.5,
    rotate: -8,
    opacity: 0,
    transition: {
      default: { duration: CARD_OUT, ease: EASE_IN },
      opacity: { delay: CARD_OUT * 0.5, duration: CARD_OUT * 0.5 },
    },
  }),
  open: {
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: {
      default: { delay: CARD_AT, duration: CARD_IN, ease: EASE_RISE },
      opacity: { delay: CARD_AT, duration: 0.14 },
    },
  },
};

const dialogReduced: Variants = {
  closed: { opacity: 0, transition: { duration: FADE } },
  open: { opacity: 1, transition: { duration: FADE, delay: 0.05 } },
};

// A few dust motes drifting in the light (percent of the viewport, px, seconds).
const MOTES = [
  { left: 14, top: 24, size: 7, dx: 26, dy: -70, dur: 7.5, delay: -1.2 },
  { left: 27, top: 70, size: 5, dx: -18, dy: -90, dur: 9, delay: -4 },
  { left: 41, top: 12, size: 4, dx: 30, dy: -40, dur: 6.5, delay: -2.5 },
  { left: 63, top: 80, size: 6, dx: 20, dy: -110, dur: 10, delay: -6 },
  { left: 77, top: 30, size: 8, dx: -28, dy: -60, dur: 8, delay: -3.1 },
  { left: 89, top: 58, size: 5, dx: -16, dy: -80, dur: 7, delay: -0.6 },
  { left: 53, top: 46, size: 4, dx: 22, dy: -70, dur: 11, delay: -7.5 },
  { left: 8, top: 86, size: 6, dx: 34, dy: -95, dur: 9.5, delay: -5.2 },
];

// Felt confetti stars that puff out of the pocket mouth (px, degrees, seconds).
const STARS = [
  { dx: -170, dy: -80, r: -50, size: 22, color: '#ffd23f', delay: 0 },
  { dx: -105, dy: -135, r: 35, size: 18, color: '#ff7ab4', delay: 0.04 },
  { dx: -35, dy: -115, r: -25, size: 15, color: '#5ad6e4', delay: 0.08 },
  { dx: 30, dy: -150, r: 55, size: 20, color: '#fff3d6', delay: 0.02 },
  { dx: 105, dy: -120, r: -40, size: 22, color: '#f08a24', delay: 0.06 },
  { dx: 175, dy: -70, r: 30, size: 17, color: '#9be27a', delay: 0.1 },
  { dx: -225, dy: -25, r: 65, size: 15, color: '#c8a2ff', delay: 0.12 },
  { dx: 230, dy: -20, r: -60, size: 16, color: '#ffd23f', delay: 0.09 },
];

/* ---------------------------------------------------------
   Page-level side effects while the portal is open
   --------------------------------------------------------- */
const PORTAL_ATTR = 'data-zipper-portal';

function lockBodyScroll() {
  const { body, documentElement } = document;
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  return () => {
    body.style.overflow = previous.overflow;
    body.style.paddingRight = previous.paddingRight;
  };
}

// Everything else on the page becomes inert, so neither Tab nor a screen
// reader's virtual cursor can wander behind the dialog.
function makeBackgroundInert() {
  const changed: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el.hasAttribute(PORTAL_ATTR) || el.hasAttribute('inert')) continue;
    if (el instanceof HTMLScriptElement || el instanceof HTMLStyleElement || el instanceof HTMLLinkElement) continue;
    el.setAttribute('inert', '');
    changed.push(el);
  }
  return () => changed.forEach((el) => el.removeAttribute('inert'));
}

function useModalEnvironment(open: boolean) {
  // Layout effect: runs before the dialog's own effect moves focus inside,
  // so `previous` is still the element that opened the portal.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const previous =
      active instanceof HTMLElement && active !== document.body && !active.closest(`[${PORTAL_ATTR}]`)
        ? active
        : null;
    const unlockScroll = lockBodyScroll();
    const restoreInert = makeBackgroundInert();
    return () => {
      restoreInert();
      unlockScroll();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function getGeometry(origin: ZipperPortalProps['origin'], w: number, h: number): Geometry {
  const ox = Math.min(Math.max(origin?.x ?? w / 2, 0), w);
  const oy = Math.min(Math.max(origin?.y ?? h / 2, 0), h);
  const reach = Math.max(
    Math.hypot(ox, oy),
    Math.hypot(w - ox, oy),
    Math.hypot(ox, h - oy),
    Math.hypot(w - ox, h - oy),
  );
  const centreY = isCompact(w, h) ? h / 2 : (PAD_TOP + h - PAD_BOTTOM) / 2;
  return { ox, oy, reach, dx: ox - w / 2, dy: oy - centreY };
}

/** A square of radius `r` centred on the pocket. */
function circleAt(g: Geometry, r: number): CSSProperties {
  return { left: g.ox - r, top: g.oy - r, width: r * 2, height: r * 2 };
}

/* ---------------------------------------------------------
   Focus trap
   --------------------------------------------------------- */
const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    // getClientRects() is empty for anything not rendered, such as the body of a closed <details>.
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

function isBefore(a: Node, b: Node) {
  return a !== b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

// The heading is part of the cycle so keyboard users can always get back into
// the scrolling content (arrow keys scroll the box around the focused element).
function trapTab(event: ReactKeyboardEvent, dialog: HTMLElement, heading: HTMLElement | null) {
  const stops = heading ? [heading, ...tabbablesIn(dialog)] : tabbablesIn(dialog);
  event.preventDefault();
  if (stops.length === 0) return;

  const back = event.shiftKey;
  const active = document.activeElement;
  const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;
  let next: HTMLElement | undefined;

  if (index >= 0) {
    next = stops[(index + (back ? -1 : 1) + stops.length) % stops.length];
  } else if (active && dialog.contains(active)) {
    // Focus is on a container (the dialog or the scroll box): continue in document order.
    next = back
      ? [...stops].reverse().find((el) => isBefore(el, active))
      : stops.find((el) => isBefore(active, el));
  }
  next ??= back ? stops[stops.length - 1] : stops[0];
  next.focus();
}

/* ---------------------------------------------------------
   Decorative pieces
   --------------------------------------------------------- */

// Denim, double topstitching, fray and rivets: everything that makes the pocket.
function PocketCloth() {
  return (
    <>
      <span className="zp-denim" aria-hidden="true">
        <svg className="zp-ts zp-ts--outer" focusable="false">
          <rect x="1.1" y="1.1" width="100%" height="100%" rx="14" />
        </svg>
        <svg className="zp-ts zp-ts--inner" focusable="false">
          <rect x="1.1" y="1.1" width="100%" height="100%" rx="9" />
        </svg>
        <span className="zp-fray" />
      </span>
      <span className="zp-rivet zp-rivet--tl" aria-hidden="true" />
      <span className="zp-rivet zp-rivet--tr" aria-hidden="true" />
      <span className="zp-rivet zp-rivet--bl" aria-hidden="true" />
      <span className="zp-rivet zp-rivet--br" aria-hidden="true" />
    </>
  );
}

/* ---------------------------------------------------------
   The dialog itself (mounted only while AnimatePresence keeps it)
   --------------------------------------------------------- */
function ZipperDialog({
  origin,
  kicker,
  art,
  color,
  title,
  meta,
  onClose,
  children,
}: Omit<ZipperPortalProps, 'open' | 'onExited'>) {
  const isPresent = useIsPresent();
  const reduce = useReducedMotion() === true;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { w, h } = useViewportSize();
  const geo = getGeometry(origin, w, h);

  // The drop-in show (zipper.css, .zp-pocket--intro) runs on the first open only,
  // so content that swaps in later (e.g. "Working on it") appears straight away.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Focus goes to the heading right away; the scrolling box around it then
  // answers arrow keys and Page Up/Down.
  useEffect(() => {
    if (isPresent) headingRef.current?.focus({ preventScroll: true });
  }, [isPresent]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      trapTab(event, dialogRef.current, headingRef.current);
    }
    // Keys pressed in the dialog belong to it, not to page shortcuts behind it.
    event.stopPropagation();
  };

  return (
    <motion.div
      className="zp-root"
      data-zipper-portal=""
      inert={!isPresent}
      initial="closed"
      animate="open"
      exit="closed"
      variants={reduce ? rootReduced : rootFull}
    >
      {/* The light doubles as the backdrop: clicking it closes the portal. */}
      <div className="zp-light" aria-hidden="true" onClick={onClose}>
        <motion.div
          className="zp-glow"
          style={circleAt(geo, geo.reach * 1.25)}
          variants={reduce ? undefined : glowFull}
        />
        <motion.div className="zp-rays" style={circleAt(geo, geo.reach)} variants={reduce ? undefined : raysFull}>
          <div className="zp-rays-spin" />
        </motion.div>
        <motion.div className="zp-halo" variants={reduce ? undefined : haloFull} />
        {reduce ? null : (
          <motion.div className="zp-motes" variants={motesFull}>
            {MOTES.map((m, i) => (
              <span
                key={i}
                className="zp-mote"
                style={
                  {
                    left: `${m.left}%`,
                    top: `${m.top}%`,
                    width: m.size,
                    height: m.size,
                    '--zp-dx': `${m.dx}px`,
                    '--zp-dy': `${m.dy}px`,
                    '--zp-dur': `${m.dur}s`,
                    '--zp-delay': `${m.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </motion.div>
        )}
      </div>

      <motion.div
        ref={dialogRef}
        className="zp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        custom={geo}
        variants={reduce ? dialogReduced : dialogFull}
      >
        <div
          className={['zp-pocket', art ? 'zp-pocket--art' : '', intro ? 'zp-pocket--intro' : ''].join(' ').trim()}
          style={{ '--zp-accent': color ?? DEFAULT_ACCENT } as CSSProperties}
        >
          <PocketCloth />

          {/* Leather label, like the one on the back of a pair of jeans */}
          <div className="zp-bar">
            <p className="zp-leather">{kicker ?? 'Level'}</p>
          </div>

          <div className="zp-scroll" tabIndex={-1}>
            <div className="zp-head">
              <h2 ref={headingRef} id={titleId} className="zp-title" tabIndex={-1}>
                <span className="zp-title-text">{title}</span>
              </h2>
              {meta ? <p className="zp-ribbon">{meta}</p> : null}
              {art ? (
                <div className="zp-art" aria-hidden="true">
                  {art}
                </div>
              ) : null}
            </div>
            <div className="zp-body">{children}</div>
          </div>

          <button type="button" className="zp-close" onClick={onClose}>
            <svg className="zp-close-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <polygon className="zp-ring-outer" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
              <polygon className="zp-ring-inner" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
              <polygon className="zp-close-paper" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
            </svg>
            <svg className="zp-close-stitch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <polygon points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="zp-close-text">Close</span>
            <kbd className="zp-key" aria-hidden="true">
              Esc
            </kbd>
          </button>
        </div>

        {reduce ? null : (
          <div className="zp-confetti" aria-hidden="true">
            {STARS.map((s, i) => (
              <span
                key={i}
                className="zp-star"
                style={
                  {
                    '--zp-dx': `${s.dx}px`,
                    '--zp-dy': `${s.dy}px`,
                    '--zp-r': `${s.r}deg`,
                    '--zp-s': `${s.size}px`,
                    '--zp-c': s.color,
                    '--zp-d': `${s.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function ZipperPortal(props: ZipperPortalProps) {
  const { open, origin, onExited, kicker, art, color, title, meta, onClose, children } = props;
  useModalEnvironment(open);

  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence onExitComplete={() => onExitedRef.current?.()}>
      {open ? (
        <ZipperDialog
          key="zipper-portal"
          origin={origin}
          kicker={kicker}
          art={art}
          color={color}
          title={title}
          meta={meta}
          onClose={onClose}
        >
          {children}
        </ZipperDialog>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
