import { LANE_WIDTH } from "../../engine";
import type { Renderer } from "../../render";
import type { SceneKind } from "../../scenes";
import type { V } from "../types";
import { springBackdrop, springScenery } from "./spring";
import { summerBackdrop, summerScenery } from "./summer";
import { autumnBackdrop, autumnScenery } from "./autumn";
import { winterBackdrop, winterScenery } from "./winter";

const sceneryComponents = {
  spring: springScenery,
  summer: summerScenery,
  autumn: autumnScenery,
  winter: winterScenery,
} satisfies Record<SceneKind, (renderer: Renderer, variant: number, side: number) => void>;

const backdropComponents = {
  spring: springBackdrop,
  summer: summerBackdrop,
  autumn: autumnBackdrop,
  winter: winterBackdrop,
} satisfies Record<SceneKind, (renderer: Renderer) => void>;

export function sceneryRowVisible(row: number, detail: 0 | 1 | 2) {
  if (detail === 0) return true;
  // A five-row pattern is independent of the six authored variants. Every
  // kind of landmark remains represented, and a retained row stays on both
  // branches throughout a turn instead of changing with camera distance.
  const slot = ((row % 5) + 5) % 5;
  return slot === 0 || slot === 2 || (detail === 1 && slot === 4);
}

export function shouldOmitInnerCurveBuilding(
  junction: number | null,
  side: number,
  branch: number,
  buildingStart: number,
  buildingEnd: number,
  turnArcLength: number,
) {
  return (
    junction !== null &&
    side === -branch &&
    buildingEnd > 0 &&
    buildingStart < turnArcLength
  );
}

export function scenery(renderer: Renderer, scene: SceneKind, row: number, z: number) {
  if (!sceneryRowVisible(row, renderer.detail)) return;
  const variant = ((row % 6) + 6) % 6;
  for (const side of [-1, 1]) {
    const key = `${scene}:${variant}:${side}`;
    let template = renderer.sceneryTemplates.get(key);
    if (!template) {
      const saved = renderer.faces,
        layer = renderer.layer;
      renderer.faces = [];
      renderer.layer = 1;
      renderer.captureScenery = true;
      sceneryComponents[scene](renderer, variant, side);
      template = renderer.faces;
      renderer.captureScenery = false;
      renderer.faces = saved;
      renderer.layer = layer;
      renderer.sceneryTemplates.set(key, template);
    }
    // Keep every open street in the same world throughout the turn. A dead
    // end has no outgoing street or boardwalk platforms beyond its stub.
    const junction = renderer.sceneryForkAt;
    const branches = junction !== null && row * 14 - junction > 14 ? [-1, 1] : [side];
    let largeBuildingStart = Infinity,
      largeBuildingEnd = -Infinity;
    // Clearance only applies at forks. Keep this scan off straight-road frames
    // and avoid temporary face/point arrays when finding the cottage bounds.
    if (junction !== null) {
      for (const face of template) {
        if (face.roadsideClearance !== "large-building") continue;
        for (const point of face.points) {
          largeBuildingStart = Math.min(largeBuildingStart, point[2]);
          largeBuildingEnd = Math.max(largeBuildingEnd, point[2]);
        }
      }
      const routeOrigin = renderer.forkDepth ?? -renderer.curveAlong;
      largeBuildingStart += z - routeOrigin;
      largeBuildingEnd += z - routeOrigin;
    }
    for (const branch of branches) {
      if (branch === renderer.forkBlockedDirection && junction !== null && row * 14 > junction + 4)
        continue;
      // A large cottage on the inside of a right-angle connector occupies
      // the same narrow median as the other branch's cottage. Keep the outer
      // cottage and the smaller street furniture, but leave the inner bend
      // clear until the road has straightened.
      const omitInnerCurveBuilding = shouldOmitInnerCurveBuilding(
        junction,
        side,
        branch,
        largeBuildingStart,
        largeBuildingEnd,
        renderer.turnArcLength,
      );
      for (const face of template) {
        if (omitInnerCurveBuilding && face.roadsideClearance === "large-building") continue;
        const cameraSpace = junction !== null;
        const points: V[] = face.points.map(([x, y, pz]) => {
          if (cameraSpace && face.boardwalk && Math.abs(x) < 2.321) {
            const along = pz + z - (renderer.forkDepth ?? -renderer.curveAlong);
            x *= renderer.turnRoadWidth(along);
          }
          return cameraSpace ? sceneryViewPoint(renderer, branch, x, y, pz + z) : [x, y, pz + z];
        });
        const view = cameraSpace ? points : points.map((point) => renderer.cameraPoint(point));
        if ((face.cull && !renderer.frontFacing(view)) || view.every((p) => p[2] < -9)) continue;
        renderer.faces.push({
          ...face,
          points,
          cameraSpace,
          z: view.reduce((sum, point) => sum + point[2], 0) / view.length,
        });
      }
    }
  }
}

export function sceneryViewPoint(
  renderer: Renderer,
  branch: number,
  x: number,
  y: number,
  z: number,
): V {
  if (renderer.forkDepth !== null) return renderer.cameraPoint(renderer.forkWorldPoint(branch, x, y, z));
  const along = renderer.curveAlong;
  const direction = renderer.curveDirection;
  // Express each branch in the junction's original world coordinates, then
  // move/rotate that world around the selected road's camera origin.
  const point = renderer.turnPoint(along + z, branch);
  const origin = renderer.turnPoint(along);
  const wx =
    point[0] + branch * LANE_WIDTH - origin[0] - direction * LANE_WIDTH + x * Math.cos(point[2]);
  const wz = point[1] - origin[1] - x * Math.sin(point[2]);
  const yaw = renderer.curveTail ? (direction * Math.PI) / 2 : renderer.cameraYaw;
  return [
    wx * Math.cos(yaw) - wz * Math.sin(yaw) - renderer.cameraShift,
    y,
    wx * Math.sin(yaw) + wz * Math.cos(yaw) + renderer.cameraDepthOffset,
  ];
}

export function backdrop(renderer: Renderer, scene: SceneKind) {
  // This distant panorama surrounds the whole route. Keep it independent
  // of the local fork coordinate frame, which changes at the junction.
  renderer.layer = 1;
  const firstBackdrop = renderer.faces.length;
  renderer.captureBackdrop = true;
  backdropComponents[scene]?.(renderer);
  renderer.captureBackdrop = false;
  for (let i = firstBackdrop; i < renderer.faces.length; i++) renderer.faces[i].cameraSpace = true;
}
