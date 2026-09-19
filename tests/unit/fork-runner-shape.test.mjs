import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, LANE_WIDTH, TURN_DURATION } = await import("../helpers/compiled/engine.mjs");
globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};

function setup() {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (o, key) => key === "createLinearGradient" || key === "createRadialGradient" ? () => gradient : o[key] ?? noop,
    set: (o, key, value) => (o[key] = value, true),
  });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 1440, height: 800 }) });
  r.resize();
  return r;
}

test("the whole runner stays compact as its front and rear cross either fork entrance", () => {
  for (const direction of [-1, 1]) for (const blocked of [0, -direction]) {
    for (const speed of [15, 42, 66, 132]) for (const entry of [-direction * LANE_WIDTH, 0, direction * 1.05, direction * LANE_WIDTH]) {
      const r = setup();
      const s = Object.assign(createRun(4182), {
        mode: "running", time: 120, distance: 472, speed, fork: null,
        lastForkAt: 472, lastForkBlockedDirection: blocked,
        turnDirection: direction, turnEntryX: entry, lane: 0, x: 0,
      });
      // Sub-frame samples include the instant of commitment and the rear
      // foot crossing the junction. Center-only checks miss a torn mesh.
      let previous;
      for (let along = 0; along <= 1; along += 0.025) {
        s.turnRemaining = TURN_DURATION * (1 - along / Math.max(24, speed * TURN_DURATION));
        r.configureCamera(s);
        r.faces = [];
        r.captureScenery = true;
        r.runner({ ...s, x: s.x + r.turnEntryOffset }, s.time);
        r.captureScenery = false;
        const view = r.faces.map(f => r.faceView(f));
        for (const [i, face] of r.faces.entries()) {
          for (let j = 0; j < face.points.length; j++) {
            const k = (j + 1) % face.points.length;
            const length = (a, b) => Math.hypot(...a.map((v, axis) => v - b[axis]));
            assert.ok(Math.abs(length(view[i][j], view[i][k]) - length(face.points[j], face.points[k])) < 0.12,
              `runner stretches at turn ${direction}, speed ${speed}, entry ${entry}, along ${along}, face ${i}/${j}: ${length(view[i][j], view[i][k])} vs ${length(face.points[j], face.points[k])}`);
            if (previous) assert.ok(length(view[i][j], previous[i][j]) < 0.035, "a runner vertex jumps at the fork");
          }
        }
        previous = view;
      }
    }
  }
});
