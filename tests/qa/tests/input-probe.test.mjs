import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGameModules } from '../../helpers/compile-game-modules.mjs';
import { createInputProbe } from '../preview/input-probe.mjs';

const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'community-seasons-input-probe-'));
test.after(() => fs.rmSync(compiled, { recursive: true, force: true }));
const compiledURL = pathToFileURL(compiled + path.sep);
compileGameModules(compiledURL, { entries: ['engine', 'store'] });
const { createRun, act, update, jumpHeight } = await import(new URL('engine.mjs', compiledURL));
const { createProgress, activatePermanentSkill } = await import(new URL('store.mjs', compiledURL));
const { skillDefinition } = await import(new URL('boosts.mjs', compiledURL));

function fixture(chargeCoins = skillDefinition('shield').chargeCoins) {
  let run = createRun(4182);
  Object.assign(run, { mode: 'running', permanentSkill: 'shield' });
  const progress = createProgress();
  progress.skills.shield.unlocked = true;
  const availability = { storeOpen: false, setupOpen: false, shieldUnlocked: true };
  const probe = createInputProbe();
  const detach = probe.attach(() => run, () => availability, jumpHeight, chargeCoins);
  return { probe, inputs: probe.inputs, run, progress, availability, detach, replace(next) { run = next; } };
}

test('input snapshots observe real engine outcomes without returning writable state or saves', () => {
  const f = fixture();
  f.inputs.prepare();
  assert.equal(act(f.run, 'left'), true);
  update(f.run, .1, f.progress.levels);
  assert.equal(f.inputs.snapshot().lane, -1);
  assert.ok(f.inputs.snapshot().x < 0);
  assert.equal(act(f.run, 'jump'), true);
  update(f.run, .1, f.progress.levels);
  const jumping = f.inputs.snapshot();
  assert.ok(jumping.jump > 0 && jumping.height > 0);
  assert.equal(jumping.height, jumpHeight(f.run));
  assert.equal(act(f.run, 'slide'), true);
  const sliding = f.inputs.snapshot();
  assert.equal(sliding.jump, 0);
  assert.equal(sliding.height, 0);
  assert.ok(sliding.slide > 0);
  sliding.lane = 1;
  sliding.shield = 42;
  assert.equal(f.inputs.snapshot().lane, -1);
  assert.equal(f.inputs.snapshot().shield, 0);
  assert.deepEqual(Object.keys(sliding).sort(), [
    'mode', 'lane', 'x', 'jump', 'slide', 'height', 'distance', 'permanentSkill',
    'skillCharge', 'skillChargeRequired', 'skillRechargeLocked', 'shield', 'shieldTime',
  ].sort());
  assert.ok(Object.isFrozen(f.inputs));
  assert.deepEqual(Object.keys(f.inputs).sort(), ['course', 'prepare', 'snapshot']);
});

test('course observations follow the current run without sharing writable engine state or saves', () => {
  const f = fixture();
  f.run.fork = { at: 100, blockedDirection: -1 };
  f.run.obstacles = [
    { id: 1, kind: 'block', lane: 0, at: 10, resolved: false },
    { id: 2, kind: 'arch', lane: 1, at: 10000, resolved: false },
  ];
  const before = structuredClone(f.run), saved = structuredClone(f.progress);
  const course = f.inputs.course();
  assert.equal(course.obstacles.length, 1);
  assert.equal(course.time, f.run.time);
  assert.equal(course.speed, f.run.speed);
  course.fork.at = 0;
  course.obstacles[0].at = 0;
  course.boosts.shield = 100;
  course.distance = 10000;
  assert.deepEqual(f.run, before);
  assert.deepEqual(f.progress, saved);
  assert.equal('wallet' in course, false);
  assert.equal('railQuestionDeck' in course, false);
  const replacement = createRun(23);
  replacement.distance = 12;
  f.replace(replacement);
  assert.equal(f.inputs.course().distance, 12);
  f.detach();
  assert.throws(() => f.inputs.course(), /not attached/);
});

test('fixed preparation enables real skill activation and preserves course, clocks and progress', () => {
  const f = fixture();
  Object.assign(f.run, { distance: 7, time: .4, lane: 1, x: 1.2, jump: .3, slide: .2 });
  f.run.boosts.shield = 1;
  f.run.boosts.shieldTime = 9;
  f.run.skillRechargeLocked = true;
  const before = structuredClone(f.run), saved = structuredClone(f.progress);
  const baseline = f.inputs.prepare({ distance: 99999, seed: 0 });
  assert.equal(baseline.skillCharge, skillDefinition('shield').chargeCoins);
  assert.equal(baseline.skillChargeRequired, skillDefinition('shield').chargeCoins);
  assert.equal(baseline.shield, 0);
  assert.equal(baseline.shieldTime, 0);
  assert.equal(baseline.skillRechargeLocked, false);
  assert.deepEqual([baseline.lane, baseline.x, baseline.jump, baseline.slide, baseline.height], [0, 0, 0, 0, 0]);
  const untouched = value => {
    const { lane, x, jump, slide, skillCharge, skillRechargeLocked, boosts, ...rest } = value;
    const { shield, shieldTime, ...otherBoosts } = boosts;
    return { ...rest, boosts: otherBoosts };
  };
  assert.deepEqual(untouched(f.run), untouched(before), 'Preparing inputs cannot alter the course or its clocks');
  assert.deepEqual(f.progress, saved, 'Preparing inputs cannot unlock skills or alter progress');
  assert.equal(activatePermanentSkill(f.run, f.progress, 'shield').ok, true);
  const activated = f.inputs.snapshot();
  assert.equal(activated.skillCharge, 0);
  assert.equal(activated.skillRechargeLocked, true);
  assert.equal(activated.shield, 1);
  assert.ok(activated.shieldTime > 0);
});

test('the reported charge requirement follows the game definition independently of current charge', () => {
  for (const chargeCoins of [75, 150]) {
    const f = fixture(chargeCoins);
    const baseline = f.inputs.prepare();
    assert.equal(baseline.skillCharge, chargeCoins);
    assert.equal(baseline.skillChargeRequired, chargeCoins);
    baseline.skillChargeRequired = 1;
    for (const charge of [chargeCoins - 1, 0]) {
      f.run.skillCharge = charge;
      assert.equal(f.inputs.snapshot().skillCharge, charge);
      assert.equal(f.inputs.snapshot().skillChargeRequired, chargeCoins);
    }
  }
});

test('preparation refuses unavailable gameplay and never repairs failed prerequisites', () => {
  const cases = [
    f => { f.run.mode = 'paused'; },
    f => { f.run.review = { id: 1 }; },
    f => { f.run.rail = {}; },
    f => { f.run.sceneTransition = 1; },
    f => { f.run.turnRemaining = 1; },
    f => { f.run.railReturnRemaining = 1; },
    f => { f.availability.storeOpen = true; },
    f => { f.availability.setupOpen = true; },
    f => { f.availability.shieldUnlocked = false; },
    f => { f.run.permanentSkill = null; },
  ];
  for (const arrange of cases) {
    const f = fixture();
    arrange(f);
    const before = structuredClone(f.run);
    assert.throws(() => f.inputs.prepare(), /active, unobstructed run/);
    assert.deepEqual(f.run, before);
  }
});

test('the observer follows replacement runs and detaches safely across remounts', () => {
  const f = fixture();
  const next = createRun(9001);
  next.lane = 1;
  f.replace(next);
  assert.equal(f.inputs.snapshot().lane, 1, 'Run replacement must not leave a stale captured object');
  f.detach();
  assert.throws(() => f.inputs.snapshot(), /not attached/);
  assert.throws(() => f.inputs.prepare(), /not attached/);
  const oldDetach = f.probe.attach(() => f.run, () => f.availability, jumpHeight, 100);
  const newDetach = f.probe.attach(() => next, () => f.availability, jumpHeight, 100);
  oldDetach();
  assert.equal(f.inputs.snapshot().lane, 1, 'An old lifecycle cannot detach its replacement');
  newDetach();
  assert.throws(() => f.inputs.snapshot(), /not attached/);
});
