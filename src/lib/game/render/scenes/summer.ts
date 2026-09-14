import type { Renderer } from "../../render";
import { WORLD_STYLES } from "../styles";
import { foliage, lamp, sailboat } from "./landmarks";

export function summerScenery(renderer: Renderer, variant: number, side: number) {
  const p = WORLD_STYLES.summer.palette;
  // Timber pads connect every lamp to the boardwalk. Their inner edge
  // follows narrow fork connectors; road/rail slabs cover the overlap.
  const padStart = renderer.faces.length;
  renderer.layer = -0.3;
  for (const depth of [0.25, 1.75])
    renderer.box(side * 3.42, -0.55, depth, 0.16, 0.8, 0.16, p.bark);
  renderer.layer = -0.2;
  renderer.box(side * 3.01, -0.16, 1, 1.38, 0.28, 2.2, p.bark);
  renderer.layer = -0.1;
  for (const depth of [0.45, 1.05, 1.65])
    renderer.face(
      [
        [side * 2.32, -0.012, depth],
        [side * 3.7, -0.012, depth],
        [side * 3.7, -0.012, depth + 0.035],
        [side * 2.32, -0.012, depth + 0.035],
      ],
      p.bark[1],
    );
  for (let i = padStart; i < renderer.faces.length; i++) renderer.faces[i].boardwalk = true;
  renderer.layer = 1;
  lamp(renderer, side * 3.12, 1);
  if (variant % 2 === 0) sailboat(renderer, side * (7.8 + variant * 0.35), 5, side);
  if (variant === 1 || variant === 4) {
    renderer.layer = -0.2;
    const dockStart = renderer.faces.length;
    renderer.box(side * 5.16, -0.15, 4, 5.68, 0.28, 1.65, p.bark);
    for (let i = dockStart; i < renderer.faces.length; i++) renderer.faces[i].boardwalk = true;
    renderer.layer = 1;
    for (const step of [3.5, 5.3, 7.1])
      renderer.box(side * step, 0.6, 4.7, 0.12, 1.2, 0.12, p.dark);
    renderer.box(side * 5.3, 1.05, 4.7, 4, 0.1, 0.1, p.dark);
  }
  if (variant === 3) {
    renderer.box(side * 13, 1.7, 1, 0.5, 3.4, 0.5, p.bark);
    foliage(renderer, side * 13, 4.2, 1, 2.2, variant, p.leaf);
  }
}

export function summerBackdrop(_renderer: Renderer) {
  // The riverside leaves the distant water horizon unobstructed.
}
