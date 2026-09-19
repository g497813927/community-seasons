import type { Renderer } from "../render";
import { LANE_WIDTH, TURN_DURATION, type RunState } from "../engine";
import type { V } from "./types";

export function turnPoint(renderer: Renderer, along: number, direction = renderer.curveDirection): [number, number, number] {
  const radius = renderer.turnArcLength / (Math.PI / 2);
  if (along < 0) return [-direction * LANE_WIDTH, along, 0];
  if (along >= renderer.turnArcLength)
    return [direction * (radius + along - renderer.turnArcLength), radius, (direction * Math.PI) / 2];
  const angle = along / radius;
  return [
    direction * radius * (1 - Math.cos(angle)),
    radius * Math.sin(angle),
    direction * angle,
  ];
}

export function configureCamera(renderer: Renderer, s: RunState) {
  if (renderer.cameraRun !== s) {
    renderer.cameraRun = s;
    renderer.cameraTurnKey = null;
    renderer.turnEndDistance = null;
    renderer.previousTurnRemaining = 0;
  }
  renderer.curveDirection = s.turnDirection ?? 0;
  renderer.curveStrength = Math.max(0, Math.min(1, (s.turnRemaining ?? 0) / TURN_DURATION));
  const turnKey = s.fork?.at ?? (renderer.curveStrength > 0 ? s.lastForkAt : null);
  if (turnKey !== null && renderer.cameraTurnKey !== turnKey) {
    renderer.cameraTurnKey = turnKey;
    renderer.turnArcLength = Math.max(24, s.speed * TURN_DURATION);
    renderer.turnEndDistance = null;
  }
  renderer.turnProgress = 1 - renderer.curveStrength;
  if (renderer.curveStrength === 0 && renderer.previousTurnRemaining > 0) {
    const elapsed = s.time - renderer.previousTurnTime;
    const fraction = elapsed > 0 ? Math.min(1, renderer.previousTurnRemaining / elapsed) : 1;
    renderer.turnEndDistance =
      renderer.previousTurnDistance + (s.distance - renderer.previousTurnDistance) * fraction;
  }
  renderer.previousTurnRemaining = s.turnRemaining ?? 0;
  renderer.previousTurnTime = s.time;
  renderer.previousTurnDistance = s.distance;
  // Keep the final bend behind the camera until its last roadside objects
  // have passed. Completion can occur inside a frame or before 24m of travel.
  renderer.curveTail =
    renderer.curveStrength === 0 &&
    s.lastForkAt !== null &&
    renderer.curveDirection !== 0 &&
    s.distance - (renderer.turnEndDistance ?? s.lastForkAt + renderer.turnArcLength) < 42;
  renderer.curveAlong =
    renderer.curveStrength > 0
      ? renderer.turnProgress * renderer.turnArcLength
      : renderer.turnArcLength +
        Math.max(0, s.distance - (renderer.turnEndDistance ?? s.lastForkAt! + renderer.turnArcLength));
  renderer.sceneryForkAt =
    s.fork?.at ?? (renderer.curveStrength > 0 || renderer.curveTail ? s.lastForkAt : null);
  renderer.forkBlockedDirection = s.fork
    ? s.fork.blockedDirection ?? 0
    : renderer.sceneryForkAt !== null ? s.lastForkBlockedDirection ?? 0 : 0;
  renderer.laneLean = Math.max(-1, Math.min(1, (s.lane * LANE_WIDTH - s.x) / LANE_WIDTH));
  const approaching = s.fork
    ? Math.max(0, Math.min(1, 1 - (s.fork.at - s.distance) / (s.speed * 2.2)))
    : 0;
  const anticipation = approaching * approaching * (3 - 2 * approaching);
  const entryX = s.turnEntryX ?? renderer.curveDirection * LANE_WIDTH;
  // Follow the occupied outer lane before reaching the junction. Using x,
  // rather than the requested lane, also follows late changes continuously.
  renderer.cameraYaw =
    renderer.curveStrength > 0
      ? (renderer.curveDirection * renderer.turnProgress * Math.PI) / 2 +
        (entryX / LANE_WIDTH) * 0.18 * renderer.curveStrength +
        renderer.curveDirection * Math.sin(renderer.turnProgress * Math.PI) * 0.03
      : (s.x / LANE_WIDTH) * 0.18 * anticipation;
  // The route's coordinate origin moves to the chosen branch at crossing.
  // Offset the camera by exactly the same amount so neither road nor TV
  // jumps when the engine starts using the new center lane.
  renderer.cameraShift =
    renderer.curveStrength > 0
      ? s.x * 0.14 +
        (entryX * 0.7 - renderer.curveDirection * LANE_WIDTH * Math.cos(renderer.cameraYaw)) *
          renderer.curveStrength
      : s.x * (0.14 + 0.56 * anticipation);
  renderer.cameraDepthOffset =
    renderer.curveDirection * LANE_WIDTH * Math.sin(renderer.cameraYaw) * renderer.curveStrength;
  renderer.turnEntryOffset = (entryX - renderer.curveDirection * LANE_WIDTH) * renderer.curveStrength;
  renderer.cameraRoll =
    -0.009 *
    (renderer.curveStrength > 0
      ? Math.max(-1, Math.min(1, (renderer.curveDirection * LANE_WIDTH - entryX) / LANE_WIDTH)) *
        renderer.curveStrength
      : renderer.laneLean);
}

export function cameraPoint(renderer: Renderer, [x, y, z]: V): V {
  if (renderer.captureBackdrop) return [x, y, z];
  let viewX = x,
    viewZ = z;
  if (renderer.curveStrength > 0 || renderer.curveTail) {
    const along = renderer.curveAlong;
    const origin = renderer.turnPoint(along);
    // Local objects stay on the selected lane as their rear crosses the
    // junction. turnPoint's negative segment instead returns to the shared
    // trunk for scenery; applying that lane offset to only the rear vertices
    // tears the runner sideways for the first frames of a turn.
    const depth = along + z;
    const point = depth < 0 ? [0, depth, 0] : renderer.turnPoint(depth);
    const wx = point[0] - origin[0] + x * Math.cos(point[2]);
    const wz = point[1] - origin[1] - x * Math.sin(point[2]);
    const yaw = renderer.curveTail ? (renderer.curveDirection * Math.PI) / 2 : renderer.cameraYaw;
    viewX = wx * Math.cos(yaw) - wz * Math.sin(yaw);
    viewZ = wx * Math.sin(yaw) + wz * Math.cos(yaw);
  } else if (renderer.cameraYaw !== 0) {
    viewX = x * Math.cos(renderer.cameraYaw) - z * Math.sin(renderer.cameraYaw);
    viewZ = x * Math.sin(renderer.cameraYaw) + z * Math.cos(renderer.cameraYaw);
  }
  return [viewX - renderer.cameraShift, y, viewZ + renderer.cameraDepthOffset];
}

export function forkSpread(renderer: Renderer, z: number) {
  if (renderer.forkDepth === null) return 0;
  return z >= renderer.forkDepth ? LANE_WIDTH : 0;
}

export function turnRoadWidth(renderer: Renderer, along: number) {
  if (along < 0) return 1;
  const amount = Math.max(0, Math.min(1, (along - 4) / 18));
  const width = 1 / 3 + (2 / 3) * amount * amount * (3 - 2 * amount);
  const radius = renderer.turnArcLength / (Math.PI / 2);
  const angle = Math.min(Math.PI / 2, along / radius);
  const center =
    LANE_WIDTH + radius * (1 - Math.cos(angle)) + Math.max(0, along - renderer.turnArcLength);
  // Keep both inner curbs outside the center divider, including long,
  // high-speed arcs whose streets take more distance to separate.
  const separated = (center - 0.55) / (2.69 * Math.max(0.001, Math.cos(angle)));
  return Math.min(width, separated);
}

// Road vertices are already in camera coordinates. This lets the shared
// trunk end exactly at the junction while each exit starts at an outer lane.
export function roadPoint(renderer: Renderer, branch: number, x: number, y: number, z: number): V {
  const turning = renderer.curveStrength > 0 || renderer.curveTail;
  if (renderer.forkDepth === null && !turning) return renderer.cameraPoint([x, y, z]);
  if (branch === 0) {
    if (renderer.forkDepth !== null) return renderer.cameraPoint([x, y, z]);
    const origin = renderer.turnPoint(renderer.curveAlong);
    const wx = x - origin[0] - renderer.curveDirection * LANE_WIDTH;
    const wz = renderer.curveAlong + z - origin[1];
    const yaw = renderer.curveTail ? (renderer.curveDirection * Math.PI) / 2 : renderer.cameraYaw;
    return [
      wx * Math.cos(yaw) - wz * Math.sin(yaw) - renderer.cameraShift,
      y,
      wx * Math.sin(yaw) + wz * Math.cos(yaw) + renderer.cameraDepthOffset,
    ];
  }
  const along = renderer.forkDepth !== null ? z - renderer.forkDepth : renderer.curveAlong + z;
  return renderer.sceneryViewPoint(branch, x * renderer.turnRoadWidth(along), y, z);
}

export function forkWorldPoint(renderer: Renderer, branch: number, x: number, y: number, z: number): V {
  if (renderer.forkDepth === null) return [x, y, z];
  const along = z - renderer.forkDepth;
  if (along < 0 || branch === 0) return [x, y, z];
  const radius = renderer.turnArcLength / (Math.PI / 2);
  const angle = Math.min(Math.PI / 2, along / radius);
  return [
    branch *
      (LANE_WIDTH + radius * (1 - Math.cos(angle)) + Math.max(0, along - renderer.turnArcLength)) +
      x * Math.cos(angle),
    y,
    renderer.forkDepth + radius * Math.sin(angle) - branch * x * Math.sin(angle),
  ];
}

export function beginCourseObject(renderer: Renderer, z: number) {
  const beyondJunction =
    renderer.forkDepth !== null
      ? z >= renderer.forkDepth
      : (renderer.curveStrength > 0 || renderer.curveTail) && renderer.curveAlong + z >= 0;
  if (!beyondJunction) return -1;
  // A future row exists on either possible exit. Retain every face until
  // the object has been placed on that street, then test its visibility.
  renderer.captureScenery = true;
  return renderer.faces.length;
}

export function endCourseObject(renderer: Renderer, start: number) {
  if (start < 0) return;
  renderer.captureScenery = false;
  const template = renderer.faces.splice(start);
  for (const branch of [-1, 1]) {
    if (branch === renderer.forkBlockedDirection) continue;
    for (const face of template) {
      const points = face.points.map(([x, y, z]) => renderer.sceneryViewPoint(branch, x, y, z));
      if ((face.cull && !renderer.frontFacing(points)) || points.every((p) => p[2] < -9)) continue;
      renderer.faces.push({
        ...face,
        points,
        cameraSpace: true,
        z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
      });
    }
  }
}
