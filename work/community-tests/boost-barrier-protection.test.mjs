import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { createRun, update, act, togglePause, activateBoost, LANE_WIDTH, EDGE_STUMBLE_DURATION } =
  await import("./compiled/engine.mjs");
const { createRailRide, beginRailQuestion } = await import("./compiled/railway.mjs");
const speedBoosts = ["rush", "headstart", "portal"];

function run(lane = 0, chase = 0) {
  return Object.assign(createRun(4182), {
    mode: "running", time: 120, distance: 9100, score: 91000, speed: 66,
    lane, x: lane * LANE_WIDTH, chase,
    nextRow: 1e9, nextRelicAt: 1e9, nextForkAt: 1e9, nextRailAt: 1e9, nextPortalAt: 1e9,
  });
}
function boost(s, kind, remaining = 4) {
  // Exercise all active effects regardless of how they were delivered. Portal
  // and opening Head Start intentionally have different activation APIs.
  s.boosts[kind] = remaining;
}
function shield(s) {
  assert.equal(activateBoost(s, "shield", 3), true);
  assert.equal(s.boosts.shield, 3);
}
function advance(s, seconds) {
  while (seconds > 1e-8) {
    const dt = Math.min(seconds, 0.25);
    update(s, dt);
    seconds -= dt;
  }
}
const outward = (lane) => lane < 0 ? "left" : "right";

test("all speed boosts ignore repeated presses against either outer edge without any collision side effects", () => {
  for (const kind of speedBoosts) for (const lane of [-1, 1]) for (const chase of [0, 2.25]) {
    for (const withShield of [false, true]) for (const time of [1, 120]) {
      const s = run(lane, chase);
      s.time = time;
      if (withShield) shield(s);
      boost(s, kind);
      const before = structuredClone(s);
      for (let i = 0; i < 25; i++) assert.equal(act(s, outward(lane)), false);
      assert.deepEqual(s, before,
        `${kind}/${lane}/${chase}/${withShield}/${time}: edge input caused recoil, shield loss, flash, grace or a chase`);
    }
  }
});

test("boosted edge spam between frames does not extend or clear an existing chase", () => {
  for (const kind of speedBoosts) for (const lane of [-1, 1]) for (const chase of [0, 0.6, 3]) {
    const s = run(lane, chase);
    shield(s);
    boost(s, kind);
    const untouched = structuredClone(s);
    for (let frame = 0; frame < 90; frame++) {
      for (let i = 0; i < 3; i++) act(s, outward(lane));
      update(s, 1 / 60);
      update(untouched, 1 / 60);
    }
    assert.deepEqual(s, untouched, `${kind}: repeated edges must behave like an otherwise identical uninterrupted run`);
    assert.ok(Math.abs(s.chase - Math.max(0, chase - 1.5)) < 1e-8);
    assert.equal(s.stumbles, 0);
    assert.equal(s.edgeStumble, 0);
    assert.equal(s.shieldAbsorbed, 0);
    assert.equal(s.boosts.shield, 3);
  }
});

test("posts and roots remain harmless during speed boosts without spending a stacked shield or opening a lesson", () => {
  for (const effect of speedBoosts) for (const kind of ["roots", "pillar", "block", "arch"]) {
    for (const lane of [-1, 0, 1]) for (const chase of [0, 2]) {
      const s = run(lane, chase);
      shield(s);
      boost(s, effect);
      const obstacle = { id: s.nextId++, lane, at: s.distance + 0.05, kind, resolved: false };
      s.obstacles.push(obstacle);
      const untouched = structuredClone(s);
      untouched.obstacles = [];
      update(s, 0.02);
      update(untouched, 0.02);
      assert.equal(obstacle.resolved, true, "fixture must actually pass the obstacle");
      assert.equal(s.review, null);
      assert.equal(s.mode, "running");
      assert.deepEqual({ ...s, obstacles: [] }, untouched, `${effect}/${kind}/${lane}: collision had an effect beyond resolving the obstacle`);
    }
  }
});

test("speed-boost expiry retains its brief safety grace then restores normal recoverable edge stumbles", () => {
  for (const kind of speedBoosts) for (const lane of [-1, 1]) {
    const s = run(lane, 2);
    boost(s, kind, 0.025);
    update(s, 0.05);
    assert.equal(s.boosts[kind], 0);
    assert.ok(s.boosts.grace > 0.45 && s.boosts.grace <= 0.5);
    const protectedState = structuredClone(s);
    act(s, outward(lane));
    assert.deepEqual(s, protectedState, "natural expiry grace still suppresses an immediate edge stumble");
    advance(s, 0.5);
    assert.equal(s.boosts.grace, 0);
    act(s, outward(lane));
    assert.equal(s.mode, "running");
    assert.equal(s.stumbles, 1);
    assert.equal(s.edgeStumble, EDGE_STUMBLE_DURATION);
    assert.equal(s.edgeStumbleDirection, lane);
    assert.equal(s.boosts.grace, 0.5);
    assert.ok(s.chase > 4);
    const firstHit = structuredClone(s);
    for (let i = 0; i < 10; i++) act(s, outward(lane));
    assert.deepEqual(s, firstHit);
    advance(s, 0.5);
    act(s, outward(lane));
    assert.equal(s.stumbles, 1, "the existing recovery animation also debounces edge presses");
    advance(s, 0.2);
    act(s, outward(lane));
    assert.equal(s.stumbles, 2);
    assert.equal(s.mode, "running");
  }
});

test("normal, Shield, Magnet and Double Coins preserve the existing half-second edge protection", () => {
  for (const kind of [null, "shield", "magnet", "doubleCoins"]) for (const lane of [-1, 1]) {
    const s = run(lane);
    if (kind) assert.equal(activateBoost(s, kind, 3), true);
    const shieldBefore = s.boosts.shield;
    act(s, outward(lane));
    assert.equal(s.stumbles, 1);
    assert.equal(s.edgeStumble, EDGE_STUMBLE_DURATION);
    assert.equal(s.boosts.grace, 0.5);
    assert.ok(s.chase > 0);
    assert.equal(s.boosts.shield, shieldBefore, "normal edge recovery does not spend shields");
    advance(s, 0.49);
    act(s, outward(lane));
    assert.equal(s.stumbles, 1);
    advance(s, 0.2);
    act(s, outward(lane));
    assert.equal(s.stumbles, 2);
    assert.equal(s.mode, "running");
  }
});

test("pause and travel locks reject edge inputs without updating boosts or chase", () => {
  for (const kind of speedBoosts) for (const lane of [-1, 1]) {
    const s = run(lane, 2);
    boost(s, kind);
    togglePause(s);
    const paused = structuredClone(s);
    for (const action of ["left", "right", "jump", "slide"]) assert.equal(act(s, action), false);
    update(s, 0.25);
    assert.deepEqual(s, paused);
    for (const lock of ["sceneTransition", "turnRemaining", "railReturnRemaining"]) {
      const locked = run(lane, 2);
      boost(locked, kind);
      locked[lock] = 0.5;
      const before = structuredClone(locked);
      assert.equal(act(locked, outward(lane)), false);
      assert.deepEqual(locked, before);
    }
  }
});

test("railway lane boundaries remain penalty-free and speed boosts cannot answer or skip questions", () => {
  for (const kind of speedBoosts) for (const lane of [-1, 1]) {
    const s = run(lane, 2);
    shield(s);
    boost(s, kind);
    s.rail = createRailRide(() => 0.4);
    beginRailQuestion(s.rail, () => 0.4);
    const before = structuredClone(s);
    for (let i = 0; i < 20; i++) assert.equal(act(s, outward(lane)), false);
    assert.deepEqual(s, before);
    assert.equal(act(s, "jump"), false);
    assert.equal(act(s, "slide"), false);
    update(s, 0.25);
    assert.equal(s.chase, before.chase);
    assert.deepEqual(s.boosts, before.boosts);
    assert.equal(s.rail.phase, "question");
    assert.equal(s.rail.answerLane, null);
    assert.equal(s.stumbles, 0);
    assert.equal(act(s, lane < 0 ? "right" : "left"), true);
    assert.equal(s.lane, 0, "cart answers continue to require normal deliberate lane selection");
  }
});
