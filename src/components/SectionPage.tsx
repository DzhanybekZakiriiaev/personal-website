import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePresence, useReducedMotion } from 'motion/react';
import { profile, sections, type SectionId } from '../content';
import { go } from '../lib/route';
import { ButtonHints } from './ButtonHints';
import { FOCUS_IN_MS } from './PlanetCarousel';
import { SoundStitch } from './SoundStitch';
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
export function SectionPage({ id, instant = false, active = true }: { id: SectionId; instant?: boolean; active?: boolean }) {
  const section = sections.find((s) => s.id === id) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const items = useMemo(() => levelsFor(id), [id]);
  const reduce = useReducedMotion() === true;
  const [isPresent, safeToRemove] = usePresence();
  const [phase, setPhase] = useState<Phase>(instant ? 'shown' : 'entering');

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Announce the page by focusing its heading. Opened from its address, the site is
  // still inert under the loading screen, so this waits until the site is shown.
  useEffect(() => {
    document.title = `${section.label} · ${profile.name}`;
    if (active) heading.current?.focus({ preventScroll: true });
  }, [section, active]);

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
      {/* One compact row: Back, the title (with its patch), the sound button. */}
      <header className="section-header">
        <a className="back-bubble" href="#/" data-sound="back">
          <span aria-hidden="true">← </span>Back<span className="visually-hidden"> to the planets</span>
        </a>
        <div className="title-wrap">
          <h1 ref={heading} tabIndex={-1} className="title-bubble">
            {section.label}
          </h1>
          {section.patch ? (
            <p className="title-patch">
              <svg className="title-patch-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
              </svg>
              {section.patch}
            </p>
          ) : null}
        </div>
        {/* Music and button sounds can be stopped from every screen. */}
        <SoundStitch compact className="section-sound" />
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
