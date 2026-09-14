import type { Renderer } from "../../render";
import { WORLD_STYLES } from "../styles";
import { bench, foliage, lamp, water } from "./landmarks";

export function springScenery(renderer: Renderer, variant: number, side: number) {
  const p = WORLD_STYLES.spring.palette;
  const x = side * (5.1 + (variant % 3) * 0.8);
  renderer.box(x, 1.6, 0, 0.3, 3.2, 0.36, p.bark);
  foliage(renderer, x, 3.75, 0, 1.85 + (variant % 2) * 0.3, variant, p.leaf);
  if (variant === 0 || variant === 3) {
    const ax = side * 5.2;
    for (const dx of [-1, 1]) renderer.box(ax + dx, 1.4, 5, 0.18, 2.8, 0.28, p.dark);
    renderer.box(ax, 2.85, 5, 2.4, 0.2, 0.6, p.dark);
    for (const dx of [-0.8, 0, 0.8]) renderer.box(ax + dx, 2.96, 5, 0.12, 0.14, 1.1, p.bark);
    foliage(renderer, ax, 2.85, 5, 1.05, variant, p.leaf);
  } else if (variant === 1) water(renderer, side * 8.5, 5, 5.2, 9);
  else if (variant === 2) bench(renderer, side * 4, 4, "spring");
  else if (variant === 4) lamp(renderer, side * 3.15, 5);
}

export function springBackdrop(renderer: Renderer) {
  for (const side of [-1, 1])
    foliage(renderer, side * 26, 3, 123, 15, side, WORLD_STYLES.spring.palette.leaf);
}
