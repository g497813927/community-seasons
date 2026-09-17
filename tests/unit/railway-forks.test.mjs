import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const {
  createRun,
  update,
  act,
  selectRailLane,
  generateAhead,
  advancePreview,
  activateBoost,
  startSceneTravel,
  togglePause,
  currentRailQuestion,
  monsterPresence,
  MAX_SPEED,
  LANE_WIDTH,
  TURN_DURATION,
  FORK_UNLOCK_TIME,
  RAIL_UNLOCK_TIME,
  EDGE_STUMBLE_DURATION,
  RAIL_RETURN_DURATION,
  RAIL_SPEED,
  MAX_RAIL_SPEED,
  railSpeed,
} = await import("../helpers/compiled/engine.mjs");
const { RAIL_QUESTIONS, createRailRide, railQuestionDuration } = await import("../helpers/compiled/railway.mjs");
const { createProgress, bankRunRewards } = await import("../helpers/compiled/store.mjs");
function run() {
  return Object.assign(createRun(4182), {
    mode: "running",
    time: 100,
    distance: 1200,
    nextRow: 1e9,
    nextPortalAt: Infinity,
    nextForkAt: Infinity,
    nextRailAt: Infinity,
  });
}
function advance(s, seconds, step = 1 / 120) {
  while (seconds > 1e-8) {
    const dt = Math.min(step, seconds);
    update(s, dt);
    seconds -= dt;
  }
}
function board(seed = 4182, distance = 1200) {
  const s = run();
  s.seed = seed;
  s.distance = distance;
  s.nextRailAt = s.distance + 0.01;
  update(s, 0.01);
  assert.equal(s.rail?.phase, "boarding");
  return s;
}
function correctLane(s) {
  const q = currentRailQuestion(s);
  return s.rail.optionOrder.indexOf(q.correctIndex) - 1;
}

test("normal maximum is 5.5x and tighter obstacle spacing retains variable clusters with safe recovery gaps", () => {
  assert.equal(MAX_SPEED, 66);
  const all = [];
  for (let seed = 1; seed <= 10; seed++) {
    const s = run();
    Object.assign(s, { seed, distance: 20000, nextRow: 9050, rows: 50 });
    generateAhead(s);
    const primary = [];
    for (const at of [...new Set(s.obstacles.map((o) => o.at))].sort((a, b) => a - b))
      if (!primary.length || at - primary.at(-1) > MAX_SPEED * 0.31) primary.push(at);
    for (let i = 1; i < primary.length; i++) {
      const seconds = (primary[i] - primary[i - 1]) / MAX_SPEED;
      assert.ok(seconds >= 1.2 - 1e-8, `unsafe row interval ${seconds}`);
      all.push(seconds);
    }
  }
  assert.ok(all.some((x) => x < 1.25));
  assert.ok(all.some((x) => x > 1.5 && x < 1.75));
  assert.ok(all.some((x) => x > 2.5 && x < 2.8));
  assert.ok(all.filter((x) => x <= 1.4).length / all.length > 0.5);
  const mean = all.reduce((sum, value) => sum + value, 0) / all.length;
  assert.ok(mean < 1.5, `expected closer rows than the previous ~1.7-second rhythm, got ${mean}`);
  assert.ok(new Set(all.map((x) => x.toFixed(2))).size > 80);
  assert.ok(
    1.2 > 0.68 + 0.46,
    "even dense rows retain clearance between closure tails and the next jump trail",
  );
});

function spacingRows(seed, start, end, time = 120) {
  const s = createRun(seed);
  Object.assign(s, {
    time,
    distance: end - 135,
    nextRow: start,
    rows: time ? 20 : 0,
    nextForkAt: Infinity,
    nextRailAt: Infinity,
    nextPortalAt: Infinity,
  });
  generateAhead(s);
  const primary = [];
  for (const at of [...new Set(s.obstacles.map((o) => o.at))].sort((a, b) => a - b)) {
    const prior = primary.at(-1);
    if (prior == null || at - prior > Math.min(MAX_SPEED, 12 + prior * 0.006) * 0.31)
      primary.push(at);
  }
  return { s, primary };
}

function spacingIntervals(primary) {
  const intervals = [];
  for (let i = 1; i < primary.length; i++) {
    const previous = primary[i - 1],
      at = primary[i];
    const portal = Math.round(previous / 2500) * 2500;
    // Portal clearances are a separate event, rather than an ordinary row gap.
    if (
      (portal > 0 && previous < portal + 24 && at > portal - 24) ||
      Math.floor(previous / 2500) !== Math.floor(at / 2500)
    )
      continue;
    intervals.push((at - previous) / Math.min(MAX_SPEED, 12 + previous * 0.006));
  }
  return intervals;
}

test("actual generated intervals are closer while retaining seeded contrast and irregular bursts", (t) => {
  for (const [stage, start, end, time] of [
    ["opening", 50, 1200, 0],
    ["middle", 1800, 2400, 120],
    ["maximum", 9050, 12200, 120],
  ]) {
    const intervals = [],
      streaks = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const generated = spacingIntervals(spacingRows(seed, start, end, time).primary);
      intervals.push(...generated);
      let streak = 0;
      for (const gap of generated) {
        if (gap < 1.39) streak++;
        else {
          if (streak) streaks.add(streak);
          streak = 0;
        }
      }
      if (streak) streaks.add(streak);
    }
    intervals.sort((a, b) => a - b);
    const average = intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length;
    const deviation = Math.sqrt(
      intervals.reduce((sum, gap) => sum + (gap - average) ** 2, 0) / intervals.length,
    );
    const percentile95 = intervals[Math.floor(intervals.length * 0.95)];
    t.diagnostic(
      `${stage}: ${intervals.length} actual intervals; ${intervals[0].toFixed(2)}–${intervals.at(-1).toFixed(2)}s, mean ${average.toFixed(2)}s, p95 ${percentile95.toFixed(2)}s, deviation ${deviation.toFixed(2)}s`,
    );
    assert.ok(intervals[0] >= 1.2 - 1e-8 && intervals.at(-1) <= 2.8 + 1e-8);
    assert.ok(
      average > 1.35 && average < (stage === "opening" ? 1.6 : 1.5),
      "the closer rhythm must retain a low average gap",
    );
    assert.ok(
      percentile95 > 2.1 && percentile95 < 2.6,
      "longer gaps occur often enough to notice, but remain occasional",
    );
    assert.ok(deviation > 0.27, "shorter intervals must still have noticeable variation");
    assert.ok(intervals.filter((gap) => gap > 2.1).length / intervals.length > 0.04);
    assert.ok(
      [2, 3, 4].every((length) => streaks.has(length)) &&
        [...streaks].some((length) => length >= 5),
      "bursts vary in length and may join instead of following a fixed cycle",
    );
  }
  const same = spacingRows(18, 9050, 12200),
    replay = spacingRows(18, 9050, 12200);
  assert.deepEqual(same.s.obstacles, replay.s.obstacles);
  assert.deepEqual(same.s.pickups, replay.s.pickups);
  assert.notDeepEqual(same.primary, spacingRows(19, 9050, 12200).primary);
});

test("opening rows remain gentler and a hot-reloaded run can begin a burst without new state", () => {
  for (let seed = 1; seed <= 15; seed++) {
    const { s, primary } = spacingRows(seed, 50, 350, 0);
    for (let i = 1; i <= 5; i++) {
      const gap = (primary[i] - primary[i - 1]) / Math.min(MAX_SPEED, 12 + primary[i - 1] * 0.006);
      assert.ok(gap >= 1.65 && gap <= 2.2);
    }
    assert.equal(
      s.obstacles.some((obstacle) =>
        [-1, 0, 1].every((lane) =>
          s.obstacles.some((other) => other.at === obstacle.at && other.lane === lane),
        ),
      ),
      false,
      "early rows still keep a lane open",
    );
    const fresh = run(),
      legacy = run();
    Object.assign(fresh, { seed, nextRow: 9050, distance: 9700 });
    Object.assign(legacy, { seed, nextRow: 9050, distance: 9700 });
    delete legacy.rowBurstRemaining;
    generateAhead(fresh);
    generateAhead(legacy);
    assert.deepEqual(legacy.obstacles, fresh.obstacles);
    assert.ok(Number.isFinite(legacy.nextRow));
  }
});

test("short generated bursts allow complete jump/slide recovery while accelerating and at 5.5x", () => {
  for (const seed of [3, 18, 67, 241])
    for (const [start, end] of [
      [50, 1200],
      [8400, 9400],
      [9050, 12200],
    ]) {
      const { primary } = spacingRows(seed, start, end);
      const s = run();
      const firstSpeed = Math.min(MAX_SPEED, 12 + primary[0] * 0.006);
      Object.assign(s, { distance: primary[0] - firstSpeed * 0.5, speed: firstSpeed });
      s.obstacles = primary.map((at, index) => ({
        id: index,
        lane: 0,
        at,
        kind: index % 2 ? "arch" : "block",
        resolved: false,
      }));
      const obstacles = [...s.obstacles];
      let action = 0;
      for (
        let frames = 0;
        frames < 18000 && s.mode === "running" && s.distance < primary.at(-1) + 1;
        frames++
      ) {
        if (
          action < obstacles.length &&
          s.distance >=
            obstacles[action].at - Math.min(MAX_SPEED, 12 + obstacles[action].at * 0.006) * 0.36
        ) {
          assert.equal(s.jump, 0, "the prior jump has fully finished");
          assert.equal(s.slide, 0, "the prior slide has fully finished");
          assert.equal(act(s, obstacles[action].kind === "block" ? "jump" : "slide"), true);
          action++;
        }
        update(s, 1 / 120);
      }
      assert.equal(action, obstacles.length);
      assert.equal(s.mode, "running");
      assert.equal(s.review, null);
      assert.equal(s.stumbles, 0);
      assert.equal(s.shieldAbsorbed, 0);
      assert.ok(obstacles.every((obstacle) => obstacle.resolved));
    }
});

test("the 1.2-second spacing floor keeps full closure and following jump guides separate even as speed increases", (t) => {
  let minimumNormalizedGap = Infinity,
    minimumActualSeconds = Infinity;
  let count = 0;
  for (const [start, end] of [
    [50, 1200],
    [8400, 9400],
    [9050, 12200],
  ])
    for (let seed = 1; seed <= 60; seed++) {
      const { primary } = spacingRows(seed, start, end);
      for (let i = 1; i < primary.length; i++) {
        const before = primary[i - 1],
          after = primary[i];
        const speedBefore = Math.min(MAX_SPEED, 12 + before * 0.006),
          speedAfter = Math.min(MAX_SPEED, 12 + after * 0.006);
        // Use the longest possible previous closure tail and next jump lead;
        // this is stricter than the actual mix of generated obstacle rows.
        const clearMeters = after - speedAfter * 0.46 - (before + speedBefore * 0.68);
        assert.ok(clearMeters > speedBefore * 0.05, `row envelopes overlap near${after}m`);
        minimumNormalizedGap = Math.min(minimumNormalizedGap, clearMeters / speedBefore);
        const cap = Math.min(after, 9000);
        const seconds =
          before >= 9000
            ? (after - before) / MAX_SPEED
            : Math.log((12 + 0.006 * cap) / (12 + 0.006 * before)) / 0.006 +
              Math.max(0, after - 9000) / MAX_SPEED;
        assert.ok(seconds > 1.195, "acceleration must leave the complete action recovery window");
        minimumActualSeconds = Math.min(minimumActualSeconds, seconds);
        count++;
      }
    }
  t.diagnostic(
    `${count} adjacent row pairs: minimum actual travel ${minimumActualSeconds.toFixed(4)}s, closure/jump-guide margin ${minimumNormalizedGap.toFixed(4)} speed-seconds`,
  );
});

test("special gates wait through warmup and reserve approaches without ordinary obstacles or coin trails", () => {
  const s = run();
  Object.assign(s, { time: 10, distance: 420, nextForkAt: 430, nextRailAt: 460, nextRow: 430 });
  update(s, 0.1);
  assert.equal(s.fork, null);
  assert.equal(s.rail, null);
  assert.ok(s.nextForkAt > s.distance + 140);
  assert.ok(s.nextRailAt > s.distance + 160);
  const fork = run();
  Object.assign(fork, {
    time: FORK_UNLOCK_TIME,
    distance: 400,
    nextForkAt: 500,
    nextRailAt: 1000,
    nextRow: 430,
  });
  fork.obstacles = [{ id: 1, lane: 0, at: 490, kind: "pillar", resolved: false }];
  fork.pickups = [{ id: 2, lane: 1, at: 500, taken: false }];
  fork.relics = [{ id: 3, lane: 0, at: 510, kind: "rush", taken: false }];
  update(fork, 0.01);
  assert.equal(fork.fork.at, 500);
  assert.ok(
    [...fork.obstacles, ...fork.pickups, ...fork.relics].every((o) => o.at < 467 || o.at > 535.1),
  );
});

test("fork choices begin a real turn, center misses fail, and approach or landing collisions cannot ambush the player", () => {
  for (const lane of [-1, 1])
    for (const step of [1 / 30, 0.25]) {
      const s = run();
      s.distance = 1000;
      s.nextForkAt = 1000.01;
      s.fork = { at: 1000.01 };
      s.lane = lane;
      s.x = lane * LANE_WIDTH;
      s.obstacles = [{ id: 1, lane: 0, at: 1001, kind: "pillar", resolved: false }];
      s.pickups = [{ id: 2, lane: 0, at: 1001, taken: false }];
      update(s, step);
      assert.equal(s.mode, "running");
      assert.equal(s.turnDirection, lane);
      assert.ok(s.turnRemaining > 0);
      assert.equal(s.lastForkAt, 1000.01);
      assert.equal(s.fork, null);
      assert.equal(s.lane, 0);
      assert.equal(act(s, "left"), false);
      assert.ok(s.obstacles.every((o) => o.at > s.distance + 50));
      advance(s, TURN_DURATION);
      assert.equal(s.turnRemaining, 0);
      assert.equal(s.mode, "running");
    }
  const miss = run();
  miss.nextForkAt = miss.distance + 0.01;
  miss.fork = { at: miss.nextForkAt };
  miss.boosts.shield = 3;
  miss.boosts.shieldTime = 20;
  update(miss, 0.1);
  assert.equal(miss.mode, "over");
  assert.match(miss.reason, /center route is closed/);
  assert.ok(miss.fork);
});

test("fork and railway scheduling stays separate from portals and each other", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = run();
    s.seed = seed;
    s.distance = 2380;
    s.nextForkAt = 2490;
    s.nextRailAt = 2510;
    s.nextPortalAt = 2500;
    update(s, 0.1);
    assert.ok(Math.abs(s.nextForkAt - s.nextRailAt) >= 300);
    for (const at of [s.nextForkAt, s.nextRailAt])
      assert.ok(Math.abs(at - Math.round(at / 2500) * 2500) >= 270);
  }
});

test("each rail ride chooses three or four distinct complete bilingual questions and shuffles answer lanes", () => {
  const counts = new Set(),
    lanes = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const s = board(seed);
    counts.add(s.rail.questions.length);
    assert.equal(new Set(s.rail.questions).size, s.rail.questions.length);
    const again = board(seed);
    assert.deepEqual(again.rail, s.rail);
    advance(s, 2.01);
    assert.equal(s.rail.phase, "question");
    assert.equal(s.rail.duration, railQuestionDuration(currentRailQuestion(s)));
    assert.deepEqual([...s.rail.optionOrder].sort(), [0, 1, 2]);
    lanes.add(correctLane(s));
  }
  assert.deepEqual([...counts].sort(), [3, 4]);
  assert.equal(lanes.size, 3);
  for (const q of RAIL_QUESTIONS) {
    assert.ok(q.prompt.en && q.prompt.zh);
    for (const o of q.options) assert.ok(o.label.en && o.label.zh && o.why.en && o.why.zh);
  }
});

test("rail phases advance mileage while freezing normal run time, boosts, chase and skill charge; pause freezes everything", () => {
  const s = board();
  s.boosts.magnet = 12;
  s.boosts.rush = 9;
  s.boosts.shield = 2;
  s.boosts.shieldTime = 10;
  s.chase = 4;
  s.skillCharge = 55;
  s.pickups = [{ id: 1, lane: 0, at: s.distance + 0.1, height: 1, taken: false }];
  s.obstacles = [{ id: 2, lane: 0, at: s.distance + 0.1, kind: "pillar", resolved: false }];
  const initialDistance = s.distance;
  const expected = {
    time: s.time,
    boosts: structuredClone(s.boosts),
    chase: s.chase,
    coins: s.coins,
    charge: s.skillCharge,
  };
  advance(s, 4);
  assert.deepEqual(
    {
      time: s.time,
      boosts: s.boosts,
      chase: s.chase,
      coins: s.coins,
      charge: s.skillCharge,
    },
    expected,
  );
  assert.ok(Math.abs(s.distance - initialDistance - 4 * railSpeed(s)) < 1e-7);
  assert.equal(s.score, Math.floor(s.distance * 10) + s.coins * 50);
  assert.equal(s.review, null);
  togglePause(s);
  const paused = structuredClone(s);
  advance(s, 20);
  assert.deepEqual(s, paused);
  togglePause(s);
  assert.equal(s.mode, "running");
});

test("rail input accepts lane intent, ignores outer presses, and cannot be skipped with jumping, sliding, or boosters", () => {
  const s = board();
  advance(s, 2.01);
  s.lane = -1;
  s.x = -LANE_WIDTH;
  assert.equal(act(s, "left"), false);
  assert.equal(s.stumbles, 0);
  assert.equal(s.edgeStumble, 0);
  assert.equal(act(s, "jump"), false);
  assert.equal(act(s, "slide"), false);
  assert.equal(s.jump, 0);
  assert.equal(s.slide, 0);
  for (const kind of ["shield", "magnet", "rush", "headstart"])
    assert.equal(activateBoost(s, kind), false);
  assert.equal(startSceneTravel(s, "winter"), false);
  assert.equal(selectRailLane(s, 1), true);
  assert.equal(s.lane, 1);
  const lane = correctLane(s);
  s.lane = ((lane + 2) % 3) - 1;
  s.x = -lane * LANE_WIDTH;
  selectRailLane(s, lane);
  advance(s, s.rail.remaining + 0.01);
  assert.equal(
    s.rail.correct,
    true,
    "latest intended lane counts even when animation is still crossing",
  );
});

test("wrong answers fall before ending and keep option-specific explanations plus the correct choice", () => {
  for (const step of [1 / 30, 1 / 144, 0.25]) {
    const s = board();
    advance(s, 2.01, step);
    const q = currentRailQuestion(s);
    const wrong = ((correctLane(s) + 2) % 3) - 1;
    selectRailLane(s, wrong);
    s.boosts.rush = 10;
    s.boosts.shield = 3;
    s.boosts.shieldTime = 20;
    advance(s, s.rail.remaining + 0.01, step);
    assert.equal(s.rail.phase, "falling");
    assert.equal(s.mode, "running");
    assert.equal(s.rail.correct, false);
    const option = s.rail.failure.optionIndex;
    assert.notEqual(option, q.correctIndex);
    advance(s, 1.21, step);
    assert.equal(s.mode, "over");
    assert.equal(s.rail.phase, "falling");
    assert.ok(s.reason.includes(q.options[option].why.en));
    assert.ok(s.reason.includes(q.options[q.correctIndex].label.en));
    assert.equal(s.coins, 0);
    assert.equal(s.review, null);
  }
});

test("all correct rail answers finish with one coin reward and a clear protected landing", () => {
  for (const seed of [1, 7, 12, 4182]) {
    const s = board(seed);
    let p = createProgress();
    let checked = 0;
    advance(s, 2.01);
    while (s.rail.phase !== "complete") {
      assert.equal(s.rail.phase, "question");
      selectRailLane(s, correctLane(s));
      advance(s, s.rail.remaining + 0.01);
      assert.equal(s.rail.phase, "feedback");
      assert.equal(s.rail.correct, true);
      checked++;
      assert.equal(selectRailLane(s, 1), false);
      advance(s, s.rail.remaining + 0.01);
    }
    assert.equal(checked, s.rail.questions.length);
    const reward = s.rail.reward;
    assert.equal(s.coins, 0);
    advance(s, s.rail.remaining + 0.01);
    assert.equal(s.rail, null);
    assert.equal(s.mode, "running");
    assert.equal(s.coins, reward);
    assert.ok(s.boosts.grace > 1);
    p = bankRunRewards(s, p);
    assert.equal(p.wallet, reward);
    assert.equal(bankRunRewards(s, p), p);
    assert.ok(s.nextRailAt > s.distance + 1400);
    assert.ok(s.nextForkAt > s.distance + 400);
    assert.ok(s.obstacles.every((o) => o.at > s.distance + 70));
    advance(s, 0.2);
    assert.equal(s.coins, reward);
  }
});

test("outer-edge mistakes briefly stumble and recover during any chase, including quick duplicate presses", () => {
  for (const lane of [-1, 1])
    for (const time of [0, 0.2, MONSTER_INTRO(), 30]) {
      const s = run();
      s.time = time;
      s.lane = lane;
      s.x = lane * LANE_WIDTH;
      s.chase = time > 10 ? 3 : 0;
      const outward = lane < 0 ? "left" : "right";
      act(s, outward);
      assert.equal(s.mode, "running");
      assert.equal(s.edgeStumble, EDGE_STUMBLE_DURATION);
      assert.equal(s.edgeStumbleDirection, lane);
      assert.ok(s.boosts.grace >= 0.5);
      assert.equal(s.stumbles, 1);
      for (let i = 0; i < 8; i++) act(s, outward);
      assert.equal(s.mode, "running");
      assert.equal(s.stumbles, 1);
      advance(s, 0.5);
      act(s, outward);
      assert.equal(s.stumbles, 1);
      advance(s, 0.2);
      assert.equal(s.edgeStumble, 0);
      act(s, outward);
      assert.equal(s.stumbles, 2);
      assert.equal(s.mode, "running");
    }
  function MONSTER_INTRO() {
    return 3.49;
  }
});

test("ordinary roots remain fatal during a chase once edge recovery protection expires", () => {
  const s = run();
  s.lane = -1;
  s.x = -LANE_WIDTH;
  act(s, "left");
  advance(s, 0.7);
  s.obstacles = [{ id: 1, lane: -1, at: s.distance + 0.01, kind: "roots", resolved: false }];
  update(s, 0.1);
  assert.equal(s.mode, "over");
  assert.equal(s.review.kind, "roots");
});

test("home autoplay never displays, enters or remains stuck in forks, rails or transport", () => {
  const s = run();
  s.distance = 2200;
  s.nextForkAt = 2200.01;
  s.fork = { at: 2200.01 };
  s.nextRailAt = 2200.02;
  s.rail = createRailRide(() => 0.3);
  s.nextPortalAt = 2200.03;
  s.scene = "summer";
  for (let i = 0; i < 50; i++) advancePreview(s, 0.1);
  assert.equal(s.fork, null);
  assert.equal(s.rail, null);
  assert.equal(s.nextForkAt, Infinity);
  assert.equal(s.nextRailAt, Infinity);
  assert.equal(s.nextPortalAt, Infinity);
  assert.equal(s.turnRemaining, 0);
  assert.equal(s.scene, "summer");
});

test("repeated edge mistakes extend an existing chase without hiding or restarting approaching pursuers", () => {
  for (const lane of [-1, 1]) {
    const outward = lane < 0 ? "left" : "right";
    const first = run();
    first.lane = lane;
    first.x = lane * LANE_WIDTH;
    act(first, outward);
    assert.equal(monsterPresence(first), 0, "a new chase still starts behind the camera");
    advance(first, 0.7);
    const approaching = monsterPresence(first);
    assert.ok(approaching > 0 && approaching < 1);
    act(first, outward);
    assert.equal(
      monsterPresence(first),
      approaching,
      "another edge mistake does not restart the visible approach",
    );
    advance(first, 0.7);
    assert.equal(monsterPresence(first), 1);
    const remaining = first.chase;
    act(first, outward);
    assert.equal(monsterPresence(first), 1, "fully visible pursuers remain visible");
    assert.ok(first.chase > remaining, "the mistake extends the chase");
    assert.equal(first.mode, "running");

    const retreating = run();
    retreating.lane = lane;
    retreating.x = lane * LANE_WIDTH;
    retreating.chase = 0.6;
    const before = monsterPresence(retreating);
    act(retreating, outward);
    assert.ok(
      monsterPresence(retreating) >= before,
      "a retreating pursuer comes closer instead of disappearing",
    );
    assert.equal(retreating.mode, "running");
  }
});

test("the railway visual clock stays continuous across phases, pauses with play, and upgrades legacy rides", () => {
  const s = board();
  const initial = s.rail.elapsed;
  const distance = s.distance;
  const time = s.time;
  advance(s, 2.01);
  assert.equal(s.rail.phase, "question");
  assert.ok(Math.abs(s.rail.elapsed - initial - 2.01) < 1e-8);
  const questionElapsed = s.rail.elapsed;
  const untilNextQuestion = s.rail.remaining + 1.62;
  selectRailLane(s, correctLane(s));
  advance(s, untilNextQuestion);
  assert.equal(s.rail.phase, "question");
  assert.equal(s.rail.index, 1);
  assert.ok(Math.abs(s.rail.elapsed - questionElapsed - untilNextQuestion) < 1e-8);
  assert.ok(Math.abs(s.distance - distance - (s.rail.elapsed - initial) * railSpeed(s)) < 1e-7);
  assert.equal(s.time, time);

  togglePause(s);
  const paused = s.rail.elapsed;
  advance(s, 4);
  assert.equal(s.rail.elapsed, paused);
  togglePause(s);
  delete s.rail.elapsed;
  advance(s, 0.1);
  assert.ok(Math.abs(s.rail.elapsed - 0.1) < 1e-8);
});

test("railway questions preserve the previous chosen lane and cart position instead of recentering", () => {
  const lanes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const s = board(seed);
    advance(s, 2.01);
    const lane = correctLane(s);
    lanes.add(lane);
    selectRailLane(s, lane);
    advance(s, s.rail.remaining + 0.01);
    assert.equal(s.rail.phase, "feedback");
    assert.equal(s.lane, lane);
    assert.ok(Math.abs(s.x - lane * LANE_WIDTH) < 1e-8);
    const x = s.x;
    advance(s, s.rail.remaining + 0.01);
    assert.equal(s.rail.phase, "question");
    assert.equal(s.rail.index, 1);
    assert.equal(s.lane, lane, `seed ${seed}: previous selection was ${lane}`);
    assert.ok(Math.abs(s.x - x) < 1e-8, "the cart does not move without new input");
    assert.equal(s.rail.answerLane, null, "the next question still awaits its gate");
    assert.deepEqual([...s.rail.optionOrder].sort(), [0, 1, 2]);
    const nextLane = lane === 1 ? 0 : lane + 1;
    assert.equal(selectRailLane(s, nextLane), true);
    advance(s, 0.1);
    assert.equal(s.lane, nextLane);
    assert.ok(Math.abs(s.x - x) > 0.1, "new input can still choose another track");
  }
  assert.deepEqual([...lanes].sort(), [-1, 0, 1]);
});

test("the railway return transition protects a frozen runway, pauses, then restores normal controls", () => {
  const s = board();
  s.rail.phase = "complete";
  s.rail.remaining = 0.001;
  s.rail.reward = 45;
  s.boosts.magnet = 8;
  s.chase = 3;
  s.skillCharge = 55;
  update(s, 0.005);
  assert.equal(s.rail, null);
  assert.equal(s.railReturnRemaining, RAIL_RETURN_DURATION);
  assert.equal(RAIL_RETURN_DURATION, 1.1);
  const frozen = {
    distance: s.distance,
    time: s.time,
    boosts: structuredClone(s.boosts),
    chase: s.chase,
    coins: s.coins,
    charge: s.skillCharge,
  };
  for (const action of ["left", "right", "jump", "slide"]) assert.equal(act(s, action), false);
  for (const kind of ["shield", "magnet", "rush", "headstart"])
    assert.equal(activateBoost(s, kind), false);
  assert.equal(startSceneTravel(s, "winter"), false);
  advance(s, 0.3);
  assert.ok(s.railReturnRemaining > 0);
  assert.deepEqual(
    {
      distance: s.distance,
      time: s.time,
      boosts: s.boosts,
      chase: s.chase,
      coins: s.coins,
      charge: s.skillCharge,
    },
    frozen,
  );
  togglePause(s);
  const remaining = s.railReturnRemaining;
  advance(s, 3);
  assert.equal(s.railReturnRemaining, remaining);
  togglePause(s);
  advance(s, remaining);
  assert.equal(s.railReturnRemaining, 0);
  assert.equal(s.distance, frozen.distance);
  assert.equal(act(s, "right"), true);
  advance(s, 0.1);
  assert.ok(s.distance > frozen.distance);
  assert.ok(s.time > frozen.time);
  assert.ok(s.boosts.magnet < frozen.boosts.magnet);
  assert.equal(s.coins, 45, "the transition cannot pay the reward twice");
});

test("forks retain the exact entry pose and follow the physical branch during late reversed inputs", () => {
  for (const physicalLane of [-1, 1])
    for (const targetLane of [-physicalLane, 0, physicalLane]) {
      const s = run();
      s.nextForkAt = s.distance + 0.001;
      s.fork = { at: s.nextForkAt };
      s.lane = targetLane;
      s.x = physicalLane * LANE_WIDTH * 0.73;
      const entry = s.x;
      update(s, 1 / 120);
      assert.equal(s.mode, "running");
      assert.equal(
        s.turnDirection,
        physicalLane,
        "turn follows the occupied track, not a late opposite intention",
      );
      assert.equal(s.turnEntryX, entry);
      assert.equal(s.x, 0);
      assert.equal(s.lane, 0);
      assert.ok(s.turnRemaining > 0);
    }
  for (const targetLane of [-1, 1]) {
    const s = run();
    s.nextForkAt = s.distance + 0.001;
    s.fork = { at: s.nextForkAt };
    s.lane = targetLane;
    s.x = targetLane * LANE_WIDTH * 0.4;
    update(s, 1 / 120);
    assert.equal(
      s.mode,
      "over",
      "a body still inside the blocked center cannot teleport onto an outer track",
    );
  }
});

function railApproachSample(seed, gate) {
  const s = run();
  Object.assign(s, {
    seed,
    distance: gate - Math.max(160, Math.min(MAX_SPEED, 12 + gate * 0.006) * 6),
    nextRailAt: gate,
    nextRow: gate - 400,
    rows: 20,
    speed: Math.min(MAX_SPEED, 12 + (gate - 160) * 0.006),
  });
  s.boosts.grace = 1e6;
  let lastObstacle = -Infinity;
  for (let frames = 0; frames < 1000 && !s.rail; frames++) {
    const oldDistance = s.distance;
    update(s, 1 / 30);
    for (const obstacle of s.obstacles)
      if (
        obstacle.resolved &&
        obstacle.at >= oldDistance - 0.3 &&
        obstacle.at <= s.distance + 0.22 &&
        obstacle.at < gate
      )
        lastObstacle = Math.max(lastObstacle, obstacle.at);
    if (!s.rail && gate - s.distance <= s.speed) {
      for (const object of [...s.obstacles, ...s.pickups, ...s.relics])
        assert.ok(
          object.at < s.distance || object.at > gate,
          "the entire one-second boarding fade is clear",
        );
    }
  }
  assert.equal(s.rail?.phase, "boarding");
  assert.ok(Number.isFinite(lastObstacle));
  const speed = Math.min(MAX_SPEED, 12 + gate * 0.006);
  return { meters: gate - lastObstacle, seconds: (gate - lastObstacle) / speed };
}

test("first-station and maximum-speed approaches use short speed-scaled gaps without hidden fixed padding", (t) => {
  for (const station of ["first", "maximum"]) {
    const samples = [];
    for (let seed = 1; seed <= 30; seed++)
      samples.push(railApproachSample(seed, station === "first" ? 930 + (seed % 120) : 9400));
    const average = samples.reduce((sum, value) => sum + value.seconds, 0) / samples.length;
    t.diagnostic(
      `${station}: ${Math.min(...samples.map((s) => s.meters)).toFixed(1)}–${Math.max(...samples.map((s) => s.meters)).toFixed(1)}m, average ${average.toFixed(2)}s from last obstacle to station`,
    );
    assert.ok(average < 2.7, `${station} approach averages ${average.toFixed(2)} seconds`);
    assert.ok(
      samples.every((sample) => sample.seconds >= 1.45),
      "last obstacle leaves recovery time before the one-second fade",
    );
    assert.ok(
      samples.every((sample) => sample.seconds < 4.1),
      "even a random breather cannot add the retired 45-meter pad",
    );
    if (station === "first") {
      assert.ok(samples.some((sample) => sample.meters < 45));
      assert.ok(samples.every((sample) => sample.meters < 68));
    }
  }
});

test("jump and slide finish safely before the shortened railway entry fade begins", () => {
  for (const gate of [1000, 9400])
    for (const kind of ["block", "arch"]) {
      const speed = Math.min(MAX_SPEED, 12 + gate * 0.006);
      const obstacleAt = gate - speed * 1.78 - 0.1;
      const s = run();
      Object.assign(s, { distance: obstacleAt - speed * 0.36, nextRailAt: gate, speed });
      s.obstacles = [{ id: 1, lane: 0, at: obstacleAt, kind, resolved: false }];
      act(s, kind === "block" ? "jump" : "slide");
      while (s.mode === "running" && s.distance < gate - speed) update(s, 1 / 120);
      assert.equal(s.mode, "running");
      assert.equal(s.review, null);
      assert.equal(s.jump, 0);
      assert.equal(s.slide, 0);
      assert.ok(s.obstacles.every((obstacle) => obstacle.at < s.distance || obstacle.at > gate));
    }
});

function forkBufferSample(seed, gate) {
  const s = run();
  const speed = Math.min(MAX_SPEED, 12 + gate * 0.006);
  Object.assign(s, {
    seed,
    distance: gate - Math.max(150, speed * 7),
    nextForkAt: gate,
    nextRow: gate - Math.max(220, speed * 9),
    rows: 20,
    speed,
    lane: -1,
    x: -LANE_WIDTH,
  });
  s.boosts.grace = 1e6;
  let lastObstacle = -Infinity;
  let crossedAt = null;
  let unlockedAt = null;
  let firstAfter = Infinity;
  for (let frame = 0; frame < 1600; frame++) {
    if (s.fork && !s.turnRemaining) {
      const target = s.fork.blockedDirection === -1 ? 1 : -1;
      if (s.lane !== target) act(s, target < s.lane ? "left" : "right");
    }
    const previousDistance = s.distance;
    update(s, 1 / 60);
    for (const obstacle of s.obstacles) {
      if (
        obstacle.resolved &&
        obstacle.at >= previousDistance - 0.3 &&
        obstacle.at <= s.distance + 0.22 &&
        obstacle.at < gate
      )
        lastObstacle = Math.max(lastObstacle, obstacle.at);
      if (s.lastForkAt === gate && obstacle.at > gate)
        firstAfter = Math.min(firstAfter, obstacle.at);
    }
    if (s.lastForkAt === gate && crossedAt == null) crossedAt = s.time;
    if (crossedAt != null && !s.turnRemaining && unlockedAt == null) {
      unlockedAt = s.time;
      assert.equal(act(s, "left"), true, "movement returns as soon as the visual turn ends");
    }
    if (unlockedAt != null && firstAfter < Infinity && s.distance > firstAfter + 1) break;
    assert.equal(s.mode, "running");
    if (s.fork && gate - s.distance <= speed * 2.2) {
      assert.ok(
        s.obstacles.every((o) => o.at < s.distance || o.at > gate),
        "the camera's fork approach is clear",
      );
    }
  }
  assert.ok(Number.isFinite(lastObstacle));
  assert.ok(Number.isFinite(firstAfter));
  assert.ok(unlockedAt != null);
  return {
    before: (gate - lastObstacle) / speed,
    after: (firstAfter - gate) / speed,
    beforeMeters: gate - lastObstacle,
    afterMeters: firstAfter - gate,
    unlockSeconds: unlockedAt - crossedAt,
  };
}

test("fork buffers scale with speed without fixed extra padding, and retain reaction time after the turn", (t) => {
  for (const stage of ["first", "maximum"]) {
    const samples = [];
    for (let seed = 1; seed <= 30; seed++)
      samples.push(forkBufferSample(seed, stage === "first" ? 430 + seed : 9400));
    const meanBefore = samples.reduce((sum, sample) => sum + sample.before, 0) / samples.length;
    const meanAfter = samples.reduce((sum, sample) => sum + sample.after, 0) / samples.length;
    t.diagnostic(
      `${stage} fork: approach average ${meanBefore.toFixed(2)}s (${Math.min(...samples.map((s) => s.beforeMeters)).toFixed(1)}–${Math.max(...samples.map((s) => s.beforeMeters)).toFixed(1)}m); exit average ${meanAfter.toFixed(2)}s (${Math.min(...samples.map((s) => s.afterMeters)).toFixed(1)}–${Math.max(...samples.map((s) => s.afterMeters)).toFixed(1)}m)`,
    );
    assert.ok(meanBefore < 4.1, `approach averages ${meanBefore}s`);
    assert.ok(meanAfter < 3.2, `exit averages ${meanAfter}s`);
    assert.ok(samples.every((s) => s.before >= 2.4 && s.before < 5.6));
    assert.ok(samples.every((s) => s.after >= 2.8 && s.after < 3.5));
    assert.ok(
      samples.every((s) => s.after - s.unlockSeconds >= 1.3),
      "the first obstacle leaves at least 1.3s to react after input unlock",
    );
    if (stage === "first")
      assert.ok(samples.every((s) => s.beforeMeters < 85 && s.afterMeters < 50));
  }
});

test("mileage and score accumulate at cart speed throughout every moving rail phase and stop while paused", () => {
  assert.equal(RAIL_SPEED, 12);
  for (const phase of ["boarding", "question", "feedback", "falling", "complete"]) {
    const s = board();
    s.rail.phase = phase;
    s.rail.remaining = 3;
    s.rail.duration = 3;
    s.coins = 7;
    s.speed = MAX_SPEED;
    s.boosts.rush = 12;
    s.chase = 4;
    s.skillCharge = 60;
    const distance = s.distance,
      runTime = s.time;
    advance(s, 0.5);
    assert.ok(
      Math.abs(s.distance - distance - railSpeed(s) * 0.5) < 1e-7,
      `${phase} should use the ride's latched pace`,
    );
    assert.equal(s.score, Math.floor(s.distance * 10) + 350);
    assert.equal(s.time, runTime);
    assert.equal(s.boosts.rush, 12);
    assert.equal(s.chase, 4);
    assert.equal(s.skillCharge, 60);
    togglePause(s);
    const paused = structuredClone(s);
    advance(s, 3);
    assert.deepEqual(s, paused);
  }
});

test("rail travel handles passed milestones and portals once and returns to a clean road at its new mileage", () => {
  const s = board();
  Object.assign(s, {
    distance: 2495,
    milestone: 2000,
    milestoneRemaining: 0,
    nextPortalAt: 2500,
    portalLane: 0,
    nextForkAt: 2510,
    nextRow: 2506,
    nextRelicAt: 2508,
  });
  s.rail.phase = "complete";
  s.rail.remaining = 2;
  s.rail.reward = 45;
  s.obstacles = [{ id: 1, lane: 0, at: 2506, kind: "pillar", resolved: false }];
  s.pickups = [{ id: 2, lane: 0, at: 2507, taken: false }];
  s.relics = [{ id: 3, lane: 0, at: 2508, kind: "rush", taken: false }];
  const scene = s.scene;
  const expectedDistance = s.distance + 2 * railSpeed(s);
  advance(s, 2.01);
  assert.equal(s.rail, null);
  assert.ok(Math.abs(s.distance - expectedDistance) < 1e-6);
  assert.equal(s.score, Math.floor(s.distance * 10) + 45 * 50);
  assert.equal(s.coins, 45);
  assert.equal(s.milestone, 2500);
  assert.ok(s.milestoneRemaining > 0);
  assert.equal(s.nextPortalAt, 5000);
  assert.equal(s.scene, scene);
  assert.equal(s.sceneTransition, 0);
  assert.ok(s.nextForkAt >= s.distance + 420);
  assert.ok(s.nextRailAt >= s.distance + 1500);
  assert.ok(s.nextRow > s.distance);
  assert.ok(
    Math.log((12 + 0.006 * s.nextRelicAt) / (12 + 0.006 * s.distance)) / 0.006 >= 22 - 1e-8,
    "passed power-up opportunities are rescheduled, not replayed",
  );
  assert.equal(s.obstacles.length, 0);
  assert.equal(s.pickups.length, 0);
  assert.equal(s.relics.length, 0);
  const milestoneRemaining = s.milestoneRemaining;
  advance(s, s.railReturnRemaining);
  assert.equal(
    s.milestoneRemaining,
    milestoneRemaining,
    "return preview freezes gameplay counters",
  );
  advance(s, 0.1);
  assert.equal(s.mode, "running");
  assert.equal(s.sceneTransition, 0);
  assert.equal(s.nextPortalAt, 5000);
  assert.equal(s.milestone, 2500);
  assert.ok(
    s.milestoneRemaining < milestoneRemaining,
    "the same milestone is not fired a second time",
  );
  assert.equal(s.coins, 45, "a return cannot award the quiz reward twice");
});

test("wrong-answer falling earns only its moving distance, then freezes final totals at game over", () => {
  const s = board();
  advance(s, 2.01);
  const wrong = ((correctLane(s) + 2) % 3) - 1;
  selectRailLane(s, wrong);
  advance(s, s.rail.remaining + 0.01);
  assert.equal(s.rail.phase, "falling");
  const distance = s.distance;
  advance(s, 0.4);
  assert.ok(Math.abs(s.distance - distance - 0.4 * railSpeed(s)) < 1e-7);
  advance(s, 1);
  assert.equal(s.mode, "over");
  assert.equal(s.score, Math.floor(s.distance * 10));
  assert.equal(s.coins, 0);
  const final = structuredClone(s);
  advance(s, 10);
  assert.deepEqual(s, final);
});

test("cart pace follows normal progression, caps at 30m/s, and stays stable across question gates", () => {
  assert.equal(MAX_RAIL_SPEED, 30);
  const paces = [];
  for (const distance of [930, 2000, 5000, 10000]) {
    const s = board(7, distance);
    const pace = railSpeed(s);
    const boardingDistance = s.distance - s.rail.elapsed * pace;
    const entryNormal = Math.min(MAX_SPEED, 12 + boardingDistance * 0.006);
    assert.equal(s.rail.entryNormalSpeed, entryNormal);
    assert.equal(pace, Math.min(MAX_RAIL_SPEED, entryNormal));
    paces.push(pace);
    s.boosts.rush = 12;
    s.boosts.headstart = 5;
    s.speed = MAX_SPEED * 2;
    advance(s, s.rail.remaining);
    assert.equal(s.rail.phase, "question");
    assert.equal(
      railSpeed(s),
      pace,
      "boosts and new rail mileage cannot move an answer gate's deadline",
    );
    assert.equal(s.rail.duration, railQuestionDuration(currentRailQuestion(s)));
    const start = s.distance;
    const gateAt = start + s.rail.remaining * pace;
    selectRailLane(s, correctLane(s));
    advance(s, s.rail.remaining);
    assert.equal(s.rail.phase, "feedback");
    assert.ok(
      Math.abs(s.distance - gateAt) < 1e-6,
      "rendered gate and mileage meet at the answer deadline",
    );
  }
  assert.ok(paces[1] > paces[0]);
  assert.equal(paces[2], MAX_RAIL_SPEED);
  assert.equal(paces[3], MAX_RAIL_SPEED);
});

test("temporary speed boosts at boarding do not inflate cart pace or its normal progression multiplier", () => {
  for (const boost of ["headstart", "portal", "rush"]) {
    const s = run();
    s.distance = 930;
    s.nextRailAt = s.distance + 0.01;
    s.boosts[boost] = 8;
    update(s, 0.01);
    assert.equal(s.rail.phase, "boarding");
    const boardingDistance = s.distance - s.rail.elapsed * railSpeed(s);
    const normal = Math.min(MAX_SPEED, 12 + boardingDistance * 0.006);
    assert.equal(s.rail.entryNormalSpeed, normal);
    assert.equal(railSpeed(s), normal);
    assert.ok(s.speed > normal);
  }
});

test("legacy in-memory rides acquire one stable pace without changing question timing", () => {
  const s = board(12, 2400);
  delete s.rail.speed;
  delete s.rail.entryNormalSpeed;
  const expected = Math.min(MAX_RAIL_SPEED, 12 + s.distance * 0.006);
  const before = s.distance;
  const timer = s.rail.remaining;
  assert.equal(railSpeed(s), expected);
  advance(s, 0.2);
  assert.equal(s.rail.speed, expected);
  assert.ok(Math.abs(s.distance - before - expected * 0.2) < 1e-7);
  assert.ok(Math.abs(s.rail.remaining - timer + 0.2) < 1e-7);
  s.distance += 10000;
  advance(s, 0.1);
  assert.equal(railSpeed(s), expected, "a live ride never drifts after migration");
});

test("successful cart rewards grow with run progression, reach 100 coins by 10km, and pay once", (t) => {
  const rewards = new Map();
  const readingWindows = new Map();
  for (const seed of [1, 7, 12, 4182]) {
    let previousReward = 0;
    for (const distance of [930, 2500, 5000, 10000]) {
      const s = board(seed, distance);
      const entryNormal = s.rail.entryNormalSpeed;
      advance(s, s.rail.remaining);
      while (s.rail.phase !== "complete") {
        assert.equal(s.rail.phase, "question");
        const question = currentRailQuestion(s);
        assert.equal(s.rail.duration, railQuestionDuration(question));
        if (!readingWindows.has(question.id)) readingWindows.set(question.id, s.rail.duration);
        assert.equal(s.rail.duration, readingWindows.get(question.id), "progression never reduces a question's reading time");
        selectRailLane(s, correctLane(s));
        advance(s, s.rail.remaining);
        assert.equal(s.rail.phase, "feedback");
        advance(s, s.rail.remaining);
      }
      const count = s.rail.questions.length;
      const reward = s.rail.reward;
      const expected = Math.ceil((30 + count * 5) * (1 + (entryNormal / 12 - 1) * 0.3));
      assert.equal(reward, expected);
      assert.ok(reward >= previousReward);
      previousReward = reward;
      if (distance === 10000) {
        assert.ok(reward >= 100);
        rewards.set(count, reward);
      }
      const before = s.coins;
      advance(s, s.rail.remaining);
      assert.equal(s.rail, null);
      assert.equal(s.coins, before + reward);
      advance(s, s.railReturnRemaining + 0.1);
      assert.equal(s.coins, before + reward);
      assert.equal(s.mode, "running");
    }
  }
  assert.deepEqual([...rewards.entries()].sort(), [
    [3, 106],
    [4, 118],
  ]);
  t.diagnostic(`10km rewards: ${JSON.stringify(Object.fromEntries(rewards))}`);
});

test("season transition preserves its source after the midpoint and clears it on finish or preview", () => {
  const s = run();
  assert.equal(s.sceneTransitionFrom, null);
  assert.equal(startSceneTravel(s, "summer"), true);
  assert.equal(s.sceneTransitionFrom, "spring");
  advance(s, 1.1);
  assert.equal(s.scene, "summer");
  assert.equal(s.pendingScene, null);
  assert.equal(s.sceneTransitionFrom, "spring");
  togglePause(s);
  const paused = structuredClone(s);
  advance(s, 2);
  assert.deepEqual(s, paused);
  togglePause(s);
  advance(s, 0.9);
  assert.equal(s.sceneTransition, 0);
  assert.equal(s.sceneTransitionFrom, null);
  assert.equal(startSceneTravel(s, "autumn"), true);
  assert.equal(s.sceneTransitionFrom, "summer");
  advancePreview(s, 0.1);
  assert.equal(s.sceneTransitionFrom, null);
  assert.equal(s.sceneTransition, 0);
  assert.equal(s.scene, "summer");
});
