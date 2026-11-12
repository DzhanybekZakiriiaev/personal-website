import { lazy, Suspense, type ComponentType } from 'react';
import { hrefFor } from '../lib/route';

type DollProps = { pose?: 'dance' | 'wave' | 'idle'; stage?: boolean };

// Loaded lazily (it pulls in three.js). import.meta.glob keeps the page working
// even if the doll module is missing: the corner then shows just the "Me" tag.
const loaders = import.meta.glob<{ StitchDoll: ComponentType<DollProps> }>('../three/StitchDoll.tsx');
const loadDoll = loaders['../three/StitchDoll.tsx'];
const StitchDoll = loadDoll ? lazy(() => loadDoll().then((m) => ({ default: m.StitchDoll }))) : null;

// Johnny's avatar standing at the side of the pod: an original knitted doll that
// waves, with a "Me" tag pointing at it. The whole corner links to the About page.
export function MeCorner() {
  return (
    <a className="me-corner" href={hrefFor('about')}>
      <span className="me-doll" aria-hidden="true">
        {StitchDoll ? (
          <Suspense fallback={null}>
            <StitchDoll pose="wave" />
          </Suspense>
        ) : null}
      </span>
      <span className="me-tag">
        Me<span className="visually-hidden">: about me</span>
      </span>
      <svg className="me-arrow" viewBox="0 0 60 40" aria-hidden="true" focusable="false">
        <path d="M4 8 C 20 4, 34 10, 40 22 S 50 34, 56 34" />
        <path d="M46 28 L56 34 L47 39" />
      </svg>
    </a>
  );
}
