import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { circlePaths } from '../lib/rough';
import { PINK } from '../lib/colors';
import { RoughPaths } from './RoughPaths';

// The hand-drawn pink selection ring. It "boils" (redraws with a new seed a few
// times a second) like hand-animated linework, unless reduced motion is on.
export function PinkRing() {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 4), 140);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const paths = useMemo(
    () =>
      circlePaths(110, 110, 200, {
        seed: 11 + frame * 37,
        roughness: 2.1,
        bowing: 1.8,
        strokeWidth: 7,
        stroke: PINK,
      }),
    [frame],
  );

  return (
    <svg className="pink-ring" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
      <RoughPaths paths={paths} />
    </svg>
  );
}
