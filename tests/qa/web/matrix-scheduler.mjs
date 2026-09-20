import assert from 'node:assert/strict';

// Divide the total pool into per-engine ceilings so a faster engine cannot
// occupy another engine's slots. A single worker can still cover both engines.
export function createMatrixScheduler(jobs, engines, workers) {
  assert.ok(Number.isInteger(workers) && workers >= 1 && workers <= 32, 'Workers must be an integer from 1 to 32.');
  assert.ok(engines.length > 0 && new Set(engines).size === engines.length, 'Engines must be nonempty and unique.');
  assert.ok(jobs.every(job => engines.includes(job.engine)), 'Every job must have a configured engine.');
  assert.equal(new Set(jobs).size, jobs.length, 'Jobs must be unique.');
  const limits = Object.freeze(Object.fromEntries(engines.map((engine, index) => [engine,
    Math.max(1, Math.floor(workers / engines.length) + (index < workers % engines.length ? 1 : 0)),
  ])));
  const pending = [...jobs], active = new Set();
  const counts = Object.fromEntries(engines.map(engine => [engine, 0]));
  return {
    limits,
    take() {
      if (active.size >= workers) return undefined;
      const index = pending.findIndex(job => counts[job.engine] < limits[job.engine]);
      if (index < 0) return undefined;
      const [job] = pending.splice(index, 1);
      active.add(job);
      counts[job.engine]++;
      return job;
    },
    release(job) {
      assert.ok(active.delete(job), 'Only an active job can be released.');
      counts[job.engine]--;
    },
  };
}
