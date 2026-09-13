import type { Renderer } from "../render";
import type { SceneKind } from "../scenes";
import { WORLD_STYLES } from "./styles";

export function drawSky(renderer: Renderer, scene: SceneKind) {
  const c = renderer.ctx,
    w = renderer.w,
    h = renderer.h;
  const world = WORLD_STYLES[scene] ?? WORLD_STYLES.spring;
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, world.sky[0]);
  sky.addColorStop(0.38, world.sky[1]);
  sky.addColorStop(0.65, world.sky[2]);
  sky.addColorStop(1, world.sky[3]);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const sun = c.createRadialGradient(renderer.center, h * 0.17, 2, renderer.center, h * 0.17, h * 0.53);
  sun.addColorStop(0, world.glow);
  sun.addColorStop(0.25, world.glow.slice(0, 7) + "36");
  sun.addColorStop(1, world.glow.slice(0, 7) + "00");
  c.fillStyle = sun;
  c.fillRect(0, 0, w, h);
}

export function drawGround(renderer: Renderer, scene: SceneKind) {
  const c = renderer.ctx,
    w = renderer.w,
    h = renderer.h;
  const world = WORLD_STYLES[scene] ?? WORLD_STYLES.spring;
  // A broad ground plane stays below the horizon as the camera turns.
  // Curving a huge four-corner terrain polygon makes its inner edge fold
  // behind the camera; only actual paths and landmarks follow the route.
  c.fillStyle = scene === "summer" ? "#65b5bd" : world.ground;
  c.fillRect(0, renderer.horizon + h * 0.035, w, h);
}
