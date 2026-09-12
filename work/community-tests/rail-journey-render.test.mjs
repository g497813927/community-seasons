import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "./compile.mjs";
const { Renderer } = await import("./compiled/render.mjs");
const { createRun, update, LANE_WIDTH, RAIL_SPEED, RAIL_RETURN_DURATION } = await import("./compiled/engine.mjs");
const { createRailRide } = await import("./compiled/railway.mjs");
const { travelPalette } = await import("./compiled/travel-colors.mjs");
const noop = () => {};
globalThis.window = { devicePixelRatio: 1 };
function renderer() {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, { get: (o, k) => k === "createLinearGradient" || k === "createRadialGradient" ? () => gradient : o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
  r.resize(); return r;
}
function state(progress = 0, lane = 1, scene = "autumn") {
  const s = createRun(4182, scene);
  s.mode = "running"; s.time = 120; s.distance = 950; s.lane = lane; s.x = lane * LANE_WIDTH;
  s.rail = createRailRide(() => 0.5);
  Object.assign(s.rail, { speed: RAIL_SPEED, phase: "complete", duration: 2, remaining: 2 * (1 - progress), elapsed: 40, index: s.rail.questions.length - 1, correct: true, answerLane: lane, optionOrder: lane === -1 ? [0, 1, 2] : lane === 0 ? [1, 0, 2] : [1, 2, 0] });
  return s;
}
const round = (data) => JSON.parse(JSON.stringify(data, (_k, v) => typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v));

test("completion begins on exactly the seated cart pose shown in final feedback", () => {
  for (const lane of [-1, 0, 1]) {
    const s = state(0, lane), before = renderer(), after = renderer();
    const feedback = structuredClone(s); feedback.rail.phase = "feedback"; feedback.rail.remaining = 0;
    before.railCart(feedback, 0); after.railCart(s, 0);
    assert.deepEqual(round(after.faces), round(before.faces), "completion replaces the seated TV with a different pose");
  }
});

test("the cart stays seated in its selected lane throughout the exit approach", () => {
  for (const lane of [-1, 0, 1]) {
    const initial = renderer(); initial.railCart(state(0, lane), 0);
    for (let frame = 0; frame <= 120; frame++) {
      const s = state(frame / 120, lane), original = structuredClone(s), r = renderer();
      r.railCart(s, 0);
      assert.deepEqual(s, original, "exit animation changes gameplay state");
      assert.deepEqual(round(r.faces), round(initial.faces), "the passenger stands, recenters, or changes cart while approaching the gate");
    }
  }
});

test("the final-feedback world and exit gate remain continuous at every supported cart pace", () => {
  for (const speed of [12, 20, 30]) for (const lane of [-1, 0, 1]) {
    const s = state(0, lane), before = renderer(), after = renderer();
    s.rail.speed = speed;
    const feedback = structuredClone(s);
    Object.assign(feedback.rail, { phase: "feedback", duration: 1.6, remaining: 0 });
    before.render(feedback, 0); after.render(s, 0);
    assert.deepEqual(round(after.faces), round(before.faces), "the railroad, rejected tracks, cart, or exit gate is rebuilt on completion");
    Object.assign(s.rail, { phase: "feedback", duration: 1.6, remaining: 1.6 });
    const gateAt = s.distance + (1.6 + 2) * speed;
    for (let frame = 0; frame < 72; frame++) {
      const r = renderer(); r.railExitGateway(s);
      const gate = r.faces.find(f => f.journey?.mode === "run");
      assert.ok(Math.abs(s.distance + gate.points[0][2] - 0.04 - gateAt) < 1e-7, "the exit gate changes position or speed at a phase boundary");
      if (frame < 71) update(s, 0.05);
    }
  }
});

test("rail return blends seasonal tunnel colors and keeps the model swap fully covered", () => {
  const r = renderer(), s = state(1), calls = [];
  const original = r.transportTunnel.bind(r);
  r.transportTunnel = (progress, alpha, palette) => { calls.push({ progress, alpha, palette }); original(progress, alpha, palette); };
  r.render(s, 0);
  const before = calls.at(-1);
  assert.equal(before.alpha, 1);
  s.rail = null; s.x = 0; s.lane = 0; s.railReturnRemaining = RAIL_RETURN_DURATION;
  r.render(s, 0);
  assert.deepEqual(calls.at(-1), before, "tunnel opacity or ring motion snaps when the cart changes back to the runner");
  s.mode = "paused"; s.railReturnRemaining = 0.6;
  r.render(s, 12); const paused = calls.at(-1); r.render(s, 90);
  assert.deepEqual(calls.at(-1), paused, "paused tunnel animation keeps moving");
  s.railReturnRemaining = 0; s.sceneTransition = 1;
  r.render(s, 90);
  assert.deepEqual(calls.at(-1), { progress: 0.5, alpha: 1, palette: travelPalette(s.scene, s.scene, 0.5) }, "season transport must use the current seasonal palette");
});

test("transport gateways span every lane without replacing the railway with a platform", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const r = renderer(); r.railGateway(40, "en", scene, "rail");
    const entrance = r.faces.find(f => f.journey);
    assert.deepEqual(entrance.journey, { scene, mode: "rail" });
    assert.ok(Math.min(...entrance.points.map(p => p[0])) < -2.3 && Math.max(...entrance.points.map(p => p[0])) > 2.3);
    r.faces = []; r.railExitGateway(state(0.4, -1, scene));
    assert.ok(r.faces.some(f => f.journey?.scene === scene && f.journey.mode === "run"));
    assert.equal(r.faces.some(f => f.layer < 1), false, "the exit gate redraws the station floor");
  }
});

test("journey previews reuse eight canvases, contain actual destination geometry, and disclose no answers", () => {
  const r = renderer(); let canvases = 0; const seen = [];
  r.canvas.ownerDocument = { createElement() { canvases++; return { width: 0, height: 0, getContext: () => renderer().ctx }; } };
  const original = Renderer.prototype.render;
  Renderer.prototype.render = function(s, t, preview, locale) { const result = original.call(this, s, t, preview, locale); seen.push({ rail: s.rail?.phase, faces: this.faces }); return result; };
  try {
    for (const scene of ["spring", "summer", "autumn", "winter"]) for (const mode of ["rail", "run"]) {
      const first = r.journeyPreview(scene, mode);
      assert.equal(first, r.journeyPreview(scene, mode));
      if (mode === "run") assert.equal(first, r.portalPreview(scene));
    }
  } finally { Renderer.prototype.render = original; }
  assert.equal(canvases, 8); assert.equal(seen.length, 8, "preview renders recursively or repeats per request");
  for (const item of seen.filter(item => item.rail)) {
    assert.equal(item.rail, "boarding");
    assert.ok(item.faces.some(f => f.color === "#cedbd3") && item.faces.some(f => f.color === "#78c1c2"));
    assert.equal(item.faces.some(f => ["A", "B", "C"].includes(f.text?.value) || f.color === "#9c795e"), false);
  }
});

test("export the same exit gate approaching along the existing railway", () => {
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="1560" viewBox="0 0 1560 1560"><rect width="1560" height="1560" fill="#0a2b24"/>';
  const cases = [["Final answer / same gate", -0.8], ["Gate 24m ahead", 0], ["Gate 12m ahead", 0.5], ["Entering the tunnel", 0.9]];
  for (const [i, [title, progress]] of cases.entries()) {
    const r = renderer(), s = state(Math.max(0, progress));
    let tunnel = null;
    const drawTunnel = r.transportTunnel.bind(r);
    r.transportTunnel = (progress, alpha, palette) => { tunnel = { progress, alpha, palette }; drawTunnel(progress, alpha, palette); };
    if (progress < 0) Object.assign(s.rail, { phase: "feedback", duration: 1.6, remaining: 1.6 });
    r.render(s, 0);
    svg += `<svg x="${i % 2 * 780}" y="${Math.floor(i / 2) * 780}" width="780" height="780" viewBox="0 0 390 760"><defs><clipPath id="pose-${i}"><rect width="390" height="760"/></clipPath></defs><g clip-path="url(#pose-${i})"><rect width="390" height="760" fill="#ead1aa"/><rect y="220" width="390" height="540" fill="#ae9c70"/>`;
    for (const f of r.faces) {
      const points = f.points.map(p => r.project(p));
      svg += `<polygon points="${points.map(p => p.join(",")).join(" ")}" fill="${f.color}"/>`;
    }
    if (tunnel) {
      svg += `<rect width="390" height="760" fill="${tunnel.palette.background}" opacity="${tunnel.alpha}"/>`;
      for (let ring = 0; ring < 8; ring++) {
        const phase = (ring / 8 + tunnel.progress * 0.7) % 1, radius = 0.04 + phase * phase * 0.95;
        svg += `<ellipse cx="195" cy="349.6" rx="${390 * radius}" ry="${760 * radius}" fill="none" stroke="${tunnel.palette.accent}" stroke-width="2" opacity="${tunnel.alpha * 0.28}"/>`;
      }
    }
    svg += `<rect width="390" height="44" fill="#0a2b24"/><text x="195" y="28" text-anchor="middle" fill="#f0ddb5" font-family="sans-serif" font-size="16">${title}</text></g></svg>`;
  }
  svg += "</svg>"; fs.writeFileSync(new URL("./rail-exit-gate-poses.svg", import.meta.url), svg);
});
