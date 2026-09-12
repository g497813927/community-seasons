import type { SceneKind } from "./scenes";

export type TravelMode = "run" | "rail";
export type TravelPalette = {
  background: string;
  edge: string;
  accent: string;
  panel: string;
  ink: string;
  muted: string;
};
type RGB = readonly [number, number, number];
type RGBPalette = Record<keyof TravelPalette, RGB>;
const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const mix = (a: RGB, b: RGB, amount: number): RGB => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
];
// Match each world's sky and lower scenery; railway keeps its season with a deeper tint.
const colors: Record<SceneKind, readonly [string, string, string]> = {
  spring: ["#6799a4", "#6c9b85", "#f6bed2"],
  summer: ["#4f9aaf", "#4d997f", "#f5d482"],
  autumn: ["#99859d", "#998777", "#f4b57d"],
  winter: ["#667da4", "#819ab2", "#b8def5"],
};
const themes = {} as Record<SceneKind, Record<TravelMode, RGBPalette>>;
for (const scene of Object.keys(colors) as SceneKind[]) {
  const [background, edge, accent] = colors[scene].map(rgb);
  const panel = mix(background, rgb("#071e25"), 0.8);
  const run = { background, edge, accent, panel, ink: rgb("#f6eee0"), muted: rgb("#d2ded8") };
  themes[scene] = {
    run,
    rail: {
      ...run,
      background: mix(background, panel, 0.22),
      edge: mix(edge, panel, 0.28),
      accent: mix(accent, rgb("#efd39b"), 0.25),
      panel: mix(panel, rgb("#071e25"), 0.15),
    },
  };
}
const blend = (a: RGB, b: RGB, t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** Simulation progress drives both DOM and canvas, so pausing freezes their colors together. */
export function travelPalette(
  from: SceneKind,
  to: SceneKind,
  progress: number,
  fromMode: TravelMode = "run",
  toMode: TravelMode = "run",
): TravelPalette {
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const t = p * p * (3 - 2 * p),
    a = themes[from][fromMode],
    b = themes[to][toMode];
  return {
    background: blend(a.background, b.background, t),
    edge: blend(a.edge, b.edge, t),
    accent: blend(a.accent, b.accent, t),
    panel: blend(a.panel, b.panel, t),
    ink: blend(a.ink, b.ink, t),
    muted: blend(a.muted, b.muted, t),
  };
}
