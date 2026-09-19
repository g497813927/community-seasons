import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer, getSkinPreview } = await import("../helpers/compiled/render.mjs");
const { createRun, advancePreview, SLIDE_DURATION, JUMP_DURATION, EDGE_STUMBLE_DURATION } = await import("../helpers/compiled/engine.mjs");
const { createOutfit, ACCESSORIES } = await import("../helpers/compiled/cosmetics.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
const { SKINS, skinDefinition } = await import("../helpers/compiled/skins.mjs");
const { drawHat } = await import("../helpers/compiled/render/characters/cosmetics.mjs");
const { paintFaces } = await import("../helpers/compiled/render/paint.mjs");

globalThis.window = { devicePixelRatio: 1 };
const noop = () => {};
function renderer() {
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (object, key) => key === "createLinearGradient" || key === "createRadialGradient" ? () => gradient : object[key] ?? noop,
    set: (object, key, value) => (object[key] = value, true),
  });
  const result = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
  result.resize();
  return result;
}

const outfits = [];
for (const hat of [null, "cap", "crown", "sprout"])
  for (const shoes of [null, "sneakers", "boots", "skates"])
    for (const effect of [null, "sparkles", "petals", "orbit"]) outfits.push({ hat, shoes, effect });

test("the cap shell has no open boundary, including the underside exposed by sliding", () => {
  const faces = [];
  drawHat({ faces, box: noop, face(points, color) { faces.push({ points, color }); } }, "cap", (x, y, z) => [x, y, z], 0);
  const shell = faces.filter((face) => ["#f07b7b", "#b84560", "#ffc0a5"].includes(face.color));
  const incidence = new Map();
  for (const { points } of shell) for (let i = 0; i < points.length; i++) {
    const edge = [points[i].join(","), points[(i + 1) % points.length].join(",")].sort().join("|");
    incidence.set(edge, (incidence.get(edge) ?? 0) + 1);
  }
  for (const [edge, count] of incidence) assert.equal(count, 2, `open cap edge: ${edge}`);
  const underside = shell.find(({ points }) => points.every((point) => point[1] === 0.45));
  assert.ok(underside, "the cap has no underside");
  assert.equal(underside.cull, true, "hidden underside must not overpaint the dome");

  for (const slide of [0, SLIDE_DURATION / 2]) {
    const view = renderer();
    const state = Object.assign(createRun(), { mode: "running", slide, outfit: { hat: "cap", shoes: null, effect: null } });
    view.runner(state, 0);
    const base = view.faces.find((face) => face.cull);
    assert.ok(base);
    assert.equal(view.frontFacing(view.faceView(base)), slide > 0, "underside visibility must follow the TV pose");
    // Isolate this face: the real painter must omit the upright underside,
    // yet draw it when sliding reveals the open base.
    view.faces = [base];
    let fills = 0;
    view.ctx.fill = () => fills++;
    paintFaces(view, "spring");
    assert.equal(fills, slide > 0 ? 1 : 0);
  }

  const preview = getSkinPreview("classic", { hat: "cap", shoes: null, effect: null });
  // The store camera shows six upper shell panels plus the brim's top face.
  assert.equal(preview.filter((face) => face.fill === "#ffc0a5").length, 7);
});

test("a cap behind the camera never marks another object's face for culling", () => {
  const view = renderer();
  view.face([[0, 0, 0], [1, 0, 0], [0, 1, 0]], "#123456");
  const before = structuredClone(view.faces);
  drawHat(view, "cap", (x, y, z) => [x, y, z - 30], 0);
  assert.deepEqual(view.faces, before);
  view.faces = [];
  assert.doesNotThrow(() => drawHat(view, "cap", (x, y, z) => [x, y, z - 30], 0));
  assert.deepEqual(view.faces, []);
});

test("all 64 outfits stay finite and above the ground in every runner pose within a bounded drawing budget", () => {
  const poses = [
    {}, { jump: JUMP_DURATION / 2 }, { slide: SLIDE_DURATION / 2 },
    { lane: 1, x: 0.45 },
    { lane: -1, x: -1.65, edgeStumble: EDGE_STUMBLE_DURATION * 0.6, edgeStumbleDirection: -1 },
  ];
  for (const outfit of outfits) for (const pose of poses) {
    const state = Object.assign(createRun(), { mode: "running", time: 0.31, outfit }, pose);
    const original = structuredClone(state), view = renderer();
    view.runner(state, state.time);
    assert.deepEqual(state, original, "cosmetics change the run or its equipped selections");
    assert.ok(view.faces.length < 100, `${JSON.stringify(outfit)} exceeds the per-TV drawing budget`);
    for (const face of view.faces) for (const [x, y, z] of face.points) {
      assert.ok([x, y, z].every(Number.isFinite));
      assert.ok(y >= 0.029999, `foot or accessory clips the ground at ${y}`);
      assert.ok(Math.abs(x - state.x) < 1.5 && Math.abs(z) < 1.6, "outfit extends into another lane or obstacle");
    }
  }
});

test("each hat, shoe and effect has a distinct silhouette while the TV case stays fixed", () => {
  const standard = getSkinPreview("classic");
  const panel = (faces) => faces.filter((face) => face.fill === skinDefinition("classic").palette.panel);
  for (const slot of ["hat", "shoes", "effect"]) {
    const signatures = new Set();
    for (const item of ACCESSORIES.filter((item) => item.slot === slot)) {
      const preview = getSkinPreview("classic", { ...createOutfit(), [slot]: item.id });
      assert.deepEqual(panel(preview), panel(standard), "equipping an item repositions/resizes the TV");
      const shape = preview.map((face) => face.points).join(";");
      assert.notEqual(shape, standard.map((face) => face.points).join(";"));
      signatures.add(shape);
    }
    assert.equal(signatures.size, 3, `${slot} items only change color`);
  }
});

test("cosmetic particles follow simulation time and respect reduced motion", () => {
  for (const effect of ["sparkles", "petals", "orbit"]) {
    const state = Object.assign(createRun(), { mode: "paused", time: 0.7, outfit: { hat: "crown", shoes: "skates", effect } });
    const draw = (wallTime, reducedMotion = false) => {
      const view = renderer(); view.reducedMotion = reducedMotion;
      view.runner(state, wallTime, { stride: 0 });
      return view.faces;
    };
    const paused = draw(1), reduced = draw(1, true);
    assert.deepEqual(draw(99), paused, "decorative particles animate while paused");
    state.time += 0.8;
    assert.notDeepEqual(draw(99), paused, "selected effect never animates with the simulation");
    assert.deepEqual(draw(99, true), reduced, "reduced motion still animates decorative particles");
  }
});

test("outfits stay attached while passengers board, answer and fall with the cart", () => {
  for (const outfit of outfits) {
    const state = createRun(); state.outfit = outfit; state.time = 0.7;
    state.rail = createRailRide(() => 0.5);
    Object.assign(state.rail, { phase: "question", duration: 2, remaining: 1 });
    const seated = renderer(); seated.railCart(state, 0);
    for (const phase of ["boarding", "feedback", "complete", "falling"]) {
      state.rail.phase = phase;
      const view = renderer(); view.railCart(state, 0);
      const fall = phase === "falling" ? 1.5 : 0;
      const arrival = phase === "boarding" ? 0.55 : 0;
      assert.equal(view.faces.length, seated.faces.length);
      for (let i = 0; i < view.faces.length; i++) for (let j = 0; j < view.faces[i].points.length; j++) {
        const point = view.faces[i].points[j], before = seated.faces[i].points[j];
        assert.ok(Math.abs(point[0] - before[0]) < 1e-9);
        assert.ok(Math.abs(point[1] - before[1] + fall) < 1e-9, "an accessory separates during the fall");
        assert.ok(Math.abs(point[2] - before[2] + arrival) < 1e-9, "an accessory separates during boarding");
      }
    }
  }
});

test("home restarts, season changes and railway preview caches retain every outfit selection", () => {
  const view = renderer(), state = createRun();
  view.canvas.ownerDocument = { createElement: () => ({ getContext: () => view.ctx }) };
  for (const outfit of outfits.slice(1)) {
    state.outfit = outfit;
    view.render(state, 0);
    assert.deepEqual(view.previewRun.outfit, outfit);
    view.previewRun.mode = "over"; advancePreview(view.previewRun, 0);
    assert.deepEqual(view.previewRun.outfit, outfit);
    state.scene = state.scene === "spring" ? "winter" : "spring";
    view.render(state, 0.1);
    assert.deepEqual(view.previewRun.outfit, outfit);
    const first = view.journeyPreview("spring", "rail");
    assert.equal(first, view.journeyPreview("spring", "rail"));
    const changed = { ...outfit, hat: outfit.hat === "cap" ? "crown" : "cap" };
    const second = view.journeyPreview("spring", "rail", "classic", changed);
    assert.notEqual(second, first, "cached passenger keeps an old outfit");
    assert.deepEqual(view.renderOutfit, changed);
    assert.equal(second, view.journeyPreview("spring", "rail", "classic", { ...changed }));
  }
});

test("changing reduced motion rebuilds rail passengers and freezes their effects", () => {
  for (const effect of ["sparkles", "petals", "orbit"]) {
    const view = renderer(), seen = [];
    view.canvas.ownerDocument = { createElement: () => ({ getContext: () => renderer().ctx }) };
    const original = Renderer.prototype.railCart;
    Renderer.prototype.railCart = function(state, time) {
      const firstFace = this.faces.length;
      const result = original.call(this, state, time);
      seen.push({ reducedMotion: this.reducedMotion, state: structuredClone(state), faces: this.faces.slice(firstFace) });
      return result;
    };
    try {
      const outfit = { hat: "crown", shoes: "skates", effect };
      const landscape = view.portalPreview("spring");
      const previews = [];
      for (const reducedMotion of [false, true, false]) {
        view.reducedMotion = reducedMotion;
        const preview = view.journeyPreview("spring", "rail", "classic", outfit);
        assert.ok(preview);
        previews.push(preview);
        view.reducedMotion = reducedMotion;
        assert.equal(view.journeyPreview("spring", "rail"), preview, "unchanged preferences discard reusable previews");
        assert.equal(view.portalPreview("spring"), landscape, "passenger settings invalidate the empty landscape");
      }
      assert.equal(new Set(previews).size, 3, "a preference change keeps a previously baked passenger");
    } finally { Renderer.prototype.railCart = original; }
    assert.deepEqual(seen.map((entry) => entry.reducedMotion), [false, true, false]);
    assert.notDeepEqual(seen[0].faces, seen[1].faces, `${effect} ignores the new reduced-motion preference`);
    assert.deepEqual(seen[0].faces, seen[2].faces, `${effect} does not restore its normal appearance`);
    const reduced = renderer();
    reduced.reducedMotion = true;
    seen[1].state.time += 10;
    reduced.railCart(seen[1].state, 99);
    assert.deepEqual(reduced.faces, seen[1].faces, `${effect} moves with reduced motion enabled`);
  }
});

test("every store outfit fits the shared frame, preserves source data and uses a bounded preview cache", () => {
  const first = getSkinPreview("classic", outfits[0]);
  for (const skin of SKINS) for (const outfit of outfits) {
    const original = structuredClone(outfit), preview = getSkinPreview(skin.id, outfit);
    assert.equal(preview, getSkinPreview(skin.id, { ...outfit }));
    assert.deepEqual(outfit, original);
    for (const face of preview) for (const coordinate of face.points.split(/[ ,]/).map(Number)) {
      assert.ok(Number.isFinite(coordinate) && coordinate >= 12 && coordinate <= 148, `preview is clipped at ${coordinate}`);
    }
  }
  assert.notEqual(first, getSkinPreview("classic", outfits[0]), "preview cache retains every combination indefinitely");
  assert.deepEqual(first, getSkinPreview("classic", outfits[0]), "regenerating an evicted preview changes its appearance");
});
