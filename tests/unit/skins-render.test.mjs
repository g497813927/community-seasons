import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { Renderer, getSkinPreview } = await import("../helpers/compiled/render.mjs");
const { createRun, advancePreview, SLIDE_DURATION, JUMP_DURATION, EDGE_STUMBLE_DURATION } = await import("../helpers/compiled/engine.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
const { SKINS, skinDefinition } = await import("../helpers/compiled/skins.mjs");

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

function colors(skin) {
  const { shell, trim, panel, indicator } = skinDefinition(skin).palette;
  return [...shell, ...trim, panel, indicator];
}

function recolor(faces, skin) {
  const palette = new Map(colors("classic").map((color, index) => [color, colors(skin)[index]]));
  return faces.map((face) => ({ ...face, color: palette.get(face.color) ?? face.color }));
}

test("every TV skin preserves the complete mascot geometry and effects in every pose", () => {
  const poses = [
    {},
    { jump: JUMP_DURATION / 2 },
    { slide: SLIDE_DURATION / 2 },
    { lane: 1, x: 0.45 },
    { lane: -1, x: -1.65, edgeStumble: EDGE_STUMBLE_DURATION * 0.6, edgeStumbleDirection: -1 },
    { boosts: { ...createRun().boosts, rush: 2 } },
  ];
  for (const pose of poses) {
    const state = Object.assign(createRun(), { mode: "running", time: 0.31 }, pose);
    const original = renderer();
    original.captureScenery = true;
    original.runner(state, state.time);
    for (const skin of SKINS) {
      const view = renderer();
      view.captureScenery = true;
      view.runner({ ...state, skin: skin.id }, state.time);
      assert.deepEqual(view.faces, recolor(original.faces, skin.id), `${skin.id} changes pose geometry, opacity or layering`);
      for (const color of colors(skin.id)) assert.ok(view.faces.some((face) => face.color === color), `${skin.id} omits ${color}`);
    }
  }
});

test("boarding, quiz and falling passengers keep their skin without recoloring the cart", () => {
  for (const phase of ["boarding", "question", "feedback", "complete", "falling"]) {
    const state = createRun();
    state.rail = createRailRide(() => 0.5);
    Object.assign(state.rail, { phase, duration: 2, remaining: 1 });
    const original = renderer();
    original.captureScenery = true;
    original.railCart(state, 0);
    for (const skin of SKINS) {
      const view = renderer();
      view.captureScenery = true;
      view.railCart({ ...state, skin: skin.id }, 0);
      assert.deepEqual(view.faces, recolor(original.faces, skin.id), `${phase}/${skin.id} changes the cart or seated pose`);
      assert.ok(view.faces.some((face) => face.color === skin.palette.shell[0]));
      assert.ok(view.faces.some((face) => face.color === "#78c1c2"), "the cart keeps its original casing");
    }
  }
});

test("home autoplay immediately follows the selected skin across reset and season changes", () => {
  const view = renderer(), state = createRun();
  assert.equal(state.skin, "classic");
  for (const skin of SKINS) {
    state.skin = skin.id;
    view.render(state, 0);
    assert.equal(view.previewRun.skin, skin.id);
    view.previewRun.mode = "over";
    advancePreview(view.previewRun, 0);
    assert.equal(view.previewRun.skin, skin.id, "demo restart resets the selected skin");
    state.scene = state.scene === "spring" ? "winter" : "spring";
    view.render(state, 0.1);
    assert.equal(view.previewRun.skin, skin.id, "season changes reset the selected skin");
  }
});

test("cached railway previews change the passenger skin when the player equips another", () => {
  const view = renderer(), state = createRun();
  view.canvas.ownerDocument = { createElement: () => ({ getContext: () => view.ctx }) };
  const seen = [], draw = Renderer.prototype.runner;
  Renderer.prototype.runner = function(state, ...args) {
    seen.push(state.skin);
    return draw.call(this, state, ...args);
  };
  try {
    let previous;
    for (const skin of SKINS) {
      state.skin = skin.id;
      view.render(state, 0);
      seen.length = 0;
      const preview = view.journeyPreview("spring", "rail");
      assert.notEqual(preview, previous, "the old passenger remains cached after equipping a skin");
      assert.equal(preview, view.journeyPreview("spring", "rail"), "unchanged previews must remain cached");
      assert.deepEqual(seen, [skin.id]);
      previous = preview;
    }
    seen.length = 0;
    const updated = view.journeyPreview("spring", "rail", "blossom");
    assert.notEqual(updated, previous);
    assert.deepEqual(seen, ["blossom"], "a React preview can request a skin before the next game frame renders");
  } finally { Renderer.prototype.runner = draw; }
});

test("store SVG previews show the same TV silhouette for every skin and fit their viewBox", () => {
  const classic = getSkinPreview("classic");
  assert.ok(classic.length > 10);
  for (const skin of SKINS) {
    const preview = getSkinPreview(skin.id);
    assert.equal(preview, getSkinPreview(skin.id), "static previews should be reused");
    assert.deepEqual(preview.map((face) => face.points), classic.map((face) => face.points));
    const palette = new Map(colors("classic").map((color, index) => [color, colors(skin.id)[index]]));
    assert.deepEqual(preview.map((face) => face.fill), classic.map((face) => palette.get(face.fill)));
    for (const face of preview) for (const coordinate of face.points.split(/[ ,]/).map(Number)) {
      assert.ok(Number.isFinite(coordinate) && coordinate >= 12 && coordinate <= 148, `preview is clipped at ${coordinate}`);
    }
    assert.ok(preview.some((face) => face.fill === skin.palette.panel), "the rear panel is visible in the store preview");
  }
});
