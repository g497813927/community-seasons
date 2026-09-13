import {
  type RunState,
  LANE_WIDTH,
  SLIDE_DURATION,
  EDGE_STUMBLE_DURATION,
  jumpHeight,
} from "../../engine";
import type { Renderer } from "../../render";
import type { V } from "../types";

export function runner(
  renderer: Renderer,
  s: RunState,
  t: number,
  pose?: { seated?: number; elevation?: number; depth?: number; stride?: number },
) {
  const firstFace = renderer.faces.length;
  const running = s.mode === "running" || s.mode === "ready";
  // The television faces forward down the path (+z), so the chase camera
  // sees its back panel. Feet stay above the road even when sliding.
  const slidePhase =
    s.slide > 0 ? Math.max(0, Math.min((SLIDE_DURATION - s.slide) / 0.12, s.slide / 0.14, 1)) : 0;
  const slide = slidePhase * slidePhase * (3 - 2 * slidePhase);
  const mix = (a: number, b: number) => a + (b - a) * slide;
  const stride =
    pose?.stride ??
    (running && s.jump === 0 ? Math.sin(t * (s.mode === "ready" ? 5 : 15)) * (1 - slide) : 0);
  const y = jumpHeight(s) + Math.abs(stride) * 0.055 + (pose?.elevation ?? 0);
  const seated = pose?.seated ?? 0;
  const point = (standing: V, sliding: V, sitting: V = standing): V => {
    const base = standing.map((v, i) => mix(v, sliding[i]) * (1 - seated) + sitting[i] * seated);
    return [s.x + base[0], y + base[1], base[2] + (pose?.depth ?? 0)];
  };
  const shell = ["#72d0e7", "#3295b3", "#b5eff9"];
  const trim = ["#284c60", "#183444", "#4c7285"];
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
  // Rear-panel details share one surface depth so reclining keeps the vents
  // attached to the case. The forward-facing screen is hidden by the body.
  let panelDepth = attached(0, 0, -0.245)[2];
  const panel = (outline: [number, number][], color: string) => {
    renderer.face(
      outline.map(([x, up]) => attached(x, up, -0.25)),
      color,
    );
    renderer.faces[renderer.faces.length - 1].z = panelDepth;
    panelDepth -= 0.001;
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
  panelRect(0, 0, 0.79, 0.58, "#3295b3");
  panelRect(0, 0, 0.71, 0.5, "#60bfd8");
  for (const up of [-0.08, 0.035, 0.15]) panelRect(0, up, 0.43, 0.037, "#284c60");
  panelRect(0.27, -0.17, 0.055, 0.045, "#f4a4bc");
  for (const side of [-1, 1]) {
    const swing = stride * side;
    segment(
      attached(side * 0.19, 0.41, 0.04),
      attached(side * 0.37, 0.76, 0.04),
      0.065,
      0.065,
      trim,
    );
    const hip = point(
      [side * 0.26, 0.53, 0],
      [side * 0.26, 0.25, 0.11],
      [side * 0.26, 0.76, 0.05],
    );
    const ankle = point(
      [side * 0.26, 0.17, swing * 0.24],
      [side * 0.3, 0.16, 0.76],
      [side * 0.26, 0.65, 0.4],
    );
    segment(hip, ankle, 0.14, 0.16, trim);
    renderer.box(
      ...point(
        [side * 0.26, 0.13, swing * 0.24],
        [side * 0.3, 0.13, 0.86],
        [side * 0.26, 0.61, 0.46],
      ),
      0.25,
      0.2,
      0.32,
      trim,
    );
    segment(
      attached(side * 0.5, 0.06, 0),
      point(
        [side * 0.64, 0.66, -swing * 0.22],
        [side * 0.67, 0.22, -0.19],
        [side * 0.62, 0.93, 0.2],
      ),
      0.14,
      0.16,
      shell,
    );
  }
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
