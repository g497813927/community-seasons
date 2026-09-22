import { createRun } from "../engine";
import type { SkinId } from "../skins";
import { createOutfit, type Outfit } from "../cosmetics";
import { runner } from "./characters/runner";
import { clipPreviewAbove, previewHull, subtractPreviewHull, type PreviewPoint } from "./preview-occlusion";
import * as geometry from "./geometry";
import type { Face, V } from "./types";

export interface SkinPreviewFace {
  points: string;
  fill: string;
}

export interface WalkingSkinPreviewFrame {
  faces: SkinPreviewFace[];
  shadows: SkinPreviewFace[];
}

const previews = new Map<string, SkinPreviewFace[]>();
const walkingPreviews = new Map<string, WalkingSkinPreviewFrame[]>();
const EMPTY_OUTFIT = createOutfit();
const previewPoints = (points: [number, number][]) => points.map(([x, y]) =>
  `${(80 + x * 56).toFixed(3)},${(80 + (y - 4.47) * 56).toFixed(3)}`,
).join(" ");

// Static SVG polygons use the same TV geometry, face visibility, projection
// and panel ordering as gameplay. No canvas or animation loop is needed.
export function getSkinPreview(skin: SkinId, outfit: Outfit = EMPTY_OUTFIT, facing: "back" | "front" = "back"): SkinPreviewFace[] {
  const key = `${facing}:${skin}:${outfit.hat ?? ""}:${outfit.shoes ?? ""}:${outfit.effect ?? ""}`;
  const cached = previews.get(key);
  if (cached) return cached;
  const result = buildSkinPreview(skin, outfit, facing);
  // Browsing many combinations cannot accumulate an unbounded SVG cache.
  if (previews.size >= 128) previews.delete(previews.keys().next().value!);
  previews.set(key, result);
  return result;
}

// One neutral frame followed by eight cached walking poses. CSS advances the
// strip without rerunning the renderer or scheduling a JavaScript frame loop.
export function getWalkingSkinPreview(skin: SkinId, outfit: Outfit): WalkingSkinPreviewFrame[] {
  const key = `${skin}:${outfit.hat ?? ""}:${outfit.shoes ?? ""}:${outfit.effect ?? ""}`;
  const cached = walkingPreviews.get(key);
  if (cached) return cached;
  const frames = Array.from({ length: 9 }, (_, i) => {
    const shadows: SkinPreviewFace[] = [];
    const faces = buildSkinPreview(skin, outfit, "right", i === 0 ? undefined : (i - 1) * Math.PI / 4, shadows);
    return { faces, shadows };
  });
  if (walkingPreviews.size >= 8) walkingPreviews.delete(walkingPreviews.keys().next().value!);
  walkingPreviews.set(key, frames);
  return frames;
}

function buildSkinPreview(skin: SkinId, outfit: Outfit, facing: "back" | "front" | "right", walkingPhase?: number, shadows?: SkinPreviewFace[]): SkinPreviewFace[] {
  // The loading TV travels along +z. View its front at three quarters so its
  // face stays readable while the toes, gait and contact shadows point right.
  const angle = facing === "right" ? 2.32 : 0.22, cos = Math.cos(angle), sin = Math.sin(angle);
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
  const bodyFaces = new Set<Face>();
  const legFaces = new Map<Face, number>(), shoeFaces = new Map<Face, number>();
  const legSurfaces = new Map<Face, number>();
  runner(view, state, 0, {
    stride: 0, previewScreen: facing !== "back", previewForward: facing === "right", walkingPhase,
    previewPart: facing === "right" ? (part, start, end, side, surfaceY) => {
      for (let i = start; i < end; i++) {
        if (part === "body") bodyFaces.add(view.faces[i]);
        else if (side !== undefined) (part === "leg" ? legFaces : shoeFaces).set(view.faces[i], side);
        if (part === "leg" && surfaceY !== undefined) legSurfaces.set(view.faces[i], surfaceY);
      }
    } : undefined,
    previewFoot: shadows ? ([x, , z], lift) => {
      const raised = Math.min(1, lift / 0.12);
      // Project each footprint onto the ground through the same camera as its
      // shoe. A lifted foot casts a wider, lighter shadow; contact stays tight.
      const points = Array.from({ length: 20 }, (_, i) => {
        const angle = i * Math.PI / 10;
        return geometry.projectView(view, view.cameraPoint([
          x + Math.cos(angle) * (0.19 + raised * 0.03),
          0.025,
          z + (outfit.shoes ? 0.02 : 0) + Math.sin(angle) * (0.22 + raised * 0.04),
        ]));
      });
      shadows.push({ points: previewPoints(points), fill: `rgba(0,26,34,${(0.22 - raised * 0.13).toFixed(3)})` });
    } : undefined,
  });
  const projected = view.faces.filter((face) =>
    !face.cull || view.frontFacing(face.points.map((point) => view.cameraPoint(point))),
  ).flatMap((face) => {
    const surfaceY = legSurfaces.get(face);
    const clipped = surfaceY === undefined ? face.points : clipPreviewAbove(face.points, surfaceY);
    if (clipped.length < 3) return [];
    const points = clipped.map((point) => view.cameraPoint(point));
    // Preserve intentional ordering bias from the original model face; only
    // the geometric depth follows the newly trimmed visible polygon.
    const bias = face.z - face.points.reduce((sum, point) => sum + point[2], 0) / face.points.length;
    return [{
      source: face,
      fill: face.color,
      z: points.reduce((sum, point) => sum + point[2], 0) / points.length + bias,
      points: points.map((point) => geometry.projectView(view, point)),
    }];
  }).sort((a, b) => b.z - a.z);
  const casing = previewHull(projected.filter((face) => bodyFaces.has(face.source)).flatMap((face) => face.points));
  // Preserve one continuous leg, hiding only the portion inside the casing.
  const visible = projected.flatMap((face) => (legFaces.has(face.source)
    ? subtractPreviewHull(face.points, casing) : [face.points]).map((points) => ({ ...face, points })));
  const legMasks = new Map<number, PreviewPoint[][]>();
  for (const face of visible) {
    const side = legFaces.get(face.source);
    if (side === undefined) continue;
    const masks = legMasks.get(side) ?? [];
    masks.push(face.points);
    legMasks.set(side, masks);
  }
  // A shoe's broad top has an average depth that can cover its own leg end.
  // Leave that exact connection visible without changing the other foot's
  // ordering, adding an ankle, or doing any work while the strip animates.
  const result = visible.flatMap((face) => {
    const side = shoeFaces.get(face.source);
    let polygons = [face.points];
    if (side !== undefined) for (const mask of legMasks.get(side) ?? []) {
      polygons = polygons.flatMap((points) => subtractPreviewHull(points, mask));
    }
    // Shared framing keeps the TV fixed when an outfit changes.
    return polygons.map((points) => ({ fill: face.fill, points: previewPoints(points) }));
  });
  return result;
}
