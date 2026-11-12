// In-portal "under construction" screen for projects that are not deployed and
// whose repo is not public yet: felt caution tape, a hanging cardboard sign,
// felt traffic cones and Sackboy dancing on a little felt stage.
import { useEffect, useRef } from 'react';
import { StitchDoll } from '../../three/StitchDoll';
import { SackboyModel } from '../../three/Sackboy';
import type { WorkingOnItProps } from './types';
import './working.css';

/** A small felt traffic cone with white bands and running stitches. */
function FeltCone({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 80" focusable="false" aria-hidden="true">
      <ellipse cx="32" cy="76.5" rx="29" ry="3.5" fill="rgb(50 25 70 / 0.22)" />
      {/* base plate */}
      <rect x="4" y="66" width="56" height="10" rx="3.5" fill="#d9541b" />
      <path d="M9 71.2 H55" fill="none" stroke="#ffe8cc" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3.2 3" />
      {/* cone body */}
      <path d="M27.5 6 Q32 2.6 36.5 6 L52 66 H12 Z" fill="#ff7d2e" stroke="#e8611c" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M32 4.2 Q34.6 4.4 36.5 6 L52 66 H35 Z" fill="#b8410c" opacity="0.18" />
      {/* reflective bands, layered felt */}
      <path d="M22.6 25 H41.4 L44 35 H20 Z" fill="#fff4e3" />
      <path d="M17.4 45 H46.6 L49.2 55 H14.8 Z" fill="#fff4e3" />
      <path d="M22.4 30 H41.6 M17.2 50 H46.8" fill="none" stroke="#f08a4b" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2.6 2.6" />
      {/* running stitches along the edges */}
      <path
        d="M29.4 12 L16.4 62 M34.6 12 L47.6 62"
        fill="none"
        stroke="#fff0dc"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="3 3.2"
        opacity="0.9"
      />
      {/* soft felt highlight */}
      <path d="M28.6 9 L19 50" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" opacity="0.22" />
    </svg>
  );
}

export function WorkingOnIt({ title, onBack }: WorkingOnItProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the heading so screen readers announce the new screen.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="woi">
      {/* masking tape pinning the felt panel into the pocket */}
      <span className="woi-pin woi-pin--left" aria-hidden="true" />
      <span className="woi-pin woi-pin--right" aria-hidden="true" />
      <div className="woi-layout">
        <div className="woi-sign-area">
          <div className="woi-hang">
            <span className="woi-string woi-string--left" aria-hidden="true" />
            <span className="woi-string woi-string--right" aria-hidden="true" />
            <div className="woi-sign">
              <h3 ref={headingRef} tabIndex={-1} className="woi-title">
                Working on it!
              </h3>
            </div>
          </div>
        </div>

        <div className="woi-stage" aria-hidden="true">
          <span className="woi-floor" />
          <span className="woi-tape" />
          <div className="woi-doll">
            <StitchDoll pose="dance" figure={SackboyModel} />
          </div>
          <FeltCone className="woi-cone woi-cone--left" />
          <FeltCone className="woi-cone woi-cone--right" />
        </div>

        <div className="woi-copy">
          <p className="woi-lead">{title} is still in the workshop. The repo will be public soon.</p>
          <p className="woi-note">Maintenance in progress: bolts tightened, stitches added, bugs shooed away.</p>
          <button type="button" className="woi-back" onClick={onBack}>
            <span className="woi-back-tag">Back to the level</span>
          </button>
        </div>
      </div>
    </div>
  );
}
