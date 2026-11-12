import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { profile, sections } from '../content';
import { go } from '../lib/route';
import { HangingPlanet, type HangLayout } from './HangingPlanet';
import { ButtonHints } from './ButtonHints';
import { TextStickerLink } from './Sticker';

// Positions left to right, like planets hanging in the pod window. One entry per section.
const LAYOUTS: HangLayout[] = [
  { x: '17%', stringLength: 'clamp(190px, 27vh, 290px)', size: 'side', arrow: 'up-right', swayDelay: '-1.3s', labelShift: '-62%' },
  { x: '43%', stringLength: 'clamp(100px, 15vh, 190px)', size: 'center', arrow: 'up', swayDelay: '-2.6s', labelShift: '-38%' },
  { x: '67%', stringLength: 'clamp(60px, 10vh, 140px)', size: 'side', arrow: 'up-right', swayDelay: '-0.4s', labelShift: '-70%' },
  { x: '87%', stringLength: 'clamp(140px, 21vh, 240px)', size: 'small', arrow: 'up-right', swayDelay: '-3.1s', labelShift: '-74%' },
];

const ZOOM_MS = 520;

interface PodMenuProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
}

export function PodMenu({ selected, onSelect, restoreFocus }: PodMenuProps) {
  const reduceMotion = useReducedMotion();
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const [zoomingIndex, setZoomingIndex] = useState<number | null>(null);
  const zoomTimer = useRef<number | undefined>(undefined);

  // Cancel a pending zoom navigation if the pod unmounts first (e.g. browser Back).
  useEffect(() => () => window.clearTimeout(zoomTimer.current), []);

  useEffect(() => {
    document.title = profile.name;
    if (restoreFocus) links.current[selected]?.focus();
    // Run once when the pod opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = (index: number) => {
    const count = sections.length;
    const next = (index + count) % count;
    onSelect(next);
    links.current[next]?.focus();
  };

  // Arrow keys work like a controller d-pad, even before anything has focus.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const active = document.activeElement;
      const onPlanet = links.current.some((link) => link === active);
      if (onPlanet || zoomingIndex !== null) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return; // keep browser shortcuts like Alt+Left
      const nothingFocused = !active || active === document.body;
      if (!nothingFocused) return;
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
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: sections.length - 1,
    };
    if (event.key in keys) {
      event.preventDefault();
      moveTo(keys[event.key]);
    }
  };

  // Zoom into the planet, then open the section. With reduced motion, go straight there.
  const onActivate = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (reduceMotion || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (zoomingIndex !== null) return;
    onSelect(index);
    setZoomingIndex(index);
    zoomTimer.current = window.setTimeout(() => go(sections[index].id), ZOOM_MS);
  };

  return (
    <div className="pod">
      <header className="pod-header">
        <div className="name-card">
          <h1 className="name-bubble">{profile.name}</h1>
          <p className="name-tagline">
            {profile.tagline} · {profile.location}
          </p>
          <p className="name-pitch">{profile.pitch}</p>
        </div>
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

      <main id="main" className="pod-main">
        <nav aria-label="Sections">
          <ul className="planet-row">
            {sections.map((section, i) => (
              <HangingPlanet
                key={section.id}
                section={section}
                layout={LAYOUTS[i]}
                selected={i === selected}
                zooming={zoomingIndex === i}
                hidden={zoomingIndex !== null && zoomingIndex !== i}
                seed={20 + i * 13}
                linkRef={(el) => {
                  links.current[i] = el;
                }}
                onSelect={() => onSelect(i)}
                onKeyDown={(event) => onPlanetKeyDown(event, i)}
                onActivate={(event) => onActivate(event, i)}
              />
            ))}
          </ul>
        </nav>
      </main>

      <div className="pod-floor" aria-hidden="true" />

      <ButtonHints
        hints={[
          { keys: ['←', '→'], label: 'Choose' },
          { keys: ['Enter'], label: 'Select' },
        ]}
      />
    </div>
  );
}
