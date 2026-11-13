import { useEffect } from 'react';
import { profile } from '../content';
import { ButtonHints } from './ButtonHints';
import { TextStickerLink } from './Sticker';
import { PlanetCarousel } from './PlanetCarousel';
import { SoundStitch } from './SoundStitch';
import './stitch-controls.css';

interface PodMenuProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
  /** false while a section is open (or the site is not shown yet): no keys, no pointer. */
  active?: boolean;
  /** The focused section's planet while a section page is open, else null. */
  focus?: number | null;
  /** Fly back to the start screen. */
  onBackToStart?: () => void;
}

/** A little felt rocket, nose up and to the left (towards "back"). */
function BackRocketIcon() {
  return (
    <svg className="stitch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g transform="rotate(-135 12 12)">
        <path d="M12 2.5c3 2.4 4.2 6 4.2 9.6V17H7.8v-4.9C7.8 8.5 9 4.9 12 2.5z" fill="#fffaf0" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="1.9" fill="#d9541b" />
        <path d="M7.8 13.5 5.5 17.5h2.3M16.2 13.5l2.3 4h-2.3" fill="#d9541b" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M10 17.5l2 3.5 2-3.5" fill="#ffb347" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// The pod: the scene every page lives in. On its own it is the planet carousel; with a
// section open, the section's planet is focused and the pod's own chrome steps back.
export function PodMenu({ selected, onSelect, restoreFocus, active = true, focus = null, onBackToStart }: PodMenuProps) {
  // Every time the pod opens (first load, or back from a section).
  useEffect(() => {
    if (active) document.title = profile.name;
  }, [active]);

  const focused = focus !== null;

  return (
    <div className={`pod${focused ? ' is-focused' : ''}`}>
      {/* Left column: back to the start screen, and the music. */}
      <div className="pod-side" inert={focused}>
        {onBackToStart ? (
          <button type="button" className="stitch-button" data-sound="back" onClick={onBackToStart}>
            <span className="stitch-tag">
              <BackRocketIcon />
              Back to start
            </span>
          </button>
        ) : null}
        <SoundStitch />
      </div>

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
