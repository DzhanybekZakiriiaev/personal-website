import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { sections } from './content';
import { useHashRoute, type Route } from './lib/route';
import { SvgDefs } from './components/SvgDefs';
import { Backdrop } from './components/Backdrop';
import { PodMenu } from './components/PodMenu';
import { SectionPage } from './components/SectionPage';
import { LoadingScreen } from './components/LoadingScreen';
import { TitleScreen } from './components/TitleScreen';
import { Pilot } from './components/Pilot';
import { levelsFor } from './pages/levels';
import { preloadGlobes } from './three/Globe3D';
import type { GlobeBadge, PreloadRequest } from './three/spec';

const START_INDEX = 1; // the middle planet (Projects) starts selected
const MIN_LOADING_MS = 1400; // long enough to enjoy the loading screen, short enough not to annoy

// Every planet with its level badges, so nothing is painted after the loading screen
// goes away. (The pod's planets are the same 'hero' planets, shown smaller.)
function allPlanets(): PreloadRequest[] {
  return sections.map((s) => ({
    kind: s.planet,
    detail: 'hero' as const,
    badges: levelsFor(s.id).map<GlobeBadge>((it) => ({
      id: it.id,
      icon: it.icon,
      color: it.color,
      style: it.badgeStyle ?? 'sticker',
      title: it.title,
      logo: it.logo,
    })),
  }));
}

function usePreload(): { ready: boolean; progress: number } {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const planets = preloadGlobes(allPlanets(), (done, total) => {
      if (!cancelled && total > 0) setProgress(done / total);
    });
    const work = Promise.allSettled([
      planets,
      document.fonts ? document.fonts.ready : Promise.resolve(),
      import('./three/StitchDoll'),
      import('./three/RocketIntro'),
    ]);
    const minimum = new Promise((resolve) => window.setTimeout(resolve, MIN_LOADING_MS));
    void Promise.all([work, minimum]).then(() => {
      if (cancelled) return;
      setProgress(1);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, progress };
}

/**
 * The site's phases: loading -> title (only when the site was opened on the pod,
 * deep links to a section skip it) -> site. The site is mounted (invisible, inert)
 * from the start, so its 3D scenes are already drawing when it appears.
 */
type Phase = 'loading' | 'title' | 'site';

function usePhase(ready: boolean, route: Route): { phase: Phase; start: () => void } {
  const [wantsTitle] = useState(() => route === 'pod');
  const [started, setStarted] = useState(false);
  const start = useCallback(() => setStarted(true), []);
  const phase: Phase = !ready ? 'loading' : wantsTitle && !started ? 'title' : 'site';
  return { phase, start };
}

export default function App() {
  const route = useHashRoute();
  const { ready, progress } = usePreload();
  const { phase, start } = usePhase(ready, route);
  const [selected, setSelected] = useState(() => {
    const index = sections.findIndex((s) => s.id === route);
    return index >= 0 ? index : START_INDEX;
  });
  const siteShown = phase === 'site';

  // While the loading or start screen is up, the (invisible) site underneath must
  // not scroll: otherwise the page shows a second scrollbar next to the start
  // screen's own.
  useEffect(() => {
    const root = document.documentElement;
    if (siteShown) return undefined;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [siteShown]);

  // One scene: the pod is always there; a section route focuses one of its planets.
  const focusIndex = route === 'pod' ? null : sections.findIndex((s) => s.id === route);
  const focus = focusIndex === null || focusIndex < 0 ? null : focusIndex;

  // Remember whether we came back from a section, so focus returns to its planet.
  const previousRoute = useRef(route);
  const cameBack = previousRoute.current !== 'pod' && route === 'pod';
  // A section opened straight from its address starts already focused (no glide).
  const deepLink = useRef(route !== 'pod');

  useEffect(() => {
    if (route !== 'pod') {
      const index = sections.findIndex((s) => s.id === route);
      if (index >= 0) setSelected(index);
    } else {
      deepLink.current = false;
    }
    previousRoute.current = route;
  }, [route]);

  // Where the camera is, for the backdrop's parallax (see carousel.css).
  useLayoutEffect(() => {
    document.documentElement.dataset.view = route === 'pod' ? 'pod' : 'planet';
  }, [route]);

  return (
    <MotionConfig reducedMotion="user">
      <SvgDefs />
      <Backdrop />
      <div className="app-content" inert={!siteShown} data-hidden={siteShown ? undefined : true}>
        <div className="pod-layer">
          <PodMenu
            active={siteShown && route === 'pod'}
            focus={focus}
            selected={focus ?? selected}
            onSelect={setSelected}
            restoreFocus={cameBack}
          />
        </div>
        <AnimatePresence mode="wait">
          {route !== 'pod' ? <SectionPage key={route} id={route} instant={deepLink.current} /> : null}
        </AnimatePresence>
      </div>
      {siteShown ? <Pilot /> : null}
      <AnimatePresence>{phase === 'title' ? <TitleScreen key="title" onStart={start} /> : null}</AnimatePresence>
      <AnimatePresence>{ready ? null : <LoadingScreen key="loading" progress={progress} />}</AnimatePresence>
    </MotionConfig>
  );
}
