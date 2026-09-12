import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import fc from "fast-check";
import "../community-tests/compile.mjs";

const engine = await import("../community-tests/compiled/engine.mjs");
const { createRun, update, act, activateBoost, togglePause, finishReview, selectRailLane, startSceneTravel, LANE_WIDTH } = engine;
const { boostDefinition } = await import("../community-tests/compiled/boosts.mjs");
const { readProgress, createProgress, activateOwnedBooster, activatePermanentSkill } = await import("../community-tests/compiled/store.mjs");
const actions = ["left", "right", "jump", "slide"];
const kinds = ["shield", "magnet", "rush", "headstart", "doubleCoins"];
const scenes = ["spring", "summer", "autumn", "winter"];
const numeric = fc.oneof(fc.double({ noNaN: false, noDefaultInfinity: false }), fc.constantFrom(NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE, Number.MAX_VALUE));
const json = fc.jsonValue({ maxDepth: 2 });
const malformed = fc.oneof(json, numeric, fc.constant(undefined));
const invalidAction = malformed.filter((value) => !actions.includes(value));
const invalidLane = malformed.filter((value) => ![-1, 0, 1].includes(value));
const invalidKind = malformed.filter((value) => !kinds.includes(value));
const malformedLevel = malformed.filter((value) => ![1, 2, 3].includes(value));
const reports = [];
const sourceHashes = Object.fromEntries(["engine", "railway", "boosts", "store"].map((name) => [name, crypto.createHash("sha256").update(fs.readFileSync(new URL(`../../outputs/community-seasons/lib/game/${name}.ts`, import.meta.url))).digest("hex")]));
const coverage = { sequences: 0, commands: 0, pausedUpdates: 0, invalidActions: 0, invalidLanes: 0, malformedLevels: 0, numericKinds: {} };
const clone = (value) => structuredClone(value);
const increment = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
function numericClass(value) {
  return Number.isNaN(value) ? "NaN" : value === Infinity ? "+Infinity" : value === -Infinity ? "-Infinity" : value < 0 ? "negative" : value === 0 ? "zero" : value > 0.25 ? "over-budget" : "positive-in-budget";
}
function fresh(seed = 4182, distance = 0, kind = "normal") {
  const s = createRun(seed);
  Object.assign(s, {
    mode: "running", distance, score: Math.floor(distance * 10),
    time: distance ? 120 : 0, speed: Math.min(66, 12 + distance * 0.006),
    nextRow: distance + 30, nextRelicAt: distance + 150,
    nextForkAt: distance + 430, nextRailAt: distance + 950,
    nextPortalAt: (Math.floor(distance / 2500) + 1) * 2500,
  });
  if (kind === "rail") {
    s.time = 120;
    s.nextForkAt = 1e9;
    s.nextRailAt = distance + 0.05;
    update(s, 0.01);
    assert.equal(s.rail?.phase, "boarding");
  } else if (kind === "transition") startSceneTravel(s, "summer");
  return s;
}
function validState(s) {
  for (const key of ["distance", "score", "coins", "time", "speed", "x", "jump", "slide", "sceneTransition", "railReturnRemaining", "turnRemaining", "chase", "edgeStumble", "nextRow", "nextRelicAt", "seed"])
    assert.ok(Number.isFinite(s[key]), `${key} must remain finite, got ${s[key]}`);
  assert.ok([-1, 0, 1].includes(s.lane));
  assert.ok(Math.abs(s.x) <= LANE_WIDTH + 1e-8);
  assert.ok(s.distance >= 0 && s.score >= 0 && s.coins >= 0 && s.time >= 0);
  assert.ok(!(s.jump > 0 && s.slide > 0));
  assert.ok(scenes.includes(s.scene));
  assert.ok(["running", "paused", "over", "ready"].includes(s.mode));
  for (const timer of Object.values(s.boosts)) assert.ok(Number.isFinite(timer) && timer >= 0);
  assert.ok(!s.rail || (!s.sceneTransition && !s.railReturnRemaining && !s.turnRemaining));
  if (s.rail) {
    assert.ok(Number.isFinite(s.rail.elapsed) && Number.isFinite(s.rail.remaining));
    assert.deepEqual([...s.rail.optionOrder].sort(), [0, 1, 2]);
  }
}
function serialize(value) {
  return JSON.stringify(value, (_, item) => {
    if (typeof item === "number" && (!Number.isFinite(item) || Object.is(item, -0))) return { __number: Object.is(item, -0) ? "-0" : String(item) };
    return item === undefined ? { __undefined: true } : item;
  }, 2);
}
function property(id, description, arbitraries, predicate, numRuns = 2000) {
  test(description, { skip: Boolean(process.env.FC_PROPERTY && process.env.FC_PROPERTY !== id) }, () => {
    const started = performance.now();
    const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260910 + reports.length * 1009;
    const options = {
      seed, numRuns: Number(process.env.FC_RUNS ?? numRuns), interruptAfterTimeLimit: 12000, markInterruptAsFailure: true,
      ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}),
    };
    let result;
    try {
      result = fc.check(fc.property(...arbitraries, predicate), options);
    } catch (error) {
      const replayPath = process.env.FC_PATH;
      const quotedPath = replayPath?.replaceAll("'", "'\\''");
      const report = {
        id, description, passed: false, interrupted: false, exception: true,
        seed, runs: 0, skips: 0, shrinks: 0,
        counterexamplePath: replayPath ?? null, counterexample: null, counterexampleDisplay: null,
        error: String(error), elapsedMs: performance.now() - started,
        replay: `FC_PROPERTY=${id} FC_SEED=${seed}${replayPath ? ` FC_PATH='${quotedPath}'` : ""} node --test work/property-tests/engine-invalid.test.mjs`,
      };
      reports.push(report);
      fs.writeFileSync(new URL(`./engine-invalid-failure-${id}.json`, import.meta.url), serialize({ version: 1, library: fc.__version, sourceHashes, ...report }));
      throw error;
    }
    const report = {
      id, description, passed: !result.failed, interrupted: result.interrupted,
      seed: result.seed, runs: result.numRuns, skips: result.numSkips, shrinks: result.numShrinks,
      counterexamplePath: result.counterexamplePath,
      counterexample: result.counterexample,
      counterexampleDisplay: result.counterexample == null ? null : fc.stringify(result.counterexample),
      error: result.errorInstance?.message ?? null,
      elapsedMs: performance.now() - started,
      replay: `FC_PROPERTY=${id} FC_SEED=${result.seed}${result.counterexamplePath ? ` FC_PATH=${result.counterexamplePath}` : ""} node --test work/property-tests/engine-invalid.test.mjs`,
    };
    reports.push(report);
    if (result.failed) fs.writeFileSync(new URL(`./engine-invalid-failure-${id}.json`, import.meta.url), serialize({ version: 1, library: fc.__version, sourceHashes, ...report }));
    assert.equal(result.failed, false, fc.defaultReportMessage(result) ?? "Property passed");
  });
}

property("numeric-dt", "all numeric frame deltas, including NaN/infinities, behave as a bounded normalized tick", [numeric, fc.integer(), fc.constantFrom(0, 1200, 9100), fc.constantFrom("normal", "rail", "transition")], (dt, seed, distance, kind) => {
  increment(coverage.numericKinds, numericClass(dt));
  const actual = fresh(seed, distance, kind), expected = clone(actual);
  update(actual, dt);
  update(expected, Number.isNaN(dt) ? 0 : Math.max(0, Math.min(dt, 0.25)));
  assert.deepEqual(actual, expected);
  validState(actual);
  assert.ok(actual.distance >= distance && actual.distance <= distance + 34);
}, 4000);

property("numeric-seed", "numeric seeds normalize deterministically without poisoning generated gameplay", [numeric, fc.constantFrom(0, 1200, 9100)], (seed, distance) => {
  const first = fresh(seed, distance), second = fresh(seed, distance);
  update(first, 0.25);
  update(second, 0.25);
  validState(first);
  assert.deepEqual(first, second);
}, 2500);

property("invalid-action", "unknown action values are rejected without mutating the run", [invalidAction, fc.constantFrom("normal", "rail", "transition"), fc.constantFrom("running", "paused", "over")], (action, kind, mode) => {
  const s = fresh(13, 1200, kind);
  s.mode = mode;
  const before = clone(s);
  assert.equal(act(s, action), false);
  assert.deepEqual(s, before);
  coverage.invalidActions++;
});

property("invalid-lane", "out-of-range, fractional and malformed answer lanes cannot move the cart", [invalidLane], (lane) => {
  const s = fresh(18, 1200, "rail");
  selectRailLane(s, -1);
  const before = clone(s);
  assert.equal(selectRailLane(s, lane), false);
  assert.deepEqual(s, before);
  coverage.invalidLanes++;
});

property("invalid-booster", "unknown booster identifiers and portal cannot bypass activation checks", [invalidKind], (kind) => {
  const s = fresh(), before = clone(s);
  assert.equal(activateBoost(s, kind, 3), false);
  assert.deepEqual(s, before);
});

property("direct-malformed-level", "engine activation also normalizes malformed levels when a caller bypasses save decoding", [fc.constantFrom(...kinds), malformedLevel], (kind, level) => {
  const s = fresh();
  assert.equal(activateBoost(s, kind, level), true);
  assert.equal(s.effectLevels[kind], 1);
  assert.equal(s.boosts[kind], boostDefinition(kind, 1).duration);
  if (kind === "shield") assert.equal(s.boosts.shieldTime, boostDefinition(kind, 1).shieldDuration);
  validState(s);
});

property("rejected-malformed-level", "rejected activation with a malformed level remains completely unchanged", [fc.constantFrom(...kinds), malformedLevel, fc.constantFrom("paused", "over", "active", "rail", "transition")], (kind, level, condition) => {
  const s = fresh(18, 0, condition === "rail" ? "rail" : condition === "transition" ? "transition" : "normal");
  if (condition === "active") activateBoost(s, kind, 2);
  if (condition === "paused" || condition === "over") s.mode = condition;
  const before = clone(s);
  assert.equal(activateBoost(s, kind, level), false);
  assert.deepEqual(s, before);
});

property("malformed-level", "malformed saved booster levels normalize before owned-booster and skill activation", [fc.constantFrom(...kinds), malformedLevel], (kind, level) => {
  const s = fresh();
  const saved = createProgress();
  saved.levels[kind] = level;
  for (const id of Object.keys(saved.inventory)) saved.inventory[id] = 1;
  for (const id of Object.keys(saved.skills)) saved.skills[id].unlocked = true;
  const progress = readProgress(JSON.stringify(saved));
  assert.equal(progress.levels[kind], 1);
  if (kind === "rush" || kind === "magnet") {
    s.permanentSkill = kind;
    s.skillCharge = 100;
    assert.equal(activatePermanentSkill(s, progress, kind).ok, true);
  } else assert.equal(activateOwnedBooster(s, progress, kind).ok, true);
  assert.equal(s.effectLevels[kind], 1);
  assert.equal(s.boosts[kind], boostDefinition(kind, 1).duration);
  if (kind === "shield") assert.equal(s.boosts.shieldTime, boostDefinition(kind, 1).shieldDuration);
  validState(s);
  coverage.malformedLevels++;
});

const command = fc.oneof(
  { weight: 6, arbitrary: fc.record({ op: fc.constant("tick"), dt: fc.oneof(numeric, fc.constantFrom(1 / 60, 0.1, 0.25)) }) },
  { weight: 3, arbitrary: fc.record({ op: fc.constant("act"), action: fc.oneof(fc.constantFrom(...actions), invalidAction) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("boost"), kind: fc.oneof(fc.constantFrom(...kinds, "portal"), invalidKind), level: malformed }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("lane"), lane: fc.oneof(fc.constantFrom(-1, 0, 1), invalidLane) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("pause") }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("review") }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("travel"), scene: fc.constantFrom(...scenes) }) },
);
property("input-sequences", "shrinking mixed input sequences preserve pause, terminal and monotonic-state invariants", [fc.integer(), fc.constantFrom(0, 1200, 9100), fc.constantFrom("normal", "rail", "transition"), fc.array(command, { minLength: 1, maxLength: 120 })], (seed, distance, kind, commands) => {
  const s = fresh(seed, distance, kind);
  coverage.sequences++;
  for (const event of commands) {
    coverage.commands++;
    const previous = { distance: s.distance, score: s.score, coins: s.coins, mode: s.mode };
    if (event.op === "tick") {
      const frozen = s.mode !== "running" ? clone(s) : null;
      update(s, event.dt);
      if (frozen) { assert.deepEqual(s, frozen); coverage.pausedUpdates++; }
    } else if (event.op === "act") {
      const frozen = s.mode !== "running" ? clone(s) : null;
      act(s, event.action);
      if (frozen) assert.deepEqual(s, frozen);
    } else if (event.op === "boost") {
      // Match the actual persisted-input boundary. The typed engine receives
      // Progress.levels after readProgress has normalized the external value.
      const progress = readProgress(JSON.stringify({ version: 1, levels: Object.fromEntries(kinds.map((id) => [id, event.level])) }));
      // Cover the real decoded path and the narrow defensive API guard.
      const suppliedLevel = commands.length % 2 ? event.level : kinds.includes(event.kind) ? progress.levels[event.kind] : 1;
      activateBoost(s, event.kind, suppliedLevel);
    }
    else if (event.op === "lane") selectRailLane(s, event.lane);
    else if (event.op === "pause") togglePause(s);
    else if (event.op === "review") finishReview(s);
    else if (event.op === "travel") startSceneTravel(s, event.scene);
    if (previous.mode === "over") assert.equal(s.mode, "over", "Inputs cannot revive a failed run");
    assert.ok(s.distance >= previous.distance && s.score >= previous.score && s.coins >= previous.coins);
    validState(s);
  }
}, 2500);

test("property results retain replay seeds, paths and boundary scope", () => {
  const result = {
    version: 1, generatedAt: new Date().toISOString(), library: `fast-check ${fc.__version}`,
    sourceHashes, passed: reports.length > 0 && reports.every((report) => report.passed && !report.interrupted),
    totalRuns: reports.reduce((sum, report) => sum + report.runs, 0), coverage, properties: reports,
    boundaries: {
      actual: ["Frame time is derived from requestAnimationFrame; prolonged/background frames can create large deltas.", "Action identifiers are mapped from keyboard/swipe input, and cart choices are fixed UI lane values.", "Booster levels originate in local/cloud saves normalized by readProgress; real owned-booster and permanent-skill activation are tested after decoding."],
      defensive: ["NaN/infinity numeric times and seeds, arbitrary JSON action/lane identifiers, and malformed levels stress existing runtime guards beyond ordinary UI values."],
      excluded: ["No corrupted RunState object, arbitrary getters, Symbols or object methods are injected: these are not game input or JSON storage boundaries.", "Invalid scene identifiers belong at save decoding; the internal SceneKind API is intentionally called only with supported scenes.", "This does not replace full railway-duration coverage, renderer fuzzing or physical-phone tests."],
      classifiedFinding: "Before the narrow defensive fix, directly bypassing readProgress and invoking activateBoost with level 0 or NaN violated its internal BoostLevel contract and stored invalid level/timer state. Shrunk original traces are retained as internal-only findings. The real JSON→readProgress→activation path already normalized these values. activateBoost now also normalizes once after its eligibility guard; direct malformed calls pass and rejected calls remain unchanged. No player-reachable failure was established.",
    },
    source: "https://fast-check.dev/docs/core-blocks/runners/",
  };
  const reportName = process.env.FC_PROPERTY ? `engine-invalid-replay-${process.env.FC_PROPERTY.replace(/[^a-z0-9-]/gi, "-")}.json` : "engine-invalid-results.json";
  fs.writeFileSync(new URL(`./${reportName}`, import.meta.url), serialize(result));
  console.log(`fast-check engine: ${result.totalRuns} property cases; ${coverage.sequences} sequences / ${coverage.commands} commands.`);
  assert.ok(reports.length > 0, `No engine property matched FC_PROPERTY=${process.env.FC_PROPERTY ?? "<all>"}`);
  assert.ok(result.passed);
});
