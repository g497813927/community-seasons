import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateQuestionBank, renderQuestionBank } from "../../src/scripts/question-bank.mjs";
import "./compile.mjs";

const { RAIL_QUESTIONS, createRailRide, beginRailQuestion, railQuestion } = await import("./compiled/railway.mjs");
const bank = JSON.parse(fs.readFileSync(new URL("../../src/lib/game/rail-questions.json", import.meta.url)));
test("the editable review bank is the actual game bank, with source metadata excluded", () => {
  validateQuestionBank(bank);
  assert.deepEqual(RAIL_QUESTIONS, bank.questions.map(({ source, ...question }) => question));
  assert.ok(RAIL_QUESTIONS.every(q => !("source" in q)));
  for (const q of bank.questions.filter(q => q.source)) assert.ok(!renderQuestionBank(bank).includes(q.source.url));
  for (const { source, ...question } of bank.questions) assert.deepEqual(railQuestion(question.id), question);
  const source = fs.readFileSync(new URL("../../src/lib/game/railway.ts", import.meta.url), "utf8");
  assert.ok(source.includes(renderQuestionBank(bank)));
});

test("edited questions round-trip through generation as data, including punctuation and redactions", () => {
  const revised = structuredClone(bank);
  revised.questions[0].prompt.en = 'Does “quote” mean agreement? Keep [redacted] context.';
  revised.questions[0].options[1].label.en = 'A literal ${value}, not executable text.';
  validateQuestionBank(revised);
  assert.ok(renderQuestionBank(revised).includes(JSON.stringify(revised.questions[0].prompt.en)));
  assert.ok(renderQuestionBank(revised).includes('${value}'));
});

for (const [name, edit] of [
  ["missing translation", b => { delete b.questions[0].prompt.zh; }],
  ["empty explanation", b => { b.questions[1].options[2].why.en = ""; }],
  ["duplicate id", b => { b.questions[1].id = b.questions[0].id; }],
  ["duplicate prompt", b => { b.questions[1].prompt.en = b.questions[0].prompt.en; }],
  ["duplicate option", b => { b.questions[0].options[1].label = { ...b.questions[0].options[0].label }; }],
  ["missing option", b => { b.questions[0].options.pop(); }],
  ["extra option", b => { b.questions[0].options.push(b.questions[0].options[0]); }],
  ["out-of-range answer", b => { b.questions[0].correctIndex = 3; }],
  ["fractional answer", b => { b.questions[0].correctIndex = 1.5; }],
  ["string answer", b => { b.questions[0].correctIndex = "1"; }],
  ["unknown field typo", b => { b.questions[0].correct_index = 0; }],
  ["overlong phone label", b => { b.questions[0].options[0].label.en = "x".repeat(73); }],
  ["too few questions", b => { b.questions = b.questions.slice(0, 3); }],
]) {
  test(`review validation rejects ${name} before building`, () => {
    const revised = structuredClone(bank);
    edit(revised);
    assert.throws(() => validateQuestionBank(revised));
  });
}

test("expanded bank keeps 3–4 unique questions per ride and randomized valid answer lanes", () => {
  const seen = new Set();
  const lengths = new Set();
  const lanes = new Set();
  let seed = 20260910;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 400; i++) {
    const ride = createRailRide(random);
    lengths.add(ride.questions.length);
    assert.ok(ride.questions.length === 3 || ride.questions.length === 4);
    assert.equal(new Set(ride.questions).size, ride.questions.length);
    for (const id of ride.questions) {
      seen.add(id);
      beginRailQuestion(ride, random);
      const q = railQuestion(id);
      assert.ok(q);
      assert.deepEqual([...ride.optionOrder].sort(), [0, 1, 2]);
      lanes.add(ride.optionOrder.indexOf(q.correctIndex) - 1);
    }
  }
  assert.equal(seen.size, bank.questions.length);
  assert.deepEqual([...lengths].sort(), [3, 4]);
  assert.deepEqual([...lanes].sort(), [-1, 0, 1]);
});
