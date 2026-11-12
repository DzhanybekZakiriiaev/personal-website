import { useEffect } from 'react';
import { profile, sections } from '../content';
import { go } from '../lib/route';
import { podPlanetRect, startFlight } from '../lib/flight';
import { ButtonHints } from './ButtonHints';
import { TextStickerLink } from './Sticker';
import { PlanetCarousel, type PodFlight } from './PlanetCarousel';

interface PodMenuProps {
  selected: number;
  onSelect: (index: number) => void;
  restoreFocus: boolean;
  /** false while a section page is open: the pod stays mounted (planets alive) but hidden. */
  active?: boolean;
  /** 'leaving' right after opening a section, 'arriving' while coming back from one. */
  flight?: PodFlight;
}

export function PodMenu({ selected, onSelect, restoreFocus, active = true, flight = null }: PodMenuProps) {
  // Every time the pod opens (first load, or back from a section).
  useEffect(() => {
    if (active) document.title = profile.name;
  }, [active]);

  // Fly to the centre planet: note where it is on screen, then open its section. The
  // section page starts its big globe right there and flies it into place.
  const openSection = (index: number) => {
    const id = sections[index].id;
    const from = podPlanetRect();
    onSelect(index);
    if (from) startFlight(id, from);
    go(id);
  };

  const flightClass = flight === 'leaving' ? ' is-leaving' : flight === 'arriving' ? ' is-arriving' : '';

  return (
    <div className={`pod${flightClass}`}>
      <header className="pod-header">
        {/* The name card lives on the start screen; screen readers still get a page heading. */}
        <h1 className="visually-hidden">{profile.name}</h1>
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

      <main id={active ? 'main' : undefined} className="pod-main">
        <PlanetCarousel
          selected={selected}
          onSelect={onSelect}
          restoreFocus={restoreFocus}
          active={active}
          flight={flight}
          onOpen={openSection}
        />
      </main>

      <div className="pod-floor" aria-hidden="true" />

      <ButtonHints
        hints={[
          { keys: ['←', '→'], label: 'Turn' },
          { keys: ['Enter'], label: 'Open' },
        ]}
      />
    </div>
  );
}
