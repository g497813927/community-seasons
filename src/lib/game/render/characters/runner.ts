import {
  type RunState,
  LANE_WIDTH,
  SLIDE_DURATION,
  EDGE_STUMBLE_DURATION,
  jumpHeight,
} from "../../engine";
import type { Renderer } from "../../render";
import { skinDefinition } from "../../skins";
import type { V } from "../types";
import { drawHat, drawShoes, drawCosmeticEffect } from "./cosmetics";

export function runner(
  renderer: Pick<Renderer, "faces" | "face" | "box"> & Partial<Pick<Renderer, "reducedMotion">>,
  s: RunState,
  t: number,
  pose?: { seated?: number; elevation?: number; depth?: number; stride?: number; previewScreen?: boolean; previewForward?: boolean; walkingPhase?: number; previewFoot?: (foot: V, lift: number) => void; previewPart?: (part: "body" | "leg" | "shoe", start: number, end: number, side?: number, surfaceY?: number) => void },
) {
  const firstFace = renderer.faces.length;
  const running = s.mode === "running" || s.mode === "ready";
  // The television faces forward down the path (+z), so the chase camera
  // sees its back panel. Feet stay above the road even when sliding.
  const slidePhase =
    s.slide > 0 ? Math.max(0, Math.min((SLIDE_DURATION - s.slide) / 0.12, s.slide / 0.14, 1)) : 0;
  const slide = slidePhase * slidePhase * (3 - 2 * slidePhase);
  const mix = (a: number, b: number) => a + (b - a) * slide;
  const walkingPhase = pose?.previewScreen ? pose.walkingPhase : undefined;
  const previewForward = !!(pose?.previewScreen && pose.previewForward);
  const stride = walkingPhase !== undefined ? Math.sin(walkingPhase) * 0.7 :
    pose?.stride ??
    (running && s.jump === 0 ? Math.sin(t * (s.mode === "ready" ? 5 : 15)) * (1 - slide) : 0);
  const jump = jumpHeight(s);
  const y = jump + (walkingPhase === undefined ? Math.abs(stride) * 0.055 : 0) + (pose?.elevation ?? 0);
  // Running swing stops in the air, so give jumps their own readable arm
  // motion: lift both hands above the case at the apex, then lower them along
  // the same arc before landing.
  const jumpArmLift = Math.max(0, Math.min(1, jump / 2.15));
  const seated = pose?.seated ?? 0;
  const point = (standing: V, sliding: V, sitting: V = standing): V => {
    const base = standing.map((v, i) => mix(v, sliding[i]) * (1 - seated) + sitting[i] * seated);
    return [s.x + base[0], y + base[1], base[2] + (pose?.depth ?? 0)];
  };
  const palette = skinDefinition(s.skin).palette;
  const { shell, trim } = palette;
  const segment = (a: V, b: V, width: number, depth: number, colors: string[]) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    renderer.box(
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
      width,
      Math.hypot(dx, dy, dz),
      depth,
      colors,
      Math.atan2(dz, Math.hypot(dx, dy)),
      Math.atan2(-dx, dy),
    );
  };
  const body = point([0, 0.94, 0], [0, 0.53, -0.16], [0, 1.18, 0.05]);
  const lean = mix(0.04, 0.9) * (1 - seated);
  const cos = Math.cos(lean),
    sin = Math.sin(lean);
  const attached = (x: number, up: number, depth: number): V => [
    body[0] + x,
    body[1] + up * cos - depth * sin,
    body[2] + up * sin + depth * cos,
  ];
  renderer.box(...body, 1.02, 0.86, 0.46, shell, lean);
  if (previewForward) pose?.previewPart?.("body", firstFace, renderer.faces.length);
  // Rear-panel details share one surface depth so reclining keeps the vents
  // attached to the case. The forward-facing screen is hidden by the body.
  let panelDepth = attached(0, 0, previewForward ? 0.245 : -0.245)[2];
  const panel = (outline: [number, number][], color: string) => {
    renderer.face(
      // Turn the loading screen through 180 degrees, preserving its winding.
      outline.map(([x, up]) => attached(previewForward ? -x : x, up, previewForward ? 0.25 : -0.25)),
      color,
    );
    renderer.faces[renderer.faces.length - 1].z = panelDepth;
    // The static preview's wide screen details need enough ordering bias to
    // stay above their shared panel after its oblique SVG projection.
    panelDepth -= pose?.previewScreen ? 0.1 : 0.001;
  };
  const panelRect = (x: number, up: number, width: number, height: number, color: string) =>
    panel(
      [
        [x - width / 2, up - height / 2],
        [x + width / 2, up - height / 2],
        [x + width / 2, up + height / 2],
        [x - width / 2, up + height / 2],
      ],
      color,
    );
  if (pose?.previewScreen) {
    // Only the loading illustration shows a friendly screen toward the viewer.
    // Keep the shared case, limb attachments and outfit geometry unchanged.
    const roundedPanel = (x: number, up: number, w: number, h: number, r: number, color: string) => {
      const left = x - w / 2, right = x + w / 2, bottom = up - h / 2, top = up + h / 2;
      panel([
        [left + r, bottom], [right - r, bottom], [right, bottom + r], [right, top - r],
        [right - r, top], [left + r, top], [left, top - r], [left, bottom + r],
      ], color);
    };
    roundedPanel(-0.05, 0, 0.71, 0.57, 0.055, trim[0]);
    for (const x of [-0.21, 0.11]) panel(Array.from({ length: 16 }, (_, i): [number, number] => {
      const angle = i * Math.PI / 8;
      return [x + Math.cos(angle) * 0.038, 0.065 + Math.sin(angle) * 0.038];
    }), "#d9f4ed");
    // A compact, rounded double curve gives the loading TV a cat-like smile.
    const smile: [number, number][] = [
      [-0.145, -0.065], [-0.139, -0.103], [-0.12, -0.134], [-0.095, -0.147],
      [-0.062, -0.145], [-0.026, -0.128], [0, -0.11], [0.026, -0.128],
      [0.062, -0.145], [0.095, -0.147], [0.12, -0.134], [0.139, -0.103],
      [0.145, -0.065], [0.134, -0.055], [0.123, -0.065], [0.118, -0.095],
      [0.106, -0.116], [0.09, -0.126], [0.068, -0.126], [0.043, -0.115],
      [0.012, -0.096], [0, -0.077], [-0.012, -0.096], [-0.043, -0.115],
      [-0.068, -0.126], [-0.09, -0.126], [-0.106, -0.116], [-0.118, -0.095],
      [-0.123, -0.065], [-0.134, -0.055],
    ];
    panel(smile.map(([x, up]) => [-0.05 + x * 0.72, up]), "#d9f4ed");
    panelRect(0.39, -0.17, 0.055, 0.045, palette.indicator);
  } else {
    panelRect(0, 0, 0.79, 0.58, shell[1]);
    panelRect(0, 0, 0.71, 0.5, palette.panel);
    for (const up of [-0.08, 0.035, 0.15]) panelRect(0, up, 0.43, 0.037, trim[0]);
    panelRect(0.27, -0.17, 0.055, 0.045, palette.indicator);
  }
  for (const side of [-1, 1]) {
    const swing = stride * side;
    // A loading-only walk lifts one foot while the other stays on the ground.
    const footLift = walkingPhase === undefined ? 0 : Math.max(0, Math.cos(walkingPhase) * side) * 0.12;
    if (!s.outfit?.hat) {
      const firstAntennaFace = renderer.faces.length;
      segment(
        attached(side * 0.19, 0.41, 0.04),
        attached(side * 0.37, 0.76, 0.04),
        0.065,
        0.065,
        trim,
      );
      // In the static loading view, keep both bases visible on the roof.
      // Average-depth sorting otherwise hides the farther antenna's base.
      if (pose?.previewScreen) for (let i = firstAntennaFace; i < renderer.faces.length; i++) renderer.faces[i].z -= 0.2;
    }
    const hip = point(
      [side * 0.26, 0.53, 0],
      [side * 0.26, 0.25, 0.11],
      [side * 0.26, 0.76, 0.05],
    );
    const shoeTop = s.outfit?.shoes === "boots" ? 0.355 : s.outfit?.shoes === "skates" ? 0.25 : 0.23;
    const shoeAnkleDepth = s.outfit?.shoes === "boots" ? -0.035 : s.outfit?.shoes ? 0.02 : 0;
    const ankle = point(
      [side * 0.26, (previewForward ? shoeTop : 0.17) + footLift,
        swing * 0.24 + (previewForward ? shoeAnkleDepth : 0)],
      [side * 0.3, 0.16, 0.76],
      [side * 0.26, 0.65, 0.4],
    );
    const firstLegFace = renderer.faces.length;
    // Keep one continuous leg down to the center of the shoe's upper surface.
    // Extend its slanted end cap below the shoe, then trim at the shoe's flat
    // top in the cached illustration so no cap pokes through that surface.
    const legExtension = previewForward ? 1 + 0.1 / (hip[1] - ankle[1]) : 1;
    const legEnd = previewForward ? hip.map((value, i) => value + (ankle[i] - value) * legExtension) as V : ankle;
    segment(hip, legEnd, 0.14, 0.16, trim);
    if (previewForward) pose?.previewPart?.("leg", firstLegFace, renderer.faces.length, side, ankle[1]);
    const foot = point(
      [side * 0.26, 0.13 + footLift, swing * 0.24],
      [side * 0.3, 0.13, 0.86],
      [side * 0.26, 0.61, 0.46],
    );
    pose?.previewFoot?.(foot, footLift);
    const firstShoeFace = renderer.faces.length;
    if (s.outfit?.shoes) drawShoes(renderer, s.outfit.shoes, foot);
    else renderer.box(...foot, 0.25, 0.2, 0.32, trim);
    if (previewForward) pose?.previewPart?.("shoe", firstShoeFace, renderer.faces.length, side);
    // The near arm needs a little silhouette and color separation in the
    // right-facing loading illustration; its opposite walking swing is shared.
    const nearPreviewArm = previewForward && side === 1;
    segment(
      attached(side * (nearPreviewArm ? 0.53 : 0.5), 0.06, 0),
      point(
        [side * ((nearPreviewArm ? 0.7 : 0.64) - jumpArmLift * 0.04), 0.66 + jumpArmLift * 0.76, -swing * 0.22],
        [side * 0.67, 0.22, -0.19],
        [side * 0.62, 0.93, 0.2],
      ),
      0.14,
      0.16,
      nearPreviewArm ? [shell[0], shell[0], shell[2]] : shell,
    );
  }
  if (s.outfit?.hat) drawHat(renderer, s.outfit.hat,
    previewForward ? (x, up, depth) => attached(-x, up, -depth) : attached, lean);
  if (s.outfit?.effect) drawCosmeticEffect(renderer, s.outfit.effect, attached, renderer.reducedMotion ? 0 : s.time);
  if (!s.rail && (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0)) {
    // A softly phased TV signals that these boosts pass through obstacles.
    // Simulation time freezes the pulse on pause; cart answers remain solid.
    const opacity = 0.55 + Math.sin(s.time * Math.PI * 1.2) * 0.1;
    for (let i = firstFace; i < renderer.faces.length; i++) renderer.faces[i].opacity = opacity;
  }
  const transformRunner = (transform: (point: V) => V) => {
    for (let i = firstFace; i < renderer.faces.length; i++) {
      const face = renderer.faces[i];
      const depthBias =
        face.z - face.points.reduce((sum, p) => sum + p[2], 0) / face.points.length;
      // Rotated boxes share corner arrays across faces. Never mutate those
      // corners here: doing so rotates a shared corner once per visible face.
      face.points = face.points.map(transform);
      face.z = face.points.reduce((sum, p) => sum + p[2], 0) / face.points.length + depthBias;
    }
  };
  const steering = Math.max(-1, Math.min(1, (s.lane * LANE_WIDTH - s.x) / LANE_WIDTH));
  if (steering !== 0) {
    const angle = steering * 0.24,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    transformRunner(([x, y, z]) => [
      s.x + (x - s.x) * cos + z * sin,
      y,
      z * cos - (x - s.x) * sin,
    ]);
  }
  if ((s.edgeStumble ?? 0) > 0) {
    const progress = 1 - Math.min(1, s.edgeStumble / EDGE_STUMBLE_DURATION);
    // A quick shoulder recoil away from the edge, followed by a slower
    // planted-foot recovery. Keep the silhouette compact and over the road.
    const amount = Math.sin(Math.PI * Math.pow(progress, 0.55));
    const direction = s.edgeStumbleDirection ?? 0;
    const angle = direction * amount * 0.14;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    let lowest = Infinity;
    transformRunner(([x, y, z]) => {
      const dx = x - s.x,
        dy = y - 0.13;
      const nextY = 0.13 + dx * sin + dy * cos;
      lowest = Math.min(lowest, nextY);
      return [s.x + dx * cos - dy * sin - direction * amount * 0.12, nextY, z];
    });
    if (lowest < 0.03) transformRunner(([x, y, z]) => [x, y + 0.03 - lowest, z]);
    const edge = s.x + (s.edgeStumbleDirection ?? 0) * 0.66;
    for (let mark = 0; mark < 3; mark++) {
      const x = edge + (mark - 1) * 0.16;
      renderer.face(
        [
          [x, 0.045, -0.45],
          [x + 0.08, 0.045, -0.45],
          [x + 0.14, 0.045, -0.66 - amount * 0.16],
          [x + 0.07, 0.045, -0.69 - amount * 0.16],
        ],
        "#ffdf95",
      );
    }
  }
}
