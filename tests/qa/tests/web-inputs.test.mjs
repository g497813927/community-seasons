import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inputCases, installInputGate, assertInputOutcome, InputOutcomeError, verifyInputCase } from '../web/inputs.mjs';

const neutral = (chargeCoins = 100) => ({ mode: 'running', lane: 0, x: 0, jump: 0, slide: 0, height: 0,
  distance: 0, permanentSkill: 'shield', skillCharge: chargeCoins, skillChargeRequired: chargeCoins,
  skillRechargeLocked: false, shield: 0, shieldTime: 0 });
const effects = {
  left: { lane: -1, x: -.5 }, right: { lane: 1, x: .5 },
  jump: { jump: .85, height: .4 }, slide: { slide: .73 },
  skill: { skillCharge: 0, shield: 1, shieldTime: 11.9, skillRechargeLocked: true },
};

function fixture({ noEffect = false, brokenGate = false, sendError = false, chargeCoins = 100 } = {}) {
  let state, blocked = false, events = [];
  return {
    prepare: async () => { state = neutral(chargeCoins); return { ...state }; },
    snapshot: async () => ({ ...state }),
    setBlocked: async value => { blocked = value; events = []; },
    blockedEvents: async () => events,
    advance: async () => { state.distance += .8; },
    send: async input => {
      if (sendError) throw new Error('Dispatch failed');
      const firstTap = input.kind === 'double-tap' ? { ...state } : undefined;
      if (blocked && !brokenGate) events.push({ type: input.kind });
      else if (!noEffect) Object.assign(state, effects[input.outcome]);
      return firstTap;
    },
    isBlocked: () => blocked,
  };
}

test('coverage includes each arrow, WASD, Space, swipe direction and double tap', () => {
  assert.deepEqual(inputCases.filter(input => input.kind === 'keyboard').map(input => input.key).sort(),
    ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'a', 'd', 's', 'w'].sort());
  assert.deepEqual(inputCases.filter(input => input.kind === 'swipe').map(input => input.id).sort(),
    ['swipe-down', 'swipe-left', 'swipe-right', 'swipe-up']);
  assert.equal(inputCases.filter(input => input.kind === 'double-tap').length, 1);
});

for (const input of inputCases) {
  test(`${input.id} requires a real outcome and rejects an intercepted no-op`, async () => {
    const result = await verifyInputCase(input, fixture());
    assert.equal(result.positive.passed, true);
    assert.equal(result.negativeControl.passed, true);
    assert.match(result.negativeControl.observedFailure, /missing input outcome/);
    await assert.rejects(verifyInputCase(input, fixture({ noEffect: true })), InputOutcomeError);
    assert.throws(() => assertInputOutcome(input, neutral(), neutral()), InputOutcomeError);
    for (const [other, effect] of Object.entries(effects)) {
      if (other !== input.outcome) assert.throws(() => assertInputOutcome(input, neutral(), { ...neutral(), ...effect }), InputOutcomeError);
    }
  });
}

test('target lane alone, wrong motion and partial skill activation cannot satisfy outcomes', () => {
  for (const [outcome, incomplete] of [
    ['left', { lane: -1 }], ['right', { x: .5 }], ['jump', { jump: .8 }],
    ['slide', { slide: .7, jump: .2 }], ['skill', { shield: 1, shieldTime: 12 }],
    ['skill', { skillCharge: 0, shield: 1, shieldTime: 12 }],
  ]) assert.throws(() => assertInputOutcome({ id: outcome, outcome }, neutral(), { ...neutral(), ...incomplete }), InputOutcomeError);
});

test('charged baselines follow changed game thresholds for every input and its negative control', async () => {
  for (const chargeCoins of [75, 150]) {
    for (const input of inputCases) {
      const result = await verifyInputCase(input, fixture({ chargeCoins }));
      assert.equal(result.positive.passed, true);
      assert.equal(result.negativeControl.passed, true);
      assert.equal(result.positive.before.skillCharge, chargeCoins);
    }
  }
});

test('missing or invalid charge requirements and incomplete charge fail before input dispatch', async () => {
  const baselines = [
    ...[undefined, null, '150', NaN, Infinity, 0, -1].map(skillChargeRequired => ({ ...neutral(), skillChargeRequired })),
    ...[undefined, null, '150', NaN, Infinity, 0, 100, 149, 151].map(skillCharge => ({ ...neutral(150), skillCharge })),
  ];
  for (const baseline of baselines) {
    let sent = false;
    await assert.rejects(verifyInputCase(inputCases.at(-1), {
      ...fixture(), prepare: async () => baseline,
      send: async () => { sent = true; },
    }), /charge/);
    assert.equal(sent, false, 'Invalid prerequisites must not reach either input trial');
  }
});

test('a broken gate, failed sender or invalid baseline never counts as a passing negative control', async () => {
  await assert.rejects(verifyInputCase(inputCases[0], fixture({ brokenGate: true })), /must intercept/);
  const io = fixture({ sendError: true });
  await assert.rejects(verifyInputCase(inputCases[0], io), /Dispatch failed/);
  assert.equal(io.isBlocked(), false, 'Even a sender failure must release the input gate');
  await assert.rejects(verifyInputCase(inputCases[0], { ...fixture(), prepare: async () => ({ ...neutral(), jump: 1 }) }), /Non-neutral/);
});

test('event gate survives page serialization, stops handlers and can be released', () => {
  const host = new EventTarget();
  vm.runInNewContext(`(${installInputGate.toString()})()`, { window: host });
  let handled = 0;
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'pointerup']) {
    host.addEventListener(type, () => { handled++; });
    host.__qaInputGate.blocked = true;
    const event = new Event(type, { cancelable: true });
    host.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(handled, 0);
  }
  assert.equal(host.__qaInputGate.events.length, 4);
  host.__qaInputGate.blocked = false;
  host.dispatchEvent(new Event('keydown'));
  assert.equal(handled, 1);
});
