import assert from 'node:assert/strict';

export const inputCases = [
  ...[['ArrowLeft', 'left'], ['a', 'left'], ['ArrowRight', 'right'], ['d', 'right'],
    ['ArrowUp', 'jump'], ['w', 'jump'], ['Space', 'jump'], ['ArrowDown', 'slide'], ['s', 'slide']]
    .map(([key, outcome]) => ({ id: `key-${key}`, kind: 'keyboard', key, outcome })),
  ...[['left', -70, 0], ['right', 70, 0], ['up', 0, -70], ['down', 0, 70]]
    .map(([direction, dx, dy]) => ({ id: `swipe-${direction}`, kind: 'swipe', dx, dy,
      outcome: ({ up: 'jump', down: 'slide' })[direction] ?? direction })),
  { id: 'double-tap', kind: 'double-tap', outcome: 'skill' },
];

// Installed before React's window capture handler (including Space). Events
// are still delivered by the browser, but cannot reach the game in a control.
export function installInputGate() {
  const gate = { blocked: false, events: [] };
  window.__qaInputGate = gate;
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'click']) {
    window.addEventListener(type, event => {
      if (!gate.blocked) return;
      gate.events.push({ type: event.type, key: event.key ?? null, pointerType: event.pointerType ?? null });
      if (gate.events.length > 64) gate.events.shift();
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
}

export class InputOutcomeError extends Error {
  constructor(id, expected) {
    super(`${id}: missing input outcome (${expected})`);
    this.name = 'InputOutcomeError';
    this.inputId = id;
  }
}

function assertBaseline(before) {
  assert.equal(before.mode, 'running');
  for (const field of ['lane', 'x', 'jump', 'slide', 'height', 'shield', 'shieldTime']) assert.equal(before[field], 0, `Non-neutral input baseline: ${field}`);
  assert.equal(before.permanentSkill, 'shield');
  assert.equal(before.skillCharge, 100);
  assert.equal(before.skillRechargeLocked, false);
}

export function assertInputOutcome(input, before, after) {
  let passed, expected;
  switch (input.outcome) {
    case 'left': case 'right': {
      const direction = input.outcome === 'left' ? -1 : 1;
      expected = `lane ${direction} and lateral position moving ${input.outcome}`;
      passed = after.lane === direction && (after.x - before.x) * direction > 0 && after.jump === 0 && after.slide === 0;
      break;
    }
    case 'jump':
      expected = 'new jump with positive height and no slide';
      passed = after.jump > before.jump && after.height > before.height && after.slide === 0 && after.lane === before.lane;
      break;
    case 'slide':
      expected = 'new slide with no jump';
      passed = after.slide > before.slide && after.jump === 0 && after.height === 0 && after.lane === before.lane;
      break;
    case 'skill':
      expected = 'charge consumed, shield active and recharge locked';
      passed = after.skillCharge === 0 && after.shield > before.shield && after.shieldTime > before.shieldTime && after.skillRechargeLocked === true;
      break;
    default: throw new Error(`Unknown input outcome: ${input.outcome}`);
  }
  if (!passed) throw new InputOutcomeError(input.id, expected);
}

// The negative trial uses exactly the same sender, clock advance and outcome
// predicate as the positive trial. Dispatch/fixture errors cannot count as an
// expected failure; only the specific missing-outcome error is accepted.
export async function verifyInputCase(input, io, result = { id: input.id, outcome: input.outcome }) {
  for (const blocked of [true, false]) {
    const trial = { passed: false };
    result[blocked ? 'negativeControl' : 'positive'] = trial;
    trial.before = await io.prepare();
    assertBaseline(trial.before);
    await io.setBlocked(blocked);
    try {
      trial.firstTap = await io.send(input);
      await io.advance(64);
      trial.after = await io.snapshot();
      trial.blockedEvents = await io.blockedEvents();
    } finally { await io.setBlocked(false); }
    assert.equal(trial.after.mode, 'running', `${input.id}: run must stay active`);
    assert.ok(trial.after.distance > trial.before.distance, `${input.id}: game frames must advance during both trials`);
    if (input.kind === 'double-tap') {
      assert.ok(trial.firstTap, 'Double tap must observe the first tap separately');
      for (const field of ['skillCharge', 'shield', 'shieldTime', 'skillRechargeLocked'])
        assert.equal(trial.firstTap[field], trial.before[field], `One tap must not activate the skill: ${field}`);
    }
    if (blocked) {
      assert.ok(trial.blockedEvents.length > 0, `${input.id}: the negative control must intercept delivered events`);
      assert.throws(() => assertInputOutcome(input, trial.before, trial.after), error => {
        if (!(error instanceof InputOutcomeError) || error.inputId !== input.id) return false;
        trial.observedFailure = error.message;
        return true;
      }, `${input.id}: a blocked input must fail the same outcome assertion`);
      for (const field of ['lane', 'x', 'jump', 'slide', 'height', 'skillCharge', 'shield', 'shieldTime', 'skillRechargeLocked'])
        assert.equal(trial.after[field], trial.before[field], `${input.id}: blocked input changed ${field}`);
    } else {
      assert.deepEqual(trial.blockedEvents, [], `${input.id}: positive input was intercepted`);
      assertInputOutcome(input, trial.before, trial.after);
    }
    trial.passed = true;
  }
  return result;
}
