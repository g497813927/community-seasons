import type { Renderer } from "../../render";
import { WORLD_STYLES } from "../styles";
import { cottage, foliage, lamp, market } from "./landmarks";

export function autumnScenery(renderer: Renderer, variant: number, side: number) {
  const p = WORLD_STYLES.autumn.palette;
  if (variant % 2 === 0) market(renderer, side * 5.5, 2, variant);
  else {
    cottage(renderer, side * 7, 2, false, variant);
    lamp(renderer, side * 3.15, 5);
  }
  if (variant === 2 || variant === 5) {
    renderer.box(side * 10, 1.4, 6, 0.38, 2.8, 0.38, p.bark);
    foliage(renderer, side * 10, 3.5, 6, 2, variant, p.leaf);
  }
}

export function autumnBackdrop(renderer: Renderer) {
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) cottage(renderer, side * (12 + i * 8), 115 + i * 8, false, i);
}
