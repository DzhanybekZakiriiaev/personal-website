import type { CSSProperties, KeyboardEvent, MouseEvent, Ref } from 'react';
import { motion } from 'motion/react';
import type { SectionDef } from '../content';
import { hrefFor } from '../lib/route';
import { Planet } from './Planets';
import { PinkRing } from './PinkRing';
import { LabelBubble, type ArrowDirection } from './LabelBubble';

export interface HangLayout {
  x: string; // horizontal position of the string
  stringLength: string; // how far the planet hangs down
  size: 'side' | 'center' | 'small';
  arrow: ArrowDirection;
  swayDelay: string;
  labelShift: string;
}

interface HangingPlanetProps {
  section: SectionDef;
  layout: HangLayout;
  selected: boolean;
  zooming: boolean;
  hidden: boolean;
  seed: number;
  linkRef: Ref<HTMLAnchorElement>;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void;
  onActivate: (event: MouseEvent<HTMLAnchorElement>) => void;
}

// One planet hanging from the top of the screen on a string. The whole thing is a
// single link (planet + label), so it reads as one item to screen readers.
export function HangingPlanet({
  section,
  layout,
  selected,
  zooming,
  hidden,
  seed,
  linkRef,
  onSelect,
  onKeyDown,
  onActivate,
}: HangingPlanetProps) {
  const style = {
    '--x': layout.x,
    '--string': layout.stringLength,
    '--sway-delay': layout.swayDelay,
    '--label-shift': layout.labelShift,
  } as CSSProperties;

  return (
    <li className={`hang hang--${layout.size}${selected ? ' is-selected' : ''}`} style={style}>
      <span className="hang-string" aria-hidden="true" />
      <a
        ref={linkRef}
        className="planet-link"
        href={hrefFor(section.id)}
        onFocus={onSelect}
        onMouseEnter={onSelect}
        onKeyDown={onKeyDown}
        onClick={onActivate}
      >
        <motion.span
          className="planet-body"
          initial={false}
          animate={{
            scale: zooming ? 6 : selected ? 1.08 : 0.9,
            opacity: hidden ? 0 : 1,
          }}
          transition={
            zooming
              ? { duration: 0.55, ease: [0.5, 0, 0.75, 0] }
              : { type: 'spring', stiffness: 260, damping: 14 }
          }
        >
          <Planet kind={section.planet} />
          {selected && !zooming ? <PinkRing /> : null}
        </motion.span>
        <motion.span className="planet-label" animate={{ opacity: zooming || hidden ? 0 : 1 }} transition={{ duration: 0.2 }}>
          <LabelBubble text={section.label} note={section.note} selected={selected} arrow={layout.arrow} seed={seed} />
        </motion.span>
      </a>
    </li>
  );
}
