import type { CSSProperties, ReactNode } from 'react';
import './backdrop.css';

// The page background: blue linen (a CC0 fabric photo, see backdrop.css) with a
// few original stickers sewn on as felt patches around the edges, where nothing
// else sits.
interface StickerDef {
  id: string;
  style: CSSProperties;
  art: ReactNode;
}

const INK = '#1b1b24';

// Kyrgyz flag sun: 40 rays around the disc.
function sunRays(cx: number, cy: number, inner: number, outer: number, count = 40): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const half = Math.PI / count / 1.6;
    const p = (r: number, t: number) => `${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`;
    parts.push(`M${p(inner, a - half)} L${p(outer, a)} L${p(inner, a + half)}Z`);
  }
  return parts.join(' ');
}

const KG_RAYS = sunRays(32, 32, 7.5, 13.5);

const STICKERS: StickerDef[] = [
  {
    id: 'kyrgyzstan',
    style: { left: '3.5%', top: '84%', width: 96, rotate: '-7deg' },
    art: (
      <g>
        <rect x="4" y="14" width="56" height="37" rx="3" fill="#e8112d" stroke={INK} strokeWidth="2.2" />
        <path d={KG_RAYS} fill="#ffef00" />
        <circle cx="32" cy="32.5" r="7.6" fill="#ffef00" />
        <circle cx="32" cy="32.5" r="5" fill="none" stroke="#e8112d" strokeWidth="1.5" />
        <path
          d="M28.2 29.6c2.4 2 5.2 2 7.6 0M27.4 32.5c3 2.2 6.2 2.2 9.2 0M28.2 35.4c2.4-2 5.2-2 7.6 0"
          fill="none"
          stroke="#e8112d"
          strokeWidth="1.2"
          strokeLinecap="round"
          transform="rotate(90 32 32.5)"
        />
        <path
          d="M28.2 29.6c2.4 2 5.2 2 7.6 0M27.4 32.5c3 2.2 6.2 2.2 9.2 0M28.2 35.4c2.4-2 5.2-2 7.6 0"
          fill="none"
          stroke="#e8112d"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>
    ),
  },
  {
    id: 'star',
    style: { left: '2.5%', top: '44%', width: 84, rotate: '-12deg' },
    art: (
      <g stroke={INK} strokeWidth="2.6" strokeLinejoin="round">
        <path d="M32 6l7.6 15.6 17.2 2.5-12.4 12.1 2.9 17.1L32 45.2l-15.3 8.1 2.9-17.1L7.2 24.1l17.2-2.5z" fill="#ffd23f" />
        <circle cx="26" cy="29" r="2.2" fill={INK} stroke="none" />
        <circle cx="38" cy="29" r="2.2" fill={INK} stroke="none" />
        <path d="M26 36c3 3 9 3 12 0" fill="none" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: 'maple',
    style: { left: '5%', top: '70%', width: 74, rotate: '10deg' },
    art: (
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <path
          d="M32 6l5 10 6-3-2 13 9-8 1 6 8-1-4 9 4 3-14 9 2 6-12-2v12h-6V48l-12 2 2-6-14-9 4-3-4-9 8 1 1-6 9 8-2-13 6 3z"
          fill="#e5312b"
        />
      </g>
    ),
  },
  {
    id: 'rainbow',
    style: { right: '3%', top: '24%', width: 92, rotate: '8deg' },
    art: (
      <g strokeLinecap="round" fill="none">
        <path d="M8 46a24 24 0 0 1 48 0" stroke="#e5312b" strokeWidth="7" />
        <path d="M15 46a17 17 0 0 1 34 0" stroke="#ffd23f" strokeWidth="7" />
        <path d="M22 46a10 10 0 0 1 20 0" stroke="#2e9e6a" strokeWidth="7" />
        <path d="M4 48h14M46 48h14" stroke="#ffffff" strokeWidth="8" />
      </g>
    ),
  },
  {
    id: 'mug',
    style: { right: '2.5%', top: '46%', width: 70, rotate: '-9deg' },
    art: (
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M14 24h30v20a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z" fill="#2f63a8" />
        <path d="M44 28h4a6 6 0 0 1 0 12h-4" fill="none" />
        <path d="M22 18c0-4 4-4 4-8M30 18c0-4 4-4 4-8" fill="none" strokeLinecap="round" />
        <path d="M21 34h16" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: 'plane',
    style: { right: '6%', top: '80%', width: 72, rotate: '-6deg' },
    art: (
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M6 30L58 10 44 54 32 38z" fill="#ffffff" />
        <path d="M32 38L58 10 24 34z" fill="#d9e6f5" />
        <path d="M32 38l-4 12 4-8" fill="#b8c9de" />
      </g>
    ),
  },
  {
    id: 'hi',
    style: { right: '11%', top: '64%', width: 78, rotate: '6deg' },
    art: (
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round">
        <path d="M8 14h48v28H30l-10 9v-9H8z" fill="#ff7eb6" />
        <text
          x="32"
          y="35"
          textAnchor="middle"
          fontFamily="Fredoka, 'Trebuchet MS', sans-serif"
          fontWeight="700"
          fontSize="18"
          fill={INK}
          stroke="none"
        >
          hi!
        </text>
      </g>
    ),
  },
];

// Each sticker is a felt patch stitched onto the linen: a felt shape with a soft
// shadow, a running stitch just inside its edge, and the picture on top.
const PATCHES: Record<string, { shape: 'circle' | 'rect'; fill: string; stitch: string }> = {
  kyrgyzstan: { shape: 'rect', fill: '#e8112d', stitch: '#ffef00' },
  star: { shape: 'circle', fill: '#fff4dc', stitch: '#c8146a' },
  maple: { shape: 'circle', fill: '#ffffff', stitch: '#e5312b' },
  rainbow: { shape: 'circle', fill: '#d8ecff', stitch: '#2f63a8' },
  mug: { shape: 'circle', fill: '#ffd25a', stitch: '#8a6a00' },
  plane: { shape: 'circle', fill: '#ffc2da', stitch: '#c8146a' },
  hi: { shape: 'circle', fill: '#9fe0d3', stitch: '#0f6b5e' },
};

function Patch({ id, children }: { id: string; children: ReactNode }) {
  const patch = PATCHES[id] ?? { shape: 'circle', fill: '#fffdf7', stitch: '#1b1b24' };
  if (patch.shape === 'rect') {
    // The flag is its own patch: stitch round the flag itself.
    return (
      <>
        {children}
        <rect x="7" y="17" width="50" height="31" rx="2" fill="none" stroke={patch.stitch} strokeWidth="1.3" strokeDasharray="3 2.4" strokeLinecap="round" opacity="0.9" />
        <rect x="4" y="14" width="56" height="37" rx="3" fill="url(#tex-felt)" filter="url(#mono)" opacity="0.35" style={{ mixBlendMode: 'soft-light' }} />
      </>
    );
  }
  return (
    <>
      <circle cx="32" cy="32" r="31" fill={patch.fill} />
      <circle cx="32" cy="32" r="31" fill="url(#tex-felt)" filter="url(#mono)" opacity="0.45" style={{ mixBlendMode: 'soft-light' }} />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke={patch.stitch} strokeWidth="1.6" strokeDasharray="3.4 2.8" strokeLinecap="round" />
      <g transform="translate(32 32) scale(0.66) translate(-32 -32)">{children}</g>
    </>
  );
}

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {STICKERS.map((s) => (
        <svg key={s.id} className={`bg-sticker bg-sticker--${s.id}`} viewBox="-2 -2 68 68" style={s.style} focusable="false">
          <Patch id={s.id}>{s.art}</Patch>
        </svg>
      ))}
    </div>
  );
}
