import rough from 'roughjs';

// One shared generator. It only produces path data; React renders the paths.
const generator = rough.generator();

export type RoughOptions = NonNullable<Parameters<typeof generator.circle>[3]>;

export interface RoughPath {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export function circlePaths(cx: number, cy: number, diameter: number, options: RoughOptions): RoughPath[] {
  return generator.toPaths(generator.circle(cx, cy, diameter, options));
}

export function ellipsePaths(
  cx: number,
  cy: number,
  width: number,
  height: number,
  options: RoughOptions,
): RoughPath[] {
  return generator.toPaths(generator.ellipse(cx, cy, width, height, options));
}

export function curvePaths(points: [number, number][], options: RoughOptions): RoughPath[] {
  return generator.toPaths(generator.curve(points, options));
}

export function linePaths(x1: number, y1: number, x2: number, y2: number, options: RoughOptions): RoughPath[] {
  return generator.toPaths(generator.line(x1, y1, x2, y2, options));
}
