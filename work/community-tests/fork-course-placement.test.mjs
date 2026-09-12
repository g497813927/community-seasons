import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { Renderer } = await import("./compiled/render.mjs");
const { createRun, TURN_DURATION, LANE_WIDTH } = await import("./compiled/engine.mjs");
globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};
function renderer() {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, { get: (o, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => gradient : o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 440, height: 752 }) });
  r.resize(); return r;
}
function state() {
  return Object.assign(createRun(4182, "spring"), {
    mode: "running", distance: 468, time: 35, speed: 14.8, fork: { at: 472 },
    nextPortalAt: 1e9, nextRailAt: 1e9,
    obstacles: [{ id: 1, lane: 0, at: 514, kind: "block", resolved: false }],
    pickups: [{ id: 2, lane: 1, at: 518, height: 1, taken: false }],
    relics: [{ id: 3, lane: -1, at: 524, kind: "magnet", height: 2.4, taken: false }],
  });
}
test("future comment cards and coins follow both outgoing streets instead of floating straight ahead", () => {
  const r = renderer(), s = state(); r.render(s, 0);
  const cards = r.faces.filter(f => f.text?.value === "↑ JUMP");
  const coins = r.faces.filter(f => f.color === "#ffca63");
  assert.equal(cards.length, 2, "one possible exit loses its obstacle");
  assert.equal(coins.length, 2, "one possible exit loses its coin");
  for (const group of [cards, coins]) {
    assert.ok(group.every(f => f.cameraSpace), "a course object remains in the straight route coordinate system");
    const centers = group.map(f => f.points.reduce((sum, p) => sum + p[0], 0) / f.points.length);
    assert.ok(centers.some(x => x < -8) && centers.some(x => x > 8), "future objects hover over the blocked central ground");
  }
});
test("course geometry keeps its world position when either turn is selected", () => {
  for (const direction of [-1, 1]) {
    const r = renderer(), s = state();
    s.distance = 472; s.x = direction * LANE_WIDTH; s.lane = direction;
    r.render(s, 0);
    const capture = () => r.faces.filter(f => f.text?.value === "↑ JUMP" || f.color === "#ffca63")
      .map(f => ({ key: f.text?.value ?? f.color, points: r.faceView(f) }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.points[0][0] - b.points[0][0]);
    const before = capture();
    Object.assign(s, { fork: null, lastForkAt: 472, turnDirection: direction, turnEntryX: s.x, turnRemaining: TURN_DURATION, lane: 0, x: 0 });
    r.render(s, 0);
    const after = capture();
    assert.equal(after.length, before.length);
    before.forEach((face, i) => face.points.forEach((point, j) => point.forEach((value, axis) => {
      assert.ok(Math.abs(value - after[i].points[j][axis]) < 1e-8, "course geometry teleports at the fork");
    })));
  }
});
test("ordinary runs keep single course objects and never mutate their simulation data", () => {
  const r = renderer(), s = state(); s.fork = null;
  const original = structuredClone(s); r.render(s, 0);
  assert.equal(r.faces.filter(f => f.text?.value === "↑ JUMP").length, 1);
  assert.equal(r.faces.filter(f => f.color === "#ffca63").length, 1);
  assert.deepEqual(s, original);
  assert.equal(r.captureScenery, false);
});
