import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";

const { createRun, update, act, activateBoost, advancePreview, LANE_WIDTH, TURN_DURATION } =
  await import("../helpers/compiled/engine.mjs");
const { Renderer } = await import("../helpers/compiled/render.mjs");
const speedBoosts = ["rush", "headstart", "portal"];

function approach(blockedDirection, { distance = 1200, gap = 40, seed = 4182 } = {}) {
  return Object.assign(createRun(seed), {
    mode: "running", distance, time: 120, speed: Math.min(66, 12 + distance * 0.006),
    nextRow: 1e9, nextRelicAt: 1e9, nextForkAt: distance + gap,
    fork: { at: distance + gap, blockedDirection }, nextRailAt: 1e9, nextPortalAt: 1e9,
  });
}

function enable(s, kind) {
  s.boosts[kind] = 8;
  s.speed *= kind === "rush" ? 1.65 : 2;
}

function cross(s, dt = 1 / 120) {
  for (let i = 0; i < 1000 && s.mode === "running" && s.lastForkAt === null; i++) update(s, dt);
  assert.ok(s.lastForkAt !== null || s.mode === "over", "reach the fork");
}

test("seeded forks mix both-open, left-dead-end and right-dead-end layouts and keep the announced layout", () => {
  const counts = { 0: 0, "-1": 0, 1: 0 };
  for (let seed = 1; seed <= 400; seed++) {
    const first = approach(undefined, { seed });
    first.fork = null;
    const replay = structuredClone(first);
    update(first, 1 / 120);
    update(replay, 1 / 120);
    assert.deepEqual(first.fork, replay.fork, `seed ${seed}: reproducible fork layout`);
    assert.ok(first.fork);
    counts[first.fork.blockedDirection ?? 0]++;
    const announced = first.fork.blockedDirection;
    update(first, 0.25);
    assert.equal(first.fork.blockedDirection, announced, "a visible dead end never changes sides");
  }
  assert.ok(counts[0] >= 160 && counts[0] <= 240, `both open: ${counts[0]}/400`);
  for (const side of [-1, 1]) assert.ok(counts[side] >= 75 && counts[side] <= 125,
    `dead end ${side}: ${counts[side]}/400`);
});

test("an unboosted runner must take the open branch, including with shields or grace", () => {
  for (const blocked of [-1, 1]) for (const choice of [-1, 0, 1]) {
    for (const effect of [null, "shield", "grace", "magnet", "doubleCoins"]) {
      const s = approach(blocked, { gap: 0.01 });
      s.lane = choice;
      s.x = choice * LANE_WIDTH;
      if (effect === "grace") s.boosts.grace = 10;
      else if (effect) assert.equal(activateBoost(s, effect, 3), true);
      const shieldBefore = s.boosts.shield;
      update(s, 0.25);
      const open = choice === -blocked;
      assert.equal(s.mode, open ? "running" : "over", `${blocked}/${choice}/${effect}`);
      if (open) {
        assert.equal(s.turnDirection, -blocked);
        assert.equal(s.lastForkBlockedDirection, blocked);
      } else {
        assert.equal(s.lastForkAt, null);
        assert.match(s.reason, blocked === -1 ? /left branch is a dead end.*right branch/ : /right branch is a dead end.*left branch/);
        assert.equal(s.boosts.shield, shieldBefore, "a route mistake does not consume a shield");
      }
    }
  }
});

test("every speed boost smoothly chooses the open branch from every incoming lane", () => {
  for (const blocked of [-1, 1]) for (const kind of speedBoosts) {
    for (const incoming of [-1, 0, 1]) for (const dt of [1 / 120, 0.25]) {
      const s = approach(blocked, { distance: 9100, gap: 80 });
      enable(s, kind);
      s.lane = incoming;
      s.x = incoming * LANE_WIDTH;
      update(s, 1 / 120);
      assert.equal(s.lane, incoming, "do not steer before the assist window");
      let assisted = false;
      for (let i = 0; i < 1000 && s.lastForkAt === null; i++) {
        const oldX = s.x;
        update(s, dt);
        if (!assisted && s.lastForkAt === null && s.lane === -blocked && incoming !== -blocked) {
          assisted = true;
          assert.ok(Math.abs(s.x - oldX) > 0, "the runner starts moving toward the safe branch");
          assert.ok(Math.abs(s.x + blocked * LANE_WIDTH) > 0, "steering eases rather than teleporting");
        }
      }
      assert.equal(s.mode, "running", `${blocked}/${kind}/${incoming}/${dt}`);
      assert.equal(s.turnDirection, -blocked);
      assert.equal(s.lastForkBlockedDirection, blocked);
      assert.equal(s.stumbles, 0);
      if (incoming !== -blocked) assert.equal(assisted, true);
    }
  }
});

test("boosted inputs cannot redirect into a dead end, while distant inputs remain ordinary lane changes", () => {
  for (const blocked of [-1, 1]) for (const kind of speedBoosts) {
    const s = approach(blocked, { gap: 4 });
    enable(s, kind);
    s.lane = blocked;
    s.x = blocked * LANE_WIDTH;
    assert.equal(act(s, blocked === -1 ? "left" : "right"), true);
    assert.equal(s.lane, -blocked, "the speed boost chooses the open branch even for unsafe input");
    for (let i = 0; i < 3; i++) {
      assert.equal(act(s, blocked === -1 ? "left" : "right"), false);
      assert.equal(s.lane, -blocked);
    }
    cross(s);
    assert.equal(s.mode, "running");
    assert.equal(s.turnDirection, -blocked);

    const far = approach(blocked, { gap: 100 });
    enable(far, kind);
    assert.equal(act(far, blocked === -1 ? "left" : "right"), true);
    assert.equal(far.lane, blocked, "far from the fork, inputs remain under player control");
  }
});

test("a speed boost activated at the junction rescues even a body already in the dead end without altering its entry pose", () => {
  globalThis.window = { devicePixelRatio: 1 };
  for (const blocked of [-1, 1]) for (const kind of speedBoosts) {
    for (const entryX of [0, blocked * 0.8, blocked * LANE_WIDTH]) {
      const s = approach(blocked, { distance: 9100, gap: 0.00001 });
      s.lane = blocked;
      s.x = entryX;
      if (kind === "headstart") s.time = 4;
      if (kind === "portal") enable(s, kind);
      else assert.equal(activateBoost(s, kind, 3), true);
      const renderer = new Renderer({
        getContext: () => ({ setTransform() {} }),
        getBoundingClientRect: () => ({ width: 390, height: 760 }),
      });
      renderer.resize();
      renderer.configureCamera(s);
      const before = [0, 1.5].map(y => renderer.project([entryX, y, 0]));
      update(s, 0.000001);
      assert.equal(s.mode, "running", `${blocked}/${kind}/${entryX}`);
      assert.equal(s.turnDirection, -blocked);
      assert.equal(s.turnEntryX, entryX);
      renderer.configureCamera(s);
      const after = [0, 1.5].map(y => renderer.project([renderer.turnEntryOffset, y, 0]));
      before.forEach((point, i) => assert.ok(Math.hypot(point[0] - after[i][0], point[1] - after[i][1]) < 4,
        "late assistance keeps the projected body continuous"));
      update(s, 0.25);
      assert.equal(s.mode, "running");
      assert.equal(s.turnDirection, -blocked);
    }
  }
});

test("dead-end turns retain their layout while clearing landing hazards and reset for later open forks", () => {
  for (const blocked of [-1, 1]) {
    const s = approach(blocked, { gap: 0.01 });
    s.lane = -blocked;
    s.x = -blocked * LANE_WIDTH;
    s.obstacles = [{ id: 1, lane: 0, at: s.distance + 1, kind: "pillar", resolved: false }];
    s.pickups = [{ id: 2, lane: 0, at: s.distance + 1, taken: false }];
    s.relics = [{ id: 3, lane: 0, at: s.distance + 1, kind: "rush", taken: false }];
    update(s, 0.25);
    assert.equal(s.mode, "running");
    assert.equal(s.lastForkBlockedDirection, blocked);
    assert.equal(s.obstacles.length + s.pickups.length + s.relics.length, 0);
    for (let elapsed = 0; elapsed < TURN_DURATION; elapsed += 0.25) update(s, 0.25);
    assert.equal(s.lastForkBlockedDirection, blocked, "retain the closed branch through the departing bend");
    s.nextForkAt = s.distance + 0.01;
    s.fork = { at: s.nextForkAt };
    s.lane = 1;
    s.x = LANE_WIDTH;
    update(s, 0.25);
    assert.equal(s.mode, "running");
    assert.equal(s.lastForkBlockedDirection, 0, "a later open fork must not inherit a closed branch");
    s.lastForkBlockedDirection = blocked;
    advancePreview(s, 0.01);
    assert.equal(s.lastForkBlockedDirection, 0, "home scenery has no closed branches");
    assert.equal(createRun(s.seed).lastForkBlockedDirection, 0, "retries start without a previous closure");
  }
});
