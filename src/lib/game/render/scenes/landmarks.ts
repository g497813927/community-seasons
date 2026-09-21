import type { Renderer } from "../../render";
import type { SceneKind } from "../../scenes";
import type { V } from "../types";
import { WORLD_STYLES } from "../styles";

export function foliage(
  renderer: Renderer,
  x: number,
  y: number,
  z: number,
  size: number,
  seed: number,
  colors = ["#28543b", "#356544", "#1e4935", "#42704a"],
) {
  const top: V = [x, y + size * 0.68, z];
  const ring: V[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ring.push([
      x + Math.cos(a) * size,
      y + Math.sin(i * 3 + seed) * size * 0.13,
      z + Math.sin(a) * size,
    ]);
  }
  for (let i = 0; i < 7; i++) {
    renderer.face([top, ring[i], ring[(i + 1) % 7]], colors[i % colors.length]);
    renderer.face([[x, y - size * 0.5, z], ring[(i + 1) % 7], ring[i]], colors[1]);
  }
}

export function water(
  renderer: Renderer,
  x: number,
  z: number,
  width: number,
  length: number,
  frozen = false,
) {
  renderer.layer = -1;
  renderer.face(
    [
      [x - width / 2, -0.08, z - length / 2],
      [x + width / 2, -0.08, z - length / 2],
      [x + width / 2, -0.08, z + length / 2],
      [x - width / 2, -0.08, z + length / 2],
    ],
    frozen ? "#9cc9d9" : "#65b5bd",
  );
  for (let i = 0; i < 3; i++) {
    const pz = z - length / 3 + (i * length) / 3;
    renderer.face(
      [
        [x - width * 0.32, -0.065, pz],
        [x + width * 0.25, -0.065, pz + 0.35],
        [x + width * 0.32, -0.065, pz + 0.48],
        [x - width * 0.25, -0.065, pz + 0.14],
      ],
      frozen ? "#d7eff0" : "#b3ddd1",
    );
  }
  renderer.layer = 1;
}

export function lamp(renderer: Renderer, x: number, z: number, winter = false) {
  const metal = ["#4b6268", "#32464f", "#849292"];
  renderer.box(x, 1.55, z, 0.12, 3.1, 0.12, metal);
  renderer.box(x, 3.12, z, 0.48, 0.45, 0.48, ["#f6d391", "#b89e62", "#fff1c4"]);
  renderer.box(x, 3.4, z, 0.65, 0.12, 0.65, winter ? WORLD_STYLES.winter.palette.stone : metal);
}

export function bench(renderer: Renderer, x: number, z: number, scene: SceneKind) {
  const p = WORLD_STYLES[scene].palette;
  renderer.box(x, 0.58, z, 1.65, 0.17, 0.66, p.bark);
  renderer.box(x, 0.97, z + 0.29, 1.65, 0.63, 0.12, p.bark);
  for (const dx of [-0.62, 0.62]) renderer.box(x + dx, 0.25, z, 0.14, 0.5, 0.52, p.dark);
}

export function cottage(renderer: Renderer, x: number, z: number, winter = false, variant = 0) {
  const firstFace = renderer.faces.length;
  const wall = winter ? ["#a47d6e", "#6f6365", "#caa391"] : ["#c58e73", "#955f58", "#e5b297"];
  const roof = winter ? ["#f0f5ed", "#b6cdd6", "#ffffff"] : ["#78596a", "#534754", "#ac7880"];
  const width = 3.4,
    height = 2.6 + (variant % 2) * 0.6;
  // The pitched roof encloses the wall cap. Drawing that internal surface
  // creates light wedges when its depth ties with a roof slope.
  renderer.box(x, height / 2, z, width, height, 3, wall, 0, 0, false);
  const roofVertices: V[] = [
    [x - width * 0.57, height, z - 1.8],
    [x + width * 0.57, height, z - 1.8],
    [x, height + 1.4, z - 1.8],
    [x - width * 0.57, height, z + 1.8],
    [x + width * 0.57, height, z + 1.8],
    [x, height + 1.4, z + 1.8],
  ];
  // A closed, outward-facing roof keeps its hidden slope from painting over
  // the visible one when their average depths tie. Cache every side, then
  // select visible surfaces using the current camera, just as for the walls.
  const roofSides = [[0, 2, 1], [3, 4, 5], [0, 3, 5, 2], [2, 5, 4, 1], [0, 1, 4, 3]];
  const roofColors = [roof[0], roof[0], roof[1], roof[2], roof[1]];
  roofSides.forEach((ids, i) => {
    const points = ids.map((id) => roofVertices[id]);
    if (
      renderer.captureScenery ||
      renderer.frontFacing(points.map((point) => renderer.cameraPoint(point)))
    ) {
      renderer.face(points, roofColors[i]);
      if (renderer.captureScenery) renderer.faces[renderer.faces.length - 1].cull = true;
    }
  });
  // Doors and windows are exterior surfaces, just like the cottage walls.
  // Keep their winding camera-facing and cull them with the facade so they
  // cannot flash through a side wall while the camera rotates around a bend.
  const facadePanel = (
    panelX: number,
    panelY: number,
    panelZ: number,
    panelWidth: number,
    panelHeight: number,
    color: string,
  ) => {
    const points: V[] = [
      [panelX - panelWidth / 2, panelY - panelHeight / 2, panelZ],
      [panelX - panelWidth / 2, panelY + panelHeight / 2, panelZ],
      [panelX + panelWidth / 2, panelY + panelHeight / 2, panelZ],
      [panelX + panelWidth / 2, panelY - panelHeight / 2, panelZ],
    ];
    if (
      renderer.captureScenery ||
      renderer.frontFacing(points.map((point) => renderer.cameraPoint(point)))
    ) {
      renderer.face(points, color);
      const face = renderer.faces[renderer.faces.length - 1];
      if (renderer.captureScenery) face.cull = true;
    }
  };
  facadePanel(x, 0.86, z - 1.515, 0.68, 1.72, "#43545e");
  for (const dx of [-1.08, 1.08])
    facadePanel(x + dx, 1.6, z - 1.52, 0.64, 0.85, winter ? "#f6d289" : "#a9d4d1");
  renderer.box(x + 1, height + 1.15, z + 0.45, 0.45, 1, 0.48, wall);
  for (let i = firstFace; i < renderer.faces.length; i++)
    renderer.faces[i].roadsideClearance = "large-building";
}

export function market(renderer: Renderer, x: number, z: number, variant: number) {
  const timber = WORLD_STYLES.autumn.palette.bark;
  for (const dx of [-1.3, 1.3])
    for (const dz of [-0.75, 0.75]) renderer.box(x + dx, 1.05, z + dz, 0.1, 2.1, 0.1, timber);
  renderer.box(x, 0.7, z, 2.6, 0.75, 1.6, ["#a27254", "#74503c", "#c7a477"]);
  const colors = variant % 4 ? ["#cf8860", "#e9d3a2"] : ["#9da266", "#ede0b3"];
  for (let stripe = 0; stripe < 4; stripe++) {
    const left = x - 1.55 + stripe * 0.775;
    renderer.face(
      [
        [left, 2.15, z - 1.15],
        [left + 0.775, 2.15, z - 1.15],
        [left + 0.775, 2.6, z],
        [left, 2.6, z],
      ],
      colors[stripe % 2],
    );
    renderer.face(
      [
        [left, 2.6, z],
        [left + 0.775, 2.6, z],
        [left + 0.775, 2.15, z + 1.15],
        [left, 2.15, z + 1.15],
      ],
      colors[stripe % 2],
    );
  }
  for (const dx of [-0.8, 0, 0.8])
    renderer.box(x + dx, 1.18, z - 0.12, 0.58, 0.23, 0.6, ["#bd6c52", "#8d6241", "#e3b96c"]);
}

export function sailboat(renderer: Renderer, x: number, z: number, side: number) {
  const hull = ["#b57c5b", "#6e5951", "#e1b58b"];
  renderer.box(x, 0.06, z, 1.5, 0.42, 3.7, hull);
  renderer.box(x, 1.55, z, 0.09, 3.2, 0.09, ["#c8b68d", "#918266", "#ecdfb4"]);
  renderer.face(
    [
      [x + 0.06, 0.65, z],
      [x + 0.06, 3.05, z],
      [x + side * 1.7, 0.7, z + 0.05],
    ],
    "#fff2d0",
  );
  renderer.face(
    [
      [x - 0.06, 0.65, z],
      [x - 0.06, 2.65, z],
      [x - side * 0.9, 0.7, z - 0.04],
    ],
    "#d5e7df",
  );
}

export function spire(
  renderer: Renderer,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  colors: string[],
) {
  const base: V[] = [
    [x - width, y, z - width],
    [x + width, y, z - width],
    [x + width, y, z + width],
    [x - width, y, z + width],
  ];
  const peak: V = [x + width * 0.16, y + height, z];
  for (let i = 0; i < 4; i++) renderer.face([base[i], base[(i + 1) % 4], peak], colors[i % 3]);
}
