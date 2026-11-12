import type { ReactNode } from 'react';
import type { IconName } from '../../content';

/**
 * What the portal's "Visit now!" button does for a project:
 * 'live' = open the deployed site, 'repo' = open the public GitHub repo,
 * 'soon' = show the in-portal "Working on it" screen.
 */
export type LevelAction =
  | { kind: 'live'; href: string }
  | { kind: 'repo'; href: string }
  | { kind: 'soon' };

export interface WorkingOnItProps {
  /** Project title, shown on the sign. */
  title: string;
  /** Go back to the project details inside the portal. */
  onBack: () => void;
}

// One "level" on a planet: a badge stuck on the planet that opens an info card,
// and from there a zippered portal with the full details.
export interface LevelItem {
  id: string;
  title: string;
  /** Short line under the title, e.g. "1st of 750+ · StormHacks 2026". */
  meta?: string;
  /** One or two sentences shown on the info card. */
  summary: string;
  icon: IconName;
  color: string;
  /** Hackathon logo (image URL). Shown instead of the icon on the badge, tab and polaroid. */
  logo?: string;
  /** 'rosette' for wins (ribbon rosette badge), 'sticker' otherwise. */
  badgeStyle?: 'sticker' | 'rosette';
  /** Small word on the info card's cardboard label strip, e.g. "Hackathon win". */
  kicker?: string;
  /** Projects only: the portal's "Visit now!" action. */
  action?: LevelAction;
  /** Full content shown inside the zipper portal. */
  detail: ReactNode;
}

export interface ZipperPortalProps {
  open: boolean;
  /**
   * Viewport point (px) of the opened pocket on the planet. The white light the
   * portal opens with grows out of this point, and shrinks back into it on close.
   */
  origin?: { x: number; y: number };
  /** Fires after the close animation has finished (the light is back in the pocket). */
  onExited?: () => void;
  /** Small word for the cardboard label strip, e.g. "Hackathon win". */
  kicker?: string;
  /** The level's badge art (logo or icon sticker), shown big on the card. */
  art?: ReactNode;
  /** Accent colour of the level (badge colour). */
  color?: string;
  title: string;
  meta?: string;
  onClose: () => void;
  children: ReactNode;
}
