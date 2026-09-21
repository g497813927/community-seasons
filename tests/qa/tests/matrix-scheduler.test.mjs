import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatrixScheduler } from '../web/matrix-scheduler.mjs';

const ENGINES = ['chromium', 'webkit'];
const makeJobs = (count, engines = ENGINES) => Array.from({ length: count }, (_, index) =>
  engines.map(engine => Object.freeze({ id: `${engine}__case-${index}`, engine }))).flat();

function drain(jobs, workers, chooseCompletion, engines = ENGINES) {
  const scheduler = createMatrixScheduler(jobs, engines, workers);
  const active = [], started = new Set(), completed = new Set();
  const peak = Object.fromEntries(engines.map(engine => [engine, 0]));
  let totalPeak = 0;
  const fill = () => {
    while (active.length < workers) {
      const job = scheduler.take();
      if (!job) break;
      assert.ok(jobs.includes(job), 'the scheduler must retain the original job identity');
      assert.equal(started.has(job.id), false, `job ${job.id} was scheduled twice`);
      started.add(job.id);
      active.push(job);
      totalPeak = Math.max(totalPeak, active.length);
      assert.ok(active.length <= workers, 'the outer worker pool exceeded its total limit');
      for (const engine of engines) {
        const count = active.filter(item => item.engine === engine).length;
        peak[engine] = Math.max(peak[engine], count);
        assert.ok(count <= scheduler.limits[engine], `${engine} exceeded its ${scheduler.limits[engine]} worker limit`);
      }
    }
  };
  fill();
  while (active.length) {
    const index = chooseCompletion(active);
    assert.ok(Number.isInteger(index) && index >= 0 && index < active.length);
    const [job] = active.splice(index, 1);
    scheduler.release(job);
    assert.equal(completed.has(job.id), false);
    completed.add(job.id);
    fill();
  }
  assert.equal(scheduler.take(), undefined, 'completed matrices must not have residual work');
  assert.deepEqual([...completed].sort(), jobs.map(job => job.id).sort(), 'every selected case must complete exactly once');
  return { peak, totalPeak };
}

test('worker limits are per engine, including odd pools, one worker and one engine', () => {
  for (const [workers, engines, expected] of [
    [16, ENGINES, { chromium: 8, webkit: 8 }],
    [3, ENGINES, { chromium: 2, webkit: 1 }],
    [3, ['webkit', 'chromium'], { webkit: 2, chromium: 1 }],
    [1, ENGINES, { chromium: 1, webkit: 1 }],
    [8, ['chromium'], { chromium: 8 }],
    [8, ['webkit'], { webkit: 8 }],
  ]) {
    assert.deepEqual(createMatrixScheduler([], engines, workers).limits, expected);
  }
});

test('take reserves engine slots, skips saturated engines and preserves order without changing input jobs', () => {
  const jobs = Object.freeze([
    ...makeJobs(3, ['chromium']), ...makeJobs(3, ['webkit']),
  ]);
  const before = structuredClone(jobs);
  const scheduler = createMatrixScheduler(jobs, Object.freeze([...ENGINES]), 4);
  const first = Array.from({ length: 4 }, () => scheduler.take());
  assert.deepEqual(first, [jobs[0], jobs[1], jobs[3], jobs[4]]);
  assert.equal(scheduler.take(), undefined, 'pending work must wait while both engines are full');
  scheduler.release(first[1]);
  assert.equal(scheduler.take(), jobs[2], 'only the released Chromium slot may admit the next Chromium case');
  assert.equal(scheduler.take(), undefined);
  scheduler.release(first[2]);
  assert.equal(scheduler.take(), jobs[5]);
  assert.equal(scheduler.take(), undefined);
  assert.deepEqual(jobs, before);
});

test('all 2560 cases run exactly once with at most eight cases per engine under reverse and skewed completions', () => {
  const jobs = Object.freeze(makeJobs(1280));
  for (const chooseCompletion of [
    active => active.length - 1,
    active => Math.max(0, active.findIndex(job => job.engine === 'webkit')),
    active => Math.max(0, active.findIndex(job => job.engine === 'chromium')),
  ]) {
    const result = drain(jobs, 16, chooseCompletion);
    assert.deepEqual(result, { peak: { chromium: 8, webkit: 8 }, totalPeak: 16 });
  }
});

test('a single worker drains both engines even when jobs are grouped by engine', () => {
  const jobs = [...makeJobs(12, ['chromium']), ...makeJobs(12, ['webkit'])];
  assert.deepEqual(drain(jobs, 1, () => 0), { peak: { chromium: 1, webkit: 1 }, totalPeak: 1 });
});

test('the scheduler enforces the total limit and rejects releasing an unreserved slot', () => {
  const jobs = makeJobs(2);
  const scheduler = createMatrixScheduler(jobs, ENGINES, 1);
  assert.equal(scheduler.take(), jobs[0]);
  assert.equal(scheduler.take(), undefined, 'one worker cannot admit another engine before its current case ends');
  assert.throws(() => scheduler.release(jobs[1]));
  assert.equal(scheduler.take(), undefined, 'an invalid release must not free a worker');
  scheduler.release(jobs[0]);
  assert.throws(() => scheduler.release(jobs[0]));
  assert.equal(scheduler.take(), jobs[1]);
  assert.equal(scheduler.take(), undefined, 'a repeated release must not increase capacity');
});

test('odd and single-engine pools keep their limits until all remaining jobs finish', () => {
  assert.deepEqual(drain(makeJobs(24), 3, active => active.length - 1), {
    peak: { chromium: 2, webkit: 1 }, totalPeak: 3,
  });
  assert.deepEqual(drain(makeJobs(24, ['webkit']), 8, () => 0, ['webkit']), {
    peak: { webkit: 8 }, totalPeak: 8,
  });
});

test('case IDs must be unique across distinct job objects and engines', async (t) => {
  const first = { id: 'chromium__case-0', engine: 'chromium' };
  for (const [label, second] of [
    ['repeated object reference', first],
    ['distinct objects in the same engine', { ...first }],
    ['distinct objects in different engines', { ...first, engine: 'webkit' }],
  ]) await t.test(label, () => {
    assert.throws(() => createMatrixScheduler([first, second], ENGINES, 2), /unique/i);
  });
});

test('distinct engine-prefixed case IDs remain schedulable with original job identities', () => {
  const jobs = makeJobs(1);
  const scheduler = createMatrixScheduler(jobs, ENGINES, 2);
  assert.equal(scheduler.take(), jobs[0]);
  assert.equal(scheduler.take(), jobs[1]);
  scheduler.release(jobs[0]);
  scheduler.release(jobs[1]);
  assert.equal(scheduler.take(), undefined);
});

test('jobs require nonempty string case IDs', () => {
  for (const id of [undefined, null, 42, '', '   ']) {
    assert.throws(() => createMatrixScheduler([{ id, engine: 'chromium' }], ENGINES, 2), /case ID/i);
  }
});

test('empty job queues finish immediately and invalid scheduler configurations are rejected', () => {
  assert.equal(createMatrixScheduler([], ENGINES, 16).take(), undefined);
  for (const workers of [0, -1, 1.5, 33, NaN, Infinity]) {
    assert.throws(() => createMatrixScheduler([], ENGINES, workers), /worker/i);
  }
  assert.throws(() => createMatrixScheduler([], [], 16), /engine/i);
  assert.throws(() => createMatrixScheduler([], ['chromium', 'chromium'], 16), /engine/i);
  assert.throws(() => createMatrixScheduler([{ id: 'unknown', engine: 'firefox' }], ENGINES, 16), /engine/i);
});
