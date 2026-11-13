import './levels.css';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import type { PlanetKind } from '../../content';
import { getFocusGlobe, getFocusTarget, setFocusGlobe, setFocusTarget, type FocusGlobe } from '../../lib/scene';
import { setPilotTarget } from '../../lib/pilot';
import { FRONT_SPOT, type GlobeBadge } from '../../three/spec';
import { ICONS } from '../icons';
import { PinkRing } from '../PinkRing';
import { Sticker } from '../Sticker';
import { WorkingOnIt } from './WorkingOnIt';
import { ZipperPortal } from './ZipperPortal';
import type { LevelAction, LevelItem } from './types';

/* ---------------------------------------------------------
   Constants
   --------------------------------------------------------- */
const TILTS = [-6, 5, -3, 7, -5, 3, -8, 4];

// Safety nets in case the globe or the portal never reports back (no WebGL, an
// older build of either): the flow carries on after this long.
const POCKET_OPEN_FALLBACK_MS = 2500;
const PORTAL_EXIT_FALLBACK_MS = 2500;
// How long the globe's pocket takes to unzip and to zip shut (Globe3D OPEN_S, CLOSE_S),
// so the pilot rocket's dive lines up with it.
const POCKET_OPEN_MS = 1000;
const POCKET_CLOSE_MS = 700;

// Elements that already have their own use for Enter or the arrow keys.
const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="tab"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',');

/*
 * Speech-bubble arrow, in units of the globe box (0..100, the box is square).
 * The bubble sits above the sphere's top-right (bottom edge at y = 4, see
 * levels.css); the arrow leaves it at ARROW_START and hooks down into the selected
 * badge, stopping BADGE_GAP short of its centre. The globe reports where that badge
 * is every frame (it moves while you turn the planet), so the arrow always points
 * right at it; at rest the badge sits on FRONT_SPOT.
 */
const BADGE_GAP = 10;
const ARROW_START = { x: 70, y: 2.5 };
// The shaft comes in from this point's direction (45 degrees from upper right at FRONT_SPOT).
const ARROW_FROM = { x: 67.5, y: 16.5 };

function arrowPaths(bx: number, by: number): { shaft: string; head: string } {
  const cx = bx * 100;
  const cy = by * 100;
  let ux = ARROW_FROM.x - cx;
  let uy = ARROW_FROM.y - cy;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const tx = cx + BADGE_GAP * ux;
  const ty = cy + BADGE_GAP * uy;
  // a point `along` units back up the arrow from the tip, `across` units to its side
  const at = (along: number, across = 0) =>
    `${(tx + along * ux - across * uy).toFixed(2)} ${(ty + along * uy + across * ux).toFixed(2)}`;
  return {
    shaft: `M${ARROW_START.x} ${ARROW_START.y} C73 10 ${at(10.4)} ${at(2.4)}`,
    head: `${at(0)} ${at(3.2, 2)} ${at(3.2, -2)}`,
  };
}

const RESTING_ARROW = arrowPaths(FRONT_SPOT.x, FRONT_SPOT.y);

/** Where the selected badge is on the planet box (fractions), as the globe last reported it. */
interface BadgePoint {
  x: number;
  y: number;
  visible: boolean;
}

function createPointStore() {
  let value: BadgePoint = { x: FRONT_SPOT.x, y: FRONT_SPOT.y, visible: true };
  const listeners = new Set<(point: BadgePoint) => void>();
  return {
    get: () => value,
    set(x: number, y: number, visible: boolean) {
      value = { x, y, visible };
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener: (point: BadgePoint) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type PointStore = ReturnType<typeof createPointStore>;

// Cut-paper tag with irregular clipped corners, in a 0..100 box stretched to the button.
const TAG_POINTS = '5,0 93,2 100,24 100,82 95,100 7,97 0,76 0,20';

// Arrow-shaped side tab (points left; the "next" one is mirrored in CSS). 46 x 64 px.
const SIDE_PATH = 'M20 3H40Q44 3 44 7V57Q44 61 40 61H20L4 35Q1.5 32 4 29Z';
const SIDE_STITCH = 'M21.5 8H38Q39.5 8 39.5 9.5V54.5Q39.5 56 38 56H21.5L9 34Q7.8 32 9 30Z';

// Ribbon rosette pleats: a zigzag ring.
function zigzag(cx: number, cy: number, outer: number, inner: number, points: number, offset: number): string {
  const step = Math.PI / points;
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i + offset) * step - Math.PI / 2;
    coords.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${coords.join(' L')}Z`;
}

const PLEATS_BACK = zigzag(60, 54, 53, 43, 24, 0);
const PLEATS_FRONT = zigzag(60, 54, 46, 37, 24, 1);

const cardMotion: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40, rotate: dir * 3 }),
  center: { opacity: 1, x: 0, rotate: 0, transition: { type: 'spring', stiffness: 460, damping: 34 } },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -40,
    rotate: dir * -3,
    transition: { duration: 0.14, ease: 'easeIn' },
  }),
};

/* ---------------------------------------------------------
   Decorative pieces
   --------------------------------------------------------- */

// The level's sticker: its hackathon logo on a white die-cut disc ringed in the
// level's colour, or the icon sticker (also the fallback if the logo fails to load).
function LevelSticker({ item, size, tilt }: { item: LevelItem; size: number; tilt: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = item.logo;

  if (!logo || failed === logo) {
    return <Sticker icon={item.icon} color={item.color} size={size} tilt={tilt} />;
  }

  const style = { '--s': `${size}px`, '--tilt': `${tilt}deg`, '--item-color': item.color } as CSSProperties;
  return (
    <span className="sticker levels-logo" style={style} aria-hidden="true">
      <span className="levels-logo-disc">
        <img src={logo} alt="" draggable={false} decoding="async" onError={() => setFailed(logo)} />
      </span>
    </span>
  );
}

// Pink ribbon rosette with the level's logo (or icon) in the middle, for wins.
function Rosette({ item }: { item: LevelItem }) {
  const [failed, setFailed] = useState<string | null>(null);
  const clipId = `levels-rosette-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const logo = item.logo && failed !== item.logo ? item.logo : null;

  return (
    <svg className="levels-rosette" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      <path d="M48 76 L30 138 L41 129 L49 143 L64 82Z" fill="#8e0c4b" />
      <path d="M72 76 L90 138 L79 129 L71 143 L56 82Z" fill="#a8105a" />
      <path d="M55 84 L39 134 M65 84 L81 134" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" fill="none" />
      <path d={PLEATS_BACK} fill="#c8146a" stroke="#8e0c4b" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={PLEATS_FRONT} fill="#ec4f97" stroke="#b0125d" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="60" cy="54" r="33" fill="#fffdf7" />
      {logo ? (
        <>
          <circle cx="60" cy="54" r="31" fill="none" stroke="#c8146a" strokeWidth="1.2" strokeDasharray="3.5 2.5" />
          <circle cx="60" cy="54" r="27" fill="#ffffff" stroke={item.color} strokeWidth="2.2" />
          <clipPath id={clipId}>
            <circle cx="60" cy="54" r="25.5" />
          </clipPath>
          <image
            href={logo}
            x="42"
            y="36"
            width="36"
            height="36"
            preserveAspectRatio="xMidYMid meet"
            clipPath={`url(#${clipId})`}
            onError={() => setFailed(logo)}
          />
        </>
      ) : (
        <>
          <circle cx="60" cy="54" r="29.6" fill="none" stroke="#c8146a" strokeWidth="1.6" strokeDasharray="3.5 2.5" />
          <g transform="translate(32 26) scale(0.875)">
            <circle cx="32" cy="32" r="29" fill={item.color} />
            {ICONS[item.icon]}
          </g>
        </>
      )}
    </svg>
  );
}

// The cream tag's paper, its focus ring and the stitch that shows on hover/focus.
function TagArt() {
  return (
    <span className="levels-tag-art" aria-hidden="true">
      <svg className="levels-tag-shape" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        <polygon className="levels-ring-outer" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
        <polygon className="levels-ring-inner" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
        <polygon className="levels-tag-paper" points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
      </svg>
      <svg className="levels-tag-stitch" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
        <polygon points={TAG_POINTS} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

function SideTabArt() {
  return (
    <svg className="levels-side-shape" viewBox="0 0 46 64" aria-hidden="true" focusable="false">
      <path className="levels-ring-outer" d={SIDE_PATH} />
      <path className="levels-ring-inner" d={SIDE_PATH} />
      <path className="levels-side-paper" d={SIDE_PATH} />
      <path className="levels-side-stitch" d={SIDE_STITCH} />
    </svg>
  );
}

/*
 * Things the speech bubble must never cover: the page header's pieces and the
 * level card. When it would (a narrow phone, a short laptop window, a long title),
 * fitBubble first nudges it sideways, then steps it down (levels.css, data-fit),
 * until it is clear.
 */
const BUBBLE_OBSTACLES = [
  '.section-header .title-bubble',
  '.section-header .title-patch',
  '.section-header .back-bubble',
  '.section-header .section-sound',
  '.levels-card',
];
const BUBBLE_GAP = 6; // px of clear space it keeps
const MAX_FIT = 5;
// Sideways nudges (px) tried before shrinking, nearest first.
const BUBBLE_SHIFTS = [0, -14, 14, -28, 28, -44, 44];

function fitBubble(bubble: HTMLElement) {
  const box = bubble.parentElement?.parentElement; // bubble layer, then the globe box
  if (!box) return;
  const b = box.getBoundingClientRect();
  if (b.width <= 0) return;
  const obstacles = BUBBLE_OBSTACLES.flatMap((sel) => [...document.querySelectorAll(sel)])
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  // the arrow leaves the bubble here, so the bubble must keep covering it
  const arrowX = b.left + (b.width * ARROW_START.x) / 100;
  const viewRight = document.documentElement.clientWidth;
  // Layout boxes (offset*), not getBoundingClientRect: the bubble may be mid pop-in (scaled).
  const clear = (shift: number) => {
    const left = b.left + bubble.offsetLeft + shift;
    const top = b.top + bubble.offsetTop;
    const right = left + bubble.offsetWidth;
    const bottom = top + bubble.offsetHeight;
    if (left > arrowX - 16 || right < arrowX + 16 || left < 4 || right > viewRight - 4) return false;
    return obstacles.every(
      (o) => right + BUBBLE_GAP <= o.left || o.right + BUBBLE_GAP <= left || bottom + BUBBLE_GAP <= o.top || o.bottom + BUBBLE_GAP <= top,
    );
  };
  // Full size first, nudged sideways if that clears it; only then smaller.
  for (let level = 0; level <= MAX_FIT; level += 1) {
    bubble.dataset.fit = String(level);
    for (const shift of BUBBLE_SHIFTS) {
      if (clear(shift)) {
        bubble.style.setProperty('--shift', `${shift}px`);
        return;
      }
    }
  }
  bubble.style.setProperty('--shift', '0px');
}

// Cyan speech bubble above the globe's top-right, its arrow tip at the selected
// badge's edge wherever the badge is (the arrow follows it while the planet turns).
function LevelBubble({ item, hidden, reduce, points }: { item: LevelItem; hidden: boolean; reduce: boolean; points: PointStore }) {
  const arrowRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = arrowRef.current;
    if (!svg) return undefined;
    const shafts = svg.querySelectorAll('path');
    const heads = svg.querySelectorAll('polygon');
    const draw = ({ x, y, visible }: BadgePoint) => {
      const { shaft, head } = arrowPaths(x, y);
      shafts.forEach((el) => el.setAttribute('d', shaft));
      heads.forEach((el) => el.setAttribute('points', head));
      svg.style.opacity = visible ? '' : '0';
    };
    draw(points.get());
    return points.subscribe(draw);
  }, [points]);

  // Fit it around the header and the card once it shows, and again on resize.
  const bubbleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble || hidden) return undefined;
    const fit = () => fitBubble(bubble);
    fit();
    // the header may still be settling in: look again shortly
    const later = window.setTimeout(fit, 450);
    window.addEventListener('resize', fit);
    return () => {
      window.clearTimeout(later);
      window.removeEventListener('resize', fit);
    };
  }, [hidden]);

  return (
    <motion.div
      className="levels-bubble-layer"
      aria-hidden="true"
      style={{ transformOrigin: `${ARROW_START.x}% ${ARROW_START.y}%` }}
      initial={reduce ? false : { opacity: 0, scale: 0.55 }}
      animate={hidden ? { opacity: 0, scale: 0.85 } : { opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 24, delay: hidden ? 0 : 0.1 }}
    >
      <svg ref={arrowRef} className="levels-bubble-arrow" viewBox="0 0 100 100" focusable="false">
        <path className="levels-arrow-edge" d={RESTING_ARROW.shaft} vectorEffect="non-scaling-stroke" />
        <polygon className="levels-arrow-edge" points={RESTING_ARROW.head} vectorEffect="non-scaling-stroke" />
        <path className="levels-arrow-fill" d={RESTING_ARROW.shaft} vectorEffect="non-scaling-stroke" />
        <polygon className="levels-arrow-fill" points={RESTING_ARROW.head} vectorEffect="non-scaling-stroke" />
      </svg>
      <div ref={bubbleRef} className="levels-bubble" data-fit="0">
        <p className="levels-bubble-title">{item.title}</p>
        {item.meta ? <p className="levels-bubble-meta">{item.meta}</p> : null}
      </div>
    </motion.div>
  );
}

// The portal's big "Visit now!" tag.
function VisitTag({
  action,
  onSoon,
  buttonRef,
}: {
  action: LevelAction;
  onSoon: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="levels-visit-row">
      {action.kind === 'soon' ? (
        <button ref={buttonRef} type="button" className="levels-tag levels-tag--big" onClick={onSoon}>
          <TagArt />
          <span className="levels-tag-text">Visit now!</span>
        </button>
      ) : (
        <a className="levels-tag levels-tag--big" href={action.href} target="_blank" rel="noopener">
          <TagArt />
          <span className="levels-tag-text">{action.kind === 'live' ? 'Visit now!' : 'View the code on GitHub'}</span>
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   The planet view
   --------------------------------------------------------- */
interface Selection {
  index: number;
  /** Which way the card content slides: 1 = to the next level, -1 = back. */
  dir: 1 | -1;
}

/**
 * Opening a level:
 * idle -> opening (globe unzips the badge's pocket) -> open (portal grows out of the
 * pocket) -> closing (portal shrinks back into it) -> idle (globe zips it shut).
 */
type Phase = 'idle' | 'opening' | 'open' | 'closing';

interface PlanetLevelsProps {
  /** Which planet this is (the planet itself is the pod scene's focused planet). */
  planet: PlanetKind;
  items: LevelItem[];
  label: string;
  /** Keep the speech bubble tucked away (while the planet glides in or out). */
  hideBubble?: boolean;
  /** false while the page is on its way out: the page-wide keys stop working. */
  interactive?: boolean;
}

// A section's planet: the levels stuck on the pod scene's focused planet as badges
// (driven from here through lib/scene.ts; this component only holds a see-through box
// where that planet sits), a WAI-ARIA tablist of sticker tabs under it, an info card
// for the selected level (the tabpanel), and a zipper portal with the full details
// that opens out of a pocket on the planet.
export function PlanetLevels({ planet, items, label, hideBubble = false, interactive = true }: PlanetLevelsProps) {
  const reduce = useReducedMotion() === true;
  const [sel, setSel] = useState<Selection>({ index: 0, dir: 1 });
  const [phase, setPhase] = useState<Phase>('idle');
  const [origin, setOrigin] = useState<{ x: number; y: number } | undefined>(undefined);
  // Id of the level whose portal shows the "Working on it" screen instead of its details.
  const [soonId, setSoonId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // A different section: start again at its first level.
  const [shownItems, setShownItems] = useState(items);
  if (shownItems !== items) {
    setShownItems(items);
    setSel({ index: 0, dir: 1 });
    setPhase('idle');
    setSoonId(null);
    setAnnouncement('');
  }

  // The phase as of the latest event, for callbacks the globe may hold on to.
  const phaseRef = useRef<Phase>('idle');
  useLayoutEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const globeRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tablistRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const visitRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<'soon' | 'visit' | null>(null);
  // Where the selected badge is on the planet, reported by the globe every frame.
  const points = useMemo(createPointStore, []);
  const baseId = `levels-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const count = items.length;
  const index = count === 0 ? 0 : Math.min(sel.index, count - 1);
  const item: LevelItem | undefined = items[index];
  const showSoon = item !== undefined && soonId === item.id;
  const busy = phase !== 'idle';

  const badges = useMemo<GlobeBadge[]>(
    () =>
      items.map((it) => ({
        id: it.id,
        icon: it.icon,
        color: it.color,
        style: it.badgeStyle ?? 'sticker',
        title: it.title,
        logo: it.logo,
      })),
    [items],
  );

  const move = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // The selection stays put while a pocket is open or opening.
  const select = useCallback((next: number) => {
    if (phaseRef.current !== 'idle') return;
    setSel((s) => (next === s.index ? s : { index: next, dir: next > s.index ? 1 : -1 }));
  }, []);

  // Previous / Next (side tabs and the global arrow keys). Announced, because focus stays put.
  const step = useCallback(
    (dir: 1 | -1) => {
      if (count === 0 || phaseRef.current !== 'idle') return;
      const next = (index + dir + count) % count;
      setSel({ index: next, dir });
      setAnnouncement(`${items[next].title}, ${next + 1} of ${count}`);
    },
    [count, index, items],
  );

  // Open, Enter on a tab, or the page-wide Enter. Repeat presses are ignored until the
  // level is closed again. Every opening starts on the details. (Resetting here rather
  // than on close keeps them from flashing back in while the portal closes.)
  const startOpen = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setSoonId(null);
    move('opening');
  }, [move]);

  // Clicking a badge on the planet opens it: the selected one opens straight away,
  // another one is turned to the front first, then opens.
  const indexRef = useRef(index);
  indexRef.current = index;
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const clickBadge = useCallback(
    (next: number) => {
      if (phaseRef.current !== 'idle') return;
      window.clearTimeout(clickTimer.current);
      if (next === indexRef.current) {
        startOpen();
        return;
      }
      select(next);
      clickTimer.current = window.setTimeout(startOpen, 650);
    },
    [select, startOpen],
  );

  // The pocket is open: grow the portal out of it.
  const onPocketOpened = useCallback(() => {
    if (phaseRef.current !== 'opening') return;
    const box = globeRef.current?.getBoundingClientRect();
    if (box) setOrigin({ x: box.left + box.width * FRONT_SPOT.x, y: box.top + box.height * FRONT_SPOT.y });
    // The portal hands focus back to whatever had it when it opened: make that Open.
    openRef.current?.focus({ preventScroll: true });
    move('open');
  }, [move]);

  const closePortal = useCallback(() => {
    if (phaseRef.current === 'open') move('closing');
  }, [move]);

  // The portal is back in the pocket: zip it shut.
  const onPortalExited = useCallback(() => {
    if (phaseRef.current === 'closing') move('idle');
  }, [move]);

  useEffect(() => {
    if (phase === 'opening') {
      const id = window.setTimeout(onPocketOpened, POCKET_OPEN_FALLBACK_MS);
      return () => window.clearTimeout(id);
    }
    if (phase === 'closing') {
      const id = window.setTimeout(onPortalExited, PORTAL_EXIT_FALLBACK_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase, onPocketOpened, onPortalExited]);

  // The planet is the pod scene's focused planet: hand it the badges and the pocket.
  const published = useRef<FocusGlobe | null>(null);
  useLayoutEffect(() => {
    const mine: FocusGlobe = {
      badges,
      selected: index,
      onSelectBadge: clickBadge,
      pocketOpen: phase !== 'idle',
      onPocketOpened,
      // turning the planet by hand selects the badge that ends up nearest the front
      onCentre: select,
      onBadgePoint: points.set,
    };
    published.current = mine;
    setFocusGlobe(mine);
  }, [badges, index, clickBadge, phase, onPocketOpened, select, points]);
  useLayoutEffect(
    () => () => {
      if (getFocusGlobe() === published.current) setFocusGlobe(null);
    },
    [],
  );

  // The see-through globe box: the scene puts the focused planet exactly on it.
  const setGlobeBox = useCallback((el: HTMLDivElement | null) => {
    globeRef.current = el;
    if (!el) return undefined;
    setFocusTarget(el);
    return () => {
      globeRef.current = null;
      if (getFocusTarget() === el) setFocusTarget(null);
    };
  }, []);

  // The pilot rocket follows the level in: it dives into the opening pocket, loops by
  // the portal's anchor while the level is open, pops back out of the pocket as it
  // closes; then the scene sends it round the planet again (PlanetCarousel).
  useEffect(() => {
    if (phase === 'idle') return undefined;
    const badgeRect = () => {
      const box = globeRef.current?.getBoundingClientRect();
      if (!box) return null;
      const size = 60;
      const cx = box.left + box.width * FRONT_SPOT.x;
      const cy = box.top + box.height * FRONT_SPOT.y;
      return { left: cx - size / 2, top: cy - size / 2, width: size, height: size };
    };
    if (phase === 'opening' || phase === 'closing') {
      const rect = badgeRect();
      if (rect) setPilotTarget({ rect, mode: 'dive' }, { duration: phase === 'opening' ? POCKET_OPEN_MS : POCKET_CLOSE_MS });
      return undefined;
    }
    // open: the rocket waits (hidden) inside the pocket, so it pops back out of the
    // right spot when the page closes (again once settled, and on resize)
    const aimPortal = () => {
      const rect = badgeRect();
      if (rect) setPilotTarget({ rect, mode: 'portal' }, { instant: true });
    };
    const first = requestAnimationFrame(aimPortal);
    const settled = window.setTimeout(aimPortal, 500);
    window.addEventListener('resize', aimPortal);
    return () => {
      cancelAnimationFrame(first);
      window.clearTimeout(settled);
      window.removeEventListener('resize', aimPortal);
    };
  }, [phase]);

  const showWorkingOnIt = () => {
    if (!item) return;
    pendingFocus.current = 'soon';
    setSoonId(item.id);
  };

  const backToDetails = () => {
    pendingFocus.current = 'visit';
    setSoonId(null);
  };

  // Keep focus inside the portal when its content swaps. Opening "Working on it", the
  // screen focuses its own heading; coming back, focus returns to the Visit button.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'visit') visitRef.current?.focus();
  }, [showSoon]);

  // ← → choose and Enter opens from anywhere on the page that has no use for those keys
  // (nothing focused, the page heading, ...); ← → also work on the card's own buttons.
  useEffect(() => {
    if (count === 0 || busy || !interactive) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const interactive = target?.closest(INTERACTIVE) != null;
      const onCard = target != null && cardRef.current?.contains(target) === true;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (interactive && !onCard) return;
        event.preventDefault();
        step(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'Enter' && !interactive && !event.repeat && !event.isComposing) {
        event.preventDefault();
        startOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, busy, interactive, step, startOpen]);

  // Keep the selected tab in view when the row scrolls (small screens, many levels).
  useEffect(() => {
    const row = tablistRef.current;
    const tab = tabRefs.current[index];
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    const pad = 16;
    if (left - pad >= row.scrollLeft && right + pad <= row.scrollLeft + row.clientWidth) return;
    row.scrollTo({ left: left - (row.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [index, reduce]);

  if (!item) return null;

  const panelId = `${baseId}-panel`;
  const tabId = (i: number) => `${baseId}-tab-${i}`;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    let dir: 1 | -1;
    switch (event.key) {
      case 'ArrowRight':
        next = (i + 1) % count;
        dir = 1;
        break;
      case 'ArrowLeft':
        next = (i - 1 + count) % count;
        dir = -1;
        break;
      case 'Home':
        next = 0;
        dir = -1;
        break;
      case 'End':
        next = count - 1;
        dir = 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault(); // no click, no page scroll
        if (!event.repeat) startOpen();
        return;
      default:
        return;
    }
    event.preventDefault();
    if (busy) return;
    if (next !== i) setSel({ index: next, dir });
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="levels">
      <div className="levels-layout">
        <div className="levels-world">
          {/* The planet itself is drawn by the pod scene underneath, exactly on this box.
              Pointer users can pick badges on it; the tabs below carry the names. */}
          <div ref={setGlobeBox} className="levels-globe-box" data-planet={planet}>
            <LevelBubble key={item.id} item={item} hidden={busy || hideBubble} reduce={reduce} points={points} />
          </div>

          <div ref={tablistRef} role="tablist" aria-label={`${label} levels`} className="levels-tabs">
            {items.map((level, i) => {
              const isSelected = i === index;
              return (
                <button
                  key={level.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={tabId(i)}
                  aria-selected={isSelected}
                  aria-controls={panelId}
                  tabIndex={isSelected ? 0 : -1}
                  className="levels-tab"
                  onClick={() => select(i)}
                  onKeyDown={(event) => onTabKeyDown(event, i)}
                >
                  <span className="levels-tab-art">
                    <LevelSticker item={level} size={44} tilt={TILTS[i % TILTS.length]} />
                  </span>
                  {isSelected ? (
                    <span className="levels-tab-ring" aria-hidden="true">
                      <PinkRing />
                    </span>
                  ) : null}
                  <span className="visually-hidden">{level.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="levels-card-col">
          <div ref={cardRef} role="tabpanel" id={panelId} aria-labelledby={tabId(index)} className="levels-card">
            <AnimatePresence mode="wait" initial={false} custom={sel.dir}>
              <motion.div
                key={item.id}
                className="levels-card-content"
                custom={sel.dir}
                variants={cardMotion}
                initial={reduce ? false : 'enter'}
                animate="center"
                exit={reduce ? undefined : 'exit'}
              >
                <p className="levels-card-label">{item.kicker ?? label}</p>
                <div className="levels-polaroid" aria-hidden="true">
                  <span className="levels-tape levels-tape--l" />
                  <span className="levels-tape levels-tape--r" />
                  <span className="levels-photo" style={{ '--item-color': item.color } as CSSProperties}>
                    {item.badgeStyle === 'rosette' ? (
                      <Rosette item={item} />
                    ) : (
                      <LevelSticker item={item} size={78} tilt={-6} />
                    )}
                  </span>
                </div>
                <div className="levels-card-head">
                  <h2 className="levels-card-title">{item.title}</h2>
                  {item.meta ? <p className="levels-card-meta">{item.meta}</p> : null}
                </div>
                <p className="levels-card-summary">{item.summary}</p>
              </motion.div>
            </AnimatePresence>

            <div className="levels-card-foot">
              <div className="levels-pager">
                <span className="levels-dots" aria-hidden="true">
                  {items.map((level, i) =>
                    i === index ? (
                      <svg key={level.id} className="levels-dot-x" viewBox="0 0 14 14" focusable="false">
                        <path d="M3 3l8 8M11 3l-8 8" />
                      </svg>
                    ) : (
                      <span key={level.id} className="levels-dot" />
                    ),
                  )}
                </span>
                <p className="levels-count">
                  <span aria-hidden="true">
                    {index + 1} / {count}
                  </span>
                  <span className="visually-hidden">
                    {index + 1} of {count}
                  </span>
                </p>
              </div>
              <button
                ref={openRef}
                type="button"
                className="levels-tag levels-open"
                aria-disabled={phase === 'opening' ? true : undefined}
                onClick={startOpen}
              >
                <TagArt />
                <span className="levels-tag-text">
                  Open<span className="visually-hidden"> {item.title}</span>
                </span>
                <kbd className="levels-key levels-key--hint" aria-hidden="true">
                  Enter
                </kbd>
              </button>
            </div>

            <button
              type="button"
              className="levels-side levels-side--prev"
              aria-label="Previous level"
              onClick={() => step(-1)}
            >
              <SideTabArt />
              <kbd className="levels-key" aria-hidden="true">
                ←
              </kbd>
            </button>
            <button
              type="button"
              className="levels-side levels-side--next"
              aria-label="Next level"
              onClick={() => step(1)}
            >
              <SideTabArt />
              <kbd className="levels-key" aria-hidden="true">
                →
              </kbd>
            </button>
          </div>
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <ZipperPortal
        open={phase === 'open'}
        origin={origin}
        onExited={onPortalExited}
        kicker={item.kicker ?? label}
        color={item.color}
        art={
          // The portal renders outside .levels, so the art carries the scope itself.
          <div className="levels levels-portal-art">
            {item.badgeStyle === 'rosette' ? <Rosette item={item} /> : <LevelSticker item={item} size={96} tilt={-6} />}
          </div>
        }
        title={item.title}
        meta={item.meta}
        onClose={closePortal}
      >
        {/* Rendered into document.body, so it carries the .levels scope itself. */}
        <div className="levels levels-portal">
          {showSoon ? (
            <div className="levels-soon">
              <WorkingOnIt title={item.title} onBack={backToDetails} />
            </div>
          ) : (
            <>
              {item.detail}
              {item.action ? <VisitTag action={item.action} onSoon={showWorkingOnIt} buttonRef={visitRef} /> : null}
            </>
          )}
        </div>
      </ZipperPortal>
    </div>
  );
}
