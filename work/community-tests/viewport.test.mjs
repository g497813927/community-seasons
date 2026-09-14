import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const source = fs.readFileSync(
  new URL("../../src/lib/game/viewport.ts", import.meta.url),
  "utf8",
);
const { needsPortrait, portraitPromptHeight, sameGameViewport } = await import(
  "data:text/javascript;base64," + Buffer.from(compile(source)).toString("base64")
);
const view = (w, h, touch = true) => ({
  width: w,
  height: h,
  touch,
  screenWidth: w,
  screenHeight: h,
  orientation: w > h ? "landscape" : "portrait",
});
test("only cramped phone landscape requires portrait; usable desktop/tablet and portrait stay available", () => {
  for (const [w, h, want] of [
    [390, 844, false],
    [844, 390, true],
    [740, 360, true],
    [1024, 600, false],
    [1280, 720, false],
    [320, 568, false],
    [440, 752, false],
  ])
    assert.equal(needsPortrait(view(w, h)), want, `${w}x${h}`);
  assert.equal(needsPortrait(view(844, 390, false)), false, "fine pointer desktop stays playable");
});
test("Toy tall iframe uses physical landscape without top access, and prompt fits actual visible height", () => {
  const embedded = {
    ...view(440, 752),
    screenWidth: 956,
    screenHeight: 440,
    orientation: "landscape",
  };
  assert.equal(needsPortrait(embedded), true);
  assert.equal(portraitPromptHeight(embedded), 440);
  assert.equal(
    needsPortrait({ ...embedded, screenWidth: 1024, screenHeight: 768 }),
    false,
    "usable tablet landscape",
  );
  assert.equal(
    needsPortrait({
      ...view(844, 390),
      orientation: "portrait",
      screenWidth: 390,
      screenHeight: 844,
    }),
    false,
    "portrait keyboard must not ask user to rotate portrait",
  );
  assert.doesNotMatch(source, /window\.(?:top|parent)/);
});
const page = fs.readFileSync(
  new URL("../../src/app/page.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
test("actual viewport event handler pauses a running game and never auto-resumes when portrait returns", () => {
  const calls = [],
    game = { current: { mode: "running" } },
    current = { value: view(844, 390) };
  const c = {
    readGameViewport: () => current.value,
    needsPortrait,
    sameGameViewport,
    viewportRef: { current: view(390, 844) },
    rotateRequiredRef: { current: false },
    setViewport: (v) => calls.push(v),
    swipeRef: { current: {} },
    lastTapRef: { current: {} },
    game,
    bankRewards: () => {},
    recordBest: () => {},
    sync: () => {},
  };
  vm.createContext(c);
  vm.runInContext(compile(functions.get("updateViewport")) + ";updateViewport()", c);
  assert.equal(game.current.mode, "paused");
  assert.equal(c.rotateRequiredRef.current, true);
  assert.equal(c.swipeRef.current, null);
  current.value = view(390, 844);
  vm.runInContext("updateViewport()", c);
  assert.equal(c.rotateRequiredRef.current, false);
  assert.equal(game.current.mode, "paused");
  game.current.mode = "ready";
  current.value = view(844, 390);
  vm.runInContext("updateViewport()", c);
  assert.equal(game.current.mode, "ready");
});
test("actual gameplay actions and keyboard capture cannot bypass rotate overlay", async () => {
  for (const name of [
    "control",
    "pause",
    "start",
    "openRunSetup",
    "beginRun",
    "chooseRailAnswer",
    "triggerSkill",
    "triggerBooster",
    "continueAfterReview",
  ]) {
    const c = { rotateRequiredRef: { current: true }, shareOpenRef: { current: false }, licensesOpenRef: { current: false } };
    vm.createContext(c);
    await vm.runInContext(compile(functions.get(name)) + `;${name}()`, c);
  }
  for (const key of [" ", "Enter", "ArrowLeft", "Escape", "w", "p"]) {
    let prevented = 0,
      stopped = 0;
    const c = {
      rotateRequiredRef: { current: true },
      shareOpenRef: { current: false },
      licensesOpenRef: { current: false },
      e: { key, preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++ },
    };
    vm.createContext(c);
    vm.runInContext(compile(functions.get("onGameSpace")) + ";onGameSpace(e)", c);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
  }
});

test("duplicate viewport events skip state updates without delaying rotation blocking", () => {
  let changes = 0;
  const current = { value: view(390, 844) };
  const c = {
    readGameViewport: () => ({ ...current.value }),
    needsPortrait,
    sameGameViewport,
    viewportRef: { current: { ...current.value } },
    rotateRequiredRef: { current: false },
    setViewport: () => changes++,
    swipeRef: { current: {} },
    lastTapRef: { current: {} },
    game: { current: { mode: "running" } },
    bankRewards() {},
    recordBest() {},
    sync() {},
  };
  vm.createContext(c);
  vm.runInContext(compile(functions.get("updateViewport")), c);
  for (let i = 0; i < 20; i++) vm.runInContext("updateViewport()", c);
  assert.equal(changes, 0);
  current.value = {
    ...current.value,
    screenWidth: 844,
    screenHeight: 390,
    orientation: "landscape",
  };
  vm.runInContext("updateViewport()", c);
  assert.equal(changes, 1);
  assert.equal(
    c.rotateRequiredRef.current,
    true,
    "physical rotation blocks input synchronously even with a tall iframe",
  );
  assert.equal(c.game.current.mode, "paused");
  for (let i = 0; i < 20; i++) vm.runInContext("updateViewport()", c);
  assert.equal(changes, 1, "window and visualViewport duplicates do not rerender Home");
  current.value = view(390, 844);
  vm.runInContext("updateViewport()", c);
  assert.equal(changes, 2);
  assert.equal(c.rotateRequiredRef.current, false);
  assert.equal(c.game.current.mode, "paused");
});

test("actual animation predicate does not repaint home autoplay behind the rotate dialog", () => {
  let expression;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "animated")
      expression = node.initializer.getText(ast);
    ts.forEachChild(node, find);
  }
  find(ast);
  assert.ok(expression);
  const c = {
    s: { mode: "ready" },
    rotateRequiredRef: { current: true },
    storeOpenRef: { current: false },
    setupOpenRef: { current: false },
    guideOpenRef: { current: false },
    licensesOpenRef: { current: false },
    cloudStateRef: { current: { conflict: null } },
  };
  vm.createContext(c);
  let animatedFrames = 0;
  for (let i = 0; i < 240; i++) animatedFrames += Number(vm.runInContext(expression, c));
  assert.equal(animatedFrames, 0);
  c.rotateRequiredRef.current = false;
  assert.equal(
    vm.runInContext(expression, c),
    true,
    "home preview resumes when portrait is usable",
  );
  c.s.mode = "paused";
  assert.equal(vm.runInContext(expression, c), false, "a previously active run remains still");
  c.s.mode = "running";
  assert.equal(vm.runInContext(expression, c), true, "explicitly resumed gameplay still animates");
});
