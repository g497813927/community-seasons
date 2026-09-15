import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../../../../src/node_modules/typescript/lib/typescript.js';

const compiled = new URL('./cart-compiled/', import.meta.url);
fs.mkdirSync(compiled, { recursive: true });
for (const name of ['boosts', 'scenes', 'railway', 'engine', 'cart-helper']) {
  const source = fs.readFileSync(new URL(name === 'cart-helper' ? './cart-helper.ts' :
    `../../../../src/lib/game/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/game\/engine['"]/g, "from './engine.mjs'")
    .replace(/from ['"](\.\/[a-z-]+)['"]/g, "from '$1.mjs'");
  fs.writeFileSync(new URL(`${name}.mjs`, compiled), output);
}
const engine = await import('./cart-compiled/engine.mjs');
const helper = await import('./cart-compiled/cart-helper.mjs');

test('checkpoint is the exact natural failing opening after its real fork and warmup', () => {
  const a = helper.deriveCartCheckpoint(), b = helper.deriveCartCheckpoint();
  assert.deepEqual(a, b);
  assert.equal(a.metadata.seed, 1017116225);
  assert.equal(a.metadata.simulatedElapsed, 62);
  assert.equal(a.run.mode, 'running');
  assert.equal(a.run.rail, null);
  assert.equal(a.run.railPreparedAt, a.run.nextRailAt);
  assert.ok(Math.abs(a.run.nextRailAt - 1031.6330301672783) < 1e-9);
  assert.ok(Math.abs(a.run.lastForkAt - 468.65977200653) < 1e-9);
  assert.ok(a.run.obstacles.some(o => Math.abs(o.at - 953.5459164150096) < 1e-9));
  for (const kind of ['rush', 'headstart', 'portal']) assert.equal(a.run.boosts[kind], 0);
});

function measure({ step = .025, stallMs = 0 } = {}) {
  const { run } = helper.deriveCartCheckpoint();
  const probe = helper.createCartMeasurement(run, 1000);
  let wall = 1000, injected = false;
  probe.sample(run, wall);
  for (let i = 0; i < 1200; i++) {
    engine.update(run, step);
    wall += step * 1000;
    if (!injected && !run.rail && run.distance > run.nextRailAt - 10 && stallMs) { wall += stallMs; injected = true; }
    const stopped = probe.sample(run, wall);
    if (stopped) return { run, result: probe.export() };
  }
  assert.fail('Measurement did not finish');
}

test('fixed approach stays within its clear-runway pacing bound and stops at the first real question', () => {
  const { run, result } = measure();
  assert.equal(result.status, 'complete');
  assert.equal(run.rail.phase, 'question');
  assert.equal(run.rail.index, 0);
  assert.ok(result.lastObstacleAt > 953.5459164150096, 'the formerly missing final obstacle row is present');
  const approach = result.intervals.lastObstacleToBoarding.simulationSeconds;
  assert.ok(approach >= 1 && approach <= 4.2, `unsafe or long approach: ${approach}`);
  assert.ok(Math.abs(result.intervals.lastObstacleToFirstQuestion.simulationSeconds - approach - 2) < .001);
  assert.ok(Math.abs(result.intervals.boardingToQuestion.simulationSeconds - 2) < .001);
  assert.ok(Math.abs(result.intervals.lastObstacleToBoarding.excessWallSeconds) < .001);
  assert.equal(result.cadence.over100ms, 0);
  fs.writeFileSync(new URL('./cart-helper-local-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
});

test('wall-only pause is distinguishable from the existing simulation spacing', () => {
  const { result } = measure({ stallMs: 700 });
  assert.equal(result.status, 'complete');
  assert.ok(Math.abs(result.intervals.lastObstacleToBoarding.simulationSeconds - measure().result.intervals.lastObstacleToBoarding.simulationSeconds) < .001);
  assert.ok(Math.abs(result.intervals.lastObstacleToBoarding.excessWallSeconds - .7) < .001);
  assert.equal(result.cadence.over250ms, 1);
  assert.equal(result.cadence.maxGapMs, 725);
});

test('60Hz observation preserves the real pacing within frame tolerance', () => {
  const { result } = measure({ step: 1 / 60 });
  assert.equal(result.status, 'complete');
  assert.ok(Math.abs(result.intervals.lastObstacleToBoarding.simulationSeconds - measure().result.intervals.lastObstacleToBoarding.simulationSeconds) < .04);
  assert.ok(Math.abs(result.intervals.boardingToQuestion.simulationSeconds - 2) < .04);
});

test('hidden/paused/too-long observations stop without changing game state', () => {
  for (const [change, now, visible, reason] of [
    [() => {}, 1000, false, 'hidden'],
    [s => { s.mode = 'paused'; }, 1000, true, 'mode-paused'],
    [() => {}, 22000, true, 'measurement-limit'],
  ]) {
    const { run } = helper.deriveCartCheckpoint();
    const probe = helper.createCartMeasurement(run, 1000);
    change(run); const before = structuredClone(run);
    assert.equal(probe.sample(run, now, visible), reason);
    assert.deepEqual(run, before);
    assert.equal(probe.export().status, reason);
  }
  const { run } = helper.deriveCartCheckpoint();
  const probe = helper.createCartMeasurement(run, 0);
  for (let i = 0; i <= helper.MAX_CART_SAMPLES; i++) probe.sample(run, i);
  assert.equal(probe.export().samples.length, helper.MAX_CART_SAMPLES);
  assert.equal(probe.export().status, 'measurement-limit');
});
