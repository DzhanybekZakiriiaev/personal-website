import type { ReactNode } from 'react';
import type { IconName } from '../content';

// Original sticker artwork, each drawn in a 64 x 64 box centred on (32, 32).
const INK = '#1b1b24';
const WHITE = '#fffdf7';

function gearPath(teeth: number, outer: number, inner: number): string {
  const points: string[] = [];
  const step = (Math.PI * 2) / (teeth * 2);
  for (let i = 0; i < teeth * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a1 = i * step - step / 2;
    const a2 = i * step + step / 2;
    points.push(`${(32 + r * Math.cos(a1)).toFixed(2)},${(32 + r * Math.sin(a1)).toFixed(2)}`);
    points.push(`${(32 + r * Math.cos(a2)).toFixed(2)},${(32 + r * Math.sin(a2)).toFixed(2)}`);
  }
  return `M${points.join(' L')}Z`;
}

const GEAR = gearPath(8, 19, 14);

export const ICONS: Record<IconName, ReactNode> = {
  trophy: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M21 16h22v8c0 8-5 13-11 13s-11-5-11-13z" fill="#f6c443" />
      <path d="M21 19h-5c0 6 3 9 7 9M43 19h5c0 6-3 9-7 9" fill="none" />
      <path d="M29 37h6v6h-6z" fill="#f6c443" />
      <path d="M23 43h18v5H23z" fill="#c98a1b" />
    </g>
  ),
  code: (
    <g stroke={WHITE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M24 22l-9 10 9 10M40 22l9 10-9 10M35 18l-6 28" />
    </g>
  ),
  database: (
    <g stroke={INK} strokeWidth="2.4" fill="#9fe3d6">
      <ellipse cx="32" cy="19" rx="14" ry="5" />
      <path d="M18 19v26c0 3 6 5 14 5s14-2 14-5V19" />
      <path d="M18 28c0 3 6 5 14 5s14-2 14-5M18 37c0 3 6 5 14 5s14-2 14-5" fill="none" />
    </g>
  ),
  robot: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 11v6" fill="none" />
      <circle cx="32" cy="10" r="3" fill="#f6c443" />
      <rect x="17" y="18" width="30" height="24" rx="7" fill="#d9e4f0" />
      <circle cx="26" cy="29" r="3.5" fill={INK} />
      <circle cx="38" cy="29" r="3.5" fill={INK} />
      <path d="M26 36h12" fill="none" strokeLinecap="round" />
      <path d="M22 42h20v8H22z" fill="#9db3c9" />
    </g>
  ),
  pin: (
    <g stroke={INK} strokeWidth="2.4">
      <path d="M32 52S18 36 18 26a14 14 0 0 1 28 0c0 10-14 26-14 26z" fill="#ff6b4a" />
      <circle cx="32" cy="26" r="5" fill={WHITE} />
    </g>
  ),
  bulb: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 12a13 13 0 0 0-8 23c2 2 3 4 3 7h10c0-3 1-5 3-7a13 13 0 0 0-8-23z" fill="#ffe066" />
      <path d="M27 46h10M28 51h8" fill="none" strokeLinecap="round" />
    </g>
  ),
  heart: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 50S13 38 13 25a9.5 9.5 0 0 1 19-3 9.5 9.5 0 0 1 19 3c0 13-19 25-19 25z" fill="#ff5d8f" />
      <path d="M17 30h8l3-6 5 12 3-6h10" fill="none" stroke={WHITE} strokeWidth="2.6" strokeLinecap="round" />
    </g>
  ),
  cube: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 12l18 10-18 10-18-10z" fill="#ffd27a" />
      <path d="M14 22v20l18 10V32z" fill="#f08a24" />
      <path d="M50 22v20L32 52V32z" fill="#c4641a" />
    </g>
  ),
  camera: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M14 22h9l3-5h12l3 5h9v24H14z" fill="#d9e4f0" />
      <circle cx="32" cy="34" r="8" fill="#2b3a55" />
      <circle cx="29.5" cy="31.5" r="2.4" fill={WHITE} stroke="none" />
    </g>
  ),
  wave: (
    <g stroke={WHITE} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d="M16 30v4M22 24v16M28 18v28M34 22v20M40 27v10M46 23v18" />
    </g>
  ),
  cap: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M8 26l24-11 24 11-24 11z" fill="#2b2b3a" />
      <path d="M18 31v9c4 4 9 6 14 6s10-2 14-6v-9l-14 6z" fill="#3f3f55" />
      <path d="M52 28v12" fill="none" />
      <circle cx="52" cy="42" r="2.5" fill="#f6c443" />
    </g>
  ),
  rocket: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 9c8 6 11 15 9 27H23c-2-12 1-21 9-27z" fill="#e9eef5" />
      <circle cx="32" cy="23" r="4.5" fill="#5aa9e6" />
      <path d="M23 30l-7 8 7 2M41 30l7 8-7 2" fill="#ff6b4a" />
      <path d="M27 36l5 13 5-13z" fill="#ffb02e" />
    </g>
  ),
  gear: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d={GEAR} fill="#c9d3df" />
      <circle cx="32" cy="32" r="6" fill={WHITE} />
    </g>
  ),
  chart: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M16 48h32" fill="none" strokeLinecap="round" />
      <rect x="18" y="34" width="7" height="14" fill="#5aa9e6" />
      <rect x="28.5" y="25" width="7" height="23" fill="#ffd166" />
      <rect x="39" y="16" width="7" height="32" fill="#ff6b4a" />
    </g>
  ),
  book: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 20c-6-4-12-4-18-2v26c6-2 12-2 18 2z" fill={WHITE} />
      <path d="M32 20c6-4 12-4 18-2v26c-6-2-12-2-18 2z" fill="#e8f4ec" />
      <path d="M32 20v26" fill="none" />
    </g>
  ),
  globe: (
    <g stroke={INK} strokeWidth="2.4" fill="none">
      <circle cx="32" cy="32" r="16" fill="#5aa9e6" />
      <path d="M16 32h32M32 16c-6 5-6 27 0 32M32 16c6 5 6 27 0 32" />
      <path d="M24 22c3 2 5 1 7 4M36 38c3 0 5 2 6 4" stroke="#2e9e6a" strokeWidth="3" />
    </g>
  ),
  star: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M32 11l6.2 13.3 14.6 1.8-10.8 10 2.9 14.4L32 43.4l-12.9 7.1 2.9-14.4-10.8-10 14.6-1.8z" fill="#ffd84d" />
    </g>
  ),
  chat: (
    <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
      <path d="M14 16h36v24H30l-9 8v-8h-7z" fill={WHITE} />
      <path d="M21 25h22M21 31h14" fill="none" strokeLinecap="round" />
    </g>
  ),
};
