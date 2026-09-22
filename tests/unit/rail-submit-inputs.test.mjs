import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "../helpers/compile.mjs";

const { createRun, act, submitRailAnswer, togglePause, currentRailQuestion } =
  await import("../helpers/compiled/engine.mjs");
const { createRailRide, beginRailQuestion } = await import("../helpers/compiled/railway.mjs");
const { BOOSTERS } = await import("../helpers/compiled/boosts.mjs");
const source = fs.readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
let keyMap;
let finishLoadingInitializer;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "keyMap") keyMap = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "finishLoading") finishLoadingInitializer = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const compile = text => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

class ElementTarget {
  constructor(kind) { this.kind = kind; }
  closest(selector) {
    const kind = this.kind;
    if (kind === "warmup" && selector === ".render-warmup-screen") return this;
    if (kind === "input" && selector.includes("input")) return this;
    if (kind === "dialog" && selector.includes('data-slot="dialog-content"')) return this;
    if (kind === "result" && selector.includes(".result-panel")) return this;
    if (kind === "go" && (selector === "button,a" || selector.includes(".rail-submit") || selector.includes(".rail-answers button"))) return this;
    return null;
  }
}
function target(kind) {
  return new ElementTarget(kind);
}

function harness() {
  const state = Object.assign(createRun(4182), { mode: "running", time: 100, distance: 1200 });
  state.rail = createRailRide(() => 0.5);
  beginRailQuestion(state.rail, () => 0.5);
  state.lane = state.rail.optionOrder.indexOf(currentRailQuestion(state).correctIndex) - 1;
  const calls = [];
  const c = {
    Element: ElementTarget,
    graphicsReadyRef: { current: true },
    game: { current: state }, BOOSTERS, act, submitRailAnswer, togglePause,
    swipeRef: { current: null }, lastTapRef: { current: null }, lastRailUpRef: { current: null },
    canvasRef: { current: { focus(options) { calls.push(["focus", options.preventScroll]); } } },
    cloudRef: { current: null }, mutedRef: { current: true },
    sound: value => calls.push(["sound", value]), sync: () => calls.push(["sync"]),
    notifyBoost: value => calls.push(["notice", value]),
    triggerSkill: value => calls.push(["skill", value]),
    triggerBooster: value => calls.push(["booster", value]),
    toggleSound: () => calls.push(["mute"]),
    start: () => calls.push(["start"]),
    changeStore: open => { c.storeOpenRef.current = open; calls.push(["store", open]); },
    visitStoreFromSetup: () => calls.push(["setup-store"]),
    ensureAudio() {}, bankRewards() {}, recordBest() {},
  };
  for (const name of [
    "leaderboardOpenRef", "rotateRequiredRef", "shareOpenRef", "licensesOpenRef", "helpOpenRef", "guideOpenRef",
    "storeOpenRef", "setupOpenRef", "startAfterCloudRef",
  ]) c[name] = { current: false };
  vm.createContext(c);
  vm.runInContext(compile(`const keyMap = ${keyMap};\n${[
    "onKey", "onGameSpace", "control", "submitRailChoice", "pause", "blur",
    "beginSwipe", "moveSwipe", "endSwipe", "cancelSwipe",
  ].map(name => functions.get(name)).join("\n")}`), c);
  function key(value, at, overrides = {}) {
    let prevented = 0, stopped = 0;
    const event = {
      key: value, code: value === "w" || value === "W" ? "KeyW" : value,
      timeStamp: at, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      target: target("arena"), preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; },
      ...overrides,
    };
    c.onKey(event);
    return { event, get prevented() { return prevented; }, get stopped() { return stopped; } };
  }
  return { c, calls, key, get state() { return c.game.current; } };
}

test("the actual keyboard handler submits on two distinct Up or physical W presses, including IME input", () => {
  for (const [key, code] of [["ArrowUp", "ArrowUp"], ["w", "KeyW"], ["W", "KeyW"], ["Process", "KeyW"]]) {
    const h = harness();
    assert.equal(h.key(key, 100, { code, shiftKey: key === "W" }).prevented, 1);
    assert.equal(h.state.rail.phase, "question");
    h.key(key, 250, { code, shiftKey: key === "W" });
    assert.equal(h.state.rail.phase, "feedback");
    assert.equal(h.state.rail.correctCount, 1);
    assert.equal(h.c.lastRailUpRef.current, null);
    assert.ok(h.calls.some(call => call[0] === "focus" && call[1] === true));
    assert.deepEqual(h.calls.filter(call => call[0] === "sound"), [["sound", "boost"]]);
    h.key(key, 300, { code });
    assert.equal(h.state.rail.correctCount, 1);
  }
});

test("timeouts, key repeats, mixed Up/W, and Space do not accidentally submit", () => {
  const expired = harness();
  expired.key("ArrowUp", 100);
  expired.key("ArrowUp", 401);
  assert.equal(expired.state.rail.phase, "question");
  expired.key("ArrowUp", 550);
  assert.equal(expired.state.rail.phase, "feedback", "the expired second press can start a fresh pair");

  const held = harness();
  held.key("ArrowUp", 100);
  for (const at of [150, 200, 250]) held.key("ArrowUp", at, { repeat: true });
  assert.equal(held.state.rail.phase, "question");
  held.key("ArrowUp", 300);
  assert.equal(held.state.rail.phase, "question", "a held key clears the first press; release starts a new pair");
  held.key("ArrowUp", 400);
  assert.equal(held.state.rail.phase, "feedback");

  const mixed = harness();
  mixed.key("ArrowUp", 100);
  mixed.key("w", 200);
  assert.equal(mixed.state.rail.phase, "question");
  mixed.key("w", 300);
  assert.equal(mixed.state.rail.phase, "feedback");

  const space = harness();
  space.key(" ", 100, { code: "Space" });
  space.key(" ", 200, { code: "Space" });
  assert.equal(space.state.rail.phase, "question");
});

test("an intervening movement, action, modifier, or native control key cancels a pending first Up", () => {
  for (const [key, overrides] of [
    ["ArrowLeft", {}], ["m", {}], ["e", {}], ["1", {}],
    ["ArrowUp", { ctrlKey: true }], ["ArrowUp", { altKey: true }], ["ArrowUp", { metaKey: true }],
    ["Enter", { target: target("go") }], ["Tab", {}],
  ]) {
    const h = harness();
    h.key("ArrowUp", 100);
    h.key(key, 150, overrides);
    h.key("ArrowUp", 200);
    assert.equal(h.state.rail.phase, "question", `${key} must interrupt the double-press sequence`);
  }
  const captured = harness();
  captured.key("ArrowUp", 100);
  captured.c.onGameSpace({
    key: " ", repeat: false, target: target("arena"),
    preventDefault() {}, stopImmediatePropagation() {},
  });
  captured.key("ArrowUp", 200);
  assert.equal(captured.state.rail.phase, "question", "captured Space interrupts even though onKey never receives it");
});

test("a first Up cannot carry into a different question or ride", () => {
  for (const change of [
    h => { h.state.rail.index++; beginRailQuestion(h.state.rail, () => 0.5); },
    h => { h.state.rail = createRailRide(() => 0.5); beginRailQuestion(h.state.rail, () => 0.5); },
  ]) {
    const h = harness();
    h.key("ArrowUp", 100);
    change(h);
    h.key("ArrowUp", 200);
    assert.equal(h.state.rail.phase, "question");
  }
});

test("blocked surfaces and non-running modes cannot submit or preserve a stale double-press", () => {
  const blockers = [
    ...["leaderboardOpenRef", "rotateRequiredRef", "shareOpenRef", "licensesOpenRef", "helpOpenRef", "guideOpenRef", "storeOpenRef", "setupOpenRef", "startAfterCloudRef"]
      .map(name => h => { h.c[name].current = true; return () => { h.c[name].current = false; }; }),
    ...["ready", "paused", "over"].map(mode => h => { h.state.mode = mode; return () => { h.state.mode = "running"; }; }),
    h => { h.state.review = { id: 1, kind: "pillar", shielded: false }; return () => { h.state.review = null; }; },
  ];
  for (const block of blockers) {
    const h = harness();
    h.key("ArrowUp", 100);
    const unblock = block(h);
    h.key("ArrowUp", 150);
    h.c.submitRailChoice();
    assert.equal(h.state.rail.phase, "question");
    unblock();
    h.key("ArrowUp", 200);
    assert.equal(h.state.rail.phase, "question", "unblocking must require a fresh pair of Up presses");
  }
  for (const kind of ["input", "dialog", "result"]) {
    const h = harness();
    h.key("ArrowUp", 100);
    h.key("ArrowUp", 150, { target: target(kind) });
    assert.equal(h.state.rail.phase, "question");
    h.key("ArrowUp", 200);
    assert.equal(h.state.rail.phase, "question", `${kind} focus must interrupt the pair`);
  }
});

test("pause and blur clear pending input, and Go keeps native Space and Enter activation", () => {
  for (const interrupt of [h => h.c.pause(), h => h.c.blur()]) {
    const h = harness();
    h.key("ArrowUp", 100);
    interrupt(h);
    assert.equal(h.c.lastRailUpRef.current, null);
    assert.equal(h.state.mode, "paused");
    h.c.pause();
    h.key("ArrowUp", 200);
    assert.equal(h.state.rail.phase, "question");
  }
  const h = harness();
  const space = h.key(" ", 100, { target: target("go") });
  h.c.onGameSpace(space.event);
  assert.equal(space.prevented, 0);
  assert.equal(h.state.rail.phase, "question");
  assert.equal(h.key("Enter", 200, { target: target("go") }).prevented, 0);
  h.c.submitRailChoice();
  assert.equal(h.state.rail.phase, "feedback");
});

test("touch double taps retain their existing skill action and never submit a rail answer", () => {
  const h = harness();
  for (const at of [100, 250]) {
    const event = {
      pointerType: "touch", isPrimary: true, pointerId: 1, clientX: 150, clientY: 350,
      timeStamp: at, target: target("arena"),
      currentTarget: { setPointerCapture() {}, hasPointerCapture() { return false; } },
    };
    h.c.beginSwipe(event);
    h.c.endSwipe({ ...event, timeStamp: at + 40 });
  }
  assert.equal(h.state.rail.phase, "question");
  assert.equal(h.calls.filter(call => call[0] === "notice").length, 1);
});

test("startup cover blocks gameplay keys and swipes without consuming browser shortcuts", () => {
  const h = harness();
  h.c.graphicsReadyRef.current = false;
  for (const key of [
    "Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "w", "W", "a", "A", "s", "S", "d", "D", "p", "P", "b", "B",
    "r", "R", "m", "M", "e", "E", "1", "2", "3", "4",
    "Process",
  ]) {
    const attempt = h.key(key, 100, key === "Process" ? { code: "KeyW" } : {});
    h.c.onGameSpace(attempt.event);
    assert.equal(attempt.prevented, 1, `${key} must not activate gameplay during loading`);
    assert.equal(attempt.stopped, 1);
  }
  h.c.beginSwipe({ pointerType: "touch" });
  assert.equal(h.c.swipeRef.current, null);
  assert.deepEqual(h.calls, []);
  assert.equal(h.state.rail.phase, "question");
  for (const overrides of [
    ...["Tab", "Shift", "Escape", "F1", "F3", "F5", "F11", "F12", "Home", "End", "PageUp", "PageDown", "x"]
      .map(key => ({ key })),
    { key: "r", metaKey: true }, { key: "r", ctrlKey: true }, { key: "ArrowLeft", altKey: true },
    ...[" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Enter", "W", "P", "B"]
      .map(key => ({ key, shiftKey: true })),
  ]) {
    const attempt = h.key(overrides.key, 200, overrides);
    h.c.onGameSpace(attempt.event);
    assert.equal(attempt.prevented, 0,
      `${overrides.shiftKey ? "Shift+" : ""}${JSON.stringify(overrides.key)} must keep its native browser behavior`);
    assert.equal(attempt.stopped, 0);
  }
  for (const key of ["Enter", " "]) {
    const attempt = h.key(key, 300, { target: target("warmup") });
    h.c.onGameSpace(attempt.event);
    assert.equal(attempt.prevented, 0, "the preparation button remains keyboard accessible");
    assert.equal(attempt.stopped, 0);
  }
  assert.deepEqual(h.calls, [], "preparation interaction cannot activate gameplay");
  assert.equal(h.state.rail.phase, "question");
  assert.equal(h.c.lastRailUpRef.current, null, "modified keys cannot queue gameplay during loading");
});

test("calibration alone cannot unlock input; the actual loader completion unlocks once after calibration", () => {
  const h = harness(), readyUpdates = [];
  h.c.graphicsReadyRef.current = false;
  h.c.calibrationReadyRef = { current: false };
  h.c.setGraphicsReady = value => readyUpdates.push(value);
  h.c.useCallback = callback => callback;
  assert.ok(finishLoadingInitializer, "the app's completion callback must be exercised");
  vm.runInContext(compile(`globalThis.finishLoading = ${finishLoadingInitializer};`), h.c);

  h.c.finishLoading();
  assert.equal(h.c.graphicsReadyRef.current, false, "premature animation completion must not bypass calibration");
  assert.deepEqual(readyUpdates, []);

  h.c.calibrationReadyRef.current = true;
  for (const at of [100, 200]) {
    const attempt = h.key("ArrowUp", at);
    h.c.onGameSpace(attempt.event);
    assert.equal(attempt.prevented, 1, "input stays blocked during the final alignment and fade");
    assert.equal(attempt.stopped, 1);
  }
  h.c.beginSwipe({ pointerType: "touch" });
  assert.equal(h.c.swipeRef.current, null);
  assert.equal(h.state.rail.phase, "question");
  assert.equal(h.c.lastRailUpRef.current, null, "blocked keys cannot leak into the first playable input");
  assert.deepEqual(h.calls, []);

  h.c.finishLoading();
  h.c.finishLoading();
  assert.equal(h.c.graphicsReadyRef.current, true);
  assert.deepEqual(readyUpdates, [true], "repeated completion must not dispatch another unlock");
  h.key("ArrowUp", 400);
  assert.equal(h.state.rail.phase, "question");
  h.key("ArrowUp", 500);
  assert.equal(h.state.rail.phase, "feedback", "actual gameplay input must work once the loader has finished");
  assert.equal(h.state.rail.correctCount, 1);
});
