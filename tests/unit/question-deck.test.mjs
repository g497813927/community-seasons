import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../../src/node_modules/typescript/lib/typescript.js';
import '../helpers/compile.mjs';

const { RAIL_QUESTIONS, railQuestion, railQuestionDuration, createRailQuestionDeck, createRailRide, beginRailQuestion } =
  await import('../helpers/compiled/railway.mjs');
const { createRun, update, selectRailLane, currentRailQuestion, togglePause, advancePreview } =
  await import('../helpers/compiled/engine.mjs');
const ids = RAIL_QUESTIONS.map(q => q.id);
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function showRide(ride, random, shown) {
  assert.ok([3, 4].includes(ride.questions.length));
  assert.equal(new Set(ride.questions).size, ride.questions.length, 'a ride must not contain duplicate questions');
  for (let index = 0; index < ride.questions.length; index++) {
    ride.index = index;
    beginRailQuestion(ride, random);
    const id = ride.questions[index];
    assert.ok(!shown.slice(-8).includes(id), `question ${id} repeated among the previous eight`);
    shown.push(id);
    assert.deepEqual([...ride.optionOrder].sort(), [0, 1, 2]);
    assert.equal(ride.duration, railQuestionDuration(railQuestion(id)));
  }
}

for (const [name, makeRandom] of [
  ['constant zero', () => () => 0],
  ['constant half', () => () => .5],
  ['constant below one', () => () => .999999999],
  ['seeded variable', () => rng(3231321585)],
]) {
  test(`${name}: each presented cycle exhausts the bank and refills without recent repeats`, () => {
    const random = makeRandom(), deck = createRailQuestionDeck(), shown = [];
    for (let rideNumber = 0; rideNumber < 90; rideNumber++) {
      const ride = createRailRide(random, deck);
      assert.strictEqual(ride.questionDeck, deck);
      showRide(ride, random, shown);
      assert.ok(deck.recent.length <= 8, 'recent history remains bounded');
      assert.ok(deck.remaining.length <= ids.length + 3, 'only one refill may be reserved ahead');
    }
    for (let start = 0; start + ids.length <= shown.length; start += ids.length) {
      const cycle = shown.slice(start, start + ids.length);
      assert.equal(new Set(cycle).size, ids.length, `repeated question in cycle at ${start}`);
      assert.deepEqual([...cycle].sort(), [...ids].sort(), 'no leftover question is discarded at refill');
    }
  });
}

test('one to three leftover questions stay first and safely cross into the next shuffled cycle', () => {
  for (const left of [1, 2, 3]) for (const value of [0, .5, .999999999]) {
    const tail = ids.slice(-left);
    const recent = ids.slice(-(left + 8), -left);
    const deck = { remaining: [...tail], recent: [...recent] };
    const ride = createRailRide(() => value, deck);
    assert.deepEqual(ride.questions.slice(0, left), tail);
    assert.equal(new Set(ride.questions).size, ride.questions.length);
    assert.deepEqual(deck.remaining.slice(left).slice().sort(), [...ids].sort(), 'refill retains every card exactly once');
    const shown = [...recent];
    showRide(ride, () => value, shown);
  }
});

test('boarding and abandoned questions are not consumed; only actually presented questions advance the deck', () => {
  const random = rng(42), deck = createRailQuestionDeck();
  const abandoned = createRailRide(random, deck);
  const prepared = structuredClone(deck);
  const retryBeforeQuestion = createRailRide(random, deck);
  assert.deepEqual(deck, prepared, 'retrying during boarding must not consume or reshuffle reserved cards');
  assert.equal(retryBeforeQuestion.questions[0], abandoned.questions[0]);
  beginRailQuestion(retryBeforeQuestion, random);
  const first = retryBeforeQuestion.questions[0];
  const afterFirst = structuredClone(deck);
  beginRailQuestion(retryBeforeQuestion, random);
  assert.deepEqual(deck, afterFirst, 'reentering an already displayed question must not consume the next card');
  const secondRetry = createRailRide(random, deck);
  assert.equal(secondRetry.questions[0], retryBeforeQuestion.questions[1], 'first unseen reserved question survives a failed run');
  assert.ok(!secondRetry.questions.includes(first));
  beginRailQuestion(secondRetry, random);
  assert.deepEqual(deck.recent.slice(-2), [first, secondRetry.questions[0]]);
});

function nearStation(deck, seed = 123) {
  const s = createRun(seed, 'spring', deck);
  Object.assign(s, { mode: 'running', time: 100, distance: 1200, speed: 19.2,
    nextRailAt: 1200.01, nextForkAt: Infinity, nextPortalAt: Infinity, nextRow: Infinity, nextRelicAt: Infinity });
  s.boosts.grace = 1e9;
  update(s, .025);
  assert.equal(s.rail.phase, 'boarding');
  return s;
}
function firstQuestion(s) {
  for (let i = 0; i < 12 && s.rail.phase === 'boarding'; i++) update(s, .25);
  assert.equal(s.rail.phase, 'question');
  return currentRailQuestion(s).id;
}

test('actual engine retries share the session deck, while pause and preview consume nothing', () => {
  const deck = createRailQuestionDeck();
  const first = nearStation(deck);
  assert.strictEqual(first.railQuestionDeck, deck);
  assert.strictEqual(first.rail.questionDeck, deck);
  assert.equal(deck.recent.length, 0, 'boarding is not presentation');
  const id = firstQuestion(first);
  assert.deepEqual(deck.recent, [id]);
  togglePause(first);
  const frozen = structuredClone(deck);
  for (let i = 0; i < 12; i++) update(first, .25);
  assert.deepEqual(deck, frozen);
  const preview = createRun(123);
  for (let i = 0; i < 12; i++) advancePreview(preview, .025);
  assert.deepEqual(deck, frozen, 'independent home preview cannot consume the play-session deck');
  const retry = nearStation(deck, 456);
  const retryId = firstQuestion(retry);
  assert.notEqual(retryId, id);
  assert.deepEqual(deck.recent, [id, retryId]);
});

test('consecutive actual cart encounters consume each displayed question once and keep answer lanes randomized', () => {
  const deck = createRailQuestionDeck(), s = nearStation(deck), shown = [], lanes = new Set();
  for (let rideNumber = 0; rideNumber < 18; rideNumber++) {
    const ride = s.rail;
    const observed = new Set();
    for (let frame = 0; frame < 500 && s.rail === ride; frame++) {
      if (ride.phase === 'question') {
        const question = currentRailQuestion(s);
        if (!observed.has(ride.index)) {
          assert.ok(!shown.slice(-8).includes(question.id));
          observed.add(ride.index); shown.push(question.id);
          assert.equal(deck.recent.at(-1), question.id);
        }
        const correctLane = ride.optionOrder.indexOf(question.correctIndex) - 1;
        lanes.add(correctLane); selectRailLane(s, correctLane);
      }
      update(s, .25);
      assert.equal(s.mode, 'running');
    }
    assert.equal(s.rail, null, 'answered ride must finish');
    assert.equal(observed.size, ride.questions.length);
    if (rideNumber < 17) {
      while (s.railReturnRemaining > 0) update(s, .25);
      Object.assign(s, { nextRailAt: s.distance + .01, nextForkAt: Infinity, nextPortalAt: Infinity,
        nextRow: Infinity, nextRelicAt: Infinity });
      update(s, .025);
      assert.equal(s.rail.phase, 'boarding');
    }
  }
  assert.equal(new Set(shown.slice(0, ids.length)).size, ids.length);
  assert.deepEqual([...lanes].sort(), [-1, 0, 1]);
});

test('default engine runs and identical seeded decks remain independent and deterministic', () => {
  const first = createRun(777), second = createRun(777);
  assert.notStrictEqual(first.railQuestionDeck, second.railQuestionDeck);
  const a = rng(777), b = rng(777), shownA = [], shownB = [];
  for (let i = 0; i < 18; i++) {
    showRide(createRailRide(a, first.railQuestionDeck), a, shownA);
    showRide(createRailRide(b, second.railQuestionDeck), b, shownB);
  }
  assert.deepEqual(shownA, shownB);
  assert.deepEqual(first.railQuestionDeck, second.railQuestionDeck);
});

test('page retry, home and cloud-reset paths explicitly preserve one page-owned deck', () => {
  const source = fs.readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map(), variables = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const owners = new Set();
  for (const name of ['beginRun', 'goHome', 'applyCloudSnapshot']) {
    const calls = [];
    function inspect(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'createRun') calls.push(node);
      ts.forEachChild(node, inspect);
    }
    inspect(functions.get(name));
    assert.equal(calls.length, 1, `${name} must replace the game once`);
    const owner = calls[0].arguments[2];
    assert.ok(owner && ts.isPropertyAccessExpression(owner) && owner.name.text === 'current', `${name} must reuse the page deck ref`);
    owners.add(owner.expression.getText(ast));
  }
  assert.equal(owners.size, 1);
  const declaration = variables.get([...owners][0]);
  assert.match(declaration.initializer.getText(ast), /useLazyRef[^]*createRailQuestionDeck/,
    'deck ownership must survive RunState replacement and render calls');
});
