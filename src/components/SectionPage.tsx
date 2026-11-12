import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePresence, useReducedMotion } from 'motion/react';
import { profile, sections, type SectionId } from '../content';
import { go } from '../lib/route';
import {
  FLIGHT_MS,
  HANDOVER_AT,
  clearFlight,
  flyElement,
  peekFlight,
  podPlanetRect,
  rectOf,
  resetFlightStyles,
  setPlanetAway,
  type Flight,
  type Rect,
} from '../lib/flight';
import { ButtonHints } from './ButtonHints';
import { PlanetLevels } from './levels/PlanetLevels';
import { levelsFor } from '../pages/levels';

/**
 * flying: the globe is flying in from the pod, the rest waits.
 * shown:  everything in place.
 * leaving: the globe flies back to the pod, the rest has faded.
 * fading: no flight (reduced motion, or the pod isn't there): a quick fade out.
 */
type Phase = 'flying' | 'shown' | 'leaving' | 'fading';

// The rest of the page starts coming in during the last part of the flight.
const REVEAL_AT = 0.6;
const FADE_OUT_MS = 200;

// A section opened from the pod: the section's planet with one badge per level
// stuck on it. Opening a badge unzips it like a pocket and shows the details.
// Coming from the pod, the planet flies in from where it sat on the pod's ring;
// going back, it flies back there (the pod sits underneath, see App.tsx).
export function SectionPage({ id }: { id: SectionId }) {
  const section = sections.find((s) => s.id === id) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => levelsFor(id), [id]);
  const reduce = useReducedMotion() === true;
  const [isPresent, safeToRemove] = usePresence();
  const [flyFrom] = useState(() => (reduce ? null : peekFlight(id)));
  const [phase, setPhase] = useState<Phase>(flyFrom ? 'flying' : 'shown');
  const globeBox = useRef<HTMLDivElement | null>(null);
  const flight = useRef<Flight | null>(null);
  const homeRect = useRef<Rect | null>(null);
  const revealTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.title = `${section.label} · ${profile.name}`;
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [section]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The portal handles its own Escape and marks it as handled.
      if (event.key === 'Escape' && !event.defaultPrevented) go('pod');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Arriving from the pod: start the globe where the pod planet was (the pod hides its
  // own planet in the same frame) and fly it into its place.
  useLayoutEffect(() => {
    clearFlight();
    const box = globeBox.current;
    if (!flyFrom) return undefined;
    if (!box) {
      setPhase('shown'); // nothing to fly (no levels): just show the page
      return undefined;
    }
    window.scrollTo(0, 0);
    resetFlightStyles(box);
    const home = rectOf(box);
    homeRect.current = home;
    setPlanetAway(true);
    revealTimer.current = window.setTimeout(() => setPhase('shown'), FLIGHT_MS * REVEAL_AT);
    flight.current = flyElement(box, {
      from: flyFrom,
      to: home,
      layout: home,
      fade: 'in',
      onDone: () => {
        flight.current = null;
        setPlanetAway(false);
      },
    });
    return () => {
      window.clearTimeout(revealTimer.current);
      flight.current?.stop();
      flight.current = null;
      resetFlightStyles(box);
      setPlanetAway(false);
    };
    // Runs once on arrival (flyFrom never changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving for the pod: fly the globe back onto the pod's centre planet, which shows
  // again as the globe lands; then the page is removed (AnimatePresence in App).
  useLayoutEffect(() => {
    if (isPresent) return undefined;
    window.clearTimeout(revealTimer.current); // Back pressed mid-arrival: the page stays hidden
    const box = globeBox.current;
    const wasFlying = flight.current !== null;
    flight.current?.stop();
    flight.current = null;
    const to = reduce ? null : podPlanetRect();

    if (!box || !to) {
      setPlanetAway(false);
      setPhase('fading');
      const timer = window.setTimeout(() => safeToRemove?.(), reduce ? 120 : FADE_OUT_MS);
      return () => window.clearTimeout(timer);
    }

    setPhase('leaving');
    const from = rectOf(box); // where it is right now, mid-flight or at rest
    const home = wasFlying && homeRect.current ? homeRect.current : from;
    setPlanetAway(true);
    let handedOver = false;
    flight.current = flyElement(box, {
      from,
      to,
      layout: home,
      fade: 'out',
      onProgress: (progress) => {
        if (!handedOver && progress >= HANDOVER_AT) {
          handedOver = true;
          setPlanetAway(false);
        }
      },
      onDone: () => {
        flight.current = null;
        setPlanetAway(false);
        safeToRemove?.();
      },
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  const phaseClass = flyFrom ? ` is-${phase}` : phase === 'shown' ? ' section--fade-in' : ` is-${phase}`;

  return (
    <div className={`section section--planet${phaseClass}`}>
      <header className="section-header">
        <a className="back-bubble" href="#/">
          <span aria-hidden="true">← </span>Back to the pod
        </a>
        <h1 ref={heading} tabIndex={-1} className="title-bubble">
          {section.label}
        </h1>
      </header>

      <main id="main" className="section-main">
        <PlanetLevels
          planet={section.planet}
          items={items}
          label={section.label}
          boxRef={globeBox}
          hideBubble={phase !== 'shown'}
          interactive={isPresent}
        />
      </main>

      <ButtonHints
        hints={[
          { keys: ['←', '→'], label: 'Choose' },
          { keys: ['Enter'], label: 'Open' },
          { keys: ['Esc'], label: 'Back' },
        ]}
      />
    </div>
  );
}
