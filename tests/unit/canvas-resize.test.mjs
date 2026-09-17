import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");

function setup(width = 440, height = 752, ratio = 2) {
  globalThis.window = { devicePixelRatio: ratio };
  const rect = { width, height };
  const dimensions = { width: 300, height: 150 };
  const resets = [];
  const transforms = [];
  const canvas = {
    getContext: () => ({ setTransform: (...args) => transforms.push(args) }),
    getBoundingClientRect: () => rect,
  };
  for (const dimension of ["width", "height"]) Object.defineProperty(canvas, dimension, {
    get: () => dimensions[dimension],
    // Canvas dimension assignments clear its bitmap, even at the same value.
    set: (value) => { resets.push(dimension); dimensions[dimension] = value; },
  });
  const renderer = new Renderer(canvas);
  return { renderer, rect, resets, transforms, canvas };
}

test("repeated viewport notifications preserve an unchanged canvas bitmap", () => {
  const { renderer, resets, transforms } = setup();
  assert.equal(renderer.resize(), true);
  resets.length = 0;
  transforms.length = 0;
  for (let i = 0; i < 10; i++) assert.equal(renderer.resize(), false);
  assert.deepEqual(resets, [], "unchanged canvas dimensions erase the last rendered frame");
  assert.deepEqual(transforms, []);
});

test("a real layout resize reports an immediate repaint and only resets changed dimensions", () => {
  const { renderer, rect, resets, transforms, canvas } = setup();
  renderer.resize();
  resets.length = 0;
  rect.height -= 24;
  assert.equal(renderer.resize(), true, "the observer must repaint before presenting the resized bitmap");
  assert.deepEqual(resets, ["height"]);
  assert.equal(canvas.height, 1456);
  assert.equal(renderer.h, 728);
  assert.deepEqual(transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  assert.equal(renderer.resize(), false);
});

test("fractional layout changes repaint projection without erasing identical backing pixels", () => {
  const { renderer, rect, resets } = setup();
  renderer.resize();
  resets.length = 0;
  rect.height += 0.1;
  assert.equal(renderer.resize(), true);
  assert.equal(renderer.h, 752.1);
  assert.deepEqual(resets, []);
  assert.equal(renderer.resize(), false);
});

test("device scale changes repaint once while retaining the phone resolution cap", () => {
  const { renderer, resets, transforms, canvas } = setup(440, 752, 1);
  renderer.resize();
  resets.length = 0;
  window.devicePixelRatio = 3;
  assert.equal(renderer.resize(), true);
  assert.deepEqual(resets, ["width", "height"]);
  assert.equal(canvas.width, 880);
  assert.equal(canvas.height, 1504);
  assert.deepEqual(transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  resets.length = 0;
  window.devicePixelRatio = 4;
  assert.equal(renderer.resize(), false);
  assert.deepEqual(resets, []);
});

const page = fs.readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let resizeCallback;
function visit(node) {
  if (ts.isNewExpression(node) && node.expression.getText(ast) === "ResizeObserver" &&
    node.arguments?.[0]?.getText(ast).includes("renderer.resize()"))
    resizeCallback = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(resizeCallback, "game page must observe the canvas layout");
const callbackSource = ts.transpileModule(`const resizeCanvas = ${resizeCallback};`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("actual page resize observer repaints before returning, including paused and home frames", () => {
  for (const mode of ["running", "paused", "ready"]) for (const locale of ["en", "zh-CN"]) {
    const { renderer, rect, resets } = setup();
    renderer.resize();
    resets.length = 0;
    const state = { mode, flash: 0 };
    const paints = [];
    renderer.render = (...args) => paints.push(args);
    const context = {
      renderer,
      game: { current: state },
      performance: { now: () => 12500 },
      localeRef: { current: locale },
      needsRedraw: true,
      drawnRun: null,
      drawnMode: null,
      drawnLocale: null,
      drawnFlash: -1,
    };
    vm.createContext(context);
    vm.runInContext(callbackSource + "resizeCanvas()", context);
    assert.deepEqual(resets, []);
    assert.equal(paints.length, 0, "unchanged observer notifications must skip canvas work");
    rect.height += 24;
    vm.runInContext("resizeCanvas()", context);
    assert.deepEqual(resets, ["height"]);
    assert.equal(paints.length, 1, `${mode}/${locale}: cleared canvas waits for a later animation frame`);
    assert.deepEqual(paints[0], [state, 12.5, false, locale], "repaint must retain live state, locale, and normal preview dispatch");
    assert.equal(context.drawnRun, state);
    assert.equal(context.drawnMode, mode);
    assert.equal(context.drawnLocale, locale);
    assert.equal(context.drawnFlash, state.flash);
    assert.equal(context.needsRedraw, false);
    vm.runInContext("resizeCanvas()", context);
    assert.equal(paints.length, 1);
  }
});
