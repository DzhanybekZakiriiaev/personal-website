// The pilot layer: mount once for the whole site (when the site phase starts). It
// draws the knitted doll's rocket around whatever planet src/lib/pilot.ts targets.
// Fixed, full screen, transparent, aria-hidden and never in the way of clicks.
// Its z-index flips between var(--pilot-z-front, 4) and var(--pilot-z-back, 0)
// (see the contract in src/lib/pilot.ts).
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { usePilotState } from '../lib/pilot';
import { PilotRocket } from '../three/PilotRocket';
import { canUseWebGL, prefersReducedMotionNow } from '../three/StitchDoll';

const LAYER_STYLE: CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none' };

export function Pilot() {
  const reducedPref = useReducedMotion();
  const reduced = reducedPref ?? prefersReducedMotionNow();
  const [webgl] = useState(canUseWebGL);
  const layer = useRef<HTMLDivElement>(null);
  const { target, held } = usePilotState();

  // The z-index is owned by the 3D loop (front/back); start in front.
  useLayoutEffect(() => {
    const el = layer.current;
    if (el && !el.style.zIndex) el.style.zIndex = 'var(--pilot-z-front, 4)';
  }, [webgl]);

  if (!webgl) return null;

  const shown = target !== null && !held;
  return (
    <div ref={layer} className="pilot-layer" aria-hidden="true" style={{ ...LAYER_STYLE, visibility: shown ? 'visible' : 'hidden' }}>
      <PilotRocket reduced={reduced} idle={target === null} layer={layer} />
    </div>
  );
}
