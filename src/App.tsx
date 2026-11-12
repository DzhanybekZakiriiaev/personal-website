import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { sections } from './content';
import { useHashRoute, type Route } from './lib/route';
import { POD_LEAVE_MS, clearFlight, hasPendingFlight } from './lib/flight';
import { SvgDefs } from './components/SvgDefs';
import { Backdrop } from './components/Backdrop';
import { PodMenu } from './components/PodMenu';
import type { PodFlight } from './components/PlanetCarousel';
import { SectionPage } from './components/SectionPage';
import { LoadingScreen } from './components/LoadingScreen';
import { TitleScreen } from './components/TitleScreen';
import { levelsFor } from './pages/levels';
import { preloadGlobes } from './three/Globe3D';
import type { GlobeBadge, PreloadRequest } from './three/spec';

const START_INDEX = 1; // the middle planet (Projects) starts selected
const MIN_LOADING_MS = 1400; // long enough to enjoy the loading screen, short enough not to annoy

// Every planet (small pod versions and big section versions with their badges),
// so nothing is painted after the loading screen goes away.
function allPlanets(): PreloadRequest[] {
  return [
    ...sections.map((s) => ({ kind: s.planet, detail: 'pod' as const })),
    ...sections.map((s) => ({
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
    })),
  ];
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

/**
 * The pod stays mounted while a section is open (its four 3D planets aren't rebuilt
 * on every return). Around a flight it stays on screen as a fixed layer under the
 * section page:
 *   leaving:  just opened a section from the pod; its other planets fly off.
 *   arriving: back from a section; its planets fly in while the section flies its
 *             globe home, until the section page is gone.
 */
type PodMode = 'shown' | 'leaving' | 'arriving' | 'hidden';

function usePodMode(route: Route) {
  const [mode, setMode] = useState<PodMode>(route === 'pod' ? 'shown' : 'hidden');
  const [top, setTop] = useState(0);
  const [lastRoute, setLastRoute] = useState(route);

  // Decided while rendering the new route, so the pod never blinks out for a frame.
  if (route !== lastRoute) {
    setLastRoute(route);
    if (route === 'pod') {
      clearFlight();
      setMode('arriving');
    } else if (lastRoute === 'pod') {
      const flying = hasPendingFlight();
      setMode(flying ? 'leaving' : 'hidden');
      setTop(flying ? -window.scrollY : 0); // keep the pod where it was while the page scrolls to the top
    }
  }

  useEffect(() => {
    if (mode !== 'leaving') return undefined;
    const timer = window.setTimeout(() => setMode('hidden'), POD_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onSectionGone = useCallback(() => {
    if (modeRef.current !== 'arriving') return;
    window.scrollTo(0, 0);
    setMode('shown');
  }, []);

  const flight: PodFlight = mode === 'leaving' ? 'leaving' : mode === 'arriving' ? 'arriving' : null;
  return { mode, top, flight, onSectionGone };
}

export default function App() {
  const route = useHashRoute();
  const { ready, progress } = usePreload();
  const { phase, start } = usePhase(ready, route);
  const pod = usePodMode(route);
  const [selected, setSelected] = useState(() => {
    const index = sections.findIndex((s) => s.id === route);
    return index >= 0 ? index : START_INDEX;
  });
  const siteShown = phase === 'site';

  // Remember whether we came back from a section, so focus returns to its planet.
  const previousRoute = useRef(route);
  const cameBack = previousRoute.current !== 'pod' && route === 'pod';

  useEffect(() => {
    if (route !== 'pod') {
      const index = sections.findIndex((s) => s.id === route);
      if (index >= 0) setSelected(index);
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
        <div
          className={`pod-layer${pod.flight ? ' is-overlay' : ''}`}
          hidden={pod.mode === 'hidden'}
          style={pod.mode === 'leaving' && pod.top ? { top: pod.top } : undefined}
        >
          <PodMenu
            active={siteShown && route === 'pod'}
            flight={pod.flight}
            selected={selected}
            onSelect={setSelected}
            restoreFocus={cameBack}
          />
        </div>
        <AnimatePresence mode="wait" onExitComplete={pod.onSectionGone}>
          {route !== 'pod' ? <SectionPage key={route} id={route} /> : null}
        </AnimatePresence>
      </div>
      <AnimatePresence>{phase === 'title' ? <TitleScreen key="title" onStart={start} /> : null}</AnimatePresence>
      <AnimatePresence>{ready ? null : <LoadingScreen key="loading" progress={progress} />}</AnimatePresence>
    </MotionConfig>
  );
}
