import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { freezeClockAtCurrentTime } from '../web/clock.mjs';

// Exercise the installed, pinned Playwright implementation instead of copying
// its timer logic. These regressions require no browser binary or server.
const require = createRequire(import.meta.url);
const bundle = fs.readFileSync(require.resolve('playwright-core/lib/coreBundle'), 'utf8');
const clockSourceLine = bundle.split('\n').find(line => line.includes('// packages/injected/src/clock.ts'));
const literal = clockSourceLine?.match(/^\s*source = ('(?:\\.|[^'\\])*');$/)?.[1];
assert.ok(literal, 'Playwright clock bundle format changed; review the clock regression adapter.');
const source = vm.runInNewContext(literal);
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);

function installedClock() {
  let hostTicks = 0;
  const clock = new context.ClockController({
    performanceNow: () => hostTicks,
    dateNow: () => 100000 + hostTicks,
    setTimeout: (callback, delay) => {
      // Explicit host advances drive real-time synchronization. The injected
      // controller also yields between due callbacks without passing a delay.
      if (delay === undefined) queueMicrotask(callback);
      return () => {};
    },
    setInterval: () => () => {},
  });
  clock.install(100000);
  clock.resume();
  return {
    clock,
    advanceHost(milliseconds) {
      hostTicks += milliseconds;
      clock.performanceNow();
    },
  };
}

test('pausing at a previously captured moment is rejected after protocol delay', async () => {
  const { clock, advanceHost } = installedClock();
  const captured = clock.now();
  advanceHost(5000);
  await assert.rejects(clock.pauseAt(captured), /Cannot fast-forward to the past/);
});

test('freezing tolerates delayed calls without expiring a future timer and retains advancing Date semantics', async () => {
  const { clock, advanceHost } = installedClock();
  let futureTimerCalls = 0;
  clock.addTimer({ type: 'Timeout', delay: 60000, args: [], func: () => futureTimerCalls++ });
  const page = {
    evaluate: async () => {
      const captured = clock.now();
      advanceHost(5000);
      return captured;
    },
    clock: Object.fromEntries(['setFixedTime', 'pauseAt', 'setSystemTime'].map(method => [method, async time => {
      advanceHost(5000);
      return clock[method](time);
    }])),
  };
  const frozenAt = await freezeClockAtCurrentTime(page);
  assert.equal(frozenAt, 100000);
  assert.equal(clock.now(), frozenAt);
  assert.equal(clock.performanceNow(), 15000, 'Only pre-pause host time may advance; no arbitrary future jump');
  assert.equal(futureTimerCalls, 0, 'Freezing must not fast-forward to the future timer');
  advanceHost(70000);
  assert.equal(clock.performanceNow(), 15000, 'The clock remains paused across a long host delay');
  assert.equal(clock.now(), frozenAt);
  await clock.runFor(250);
  assert.equal(clock.performanceNow(), 15250);
  assert.equal(clock.now(), frozenAt + 250, 'runFor must advance Date as well as performance');
  assert.equal(futureTimerCalls, 0);
});
