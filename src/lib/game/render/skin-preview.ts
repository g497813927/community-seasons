import { createRun } from "../engine";
import type { SkinId } from "../skins";
import { createOutfit, type Outfit } from "../cosmetics";
import { runner } from "./characters/runner";
import * as geometry from "./geometry";
import type { Face, V } from "./types";

export interface SkinPreviewFace {
  points: string;
  fill: string;
}

const previews = new Map<string, SkinPreviewFace[]>();
const EMPTY_OUTFIT = createOutfit();

// Static SVG polygons use the same TV geometry, face visibility, projection
// and panel ordering as gameplay. No canvas or animation loop is needed.
export function getSkinPreview(skin: SkinId, outfit: Outfit = EMPTY_OUTFIT): SkinPreviewFace[] {
  const key = `${skin}:${outfit.hat ?? ""}:${outfit.shoes ?? ""}:${outfit.effect ?? ""}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const angle = 0.22, cos = Math.cos(angle), sin = Math.sin(angle);
  const view = {
    faces: [] as Face[],
    layer: 1,
    captureScenery: false,
    focal: 10,
    center: 0,
    horizon: 0,
    cameraRoll: 0,
    cameraPoint([x, y, z]: V): V {
      return [x * cos + z * sin, y, z * cos - x * sin];
    },
    frontFacing(points: V[]) { return geometry.frontFacing(this, points); },
    face(points: V[], color: string, text?: Face["text"]) {
      geometry.face(this, points, color, text);
    },
    box(...args: Parameters<typeof geometry.box> extends [unknown, ...infer Args] ? Args : never) {
      geometry.box(this, ...args);
    },
  };
  const state = createRun();
  state.skin = skin;
  state.outfit = outfit;
  runner(view, state, 0, { stride: 0 });
  const projected = view.faces.map((face) => {
    const points = face.points.map((point) => view.cameraPoint(point));
    const bias = face.z - face.points.reduce((sum, point) => sum + point[2], 0) / face.points.length;
    return {
      fill: face.color,
      z: points.reduce((sum, point) => sum + point[2], 0) / points.length + bias,
      points: points.map((point) => geometry.projectView(view, point)),
    };
  }).sort((a, b) => b.z - a.z);
  // One camera/framing for every combination prevents the TV from shrinking
  // or jumping when a player compares hats, shoes or decorative motes.
  const scale = 56;
  const result = projected.map((face) => ({
    fill: face.fill,
    points: face.points.map(([x, y]) =>
      `${(80 + x * scale).toFixed(3)},${(80 + (y - 4.47) * scale).toFixed(3)}`,
    ).join(" "),
  }));
  // Browsing many combinations cannot accumulate an unbounded SVG cache.
  if (previews.size >= 128) previews.delete(previews.keys().next().value!);
  previews.set(key, result);
  return result;
}
