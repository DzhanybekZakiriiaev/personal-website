import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
} from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { sections, type SectionDef } from '../content';
import { hrefFor } from '../lib/route';
import {
  getFocusTarget,
  notifySceneChange,
  registerScenePlanets,
  useFocusGlobe,
  useFocusTarget,
  type FocusGlobe,
  type Rect,
} from '../lib/scene';
import { setPilotTarget } from '../lib/pilot';
import { Globe3D } from '../three/Globe3D';
import './carousel.css';

const COUNT = sections.length;

// Ring shape, in centre-planet sizes. Side planets come out at 0.6 of the centre one.
const BACK_SCALE = 0.2; // the planet hiding behind the centre one
const SIDE_RISE = 0.1; // side planets sit a little higher...
const BACK_RISE = 0.4; // ...and the back one peeks over the centre planet's top

const TURN = { type: 'spring', visualDuration: 0.6, bounce: 0.16 } as const;

/** Opening a section: the centre planet glides to the section's globe spot and grows. */
export const FOCUS_IN_MS = 850;
/** Back to the pod: it shrinks back into the carousel's centre. */
export const FOCUS_OUT_MS = 750;
const FOCUS_EASE = [0.65, 0, 0.35, 1] as const;
const BADGES_AT = 0.7; // the level badges come out at this point of the glide

const SWIPE_SLOP_PX = 10; // movement before we decide between a swipe and a scroll
const SWIPE_MIN_PX = 36; // a slow drag this long still turns one step
const FLICK_MS = 140; // how far a flick carries on

const TILTS = [-3, 2.5, -2, 3];
const BOB_DELAYS = ['-0.4s', '-1.9s', '-3.1s', '-1.2s'];
const CONNECTOR = 'M14 107 C62 102 62 30 36 7';

/*
 * Where the other planets wait while one is focused, by their place on the ring next
 * to it: centre at (fx, fy) of the first screenful, size as a fraction of the planet box.
 * Wide screens: up top and at the right edge, clear of the info card. Phones: small,
 * around the focused planet's top.
 */
type Role = 'left' | 'right' | 'back';
type Spot = { fx: number; fy: number; size: number };
const SPOTS: Record<'wide' | 'narrow', Record<Role, Spot>> = {
  wide: {
    left: { fx: 0.4, fy: 0.09, size: 0.2 },
    back: { fx: 0.68, fy: 0.06, size: 0.15 },
    right: { fx: 0.945, fy: 0.66, size: 0.24 },
  },
  narrow: {
    left: { fx: 0.07, fy: 0.24, size: 0.2 },
    back: { fx: 0.62, fy: 0.04, size: 0.13 },
    right: { fx: 0.93, fy: 0.15, size: 0.22 },
  },
};

const mod = (n: number) => ((n % COUNT) + COUNT) % COUNT;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const depthAt = (offset: number) => Math.cos((offset * 2 * Math.PI) / COUNT);

/** The ring position nearest `from` that brings `index` to the centre (shortest way round). */
function nearestTurn(from: number, index: number): number {
  let delta = index - mod(from);
  if (delta > COUNT / 2) delta -= COUNT;
  if (delta < -COUNT / 2) delta += COUNT;
  return Math.round(from + delta);
}

/** Where a planet `offset` steps from the centre sits on the ring (angle = offset * 360° / COUNT). */
function slotAt(offset: number) {
  const angle = (offset * 2 * Math.PI) / COUNT;
  const depth = Math.cos(angle); // 1 = front, -1 = back
  return {
    x: Math.sin(angle),
    depth,
    scale: BACK_SCALE + (1 - BACK_SCALE) * ((depth + 1) / 2),
    rise: SIDE_RISE * (1 - depth) + BACK_RISE * Math.max(0, -depth) ** 2,
  };
}

/**
 * Measured geometry, in px. Every planet box is the same size (L, the focused size or
 * the carousel centre size, whichever is bigger) at the same place; transforms do the rest.
 */
interface Geo {
  S: number; // carousel centre planet diameter
  L: number; // planet box size
  rx: number; // ring radius
  ax: number; // planet box centre, document px
  ay: number;
  vw: number;
  vh: number;
  /** The focused planet: offset of the target's centre from the box centre, and its scale. */
  focus: { x: number; y: number; scale: number } | null;
  /** The target box itself, document px. */
  focusBox: Rect | null;
}

type Place = { x: number; y: number; scale: number };

function ringPlace(offset: number, g: Geo): Place {
  const s = slotAt(offset);
  return { x: s.x * g.rx, y: -s.rise * g.S, scale: (s.scale * g.S) / g.L };
}

function roleOf(index: number, focused: number): Role | 'focus' {
  const d = mod(index - focused);
  if (d === 0) return 'focus';
  if (d === 1) return 'right';
  if (d === COUNT - 1) return 'left';
  return 'back';
}

function scenePlace(role: Role | 'focus', g: Geo, ring: Place): Place {
  if (role === 'focus') return g.focus ?? ring;
  const spot = (g.vw < 760 ? SPOTS.narrow : SPOTS.wide)[role];
  return { x: spot.fx * g.vw - g.ax, y: spot.fy * g.vh - g.ay, scale: spot.size };
}

const transformOf = (p: Place) => `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) scale(${p.scale.toFixed(4)})`;

interface OrbitPlanetProps {
  section: SectionDef;
  index: number;
  pos: MotionValue<number>;
  /** 0 = on the ring, 1 = the scene focused on a section. */
  focusT: MotionValue<number>;
  geoVersion: MotionValue<number>;
  geo: RefObject<Geo | null>;
  focusedRef: RefObject<number | null>;
  isCentre: boolean;
  /** This planet is (or is gliding to or from being) the focused one. */
  focused: boolean;
  /** Another planet is focused: this one waits in the background. */
  background: boolean;
  labelsHidden: boolean;
  /** The section page's level badges and pocket, once this planet has arrived. */
  globe: FocusGlobe | null;
  tabbable: boolean;
  linkRef: Ref<HTMLAnchorElement>;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void;
  onPress: () => void;
  onMouseDown: (event: MouseEvent<HTMLAnchorElement>) => void;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

// One planet: on the ring with its paper tag and note, or (in a section) focused at the
// section's globe spot or waiting in the background. Its place comes from the ring
// position and the focus progress, so it always travels as one continuous motion.
function OrbitPlanet({
  section,
  index,
  pos,
  focusT,
  geoVersion,
  geo,
  focusedRef,
  isCentre,
  focused,
  background,
  labelsHidden,
  globe,
  tabbable,
  linkRef,
  onFocus,
  onKeyDown,
  onPress,
  onMouseDown,
  onClick,
}: OrbitPlanetProps) {
  const transform = useTransform([pos, focusT, geoVersion], ([p, t]: number[]) => {
    const g = geo.current;
    if (!g) return 'none';
    const ring = ringPlace(index - p, g);
    const f = focusedRef.current;
    if (f === null || t <= 0) return transformOf(ring);
    const role = roleOf(index, f);
    const goal = scenePlace(role, g, ring);
    const arc = role === 'focus' ? Math.sin(Math.PI * t) * g.L * 0.04 : 0; // a slight lift on the way
    return transformOf({ x: lerp(ring.x, goal.x, t), y: lerp(ring.y, goal.y, t) - arc, scale: lerp(ring.scale, goal.scale, t) });
  });
  const zIndex = useTransform([pos, focusT], ([p, t]: number[]) => {
    const f = focusedRef.current;
    if (f !== null && t > 0 && f === index) return 99;
    return Math.round(depthAt(index - p) * 40) + 50;
  });
  const opacity = useTransform([pos, focusT], ([p, t]: number[]) => {
    const d = depthAt(index - p);
    const ring = d > -0.1 ? 1 : Math.max(0.22, 1 - (-0.1 - d) * 0.9);
    const f = focusedRef.current;
    if (f === null || t <= 0) return ring;
    return lerp(ring, f === index ? 1 : 0.72, t);
  });
  // Blur in half-pixel steps, so the style only changes a few times per move.
  const blur = useTransform([pos, focusT], ([p, t]: number[]) => {
    const ring = Math.max(0, -depthAt(index - p) - 0.2) * 4;
    const f = focusedRef.current;
    const px = f === null || t <= 0 ? ring : lerp(ring, f === index ? 0 : 1.5, t);
    const q = Math.round(px * 2) / 2;
    return q > 0 ? `blur(${q}px)` : 'none';
  });
  const tagOpacity = useTransform(pos, (p) => clamp01((depthAt(index - p) + 0.5) / 0.5));
  const tagPointer = useTransform(tagOpacity, (o): 'auto' | 'none' => (!labelsHidden && o > 0.4 ? 'auto' : 'none'));
  const hot = useTransform(pos, (p) => clamp01((depthAt(index - p) - 0.35) / 0.6));
  const callout = useTransform(pos, (p) => clamp01((depthAt(index - p) - 0.82) / 0.18));

  const classes = ['orbit', isCentre ? 'is-centre' : '', focused ? 'is-focused' : '', background ? 'is-bg' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <motion.li className={classes} style={{ transform, zIndex, opacity }}>
      <a
        ref={linkRef}
        className="orbit-link"
        href={hrefFor(section.id)}
        draggable={false}
        tabIndex={tabbable ? undefined : -1}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onPointerDown={onPress}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        <motion.span className="orbit-body" style={{ filter: blur }}>
          <span className="orbit-drift">
            <span className="orbit-bob" style={{ '--bob-delay': BOB_DELAYS[index % BOB_DELAYS.length] } as CSSProperties}>
              <span className="orbit-planet">
                <Globe3D
                  kind={section.planet}
                  detail="hero"
                  excited={isCentre}
                  maxDpr={isCentre || focused ? undefined : 1.25}
                  badges={globe?.badges}
                  selected={globe?.selected}
                  onSelectBadge={globe?.onSelectBadge}
                  pocketOpen={globe?.pocketOpen ?? false}
                  onPocketOpened={globe?.onPocketOpened}
                  onPocketClosed={globe?.onPocketClosed}
                />
              </span>
            </span>
          </span>
        </motion.span>

        <motion.span
          className="orbit-labels"
          initial={false}
          animate={{ opacity: labelsHidden ? 0 : 1 }}
          transition={{ duration: labelsHidden ? 0.15 : 0.3 }}
        >
          <motion.span className="orbit-tag" style={{ opacity: tagOpacity, pointerEvents: tagPointer }}>
            <span className="orbit-tag-tilt" style={{ transform: `rotate(${TILTS[index % TILTS.length]}deg)` }}>
              <span className="orbit-tag-paper">
                <motion.span className="orbit-tag-hot" style={{ opacity: hot }} aria-hidden="true" />
                <span className="orbit-tag-text">{section.label}</span>
              </span>
            </span>
          </motion.span>
          <motion.span className="orbit-callout" style={{ opacity: callout }}>
            <svg
              className="orbit-connector"
              viewBox="0 0 70 112"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <path d={CONNECTOR} />
            </svg>
            <span className="orbit-note">
              <span className="visually-hidden">: </span>
              {section.note}
            </span>
          </motion.span>
        </motion.span>
      </a>
    </motion.li>
  );
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  base: number;
  slotPx: number;
  mode: 'pending' | 'turn' | 'scroll';
  lastX: number;
  lastT: number;
  vx: number;
}

/** ring: the carousel. in / out: gliding to or from a section. focused: a section is open. */
type SceneMode = 'ring' | 'in' | 'focused' | 'out';

interface PlanetCarouselProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
  /** false while a section is open (or the site is not shown yet): no keys, no pointer. */
  active: boolean;
  /** The section planet in focus (a section page is open), or null for the carousel. */
  focus: number | null;
}

// The section planets on a turning ring, like a game's planet menu. Opening a section
// focuses one of them in the same scene (see lib/scene.ts).
export function PlanetCarousel({ selected, onSelect, restoreFocus, active, focus }: PlanetCarouselProps) {
  const reduceMotion = useReducedMotion();
  const focusTarget = useFocusTarget();
  const focusGlobe = useFocusGlobe();
  const pos = useMotionValue(selected); // ring position: `selected` is in the centre when pos === selected (mod COUNT)
  const focusT = useMotionValue(focus !== null ? 1 : 0);
  const geoVersion = useMotionValue(0);
  const geo = useRef<Geo | null>(null);
  const [mode, setModeState] = useState<SceneMode>(focus !== null ? 'focused' : 'ring');
  const modeRef = useRef<SceneMode>(mode);
  const [focusedIdx, setFocusedIdxState] = useState<number | null>(focus);
  const focusedRef = useRef<number | null>(focus);
  const [badgesOn, setBadgesOn] = useState(focus !== null);
  const busy = !active || mode !== 'ring';

  const target = useRef(selected);
  const spin = useRef<{ stop: () => void } | null>(null);
  const focusAnim = useRef<{ stop: () => void } | null>(null);
  const badgeTimer = useRef<number | undefined>(undefined);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const ringRef = useRef<HTMLUListElement>(null);
  const probeS = useRef<HTMLSpanElement>(null);
  const probeRx = useRef<HTMLSpanElement>(null);
  const press = useRef<{ index: number; wasCentre: boolean } | null>(null);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pocketRef = useRef(false);
  pocketRef.current = focusGlobe?.pocketOpen ?? false;

  const setMode = (next: SceneMode) => {
    modeRef.current = next;
    setModeState(next);
  };
  const setFocusedIdx = (next: number | null) => {
    focusedRef.current = next;
    setFocusedIdxState(next);
  };

  /* ---------- geometry ---------- */
  const measure = useCallback(() => {
    const ring = ringRef.current;
    const box = ring?.firstElementChild;
    if (!ring || !(box instanceof HTMLElement) || !probeS.current || !probeRx.current) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    // Layout position from offsets, so transforms on the way (the rocket arrival's
    // zoom on .carousel, a planet mid-move) never skew it.
    let ax = 0;
    let ay = 0;
    for (let el: HTMLElement | null = box; el; el = el.offsetParent as HTMLElement | null) {
      ax += el.offsetLeft;
      ay += el.offsetTop;
    }
    const L = Math.max(1, box.offsetWidth);
    ax += L / 2;
    ay += L / 2;
    let focusPlace: Geo['focus'] = null;
    let focusBox: Rect | null = null;
    const spacer = getFocusTarget();
    if (spacer) {
      const t = spacer.getBoundingClientRect();
      if (t.width > 0) {
        focusBox = { left: t.left + sx, top: t.top + sy, width: t.width, height: t.height };
        focusPlace = { x: focusBox.left + t.width / 2 - ax, y: focusBox.top + t.height / 2 - ay, scale: Math.min(1.6, t.width / L) };
      }
    }
    geo.current = {
      S: probeS.current.offsetWidth,
      L,
      rx: probeRx.current.offsetWidth,
      ax,
      ay,
      vw: window.innerWidth,
      vh: window.innerHeight,
      focus: focusPlace,
      focusBox,
    };
    geoVersion.set(geoVersion.get() + 1);
  }, [geoVersion]);

  // Viewport rects of the carousel centre planet and the focused planet's resting box.
  const centreRect = useCallback((): Rect | null => {
    const g = geo.current;
    if (!g) return null;
    return { left: g.ax - g.S / 2 - window.scrollX, top: g.ay - g.S / 2 - window.scrollY, width: g.S, height: g.S };
  }, []);
  const focusRect = useCallback((): Rect | null => {
    const b = geo.current?.focusBox;
    return b ? { left: b.left - window.scrollX, top: b.top - window.scrollY, width: b.width, height: b.height } : null;
  }, []);

  /** Where the pilot rocket should be, right now. */
  const aimPilot = useCallback(
    (options: { instant?: boolean; duration?: number } = {}) => {
      if (pocketRef.current) return; // the section page steers it while a pocket is open
      const m = modeRef.current;
      const planet = m === 'in' || m === 'focused';
      const rect = planet ? focusRect() : centreRect();
      if (rect) setPilotTarget({ rect, mode: planet ? 'planet' : 'pod' }, options);
    },
    [centreRect, focusRect],
  );

  useLayoutEffect(() => {
    measure();
    aimPilot({ instant: true });
    // Measure once on mount; resizes and the section's spacer are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        aimPilot({ instant: true });
      });
    };
    const onScroll = () => {
      if (modeRef.current === 'in' || modeRef.current === 'out') return; // re-aimed when the move ends
      aimPilot({ instant: true });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [measure, aimPilot]);

  // Let other things (the pilot, a future overlay) ask where the planets are.
  useEffect(() => {
    const planetRect = (index: number | null): Rect | null => {
      if (index === null) return null;
      const planet = links.current[index]?.querySelector('.orbit-planet');
      if (!planet) return null;
      const r = planet.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return registerScenePlanets({
      centre: () => planetRect(selectedRef.current),
      focused: () => planetRect(modeRef.current === 'ring' ? null : focusedRef.current),
    });
  }, []);

  /* ---------- turning ---------- */
  const turnTo = (next: number, instant = false) => {
    target.current = next;
    spin.current?.stop();
    spin.current = null;
    if (instant || reduceMotion) pos.set(next);
    else spin.current = animate(pos, next, TURN);
  };

  useEffect(
    () => () => {
      spin.current?.stop();
      focusAnim.current?.stop();
      window.clearTimeout(badgeTimer.current);
    },
    [],
  );

  // Turn whenever the selection changes (keys, focus, clicks, swipes). A section opened
  // by its address while another is focused turns the ring while it is out of sight.
  useEffect(() => {
    const next = nearestTurn(target.current, selected);
    if (next !== target.current) turnTo(next, modeRef.current === 'focused');
    aimPilot();
    notifySceneChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* ---------- focusing a section ---------- */
  const focusIn = (index: number) => {
    focusAnim.current?.stop();
    window.clearTimeout(badgeTimer.current);
    setFocusedIdx(index);
    measure();
    setMode('in');
    setBadgesOn(false);
    if (reduceMotion) {
      focusT.set(1);
      setMode('focused');
      setBadgesOn(true);
      aimPilot({ instant: true });
      notifySceneChange();
      return;
    }
    aimPilot({ duration: FOCUS_IN_MS });
    notifySceneChange();
    badgeTimer.current = window.setTimeout(() => setBadgesOn(true), FOCUS_IN_MS * BADGES_AT);
    focusAnim.current = animate(focusT, 1, {
      duration: FOCUS_IN_MS / 1000,
      ease: FOCUS_EASE,
      onComplete: () => {
        setMode('focused');
        aimPilot({ instant: true }); // in case the page scrolled on the way
        notifySceneChange();
      },
    });
  };

  const focusOut = () => {
    focusAnim.current?.stop();
    window.clearTimeout(badgeTimer.current);
    setBadgesOn(false);
    setMode('out');
    const done = () => {
      setMode('ring');
      setFocusedIdx(null);
      aimPilot({ instant: true });
      notifySceneChange();
      // Another section asked for meanwhile (browser history): on to it now.
      const next = focusProp.current;
      if (next !== null && getFocusTarget()) focusInRef.current(next);
    };
    if (reduceMotion) {
      focusT.set(0);
      done();
      aimPilot({ instant: true });
      return;
    }
    aimPilot({ duration: FOCUS_OUT_MS });
    notifySceneChange();
    focusAnim.current = animate(focusT, 0, { duration: FOCUS_OUT_MS / 1000, ease: FOCUS_EASE, onComplete: done });
  };

  const focusProp = useRef(focus);
  focusProp.current = focus;
  const focusInRef = useRef(focusIn);
  focusInRef.current = focusIn;

  useLayoutEffect(() => {
    const current = focusedRef.current;
    const m = modeRef.current;
    if (focus !== null) {
      if (!focusTarget) return; // the section page is not laid out yet
      if (current === focus && (m === 'in' || m === 'focused')) {
        measure(); // the same section, a new page (e.g. a remount): just re-aim
        aimPilot({ instant: true });
        return;
      }
      if (current !== null && current !== focus && m !== 'ring') {
        // another section from the browser history: back to the ring first; the
        // end of that move goes on to the new one
        if (m !== 'out') focusOut();
        return;
      }
      focusIn(focus);
    } else if (current !== null && (m === 'in' || m === 'focused')) {
      focusOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, focusTarget]);

  // While a pocket is open the section page steers the pilot; when it closes, back to the planet.
  useEffect(() => {
    if (!focusGlobe?.pocketOpen) aimPilot();
  }, [focusGlobe?.pocketOpen, aimPilot]);

  // Each time the pod opens: focus goes back to the planet we came from.
  // While a section is open: drop any half-done swipe.
  useEffect(() => {
    if (active) {
      if (restoreFocus) links.current[selected]?.focus({ preventScroll: true });
      return;
    }
    drag.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* ---------- keyboard ---------- */
  const moveTo = (index: number) => {
    const next = mod(index);
    onSelect(next);
    links.current[next]?.focus();
  };

  // Arrow keys work like a controller d-pad, even before anything has focus.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (busy || drag.current?.mode === 'turn') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return; // keep browser shortcuts like Alt+Left
      const focused = document.activeElement;
      if (focused && focused !== document.body) return; // planet links handle their own keys
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveTo(selected + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTo(selected - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        links.current[selected]?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPlanetKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (busy) {
      // Mid-move or in a section: swallow the keys that would open or turn something.
      if (['Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.preventDefault();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: COUNT - 1 };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    moveTo(keys[event.key]);
  };

  /* ---------- pointer ---------- */
  // A side planet turns to the centre on click, so its press must not focus (and turn) it early.
  const onPlanetMouseDown = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (event.button === 0 && index !== selected) event.preventDefault();
  };

  // Side planet: turn it to the centre. Centre planet: open its section (the link does it).
  const onPlanetClick = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    const pressed = press.current;
    press.current = null;
    if (busy || swiped.current) {
      event.preventDefault(); // e.g. a badge clicked on the focused planet
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab or window: the browser's job
    const fromPointer = event.detail > 0;
    const wasCentre = fromPointer && pressed?.index === index ? pressed.wasCentre : index === selected;
    if (!wasCentre) {
      event.preventDefault();
      onSelect(index);
      links.current[index]?.focus({ preventScroll: true });
    }
  };

  // Swipe / drag sideways to turn the ring. Vertical moves are left to the page.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (busy || drag.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swiped.current = false;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: 0,
      slotPx: Math.max(60, geo.current?.rx ?? 240),
      mode: 'pending',
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id || d.mode === 'scroll') return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (d.mode === 'pending') {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        d.mode = 'scroll';
        return;
      }
      d.mode = 'turn';
      spin.current?.stop();
      spin.current = null;
      d.base = pos.get() + dx / d.slotPx; // pick up the ring where it is, no jump
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // pointer already released
      }
    }
    pos.set(d.base - dx / d.slotPx);
    const dt = event.timeStamp - d.lastT;
    if (dt > 0) d.vx = d.vx * 0.4 + ((event.clientX - d.lastX) / dt) * 0.6;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;
  };

  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || event.pointerId !== d.id) return;
    drag.current = null;
    if (d.mode !== 'turn') return;
    // The click that follows a mouse drag must not open or turn anything.
    swiped.current = true;
    window.setTimeout(() => {
      swiped.current = false;
    }, 0);
    const dx = d.lastX - d.startX;
    const vx = event.timeStamp - d.lastT > 100 ? 0 : d.vx; // held still before letting go
    let next = Math.round(pos.get() - (vx * FLICK_MS) / d.slotPx);
    if (next === target.current && Math.abs(dx) >= SWIPE_MIN_PX) next = target.current + (dx < 0 ? 1 : -1);
    turnTo(next);
    const index = mod(next);
    onSelect(index);
    if (links.current.some((link) => link !== null && link === document.activeElement)) {
      links.current[index]?.focus({ preventScroll: true });
    }
  };

  const sceneOn = mode !== 'ring';
  return (
    <nav
      aria-label="Sections"
      aria-hidden={focus !== null ? true : undefined}
      className={`carousel${sceneOn ? ' is-scene' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span ref={probeS} className="carousel-probe carousel-probe--s" aria-hidden="true" />
      <span ref={probeRx} className="carousel-probe carousel-probe--rx" aria-hidden="true" />
      <ul ref={ringRef} className="carousel-ring">
        {sections.map((section, i) => (
          <OrbitPlanet
            key={section.id}
            section={section}
            index={i}
            pos={pos}
            focusT={focusT}
            geoVersion={geoVersion}
            geo={geo}
            focusedRef={focusedRef}
            isCentre={i === selected}
            focused={focusedIdx === i}
            background={focusedIdx !== null && focusedIdx !== i}
            labelsHidden={sceneOn}
            globe={focusedIdx === i && badgesOn && mode !== 'out' ? focusGlobe : null}
            tabbable={focus === null}
            linkRef={(el) => {
              links.current[i] = el;
            }}
            onFocus={() => {
              if (!busy) onSelect(i);
            }}
            onKeyDown={(event) => onPlanetKeyDown(event, i)}
            onPress={() => {
              press.current = { index: i, wasCentre: i === selected };
            }}
            onMouseDown={(event) => onPlanetMouseDown(event, i)}
            onClick={(event) => onPlanetClick(event, i)}
          />
        ))}
      </ul>
    </nav>
  );
}
