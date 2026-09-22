import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../src/lib/game/render/warmup.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { RenderWarmup } = context.exports;
const tick = (warmup, at, rendered = true, fps = 60, ratio = 2, settled = true, animated = true) =>
  warmup.observe(at, true, rendered, fps, ratio, settled, animated);

test('healthy startup stays covered for two seconds, then completes once', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at < 2000; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 2000), true);
  warmup.pause();
  assert.equal(warmup.observe(2500, false, false, 10, 1, false), true, 'later pauses, pressure and tier changes cannot reopen startup');
});

test('skipped RAF callbacks cannot stand in for actual warmup paints', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at <= 3000; at += 20) assert.equal(tick(warmup, at, false), false);
  for (let frame = 1; frame < 30; frame++) assert.equal(tick(warmup, 3000 + frame * 20), false);
  assert.equal(tick(warmup, 3600), true);
});

test('a change in FPS or detail starts a fresh settling window', () => {
  for (const [fps, ratio] of [[30, 2], [60, 1.5]]) {
    const warmup = new RenderWarmup();
    for (let at = 0; at < 1800; at += 20) tick(warmup, at);
    assert.equal(tick(warmup, 1800, true, fps, ratio), false);
    for (let at = 1820; at < 3400; at += 20) assert.equal(tick(warmup, at, true, fps, ratio), false);
    assert.equal(tick(warmup, 3400, true, fps, ratio), true);
  }
});

test('hidden time advances neither the visible deadline nor the settling window', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at <= 1000; at += 20) tick(warmup, at);
  warmup.observe(1000, false, false, 60, 2, true);
  warmup.observe(61000, false, false, 60, 2, true);
  assert.equal(tick(warmup, 62000), false);
  for (let at = 62020; at < 63600; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 63600), true);
});

test('visibility events cover suspended RAF callbacks across backgrounding', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at <= 1000; at += 20) tick(warmup, at);
  warmup.pause();
  assert.equal(tick(warmup, 60000), false);
  for (let at = 60020; at < 61600; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 61600), true);
});

test('animated calibration cannot finish from a timeout, unchanged tier or skipped paints', () => {
  for (const pattern of ['unsettled', 'no-paints', 'changing-tier']) {
    const warmup = new RenderWarmup();
    for (let at = 0; at <= 30000; at += 100) {
      const rendered = pattern !== 'no-paints';
      const fps = pattern === 'changing-tier' && at % 400 === 0 ? 30 : 60;
      assert.equal(tick(warmup, at, rendered, fps, 2, pattern !== 'unsettled'), false);
    }
  }
});

test('late pressure blocks readiness until the same tier is validated again', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at < 2000; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 2000, true, 60, 2, false), false,
    'an unchanged tier cannot hide a newly detected expensive frame');
  assert.equal(tick(warmup, 2020), true, 'earlier healthy evidence remains valid after transient pressure clears');
});

test('repeated brief pressure cannot hold a validated unchanged tier indefinitely', () => {
  const warmup = new RenderWarmup();
  let readyAt = null;
  for (let at = 0; at <= 4000; at += 20) {
    const settled = at % 1000 >= 60;
    const ready = tick(warmup, at, true, 60, 2, settled);
    if (!settled) assert.equal(ready, false, 'active pressure keeps the cover visible');
    if (ready) { readyAt = at; break; }
  }
  assert.ok(readyAt >= 2000 && readyAt < 3000,
    'healthy evidence between bursts can finish without a startup-only downgrade');
});

test('unsettled time and paints cannot fill an incomplete healthy window', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at <= 400; at += 20) assert.equal(tick(warmup, at), false);
  for (let at = 420; at <= 20000; at += 20) assert.equal(tick(warmup, at, true, 60, 2, false), false);
  assert.equal(tick(warmup, 20020), false, 'the long pressure gap contributes no healthy time');
  for (let at = 20040; at < 21220; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 21220), true, 'the prior 400ms and new 1200ms are healthy at the same tier');
});

test('paints during transient pressure do not count toward thirty healthy paints', () => {
  const warmup = new RenderWarmup();
  tick(warmup, 0);
  tick(warmup, 1800, false);
  for (let at = 1820; at <= 4000; at += 20) assert.equal(tick(warmup, at, true, 60, 2, false), false);
  assert.equal(tick(warmup, 4020), false);
  for (let frame = 1; frame < 30; frame++) assert.equal(tick(warmup, 4020 + frame * 20), false);
  assert.equal(tick(warmup, 4620), true);
});

test('a pressure-driven tier change discards all earlier healthy evidence', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at < 1800; at += 20) tick(warmup, at);
  for (let at = 1800; at < 4000; at += 20) assert.equal(tick(warmup, at, true, 60, 2, false), false);
  assert.equal(tick(warmup, 4000, true, 30, 1, false), false);
  assert.equal(tick(warmup, 4020, true, 30, 1), false);
  for (let at = 4040; at < 5620; at += 20) assert.equal(tick(warmup, at, true, 30, 1), false);
  assert.equal(tick(warmup, 5620, true, 30, 1), true);
});

test('long calibration stays covered until a sustainable tier actually settles', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at <= 18000; at += 20) assert.equal(tick(warmup, at, true, 60, 2, false), false);
  for (let at = 18020; at < 19620; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 19620), true);
});

test('the confirmed best-available floor can finish after thirty real paints', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at < 10000; at += 100) assert.equal(tick(warmup, at, true, 10, 1, false), false);
  assert.equal(tick(warmup, 10000, true, 10, 1, true), false);
  for (let paint = 1; paint < 30; paint++) assert.equal(tick(warmup, 10000 + paint * 100, true, 10, 1, true), false);
  assert.equal(tick(warmup, 13000, true, 10, 1, true), true);
});

test('a modal or portrait warning becomes reachable after two visible seconds', () => {
  const warmup = new RenderWarmup();
  for (let at = 0; at < 2000; at += 20) assert.equal(tick(warmup, at, false, 60, 2, false, false), false);
  assert.equal(tick(warmup, 2000, false, 60, 2, false, false), true);
});

test('hidden time cannot dismiss a nonanimated blocking screen', () => {
  const warmup = new RenderWarmup();
  tick(warmup, 0, false, 60, 2, false, false);
  tick(warmup, 1000, false, 60, 2, false, false);
  warmup.observe(1000, false, false, 60, 2, false, false);
  warmup.observe(61000, false, false, 60, 2, false, false);
  assert.equal(tick(warmup, 62000, false, 60, 2, false, false), false);
  assert.equal(tick(warmup, 62999, false, 60, 2, false, false), false);
  assert.equal(tick(warmup, 63000, false, 60, 2, false, false), true);
});

test('rendering resumed before a blocker is revealed needs its own settled window', () => {
  const warmup = new RenderWarmup();
  tick(warmup, 0, false, 60, 2, false, false);
  tick(warmup, 1000, false, 60, 2, false, false);
  for (let at = 1200; at < 2800; at += 20) assert.equal(tick(warmup, at), false);
  assert.equal(tick(warmup, 2800), true);
});

test('invalid or reversed timestamps do not prematurely finish the transition', () => {
  const warmup = new RenderWarmup();
  tick(warmup, 1000, false, 60, 2, false, false);
  for (const at of [NaN, Infinity, -10000]) assert.equal(tick(warmup, at, false, 60, 2, false, false), false);
  assert.equal(tick(warmup, 2999, false, 60, 2, false, false), false);
  assert.equal(tick(warmup, 3000, false, 60, 2, false, false), true);
});
