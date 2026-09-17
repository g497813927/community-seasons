import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, LANE_WIDTH, TURN_DURATION } = await import("../helpers/compiled/engine.mjs");
const { WORLD_STYLES } = await import("../helpers/compiled/render/styles.mjs");
globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};

function setup(blockedDirection, scene = "spring", speed = 15) {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (o, key) => key === "createLinearGradient" || key === "createRadialGradient" ? () => gradient : o[key] ?? noop,
    set: (o, key, value) => (o[key] = value, true),
  });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
  r.resize();
  const s = Object.assign(createRun(4182, scene), {
    mode: "running", time: 100, distance: 432, speed,
    fork: { at: 472, blockedDirection }, nextForkAt: 472,
    nextRailAt: 1e9, nextPortalAt: 1e9, nextRow: 1e9,
    obstacles: [{ id: 1, lane: 0, at: 505, kind: "block", resolved: false }],
    pickups: [{ id: 2, lane: 0, at: 510, height: 1, taken: false }], relics: [],
  });
  return { r, s };
}

function containsXZ(face, [x, , z]) {
  const signs = face.points.map((a, i) => {
    const b = face.points[(i + 1) % face.points.length];
    return (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
  });
  return signs.every(v => v >= -1e-7) || signs.every(v => v <= 1e-7);
}

test("a closed branch ends physically while every season retains the open road and its rewards", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    for (const blocked of [-1, 1]) for (const speed of [15, 66, 132]) {
      const { r, s } = setup(blocked, scene, speed);
      r.render(s, 0);
      const road = r.faces.filter(f => f.layer === 0 && WORLD_STYLES[scene].road.includes(f.color));
      for (const side of [-1, 1]) {
        assert.ok(road.some(f => containsXZ(f, r.cameraPoint([side * LANE_WIDTH, 0, 38]))), "incoming lane ends too early");
        assert.ok(road.some(f => containsXZ(f, r.roadPoint(side, 0, 0, 42))), "missing connector stub");
        assert.equal(road.some(f => containsXZ(f, r.roadPoint(side, 0, 0, 52.3))), side !== blocked, "road does not match branch availability");
      }
      assert.equal(r.faces.filter(f => f.text?.value === "↑ JUMP").length, 1, "obstacles lead into the dead end");
      assert.equal(r.faces.filter(f => f.color === "#ffca63").length, 1, "coins lead into the dead end");
      const barrier = r.faces.filter(f => ["#a94f45", "#773c36", "#d78065"].includes(f.color));
      assert.ok(barrier.length > 0);
      const wallPoints = barrier.flatMap(f => f.points);
      assert.ok(Math.max(...wallPoints.map(p => p[1])) >= 2.7, "dead end must be a tall wall, like a lane-change obstacle");
      assert.ok(Math.min(...wallPoints.map(p => p[1])) <= 0, "wall must reach the road without a sliding gap");
      assert.ok(barrier.every(f => f.points.every(([x]) => x * blocked > 0.8)), "dead-end barrier covers the open lane");
    }
  }
});

test("fork signs explicitly name the closure and point only to the safe side in both languages", () => {
  for (const blocked of [-1, 1]) for (const locale of ["en", "zh-CN"]) {
    const { r, s } = setup(blocked);
    r.render(s, 0, false, locale);
    const labels = r.faces.flatMap(f => f.text ? [f.text.value] : []);
    assert.ok(labels.includes(blocked === -1 ? "×       →" : "←       ×"));
    assert.ok(labels.includes(locale === "en"
      ? blocked === -1 ? "LEFT CLOSED · TURN RIGHT" : "RIGHT CLOSED · TURN LEFT"
      : blocked === -1 ? "左路封闭 · 向右转" : "右路封闭 · 向左转"));
  }
});

test("dead ends, signs and course objects stay in place when committing to the open turn", () => {
  for (const blocked of [-1, 1]) for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const { r, s } = setup(blocked, scene);
    s.distance = 472; s.lane = -blocked; s.x = -blocked * LANE_WIDTH;
    r.render(s, 0);
    const capture = () => r.faces.filter(f =>
      (f.layer === 0 && WORLD_STYLES[scene].road.includes(f.color)) ||
      ["#a94f45", "#773c36", "#d78065", "#ffca63"].includes(f.color) || f.text,
    ).map(f => ({ color: f.color, label: f.text?.value, points: r.faceView(f) }));
    const before = capture();
    Object.assign(s, {
      lastForkAt: s.fork.at, lastForkBlockedDirection: blocked, fork: null,
      turnDirection: -blocked, turnEntryX: s.x, turnRemaining: TURN_DURATION, x: 0, lane: 0,
    });
    r.render(s, 0);
    const after = capture();
    assert.equal(after.length, before.length, "closed branch reappears at commitment");
    before.forEach((face, i) => {
      assert.equal(after[i].color, face.color);
      assert.equal(after[i].label, face.label);
      face.points.forEach((point, j) => point.forEach((value, axis) =>
        assert.ok(Math.abs(value - after[i].points[j][axis]) < 1e-8, "junction geometry snaps"),
      ));
    });
    s.turnRemaining = 0; s.distance += 300; s.time += 10;
    r.render(s, 0);
    assert.equal(r.forkBlockedDirection, 0, "closure leaks into ordinary road");
  }
});
