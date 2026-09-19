import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, LANE_WIDTH, TURN_DURATION } = await import("../helpers/compiled/engine.mjs");
const { drawObstacles } = await import("../helpers/compiled/render/obstacles.mjs");
const { paintFaces } = await import("../helpers/compiled/render/paint.mjs");

globalThis.window = { devicePixelRatio: 1 };
const PAPER = ["#f0d9cc", "#b58982", "#fff0dd"];
const BORDER = ["#a65761", "#733e50", "#d59186"];
const ORIGIN = [0, 5.4, -10];
const sub = (a, b) => a.map((n, i) => n - b[i]);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const triangles = (face) => face.points.slice(1, -1).map((point, i) => [face.points[0], point, face.points[i + 2]]);

function renderer() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (object, property) => property === "createLinearGradient" || property === "createRadialGradient"
      ? () => ({ addColorStop: noop }) : object[property] ?? noop,
    set: (object, property, value) => ((object[property] = value), true),
  });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 440, height: 752 }) });
  r.resize();
  r.center = r.w / 2;
  r.horizon = r.h * 0.255;
  r.focal = r.h * 0.9;
  return r;
}

// A complete, two-sided solid is the reference, independently of which
// internal surfaces the renderer omits or subdivides. The original boxes
// define the exterior shape even when an implementation joins their shells.
function solidBox(x, y, z, width, height, depth, colors, target = false) {
  const p = (a, b, c) => [x + a * width / 2, y + b * height / 2, z + c * depth / 2];
  return [
    { points: [p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1)], color: colors[0] },
    { points: [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], color: colors[1] },
    { points: [p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1)], color: colors[1] },
    { points: [p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], color: colors[1] },
    { points: [p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)], color: colors[2], target },
    { points: [p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], color: colors[1] },
  ];
}

function reference(r, kind, lane, z) {
  const x = lane * LANE_WIDTH;
  let faces;
  if (kind === "block") faces = [
    ...solidBox(x, 0.47, z, 1.37, 0.94, 0.8, PAPER),
    ...solidBox(x, 0.94, z, 1.42, 0.1, 0.83, BORDER, true),
  ];
  else if (kind === "pillar") faces = [
    ...solidBox(x, 1.35, z, 1.28, 2.7, 1, PAPER),
    ...solidBox(x, 2.69, z, 1.33, 0.12, 1.04, BORDER, true),
  ];
  else if (kind === "arch") faces = [
    ...solidBox(x - 0.67, 1.2, z, 0.17, 2.4, 0.3, BORDER),
    ...solidBox(x + 0.67, 1.2, z, 0.17, 2.4, 0.3, BORDER),
    ...solidBox(x, 1.98, z, 1.55, 1.04, 0.63, PAPER, true),
    ...solidBox(x, 1.44, z - 0.01, 1.55, 0.12, 0.66, BORDER),
  ];
  else faces = [
    ...solidBox(x, 0.13, z, 1.48, 0.24, 0.45, PAPER),
    ...solidBox(x, 0.29, z, 1.53, 0.1, 0.5, BORDER, true),
  ];
  const beyondJunction = r.forkDepth !== null ? z >= r.forkDepth
    : (r.curveStrength > 0 || r.curveTail) && r.curveAlong + z >= 0;
  const branches = beyondJunction ? [-1, 1].filter((branch) => branch !== r.forkBlockedDirection) : [0];
  return branches.flatMap((branch) => faces.map((face) => ({
    ...face,
    points: face.points.map(([px, py, pz]) => branch
      ? r.sceneryViewPoint(branch, px, py, pz) : r.cameraPoint([px, py, pz])),
  })));
}

// Möller–Trumbore intersection deliberately accepts either face winding.
// A hidden internal face must never beat the nearest exterior surface.
function intersections(face, direction) {
  return triangles(face).flatMap(([a, b, c]) => {
    const e1 = sub(b, a), e2 = sub(c, a), h = cross(direction, e2);
    const determinant = dot(e1, h);
    if (Math.abs(determinant) < 1e-10) return [];
    const inverse = 1 / determinant, s = sub(ORIGIN, a);
    const u = inverse * dot(s, h), q = cross(s, e1), v = inverse * dot(direction, q);
    const t = inverse * dot(e2, q);
    return u >= -1e-8 && u <= 1 + 1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8 && t > 0 ? [t] : [];
  });
}

function state(kind, lane, z, pose) {
  const s = Object.assign(createRun(4182, "summer"), {
    mode: "running", time: 120, distance: 980, speed: 66,
    obstacles: [{ id: 1, kind, lane, at: 980 + z }],
  });
  if (pose.startsWith("approach")) {
    const direction = pose.endsWith("left") ? -1 : 1;
    Object.assign(s, { fork: { at: 1000 }, lane: direction, x: direction * LANE_WIDTH });
  } else if (pose !== "straight") {
    const direction = pose.startsWith("left") ? -1 : 1;
    Object.assign(s, {
      lastForkAt: 970, turnDirection: direction, turnEntryX: direction * LANE_WIDTH,
      turnRemaining: TURN_DURATION * (pose.endsWith("late") ? 0.15 : 0.65),
    });
  }
  return s;
}

function checkTopRays(r, full, label, counts = {}) {
  const painted = r.faces.map((face) => ({ ...face, points: r.faceView(face) }));
  let samples = 0;
  for (const top of full.filter((face) => face.target)) {
    for (const u of [0.025, 0.075, 0.15, 0.3, 0.5, 0.7, 0.85, 0.925, 0.975]) {
      for (const v of [0.025, 0.15, 0.5, 0.85, 0.975]) {
        const [a, b, , d] = top.points;
        const point = a.map((value, i) => value + (b[i] - value) * u + (d[i] - value) * v);
        const [px, py] = r.projectView(point);
        if (point[2] < -8.5 || px < 0 || px > r.w || py < 0 || py > r.h) continue;
        const direction = sub(point, ORIGIN);
        const expected = full.flatMap((face) => intersections(face, direction).map((depth) => ({ face, depth })))
          .sort((a, b) => a.depth - b.depth)[0]?.face;
        if (!expected?.target) continue;
        const actual = painted.filter((face) => intersections(face, direction).length).at(-1);
        assert.equal(actual?.color, expected.color,
          `${label}/${expected.target} at ${u},${v}: an internal or farther face overpaints the top`);
        counts[expected.target] = (counts[expected.target] ?? 0) + 1;
        samples++;
      }
    }
  }
  return samples;
}

for (const kind of ["block", "pillar", "arch", "roots"]) {
  test(`${kind} obstacle tops retain their exterior color throughout approach and turns`, (t) => {
    const r = renderer();
    let samples = 0;
    // Fractional depths expose roundoff reversals between mathematically
    // equal centroid depths. Edge samples cover the arch's narrow supports.
    for (const lane of [-1, 0, 1]) for (const z of [-3, 0.1, 1, 1.51, 1.861, 2.722, 4, 8, 12, 24, 70]) {
      for (const pose of ["straight", "approach-left", "approach-right", "left-mid", "right-mid", "left-late", "right-late"]) {
        const s = state(kind, lane, z, pose);
        r.configureCamera(s);
        r.forkDepth = s.fork ? s.fork.at - s.distance : null;
        r.faces = [];
        drawObstacles(r, s, "en");
        // Exercise the actual camera-depth conversion and painter sort.
        paintFaces(r, s.scene);
        const full = reference(r, kind, lane, s.obstacles[0].at - s.distance);
        samples += checkTopRays(r, full, `${kind}/${lane}/${z}/${pose}`);
      }
    }
    assert.ok(samples > 1000, `only ${samples} visible top rays were checked`);
    t.diagnostic(`${samples} independently raycast top samples match the actual painter order`);
  });
}

function forkReference(r, blocked) {
  const z = r.forkDepth ?? -r.curveAlong;
  const faces = [
    ...solidBox(0, 0.42, z - 0.06, 1.35, 0.84, 0.32, ["#9c6850", "#684739", "#d8b778"], "barrier"),
    ...solidBox(0, 1, z, 0.18, 2, 0.18, ["#376f6a", "#24534f", "#81ad96"]),
    ...solidBox(0, 1.95, z, 2.55, 0.9, 0.3, ["#63554d", "#423d3e", "#b39c76"], "sign"),
  ];
  if (blocked) faces.push(
    ...solidBox(blocked * LANE_WIDTH, 1.35, z - 0.06, 1.55, 2.7, 1, ["#a94f45", "#773c36", "#d78065"]),
    ...solidBox(blocked * LANE_WIDTH, 2.7, z - 0.06, 1.6, 0.12, 1.04, ["#d8b778", "#684739", "#fff0bb"], "wall"),
  );
  return faces.map((face) => ({
    ...face, points: face.points.map(([x, y, depth]) => r.roadPoint(0, x, y, depth)),
  }));
}

test("fork walls, signs and center barriers retain their visible tops while choosing and entering a turn", (t) => {
  const r = renderer(), counts = {};
  let approachSamples = 0, turnSamples = 0;
  function check(s, blocked, label) {
    r.configureCamera(s);
    r.forkDepth = s.fork ? s.fork.at - s.distance : null;
    r.faces = [];
    r.road(s, s.distance);
    paintFaces(r, s.scene);
    return checkTopRays(r, forkReference(r, blocked), label, counts);
  }
  for (const blocked of [-1, 0, 1]) for (const direction of [-1, 1]) {
    if (direction === blocked) continue;
    for (const z of [0.1, 1, 1.51, 2.722, 4, 8, 12, 24, 70]) for (const offset of [0, 0.3, 0.8, 1]) {
      const s = Object.assign(createRun(4182, "summer"), {
        mode: "running", time: 120, speed: 27, distance: 1000 - z,
        fork: { at: 1000, blockedDirection: blocked }, lane: direction, x: direction * LANE_WIDTH * offset,
      });
      approachSamples += check(s, blocked, `fork/${blocked}/${direction}/${z}/${offset}`);
    }
    for (const progress of [0.001, 0.01, 0.04, 0.1, 0.15, 0.2, 0.25]) {
      const s = Object.assign(createRun(4182, "summer"), {
        mode: "running", time: 120, speed: 27, distance: 1000 + progress * 27 * TURN_DURATION,
        lastForkAt: 1000, lastForkBlockedDirection: blocked,
        turnDirection: direction, turnEntryX: direction * LANE_WIDTH,
        turnRemaining: TURN_DURATION * (1 - progress),
      });
      turnSamples += check(s, blocked, `fork-turn/${blocked}/${direction}/${progress}`);
    }
  }
  for (const target of ["wall", "sign", "barrier"]) assert.ok(counts[target] > 200, `too few ${target} samples`);
  assert.ok(approachSamples > 1000 && turnSamples > 100, "fork coverage must include active turns");
  t.diagnostic(`${approachSamples} approach and ${turnSamples} active-turn rays preserve fork top colors`);
});
