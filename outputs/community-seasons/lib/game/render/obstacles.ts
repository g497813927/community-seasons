import type { Renderer } from "../render";
import { LANE_WIDTH, type RunState } from "../engine";
import { getLesson } from "../community";

export function drawObstacles(renderer: Renderer, s: RunState, locale: "en" | "zh-CN") {
  const obstacles = s.rail ? [] : s.obstacles;
  for (const o of obstacles) {
    const z = o.at - s.distance;
    if (z < -7 || z > 138) continue;
    const start = renderer.beginCourseObject(z);
    const x = o.lane * LANE_WIDTH;
    const lesson = getLesson(o);
    const title = lesson.label[locale === "zh-CN" ? "zh" : "en"];
    const ink = "#392238";
    const paper = ["#f0d9cc", "#b58982", "#fff0dd"];
    const border = ["#a65761", "#733e50", "#d59186"];
    if (o.kind === "block") {
      // A low comment card has the same jump clearance as the old barrier.
      renderer.box(x, 0.47, z, 1.37, 0.94, 0.8, paper);
      renderer.box(x, 0.94, z, 1.42, 0.1, 0.83, border);
      renderer.label(x, 0.68, z - 0.414, 1.32, 0.52, title, ink, paper[0], true);
      renderer.label(
        x,
        0.24,
        z - 0.417,
        1.32,
        0.3,
        locale === "zh-CN" ? "↑ 跳过" : "↑ JUMP",
        ink,
        paper[0],
        true,
      );
    } else if (o.kind === "arch") {
      // A suspended post leaves the familiar sliding gap beneath it.
      renderer.box(x - 0.67, 1.2, z, 0.17, 2.4, 0.3, border);
      renderer.box(x + 0.67, 1.2, z, 0.17, 2.4, 0.3, border);
      renderer.box(x, 1.98, z, 1.55, 1.04, 0.63, paper);
      renderer.box(x, 1.44, z - 0.01, 1.55, 0.12, 0.66, border);
      renderer.label(x, 2.24, z - 0.325, 1.46, 0.46, title, ink, paper[0], true);
      renderer.label(
        x,
        1.75,
        z - 0.328,
        1.46,
        0.34,
        locale === "zh-CN" ? "↓ 下滑" : "↓ SLIDE",
        ink,
        paper[0],
        true,
      );
    } else if (o.kind === "roots") {
      // Repeated comment strips form a small trip hazard across the lane.
      renderer.box(x, 0.13, z, 1.48, 0.24, 0.45, paper);
      renderer.box(x + 0.06, 0.29, z + 0.07, 1.34, 0.1, 0.4, border);
      renderer.label(x, 0.2, z - 0.236, 1.42, 0.28, title, ink, paper[0], true);
    } else {
      // Tall post cards must be bypassed by changing lanes.
      renderer.box(x, 1.35, z, 1.28, 2.7, 1, paper);
      renderer.box(x, 2.69, z, 1.33, 0.12, 1.04, border);
      renderer.label(x, 2.25, z - 0.514, 1.23, 0.86, title, ink, paper[0], true);
      for (const [line, width] of [0.89, 0.67, 0.82].entries())
        renderer.box(x - (0.9 - width) / 2, 1.65 - line * 0.28, z - 0.52, width, 0.1, 0.025, border);
      renderer.label(
        x,
        0.5,
        z - 0.54,
        1.23,
        0.44,
        locale === "zh-CN" ? "← 换道 →" : "← DODGE →",
        ink,
        paper[0],
        true,
      );
    }
    renderer.endCourseObject(start);
  }
}
