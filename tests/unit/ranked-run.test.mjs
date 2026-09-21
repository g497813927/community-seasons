import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";

const {
  createRun, update, togglePause, finishReview, activateBoost, startSceneTravel,
  selectRailLane, submitRailAnswer, currentRailQuestion,
} = await import("../helpers/compiled/engine.mjs");
const { beginRankedRun, getRankedRunReceipt, isRankedRunReceipt } =
  await import("../helpers/compiled/ranked-run.mjs");

function fixture(t, enroll = true) {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const run = createRun(4182);
  run.mode = "running";
  if (enroll) assert.equal(beginRankedRun(run), true);
  return {
    run,
    tick(seconds = 0.1, wallSeconds = seconds) {
      now += wallSeconds * 1000;
      update(run, seconds);
    },
  };
}

function finish({ run, tick }) {
  for (let frame = 0; frame < 1500 && run.mode !== "over"; frame++) {
    if (run.review) finishReview(run);
    tick();
  }
  assert.equal(run.mode, "over", "fixture must end through a real engine collision or fork");
}

test("a fresh completed run produces an immutable receipt, never a mutable saved best", (t) => {
  const f = fixture(t);
  assert.equal(getRankedRunReceipt(f.run), null);
  assert.equal(beginRankedRun(f.run), false, "restarting tracking cannot erase prior evidence");
  finish(f);
  const receipt = getRankedRunReceipt(f.run);
  assert.ok(receipt);
  assert.equal(receipt.score, f.run.score);
  assert.equal(receipt.score, Math.floor(receipt.distance * 10) + receipt.coins * 50);
  assert.ok(receipt.durationMs > 0);
  assert.ok(Object.isFrozen(receipt));
  assert.equal(isRankedRunReceipt(receipt), true);
  assert.equal(isRankedRunReceipt({ ...receipt }), false);
  assert.equal(isRankedRunReceipt({ score: 999999999 }), false);
  assert.equal(isRankedRunReceipt(null), false);
  assert.equal(getRankedRunReceipt(structuredClone(f.run)), null);
  f.tick();
  assert.equal(getRankedRunReceipt(f.run), receipt, "finished frames do not create new receipts");
});

test("home previews, resumed runs, and a manually set game-over cannot become ranked results", (t) => {
  const f = fixture(t, false);
  f.tick();
  assert.equal(beginRankedRun(f.run), false);
  finish(f);
  assert.equal(getRankedRunReceipt(f.run), null);
  const fresh = createRun();
  assert.equal(beginRankedRun(fresh), false, "ready-mode attract scenes are not a real Start");
  fresh.mode = "running";
  assert.equal(beginRankedRun(fresh), true);
  fresh.mode = "over";
  assert.equal(getRankedRunReceipt(fresh), null);
  update(fresh, 0);
  assert.equal(getRankedRunReceipt(fresh), null);
});

for (const field of ["score", "distance", "coins", "time"]) {
  test(`editing ${field} permanently disqualifies the run even if subsequently restored`, (t) => {
    const f = fixture(t);
    f.tick();
    const original = f.run[field];
    f.run[field] += 1000000;
    update(f.run, 0);
    f.run[field] = original;
    assert.equal(beginRankedRun(f.run), false);
    finish(f);
    assert.equal(getRankedRunReceipt(f.run), null);
  });
}

test("calling the simulation faster than wall time cannot accumulate a ranked score", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 20; i++) f.tick(0.1, 0);
  finish(f);
  assert.equal(getRankedRunReceipt(f.run), null);
});

test("time spent paused cannot be banked to fast-forward the simulation", (t) => {
  const f = fixture(t);
  f.tick();
  togglePause(f.run);
  f.tick(0.1, 300);
  togglePause(f.run);
  for (let i = 0; i < 20; i++) f.tick(0.1, 0);
  finish(f);
  assert.equal(getRankedRunReceipt(f.run), null);
});

test("ordinary pauses, slow frames, transitions and doubled coins remain eligible", (t) => {
  const f = fixture(t);
  assert.equal(activateBoost(f.run, "headstart", 3), true);
  assert.equal(activateBoost(f.run, "doubleCoins", 3), true);
  f.tick(0.25, 6); // A host delay still simulates only the engine's bounded frame.
  togglePause(f.run);
  const before = [f.run.time, f.run.distance, f.run.coins, f.run.score];
  f.tick(0.25, 600);
  assert.deepEqual([f.run.time, f.run.distance, f.run.coins, f.run.score], before);
  togglePause(f.run);
  assert.equal(startSceneTravel(f.run, "summer"), true);
  for (let frame = 0; frame < 22; frame++) f.tick();
  assert.equal(f.run.scene, "summer");
  finish(f);
  const receipt = getRankedRunReceipt(f.run);
  assert.ok(receipt);
  assert.equal(receipt.score, f.run.score);
  assert.ok(receipt.durationMs > f.run.time * 1000 + 1900, "travel counts even while running clock freezes");
  assert.ok(receipt.durationMs < 150000, "paused wall time earns no simulated duration");
});

test("a full natural railway ride, early answers and its one-time reward remain eligible", (t) => {
  const f = fixture(t);
  let boarded = false;
  let rewarded = false;
  let preRewardCoins = 0;
  let reward = 0;
  for (let frame = 0; frame < 2500 && !rewarded; frame++) {
    if (f.run.review) finishReview(f.run);
    assert.notEqual(f.run.mode, "over");
    if (f.run.rail) {
      boarded = true;
      if (f.run.rail.phase === "question") {
        const correct = currentRailQuestion(f.run).correctIndex;
        selectRailLane(f.run, f.run.rail.optionOrder.indexOf(correct) - 1);
        assert.equal(submitRailAnswer(f.run), true);
      }
      if (f.run.rail.phase === "complete") {
        preRewardCoins = f.run.coins;
        reward = f.run.rail.reward;
      }
    } else if (!boarded && f.run.boosts.rush < 0.2) {
      // Exercise legal boost effects while steering through the generated course.
      activateBoost(f.run, "rush", 3);
    }
    f.tick();
    rewarded = boarded && !f.run.rail;
  }
  assert.equal(rewarded, true);
  assert.ok(reward >= 45 && reward <= 118);
  assert.equal(f.run.coins, preRewardCoins + reward);
  assert.ok(f.run.railReturnRemaining > 0);
  finish(f);
  const receipt = getRankedRunReceipt(f.run);
  assert.ok(receipt, "the railway must not be mistaken for accelerated time or injected rewards");
  assert.equal(receipt.score, f.run.score);
  assert.equal(receipt.coins, f.run.coins);
});
