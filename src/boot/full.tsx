// The 3D site: preload everything behind the loading screen, then the start screen
// and the planets. Loaded by main.tsx only when the 3D site is the one to show.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';
import { adoptBootSplash } from '../components/LoadingScreen';
import { preloadEverything } from '../lib/preload';
import { initSound, startMusic } from '../lib/sound';
import { initUiSounds } from '../lib/uiSounds';

export function bootFull(root: HTMLElement): void {
  // Start every download, worker paint and shader compile now, before React renders
  // the whole site; the loading screen subscribes to this same run for its progress.
  void preloadEverything();
  // The boot splash in index.html has been animating; the React loading screen continues it.
  adoptBootSplash();
  // Sound settings now; the theme music as soon as the loading screen's downloads are
  // done (or on the first click or tap, where the browser blocks sound until then).
  initSound();
  void preloadEverything().then(startMusic);
  // Felt pops and plucks for every link and button.
  initUiSounds();

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
