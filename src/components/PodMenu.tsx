import { useEffect } from 'react';
import { profile } from '../content';
import { ButtonHints } from './ButtonHints';
import { TextStickerLink } from './Sticker';
import { PlanetCarousel } from './PlanetCarousel';

interface PodMenuProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
  /** false while a section is open (or the site is not shown yet): no keys, no pointer. */
  active?: boolean;
  /** The focused section's planet while a section page is open, else null. */
  focus?: number | null;
}

// The pod: the scene every page lives in. On its own it is the planet carousel; with a
// section open, the section's planet is focused and the pod's own chrome steps back.
export function PodMenu({ selected, onSelect, restoreFocus, active = true, focus = null }: PodMenuProps) {
  // Every time the pod opens (first load, or back from a section).
  useEffect(() => {
    if (active) document.title = profile.name;
  }, [active]);

  const focused = focus !== null;

  return (
    <div className={`pod${focused ? ' is-focused' : ''}`}>
      <header className="pod-header" inert={focused}>
        {/* The name card lives on the start screen; screen readers still get a page heading. */}
        {focused ? null : <h1 className="visually-hidden">{profile.name}</h1>}
        <ul className="link-stickers" aria-label="Elsewhere">
          {profile.links.map((link, i) => (
            <li key={link.href}>
              <TextStickerLink href={link.href} label={link.label} color={link.color} tilt={i % 2 === 0 ? -5 : 4} />
            </li>
          ))}
          {profile.resumeUrl ? (
            <li>
              <TextStickerLink href={profile.resumeUrl} label="Resume" color="#2e9e6a" tilt={-3} />
            </li>
          ) : null}
        </ul>
      </header>

      <main id={focused ? undefined : 'main'} className="pod-main">
        <PlanetCarousel selected={selected} onSelect={onSelect} restoreFocus={restoreFocus} active={active} focus={focus} />
      </main>

      <div className="pod-floor" aria-hidden="true" />

      <div className="pod-hints" inert={focused}>
        <ButtonHints
          hints={[
            { keys: ['←', '→'], label: 'Turn' },
            { keys: ['Enter'], label: 'Open' },
          ]}
        />
      </div>
    </div>
  );
}
