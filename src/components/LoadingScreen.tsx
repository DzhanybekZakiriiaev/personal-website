import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import './loading.css';

const LINES = [
  'Knitting the oceans…',
  'Sewing on the continents…',
  'Sticking on the stickers…',
  'Ironing the felt…',
  'Untangling the yarn…',
  'Polishing the trophy…',
  'Teaching the doll to dance…',
  'Counting the stitches…',
];

const R = 92; // radius of the stitch ring
const RING = 2 * Math.PI * R;

// Shown until every 3D planet is painted: a felt planet being stitched round its
// edge, the needle moving with the real progress, and a rotating silly status line.
export function LoadingScreen({ progress }: { progress: number }) {
  const reduceMotion = useReducedMotion();
  const [line, setLine] = useState(0);
  const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  const angle = (pct / 100) * 360 - 90; // start at the top

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), 1300);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <motion.div
      className="loading"
      role="progressbar"
      aria-label="Loading the planets"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.55, ease: 'easeInOut' }}
    >
      <div className="loading-stage" aria-hidden="true">
        <span className="loading-yarn" />
        <div className="loading-planet">
          <svg viewBox="0 0 240 240" className="loading-art">
            <defs>
              <clipPath id="loading-clip">
                <circle cx="120" cy="120" r="86" />
              </clipPath>
              <mask id="loading-sewn">
                <circle
                  cx="120"
                  cy="120"
                  r={R}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - pct / 100)}
                  transform="rotate(-90 120 120)"
                />
              </mask>
            </defs>
            <g clipPath="url(#loading-clip)">
              <circle cx="120" cy="120" r="86" className="loading-ocean" />
              <path className="loading-land" d="M58 92c14-22 46-26 60-10 10 12 0 30-16 34-12 3-14 22-28 24-16 2-24-16-22-30 1-8-2-12 6-18z" />
              <path className="loading-land loading-land--2" d="M132 60c20-10 46-2 54 16 6 14-6 26-22 26-12 0-18 12-30 8-12-4-16-20-12-32 2-8 2-14 10-18z" />
              <path className="loading-land loading-land--3" d="M128 150c14-8 34-2 38 12 4 16-10 26-24 24-12-2-22-10-22-22 0-6 2-10 8-14z" />
              <circle cx="120" cy="120" r="86" className="loading-shade" />
            </g>
            <circle cx="120" cy="120" r={R} className="loading-guide" />
            <circle cx="120" cy="120" r={R} className="loading-stitch" mask="url(#loading-sewn)" />
            <g
              transform={`translate(${(120 + R * Math.cos((angle * Math.PI) / 180)).toFixed(2)} ${(120 + R * Math.sin((angle * Math.PI) / 180)).toFixed(2)}) rotate(${(angle + 90).toFixed(1)})`}
            >
              <path className="loading-thread" d="M0 0c-8 10-4 18-16 26" />
              <g className="loading-needle">
                <path d="M-3 -26 L3 -26 L1.2 18 L0 26 L-1.2 18 Z" />
                <ellipse cx="0" cy="-19" rx="1.3" ry="4" className="loading-needle-eye" />
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div className="loading-tag">
        <p className="loading-title">Stitching your planets</p>
        <p className="loading-line" aria-hidden="true">
          {reduceMotion ? 'Almost there…' : LINES[line]}
        </p>
        <p className="loading-pct" aria-hidden="true">
          {pct}%
        </p>
      </div>
    </motion.div>
  );
}
