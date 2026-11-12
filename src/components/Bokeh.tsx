import type { CSSProperties } from 'react';

// Soft out-of-focus lights behind everything. Pure CSS gradients; the drift
// animation only moves transform/opacity and stops under reduced motion.
const LIGHTS = [
  { x: 12, y: 18, size: 180, hue: '120 160 255', alpha: 0.18, delay: 0 },
  { x: 82, y: 12, size: 140, hue: '255 170 210', alpha: 0.16, delay: -4 },
  { x: 68, y: 58, size: 260, hue: '110 200 255', alpha: 0.12, delay: -8 },
  { x: 24, y: 70, size: 220, hue: '170 140 255', alpha: 0.14, delay: -2 },
  { x: 92, y: 78, size: 160, hue: '255 220 160', alpha: 0.12, delay: -6 },
  { x: 46, y: 30, size: 120, hue: '200 230 255', alpha: 0.12, delay: -10 },
  { x: 6, y: 46, size: 100, hue: '255 190 230', alpha: 0.14, delay: -12 },
];

export function Bokeh() {
  return (
    <div className="bokeh" aria-hidden="true">
      {LIGHTS.map((light) => (
        <span
          key={`${light.x}-${light.y}`}
          className="bokeh-light"
          style={
            {
              left: `${light.x}%`,
              top: `${light.y}%`,
              width: light.size,
              height: light.size,
              background: `radial-gradient(circle, rgb(${light.hue} / ${light.alpha}) 0%, rgb(${light.hue} / ${light.alpha * 0.6}) 45%, transparent 70%)`,
              animationDelay: `${light.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
