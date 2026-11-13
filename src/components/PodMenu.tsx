import { useEffect, useId, useRef, useState } from 'react';
import { profile } from '../content';
import { ButtonHints } from './ButtonHints';
import { TextStickerLink } from './Sticker';
import { PlanetCarousel } from './PlanetCarousel';
import { SoundStitch } from './SoundStitch';
import { ViewToggle } from './ViewToggle';
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

/** A chain link, for the narrow screens' Links button. */
function LinkIcon() {
  return (
    <svg className="stitch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type OutLink = { href: string; label: string; color: string };

// Narrow screens: the outside links fold into one round felt "Links" button that drops a
// small stitched card with the stickers. Closes on a click outside, Escape, or when
// focus moves on.
function LinksMenu({ links }: { links: OutLink[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = `links-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="links-menu"
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="round-felt links-menu-button"
        aria-label="Links"
        title="Links"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <LinkIcon />
      </button>
      <ul id={panelId} className="links-menu-panel" hidden={!open}>
        {links.map((link, i) => (
          <li key={link.href}>
            <TextStickerLink href={link.href} label={link.label} color={link.color} tilt={i % 2 === 0 ? -3 : 2} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The pod: the scene every page lives in. On its own it is the planet carousel; with a
// section open, the section's planet is focused and the pod's own chrome steps back.
export function PodMenu({ selected, onSelect, restoreFocus, active = true, focus = null, onBackToStart }: PodMenuProps) {
  // Every time the pod opens (first load, or back from a section).
  useEffect(() => {
    if (active) document.title = `${profile.name} · ${profile.tagline}`;
  }, [active]);

  const focused = focus !== null;
  const links: OutLink[] = profile.resumeUrl
    ? [...profile.links, { href: profile.resumeUrl, label: 'Resume', color: '#2e9e6a' }]
    : profile.links;

  return (
    <div className={`pod${focused ? ' is-focused' : ''}`}>
      {/* The name card lives on the start screen; screen readers still get a page heading. */}
      {focused ? null : <h1 className="visually-hidden">{profile.name}</h1>}

      {/* Narrow screens: everything in one compact row (the column and the link
          stickers below are hidden there, see stitch-controls.css). */}
      <div className="pod-bar" inert={focused}>
        {onBackToStart ? (
          <button type="button" className="round-felt" aria-label="Back to start" title="Back to start" data-sound="back" onClick={onBackToStart}>
            <BackRocketIcon />
          </button>
        ) : null}
        <SoundStitch compact />
        <ViewToggle current="3d" compact />
        <LinksMenu links={links} />
      </div>

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
        <ViewToggle current="3d" className="pod-view" />
      </div>

      <header className="pod-header" inert={focused}>
        <ul className="link-stickers" aria-label="Elsewhere">
          {links.map((link, i) => (
            <li key={link.href}>
              <TextStickerLink href={link.href} label={link.label} color={link.color} tilt={i % 2 === 0 ? -5 : 4} />
            </li>
          ))}
        </ul>
      </header>

      {/* The main landmark only while no section is open (the section page has its own). */}
      <div role={focused ? undefined : 'main'} id={focused ? undefined : 'main'} className="pod-main">
        <PlanetCarousel selected={selected} onSelect={onSelect} restoreFocus={restoreFocus} active={active} focus={focus} />
      </div>

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
