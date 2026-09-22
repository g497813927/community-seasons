import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = compile('../../src/components/season-wheel-motion.ts');
const mediaSource = compile('../../src/lib/game/media-query.ts');

function fixture({ reduced = false, animate = true } = {}) {
  const timers = new Map(), mediaListeners = new Set(), visibilityListeners = new Set();
  const turns = [], labels = [], steps = [];
  let timerId = 0, arrivals = 0;
  const preference = {
    matches: reduced,
    addEventListener: (_, callback) => mediaListeners.add(callback),
    removeEventListener: (_, callback) => mediaListeners.delete(callback),
  };
  const document = {
    hidden: false,
    addEventListener: (_, callback) => visibilityListeners.add(callback),
    removeEventListener: (_, callback) => visibilityListeners.delete(callback),
  };
  const window = {
    matchMedia: () => preference,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  const wheel = { style: {} };
  if (animate) wheel.animate = (keyframes, options) => {
    let resolve, reject;
    const turn = {
      keyframes, options, currentTime: 0, cancelled: false,
      finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
      finish() { this.currentTime = options.duration; resolve(); },
      cancel() { this.cancelled = true; reject(new Error('cancelled')); },
    };
    turns.push(turn);
    return turn;
  };
  const mediaContext = { exports: {} };
  vm.runInNewContext(mediaSource, mediaContext);
  const context = { exports: {}, window, document, require: () => mediaContext.exports };
  vm.runInNewContext(source, context);
  const motion = context.exports.createSeasonWheelMotion(wheel, {
    onLabel: (index) => labels.push(index),
    onStep: (step) => steps.push(step),
    onArrive: () => arrivals++,
  });
  return {
    motion, wheel, turns, labels, steps, timers, mediaListeners, visibilityListeners,
    get arrivals() { return arrivals; },
    async finish() { turns.at(-1).finish(); await Promise.resolve(); },
    reduce(matches) { preference.matches = matches; for (const callback of mediaListeners) callback(); },
    hide(hidden) { document.hidden = hidden; for (const callback of visibilityListeners) callback(); },
    flushLabels() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
  };
}

const endAngle = (turn) => Number(/rotate\(([^d]+)deg\)/.exec(turn.keyframes[1].transform)[1]);

test('auto rotation freezes each half-turn until its hidden slot is committed', async () => {
  const f = fixture();
  assert.deepEqual(f.labels, [0]);
  let pair = [0, 1];
  for (let step = 1; step <= 5; step++) {
    const turn = f.turns.at(-1);
    assert.equal(turn.options.duration, 4000);
    assert.equal(endAngle(turn), step * -180);
    turn.currentTime = 2001;
    f.flushLabels();
    assert.equal(f.labels.at(-1), step % 4, 'label follows the half visible under the TV');
    await f.finish();
    assert.equal(f.wheel.style.transform, `rotate(${step * -180}deg)`);
    assert.equal(f.steps.at(-1), step);
    assert.equal(f.turns.length, step, 'must not cross the boundary before DOM reconciliation');
    const nextPair = [...pair];
    nextPair[(step + 1) % 2] = (step + 1) % 4;
    assert.equal(nextPair[step % 2], pair[step % 2], 'the visible slot must not change');
    pair = nextPair;
    f.motion.committed(step - 1);
    assert.equal(f.turns.length, step, 'a stale commit must not resume movement');
    f.motion.committed(step);
    assert.equal(f.turns.length, step + 1);
  }
  f.motion.dispose();
});

test('rapid taps coalesce within one four-season cycle and traverse every hidden boundary', async () => {
  const f = fixture();
  f.turns[0].currentTime = 1000;
  for (let tap = 0; tap < 11; tap++) f.motion.advance();
  assert.equal(f.turns.at(-1).keyframes[0].transform, 'rotate(-45deg)');
  assert.equal(f.turns.at(-1).options.duration, 240);
  // Eleven taps select winter, without eleven turns or skipping mounted halves.
  for (let step = 1; step <= 3; step++) {
    assert.equal(endAngle(f.turns.at(-1)), step * -180);
    await f.finish();
    f.motion.committed(step);
  }
  assert.equal(f.labels.at(-1), 3);
  assert.equal(f.turns.at(-1).options.duration, 4000, 'normal speed resumes after the requested season');
  assert.deepEqual(f.steps, [1, 2, 3]);
  f.motion.dispose();
});

test('a stale WAAPI sample at the label boundary reschedules just that boundary', () => {
  const f = fixture();
  f.turns[0].currentTime = 1999;
  f.flushLabels();
  assert.equal(f.labels.at(-1), 0);
  assert.equal(f.timers.size, 1);
  assert.ok([...f.timers.values()][0].delay >= 16);
  f.turns[0].currentTime = 2016;
  f.flushLabels();
  assert.equal(f.labels.at(-1), 1);
  assert.equal(f.timers.size, 0);
  f.motion.dispose();
});

test('saved seasons distinguish all four phases and arrive only after the final DOM commit', async () => {
  const f = fixture();
  f.turns[0].currentTime = 1000;
  f.motion.setDestination(2);
  await f.finish();
  assert.equal(f.arrivals, 0);
  f.motion.committed(1);
  await f.finish();
  assert.equal(f.wheel.style.transform, 'rotate(-360deg)');
  assert.equal(f.arrivals, 0);
  f.motion.committed(2);
  assert.equal(f.arrivals, 1);
  assert.equal(f.labels.at(-1), 2, 'one full visual rotation reaches autumn, not spring');
  f.motion.setDestination(2);
  f.motion.committed(2);
  f.motion.advance();
  assert.equal(f.arrivals, 1);
  f.motion.setDestination(0);
  for (const step of [3, 4]) { await f.finish(); f.motion.committed(step); }
  assert.equal(f.wheel.style.transform, 'rotate(-720deg)');
  assert.equal(f.arrivals, 2);
  f.motion.setDestination(null);
  assert.equal(f.turns.at(-1).options.duration, 4000);
  f.motion.dispose();
});

test('retargeting preserves the current pose and ignores a canceled completion', async () => {
  const f = fixture();
  f.motion.setDestination(3);
  const stale = f.turns.at(-1);
  stale.currentTime = 160;
  f.motion.setDestination(1);
  assert.equal(f.turns.at(-1).keyframes[0].transform, 'rotate(-90deg)');
  stale.finish();
  await Promise.resolve();
  assert.deepEqual(f.steps, []);
  assert.equal(f.arrivals, 0);
  await f.finish();
  f.motion.committed(1);
  assert.equal(f.arrivals, 1);
  f.motion.dispose();
});

for (const mode of ['reduced motion', 'missing WAAPI']) {
  test(`${mode} stays still automatically and commits requested scenes before snapping`, () => {
    const f = fixture({ reduced: mode === 'reduced motion', animate: mode !== 'missing WAAPI' });
    assert.equal(f.turns.length, 0);
    f.motion.advance();
    assert.deepEqual(f.steps, [1]);
    assert.equal(f.wheel.style.transform, 'rotate(0deg)', 'snap waits for the requested art');
    f.motion.committed(1);
    assert.equal(f.wheel.style.transform, 'rotate(-180deg)');
    f.motion.setDestination(3);
    assert.equal(f.arrivals, 0);
    f.motion.committed(3);
    assert.equal(f.wheel.style.transform, 'rotate(-540deg)');
    assert.equal(f.arrivals, 1);
    assert.equal(f.turns.length, 0);
    f.motion.dispose();
  });
}

test('enabling reduced motion during a glide honors its requested season', () => {
  const f = fixture();
  f.motion.advance();
  f.motion.advance();
  f.motion.advance();
  f.turns.at(-1).currentTime = 80;
  f.reduce(true);
  assert.equal(f.steps.at(-1), 3);
  assert.equal(f.wheel.style.transform, 'rotate(-45deg)');
  f.motion.committed(3);
  assert.equal(f.wheel.style.transform, 'rotate(-540deg)');
  assert.equal(f.labels.at(-1), 3);
  const count = f.turns.length;
  f.reduce(false);
  assert.equal(f.turns.length, count + 1);
  assert.equal(endAngle(f.turns.at(-1)), -720);
  f.motion.dispose();
});

test('retarget while a reduced-motion snap commits rebases forward when motion resumes', async () => {
  const f = fixture({ reduced: true });
  f.motion.setDestination(3);
  f.motion.setDestination(1);
  f.reduce(false);
  f.motion.committed(3);
  assert.equal(endAngle(f.turns.at(-1)), -720);
  for (const step of [4, 5]) { await f.finish(); f.motion.committed(step); }
  assert.equal(f.labels.at(-1), 1);
  assert.equal(f.arrivals, 1);
  f.motion.dispose();
});

test('visibility pauses the exact pose and disposal removes timers, listeners and callbacks', async () => {
  const f = fixture();
  f.turns[0].currentTime = 1000;
  f.hide(true);
  assert.equal(f.wheel.style.transform, 'rotate(-45deg)');
  assert.equal(f.timers.size, 0);
  assert.equal(f.turns.length, 1);
  f.hide(false);
  assert.equal(f.turns.at(-1).keyframes[0].transform, 'rotate(-45deg)');
  assert.equal(f.turns.at(-1).options.duration, 3000);
  const stale = f.turns.at(-1);
  f.motion.dispose();
  f.motion.dispose();
  stale.finish();
  await Promise.resolve();
  f.motion.advance();
  f.motion.setDestination(3);
  f.motion.committed(1);
  assert.deepEqual(f.steps, []);
  assert.equal(f.arrivals, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.mediaListeners.size, 0);
  assert.equal(f.visibilityListeners.size, 0);
});

test('input racing an already finished animation reconciles its boundary before another turn', async () => {
  const f = fixture();
  f.turns[0].finish();
  f.motion.advance();
  assert.deepEqual(f.steps, [1]);
  assert.equal(f.turns.length, 1);
  await Promise.resolve();
  assert.deepEqual(f.steps, [1], 'the obsolete promise must not request a second commit');
  f.motion.committed(1);
  assert.equal(endAngle(f.turns.at(-1)), -360);
  f.motion.dispose();
});

test('clockwise travel moves the top scenery left while seasons continue forward', async () => {
  const f = fixture();
  assert.equal(f.wheel.style.transform, 'rotate(0deg)');
  const turn = f.turns[0];
  const angleAfter100ms = endAngle(turn) * 100 / turn.options.duration * Math.PI / 180;
  // CSS coordinates point downward: rotating the top point (0, -1) gives x=sin(angle).
  const topPointX = Math.sin(angleAfter100ms);
  assert.ok(topPointX < 0, 'the ground must move right-to-left beneath the TV');
  const visited = [f.labels.at(-1)];
  for (const step of [1, 2, 3]) {
    await f.finish();
    f.motion.committed(step);
    visited.push(f.labels.at(-1));
  }
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  assert.deepEqual(visited.map((index) => seasons[index]), seasons);
  f.motion.dispose();
});
