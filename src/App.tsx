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
import { preloadEverything } from './lib/preload';

const START_INDEX = 1; // the middle planet (Projects) starts selected
const MIN_LOADING_MS = 1400; // long enough to enjoy the loading screen, short enough not to annoy

// The mandatory loading screen waits for everything (lib/preload.ts): fonts, every
// texture and logo, the 3D modules, every planet's maps and badges (painted in
// workers), the title and pilot scenes and their shaders. It never rejects.
function usePreload(): { ready: boolean; progress: number } {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const work = preloadEverything((done, total) => {
      if (!cancelled && total > 0) setProgress(done / total);
    });
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

function usePhase(
  ready: boolean,
  route: Route,
): { phase: Phase; start: () => void; backToStart: () => void; visit: number } {
  const [wantsTitle, setWantsTitle] = useState(() => route === 'pod');
  const [started, setStarted] = useState(false);
  // Bumps on every "Back to start", so the start screen opens fresh each time.
  const [visit, setVisit] = useState(0);
  const start = useCallback(() => setStarted(true), []);
  const backToStart = useCallback(() => {
    setWantsTitle(true);
    setStarted(false);
    setVisit((v) => v + 1);
  }, []);
  const phase: Phase = !ready ? 'loading' : wantsTitle && !started ? 'title' : 'site';
  return { phase, start, backToStart, visit };
}

/** How long the pod fades out under the start screen after "Back to start". */
const LEAVE_MS = 600;

export default function App() {
  const route = useHashRoute();
  const { ready, progress } = usePreload();
  const { phase, start, backToStart, visit } = usePhase(ready, route);
  const [selected, setSelected] = useState(() => {
    const index = sections.findIndex((s) => s.id === route);
    return index >= 0 ? index : START_INDEX;
  });
  const siteShown = phase === 'site';

  // "Back to start": the pod stays visible (fading) while the rocket flies at the
  // viewer, then hides as usual under the start screen.
  const [leaving, setLeaving] = useState(false);
  const goBackToStart = useCallback(() => {
    setLeaving(true);
    backToStart();
  }, [backToStart]);
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(() => setLeaving(false), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // The pilot layer stays mounted once the site has been shown: it carries on drawing
  // until the start screen's rocket picks it up, and it is not rebuilt on every visit.
  const [pilotMounted, setPilotMounted] = useState(false);
  useEffect(() => {
    if (siteShown) setPilotMounted(true);
  }, [siteShown]);

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
      <div
        className="app-content"
        inert={!siteShown}
        data-hidden={siteShown || leaving ? undefined : true}
        data-leaving={leaving && !siteShown ? true : undefined}
      >
        <div className="pod-layer">
          <PodMenu
            active={siteShown && route === 'pod'}
            focus={focus}
            selected={focus ?? selected}
            onSelect={setSelected}
            restoreFocus={cameBack}
            onBackToStart={goBackToStart}
          />
        </div>
        <AnimatePresence mode="wait">
          {route !== 'pod' ? <SectionPage key={route} id={route} instant={deepLink.current} active={siteShown} /> : null}
        </AnimatePresence>
      </div>
      {siteShown || pilotMounted ? <Pilot /> : null}
      <AnimatePresence>
        {phase === 'title' ? <TitleScreen key={`title-${visit}`} onStart={start} returning={visit > 0} /> : null}
      </AnimatePresence>
      <AnimatePresence>{ready ? null : <LoadingScreen key="loading" progress={progress} />}</AnimatePresence>
    </MotionConfig>
  );
}
