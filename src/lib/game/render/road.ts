import type { Renderer } from "../render";
import { LANE_WIDTH, type RunState } from "../engine";
import { WORLD_STYLES } from "./styles";
import type { V } from "./types";

export function road(renderer: Renderer, s: RunState, travel: number) {
  const world = WORLD_STYLES[s.scene],
    p = world.palette;
  const junction =
    renderer.forkDepth ?? (renderer.curveStrength > 0 || renderer.curveTail ? -renderer.curveAlong : null);
  const blocked = renderer.forkBlockedDirection;
  const paint = (points: V[], color: string) => {
    if (points.every((point) => point[2] < -9)) return;
    renderer.faces.push({
      points,
      color,
      cameraSpace: true,
      layer: 0,
      z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
    });
  };
  const strip = (branch: number, row: number, near: number, far: number) => {
    if (far - near < 0.000001) return;
    const point = (x: number, y: number, z: number) => renderer.roadPoint(branch, x, y, z);
    const along = junction === null ? Infinity : near - junction;
    // The first few meters are a single connector, then open back into the
    // three playable lanes once the two streets have separated.
    const connector = branch !== 0 && renderer.turnRoadWidth(along) < 0.85;
    const lanes = connector ? [0] : [-1, 0, 1];
    for (const lane of lanes) {
      const x = lane * LANE_WIDTH;
      const half = connector ? LANE_WIDTH * 1.5 - 0.0175 : (LANE_WIDTH - 0.035) / 2;
      paint(
        [
          point(x - half, -0.02, near),
          point(x + half, -0.02, near),
          point(x + half, -0.02, far),
          point(x - half, -0.02, far),
        ],
        world.road[Math.abs(row + lane) % 3],
      );
      if (s.scene === "summer") {
        const start = Math.max(near, row * 3 - travel - 0.5);
        const end = Math.min(far, row * 3 - travel - 0.46);
        if (end > start)
          paint(
            [
              point(x - half, 0.005, start),
              point(x + half, 0.005, start),
              point(x + half, 0.005, end),
              point(x - half, 0.005, end),
            ],
            "#8b775b",
          );
      } else if (s.scene === "autumn") {
        const start = Math.max(near, row * 3 - travel - 0.3);
        if (far > start)
          paint(
            [
              point(x, 0.005, start),
              point(x + 0.025, 0.005, start),
              point(x + 0.025, 0.005, far),
              point(x, 0.005, far),
            ],
            "#9b7565",
          );
      }
    }
    for (const side of [-1, 1]) {
      const x = side * 2.6;
      paint(
        [
          point(x - 0.09, 0.025, near),
          point(x + 0.09, 0.025, near),
          point(x + 0.09, 0.025, far),
          point(x - 0.09, 0.025, far),
        ],
        p.stone[0],
      );
    }
  };
  const first = Math.floor(travel / 3);
  for (let i = 50; i >= -2; i--) {
    const row = first + i,
      z = row * 3 - travel;
    const near = z - 1.49,
      far = z + 1.49;
    if (junction === null) strip(0, row, near, far);
    else {
      // Split a slab at the exact junction instead of overlaying two full
      // roads along the approach. The closed center lane simply ends here.
      if (near < junction) strip(0, row, near, Math.min(far, junction));
      if (far > junction)
        for (const branch of [-1, 1])
          strip(branch, row, Math.max(near, junction), branch === blocked ? Math.min(far, junction + 4) : far);
    }
  }
  renderer.layer = 1;
  if (junction !== null && junction > -5 && junction < 130) {
    // Keep the same physical center barrier as it passes behind the TV.
    const start = renderer.faces.length;
    const savedCapture = renderer.captureScenery;
    renderer.captureScenery = true;
    const z = junction;
    renderer.box(0, 0.42, z - 0.06, 1.35, 0.84, 0.32, ["#9c6850", "#684739", "#d8b778"]);
    for (const x of [-0.43, 0, 0.43])
      renderer.box(x, 0.43, z - 0.23, 0.13, 0.61, 0.025, ["#fff0bb", "#d8b778", "#fff0bb"], 0, -0.35);
    if (blocked) {
      const x = blocked * LANE_WIDTH;
      // Match the tall lane-change obstacles: this full-height wall cannot
      // be mistaken for a low hurdle or a sliding gap.
      // It remains at the same junction after committing to the open turn.
      renderer.box(x, 1.35, z - 0.06, 1.55, 2.7, 1, ["#a94f45", "#773c36", "#d78065"]);
      renderer.box(x, 2.7, z - 0.06, 1.6, 0.12, 1.04, ["#d8b778", "#684739", "#fff0bb"]);
      for (const y of [1.15, 1.55, 2.45])
        renderer.box(x, y, z - 0.575, 1.55, 0.035, 0.025, ["#773c36", "#773c36", "#773c36"]);
      for (const dx of [-0.53, 0, 0.53])
        renderer.box(x + dx, 0.42, z - 0.59, 0.15, 0.66, 0.025, ["#fff0bb", "#d8b778", "#fff0bb"], 0, -0.35);
      renderer.label(x, 2, z - 0.61, 0.78, 0.78, "×", "#fff0bb", "#773c36", true);
      renderer.label(x, 0.93, z - 0.615, 1.43, 0.34,
        renderer.renderLocale === "zh-CN" ? "此路不通" : "DEAD END", "#fff0bb", "#773c36");
    }
    renderer.box(0, 1, z, 0.18, 2, 0.18, p.dark);
    renderer.box(0, 1.95, z, 2.55, 0.9, 0.3, ["#63554d", "#423d3e", "#b39c76"]);
    renderer.label(0, 2.08, z - 0.16, 2.35, 0.47,
      blocked === -1 ? "×       →" : blocked === 1 ? "←       ×" : "←       →",
      "#fff0bb", "#63554d", true);
    renderer.label(
      0,
      1.7,
      z - 0.17,
      2.35,
      0.25,
      renderer.renderLocale === "zh-CN"
        ? blocked === -1 ? "左路封闭 · 向右转" : blocked === 1 ? "右路封闭 · 向左转" : "前方分岔 · 请选择转向"
        : blocked === -1 ? "LEFT CLOSED · TURN RIGHT" : blocked === 1 ? "RIGHT CLOSED · TURN LEFT" : "FORK · TURN LEFT OR RIGHT",
      "#fff0bb",
      "#63554d",
    );
    renderer.captureScenery = savedCapture;
    const faces = renderer.faces.splice(start);
    for (const face of faces) {
      const points = face.points.map(([x, y, depth]) => renderer.roadPoint(0, x, y, depth));
      if ((face.cull && !renderer.frontFacing(points)) || points.every((point) => point[2] < -9))
        continue;
      renderer.faces.push({
        ...face,
        points,
        cameraSpace: true,
        z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
      });
    }
  }
}
