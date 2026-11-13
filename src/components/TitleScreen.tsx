// The start screen ("the Me screen"): Sackboy flies a felt rocket and waves, next
// to a cardboard name sign and a short summary card. "Back to start" on the pod
// opens it again with the rocket flying back in from the pilot's spot. Start
// (click, Enter or Space) plays the "takes control" moment, then onStart() fires
// as the rocket sets off, so the planets appear behind it. This screen stays
// mounted (usePresence) while the rocket flies down onto the pilot's start pose
// around the pod's centre planet; there pilotTakeOver() hands it to <Pilot /> and
// this screen removes itself.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, usePresence, useReducedMotion } from 'motion/react';
import { profile } from '../content';
import { pilotHold, pilotTakeOver } from '../lib/pilot';
import { playUiSound } from '../lib/uiSounds';
import { EXIT_TIME, RocketIntro, type RocketFrame } from '../three/RocketIntro';
import { prefersReducedMotionNow } from '../three/StitchDoll';
import { TextStickerLink } from './Sticker';
import { SoundStitch } from './SoundStitch';
import './title.css';

export interface TitleScreenProps {
  /** Called as the rocket sets off (or after the reduced-motion fade); show the site then. */
  onStart: () => void;
  /**
   * Opened with "Back to start": the rocket picks the pilot up where it is, flies at
   * the viewer and settles into its spot while the sign and card come back.
   */
  returning?: boolean;
}

/**
 * return: "Back to start": the rocket flies back in from the pilot's spot.
 * title:  waiting for Start.
 * launch: pulling the joystick, flame flaring.
 * flight: onStart() has fired; the rocket flies to the pilot's orbit while the rest leaves.
 * fading: reduced motion: a plain fade, then onStart().
 */
type Stage = 'return' | 'title' | 'launch' | 'flight' | 'fading';

const LAUNCH_MS = 480;
const FADE_MS = 300;
/** How long :root[data-arrival='rocket'] stays set, for an optional pod entrance. */
const ARRIVAL_MS = 1600;
const LINK_TILTS = [-3, 2.5, -1.5];

function sameFrame(a: RocketFrame, b: RocketFrame) {
  return Math.abs(a.cx - b.cx) < 0.002 && Math.abs(a.cy - b.cy) < 0.002 && Math.abs(a.w - b.w) < 0.002 && Math.abs(a.h - b.h) < 0.002;
}

export function TitleScreen({ onStart, returning = false }: TitleScreenProps) {
  const reducedPref = useReducedMotion();
  const reduced = reducedPref ?? prefersReducedMotionNow();
  const [isPresent, safeToRemove] = usePresence();
  const headingId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const [frame, setFrame] = useState<RocketFrame>({ cx: 0.5, cy: 0.5, w: 1, h: 0.5 });
  const [stage, setStage] = useState<Stage>(() => (returning && !reduced ? 'return' : 'title'));
  const flyingBack = useRef(stage === 'return');
  const onReturnEnd = useCallback(() => {
    flyingBack.current = false;
    setStage((s) => (s === 'return' ? 'title' : s));
  }, []);

  // Back without a flight (reduced motion): the pilot just hides and this fades in.
  useEffect(() => {
    if (returning && reduced) pilotHold();
  }, [returning, reduced]);
  const started = useRef(false);
  const appStarted = useRef(false);
  const tookOver = useRef(false);
  const removed = useRef(false);
  const removeRef = useRef(safeToRemove);
  useEffect(() => {
    removeRef.current = safeToRemove;
  }, [safeToRemove]);

  const startApp = useCallback(() => {
    if (appStarted.current) return;
    appStarted.current = true;
    onStart();
  }, [onStart]);

  const takeOver = useCallback(() => {
    if (tookOver.current) return;
    tookOver.current = true;
    pilotTakeOver();
  }, []);

  const removeSelf = useCallback(() => {
    if (removed.current) return;
    removed.current = true;
    removeRef.current?.();
  }, []);

  const start = useCallback(() => {
    if (started.current || flyingBack.current) return; // not until the rocket is back in its spot
    started.current = true;
    playUiSound('start');
    if (reduced) {
      setStage('fading');
      return;
    }
    pilotHold(); // the pilot waits until this rocket lands on its orbit
    setStage('launch');
  }, [reduced]);

  // Focus Start on arrival.
  useEffect(() => {
    startRef.current?.focus({ preventScroll: true });
  }, []);

  // Enter or Space anywhere starts (but not while a link or other control has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'Enter' && e.key !== ' ' && e.code !== 'Space') return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && target !== startRef.current && target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  // After the joystick and thumbs-up, the rocket sets off and the site starts underneath.
  useEffect(() => {
    if (stage !== 'launch') return undefined;
    const timer = window.setTimeout(() => {
      setStage('flight');
      const root = document.documentElement;
      root.dataset.arrival = 'rocket';
      window.setTimeout(() => {
        if (root.dataset.arrival === 'rocket') delete root.dataset.arrival;
      }, ARRIVAL_MS);
      startApp();
    }, LAUNCH_MS);
    return () => window.clearTimeout(timer);
  }, [stage, startApp]);

  // Reduced motion: a plain fade, then the site.
  useEffect(() => {
    if (stage !== 'fading') return undefined;
    const timer = window.setTimeout(startApp, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [stage, startApp]);

  // The rocket has landed on the pilot's orbit (RocketIntro called pilotTakeOver): go.
  const onFlightEnd = useCallback(() => {
    tookOver.current = true;
    removeSelf();
  }, [removeSelf]);

  // Safety net: if the 3D flight cannot run (no WebGL, hidden tab), hand over anyway.
  useEffect(() => {
    if (stage !== 'flight') return undefined;
    const timer = window.setTimeout(() => {
      takeOver();
      removeSelf();
    }, EXIT_TIME * 1000 + 900);
    return () => window.clearTimeout(timer);
  }, [stage, takeOver, removeSelf]);

  // Removed by the parent without a flight (reduced motion, or another reason): go now.
  useEffect(() => {
    if (!isPresent && stage !== 'flight') {
      takeOver();
      removeSelf();
    }
  }, [isPresent, stage, takeOver, removeSelf]);

  // Never leave the pilot on hold if this screen disappears early.
  useEffect(
    () => () => {
      if (started.current && !tookOver.current) pilotTakeOver();
    },
    [],
  );

  // Tell the 3D scene where the rocket's spot is (viewport fractions; the canvas is
  // fixed to the viewport), so it fits there at any screen size. Frozen once started.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const box = stageRef.current;
    if (!root || !box) return undefined;
    const update = () => {
      if (started.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const s = box.getBoundingClientRect();
      if (vw < 1 || vh < 1) return;
      const next = { cx: (s.left + s.width / 2) / vw, cy: (s.top + s.height / 2) / vh, w: s.width / vw, h: s.height / vh };
      setFrame((prev) => (sameFrame(prev, next) ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    observer.observe(box);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const launching = stage === 'launch' || stage === 'flight';
  const className = `title${launching ? ' is-launching' : ''}${stage === 'flight' ? ' is-leaving' : ''}${
    stage === 'return' ? ' is-returning' : ''
  }`;

  return (
    <motion.section
      ref={rootRef}
      className={className}
      aria-labelledby={headingId}
      // Coming back, the rocket is already on screen: no fade for the scene (the sign
      // and card make their usual entrance).
      initial={{ opacity: returning && !reduced ? 1 : 0 }}
      animate={{ opacity: stage === 'fading' ? 0 : 1 }}
      transition={stage === 'fading' ? { duration: FADE_MS / 1000, ease: 'linear' } : { duration: reduced ? 0.25 : 0.5, ease: 'easeOut' }}
    >
      <div className="title-scene" aria-hidden="true">
        <RocketIntro
          launching={launching && !reduced}
          exiting={stage === 'flight'}
          onFlightEnd={onFlightEnd}
          returning={stage === 'return'}
          onReturnEnd={onReturnEnd}
          reduced={reduced}
          frame={frame}
        />
      </div>

      <div className="title-inner">
        <div className="title-sign-area">
          <div className="title-hang">
            <span className="title-string title-string--left" aria-hidden="true" />
            <span className="title-string title-string--right" aria-hidden="true" />
            <div className="title-sign">
              <h1 id={headingId} className="title-name">
                {profile.name}
              </h1>
              <p className="title-role">
                {profile.tagline} · {profile.location}
              </p>
            </div>
          </div>
        </div>

        <div className="title-hero">
          <div ref={stageRef} className="title-stage" />
          <div className="title-actions">
            <div className="title-actions-inner">
              {/* start() plays its own sound, for Enter anywhere too */}
              <button ref={startRef} type="button" className="title-start" onClick={start} data-no-sound>
                <span className="title-start-tag">
                  Start
                  <kbd className="title-key" aria-hidden="true">
                    Enter
                  </kbd>
                </span>
              </button>
              <p className="title-hint" aria-hidden="true">
                Press Enter
              </p>
            </div>
          </div>
        </div>

        <div className="title-summary">
          <div className="title-card">
            <p className="title-pitch">{profile.pitch}</p>
          </div>
          {profile.links.length > 0 ? (
            <ul className="title-links">
              {profile.links.map((link, i) => (
                <li key={link.href}>
                  <TextStickerLink href={link.href} label={link.label} color={link.color} tilt={LINK_TILTS[i % LINK_TILTS.length]} />
                </li>
              ))}
            </ul>
          ) : null}
          <SoundStitch className="title-sound" />
        </div>
      </div>
    </motion.section>
  );
}
