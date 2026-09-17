import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, update, LANE_WIDTH, RAIL_SPEED } = await import("../helpers/compiled/engine.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
globalThis.window = { devicePixelRatio: 1 };

// Record the real canvas fill order, then sample pixel centers against those
// painted polygons. Geometry-presence tests alone miss a deck painting over
// an otherwise correctly positioned rail.
function recorder() {
  const noop = () => {}, gradient = { addColorStop: noop }, paints = [];
  let path = [];
  const target = {
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    fill() { if (typeof target.fillStyle === "string" && /^#[a-f\d]{6}$/i.test(target.fillStyle)) paints.push({ color: target.fillStyle, points: path.slice() }); },
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
  };
  const ctx = new Proxy(target, { get: (o, k) => o[k] ?? noop });
  const renderer = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
  renderer.resize();
  return { renderer, paints };
}
function contains([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function pixel(paints, point) {
  const center = point.map(v => Math.floor(v) + 0.5);
  for (let i = paints.length - 1; i >= 0; i--) if (contains(center, paints[i].points)) return paints[i].color;
  return null;
}
function state(elapsed = 20, duration = 10) {
  const s = createRun(4182, "summer");
  s.mode = "running"; s.distance = 2978 + elapsed * RAIL_SPEED; s.time = 150; s.lane = -1; s.x = -LANE_WIDTH;
  s.rail = createRailRide(() => 0.5);
  Object.assign(s.rail, { speed: RAIL_SPEED, phase: "question", elapsed, duration, remaining: duration - 1, questions: ["respectful-disagreement"], optionOrder: [0, 1, 2] });
  return s;
}

test("rails remain visibly painted above sleepers and decks while approaching answers", () => {
  const { renderer: r, paints } = recorder();
  for (let sample = 0; sample < 200; sample++) {
    const s = state(20 + sample * 0.005);
    paints.length = 0; r.render(s, 0);
    const z = 3 - r.visualTravel(s) % 3;
    for (const lane of [0, 1]) for (const side of [-1, 1]) {
      const point = r.project([lane * LANE_WIDTH + side * 0.46, 0.07, z]);
      assert.equal(pixel(paints, point), "#cedbd3", `sample ${sample}: lane ${lane}/${side} rail at z=${z} was overpainted`);
    }
  }
});

test("question gates meet the cart at their deadline and rejected track boundaries stay in place at variable paces and reading windows", () => {
  for (const speed of [12, 20, 30]) for (const duration of [12, 24, 44]) {
    const { renderer: r } = recorder(), s = state(20, duration);
    Object.assign(s.rail, { speed, remaining: 0.4 });
    const gateAt = s.distance + s.rail.remaining * speed;
    function gatePosition() {
      r.faces = []; r.railTracks(s);
      const gate = r.faces.find(f => f.text?.value === "A");
      return s.distance + gate.z + 0.14;
    }
    assert.ok(Math.abs(gatePosition() - gateAt) < 1e-8);
    for (let tick = 0; tick < 8; tick++) {
      update(s, 0.05);
      assert.ok(Math.abs(gatePosition() - gateAt) < 1e-8, `${speed}m/s: gate slides along the track`);
    }
    assert.equal(s.rail.phase, "feedback");
    assert.equal(s.rail.correct, true);
    assert.ok(Math.abs(s.distance - gateAt) < 1e-8, "the gate reaches the cart exactly when its answer is judged");
    for (let tick = 0; tick < 4; tick++) {
      r.faces = []; r.railTracks(s);
      const rejectedRails = r.faces.filter(f => f.color === "#cedbd3" && f.points.every(p => Math.abs(p[0]) < 0.8));
      const boundary = Math.max(...rejectedRails.flatMap(f => f.points.map(p => p[2]))) + s.distance;
      assert.ok(Math.abs(boundary - gateAt) < 1e-8, `${speed}m/s: a rejected track end jumps after judging`);
      update(s, 0.05);
    }
  }
});

test("answer gates travel with the same track position through question and feedback", () => {
  // Include legacy rides and the 44-second budget for maximum-length bank copy.
  for (const duration of [9, 9.7, 10, 11, 12, 18, 24, 44]) {
    const { renderer: r } = recorder(), s = state(20, duration);
    const positions = [];
    for (const dt of [0, 0.25, 0.5]) {
      s.rail.elapsed = 20 + dt; s.rail.remaining = duration - 1 - dt;
      s.distance = 2978 + s.rail.elapsed * RAIL_SPEED;
      r.faces = []; r.railTracks(s);
      const gate = r.faces.find(f => f.text?.value === "A");
      positions.push(gate.z + r.visualTravel(s));
    }
    assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-8, `a ${duration}s gate slides forward along the track`);
    s.rail.remaining = 0; r.faces = []; r.railTracks(s);
    const before = r.faces.find(f => f.text?.value === "A").z;
    Object.assign(s.rail, { phase: "feedback", duration: 1.6, remaining: 1.6, answerLane: -1, correct: true });
    r.faces = []; r.railTracks(s);
    assert.ok(Math.abs(r.faces.find(f => f.text?.value === "A").z - before) < 1e-8);
  }
});
