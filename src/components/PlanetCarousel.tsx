import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
} from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { sections, type SectionDef } from '../content';
import { hrefFor } from '../lib/route';
import { POD_LEAVE_MS, rectOf, registerPodPlanet, usePlanetAway } from '../lib/flight';
import { Globe3D } from '../three/Globe3D';
import './carousel.css';

const COUNT = sections.length;

// Ring shape, in centre-planet sizes. Side planets come out at 0.6 of the centre one.
const BACK_SCALE = 0.2; // the planet hiding behind the centre one
const SIDE_RISE = 0.1; // side planets sit a little higher...
const BACK_RISE = 0.4; // ...and the back one peeks over the centre planet's top

const TURN = { type: 'spring', visualDuration: 0.6, bounce: 0.16 } as const;
// Opening a section: the other planets fly off outwards; coming back they fly in again.
const SPREAD_OUT = { duration: POD_LEAVE_MS / 1000, ease: [0.55, 0, 0.8, 0.4] } as const;
const SPREAD_IN = { duration: 0.8, ease: [0.2, 0.75, 0.3, 1], delay: 0.05 } as const;

export type PodFlight = 'leaving' | 'arriving' | null;

const SWIPE_SLOP_PX = 10; // movement before we decide between a swipe and a scroll
const SWIPE_MIN_PX = 36; // a slow drag this long still turns one step
const FLICK_MS = 140; // how far a flick carries on

const TILTS = [-3, 2.5, -2, 3];
const BOB_DELAYS = ['-0.4s', '-1.9s', '-3.1s', '-1.2s'];
const CONNECTOR = 'M14 107 C62 102 62 30 36 7';

const mod = (n: number) => ((n % COUNT) + COUNT) % COUNT;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
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

interface OrbitPlanetProps {
  section: SectionDef;
  index: number;
  pos: MotionValue<number>;
  /** 0 = on the ring, 1 = flown off outwards (the centre slot never moves). */
  spread: MotionValue<number>;
  isCentre: boolean;
  /** The centre planet is hidden while its big twin flies to or from the section page. */
  away: boolean;
  labelsHidden: boolean;
  linkRef: Ref<HTMLAnchorElement>;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void;
  onPress: () => void;
  onMouseDown: (event: MouseEvent<HTMLAnchorElement>) => void;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

// One planet on the ring with its paper tag and (when in the centre) its note bubble.
// Everything about its place comes from the one ring position `pos`, so it travels
// along the ellipse, growing and shrinking, instead of sliding in a straight line.
function OrbitPlanet({
  section,
  index,
  pos,
  spread,
  isCentre,
  away,
  labelsHidden,
  linkRef,
  onFocus,
  onKeyDown,
  onPress,
  onMouseDown,
  onClick,
}: OrbitPlanetProps) {
  // `out` (the spread) is the camera flying past the chosen planet on its right: the
  // left neighbour slides off to the left, the right one sweeps down and out to the
  // bottom right (growing, as it passes close), the back one drifts up and away.
  const transform = useTransform([pos, spread], ([p, out]: number[]) => {
    const s = slotAt(index - p);
    const right = clamp01(s.x * 2);
    const left = clamp01(-s.x * 2);
    const x = s.x * (1 + out * (left > 0 ? 1.8 : 1.2));
    const y = -s.rise + out * (0.85 * right - 0.35 * clamp01(-s.depth));
    const scale = s.scale * (1 + out * (0.55 * right + 0.12 * left));
    return `translate3d(calc(var(--rx) * ${x.toFixed(4)}), calc(var(--s) * ${y.toFixed(4)}), 0) scale(${scale.toFixed(4)})`;
  });
  const zIndex = useTransform(pos, (p) => Math.round(depthAt(index - p) * 40) + 50);
  const opacity = useTransform([pos, spread], ([p, out]: number[]) => {
    const d = depthAt(index - p);
    const base = d > -0.1 ? 1 : Math.max(0.22, 1 - (-0.1 - d) * 0.9);
    return base * (1 - out * clamp01((1 - d) * 3));
  });
  // Blur in half-pixel steps, so the style only changes a few times per turn.
  const blur = useTransform(pos, (p) => {
    const px = Math.round(Math.max(0, -depthAt(index - p) - 0.2) * 8) / 2;
    return px > 0 ? `blur(${px}px)` : 'none';
  });
  const tagOpacity = useTransform(pos, (p) => clamp01((depthAt(index - p) + 0.5) / 0.5));
  const tagPointer = useTransform(tagOpacity, (o): 'auto' | 'none' => (o > 0.4 ? 'auto' : 'none'));
  const hot = useTransform(pos, (p) => clamp01((depthAt(index - p) - 0.35) / 0.6));
  const callout = useTransform(pos, (p) => clamp01((depthAt(index - p) - 0.82) / 0.18));

  return (
    <motion.li
      className={`orbit${isCentre ? ' is-centre' : ''}${isCentre && away ? ' is-away' : ''}`}
      style={{ transform, zIndex, opacity }}
    >
      <a
        ref={linkRef}
        className="orbit-link"
        href={hrefFor(section.id)}
        draggable={false}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onPointerDown={onPress}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        <motion.span className="orbit-body" style={{ filter: blur }}>
          <span className="orbit-bob" style={{ '--bob-delay': BOB_DELAYS[index % BOB_DELAYS.length] } as CSSProperties}>
            <span className="orbit-planet">
              <Globe3D kind={section.planet} detail="pod" excited={isCentre} />
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

interface PlanetCarouselProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
  /** false while the pod is hidden behind a section page: no keys, no pointer, no travel. */
  active: boolean;
  /** Flying to a section ('leaving') or back from one ('arriving'): the ring is not interactive. */
  flight: PodFlight;
  /** Open the centre planet's section (the flight takes it from there). */
  onOpen: (index: number) => void;
}

// The section planets on a turning ring, like a game's planet menu.
export function PlanetCarousel({ selected, onSelect, restoreFocus, active, flight, onOpen }: PlanetCarouselProps) {
  const reduceMotion = useReducedMotion();
  const away = usePlanetAway();
  const busy = !active || flight !== null || away;
  const pos = useMotionValue(selected); // ring position: `selected` is in the centre when pos === selected (mod COUNT)
  const spread = useMotionValue(0);
  const target = useRef(selected);
  const spin = useRef<{ stop: () => void } | null>(null);
  const spreading = useRef<{ stop: () => void } | null>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const ringRef = useRef<HTMLUListElement>(null);
  const press = useRef<{ index: number; wasCentre: boolean } | null>(null);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Tell the flight where the centre planet's sphere is (null while the pod is hidden).
  useEffect(
    () =>
      registerPodPlanet(() => {
        const planet = links.current[selectedRef.current]?.querySelector('.orbit-planet');
        return planet ? rectOf(planet) : null;
      }),
    [],
  );

  // Leaving: the other planets fly off outwards. Arriving: they start out there and fly
  // back in. (Layout effect, so the first frame of the pod coming back is already spread.)
  useLayoutEffect(() => {
    if (flight === null) return;
    spreading.current?.stop();
    spreading.current = null;
    if (reduceMotion) {
      spread.set(flight === 'leaving' ? 1 : 0);
      return;
    }
    if (flight === 'arriving') spread.set(1);
    spreading.current = animate(spread, flight === 'leaving' ? 1 : 0, flight === 'leaving' ? SPREAD_OUT : SPREAD_IN);
  }, [flight, reduceMotion, spread]);

  useEffect(() => () => spreading.current?.stop(), []);

  const turnTo = (next: number, instant = false) => {
    target.current = next;
    spin.current?.stop();
    spin.current = null;
    if (instant || reduceMotion) pos.set(next);
    else spin.current = animate(pos, next, TURN);
  };

  useEffect(() => () => spin.current?.stop(), []);

  // Turn whenever the selection changes (keys, focus, clicks, swipes). While the pod is
  // hidden (a section opened by its address) the ring just jumps there.
  useEffect(() => {
    const next = nearestTurn(target.current, selected);
    if (next !== target.current) turnTo(next, !active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Each time the pod opens: focus goes back to the planet we came from.
  // While hidden: drop any half-done swipe and settle the ring.
  useEffect(() => {
    if (active) {
      if (restoreFocus) links.current[selected]?.focus();
      return;
    }
    drag.current = null;
    turnTo(target.current, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

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
      // Mid-flight: swallow the keys that would open or turn something.
      if (['Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.preventDefault();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: COUNT - 1 };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    moveTo(keys[event.key]);
  };

  // A side planet turns to the centre on click, so its press must not focus (and turn) it early.
  const onPlanetMouseDown = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (event.button === 0 && index !== selected) event.preventDefault();
  };

  // Side planet: turn it to the centre. Centre planet: fly to it and open it.
  const onPlanetClick = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    const pressed = press.current;
    press.current = null;
    if (busy || swiped.current) {
      event.preventDefault();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab or window: the browser's job
    const fromPointer = event.detail > 0;
    const wasCentre = fromPointer && pressed?.index === index ? pressed.wasCentre : index === selected;
    if (!wasCentre) {
      event.preventDefault();
      onSelect(index);
      links.current[index]?.focus({ preventScroll: true });
      return;
    }
    if (reduceMotion) return; // straight to the section
    event.preventDefault();
    onOpen(index);
  };

  // Swipe / drag sideways to turn the ring. Vertical moves are left to the page.
  const measureSlot = (): number => {
    const ring = ringRef.current;
    const box = ring?.firstElementChild;
    if (!ring || !(box instanceof HTMLElement)) return 240;
    const k = parseFloat(getComputedStyle(ring).getPropertyValue('--rx-k')) || 0.8;
    return Math.max(60, box.offsetWidth * k);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (busy || drag.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swiped.current = false;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: 0,
      slotPx: measureSlot(),
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

  return (
    <nav
      aria-label="Sections"
      className="carousel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <ul ref={ringRef} className="carousel-ring">
        {sections.map((section, i) => (
          <OrbitPlanet
            key={section.id}
            section={section}
            index={i}
            pos={pos}
            spread={spread}
            isCentre={i === selected}
            away={away}
            labelsHidden={flight === 'leaving' || away}
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
