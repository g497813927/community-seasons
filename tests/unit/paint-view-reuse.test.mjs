import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import "../helpers/compile.mjs";

const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, TURN_DURATION } = await import("../helpers/compiled/engine.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
const { paintFaces } = await import("../helpers/compiled/render/paint.mjs");

// Record the Canvas contract, including material/text state, clipped paths,
// alpha and nested portal artwork. Fixed CSS dimensions keep this independent
// of the device's backing-bitmap quality selection.
function recorder() {
  const hash = createHash("sha256");
  let canvases = 0, gradients = 0;
  const counts = {};
  const record = (...command) => {
    hash.update(JSON.stringify(command, (_key, value) =>
      typeof value === "number" ? Math.round(value * 1e8) / 1e8 : value));
    hash.update("\n");
  };
  function canvas() {
    const id = `canvas-${canvases++}`;
    const ctx = new Proxy({}, {
      get(object, key) {
        if (key in object) return object[key];
        if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => {
          const gradient = `gradient-${gradients++}`;
          record(id, key, gradient, ...args);
          return { id: gradient, addColorStop: (...stops) => record(gradient, "addColorStop", ...stops) };
        };
        return (...args) => {
          counts[key] = (counts[key] ?? 0) + 1;
          record(id, key, ...args.map(value => value?.id ?? value));
        };
      },
      set(object, key, value) {
        record(id, key, value?.id ?? value);
        object[key] = value;
        return true;
      },
    });
    return { id, width: 360, height: 760, getContext: () => ctx, ownerDocument: { createElement: canvas } };
  }
  const renderer = new Renderer(canvas());
  Object.assign(renderer, { w: 360, h: 760, focal: 684, center: 180, horizon: 193.8 });
  return { renderer, counts, digest: () => hash.digest("hex") };
}

function state(scene, pose) {
  const s = Object.assign(createRun(4182, scene), {
    mode: "running", time: 120, distance: 140, nextRow: Infinity,
    nextPortalAt: Infinity, nextRailAt: Infinity, nextForkAt: Infinity,
    obstacles: [{ id: 1, lane: 0, at: 158, kind: "pillar", resolved: false }],
    pickups: [], relics: [],
  });
  if (pose === "fork") Object.assign(s, { fork: { at: 182 }, lane: 1, x: 1.65 });
  if (pose === "turn") Object.assign(s, {
    lastForkAt: 140, turnEntryX: -1.65, turnDirection: -1,
    turnRemaining: TURN_DURATION * .5, speed: 54,
  });
  if (pose === "rail") {
    s.rail = createRailRide(() => .5);
    Object.assign(s.rail, { phase: "question", remaining: 6, duration: 12 });
  }
  if (pose === "portal") s.nextPortalAt = 160;
  if (pose === "boost") s.boosts.rush = 3;
  return s;
}

// Captured before camera-view reuse. These are draw-command fingerprints,
// not timing assertions; they retain the exact previous painting order.
const DRAW_BASELINES = {
  spring: "03d05ec4cef28b96f700add0062e182864f8cb3006ee6839ebaec26bf134639b",
  summer: "53e990a629ee66162a42acc147f4fe41b2ab57864269c65f893927fca947c5d5",
  autumn: "b4326d341f51de3820238fcc0487e83b149fe8a93eac86fc83c5cec2cbffa4dd",
  winter: "efe4f0e5073431d91ce7598fffc74a19a10e9e54a71760fa68e583bd61cbe583",
};

for (const scene of Object.keys(DRAW_BASELINES)) test(`${scene}: camera-view reuse preserves painted output`, () => {
  const { renderer, counts, digest } = recorder();
  for (const locale of ["en", "zh-CN"]) for (const pose of ["straight", "fork", "turn", "rail", "portal", "boost"]) {
    renderer.render(state(scene, pose), 120, false, locale);
  }
  assert.ok(counts.drawImage > 0, "portal textures were not exercised");
  assert.ok(counts.fillText > 0, "printed labels were not exercised");
  assert.equal(digest(), DRAW_BASELINES[scene]);
});

test("painting transforms each face once and refreshes its view on the next paint", () => {
  const { renderer, counts } = recorder();
  const points = [[-.2, 5.1, -9.5], [.2, 5.1, -8], [.2, 5.7, -8], [-.2, 5.7, -9.5]];
  renderer.faces = [
    { points, color: "#ffffff", layer: 1, z: -8.75, opacity: .5 },
    { points: [[-1, 1, 15], [1, 1, 15], [1, 3, 15], [-1, 3, 15]], color: "#ccddaa", layer: 1, z: 15.01 },
  ];
  const faceKeys = renderer.faces.map(face => Object.keys(face));
  let calls = 0;
  const original = renderer.faceView.bind(renderer);
  renderer.faceView = face => { calls++; return original(face); };
  paintFaces(renderer, "spring");
  assert.equal(calls, 2, "sorting and painting recomputed the same camera vertices");
  assert.equal(renderer.faces[0].z, 15.01, "printed overlay depth bias changed");
  assert.ok(counts.fill >= 2, "near-plane clipping discarded the visible polygon");
  assert.equal(renderer.ctx.globalAlpha, 1, "translucent faces leaked their alpha");
  renderer.cameraDepthOffset = 2;
  paintFaces(renderer, "spring");
  assert.equal(calls, 4, "a previous frame's camera coordinates were retained");
  assert.ok(Math.abs(renderer.faces[0].z - 17.01) < 1e-10);
  assert.deepEqual(renderer.faces.map(face => Object.keys(face)).sort(), faceKeys.sort(), "painting retained view caches on face templates");
});
