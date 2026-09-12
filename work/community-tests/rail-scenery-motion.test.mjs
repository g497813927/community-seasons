import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { Renderer } = await import("./compiled/render.mjs");
const { createRun, update, RAIL_RETURN_DURATION, RAIL_SPEED } = await import("./compiled/engine.mjs");
const { createRailRide } = await import("./compiled/railway.mjs");
const { railTravelFrame } = await import("./compiled/rail-transition.mjs");
globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};
function renderer() {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, { get: (o, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => gradient : o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
  r.resize(); return r;
}
function state(scene, elapsed = 1.9, phase = "question") {
  const s = createRun(4182, scene);
  s.mode = "running"; s.distance = 950.37 + elapsed * RAIL_SPEED; s.time = 100;
  s.rail = createRailRide(() => 0.5);
  Object.assign(s.rail, { speed: RAIL_SPEED, phase, elapsed, remaining: phase === "question" ? 7 : 1, duration: phase === "question" ? 10 : 2 });
  return s;
}
function capture(r, s, wallTime = 0) {
  const rows = new Map();
  const original = r.scenery;
  r.scenery = function(scene, row, z) {
    const first = this.faces.length;
    original.call(this, scene, row, z);
    rows.set(row, { z, faces: this.faces.slice(first).map(f => ({ color: f.color, points: f.points.map(p => [...p]) })) });
  };
  try { r.render(s, wallTime); } finally { r.scenery = original; }
  return { rows, rails: r.faces.filter(f => f.color === "#cedbd3").map(f => f.points.map(p => [...p])) };
}
function sharedLandmark(before, after) {
  return [...before.rows].find(([row, value]) => value.z > 25 && value.z < 60 && after.rows.has(row));
}

test("all seasonal landmarks approach the player at the same speed as the railway sleepers", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const r = renderer(), s = state(scene);
    const before = capture(r, s);
    update(s, 0.05);
    const untouched = structuredClone(s), after = capture(r, s);
    assert.deepEqual(s, untouched, "rendering changes gameplay distance, clocks or rewards");
    const [row, old] = sharedLandmark(before, after), next = after.rows.get(row);
    assert.equal(old.faces.length, next.faces.length);
    for (let face = 0; face < old.faces.length; face++) for (let point = 0; point < old.faces[face].points.length; point++) {
      const a = old.faces[face].points[point], b = next.faces[face].points[point];
      assert.equal(a[0], b[0]); assert.equal(a[1], b[1]);
      assert.ok(Math.abs(a[2] - b[2] - 0.6) < 1e-8, `${scene}: landmark remains stationary or moves away`);
    }
    assert.ok(Math.abs(before.rails[0][0][2] - after.rails[0][0][2] - 0.6) < 1e-8, "scenery and track motion disagree");
    const oldPoint = old.faces[0].points[0], nextPoint = next.faces[0].points[0];
    assert.ok(Math.abs(r.project(nextPoint)[0] - r.center) >= Math.abs(r.project(oldPoint)[0] - r.center), "landmark does not grow toward the viewer");
  }
});

test("scenery recycling and question/feedback transitions preserve the same continuous world positions", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const r = renderer(), s = state(scene, (980 - 950.37) / 12 - 0.01);
    const beforeWrap = capture(r, s); update(s, 0.02); const afterWrap = capture(r, s);
    const [row, previous] = sharedLandmark(beforeWrap, afterWrap);
    assert.ok(Math.abs(previous.z - afterWrap.rows.get(row).z - 0.24) < 1e-8, "recycling teleports a landmark");
    const base = capture(r, s);
    for (const phase of ["feedback", "question", "complete"]) {
      s.rail.phase = phase; s.rail.duration = phase === "question" ? 10 : 2; s.rail.remaining = 0.8;
      const next = capture(r, s);
      assert.deepEqual(next.rows, base.rows, `${phase} resets the scenery clock`);
    }
  }
});

test("pausing freezes rail scenery even while wall-clock time advances", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) for (const phase of ["boarding", "question", "feedback", "complete"]) {
    const r = renderer(), s = state(scene, 12.4, phase); s.mode = "paused";
    const before = capture(r, s, 0); update(s, 0.05); const after = capture(r, s, 120);
    assert.deepEqual(after.rows, before.rows); assert.deepEqual(after.rails, before.rails);
  }
});

test("boarding and returning retain the same scenery positions while the tunnel covers the model swap", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const r = renderer(), s = state(scene, 0, "boarding");
    const boarding = capture(r, s), normal = structuredClone(s); normal.rail = null;
    assert.deepEqual(capture(r, normal).rows, boarding.rows, "boarding snaps scenery to a different location");
    s.rail.phase = "complete"; s.rail.elapsed = 40;
    const before = capture(r, s); update(s, 0.05); const after = capture(r, s);
    const [row, old] = sharedLandmark(before, after);
    assert.ok(Math.abs(old.z - after.rows.get(row).z - 0.6) < 1e-8, "complete phase stops scenery while tracks still move");
    normal.distance = s.distance; normal.railReturnRemaining = RAIL_RETURN_DURATION;
    assert.deepEqual(capture(r, normal).rows, after.rows, "rail exit jumps scenery or double-counts mileage");
    assert.equal(railTravelFrame(normal).opacity, 1, "return reveals the player-model swap");
  }
});
