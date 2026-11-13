// The small "Gamified | Simple" switch (start screen, the pod's left column and the
// simple version's header). Each side is a link: switching reloads into the other
// view (lib/viewMode.ts), which keeps the section address.
import { viewUrl, type ViewMode } from '../lib/viewMode';
import './view-toggle.css';

const SIDES: { mode: ViewMode; label: string }[] = [
  { mode: '3d', label: 'Gamified' },
  { mode: 'simple', label: 'Simple' },
];

function SideIcon({ mode }: { mode: ViewMode }) {
  return mode === '3d' ? (
    // a little planet with a ring
    <svg className="view-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M2.5 15.5c2-1.6 6-3.6 10-4.6s7.6-1.2 9-.4" fill="none" />
    </svg>
  ) : (
    // a page of text
    <svg className="view-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M9 11h6M9 14.5h6M9 18h4" fill="none" />
    </svg>
  );
}

/** compact: icons only (narrow screens); the words stay for screen readers and as tooltips. */
export function ViewToggle({ current, className = '', compact = false }: { current: ViewMode; className?: string; compact?: boolean }) {
  const word = (label: string) => <span className={compact ? 'visually-hidden' : undefined}>{label}</span>;
  return (
    <div className={`view-toggle${compact ? ' view-toggle--compact' : ''} ${className}`} role="group" aria-label="View" data-current={current}>
      {SIDES.map(({ mode, label }) =>
        mode === current ? (
          <span key={mode} className="view-toggle-side is-current" aria-current="true" title={compact ? label : undefined}>
            <SideIcon mode={mode} />
            {word(label)}
          </span>
        ) : (
          <a key={mode} className="view-toggle-side" href={viewUrl(mode)} data-no-sound title={compact ? `${label} view` : undefined}>
            <SideIcon mode={mode} />
            {word(label)}
            <span className="visually-hidden"> view</span>
          </a>
        ),
      )}
    </div>
  );
}
