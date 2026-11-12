import { useId } from 'react';
import type { IconName, PlanetKind } from '../content';
import { ICONS } from './icons';

function useSafeId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function Lighting() {
  return (
    <>
      <circle cx="100" cy="100" r="96" fill="url(#g-shade)" />
      <circle cx="100" cy="100" r="96" fill="url(#g-highlight)" />
    </>
  );
}

function Rim() {
  return (
    <>
      <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1.4" strokeDasharray="5 4" />
      <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(8,12,26,0.55)" strokeWidth="2" />
    </>
  );
}

// A photo fabric texture laid over whatever is underneath (greyscale + soft-light).
function Fabric({ texture, opacity = 0.85, d }: { texture: string; opacity?: number; d?: string }) {
  const style = { mixBlendMode: 'soft-light' as const };
  return d ? (
    <path d={d} fill={`url(#${texture})`} filter="url(#mono)" opacity={opacity} style={style} />
  ) : (
    <rect width="200" height="200" fill={`url(#${texture})`} filter="url(#mono)" opacity={opacity} style={style} />
  );
}

// Knitted world: wool ocean with felt continents stitched on.
const CONTINENTS = [
  { d: 'M40 70 C55 50 85 48 98 60 C110 72 100 92 86 98 C74 104 70 122 58 126 C44 130 36 112 38 98 C40 88 30 82 40 70Z', fill: '#6f9a3c' },
  { d: 'M112 44 C132 34 160 40 170 58 C178 72 166 84 150 86 C138 88 132 100 120 96 C108 92 104 76 108 64 C110 56 106 50 112 44Z', fill: '#8aa84b' },
  { d: 'M120 118 C136 110 156 116 160 132 C164 148 150 160 136 158 C124 156 112 146 112 134 C112 126 114 122 120 118Z', fill: '#c9a25f' },
  { d: 'M60 150 C70 144 84 148 86 158 C88 168 78 174 68 172 C60 170 54 160 60 150Z', fill: '#7da544' },
  { d: 'M84 18 C94 14 108 16 112 24 C114 30 104 34 94 32 C86 30 80 24 84 18Z', fill: '#e8efe9' },
];

function KnitPlanet() {
  const clip = useSafeId('knit');
  return (
    <svg viewBox="0 0 200 200" className="planet-art" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="200" height="200" fill="#2f63a8" filter="url(#felt)" />
        <Fabric texture="tex-knit" opacity={0.95} />
        <rect width="200" height="200" fill="url(#knit)" opacity="0.6" />
        {CONTINENTS.map((c) => (
          <g key={c.d}>
            <path d={c.d} fill={c.fill} filter="url(#felt)" />
            <Fabric texture="tex-felt" d={c.d} />
            <path d={c.d} fill="none" stroke="rgba(40,30,10,0.55)" strokeWidth="1.6" strokeDasharray="4 3" strokeLinecap="round" />
          </g>
        ))}
        <Lighting />
      </g>
      <Rim />
    </svg>
  );
}

// Sticker-covered world: felt planet with project badges stuck all over it.
const BADGES: { x: number; y: number; r: number; tilt: number; icon: IconName; color: string }[] = [
  { x: 64, y: 58, r: 21, tilt: -12, icon: 'trophy', color: '#3b4fb8' },
  { x: 116, y: 46, r: 19, tilt: 8, icon: 'cube', color: '#f08a24' },
  { x: 152, y: 84, r: 21, tilt: -6, icon: 'star', color: '#26306e' },
  { x: 98, y: 98, r: 24, tilt: 4, icon: 'heart', color: '#ffd6e3' },
  { x: 48, y: 112, r: 19, tilt: 14, icon: 'book', color: '#2e9e6a' },
  { x: 140, y: 134, r: 20, tilt: -10, icon: 'chart', color: '#7a5af0' },
  { x: 96, y: 150, r: 21, tilt: 9, icon: 'camera', color: '#0f8b8d' },
  { x: 58, y: 160, r: 15, tilt: -4, icon: 'wave', color: '#b5482f' },
];

function StickerPlanet() {
  const clip = useSafeId('stick');
  return (
    <svg viewBox="0 0 200 200" className="planet-art" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="200" height="200" fill="#7fae3f" filter="url(#felt)" />
        <path d="M0 120 C40 104 70 132 110 118 C150 104 170 124 200 112 V200 H0Z" fill="#c9b64a" filter="url(#felt)" />
        <path d="M120 0 C130 30 160 40 200 34 V0Z" fill="#5f8f33" filter="url(#felt)" />
        <Fabric texture="tex-wool" opacity={0.9} />
        {BADGES.map((b) => (
          <g key={`${b.x}-${b.y}`} transform={`rotate(${b.tilt} ${b.x} ${b.y})`}>
            <circle cx={b.x + 1.5} cy={b.y + 2.5} r={b.r + 3.5} fill="rgba(0,0,0,0.25)" />
            <circle cx={b.x} cy={b.y} r={b.r + 3.5} fill="#fffdf7" />
            <circle cx={b.x} cy={b.y} r={b.r} fill={b.color} />
            <g transform={`translate(${b.x - b.r} ${b.y - b.r}) scale(${(b.r * 2) / 64})`}>{ICONS[b.icon]}</g>
          </g>
        ))}
        <Lighting />
      </g>
      <Rim />
    </svg>
  );
}

// Patchwork moon: khaki felt with stitched craters.
const CRATERS = [
  { x: 70, y: 70, r: 22 },
  { x: 134, y: 60, r: 15 },
  { x: 138, y: 124, r: 26 },
  { x: 78, y: 136, r: 18 },
  { x: 108, y: 96, r: 9 },
  { x: 50, y: 108, r: 8 },
  { x: 168, y: 92, r: 7 },
];

function MoonPlanet() {
  const clip = useSafeId('moon');
  return (
    <svg viewBox="0 0 200 200" className="planet-art" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="200" height="200" fill="#b6a57c" filter="url(#felt)" />
        <Fabric texture="tex-burlap" opacity={0.95} />
        <path d="M10 40 C60 60 120 20 190 50" fill="none" stroke="rgba(70,55,30,0.5)" strokeWidth="1.6" strokeDasharray="4 3" />
        {CRATERS.map((c) => (
          <g key={`${c.x}-${c.y}`}>
            <circle cx={c.x} cy={c.y} r={c.r} fill="#9a8a62" filter="url(#felt)" />
            <circle cx={c.x + c.r * 0.12} cy={c.y + c.r * 0.12} r={c.r * 0.8} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={Math.max(2, c.r * 0.22)} />
            <circle cx={c.x} cy={c.y} r={c.r + 2} fill="none" stroke="rgba(255,248,225,0.55)" strokeWidth="1.3" strokeDasharray="3.5 3" />
          </g>
        ))}
        <Lighting />
      </g>
      <Rim />
    </svg>
  );
}

// Letter moon: pink felt with a stitched envelope and little speech bubbles.
function LetterPlanet() {
  const clip = useSafeId('letter');
  return (
    <svg viewBox="0 0 200 200" className="planet-art" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="200" height="200" fill="#d9487e" filter="url(#felt)" />
        <path d="M0 140 C50 120 90 160 140 140 C170 128 185 136 200 130 V200 H0Z" fill="#b8325f" filter="url(#felt)" />
        <Fabric texture="tex-felt" opacity={0.95} />
        {/* envelope */}
        <g transform="rotate(-8 100 96)">
          <rect x="52" y="66" width="96" height="64" rx="6" fill="#fffdf7" stroke="#1b1b24" strokeWidth="3" />
          <path d="M54 70 L100 106 L146 70" fill="none" stroke="#1b1b24" strokeWidth="3" strokeLinejoin="round" />
          <rect x="58" y="72" width="84" height="52" rx="4" fill="none" stroke="rgba(27,27,36,0.35)" strokeWidth="1.4" strokeDasharray="4 3" />
          <circle cx="132" cy="114" r="9" fill="#ffd84d" stroke="#1b1b24" strokeWidth="2.4" />
        </g>
        {/* speech bubbles */}
        <path d="M40 40 h34 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-18 l-9 8 v-8 h-7 a8 8 0 0 1 -8 -8 v-14 a8 8 0 0 1 8 -8z" fill="#fffdf7" stroke="#1b1b24" strokeWidth="2.6" />
        <path d="M126 150 h30 a7 7 0 0 1 7 7 v12 a7 7 0 0 1 -7 7 h-6 v8 l-9 -8 h-15 a7 7 0 0 1 -7 -7 v-12 a7 7 0 0 1 7 -7z" fill="#9fe3d6" stroke="#1b1b24" strokeWidth="2.6" />
        <Lighting />
      </g>
      <Rim />
    </svg>
  );
}

export function Planet({ kind }: { kind: PlanetKind }) {
  if (kind === 'knit') return <KnitPlanet />;
  if (kind === 'stickers') return <StickerPlanet />;
  if (kind === 'letter') return <LetterPlanet />;
  return <MoonPlanet />;
}
