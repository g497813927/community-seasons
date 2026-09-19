import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGameModules } from '../../helpers/compile-game-modules.mjs';
import { createRailCompletionObserver } from '../outfit-matrix/rail-completion.mjs';
import { assertCompletedRailReward } from '../web/rail-reward.mjs';

const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'community-seasons-rail-reward-'));
test.after(() => fs.rmSync(compiled, { recursive: true, force: true }));
const compiledURL = pathToFileURL(compiled + path.sep);
compileGameModules(compiledURL, { entries: ['engine', 'store'] });
const { createRun, update, selectRailLane, submitRailAnswer } = await import(new URL('engine.mjs', compiledURL));
const { currentRailQuestion } = await import(new URL('railway.mjs', compiledURL));
const { createProgress } = await import(new URL('store.mjs', compiledURL));

function completedRide() {
  const run = createRun(4182, 'summer');
  Object.assign(run, {
    mode: 'running', time: 61, distance: 950, coins: 17,
    nextRow: 1e9, nextRelicAt: 1e9, nextForkAt: 1e9, nextRailAt: 950.5, nextPortalAt: 1e9,
  });
  const initialCoins = run.coins;
  const levels = createProgress().levels;
  const observer = createRailCompletionObserver();
  let oldHostReward = 0, completionFrames = 0, rideCount;
  let captured = null;
  for (let frame = 0; frame < 3600; frame++) {
    update(run, 1 / 60, levels);
    observer.observe(run);
    if (run.rail) rideCount ??= run.rail.questions.length;
    if (run.rail?.phase === 'question') {
      const question = currentRailQuestion(run);
      selectRailLane(run, run.rail.optionOrder.indexOf(question.correctIndex) - 1);
      assert.equal(submitRailAnswer(run), true);
    }
    if (run.rail?.phase === 'complete') {
      completionFrames++;
      captured ??= observer.snapshot();
      assert.equal(run.coins, initialCoins, 'the captured reward precedes the coin award');
      // Deliberately omit EVERY host poll during complete, reproducing the
      // recorded feedback-to-return gap while the browser observer keeps running.
      continue;
    }
    if (run.rail) oldHostReward = Math.max(oldHostReward, run.rail.reward);
    if (captured && !run.rail && run.railReturnRemaining === 0) {
      return { run, levels, observer, initialCoins, oldHostReward, completionFrames, captured, rideCount };
    }
  }
  assert.fail('The real engine did not complete its bounded train ride.');
}

test('a host polling gap over complete retains the real pre-award reward after the ride is discarded', () => {
  const result = completedRide();
  const { run, observer, initialCoins, rideCount, captured } = result;
  assert.ok(result.completionFrames >= 119, 'the host missed the entire two-second complete phase');
  assert.equal(result.oldHostReward, 0, 'the old polling-only assertion would fail this successful ride');
  assert.equal(run.rail, null);
  assert.deepEqual(observer.snapshot(), captured);
  assert.equal(captured.reward, rideCount === 3 ? 52 : 58, 'the 950m fixture has a known progression reward');
  assertCompletedRailReward({ coins: run.coins, initialCoins, railCompletion: observer.snapshot() }, rideCount);
  const returnedCoins = run.coins;
  for (let frame = 0; frame < 60; frame++) {
    update(run, 1 / 60, result.levels);
    observer.observe(run);
  }
  assert.equal(run.coins, returnedCoins, 'advancing after return cannot award the reward twice');
  assert.deepEqual(observer.snapshot(), captured);
});

test('the retained reward still rejects missing, duplicate, premature and unobserved awards', () => {
  const { run, observer, initialCoins, rideCount } = completedRide();
  const completion = observer.snapshot();
  const snapshot = { coins: run.coins, initialCoins, railCompletion: completion };
  for (const coins of [initialCoins, initialCoins + completion.reward * 2])
    assert.throws(() => assertCompletedRailReward({ ...snapshot, coins }, rideCount), /exactly once/);
  assert.throws(() => assertCompletedRailReward({ ...snapshot, railCompletion: null }, rideCount), /retain/);
  assert.throws(() => assertCompletedRailReward({ ...snapshot, railCompletion: { ...completion, reward: 0 } }, rideCount), /must award coins/);
  assert.throws(() => assertCompletedRailReward({ ...snapshot, railCompletion: { ...completion, coinsBeforeAward: run.coins } }, rideCount), /before completion/);
  assert.throws(() => assertCompletedRailReward({ ...snapshot, railCompletion: { ...completion, correctCount: rideCount - 1 } }, rideCount), /Every train question/);
});

test('completion evidence is copied and cleared before the next scenario', () => {
  const { observer, captured } = completedRide();
  const copy = observer.snapshot();
  copy.reward = 9999;
  assert.deepEqual(observer.snapshot(), captured);
  observer.reset();
  assert.equal(observer.snapshot(), null);
  observer.observe({ coins: 0, rail: null });
  observer.observe({ coins: 0, rail: { phase: 'feedback', reward: 0 } });
  assert.equal(observer.snapshot(), null, 'an incomplete next ride cannot reuse the previous reward');
});
