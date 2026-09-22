import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/game/render/display-refresh.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { DisplayRefresh } = context.exports;

function monitor() {
  const refresh = new DisplayRefresh();
  let now = 1;
  refresh.observe(now, true);
  return {
    refresh,
    get now() { return now; },
    frame(gap, active = true) { refresh.observe(now += gap, active); },
    frames(count, gap, active = true) {
      for (let i = 0; i < count; i++) this.frame(gap, active);
    },
  };
}

test("refresh defaults to 60 and detects sustained 60/90/120/144Hz callbacks", () => {
  for (const rate of [60, 90, 120, 144]) {
    const m = monitor();
    assert.equal(m.refresh.fps, 60);
    assert.equal(m.refresh.hasSample, false);
    m.frames(8, 1000 / rate);
    assert.equal(m.refresh.fps, 60, "a short startup burst unlocked faster painting");
    assert.equal(m.refresh.hasSample, false);
    m.frames(rate * 3, 1000 / rate);
    assert.equal(m.refresh.fps, Math.min(120, rate));
    assert.equal(m.refresh.hasSample, true);
  }
});

test("ordinary input jitter and occasional stalls do not hide fast display cadence", () => {
  for (const rate of [90, 120, 144]) {
    const m = monitor();
    for (let i = 0; i < rate * 8; i++) {
      m.frame(i % 30 === 0 ? 35 : 1000 / rate + (i % 2 ? .7 : -.7));
    }
    assert.equal(m.refresh.fps, Math.min(120, rate));
  }
});

test("short/long jitter on 60 or 90Hz cannot manufacture a faster refresh rate", () => {
  for (const rate of [60, 90]) {
    const m = monitor();
    for (let i = 0; i < rate * 8; i++) m.frame(1000 / rate + (i % 2 ? 6 : -6));
    assert.equal(m.refresh.fps, rate);
  }
  const m = monitor();
  m.frames(8, 8);
  m.frames(160, 1000 / 60);
  assert.equal(m.refresh.fps, 60, "a few fast callbacks outweighed the normal display cadence");
});

test("duplicate, backward and invalid timestamps never count as fast callbacks", () => {
  const m = monitor();
  for (let i = 0; i < 180; i++) {
    m.frame(1000 / 60);
    for (const timestamp of [m.now, m.now - 100, NaN, Infinity, -Infinity]) m.refresh.observe(timestamp, true);
  }
  assert.equal(m.refresh.fps, 60);
});

test("inactive pages and long interruptions preserve known refresh and clear pending samples", () => {
  const m = monitor();
  m.frames(370, 1000 / 120);
  assert.equal(m.refresh.fps, 120);
  m.frames(10, 1000, false);
  assert.equal(m.refresh.fps, 120);
  m.frames(50, 1000 / 60);
  m.frame(5000);
  m.frames(50, 1000 / 60);
  assert.equal(m.refresh.fps, 120, "separate partial windows were combined across an interruption");
  m.frames(90, 1000 / 60);
  assert.equal(m.refresh.fps, 60, "active cadence was never re-evaluated after resuming");
});

test("active monitor changes are recognized after sustained cadence, in both directions", () => {
  const m = monitor();
  for (const rate of [120, 60, 90, 120, 60]) {
    m.frames(rate * 5, 1000 / rate);
    assert.equal(m.refresh.fps, rate);
  }
  m.frames(1, 1000 / 120);
  assert.equal(m.refresh.fps, 60, "one fast frame changed the monitor estimate");
});

test("the first sample requires active evidence rather than hidden time or one long interruption", () => {
  const m = monitor();
  m.frames(100, 1000, false);
  assert.equal(m.refresh.hasSample, false);
  m.frame(1000 / 60);
  m.frame(6000);
  m.frames(30, 1000 / 60);
  assert.equal(m.refresh.hasSample, false);
  m.frames(130, 1000 / 60);
  assert.equal(m.refresh.hasSample, true);
  m.frame(1000, false);
  assert.equal(m.refresh.hasSample, true, "a confirmed presentation ceiling is retained while inactive");
});

test("continuous very slow callbacks can confirm a conservative ceiling without hanging startup", () => {
  for (const gaps of [[300], [300, 200]]) {
    const m = monitor();
    m.frames(4, 300);
    assert.equal(m.refresh.hasSample, false, "a few severe callbacks are not a complete sample");
    for (let i = 0; i < 20; i++) m.frame(gaps[i % gaps.length]);
    assert.equal(m.refresh.hasSample, true);
    assert.equal(m.refresh.fps, 60, "slow rendering cannot prove a higher presentation ceiling");
  }
});
