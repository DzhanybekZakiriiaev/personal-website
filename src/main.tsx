import './styles.css';
import './text-texture.css';
// In the first, render-blocking stylesheet: the boot splash in index.html needs it to
// show (and offer the simple version) before any JavaScript has arrived.
import './components/loading.css';
import { decideViewMode } from './lib/viewMode';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// 3D site or simple version (lib/viewMode.ts)? Each is its own download, so the
// simple version never fetches three.js or the planet painting code.
const view = decideViewMode();
if (view.mode === 'simple') {
  void import('./boot/simple').then((m) => m.bootSimple(root, view.reason));
} else {
  void import('./boot/full').then((m) => m.bootFull(root));
}
