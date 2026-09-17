import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";

const { RAIL_QUESTIONS, railQuestionDuration, createRailRide, beginRailQuestion } =
  await import("../helpers/compiled/railway.mjs");
const { createRun, update, selectRailLane, currentRailQuestion, togglePause } =
  await import("../helpers/compiled/engine.mjs");

function emptyQuestion() {
  const question = structuredClone(RAIL_QUESTIONS[0]);
  question.prompt = { en: "", zh: "" };
  for (const option of question.options) option.label = { en: "", zh: "" };
  return question;
}

test("even short questions reserve reading and lane-selection time", () => {
  const question = emptyQuestion();
  question.prompt = { en: "Choose a kind reply.", zh: "请选择友善的回复。" };
  assert.equal(railQuestionDuration(question), 12);
});

test("each prompt and answer label adds proportional time in either language", () => {
  for (const [locale, character, rate] of [["en", "a", 15], ["zh", "字", 5]]) {
    const question = emptyQuestion();
    question.prompt[locale] = character.repeat(rate * 10);
    assert.equal(railQuestionDuration(question), 14, "ten seconds to read plus four to choose");
    for (const copy of [question.prompt, ...question.options.map(option => option.label)]) {
      const before = railQuestionDuration(question);
      copy[locale] += character.repeat(rate * 3);
      assert.equal(railQuestionDuration(question), before + 3);
    }
    question.prompt[locale] += character;
    assert.equal(railQuestionDuration(question), 27, "partial seconds round up");
  }
});

test("the larger bilingual budget wins; hidden explanations and whitespace add no time", () => {
  const question = emptyQuestion();
  question.prompt = { en: "a".repeat(150), zh: "字".repeat(100) };
  assert.equal(railQuestionDuration(question), 24);
  question.prompt.en = "a".repeat(450);
  assert.equal(railQuestionDuration(question), 34, "longer content is not cut off by an upper cap");
  for (const copy of [question.prompt, ...question.options.map(option => option.label)]) {
    copy.en = ` \n\t${copy.en} `;
    copy.zh = `　\n${copy.zh}　`;
  }
  for (const option of question.options) option.why = { en: "explanation".repeat(100), zh: "解析".repeat(100) };
  assert.equal(railQuestionDuration(question), 34);
  question.prompt = { en: "", zh: "𠀀".repeat(100) };
  assert.equal(railQuestionDuration(question), 24, "count Unicode characters once, including surrogate pairs");
});

test("every bank question gets the same content-based deadline across answer shuffles and retries", () => {
  const durations = new Set();
  for (const question of RAIL_QUESTIONS) {
    const expected = railQuestionDuration(question);
    assert.ok(expected > 11, `${question.id} needs more than the old reading window`);
    durations.add(expected);
    for (const random of [() => 0, () => 0.5, () => 0.999999]) {
      const ride = createRailRide(random);
      ride.questions = [question.id];
      beginRailQuestion(ride, random);
      assert.equal(ride.duration, expected);
      assert.equal(ride.remaining, expected);
      assert.deepEqual([...ride.optionOrder].sort(), [0, 1, 2]);
    }
  }
  assert.ok(durations.size > 1, "questions of different lengths must have different deadlines");
});

test("missing question IDs report their ride index before consuming deck entries or randomness", () => {
  for (const index of [0, 1]) {
    const ride = createRailRide(() => 0.5);
    ride.questions = ["removed-question"];
    ride.index = index;
    ride.questionDeck.remaining.unshift("removed-question");
    const before = structuredClone(ride);
    let randomCalls = 0;
    assert.throws(() => beginRailQuestion(ride, () => { randomCalls++; return 0.5; }), {
      name: "Error",
      message: `Cannot begin rail question at index ${index}: unknown question ID ${index === 0 ? '"removed-question"' : 'undefined'}.`,
    });
    assert.deepEqual(ride, before, "a missing card must not consume history or partially enter question phase");
    assert.equal(randomCalls, 0);
  }
});

function advance(state, seconds) {
  while (seconds > 1e-8) {
    const step = Math.min(0.05, seconds);
    update(state, step);
    seconds -= step;
  }
}

test("the engine allows reading past eleven seconds, freezes on pause, and judges at each extended deadline", () => {
  const longest = [...RAIL_QUESTIONS].sort((a, b) => railQuestionDuration(b) - railQuestionDuration(a))[0];
  const state = Object.assign(createRun(4182), { mode: "running", time: 100, distance: 1200 });
  state.rail = createRailRide(() => 0.5);
  state.rail.questions = [longest.id, RAIL_QUESTIONS[0].id];
  advance(state, state.rail.remaining);
  for (const id of state.rail.questions) {
    const ride = state.rail;
    assert.equal(ride.phase, "question");
    assert.equal(currentRailQuestion(state).id, id);
    assert.equal(ride.remaining, railQuestionDuration(currentRailQuestion(state)));
    advance(state, 11);
    assert.equal(ride.phase, "question", "the old deadline must no longer judge the answer");
    togglePause(state);
    const paused = structuredClone(state);
    advance(state, 30);
    assert.deepEqual(state, paused);
    togglePause(state);
    selectRailLane(state, ride.optionOrder.indexOf(currentRailQuestion(state).correctIndex) - 1);
    advance(state, ride.remaining - 0.05);
    assert.equal(ride.phase, "question");
    advance(state, 0.05);
    assert.equal(ride.phase, "feedback");
    assert.equal(ride.correct, true);
    advance(state, ride.remaining);
  }
  assert.equal(state.rail.phase, "complete");
});
