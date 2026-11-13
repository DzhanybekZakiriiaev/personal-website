import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { adoptBootSplash } from './components/LoadingScreen';
import { preloadEverything } from './lib/preload';
import { initSound, startMusic } from './lib/sound';
import { initUiSounds } from './lib/uiSounds';
import './styles.css';
import './text-texture.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Start every download, worker paint and shader compile now, before React renders
// the whole site; the loading screen subscribes to this same run for its progress.
void preloadEverything();
// The boot splash in index.html has been animating; the React loading screen continues it.
adoptBootSplash();
// Sound settings now; the theme music as soon as the loading screen's downloads are
// done (or on the first tap or key press, where the browser blocks sound until then).
initSound();
void preloadEverything().then(startMusic);
// Felt pops and plucks for every link and button.
initUiSounds();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
