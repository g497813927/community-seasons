import type { EffectId, HatId, ShoesId } from "../../cosmetics";
import type { Renderer } from "../../render";
import type { V } from "../types";

type ModelRenderer = Pick<Renderer, "face" | "box" | "faces">;
type Attachment = (x: number, up: number, depth: number) => V;

/** All accessories share the TV's pose transform; they never change its collider. */
export function drawHat(renderer: ModelRenderer, hat: HatId, attached: Attachment, lean: number) {
  const box = (x: number, up: number, depth: number, w: number, h: number, d: number, colors: string[]) =>
    renderer.box(...attached(x, up, depth), w, h, d, colors, lean);
  const panel = (points: [number, number][], depth: number, color: string) =>
    renderer.face(points.map(([x, up]) => attached(x, up, depth)), color);
  if (hat === "cap") {
    const coral = ["#f07b7b", "#b84560", "#ffc0a5"];
    const dome: [number, number][] = [
      [-0.48, 0.45], [0.48, 0.45], [0.46, 0.61], [0.28, 0.77],
      [0, 0.83], [-0.28, 0.77], [-0.46, 0.61],
    ];
    panel(dome, 0.24, coral[1]);
    panel(dome, -0.24, coral[0]);
    for (let edge = 0; edge < dome.length; edge++) {
      const a = dome[edge], b = dome[(edge + 1) % dome.length];
      const points = [attached(...a, -0.24), attached(...a, 0.24), attached(...b, 0.24), attached(...b, -0.24)];
      const previousCount = renderer.faces.length;
      renderer.face(edge === 0 ? points.reverse() : points, coral[2]);
      // The underside is exposed while sliding. Cull it when viewed from above
      // so a hidden base cannot overpaint the visible dome in depth sorting.
      if (edge === 0 && renderer.faces.length > previousCount) renderer.faces[renderer.faces.length - 1].cull = true;
    }
    // A backwards brim makes the baseball cap legible from the chase camera.
    box(0, 0.47, -0.34, 0.8, 0.06, 0.45, coral);
    box(0, 0.84, 0, 0.1, 0.045, 0.1, ["#ffe5be", "#edb78a", "#fff1d9"]);
    panel([[-0.08, 0.57], [0.08, 0.57], [0.08, 0.68], [-0.08, 0.68]], -0.249, "#ffe5be");
  } else if (hat === "crown") {
    box(0, 0.47, 0, 0.95, 0.09, 0.5, ["#f4c95f", "#bd862b", "#ffe8a0"]);
    const outline: [number, number][] = [
      [-0.46, 0.5], [0.46, 0.5], [0.49, 0.89], [0.24, 0.72],
      [0, 1.01], [-0.24, 0.72], [-0.49, 0.89],
    ];
    panel(outline, 0.23, "#d9a23a");
    panel(outline, -0.255, "#ffe087");
    for (const side of [-1, 1]) renderer.face([
      attached(side * 0.46, 0.5, -0.255), attached(side * 0.46, 0.5, 0.23),
      attached(side * 0.49, 0.89, 0.23), attached(side * 0.49, 0.89, -0.255),
    ], "#edb84c");
    panel([[0, 0.58], [0.08, 0.66], [0, 0.75], [-0.08, 0.66]], -0.265, "#e86b84");
  } else {
    box(0, 0.46, 0, 0.45, 0.07, 0.32, ["#866647", "#654830", "#b39569"]);
    box(0, 0.66, 0, 0.065, 0.36, 0.065, ["#62ad5d", "#36794e", "#a4d575"]);
    panel([[0, 0.75], [-0.32, 0.73], [-0.5, 0.9], [-0.22, 0.96], [-0.04, 0.85]], -0.06, "#8ecb6a");
    panel([[0, 0.79], [0.11, 0.96], [0.43, 1.01], [0.38, 0.82], [0.15, 0.75]], -0.05, "#5aaa70");
    panel([[-0.04, 0.77], [-0.32, 0.86], [-0.08, 0.8]], -0.071, "#d0e79a");
    panel([[0.04, 0.8], [0.31, 0.91], [0.12, 0.8]], -0.061, "#b8e08d");
  }
}

export function drawShoes(renderer: ModelRenderer, shoes: ShoesId, [x, y, z]: V) {
  const box = (up: number, depth: number, w: number, h: number, d: number, colors: string[]) =>
    renderer.box(x, y + up, z + depth, w, h, d, colors);
  if (shoes === "sneakers") {
    box(-0.055, 0.025, 0.31, 0.08, 0.4, ["#e8f3ed", "#a7c8c1", "#ffffff"]);
    box(0.035, 0.02, 0.27, 0.13, 0.34, ["#ee807b", "#b34f62", "#ffc1ad"]);
    // Broad side stripe and laces read as shoes at small mobile sizes.
    box(0.005, -0.158, 0.27, 0.035, 0.025, ["#fff7dd", "#e0d8c0", "#ffffff"]);
    for (const depth of [-0.07, 0.01]) box(0.105, depth, 0.18, 0.014, 0.024, ["#fff7dd", "#e0d8c0", "#ffffff"]);
  } else if (shoes === "boots") {
    box(-0.055, 0.02, 0.3, 0.08, 0.38, ["#755985", "#4e3d63", "#ac8bae"]);
    box(0.055, 0.02, 0.27, 0.19, 0.34, ["#a883bc", "#6e5386", "#d6b5df"]);
    box(0.18, -0.035, 0.3, 0.09, 0.23, ["#f0d292", "#b8965e", "#ffebba"]);
  } else {
    box(0.055, 0.02, 0.27, 0.13, 0.35, ["#5fcab8", "#318f91", "#a7edda"]);
    box(-0.012, 0.02, 0.31, 0.025, 0.4, ["#f6daa0", "#b69263", "#fff0c4"]);
    // Compact wheels keep the original planted-foot height and collision bounds.
    for (const depth of [-0.1, 0.14]) {
      box(-0.055, depth, 0.31, 0.08, 0.08, ["#5c658b", "#343d62", "#a7b4d4"]);
      for (const side of [-1, 1]) renderer.face(
        Array.from({ length: 8 }, (_, point): V => {
          const angle = (point / 8) * Math.PI * 2;
          return [x + side * 0.162, y - 0.055 + Math.sin(angle) * 0.045, z + depth + Math.cos(angle) * 0.045];
        }), "#d5b8f5",
      );
    }
  }
}

export function drawCosmeticEffect(
  renderer: ModelRenderer,
  effect: EffectId,
  attached: Attachment,
  time: number,
) {
  // A small fixed number of motes has no spawn state, wall-clock timers or glow
  // rings that could be confused with protection from a gameplay booster.
  const count = effect === "orbit" ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const phase = time * (effect === "petals" ? 0.7 : 1.1) + i * 2.399;
    const side = i % 2 ? 1 : -1;
    const x = effect === "orbit" ? Math.cos(phase) * 0.87 : side * (0.68 + (i % 3) * 0.12);
    const up = effect === "orbit" ? 0.38 + Math.sin(phase) * 0.22 : 0.02 + (i % 3) * 0.24 + Math.sin(phase) * 0.07;
    const depth = effect === "orbit" ? -0.28 + Math.sin(phase) * 0.28 : -0.3 - (i % 2) * 0.17;
    const size = effect === "sparkles" ? 0.065 + (Math.sin(phase) + 1) * 0.018 : 0.085;
    const outline: [number, number][] = effect === "petals"
      ? [[-size, 0], [-size * 0.4, size], [size * 0.6, size * 0.65], [size, -size * 0.5], [0, -size]]
      : [[0, size], [size * 0.28, size * 0.28], [size, 0], [size * 0.28, -size * 0.28], [0, -size], [-size * 0.28, -size * 0.28], [-size, 0], [-size * 0.28, size * 0.28]];
    renderer.face(outline.map(([dx, dy]) => attached(x + dx, up + dy, depth)),
      effect === "petals" ? ["#f6abc4", "#ffe0e8"][i % 2] : effect === "orbit" ? ["#a6e5eb", "#e0c7ff", "#ffe0a0"][i] : "#ffe6a3");
  }
}
