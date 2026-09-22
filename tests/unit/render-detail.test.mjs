import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, TURN_DURATION } = await import("../helpers/compiled/engine.mjs");
const { sceneryRowVisible } = await import("../helpers/compiled/render/scenes/index.mjs");

globalThis.window = { devicePixelRatio: 1 };
const scenes = ["spring", "summer", "autumn", "winter"];
const noop = () => {};
function renderer(detail = 0) {
  let fills = 0;
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (object, key) => key === "createLinearGradient" || key === "createRadialGradient"
      ? () => gradient : key === "fill" ? () => fills++ : object[key] ?? noop,
    set: (object, key, value) => ((object[key] = value), true),
  });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 360, height: 760 }) });
  r.resize();
  r.detail = detail;
  return { r, fills: () => fills };
}
function state(scene = "spring", extra = {}) {
  return Object.assign(createRun(4182, scene), {
    mode: "running", time: 120, distance: 140, nextRow: Infinity,
    nextPortalAt: Infinity, nextRailAt: Infinity, nextForkAt: Infinity,
    obstacles: [], pickups: [], relics: [],
  }, extra);
}

test("reduced scenery density retains every seasonal variant, including negative world rows", () => {
  for (const detail of [0, 1, 2]) {
    const variants = Array(6).fill(0);
    const retained = [];
    for (let row = -30; row < 30; row++) if (sceneryRowVisible(row, detail)) {
      variants[((row % 6) + 6) % 6]++;
      retained.push(row);
    }
    assert.deepEqual(variants, Array(6).fill([10, 6, 4][detail]));
    assert.ok(retained.slice(1).every((row, i) => row - retained[i] <= [1, 2, 3][detail]));
  }
});

test("retained scenery rows keep complete landmarks and branch geometry at every detail level", () => {
  for (const scene of scenes) for (const fork of [false, true]) for (let row = 8; row < 18; row++) {
    const s = state(scene, fork ? { fork: { at: 154 }, x: 1.65, lane: 1 } : {});
    const views = [0, 1, 2].map(detail => {
      const { r } = renderer(detail);
      r.configureCamera(s);
      r.forkDepth = fork ? 14 : null;
      r.scenery(scene, row, row * 14 - s.distance);
      return r;
    });
    for (const detail of [1, 2]) {
      assert.deepEqual(views[detail].faces, sceneryRowVisible(row, detail) ? views[0].faces : [],
        `${scene}, fork=${fork}, row=${row}, detail=${detail}: partial or shifted landmark`);
      if (!sceneryRowVisible(row, detail)) assert.equal(views[detail].sceneryTemplates.size, 0,
        "omitted rows still built scenery geometry");
    }
  }
});

test("low detail cuts scenery and paving work while preserving the runner and full visible course", () => {
  for (const scene of scenes) {
    const views = [0, 1, 2].map(detail => {
      const view = renderer(detail);
      view.r.render(state(scene), 120);
      return view;
    });
    assert.ok(views[1].r.faces.length < views[0].r.faces.length * .78, `${scene}: medium face reduction`);
    assert.ok(views[2].r.faces.length < views[0].r.faces.length * .5, `${scene}: low face reduction`);
    assert.ok(views[2].fills() < views[0].fills() * .55, `${scene}: low fill reduction`);
    for (const detail of [1, 2]) {
      const road = views[detail].r.faces.filter(face => face.layer === 0);
      assert.ok(road.every(face => face.cameraSpace), "coarse road left camera coordinates");
      assert.ok(Math.max(...road.flatMap(face => face.points.map(point => point[2]))) >= 150,
        "reduced detail shortened the visible course");
      const mascot = view => view.r.faces.filter(face => face.color === "#72d0e7");
      assert.deepEqual(mascot(views[detail]), mascot(views[0]), "detail changed the mascot");
    }
  }
});

test("coarse roads keep three lanes, exact junction splits, blocked exits and all fork labels", () => {
  for (const detail of [1, 2]) for (const blockedDirection of [-1, 0, 1]) {
    const s = state("spring", { fork: { at: 160, blockedDirection } });
    const { r } = renderer(detail), calls = [];
    r.configureCamera(s);
    r.forkDepth = 20;
    const original = r.roadPoint.bind(r);
    r.roadPoint = (branch, x, y, z) => { calls.push({ branch, x, y, z }); return original(branch, x, y, z); };
    r.road(s, s.distance);
    const lanePoints = calls.filter(p => p.y === -.02);
    assert.ok(lanePoints.filter(p => p.branch === 0).every(p => p.z <= 20));
    for (const branch of [-1, 1]) {
      const points = lanePoints.filter(p => p.branch === branch);
      assert.ok(points.some(p => p.z === 20), "outgoing road does not start at the junction");
      assert.ok(points.every(p => p.z >= 20));
      if (branch === blockedDirection) assert.ok(points.every(p => p.z <= 24), "dead end gained an outgoing street");
      else {
        assert.ok(points.some(p => p.z >= 150), "open branch stops before the horizon");
        for (const x of [-1.65, 0, 1.65]) assert.ok(points.some(p => p.z > 50 && Math.abs(p.x - x) < .81));
      }
    }
    const reference = renderer(0).r;
    reference.configureCamera(s); reference.forkDepth = 20; reference.road(s, s.distance);
    assert.deepEqual(r.faces.filter(f => f.layer !== 0), reference.faces.filter(f => f.layer !== 0),
      "road detail changed the physical barrier or direction labels");
    const laneSlabs = r.faces.filter(f => f.layer === 0 && ["#d8cdb1", "#cfc2a5", "#c4b99f"].includes(f.color));
    assert.ok(laneSlabs.length > 0);
  }
});

test("low-detail paving uses at most six-meter segments throughout active turns", () => {
  const { r } = renderer(2);
  const s = state("summer", { lastForkAt: 140, turnDirection: 1, turnEntryX: 1.65, turnRemaining: TURN_DURATION / 2 });
  const spans = [];
  const original = r.roadPoint.bind(r);
  let depths = [];
  r.roadPoint = (...args) => {
    if (args[2] === -.02) {
      depths.push(args[3]);
      if (depths.length === 4) { spans.push(Math.max(...depths) - Math.min(...depths)); depths = []; }
    }
    return original(...args);
  };
  r.configureCamera(s);
  r.road(s, s.distance);
  assert.ok(spans.length > 0);
  assert.ok(spans.every(span => span <= 6), "coarse paving straightened a tight bend");
});
