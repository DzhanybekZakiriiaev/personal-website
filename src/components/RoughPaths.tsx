import type { RoughPath } from '../lib/rough';

export function RoughPaths({ paths }: { paths: RoughPath[] }) {
  return (
    <>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fill={p.fill ?? 'none'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}
