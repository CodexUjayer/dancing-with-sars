/**
 * Restrained scientific colormaps (warm light theme, no blue/indigo).
 */

export type RGB = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ramp(stops: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return [
    Math.round(lerp(stops[i][0], stops[i + 1][0], f)),
    Math.round(lerp(stops[i][1], stops[i + 1][1], f)),
    Math.round(lerp(stops[i][2], stops[i + 1][2], f)),
  ];
}

/** Diverging displacement scale: toward (terracotta) ← 0 → away (teal). */
const TOWARD: RGB[] = [
  [143, 74, 43],
  [201, 124, 84],
  [232, 196, 168],
];
const ZERO: RGB = [244, 239, 231];
const AWAY: RGB[] = [
  [207, 224, 218],
  [95, 145, 135],
  [44, 95, 88],
];

/** t in [-1, 1] → css color */
export function displacementColor(t: number): string {
  const c =
    t < 0 ? ramp(TOWARD, 1 + t) : t === 0 ? ZERO : ramp(AWAY, t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Sequential coherence 0..1 (light → dark warm gray) */
const COH: RGB[] = [
  [245, 241, 232],
  [203, 195, 181],
  [138, 131, 122],
  [74, 68, 60],
];
export function coherenceColor(t: number): string {
  const c = ramp(COH, t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Sequential uncertainty (light → deep terracotta) */
const SIG: RGB[] = [
  [245, 241, 232],
  [226, 199, 172],
  [176, 113, 78],
  [122, 74, 43],
];
export function sigmaColor(t: number): string {
  const c = ramp(SIG, t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Nice round color-scale maximum for displacement (metres). */
export function niceScaleMax(absMaxM: number): number {
  const mm = Math.max(absMaxM * 1000, 1);
  const steps = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  for (const s of steps) if (mm <= s) return s / 1000;
  return Math.ceil(mm / 1000);
}

export function rgba(c: string, alpha: number): string {
  return c.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}
