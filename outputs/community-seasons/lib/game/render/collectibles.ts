import type { Renderer } from "../render";
import { RELIC_HEIGHT } from "../engine";
import type { BoostKind } from "../boosts";
import type { V } from "./types";

// Shared outline: coins keep their trail height without per-frame spin/bobbing.
const COIN_OUTLINE = Array.from({ length: 10 }, (_, i) => [
  Math.cos((i * Math.PI) / 5),
  Math.sin((i * Math.PI) / 5),
]);

export function coin(renderer: Renderer, x: number, z: number, _t: number, height = 1) {
  // Three flat shapes replace the spinning mesh. Perspective still carries
  // coins toward the player, and authored jump/slide trail heights stay intact.
  renderer.face(
    COIN_OUTLINE.map(([a, b]) => [x + a * 0.35, height + b * 0.36, z]),
    "#b97928",
  );
  renderer.face(
    COIN_OUTLINE.map(([a, b]) => [x + a * 0.31, height + b * 0.32 + 0.02, z - 0.01]),
    "#ffca63",
  );
  renderer.face(
    [
      [x - 0.035, height - 0.18, z - 0.02],
      [x + 0.035, height - 0.18, z - 0.02],
      [x + 0.035, height + 0.2, z - 0.02],
      [x - 0.035, height + 0.2, z - 0.02],
    ],
    "#fff0ab",
  );
}

export function relic(renderer: Renderer, x: number, z: number, t: number, kind: BoostKind, height = RELIC_HEIGHT) {
  const y = height + Math.sin(t * 2.4) * 0.12;
  const colors = {
    shield: ["#86e5d4", "#267e75", "#d1fff1"],
    magnet: ["#f7d16e", "#9c6b20", "#fff0b0"],
    rush: ["#f59d66", "#a44e29", "#ffe0ad"],
    headstart: ["#f59d66", "#a44e29", "#ffe0ad"],
    portal: ["#d8d6ff", "#6761a6", "#ffffff"],
    doubleCoins: ["#f7d16e", "#9c6b20", "#fff0b0"],
  }[kind];
  // A larger, colored token with a distinct glyph separates it from coins.
  const outline: [number, number][] = [
    [0, 0.7],
    [0.55, 0.25],
    [0.55, -0.3],
    [0, -0.7],
    [-0.55, -0.3],
    [-0.55, 0.25],
  ];
  const front: V[] = outline.map(([a, b]) => [x + a, y + b, z - 0.18]);
  const back: V[] = outline.map(([a, b]) => [x + a, y + b, z + 0.18]);
  for (let i = 0; i < front.length; i++)
    renderer.face(
      [front[i], back[i], back[(i + 1) % front.length], front[(i + 1) % front.length]],
      colors[1],
    );
  renderer.face(front, colors[0]);
  const mark = (points: [number, number][], color = colors[2]) =>
    renderer.face(
      points.map(([a, b]) => [x + a, y + b, z - 0.2]),
      color,
    );
  if (kind === "shield") {
    mark([
      [-0.29, 0.33],
      [0.29, 0.33],
      [0.25, -0.13],
      [0, -0.4],
      [-0.25, -0.13],
    ]);
    mark(
      [
        [-0.07, 0.19],
        [0.07, 0.19],
        [0.07, -0.16],
        [-0.07, -0.16],
      ],
      colors[1],
    );
    mark(
      [
        [-0.18, 0.08],
        [0.18, 0.08],
        [0.18, -0.05],
        [-0.18, -0.05],
      ],
      colors[1],
    );
  } else if (kind === "doubleCoins") {
    // Paired coin glyph distinguishes double rewards from the Shield relic.
    for (const offset of [-0.17, 0.17]) {
      const ring: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        ring.push([offset + Math.cos(a) * 0.19, Math.sin(a) * 0.3]);
      }
      mark(ring);
      mark(
        [
          [offset - 0.03, 0.16],
          [offset + 0.03, 0.16],
          [offset + 0.03, -0.16],
          [offset - 0.03, -0.16],
        ],
        colors[1],
      );
    }
  } else if (kind === "magnet") {
    mark([
      [-0.29, 0.32],
      [-0.12, 0.32],
      [-0.12, -0.13],
      [0.12, -0.13],
      [0.12, 0.32],
      [0.29, 0.32],
      [0.29, -0.2],
      [0.15, -0.36],
      [-0.15, -0.36],
      [-0.29, -0.2],
    ]);
    mark(
      [
        [-0.29, 0.32],
        [-0.12, 0.32],
        [-0.12, 0.17],
        [-0.29, 0.17],
      ],
      colors[1],
    );
    mark(
      [
        [0.12, 0.32],
        [0.29, 0.32],
        [0.29, 0.17],
        [0.12, 0.17],
      ],
      colors[1],
    );
  } else {
    mark([
      [0.07, 0.43],
      [-0.28, -0.04],
      [-0.03, -0.04],
      [-0.12, -0.44],
      [0.3, 0.1],
      [0.06, 0.1],
    ]);
  }
}
