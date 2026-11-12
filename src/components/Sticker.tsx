import type { CSSProperties } from 'react';
import type { IconName } from '../content';
import { ICONS } from './icons';

interface StickerProps {
  icon: IconName;
  color: string;
  size?: number;
  tilt?: number;
  slap?: boolean;
  delay?: number;
  className?: string;
}

// A die-cut sticker: round colour badge, white border (SVG filter) and a soft shadow.
// Decorative, so it's hidden from screen readers.
export function Sticker({ icon, color, size = 64, tilt = 0, slap = false, delay = 0, className = '' }: StickerProps) {
  const style = {
    width: size,
    height: size,
    '--tilt': `${tilt}deg`,
    '--delay': `${delay}ms`,
  } as CSSProperties;

  return (
    <span className={`sticker${slap ? ' sticker--slap' : ''} ${className}`} style={style} aria-hidden="true">
      <svg viewBox="-4 -4 72 72" width={size} height={size} focusable="false">
        <g filter="url(#diecut)">
          <circle cx="32" cy="32" r="29" fill={color} />
          {ICONS[icon]}
        </g>
      </svg>
    </span>
  );
}

interface TextStickerLinkProps {
  href: string;
  label: string;
  color: string;
  tilt?: number;
}

// A word cut out as a sticker, used for the outside links.
export function TextStickerLink({ href, label, color, tilt = 0 }: TextStickerLinkProps) {
  const style = { '--tilt': `${tilt}deg`, '--sticker-color': color } as CSSProperties;
  return (
    <a className="text-sticker" href={href} style={style} target="_blank" rel="noreferrer">
      {label}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
