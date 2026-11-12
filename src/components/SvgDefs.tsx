import feltUrl from '../assets/textures/felt.jpg';
import knitUrl from '../assets/textures/knit.jpg';
import woolUrl from '../assets/textures/wool.jpg';
import denimUrl from '../assets/textures/denim.jpg';
import burlapUrl from '../assets/textures/burlap.jpg';

// Photo textures (CC0, Poly Haven and ambientCG) tiled as SVG patterns. The planets lay
// them over their colours in greyscale with soft-light blending, so the fabric shows
// through without changing the colour.
const TEXTURES = [
  { id: 'tex-felt', url: feltUrl },
  { id: 'tex-knit', url: knitUrl },
  { id: 'tex-wool', url: woolUrl },
  { id: 'tex-denim', url: denimUrl },
  { id: 'tex-burlap', url: burlapUrl },
];

// Shared SVG filters, patterns and gradients, rendered once and referenced by id.
export function SvgDefs() {
  return (
    <svg className="svg-defs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        {TEXTURES.map((t) => (
          <pattern key={t.id} id={t.id} width="100" height="100" patternUnits="userSpaceOnUse">
            <image href={t.url} width="100" height="100" preserveAspectRatio="none" />
          </pattern>
        ))}

        {/* Greyscale with a little extra contrast, for texture overlays. */}
        <filter id="mono" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.5" intercept="-0.25" />
            <feFuncG type="linear" slope="1.5" intercept="-0.25" />
            <feFuncB type="linear" slope="1.5" intercept="-0.25" />
          </feComponentTransfer>
        </filter>

        {/* Felt grain: grey noise added to the shape's colour, then clipped back to the shape. */}
        <filter id="felt" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="4" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComposite in="SourceGraphic" in2="mono" operator="arithmetic" k1="0" k2="1" k3="0.3" k4="-0.15" result="grain" />
          <feComposite in="grain" in2="SourceGraphic" operator="in" />
        </filter>

        {/* Die-cut sticker border: grow the shape's outline and fill it white. */}
        <filter id="diecut" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="spread" />
          <feFlood floodColor="#ffffff" />
          <feComposite in2="spread" operator="in" result="border" />
          <feMerge>
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Knitted stitches: rows of small V shapes. */}
        <pattern id="knit" width="9" height="11" patternUnits="userSpaceOnUse">
          <path d="M0.5 1 L4.5 9 M8.5 1 L4.5 9" stroke="rgba(255,255,255,0.17)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M0.5 2.6 L4.5 10.6 M8.5 2.6 L4.5 10.6" stroke="rgba(0,0,0,0.13)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </pattern>

        {/* Puffy lighting for the planets. */}
        <radialGradient id="g-highlight" cx="32%" cy="26%" r="42%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g-shade" cx="38%" cy="32%" r="78%">
          <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
    </svg>
  );
}
