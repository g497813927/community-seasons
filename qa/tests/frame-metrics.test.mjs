import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameMetrics } from '../preview/frame-metrics.mjs';

test('a complete 60-second high-refresh interval retains the first stall and every frame', () => {
  const metrics = createFrameMetrics();
  metrics.record(250);
  for (let frame = 0; frame < 14400; frame++) metrics.record(1000 / 240);
  const report = metrics.report();
  assert.equal(report.frames, 14401);
  assert.equal(report.frameGapMaxMs, 250);
  assert.equal(report.frameGapP95Ms, 5);
  assert.match(report.frameGapP95Method, /1ms histogram/);
});

test('early slow frames still influence p95 after more than 1200 later frames', () => {
  const metrics = createFrameMetrics();
  for (let frame = 0; frame < 100; frame++) metrics.record(40);
  for (let frame = 0; frame < 1600; frame++) metrics.record(10);
  assert.equal(metrics.report().frames, 1700);
  assert.equal(metrics.report().frameGapP95Ms, 40);
  assert.equal(metrics.report().frameGapMaxMs, 40);
});

test('histogram reporting has explicit upper bounds, preserves long stalls and resets all counters', () => {
  const metrics = createFrameMetrics();
  assert.equal(metrics.report().frames, 0);
  assert.equal(metrics.report().frameGapP95Ms, null);
  assert.equal(metrics.report().frameGapMaxMs, null);
  for (const invalid of [NaN, Infinity, -1]) metrics.record(invalid);
  assert.equal(metrics.report().frames, 0);
  metrics.record(16.25);
  assert.equal(metrics.report().frameGapP95Ms, 16.25);
  assert.equal(metrics.report().frameGapMaxMs, 16.25);
  metrics.record(75000);
  assert.equal(metrics.report().frameGapP95Ms, 75000);
  assert.equal(metrics.report().frameGapMaxMs, 75000);
  metrics.reset();
  metrics.record(8);
  assert.equal(metrics.report().frames, 1);
  assert.equal(metrics.report().frameGapMaxMs, 8);
});
