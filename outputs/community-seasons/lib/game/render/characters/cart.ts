import type { RunState } from "../../engine";
import type { Renderer } from "../../render";

export function railCart(renderer: Renderer, s: RunState, _t: number) {
  const rail = s.rail!;
  const progress = Math.max(0, Math.min(1, 1 - rail.remaining / rail.duration));
  const fall = rail.phase === "falling" ? progress * progress * 6 : 0;
  const arrival = rail.phase === "boarding" ? (1 - progress) * 1.1 : 0;
  const x = s.x,
    y = 0.05 - fall,
    z = -arrival;
  const shell = ["#78c1c2", "#407e86", "#bce8d9"],
    dark = ["#415560", "#283f4b", "#778b91"];
  for (const side of [-1, 1])
    for (const depth of [-0.44, 0.44])
      renderer.box(x + side * 0.58, y + 0.19, z + depth, 0.15, 0.34, 0.34, dark);
  renderer.box(x, y + 0.35, z, 1.32, 0.2, 1.36, dark);
  renderer.box(x, y + 0.72, z - 0.62, 1.39, 0.67, 0.13, shell);
  for (const side of [-1, 1]) renderer.box(x + side * 0.66, y + 0.7, z, 0.13, 0.65, 1.35, shell);
  renderer.label(x, y + 0.72, z - 0.69, 0.95, 0.34, "✦", "#f1d693", shell[0]);
  renderer.runner({ ...s, mode: "paused", jump: 0, slide: 0, edgeStumble: 0 }, _t, {
    seated: 1,
    elevation: -fall,
    depth: z,
  });
}
