import type { Renderer } from "../../render";
import { WORLD_STYLES } from "../styles";
import { cottage, lamp, spire, water } from "./landmarks";

export function winterScenery(renderer: Renderer, variant: number, side: number) {
  const p = WORLD_STYLES.winter.palette;
  const x = side * (5.1 + (variant % 3) * 0.8);
  if (variant % 3 === 0) {
    cottage(renderer, side * 6.7, 3, true, variant);
    lamp(renderer, side * 3.15, 4, true);
  } else {
    renderer.box(x, 1.25, 0, 0.3, 2.5, 0.36, p.bark);
    for (let tier = 0; tier < 3; tier++) {
      spire(renderer, x, 0.7 + tier * 0.9, 0, 1.35 - tier * 0.23, 1.9, [
        "#416b67",
        "#35565d",
        "#759590",
      ]);
      spire(renderer, x, 1.15 + tier * 0.9, 0, 1.05 - tier * 0.2, 1.45, p.leaf);
    }
  }
  if (variant === 2) water(renderer, side * 9, 6, 7, 9, true);
}

export function winterBackdrop(renderer: Renderer) {
  for (const side of [-1, 1]) {
    spire(renderer, side * 29, -1, 125, 29, 27, ["#c1d2db", "#91abba", "#e9eeec"]);
    spire(renderer, side * 47, -1, 146, 35, 33, ["#b8c9d7", "#829cac", "#e1ebeb"]);
  }
}
