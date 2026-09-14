import { type RunState, monsterPresence } from "../../engine";
import type { Renderer } from "../../render";

export function commenters(renderer: Renderer, s: RunState, t: number, locale: "en" | "zh-CN") {
  const presence = monsterPresence(s);
  if (presence <= 0) return;
  const caught = s.mode === "over" && s.chase > 0;
  // Cartoon avatars personify disruptive behavior, never a real identity.
  for (const [index, side] of [-1, 1].entries()) {
    const x = s.x * 0.65 + side * (caught ? 0.95 : 1.55);
    const z = (caught ? -0.5 : s.chase > 0 ? -2.8 : -4.2) - (1 - presence) * 6 - index * 0.35;
    const stride = Math.sin(t * 14 + index * Math.PI),
      bob = Math.abs(stride) * 0.055;
    const trim = ["#3c5363", "#2e3c4d", "#788996"];
    const cloak = index ? "#39334f" : "#583644";
    const cloakFold = index ? "#504564" : "#754451";
    const casing = [cloak, "#292635", cloakFold];
    // Like the runner, these TVs face down the path. Their rear silhouette
    // is wrapped in a cloak, with the warning printed directly on its fabric.
    renderer.face(
      [
        [x - 0.57, 1.18 + bob, z + 0.15],
        [x + 0.57, 1.18 + bob, z + 0.15],
        [x + 0.81, 0.2 + bob, z + 0.22],
        [x + 0.43, 0.13 + bob, z + 0.22],
        [x - 0.43, 0.13 + bob, z + 0.22],
        [x - 0.81, 0.2 + bob, z + 0.22],
      ],
      cloak,
    );
    renderer.box(x, 0.94 + bob, z, 1.04, 0.88, 0.48, casing);
    for (const sign of [-1, 1]) {
      renderer.box(x + sign * 0.29, 1.57 + bob, z + 0.01, 0.065, 0.4, 0.065, trim, 0, -sign * 0.48);
      renderer.box(
        x + sign * 0.26,
        0.34,
        z + sign * stride * 0.15,
        0.16,
        0.34,
        0.18,
        trim,
        sign * stride * 0.24,
      );
      renderer.box(x + sign * 0.26, 0.12, z - 0.04 + sign * stride * 0.15, 0.27, 0.18, 0.34, trim);
      renderer.box(
        x + sign * 0.61,
        0.87 + bob,
        z - sign * stride * 0.1,
        0.14,
        0.43,
        0.16,
        casing,
        -0.2,
        sign * 0.25,
      );
      renderer.face(
        [
          [x + sign * 0.53, 1.13 + bob, z - 0.275],
          [x + sign * 0.66, 0.43 + bob, z - 0.275],
          [x + sign * 0.8, 0.2 + bob, z - 0.275],
          [x + sign * 0.4, 0.16 + bob, z - 0.275],
          [x + sign * 0.45, 0.76 + bob, z - 0.275],
        ],
        cloakFold,
      );
    }
    renderer.face(
      [
        [x - 0.53, 1.39 + bob, z - 0.28],
        [x + 0.53, 1.39 + bob, z - 0.28],
        [x + 0.66, 0.45 + bob, z - 0.28],
        [x + 0.47, 0.14 + bob, z - 0.28],
        [x - 0.48, 0.18 + bob, z - 0.28],
        [x - 0.66, 0.45 + bob, z - 0.28],
      ],
      cloak,
    );
    renderer.label(
      x,
      0.83 + bob,
      z - 0.29,
      0.82,
      0.2,
      locale === "zh-CN" ? (index ? "引战!!" : "刷屏!!") : index ? "BAIT!!" : "SPAM!!",
      "#f3c9c8",
      cloak,
    );
  }
}
