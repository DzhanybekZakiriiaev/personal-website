interface Hint {
  keys: string[];
  label: string;
}

// The controller-style hint bar at the bottom, using keyboard keys.
export function ButtonHints({ hints }: { hints: Hint[] }) {
  return (
    <p className="hints">
      {hints.map((hint) => (
        <span className="hint" key={hint.label}>
          {hint.keys.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
          <span className="hint-label">{hint.label}</span>
        </span>
      ))}
    </p>
  );
}
