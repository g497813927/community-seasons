import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";

const {
  createRun, currentRailQuestion, selectRailLane, submitRailAnswer, togglePause,
  update, RAIL_RETURN_DURATION,
} = await import("../helpers/compiled/engine.mjs");
const { createRailRide, beginRailQuestion } = await import("../helpers/compiled/railway.mjs");
const { createProgress, bankRunRewards } = await import("../helpers/compiled/store.mjs");
const { railExitGateway } = await import("../helpers/compiled/render/railway.mjs");

function questionState(random = () => 0.5) {
  const state = Object.assign(createRun(4182), {
    mode: "running", time: 100, distance: 1200, coins: 7, score: 12350,
    nextRow: Infinity, nextPortalAt: Infinity, nextForkAt: Infinity, nextRailAt: Infinity,
  });
  state.rail = createRailRide(random, state.railQuestionDeck);
  Object.assign(state.rail, { entryNormalSpeed: 12, speed: 12 });
  beginRailQuestion(state.rail, random);
  return state;
}

function correctLane(state) {
  return state.rail.optionOrder.indexOf(currentRailQuestion(state).correctIndex) - 1;
}

function advance(state, seconds) {
  while (seconds > 1e-8) {
    const dt = Math.min(0.05, seconds);
    update(state, dt);
    seconds -= dt;
  }
}

test("early submission immediately judges the selected lane without granting unused travel or rewards", () => {
  const state = questionState();
  const lane = correctLane(state);
  selectRailLane(state, lane);
  state.x = lane === -1 ? 1.65 : -1.65;
  Object.assign(state.boosts, { shield: 12, rush: 8, double: 9 });
  Object.assign(state, { chase: 4, skillCharge: 65 });
  const before = structuredClone(state);

  assert.ok(state.rail.remaining > 11, "submit well before the extended reading deadline");
  assert.equal(submitRailAnswer(state), true);
  assert.equal(state.rail.phase, "feedback");
  assert.equal(state.rail.answerLane, lane, "use the selected lane even while the cart animates toward it");
  assert.equal(state.rail.correct, true);
  assert.equal(state.rail.correctCount, 1);
  assert.equal(state.rail.remaining, 1.6);
  assert.equal(state.rail.reward, 0);
  assert.equal(state.rail.elapsed, before.rail.elapsed);
  assert.deepEqual(state.rail.questions, before.rail.questions);
  assert.deepEqual(state.rail.questionDeck, before.rail.questionDeck, "the next question is not consumed early");
  assert.deepEqual({ ...state, rail: null }, { ...before, rail: null },
    "submitting must not change distance, score, coins, boost timers, motion, run time or saved rewards");
});

test("early and deadline submissions judge every lane identically across answer shuffles", () => {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const order of orders) for (const lane of [-1, 0, 1]) {
    const early = questionState();
    early.rail.optionOrder = order;
    selectRailLane(early, lane);
    early.boosts.shield = 12;
    early.boosts.rush = 8;
    const deadline = structuredClone(early);
    deadline.rail.remaining = 1 / 120;

    assert.equal(submitRailAnswer(early), true);
    update(deadline, 1 / 120);
    assert.deepEqual({ ...early.rail, elapsed: 0 }, { ...deadline.rail, elapsed: 0 });
    const correct = order[lane + 1] === currentRailQuestion(early).correctIndex;
    assert.equal(early.rail.phase, correct ? "feedback" : "falling");
    assert.equal(early.rail.correctCount, correct ? 1 : 0);
    if (!correct) assert.deepEqual(early.rail.failure, {
      questionId: currentRailQuestion(early).id,
      optionIndex: order[lane + 1],
      correctIndex: currentRailQuestion(early).correctIndex,
    });
  }
});

test("submission is inert while paused, outside questions, and during other blocking states", () => {
  const cases = [
    ...["ready", "paused", "over"].map(mode => state => { state.mode = mode; }),
    ...["boarding", "feedback", "falling", "complete"].map(phase => state => { state.rail.phase = phase; }),
    state => { state.rail = null; },
    state => { state.review = { id: 1, kind: "pillar", shielded: false }; },
    ...["sceneTransition", "turnRemaining", "railReturnRemaining"].map(timer => state => { state[timer] = 0.5; }),
    state => { state.lane = 2; },
  ];
  for (const setup of cases) {
    const state = questionState();
    setup(state);
    const before = structuredClone(state);
    assert.equal(submitRailAnswer(state), false);
    assert.deepEqual(state, before);
  }

  const state = questionState();
  selectRailLane(state, correctLane(state));
  togglePause(state);
  const paused = structuredClone(state);
  advance(state, 30);
  assert.equal(submitRailAnswer(state), false);
  assert.deepEqual(state, paused);
  togglePause(state);
  assert.equal(submitRailAnswer(state), true, "resume restores the same question's submit action");
});

test("repeat submissions cannot change an answer, skip feedback, or count it twice", () => {
  for (const chooseCorrect of [true, false]) {
    const state = questionState();
    const lane = correctLane(state);
    selectRailLane(state, chooseCorrect ? lane : lane === -1 ? 0 : -1);
    assert.equal(submitRailAnswer(state), true);
    const answered = structuredClone(state);
    for (let repeat = 0; repeat < 5; repeat++) {
      assert.equal(selectRailLane(state, -state.lane), false);
      assert.equal(submitRailAnswer(state), false);
    }
    assert.deepEqual(state, answered);
  }
});

test("an early wrong answer still falls, ends the run and explains the chosen answer", () => {
  const state = questionState();
  const question = currentRailQuestion(state);
  const wrongLane = correctLane(state) === -1 ? 0 : -1;
  selectRailLane(state, wrongLane);
  const optionIndex = state.rail.optionOrder[wrongLane + 1];
  const coins = state.coins;
  assert.equal(submitRailAnswer(state), true);
  assert.equal(state.mode, "running");
  advance(state, 1.15);
  assert.equal(state.mode, "running");
  advance(state, 0.05);
  assert.equal(state.mode, "over");
  assert.equal(state.coins, coins);
  assert.equal(state.rail.correctCount, 0);
  assert.equal(state.rail.reward, 0);
  assert.ok(state.reason.includes(question.options[optionIndex].why.en));
  assert.ok(state.reason.includes(question.options[question.correctIndex].label.en));
  const ended = structuredClone(state);
  assert.equal(submitRailAnswer(state), false);
  advance(state, 10);
  assert.deepEqual(state, ended);
});

test("early answers still require every ride question and award the progression reward once", () => {
  for (const count of [3, 4]) for (const entryNormalSpeed of [12, 66]) {
    const state = questionState(() => count === 3 ? 0.25 : 0.75);
    state.rail.entryNormalSpeed = entryNormalSpeed;
    const coins = state.coins;
    assert.equal(state.rail.questions.length, count);
    for (let index = 0; index < count; index++) {
      assert.equal(state.rail.phase, "question");
      assert.equal(state.rail.index, index);
      selectRailLane(state, correctLane(state));
      assert.equal(submitRailAnswer(state), true);
      assert.equal(state.rail.correctCount, index + 1);
      assert.equal(state.coins, coins);
      assert.equal(submitRailAnswer(state), false);
      advance(state, state.rail.remaining);
    }
    assert.equal(state.rail.phase, "complete");
    const expected = Math.ceil((30 + count * 5) * (1 + (entryNormalSpeed / 12 - 1) * 0.3));
    assert.equal(state.rail.reward, expected);
    assert.equal(state.coins, coins);
    advance(state, state.rail.remaining);
    assert.equal(state.rail, null);
    assert.equal(state.railReturnRemaining, RAIL_RETURN_DURATION);
    assert.equal(state.coins, coins + expected);
    assert.equal(submitRailAnswer(state), false);
    const progress = bankRunRewards(state, createProgress());
    assert.equal(progress.wallet, coins + expected);
    assert.equal(bankRunRewards(state, progress), progress);
    advance(state, RAIL_RETURN_DURATION);
    assert.equal(state.coins, coins + expected);
    assert.equal(state.mode, "running");
  }
});

test("an early final answer keeps the same exit gate throughout feedback and completion", () => {
  for (const speed of [12, 20, 30]) {
    const state = questionState();
    state.rail.index = state.rail.questions.length - 1;
    beginRailQuestion(state.rail, () => 0.5);
    state.rail.speed = speed;
    selectRailLane(state, correctLane(state));
    assert.equal(submitRailAnswer(state), true);
    let gateZ;
    const renderer = { renderLocale: "en", railGateway(z) { gateZ = z; } };
    railExitGateway(renderer, state);
    const gateAt = state.distance + gateZ;
    const phases = new Set();
    for (let frame = 0; frame < 72; frame++) {
      phases.add(state.rail.phase);
      railExitGateway(renderer, state);
      assert.ok(Math.abs(state.distance + gateZ - gateAt) < 1e-7,
        "the exit gate must not move in world space when the phase changes");
      advance(state, 0.05);
    }
    assert.deepEqual([...phases], ["feedback", "complete"]);
    assert.equal(state.rail, null);
  }
});
