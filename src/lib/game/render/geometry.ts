import type { Renderer } from "../render";
import type { V, Face } from "./types";
import { PALETTES } from "./styles";

export function project(renderer: Renderer, point: V): [number, number] {
  return renderer.projectView(renderer.cameraPoint(point));
}

export function projectView(
  renderer: Pick<Renderer, "focal" | "cameraRoll" | "center" | "horizon">,
  [viewX, y, viewZ]: V,
): [number, number] {
  const scale = renderer.focal / Math.max(0.3, viewZ + 10);
  const px = viewX * scale,
    py = (5.4 - y) * scale;
  const cos = Math.cos(renderer.cameraRoll),
    sin = Math.sin(renderer.cameraRoll);
  return [renderer.center + px * cos - py * sin, renderer.horizon + px * sin + py * cos];
}

export function face(
  renderer: Pick<Renderer, "captureScenery" | "cameraPoint" | "faces" | "layer">,
  points: V[], color: string, text?: Face["text"],
) {
  if (!renderer.captureScenery && points.every((point) => renderer.cameraPoint(point)[2] < -9)) return;
  renderer.faces.push({
    points,
    color,
    text,
    layer: renderer.layer,
    z: points.reduce((n, p) => n + p[2], 0) / points.length,
  });
}

export function label(
  renderer: Renderer,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  value: string,
  color = "#26474b",
  background = "#f7f2de",
  emphasis = false,
) {
  renderer.face(
    [
      [x - width / 2, y - height / 2, z],
      [x + width / 2, y - height / 2, z],
      [x + width / 2, y + height / 2, z],
      [x - width / 2, y + height / 2, z],
    ],
    background,
    value ? { value, color, emphasis } : undefined,
  );
}

export function box(
  renderer: Pick<Renderer, "captureScenery" | "frontFacing" | "cameraPoint" | "face" | "faces">,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  colors = PALETTES.stone,
  rx = 0,
  rz = 0,
  drawTop = true,
) {
  const cosX = Math.cos(rx),
    sinX = Math.sin(rx),
    cosZ = Math.cos(rz),
    sinZ = Math.sin(rz);
  const verts: V[] = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ].map((v) => {
    let a = (v[0] * w) / 2,
      b = (v[1] * h) / 2,
      c = (v[2] * d) / 2;
    const by = b * cosX - c * sinX;
    c = b * sinX + c * cosX;
    b = by;
    const ax = a * cosZ - b * sinZ;
    b = a * sinZ + b * cosZ;
    a = ax;
    return [a + x, b + y, c + z] as V;
  });
  const sides = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [3, 7, 6, 2],
    [0, 1, 5, 4],
  ];
  sides.forEach((ids, i) => {
    if (i === 4 && !drawTop) return;
    const p = ids.map((id) => verts[id]);
    if (renderer.captureScenery || renderer.frontFacing(p.map((point) => renderer.cameraPoint(point)))) {
      renderer.face(p, colors[i === 4 ? 2 : i === 0 ? 0 : 1]);
      if (renderer.captureScenery) renderer.faces[renderer.faces.length - 1].cull = true;
    }
  });
}

export function frontFacing(_renderer: object, points: V[]) {
  const [a, b, c] = points;
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - a[0],
    vy = c[1] - a[1],
    vz = c[2] - a[2];
  return (
    (uy * vz - uz * vy) * -a[0] +
      (uz * vx - ux * vz) * (5.4 - a[1]) +
      (ux * vy - uy * vx) * (-10 - a[2]) >
    0
  );
}

export function faceView(renderer: Renderer, face: Face): V[] {
  return face.cameraSpace ? face.points : face.points.map((p) => renderer.cameraPoint(p));
}

export function clipNear(renderer: Renderer, points: V[]): V[] {
  const near = -9;
  if (points.every((p) => p[2] >= near)) return points;
  const clipped: V[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[2] >= near) clipped.push(a);
    if (a[2] >= near !== b[2] >= near) {
      const t = (near - a[2]) / (b[2] - a[2]);
      clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return clipped;
}
