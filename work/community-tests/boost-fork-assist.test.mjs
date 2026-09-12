import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { createRun, update, act, activateBoost, togglePause, LANE_WIDTH } = await import("./compiled/engine.mjs");
const { createRailRide, beginRailQuestion } = await import("./compiled/railway.mjs");
const { Renderer } = await import("./compiled/render.mjs");
const speedBoosts = ["rush", "headstart", "portal"];
const normalSpeed = (distance) => Math.min(66, 12 + distance * 0.006);
const multiplier = (kind) => kind === "rush" ? 1.65 : 2;

function approach(distance = 1200, gap = 100) {
  const s = createRun(4182);
  Object.assign(s, {
    mode: "running", distance, score: Math.floor(distance * 10), time: 120,
    speed: normalSpeed(distance), nextRow: 1e9, nextRelicAt: 1e9,
    nextForkAt: distance + gap, fork: { at: distance + gap },
    nextRailAt: 1e9, nextPortalAt: 1e9,
  });
  return s;
}
function enable(s, kind, remaining = kind === "rush" ? 8 : kind === "headstart" ? 9 : 5) {
  // Initial active-effect fixtures cover all delivery paths without changing
  // the store's opening-only head-start/portal activation restrictions.
  s.boosts[kind] = remaining;
  s.speed = normalSpeed(s.distance) * multiplier(kind);
}
function cross(s, dt = 1 / 120) {
  for (let i = 0; i < 2000 && s.mode === "running" && s.lastForkAt === null; i++) update(s, dt);
  assert.ok(s.lastForkAt !== null || s.mode === "over", "fork was eventually reached");
}

test("every active speed boost gradually steers a centered runner left before the fork, including maximum-speed slow frames", () => {
  for (const kind of speedBoosts) for (const distance of [450, 1200, 9100]) for (const dt of [1 / 120, 0.25]) {
    const s = approach(distance);
    enable(s, kind);
    const gate = s.fork.at;
    update(s, 1 / 120);
    assert.equal(s.lane, 0, `${kind}: steering must wait until the fork is close`);
    let observedAssist = false;
    for (let i = 0; i < 2000 && s.lastForkAt === null && s.mode === "running"; i++) {
      update(s, dt);
      if (s.lane === -1 && s.lastForkAt === null) {
        if (!observedAssist) {
          assert.ok(s.distance < gate, `${kind}: assistance begins before crossing`);
          assert.ok(s.x < 0 && s.x > -LANE_WIDTH, `${kind}: normal lane easing, not a full-lane teleport`);
        }
        observedAssist = true;
      }
    }
    assert.equal(observedAssist, true, `${kind}/${distance}/${dt}: approach assistance was observed`);
    assert.equal(s.mode, "running", `${kind}/${distance}/${dt}: active boost protects the centered approach`);
    assert.equal(s.turnDirection, -1);
    assert.equal(s.lastForkAt, gate);
    assert.ok(s.turnEntryX < 0 && s.turnEntryX >= -LANE_WIDTH);
    assert.ok(s.turnRemaining > 0, "use the normal animated fork turn");
    assert.equal(s.stumbles, 0, "assistance does not simulate an illegal edge press");
  }
});

test("speed-boost fork assistance preserves an existing right choice and a right override after assistance starts", () => {
  for (const kind of speedBoosts) {
    for (const x of [0, LANE_WIDTH]) {
      const s = approach(9100, 70);
      enable(s, kind);
      s.lane = 1;
      s.x = x;
      for (let i = 0; i < 500 && s.lastForkAt === null; i++) {
        update(s, 1 / 120);
        if (s.lastForkAt === null) assert.equal(s.lane, 1, `${kind}: retain the selected right route`);
      }
      assert.equal(s.mode, "running");
      assert.equal(s.turnDirection, 1);
    }
    const override = approach(1200, normalSpeed(1200) * multiplier(kind) * 0.45);
    enable(override, kind);
    update(override, 1 / 120);
    assert.equal(override.lane, -1);
    assert.equal(act(override, "right"), true);
    assert.equal(override.lane, 1);
    cross(override);
    assert.equal(override.mode, "running");
    assert.equal(override.turnDirection, 1);
  }
});

test("an effect starting just before crossing survives a 250ms update without falsifying the entry pose", () => {
  for (const kind of speedBoosts) for (const choice of [0, 1]) {
    const s = approach(9100, 0.01);
    s.lane = choice;
    if (kind === "headstart") s.time = 4;
    if (kind === "portal") enable(s, kind);
    else assert.equal(activateBoost(s, kind, 3), true);
    const beforeX = s.x;
    update(s, 0.25);
    assert.equal(s.mode, "running", `${kind}: late activation cannot die on the closed center`);
    assert.equal(s.turnDirection, choice || -1, `${kind}: explicit right choice wins over default left`);
    assert.equal(s.turnEntryX, beforeX, `${kind}: preserve the actual position for the camera transition`);
    assert.ok(s.turnRemaining > 0);
  }
});

test("late assisted crossings retain the player's projected position and animate onto the selected branch", () => {
  globalThis.window = { devicePixelRatio: 1 };
  for (const kind of speedBoosts) for (const choice of [0, 1]) {
    const r = new Renderer({
      getContext: () => ({ setTransform() {} }),
      getBoundingClientRect: () => ({ width: 390, height: 760 }),
    });
    r.resize();
    const s = approach(9100, 0.00001);
    enable(s, kind);
    s.lane = choice;
    r.configureCamera(s);
    const before = [0, 1.5].map((y) => r.project([s.x, y, 0]));
    update(s, 0.000001);
    assert.equal(s.mode, "running");
    assert.equal(s.turnEntryX, 0);
    r.configureCamera(s);
    const after = [0, 1.5].map((y) => r.project([r.turnEntryOffset, y, 0]));
    before.forEach((p, i) => {
      // A newly selected lane can add the existing 0.5-degree steering roll,
      // but must not teleport the TV sideways by a full branch width.
      assert.ok(Math.hypot(p[0] - after[i][0], p[1] - after[i][1]) < 4,
        `${kind}/${choice}: late crossing displaced the TV on screen`);
    });
    assert.equal(r.cameraYaw, 0, "a center entry must not instantly rotate the camera");
    update(s, 0.1);
    r.configureCamera(s);
    assert.equal(Math.sign(r.cameraYaw), choice || -1);
    assert.ok(Math.abs(r.turnEntryOffset) < LANE_WIDTH, "the entry offset eases onto the new road");
  }
});

test("an off-center boosted reversal keeps the player and both nearby roads continuous across commitment", () => {
  globalThis.window = { devicePixelRatio: 1 };
  for (const kind of speedBoosts) for (const entryX of [-0.8, 0.8]) {
    const r = new Renderer({
      getContext: () => ({ setTransform() {} }),
      getBoundingClientRect: () => ({ width: 440, height: 752 }),
    });
    r.resize();
    const s = approach(9100, 0.00001);
    enable(s, kind);
    s.x = entryX;
    s.lane = entryX < 0 ? 1 : -1;
    const chosenBranch = s.lane;
    const configure = () => {
      r.configureCamera(s);
      r.forkDepth = s.fork ? s.fork.at - s.distance : null;
    };
    const road = () => [
      { branch: 0, z: -6 }, { branch: 0, z: 0 },
      { branch: -1, z: 0 }, { branch: 1, z: 0 },
      { branch: -1, z: 10 }, { branch: 1, z: 10 },
    ].flatMap(({ branch, z }) => [-2.45, 0, 2.45].map((x) => r.projectView(r.roadPoint(branch, x, 0, z))));
    configure();
    const playerBefore = [0, 1.5].map((y) => r.project([s.x, y, 0]));
    const roadBefore = road();
    const rollBefore = r.cameraRoll;
    update(s, 0.000001);
    assert.equal(s.mode, "running");
    assert.equal(s.turnDirection, chosenBranch);
    assert.equal(s.turnEntryX, entryX);
    configure();
    const playerAfter = [0, 1.5].map((y) => r.project([r.turnEntryOffset, y, 0]));
    const roadAfter = road();
    const pairs = [
      ...playerBefore.map((point, i) => [point, playerAfter[i]]),
      ...roadBefore.map((point, i) => [point, roadAfter[i]]),
    ];
    for (const [before, after] of pairs) {
      assert.ok(Math.hypot(before[0] - after[0], before[1] - after[1]) < 0.01,
        `${kind}/${entryX}: opposite-branch commitment jumps the player or road`);
    }
    assert.equal(r.cameraRoll, rollBefore, "the approach and turn share the same capped steering roll");
  }
});

test("a body already in an outer branch keeps that physical route even after a very late reversed input", () => {
  for (const kind of speedBoosts) for (const occupied of [-1, 1]) {
    const s = approach(9100, 0.01);
    enable(s, kind);
    s.x = occupied * LANE_WIDTH;
    s.lane = occupied;
    assert.equal(act(s, occupied === -1 ? "right" : "left"), true);
    assert.equal(s.lane, -occupied);
    update(s, 0.25);
    assert.equal(s.mode, "running");
    assert.equal(s.turnDirection, occupied);
    assert.equal(s.turnEntryX, occupied * LANE_WIDTH);
  }
});

test("a player can change to the right branch after the automatic left movement has settled", () => {
  for (const kind of speedBoosts) for (const reverseBack of [false, true]) {
    const s = approach(1200, normalSpeed(1200) * multiplier(kind) * 0.53);
    enable(s, kind);
    update(s, 0.15);
    assert.equal(s.lane, -1);
    assert.ok(s.x < -LANE_WIDTH * 0.9);
    assert.equal(act(s, "right"), true);
    assert.equal(s.lane, 1, "near an assisted fork, right directly selects the right route");
    for (let i = 0; i < 4; i++) {
      update(s, 1 / 60);
      assert.equal(s.lane, 1, "automatic help must retain the manually chosen right route");
    }
    if (reverseBack) {
      assert.equal(act(s, "left"), true);
      assert.equal(s.lane, -1);
    }
    cross(s);
    assert.equal(s.mode, "running");
    assert.equal(s.turnDirection, reverseBack ? -1 : 1);
  }
});

test("speed boosts preserve ordinary one-lane controls outside the fork approach", () => {
  for (const kind of speedBoosts) {
    const s = approach(1200, 100);
    enable(s, kind);
    s.lane = 1;
    s.x = LANE_WIDTH;
    assert.equal(act(s, "left"), true);
    assert.equal(s.lane, 0, "a distant fork must not turn a normal lane change into a two-lane jump");
    update(s, 1 / 60);
    assert.equal(s.lane, 0);
  }
});

test("a boost that expires before the approach restores ordinary fork rules", () => {
  for (const kind of speedBoosts) {
    const s = approach(9100, 110);
    enable(s, kind, 0.01);
    update(s, 0.1);
    assert.equal(s.boosts[kind], 0);
    assert.equal(s.lane, 0, "a far-away fork was not preselected");
    cross(s);
    assert.equal(s.mode, "over", `${kind}: expired speed effect must not retain automatic fork protection`);
    assert.match(s.reason, /center route is closed/);
  }
});

test("expiration retains the assisted lane, but a later manual return to center can fail normally", () => {
  for (const kind of speedBoosts) for (const returnToCenter of [false, true]) {
    const s = approach(1200, normalSpeed(1200) * multiplier(kind) * 0.45);
    enable(s, kind, 0.04);
    update(s, 0.06);
    assert.equal(s.boosts[kind], 0);
    assert.equal(s.lane, -1);
    if (returnToCenter) {
      assert.equal(act(s, "right"), true);
      assert.equal(s.lane, 0);
    }
    cross(s);
    assert.equal(s.mode, returnToCenter ? "over" : "running");
    if (!returnToCenter) assert.equal(s.turnDirection, -1);
  }
});

test("pauses freeze assistance and railway questions never receive automatic lane answers", () => {
  for (const kind of speedBoosts) {
    const paused = approach(1200, 4);
    enable(paused, kind);
    togglePause(paused);
    const before = structuredClone(paused);
    update(paused, 0.25);
    assert.deepEqual(paused, before);
    togglePause(paused);
    update(paused, 1 / 120);
    assert.equal(paused.lane, -1);

    const rail = approach(1200, 0.01);
    rail.fork = null;
    enable(rail, kind);
    rail.rail = createRailRide(() => 0.4);
    beginRailQuestion(rail.rail, () => 0.4);
    update(rail, 0.25);
    assert.equal(rail.lane, 0);
    assert.equal(rail.rail.phase, "question");
    assert.equal(rail.rail.answerLane, null);
    assert.equal(rail.rail.correct, null);
    assert.equal(act(rail, "right"), true);
    update(rail, 0.25);
    assert.equal(rail.lane, 1, "cart answers still follow explicit input");
  }
});

test("normal running and non-speed effects still require a manual outer route", () => {
  for (const kind of [null, "shield", "magnet", "doubleCoins", "grace"]) {
    const s = approach(9100, 2);
    if (kind === "grace") s.boosts.grace = 1;
    else if (kind) assert.equal(activateBoost(s, kind, 3), true);
    update(s, 0.25);
    assert.equal(s.mode, "over", `${kind ?? "normal"}: no automatic route without a speed boost`);
    assert.equal(s.lastForkAt, null);
    assert.match(s.reason, /center route is closed/);
  }
});
