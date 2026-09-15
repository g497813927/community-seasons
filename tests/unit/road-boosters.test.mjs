import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { createRun, update, act, generateAhead, JUMP_DURATION, RELIC_HEIGHT, MAX_SPEED } =
  await import("../helpers/compiled/engine.mjs");
const { BOOSTERS, boostDefinition, createBoostLevels, isConsumableKind } =
  await import("../helpers/compiled/boosts.mjs");
const { createProgress, bankRunRewards } = await import("../helpers/compiled/store.mjs");

function run(distance = 500) {
  return Object.assign(createRun(), {
    mode: "running",
    distance,
    time: 40,
    nextRow: 1e9,
    nextPortalAt: 1e9,
  });
}
function advance(s, seconds, levels = createBoostLevels(), fps = 120) {
  while (seconds > 1e-8) {
    const dt = Math.min(seconds, 1 / fps);
    update(s, dt, levels);
    seconds -= dt;
  }
}
function pickup(s, kind, ahead = 0.5) {
  const relic = {
    id: s.nextId++,
    kind,
    lane: 0,
    at: s.distance + ahead,
    height: RELIC_HEIGHT,
    taken: false,
  };
  s.relics.push(relic);
  return relic;
}
function jumping(s) {
  act(s, "jump");
  advance(s, 0.2);
}

test("seeded routes offer all four road boosters at jump height, with no head start or portal pickups", () => {
  const found = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const s = createRun(seed);
    Object.assign(s, { mode: "running", distance: 220 });
    generateAhead(s);
    for (const relic of s.relics) {
      found.add(relic.kind);
      assert.equal(relic.height, RELIC_HEIGHT);
      assert.ok(["shield", "doubleCoins", "magnet", "rush"].includes(relic.kind));
    }
  }
  assert.deepEqual([...found].sort(), ["doubleCoins", "magnet", "rush", "shield"]);
  assert.deepEqual(
    BOOSTERS.map((b) => b.id),
    ["headstart", "shield", "doubleCoins", "portal"],
  );
  assert.equal(isConsumableKind("magnet"), false);
  assert.equal(isConsumableKind("rush"), false);
});

test("Magnet and Momentum pickups activate immediately at the purchased level, once, without ownership or inventory", () => {
  for (const kind of ["magnet", "rush"])
    for (const level of [1, 2, 3])
      for (const fps of [30, 60, 144, 4]) {
        const s = run();
        const progress = createProgress();
        const inventory = structuredClone(progress.inventory);
        progress.levels[kind] = level;
        assert.equal(progress.skills[kind].unlocked, false);
        jumping(s);
        const relic = pickup(s, kind);
        advance(s, 0.15, progress.levels, fps);
        assert.equal(relic.taken, true, `${kind} L${level} at ${fps} fps`);
        assert.equal(s.collectedRelics[kind], 1);
        assert.equal(s.effectLevels[kind], level);
        assert.ok(s.boosts[kind] > boostDefinition(kind, level).duration - 0.15);
        assert.ok(s.boosts[kind] <= boostDefinition(kind, level).duration);
        assert.deepEqual(bankRunRewards(s, progress).inventory, inventory);
        advance(s, 0.5, progress.levels, fps);
        assert.equal(
          s.collectedRelics[kind],
          1,
          "a single pickup cannot refill itself on later frames",
        );
      }
});

test("Magnet and Momentum road pickups still require a jump and cannot be swept up by an active magnet", () => {
  for (const kind of ["magnet", "rush"])
    for (const motion of [null, "slide"]) {
      const s = run();
      s.boosts.magnet = 4;
      if (motion) act(s, motion);
      const relic = pickup(s, kind);
      advance(s, 0.5);
      assert.equal(relic.taken, false);
      assert.equal(s.collectedRelics[kind], 0);
    }
});

test("a collected Magnet pulls coins from every lane using its upgraded range", () => {
  const s = run();
  const levels = createBoostLevels();
  levels.magnet = 3;
  jumping(s);
  pickup(s, "magnet");
  update(s, 1 / 120, levels);
  s.jump = 0;
  const coins = [-1, 0, 1].map((lane, i) => ({
    id: s.nextId++,
    lane,
    at: s.distance + 10 + i * 0.1,
    height: 3.1,
    taken: false,
  }));
  s.pickups.push(...coins);
  update(s, 1 / 120, levels);
  assert.equal(s.coins, 3);
  assert.ok(coins.every((coin) => coin.taken));
});

test("a collected Momentum immediately speeds the run and protects against an otherwise fatal pillar", () => {
  const s = run(9000);
  jumping(s);
  pickup(s, "rush");
  s.obstacles.push({
    id: s.nextId++,
    lane: 0,
    at: s.distance + 3,
    kind: "pillar",
    resolved: false,
  });
  advance(s, 0.1);
  assert.equal(s.boosts.rush > 0, true);
  assert.equal(s.speed, MAX_SPEED * 1.65);
  assert.equal(s.mode, "running");
  assert.equal(s.review, null);
  assert.equal(s.obstacles[0].resolved, true);
});

test("matching road effects hold skill charge through refills, bank every coin, then allow recharging after expiry", () => {
  for (const kind of ["magnet", "rush"]) {
    const s = run();
    let progress = createProgress();
    progress.skills[kind].unlocked = true;
    s.permanentSkill = kind;
    s.skillCharge = 35;
    jumping(s);
    pickup(s, kind);
    update(s, 1 / 120);
    assert.equal(s.skillRechargeLocked, true);
    assert.equal(s.skillCharge, 35, "finding a booster neither spends nor refills saved charge");
    s.pickups.push({ id: s.nextId++, lane: 0, at: s.distance + 0.1, height: 3.1, taken: false });
    update(s, 1 / 120);
    progress = bankRunRewards(s, progress);
    assert.equal(progress.wallet, 1);
    assert.equal(s.skillCharge, 35);

    s.boosts[kind] = 0.1;
    s.jump = JUMP_DURATION / 2;
    pickup(s, kind);
    update(s, 1 / 120);
    assert.ok(s.boosts[kind] > 1, "a second pickup refills the active duration");
    assert.equal(s.skillRechargeLocked, true);
    advance(s, boostDefinition(kind).duration + 0.1);
    assert.equal(s.boosts[kind], 0);
    assert.equal(s.skillRechargeLocked, false);
    s.pickups.push({ id: s.nextId++, lane: 0, at: s.distance + 0.1, height: 1, taken: false });
    update(s, 1 / 120);
    progress = bankRunRewards(s, progress);
    assert.equal(progress.wallet, 2);
    assert.equal(s.skillCharge, 36);
  }
});

test("finding a different road effect does not pause the equipped skill charge", () => {
  const s = run();
  let progress = createProgress();
  progress.skills.shield.unlocked = true;
  s.permanentSkill = "shield";
  s.skillCharge = 35;
  jumping(s);
  pickup(s, "magnet");
  update(s, 1 / 120);
  s.pickups.push({ id: s.nextId++, lane: -1, at: s.distance + 2, height: 1, taken: false });
  update(s, 1 / 120);
  progress = bankRunRewards(s, progress);
  assert.equal(s.skillRechargeLocked, false);
  assert.equal(progress.wallet, 1);
  assert.equal(s.skillCharge, 36);
});

function normalSeconds(from, to) {
  if (from >= 9000) return (to - from) / MAX_SPEED;
  const acceleratingEnd = Math.min(to, 9000);
  return (
    Math.log((12 + 0.006 * acceleratingEnd) / (12 + 0.006 * from)) / 0.006 +
    Math.max(0, to - 9000) / MAX_SPEED
  );
}
function seededOpportunities(seed, distance = 25000, time = 120) {
  const s = createRun(seed);
  Object.assign(s, {
    distance,
    time,
    nextForkAt: Infinity,
    nextRailAt: Infinity,
    nextPortalAt: Infinity,
  });
  generateAhead(s);
  return s;
}

test("first roadside pickups arrive after a randomized introduction rather than at a fixed opening distance", (t) => {
  const times = [];
  for (let i = 1; i <= 100; i++) {
    const s = seededOpportunities(Math.imul(i, 2654435761) >>> 0, 220, 0);
    assert.ok(s.relics[0]);
    const first = s.relics[0];
    times.push(normalSeconds(0, first.at));
    assert.ok(first.at > 120, "no immediate pickup in the opening corridor");
    assert.ok(
      s.obstacles.filter((o) => o.at === first.at).length < 3,
      "the introductory pickup does not require a forced full-width action row",
    );
  }
  t.diagnostic(
    `first pickup: ${Math.min(...times).toFixed(2)}–${Math.max(...times).toFixed(2)}s, mean ${(times.reduce((a, b) => a + b) / times.length).toFixed(2)}s`,
  );
  assert.ok(times.every((value) => value >= 10 && value < 16.5));
  assert.ok(Math.max(...times) - Math.min(...times) > 4);
});

test("actual roadside opportunity gaps remain rare and variable during acceleration, across the cap, and at maximum speed", (t) => {
  const early = [],
    crossing = [],
    maximum = [],
    patterns = new Set();
  const maxMeters = [];
  for (let i = 1; i <= 100; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const s = seededOpportunities(seed);
    assert.ok(
      s.relics.every((item) => !item.taken),
      "generation spaces opportunities even when none are collected",
    );
    patterns.add(s.relics.map((item) => item.at.toFixed(1)).join(","));
    for (let j = 1; j < s.relics.length; j++) {
      const from = s.relics[j - 1].at,
        to = s.relics[j].at;
      const elapsed = normalSeconds(from, to);
      assert.ok(elapsed >= 22 - 1e-8, `only ${elapsed}s between generated opportunities`);
      assert.ok(
        elapsed < 45,
        "an eligible obstacle row may add a small delay, not a long fixed cooldown",
      );
      if (from < 1500) early.push(elapsed);
      if (from < 9000 && to >= 9000) crossing.push(elapsed);
      if (from >= 9000) {
        maximum.push(elapsed);
        maxMeters.push(to - from);
      }
    }
  }
  for (const [name, values] of [
    ["accelerating", early],
    ["crossing speed cap", crossing],
    ["maximum", maximum],
  ]) {
    const mean = values.reduce((a, b) => a + b) / values.length;
    t.diagnostic(
      `${name}: ${values.length} gaps, ${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)} normal seconds, mean ${mean.toFixed(2)}s`,
    );
    assert.ok(values.length > 90);
    assert.ok(mean > 29 && mean < 34);
    assert.ok(values.some((value) => value < 25) && values.some((value) => value > 37));
  }
  t.diagnostic(
    `maximum-speed distances: ${Math.min(...maxMeters).toFixed(0)}–${Math.max(...maxMeters).toFixed(0)}m`,
  );
  assert.equal(patterns.size, 100);
  assert.deepEqual(seededOpportunities(17).relics, seededOpportunities(17).relics);
});

test("missing every power-up does not produce catch-up spawns or alter its cooldown", () => {
  const s = run(0);
  Object.assign(s, {
    time: 0,
    nextRow: 50,
    nextForkAt: Infinity,
    nextRailAt: Infinity,
    nextPortalAt: Infinity,
  });
  s.boosts.grace = 10000;
  const seen = new Map();
  for (let frame = 0; frame < 150 * 30; frame++) {
    update(s, 1 / 30);
    for (const item of s.relics) seen.set(item.id, item);
  }
  const opportunities = [...seen.values()].sort((a, b) => a.at - b.at);
  assert.equal(s.mode, "running");
  assert.ok(opportunities.length >= 4 && opportunities.length <= 7);
  assert.ok(opportunities.every((item) => !item.taken));
  assert.ok(Object.values(s.collectedRelics).every((count) => count === 0));
  for (let i = 1; i < opportunities.length; i++)
    assert.ok(normalSeconds(opportunities[i - 1].at, opportunities[i].at) >= 22 - 1e-8);
  assert.ok(s.pickups.length > 0, "ordinary coin trails still spawn between rare boosters");
});

test("even consecutive level-three Momentum opportunities end before the next road booster can be collected", (t) => {
  let minimumActualGap = Infinity,
    minimumBreak = Infinity;
  for (const seed of [17, 37, 93, 241])
    for (const stage of ["opening", "maximum"]) {
      const source = seededOpportunities(seed);
      const chosen = source.relics
        .filter((item) => (stage === "opening" ? item.at < 4000 : item.at > 9000))
        .slice(0, 5);
      assert.equal(chosen.length, 5);
      const s = run(chosen[0].at - 8);
      Object.assign(s, {
        nextForkAt: Infinity,
        nextRailAt: Infinity,
        nextPortalAt: Infinity,
        speed: Math.min(MAX_SPEED, 12 + s.distance * 0.006),
      });
      s.relics = chosen.map((item) => ({ ...item, lane: 0, kind: "rush", taken: false }));
      const targets = [...s.relics];
      const levels = createBoostLevels();
      levels.rush = 3;
      let target = 0,
        previousCollected = null,
        expiredAt = null;
      for (let frame = 0; frame < 240 * 60 && target < targets.length; frame++) {
        if (s.distance >= targets[target].at - s.speed * 0.3 && s.jump === 0) act(s, "jump");
        update(s, 1 / 60, levels);
        if (previousCollected != null && s.boosts.rush === 0 && expiredAt == null)
          expiredAt = s.time;
        if (targets[target].taken) {
          if (previousCollected != null) {
            assert.ok(expiredAt != null, "Momentum must expire instead of chaining continuously");
            minimumActualGap = Math.min(minimumActualGap, s.time - previousCollected);
            minimumBreak = Math.min(minimumBreak, s.time - expiredAt);
            assert.ok(s.time - previousCollected >= 14.1);
            assert.ok(s.time - expiredAt >= 2.1);
          }
          previousCollected = s.time;
          expiredAt = null;
          target++;
        }
      }
      assert.equal(target, targets.length);
      assert.equal(s.mode, "running");
    }
  t.diagnostic(
    `successive Momentum: minimum ${minimumActualGap.toFixed(2)}s between collections, ${minimumBreak.toFixed(2)}s with the effect off`,
  );
});
