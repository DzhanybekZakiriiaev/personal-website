import { useMemo } from 'react';
import { curvePaths, ellipsePaths, linePaths, type RoughPath } from '../lib/rough';
import { useElementSize } from '../lib/useElementSize';
import { INK, PAPER, PINK, PINK_DARK } from '../lib/colors';
import { RoughPaths } from './RoughPaths';

export type ArrowDirection = 'up-right' | 'up';

interface LabelBubbleProps {
  text: string;
  note?: string;
  selected: boolean;
  arrow: ArrowDirection;
  seed: number;
}

const PAD_X = 26;
const PAD_Y = 14;

type Segment = [number, number, number, number];

// Curly hand-drawn arrow from the bubble toward its planet.
function CurlyArrow({ direction, selected, seed }: { direction: ArrowDirection; selected: boolean; seed: number }) {
  const paths = useMemo(() => {
    const shaft: [number, number][] =
      direction === 'up'
        ? [[30, 58], [22, 46], [30, 36], [38, 28], [32, 16], [30, 6]]
        : [[8, 56], [20, 50], [16, 38], [28, 32], [42, 34], [52, 22], [62, 8]];
    const [tx, ty] = shaft[shaft.length - 1];
    const head: Segment[] =
      direction === 'up'
        ? [[tx, ty, tx - 8, ty + 9], [tx, ty, tx + 8, ty + 8]]
        : [[tx, ty, tx - 11, ty + 2], [tx, ty, tx - 1, ty + 11]];

    const draw = (stroke: string, width: number, s: number): RoughPath[] => [
      ...curvePaths(shaft, { seed: s, roughness: 1.2, strokeWidth: width, stroke }),
      ...head.flatMap(([x1, y1, x2, y2], i) =>
        linePaths(x1, y1, x2, y2, { seed: s + i + 1, roughness: 1, strokeWidth: width, stroke }),
      ),
    ];

    return selected ? draw(PINK, 4.5, seed) : [...draw(INK, 7, seed), ...draw(PAPER, 3.2, seed)];
  }, [direction, selected, seed]);

  return (
    <svg className={`curly-arrow curly-arrow--${direction}`} viewBox="0 0 70 64" aria-hidden="true" focusable="false">
      <RoughPaths paths={paths} />
    </svg>
  );
}

// Planet label: a white oval speech bubble with a hand-drawn outline (pink when selected).
export function LabelBubble({ text, note, selected, arrow, seed }: LabelBubbleProps) {
  const [textRef, size] = useElementSize<HTMLSpanElement>();
  const width = size.width + PAD_X * 2;
  const height = size.height + PAD_Y * 2;

  const outline = useMemo(
    () =>
      size.width === 0
        ? []
        : ellipsePaths(width / 2 + 6, height / 2 + 6, width, height, {
            seed,
            roughness: 1.3,
            bowing: 1,
            strokeWidth: 3.2,
            stroke: selected ? PINK_DARK : INK,
            fill: selected ? PINK : PAPER,
            fillStyle: 'solid',
          }),
    [width, height, seed, selected, size.width],
  );

  return (
    <span className={`label${selected ? ' label--selected' : ''} label--${arrow}`}>
      <span className="bubble">
        <svg className="bubble-shape" width={width + 12} height={height + 12} aria-hidden="true" focusable="false">
          <RoughPaths paths={outline} />
        </svg>
        <CurlyArrow direction={arrow} selected={selected} seed={seed + 5} />
        <span ref={textRef} className="bubble-text">
          {text}
        </span>
      </span>
      {note ? <span className="bubble-note">{note}</span> : null}
    </span>
  );
}
