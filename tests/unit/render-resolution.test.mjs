import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name) {
  const source = fs.readFileSync(new URL(`../../src/lib/game/render/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {} };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const { RenderResolution } = load('resolution');
const { DisplayRefresh } = load('display-refresh');
const { FramePacer } = load('frame-pacing');
const { RenderWarmup } = load('warmup');

function monitor() {
  const resolution = new RenderResolution();
  let now = 1;
  resolution.observe(now, 0, true);
  return {
    resolution,
    frames(count, gap = 1000 / 60, work = 5, animated = true, allowGapPressure = true, calibrating = false) {
      for (let i = 0; i < count; i++) resolution.observe(now += gap, work, animated, true, allowGapPressure, calibrating);
    },
  };
}

test('healthy 60/120Hz cadence and isolated stutters keep full detail', () => {
  for (const gap of [1000 / 60, 1000 / 120]) {
    const m = monitor();
    for (let i = 0; i < 12; i++) {
      m.frames(90, gap);
      m.frames(1, 100, 45);
      assert.equal(m.resolution.limit, 2);
    }
  }
});

test('sustained CPU pressure and deferred raster stalls reduce bitmap work, bounded at 1x', () => {
  for (const [gap, work] of [[1000 / 60, 17], [1000 / 30, 5]]) {
    const m = monitor();
    m.frames(20, gap, work);
    assert.equal(m.resolution.limit, 2, 'a short burst is not sustained pressure');
    m.frames(55, gap, work);
    assert.equal(m.resolution.limit, gap > 22 ? 1 : 1.5);
    m.frames(250, gap, work);
    assert.equal(m.resolution.limit, 1);
  }
});

test('paused/hidden frames and long interruptions cannot accumulate pressure', () => {
  const m = monitor();
  for (let i = 0; i < 8; i++) {
    m.frames(20, 33, 18);
    m.frames(3, 1000, 2, false);
    m.frames(1, 6000, 2);
  }
  assert.equal(m.resolution.limit, 2);
});

test('very expensive rendering still adapts rather than being mistaken for an idle interruption', () => {
  const m = monitor();
  m.frames(20, 300, 280);
  assert.equal(m.resolution.limit, 1.5);
  m.frames(20, 300, 280);
  assert.equal(m.resolution.limit, 1);
});

test('detail recovers only after sustained headroom, one step at a time', () => {
  const m = monitor();
  m.frames(75, 33, 18);
  assert.equal(m.resolution.limit, 1);
  m.frames(300);
  assert.equal(m.resolution.limit, 1, 'brief headroom must not oscillate quality');
  m.frames(700);
  assert.equal(m.resolution.limit, 1.5);
  m.frames(1000);
  assert.equal(m.resolution.limit, 2);
});

test('steady intentional caps are not mistaken for dropped frames', () => {
  const m = monitor();
  m.frames(75, 33, 18);
  assert.equal(m.resolution.fps, 30);
  m.frames(200, 1000 / 30, 18);
  assert.equal(m.resolution.fps, 30);
  // A skipped paint must neither accumulate pressure nor manufacture recovery.
  m.frames(1, 1000 / 30, 18);
  for (let i = 0; i < 1000; i++) m.resolution.observe(99999 + i, 1, true, false);
  assert.equal(m.resolution.fps, 30);
});

test('sustained pressure selects a sustainable cap and keeps it without oscillation', () => {
  const m = monitor();
  m.frames(500, 1000 / 15, 45);
  assert.equal(m.resolution.fps, 15);
  m.frames(500, 1000 / 15, 45);
  assert.equal(m.resolution.fps, 15, 'steady 15fps cannot sustain the next tier');
  m.frames(500, 1000 / 10, 90);
  assert.equal(m.resolution.fps, 10, 'severe load must stop at the bounded floor');
});

test('FPS unlocks only after sustained capacity for the next rate', () => {
  const m = monitor();
  m.frames(300, 1000 / 10, 90);
  assert.equal(m.resolution.fps, 10);
  m.frames(100, 1000 / 10, 20);
  assert.equal(m.resolution.fps, 10);
  m.frames(60, 1000 / 10, 20);
  assert.equal(m.resolution.fps, 15);
});

test('high-refresh displays unlock 90/120fps only with sustained rendering headroom', () => {
  for (const refresh of [90, 120]) {
    const m = monitor();
    m.resolution.setDisplayRate(refresh);
    m.frames(300, 1000 / 60, 3);
    assert.equal(m.resolution.fps, 60);
    for (let i = 0; i < 1000 && m.resolution.fps === 60; i++) m.frames(1, 1000 / 60, 3);
    assert.equal(m.resolution.fps, refresh);
    m.frames(300, 1000 / refresh, 3);
    assert.equal(m.resolution.fps, refresh);
    m.resolution.setDisplayRate(60);
    assert.equal(m.resolution.fps, 60, 'moving to a 60Hz display must clamp the cap');
  }
});

test('a high-refresh probe fails when average presentation cannot sustain its target despite tolerable individual gaps', () => {
  for (const [refresh, actual] of [[90, 75], [120, 95]]) {
    const m = monitor();
    m.resolution.setDisplayRate(refresh);
    for (let i = 0; i < 400 && m.resolution.fps !== refresh; i++) {
      m.frames(1, 1000 / 60, 2, true, true, true);
    }
    assert.equal(m.resolution.fps, refresh, 'the faster rate must actually be probed');
    m.frames(Math.ceil(actual * 1.3), 1000 / actual, 2, true, true, true);
    assert.equal(m.resolution.fps, 60, `${refresh}fps accepted ${actual}fps actual presentation`);
    assert.equal(m.resolution.limit, 2, 'a failed high-refresh probe should retain full bitmap detail');
    m.frames(2400, 1000 / 60, 2);
    assert.equal(m.resolution.fps, 60, 'unchanged workload must not retry the rejected cadence after reveal');
  }
});

test('80Hz jitter misclassified as 90Hz settles at real 60fps before reveal and remains stable as callbacks become 60Hz', () => {
  const resolution = new RenderResolution(), refresh = new DisplayRefresh();
  const pacer = new FramePacer(), warmup = new RenderWarmup();
  let now = 0, ready = false, tick = 0, probed = false;
  function frame(gap) {
    now += gap;
    refresh.observe(now, true);
    resolution.setDisplayRate(refresh.fps);
    const rendered = pacer.shouldRender(now, resolution.fps);
    resolution.observe(now, rendered ? 2 : 0.1, true, rendered, true, !ready);
    probed ||= resolution.fps === 90;
    ready = warmup.observe(now, true, rendered, resolution.fps, resolution.limit,
      resolution.settled && refresh.hasSample);
  }
  while (!ready && now < 30000) frame(tick++ % 2 ? 15 : 10);
  assert.equal(probed, true, 'the jitter pattern must exercise a false 90Hz capability probe');
  assert.equal(ready, true);
  assert.equal(refresh.fps, 90, 'short callback gaps should reproduce the optimistic display estimate');
  assert.equal(resolution.fps, 60, 'readiness must wait for actual sustainable presentation');
  assert.equal(resolution.limit, 2);
  for (let i = 0; i < 800; i++) { frame(tick++ % 2 ? 15 : 10); assert.equal(resolution.fps, 60); }
  for (let i = 0; i < 2400; i++) { frame(1000 / 60); assert.equal(resolution.fps, 60); }
  assert.equal(refresh.fps, 60);
  assert.equal(resolution.limit, 2);
});

test('60fps presentation on a 90Hz display tolerates alternating refresh intervals', () => {
  const m = monitor();
  m.resolution.setDisplayRate(90);
  for (let i = 0; i < 900; i++) m.frames(1, (i % 2 ? 2 : 1) * 1000 / 90, 10);
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.resolution.fps, 60, '10ms work has no headroom for 90fps');
});

test('a 60Hz display never triggers quality reduction just because 120fps is unavailable', () => {
  const m = monitor();
  m.frames(4000, 1000 / 60, 5);
  assert.equal(m.resolution.fps, 60);
  assert.equal(m.resolution.limit, 2);
});

test('cheap 30Hz host callbacks before iframe activation do not create a long quality recovery after activation', () => {
  const resolution = new RenderResolution(), refresh = new DisplayRefresh(), pacer = new FramePacer();
  let now = 0;
  function frame(rate, allowGapPressure) {
    now += 1000 / rate;
    refresh.observe(now, true);
    resolution.setDisplayRate(refresh.fps);
    const rendered = pacer.shouldRender(now, resolution.fps);
    resolution.observe(now, rendered ? 2 : 0.1, true, rendered, allowGapPressure);
    return rendered;
  }
  // Model a host-imposed ceiling, not a physical-device performance claim.
  for (let i = 0; i < 240; i++) frame(30, false);
  assert.equal(refresh.fps, 60, 'a host ceiling must not be classified as a slower physical display');
  assert.equal(resolution.limit, 2);
  assert.equal(resolution.fps, 60);
  let rendered = 0;
  for (let i = 0; i < 60; i++) rendered += Number(frame(60, true));
  assert.equal(rendered, 60, 'the first activated second must paint every available 60Hz callback');
  assert.equal(resolution.limit, 2, 'no false quality downgrade should require a 15-second recovery');
});

test('ignoring an unactivated host ceiling preserves real CPU-load protection', () => {
  const m = monitor();
  m.frames(75, 1000 / 30, 17, true, false);
  assert.equal(m.resolution.limit, 1);
  assert.equal(m.resolution.fps, 30, '17ms painting still exceeds the initial 60fps work budget');
  m.frames(300, 1000 / 10, 90, true, false);
  assert.equal(m.resolution.limit, 1);
  assert.equal(m.resolution.fps, 10, 'expensive frames must retain the bounded protection floor');
});

test('ignoring host-gap pressure cannot invent high-refresh rendering headroom', () => {
  for (const rate of [90, 120]) {
    const m = monitor();
    m.resolution.setDisplayRate(rate);
    m.frames(900, 1000 / 30, 2, true, false);
    assert.equal(m.resolution.fps, 60, 'slow observed presentation cannot unlock a faster tier');
    assert.equal(m.resolution.limit, 2);
  }
});

test('ordinary cadence pressure resumes as soon as the host ceiling exception ends', () => {
  const m = monitor();
  m.frames(240, 1000 / 30, 2, true, false);
  assert.equal(m.resolution.limit, 2);
  m.frames(75, 1000 / 30, 2);
  assert.equal(m.resolution.limit, 1, 'persistent post-activation gaps still count as deferred rendering pressure');
});

function startup({ rate = 60, work = () => 2, allowGapPressure = true } = {}) {
  const resolution = new RenderResolution(), refresh = new DisplayRefresh();
  const pacer = new FramePacer(), warmup = new RenderWarmup();
  let now = 0, ready = false;
  const tiers = [];
  return {
    resolution, refresh, tiers,
    get now() { return now; }, get ready() { return ready; },
    setRate(nextRate) { rate = nextRate; },
    frame(calibrating = true) {
      now += 1000 / rate;
      refresh.observe(now, true);
      resolution.setDisplayRate(refresh.fps);
      const rendered = pacer.shouldRender(now, resolution.fps);
      const previous = `${resolution.limit}/${resolution.fps}`;
      resolution.observe(now, rendered ? work(now, resolution) : 0.1,
        true, rendered, allowGapPressure, calibrating);
      const current = `${resolution.limit}/${resolution.fps}`;
      if (current !== previous) tiers.push({ at: now, tier: current });
      ready = warmup.observe(now, true, rendered, resolution.fps, resolution.limit,
        resolution.settled && refresh.hasSample);
    },
    untilReady(maxMs = 30000) {
      while (!ready && now < maxMs) this.frame();
      assert.equal(ready, true, `calibration did not settle by ${maxMs}ms: ${JSON.stringify(tiers)}`);
    },
  };
}

test('readiness needs a full rendering window and emerging sustained pressure or interruption invalidates it', () => {
  const m = monitor();
  assert.equal(m.resolution.settled, false);
  m.frames(20);
  assert.equal(m.resolution.settled, false);
  m.frames(60);
  assert.equal(m.resolution.settled, true);
  m.frames(1, 95, 60);
  assert.equal(m.resolution.settled, true, 'an isolated spike must not require a perfect jitter-free startup');
  m.frames(2, 1000 / 60, 20);
  assert.equal(m.resolution.settled, false, 'emerging pressure must cancel readiness before a full classification');
  m.frames(80);
  assert.equal(m.resolution.settled, true);
  m.frames(1, 1000, 0, false);
  assert.equal(m.resolution.settled, false);
  m.frames(10);
  assert.equal(m.resolution.settled, false, 'resuming must collect fresh rendering evidence');
});

test('hidden calibration recovers cold-start quality before releasing startup', () => {
  const m = startup({ work: now => now <= 1500 ? 20 : 2 });
  m.untilReady();
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.resolution.fps, 60);
  assert.ok(m.tiers.some(tier => tier.tier === '1.5/60'), 'cold work must exercise a downgrade');
  const recovered = m.tiers.find(tier => tier.tier === '2/60');
  assert.ok(recovered.at >= 4000 && recovered.at < 8000, JSON.stringify(m.tiers));
  assert.ok(m.now >= recovered.at + 2800, 'confirm the restored tier and its quiet painted window');
  assert.ok(m.now < 11000, `startup unexpectedly retained the normal 15-second recovery: ${m.now}`);
});

test('a failed upward startup probe settles at sustainable detail without retrying forever', () => {
  const m = startup({ work: (_now, resolution) => resolution.limit === 2 ? 20 : 8 });
  m.untilReady();
  assert.equal(m.resolution.limit, 1.5);
  assert.equal(m.resolution.fps, 60);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, 1);
  assert.ok(m.now < 12000);
  for (let i = 0; i < 1800; i++) m.frame();
  assert.equal(m.resolution.limit, 1.5);
  assert.equal(m.resolution.settled, true);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, 1, 'failed tier was probed repeatedly');
  for (let i = 0; i < 2400; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5, 'unchanged gameplay work must retain the proven sustainable tier');
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, 1, 'the failed tier retried after startup');
});

test('meaningfully cheaper work at the same fallback tier permits recovery after startup', () => {
  let fullWork = 20, fallbackWork = 8;
  const m = startup({ work: (_now, resolution) => resolution.limit === 2 ? fullWork : fallbackWork });
  m.untilReady();
  for (let i = 0; i < 2400; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5);
  fallbackWork = 6.5;
  for (let i = 0; i < 2400; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5, 'a small cost fluctuation must not reopen a proven failed tier');
  fallbackWork = 6;
  fullWork = 10;
  for (let i = 0; i < 600; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5, 'real improvement still needs cautious visible recovery');
  for (let i = 0; i < 900; i++) m.frame(false);
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.resolution.fps, 60);
});

test('a validated fallback with moderate pressure records its baseline before later work improves', () => {
  let fallbackSeen = false, retried = false, improved = false, fallbackFrame = 0;
  const m = startup({ work: (_now, resolution) => {
    if (improved) return 2;
    if (resolution.limit === 2) {
      if (fallbackSeen) retried = true;
      return 20;
    }
    fallbackSeen = true;
    return retried && ++fallbackFrame % 4 === 0 ? 20 : 8;
  } });
  m.untilReady();
  assert.equal(retried, true, 'the expensive higher tier must have been probed and rejected');
  assert.equal(m.resolution.limit, 1.5);
  improved = true;
  for (let i = 0; i < 2400; i++) m.frame(false);
  assert.equal(m.resolution.limit, 2, 'moderate fallback pressure must not hide a later capacity improvement');
  assert.equal(m.resolution.fps, 60);
});

test('a reopened tier that still fails is rejected again instead of repeating visible probes', () => {
  let improved = false;
  const m = startup({ work: (_now, resolution) => resolution.limit === 2 ? 20 : improved ? 5 : 8 });
  m.untilReady();
  for (let i = 0; i < 120; i++) m.frame(false);
  improved = true;
  for (let i = 0; i < 1800; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5);
  const attempts = m.tiers.filter(tier => tier.tier === '2/60').length;
  assert.equal(attempts, 2, 'changed fallback work should permit exactly one new probe');
  for (let i = 0; i < 3000; i++) m.frame(false);
  assert.equal(m.resolution.limit, 1.5);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, attempts);
});

test('new display cadence invalidates a rejected tier without requiring a work-cost change', () => {
  const m = startup({ work: (_now, resolution) => resolution.limit === 2 ? 20 : 8 });
  m.untilReady();
  for (let i = 0; i < 2400; i++) m.frame(false);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, 1);
  m.setRate(120);
  for (let i = 0; i < 3600; i++) m.frame(false);
  assert.equal(m.refresh.fps, 120);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/60').length, 2,
    'new display evidence should allow one fresh capability probe');
});

test('startup tests native 90/120Hz capacity before readiness instead of releasing at initial 60fps', () => {
  for (const rate of [90, 120]) {
    const m = startup({ rate });
    m.untilReady();
    assert.equal(m.refresh.hasSample, true);
    assert.equal(m.resolution.fps, rate);
    assert.equal(m.resolution.limit, 2);
    assert.ok(m.now > 6000 && m.now < 10000, `${rate}Hz readiness at ${m.now}`);
  }
});

test('a failed 120fps calibration probe confirms evenly paced 60fps and settles', () => {
  const m = startup({ rate: 120, work: (_now, resolution) => resolution.fps === 120 ? 8 : 3 });
  m.untilReady();
  assert.equal(m.resolution.fps, 60);
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.tiers.filter(tier => tier.tier === '2/120').length, 1);
  assert.ok(m.now < 13000);
});

test('continuous severe work at the lowest tier can finish startup at its best available budget', () => {
  const m = startup({ rate: 3, work: () => 300 });
  m.untilReady(70000);
  assert.equal(m.resolution.fps, 10);
  assert.equal(m.resolution.limit, 1);
  assert.equal(m.resolution.settled, true);
  assert.equal(m.refresh.hasSample, true);
  for (let i = 0; i < 10; i++) m.frame();
  assert.equal(m.resolution.settled, true, 'floor pressure must not repeatedly invalidate completed classification');
});

test('cheap unactivated iframe cadence finishes calibration at full detail without unlocking faster rates', () => {
  const m = startup({ rate: 30, allowGapPressure: false });
  m.untilReady();
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.resolution.fps, 60);
  assert.equal(m.tiers.length, 0);
});

test('cold unactivated 30Hz iframe work recovers full detail before startup readiness', () => {
  const m = startup({ rate: 30, allowGapPressure: false, work: now => now <= 1500 ? 20 : 2 });
  m.untilReady();
  assert.ok(m.tiers.some(tier => tier.tier === '1.5/60'), 'the cold-start downgrade must be exercised');
  assert.equal(m.resolution.limit, 2, 'host cadence must not prevent recovery of bitmap quality');
  assert.equal(m.resolution.fps, 60);
  assert.ok(m.now < 11000);
});

test('isolated recurring GC or input spikes do not keep a healthy startup covered forever', () => {
  for (const spikeWork of [20, 95]) {
    let frame = 0;
    const m = startup({ work: () => ++frame % 60 === 0 ? spikeWork : 2 });
    m.untilReady(6000);
    assert.equal(m.resolution.limit, 2);
    assert.equal(m.resolution.fps, 60);
    assert.equal(m.tiers.length, 0);
  }
});

test('sustained load beginning near the first reveal cancels readiness before the full window ends', () => {
  const m = startup({ work: now => now >= 3450 ? 20 : 2 });
  while (m.now < 3800) m.frame();
  assert.equal(m.ready, false, 'new sustained load must prevent the otherwise healthy 3.6-second reveal');
  assert.equal(m.resolution.settled, false);
  assert.equal(m.resolution.limit, 2, 'the readiness guard should act before a full downgrade window');
});

test('repeated startup bursts retain the same sustainable tier as later gameplay', () => {
  for (const profile of ['three-per-second', 'quarter-slow']) {
    let frame = 0;
    const m = startup({ work: () => {
      frame++;
      return (profile === 'three-per-second' ? frame % 60 < 3 : frame % 4 === 0) ? 20 : 2;
    } });
    m.untilReady(30000);
    assert.equal(m.resolution.fps, 60);
    assert.equal(m.resolution.limit, 2);
    const completedTiers = m.tiers.length;
    for (let i = 0; i < 2400; i++) m.frame(false);
    assert.equal(m.tiers.length, completedTiers, `${profile}: identical workload caused a delayed quality recovery`);
    assert.equal(m.resolution.limit, 2);
    assert.equal(m.resolution.fps, 60);
  }
});

test('ordinary gameplay retains full quality below the sustained pressure threshold', () => {
  const m = monitor();
  for (let i = 0; i < 1800; i++) m.frames(1, 1000 / 60, i % 4 === 0 ? 20 : 2);
  assert.equal(m.resolution.limit, 2);
  assert.equal(m.resolution.fps, 60);
});

test('a transient burst pauses readiness and clears after aging out without waiting for another full window', () => {
  const m = monitor();
  m.frames(80);
  assert.equal(m.resolution.settled, true);
  m.frames(3, 1000 / 60, 20);
  assert.equal(m.resolution.settled, false);
  m.frames(10, 1000 / 60, 2);
  assert.equal(m.resolution.settled, true, 'the validated tier should resume readiness once transient pressure clears');
  assert.equal(m.resolution.limit, 2);
});

test('a full-window boundary cannot clear the recent sustained-load readiness guard', () => {
  const m = monitor();
  m.frames(80);
  // Place the emerging load just before the next 1.2-second classification.
  m.frames(61);
  m.frames(6, 1000 / 60, 20);
  assert.equal(m.resolution.limit, 2, 'this short burst is below the long-window downgrade threshold');
  assert.equal(m.resolution.settled, false, 'a classification boundary erased recent pressure');
});
