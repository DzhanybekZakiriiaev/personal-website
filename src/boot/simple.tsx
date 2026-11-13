// The simple version: no 3D, no preloading, no sound. Loaded by main.tsx instead of
// the 3D site (see lib/viewMode.ts); React replaces the boot splash on first render.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SimpleReason } from '../lib/viewMode';
import { SimpleSite } from '../simple/SimpleSite';

export function bootSimple(root: HTMLElement, reason: SimpleReason | null): void {
  createRoot(root).render(
    <StrictMode>
      <SimpleSite reason={reason} />
    </StrictMode>,
  );
}
