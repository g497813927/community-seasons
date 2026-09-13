import type { Renderer } from "../render";
import { sceneDefinition, type SceneKind } from "../scenes";
import { WORLD_STYLES, PORTAL_NAMES } from "./styles";

export function railGateway(
  renderer: Renderer,
  z: number,
  locale: "en" | "zh-CN",
  scene: SceneKind = "spring",
  mode: "rail" | "run" = "rail",
) {
  const p = ["#5e9693", "#376969", "#b9ddd0"];
  renderer.face(
    [
      [-2.55, 0.06, z + 0.04],
      [2.55, 0.06, z + 0.04],
      [2.55, 3.8, z + 0.04],
      [-2.55, 3.8, z + 0.04],
    ],
    WORLD_STYLES[scene].sky[1],
  );
  renderer.faces[renderer.faces.length - 1].journey = { scene, mode };
  for (const side of [-1, 1]) renderer.box(side * 2.7, 2.1, z, 0.27, 4.2, 0.4, p);
  renderer.box(0, 4.2, z, 5.65, 0.75, 0.5, p);
  renderer.label(
    0,
    4.25,
    z - 0.27,
    5.3,
    0.53,
    mode === "rail"
      ? locale === "zh-CN"
        ? "进入共建列车"
        : "ENTER THE RAIL QUIZ"
      : locale === "zh-CN"
        ? "回到四季跑道"
        : "RETURN TO THE RUN",
    "#f5efd0",
    p[0],
  );
  renderer.box(0, 3.79, z - 0.05, 5.18, 0.27, 0.1, p);
  renderer.label(
    0,
    3.8,
    z - 0.12,
    4.9,
    0.22,
    mode === "rail"
      ? locale === "zh-CN"
        ? "换道选择答案 · 继续前进即可乘车"
        : "CHOOSE ANSWERS BY LANE · BOARD AHEAD"
      : locale === "zh-CN"
        ? PORTAL_NAMES[scene]
        : sceneDefinition(scene).name,
    "#f5efd0",
    p[1],
  );
}

export function portal(renderer: Renderer, x: number, z: number, scene: SceneKind, locale: "en" | "zh-CN") {
  const frame = ["#53ccb1", "#227f77", "#c3ffee"];
  renderer.face(
    [
      [x - 0.68, 0, z + 0.04],
      [x + 0.68, 0, z + 0.04],
      [x + 0.68, 3.18, z + 0.04],
      [x - 0.68, 3.18, z + 0.04],
    ],
    WORLD_STYLES[scene].sky[1],
  );
  renderer.faces[renderer.faces.length - 1].portal = scene;
  for (const side of [-1, 1]) {
    renderer.box(x + side * 0.77, 1.65, z, 0.18, 3.3, 0.45, frame);
    renderer.box(x + side * 0.66, 1.65, z - 0.25, 0.05, 3.2, 0.08, ["#e9fff2", "#96e8cd", "#ffffff"]);
  }
  renderer.box(x, 3.35, z, 1.72, 0.3, 0.45, frame);
  renderer.box(x, 3.96, z, 2.55, 0.92, 0.3, ["#19594f", "#14473f", "#9ee8cc"]);
  renderer.label(
    x,
    4.16,
    z - 0.17,
    2.42,
    0.35,
    locale === "zh-CN" ? "走入传送门" : "WALK THROUGH",
    "#c2ffe5",
    "#19594f",
  );
  renderer.label(
    x,
    3.77,
    z - 0.18,
    2.42,
    0.36,
    locale === "zh-CN" ? PORTAL_NAMES[scene] : sceneDefinition(scene).name,
    "#ffffff",
    "#19594f",
  );
  for (const step of [1.1, 2.4, 3.7]) {
    renderer.face(
      [
        [x - 0.43, 0.025, z - step],
        [x, 0.025, z - step + 0.45],
        [x + 0.43, 0.025, z - step],
        [x + 0.43, 0.025, z - step - 0.2],
        [x, 0.025, z - step + 0.25],
        [x - 0.43, 0.025, z - step - 0.2],
      ],
      "#ceffe7",
    );
  }
}
