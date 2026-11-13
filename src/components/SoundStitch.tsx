// The sound stitch: a stitched felt tag with a sound on/off button and a volume
// slider (a running stitch with a felt button for a knob), for the music and the
// button sounds. Shared state lives in src/lib/sound.ts.
import type { CSSProperties } from 'react';
import { setSoundOn, setSoundVolume, useSound } from '../lib/sound';
import './stitch-controls.css';

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg className="stitch-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      {on ? (
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * compact: just the on/off button, as a small round felt button (section pages, where
 * space is tight; the volume slider lives on the start and planets screens).
 */
export function SoundStitch({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { on, volume } = useSound();
  const level = on ? Math.round(volume * 100) : 0;
  if (compact) {
    return (
      <button
        type="button"
        className={`sound-round ${className}`}
        aria-label="Sound"
        aria-pressed={on}
        data-sound-control
        data-sound="toggle"
        onClick={() => setSoundOn(!on)}
      >
        <SpeakerIcon on={on} />
      </button>
    );
  }
  return (
    <div className={`stitch-tag sound-stitch ${className}`} data-sound-control data-sound="toggle">
      <button type="button" className="sound-toggle" aria-pressed={on} onClick={() => setSoundOn(!on)}>
        <SpeakerIcon on={on} />
        <span>Sound</span>
      </button>
      <input
        type="range"
        className="sound-volume"
        min={0}
        max={100}
        step={1}
        value={level}
        aria-label="Sound volume"
        onChange={(e) => setSoundVolume(Number(e.currentTarget.value) / 100)}
        style={{ '--fill': `${level}%` } as CSSProperties}
      />
    </div>
  );
}
