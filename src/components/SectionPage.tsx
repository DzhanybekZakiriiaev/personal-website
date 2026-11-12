import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePresence, useReducedMotion } from 'motion/react';
import { profile, sections, type SectionId } from '../content';
import { go } from '../lib/route';
import { ButtonHints } from './ButtonHints';
import { FOCUS_IN_MS } from './PlanetCarousel';
import { PlanetLevels } from './levels/PlanetLevels';
import { levelsFor } from '../pages/levels';

/**
 * entering: the scene is gliding the planet in; the page waits, then comes in.
 * shown:    everything in place.
 * leaving:  back to the pod: the page fades while the planet shrinks back.
 */
type Phase = 'entering' | 'shown' | 'leaving';

// The page starts coming in at this point of the planet's glide.
const REVEAL_AT = 0.4;
const FADE_OUT_MS = 220;

// A section: the page that goes with the focused planet of the pod scene (the planet
// itself is the pod's, see PlanetCarousel). Header, the level tabs, the info card and
// hints; PlanetLevels puts the level badges on the focused planet.
export function SectionPage({ id, instant = false }: { id: SectionId; instant?: boolean }) {
  const section = sections.find((s) => s.id === id) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => levelsFor(id), [id]);
  const reduce = useReducedMotion() === true;
  const [isPresent, safeToRemove] = usePresence();
  const [phase, setPhase] = useState<Phase>(instant ? 'shown' : 'entering');

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = `${section.label} · ${profile.name}`;
    heading.current?.focus({ preventScroll: true });
  }, [section]);

  useEffect(() => {
    if (phase !== 'entering') return undefined;
    const timer = window.setTimeout(() => setPhase('shown'), reduce ? 0 : FOCUS_IN_MS * REVEAL_AT);
    return () => window.clearTimeout(timer);
  }, [phase, reduce]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The portal handles its own Escape and marks it as handled.
      if (event.key === 'Escape' && !event.defaultPrevented) go('pod');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Leaving: fade the page; the scene shrinks the planet back meanwhile.
  useEffect(() => {
    if (isPresent) return undefined;
    setPhase('leaving');
    const timer = window.setTimeout(() => safeToRemove?.(), reduce ? 120 : FADE_OUT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  return (
    <div className={`section section--planet section--scene is-${phase}`}>
      <header className="section-header">
        <a className="back-bubble" href="#/">
          <span aria-hidden="true">← </span>Back to the pod
        </a>
        <h1 ref={heading} tabIndex={-1} className="title-bubble">
          {section.label}
        </h1>
      </header>

      <main id="main" className="section-main">
        <PlanetLevels planet={section.planet} items={items} label={section.label} hideBubble={phase !== 'shown'} interactive={isPresent} />
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
