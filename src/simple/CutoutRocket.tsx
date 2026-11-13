// The simple version's rocket: the felt rocket as a paper cut-out, animated like
// stop-motion. It is drawn in a handful of frames, each a slightly different roll
// (the porthole and fins slide round as it turns) with its own flame, and CSS shows
// one frame at a time (simple.css). The whole cut-out also hops along a little
// flight path in steps. With reduced motion only the first frame shows, still.

const FRAMES = 10;
const FRAME_S = 0.11;
// Roll angle per frame (degrees): rocks one way and back, like a toy on a string.
const ROLL = [0, 18, 34, 42, 30, 10, -12, -30, -38, -20];
// Flame length per frame, so it flickers.
const FLAME = [1, 0.82, 1.08, 0.9, 1.14, 0.78, 1.02, 0.86, 1.12, 0.8];
// Tiny jitter per frame (px, deg): cut-outs never sit exactly where they did.
const JITTER: [number, number, number][] = [
  [0, 0, 0],
  [0.6, -0.4, 0.8],
  [-0.5, 0.3, -0.6],
  [0.3, 0.6, 0.5],
  [-0.4, -0.5, -0.9],
  [0.5, 0.2, 0.4],
  [-0.6, 0.4, -0.3],
  [0.2, -0.6, 0.9],
  [-0.3, 0.5, -0.5],
  [0.4, -0.2, 0.3],
];

const BODY = 'M0 -58C20 -44 24 -12 21 30H-21C-24 -12 -20 -44 0 -58Z';
const NOSE = 'M0 -58C12 -50 17 -40 19.5 -30H-19.5C-17 -40 -12 -50 0 -58Z';

function Frame({ i }: { i: number }) {
  const a = (ROLL[i] * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  // porthole slides across the body as it rolls, and narrows near the edge
  const wx = 13 * sin;
  const wrx = 10.5 * Math.max(0.25, cos);
  // side fins grow or shrink with the roll; the front fin shows when turned
  const left = 1 - 0.35 * sin;
  const right = 1 + 0.35 * sin;
  const front = 17 * Math.sin(a * 1.2);
  const flame = FLAME[i];
  const [jx, jy, jr] = JITTER[i];
  const fin = (side: 1 | -1, k: number) =>
    `M${side * 18} 4C${side * (22 + 12 * k)} 12 ${side * (26 + 14 * k)} 30 ${side * (24 + 12 * k)} 44L${side * 15} 32Z`;
  const flameOuter = `M-13 30C-12 ${44 * flame} -4 ${52 * flame} 0 ${66 * flame}C4 ${52 * flame} 12 ${44 * flame} 13 30Z`;
  const flameInner = `M-7 30C-6 ${40 * flame} -2 ${46 * flame} 0 ${54 * flame}C2 ${46 * flame} 6 ${40 * flame} 7 30Z`;
  const stripe = `M-21.6 12H21.6L21.2 22H-21.2Z`;

  const parts = (
    <>
      <path d={flameOuter} className="cr-flame" />
      <path d={flameInner} className="cr-flame-in" />
      <path d={fin(-1, left)} className="cr-fin" />
      <path d={fin(1, right)} className="cr-fin" />
      <path d={BODY} className="cr-body" />
      <path d={NOSE} className="cr-nose" />
      <path d={stripe} className="cr-stripe" />
      {Math.abs(front) > 2 ? <rect x={front - 3.2} y={8} width={6.4} height={38} rx={3} className="cr-fin cr-fin--front" /> : null}
      <ellipse cx={wx} cy={-8} rx={wrx + 3} ry={13.5} className="cr-rim" />
      <ellipse cx={wx} cy={-8} rx={wrx} ry={10.5} className="cr-glass" />
      <ellipse cx={wx - wrx * 0.35} cy={-12} rx={wrx * 0.28} ry={3.2} className="cr-shine" />
    </>
  );

  return (
    <g
      className="cr-frame"
      style={{ animationDelay: `${-(FRAMES - i) * FRAME_S}s` }}
      transform={`translate(${jx} ${jy}) rotate(${jr})`}
    >
      {/* the paper margin round the cut-out: every shape again, fat and white */}
      <g className="cr-margin">{parts}</g>
      <g className="cr-ink">{parts}</g>
      {/* running stitches on the body and nose */}
      <path d="M0 -50C14 -39 17 -14 15 24" className="cr-stitch" transform={`translate(${-6 * sin} 0)`} />
      <path d="M-15 24C-17 -14 -14 -39 0 -50" className="cr-stitch" transform={`translate(${-6 * sin} 0)`} />
    </g>
  );
}

export function CutoutRocket() {
  return (
    <div className="cr" aria-hidden="true">
      {/* dashed thread it flies along, and a few paper stars */}
      <svg className="cr-sky" viewBox="0 0 240 200" focusable="false">
        <path className="cr-trail" d="M18 182C46 150 70 160 96 132S132 86 150 70" />
        <g className="cr-star cr-star--1">
          <path d="M200 30l5 10 11 1-8 7 3 11-11-6-10 6 3-11-8-7 11-1z" />
        </g>
        <g className="cr-star cr-star--2">
          <path d="M40 40l3.5 7 7.5.8-5.5 5 2 7.5-7.5-4-7 4 2-7.5-5.5-5 7.5-.8z" />
        </g>
        <g className="cr-star cr-star--3">
          <path d="M214 150l3 6 6.5.6-5 4.4 1.8 6.5-6.3-3.5-6.2 3.5 1.7-6.5-4.8-4.4 6.4-.6z" />
        </g>
      </svg>
      <div className="cr-fly">
        <svg className="cr-rocket" viewBox="-60 -80 120 160" focusable="false">
          {Array.from({ length: FRAMES }, (_, i) => (
            <Frame key={i} i={i} />
          ))}
        </svg>
      </div>
    </div>
  );
}
