import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../src/lib/game/render/frame-pacing.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { FramePacer } = context.exports;

test('each frame-rate tier keeps even presentation on 60Hz and 120Hz displays', () => {
  for (const refresh of [60, 120]) for (const fps of [60, 30, 20, 15, 10]) {
    const pacer = new FramePacer(), paints = [];
    for (let tick = 0; tick < refresh * 10; tick++) {
      const now = tick * 1000 / refresh;
      if (pacer.shouldRender(now, fps)) paints.push(now);
    }
    assert.equal(paints.length, fps * 10);
    for (let i = 1; i < paints.length; i++) {
      assert.ok(Math.abs(paints[i] - paints[i - 1] - 1000 / fps) < .001);
    }
  }
});

test('native 90/120Hz caps paint on every corresponding display refresh', () => {
  for (const fps of [90, 120]) {
    const pacer = new FramePacer();
    for (let tick = 0; tick < fps * 10; tick++) assert.equal(pacer.shouldRender(tick * 1000 / fps, fps), true);
  }
});

test('a delay skips old deadlines rather than drawing catch-up bursts', () => {
  const pacer = new FramePacer();
  assert.equal(pacer.shouldRender(0, 30), true);
  assert.equal(pacer.shouldRender(1000, 30), true);
  for (const now of [1001, 1010, 1016]) assert.equal(pacer.shouldRender(now, 30), false);
  assert.equal(pacer.shouldRender(1033.333, 30), true);
});

test('pause/resume and a changed rate paint immediately, then use the new cadence', () => {
  const pacer = new FramePacer();
  pacer.shouldRender(0, 10);
  assert.equal(pacer.shouldRender(16, 10), false);
  pacer.reset();
  assert.equal(pacer.shouldRender(17, 10), true);
  assert.equal(pacer.shouldRender(18, 60), true);
  assert.equal(pacer.shouldRender(26, 60), false);
  assert.equal(pacer.shouldRender(34.667, 60), true);
});

test('rounded RAF timestamps do not turn a 30fps target into uneven 20fps', () => {
  const pacer = new FramePacer(), paints = [];
  for (let tick = 0; tick < 600; tick++) {
    const now = Math.round(tick * 1000 / 60 * 10) / 10;
    if (pacer.shouldRender(now, 30)) paints.push(tick);
  }
  assert.equal(paints.length, 300);
  assert.ok(paints.every((tick, i) => tick === i * 2));
});

test('an 80Hz callback stream remains capped at the requested 60fps', () => {
  const pacer = new FramePacer();
  let paints = 0;
  for (let tick = 0; tick < 800; tick++) paints += Number(pacer.shouldRender(tick * 1000 / 80, 60));
  assert.equal(paints, 600);
});

test('native 60/120Hz integer timestamps with small callback jitter retain every native paint', () => {
  for (const fps of [60, 120]) {
    const pacer = new FramePacer();
    for (let tick = 0; tick < fps * 10; tick++) {
      const now = Math.round(tick * 1000 / fps) + (tick % 3 === 0 ? 1 : 0);
      assert.equal(pacer.shouldRender(now, fps), true, `${fps}Hz skipped native callback ${tick}`);
    }
  }
});

test('floating-point deadlines tolerate the exact two-millisecond callback-jitter boundary', () => {
  const pacer = new FramePacer();
  for (let tick = 0; tick < 600; tick++) {
    const now = tick * 1000 / 60 + [2, 0, 1][tick % 3];
    assert.equal(pacer.shouldRender(now, 60), true, `skipped native callback ${tick}`);
  }
});
