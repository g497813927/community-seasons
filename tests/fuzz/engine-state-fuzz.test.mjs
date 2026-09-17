import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import "../helpers/compile.mjs";

const engine = await import("../helpers/compiled/engine.mjs");
const { createBoostLevels } = await import("../helpers/compiled/boosts.mjs");
const { RAIL_QUESTIONS, railQuestionDuration } = await import("../helpers/compiled/railway.mjs");
const {
  createRun, update, act, activateBoost, togglePause, finishReview,
  selectRailLane, currentRailQuestion, startSceneTravel, railSpeed,
  LANE_WIDTH, MAX_SPEED, JUMP_DURATION, SLIDE_DURATION, TURN_DURATION,
} = engine;
const scenes = ["spring", "summer", "autumn", "winter"];
const actions = ["left", "right", "jump", "slide"];
const boosts = ["shield", "doubleCoins", "magnet", "rush", "headstart", "portal"];
const deltas = [0, 1 / 240, 1 / 120, 1 / 60, 0.031, 0.075, 0.12, 0.19, 0.25, 0.51];
const levels = Object.fromEntries(Object.keys(createBoostLevels()).map((key) => [key, 3]));
const started = performance.now();
const coverage = {
  seeds: 0, commands: 0, ticks: 0, simulationSeconds: 0, resets: 0,
  modes: {}, phases: {}, actions: {}, rejectedInputs: 0, interruptions: 0,
  pauseChecks: 0, edgeStumbles: 0, forks: { left: 0, right: 0, closed: 0 },
  rides: { completed: 0, failed: 0, three: 0, four: 0, rewardCoins: 0 },
  boostActivations: {}, boostExpiries: {}, transitions: {}, dt: {},
};
const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };
function rng(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function check(condition, code, details = "") {
  if (!condition) {
    const error = new Error(`${code}${details ? `: ${details}` : ""}`);
    error.code = code;
    throw error;
  }
}
const clone = (value) => structuredClone(value);
const normalSpeed = (distance) => Math.min(MAX_SPEED, 12 + distance * 0.006);

function fixture(spec) {
  const s = createRun(spec.seed, scenes[spec.seed % scenes.length]);
  const distance = spec.distance ?? 0;
  Object.assign(s, {
    mode: "running", distance, score: Math.floor(distance * 10),
    time: distance ? 60 + distance / 12 : 0, speed: normalSpeed(distance),
    nextRow: distance + 28, nextRelicAt: distance + 150,
    nextForkAt: distance + 440, nextRailAt: distance + 940,
    nextPortalAt: (Math.floor(distance / 2500) + 1) * 2500,
    milestone: Math.floor(distance / 500) * 500,
  });
  if (spec.kind !== "mixed") {
    Object.assign(s, { nextRow: 1e9, nextForkAt: 1e9, nextRailAt: 1e9, nextPortalAt: 1e9 });
  }
  if (spec.kind === "rail") {
    s.time = Math.max(s.time, 60);
    s.nextRailAt = distance + 0.05;
  }
  if (spec.kind === "fork") {
    s.time = Math.max(s.time, 30);
    s.nextForkAt = distance + s.speed * (1.2 + (spec.seed % 7) * 0.1);
  }
  return s;
}

function validate(s) {
  check(["ready", "running", "paused", "over"].includes(s.mode), "mode");
  check(scenes.includes(s.scene), "scene");
  check([-1, 0, 1].includes(s.lane), "lane", s.lane);
  check(Math.abs(s.x) <= LANE_WIDTH + 1e-8, "lane-position", s.x);
  check(!(s.jump > 0 && s.slide > 0), "simultaneous-jump-slide");
  check(s.jump >= 0 && s.jump <= JUMP_DURATION, "jump-timer");
  check(s.slide >= 0 && s.slide <= SLIDE_DURATION, "slide-timer");
  check(s.speed >= 12 && s.speed <= MAX_SPEED * 2 + 1e-8, "speed-range", s.speed);
  for (const [key, value] of Object.entries(s)) {
    if (typeof value !== "number") continue;
    check(Number.isFinite(value) || (key === "lastTrailEnd" && value === -Infinity), "finite-state", `${key}=${value}`);
  }
  for (const key of ["distance", "coins", "score", "time", "turnRemaining", "railReturnRemaining", "sceneTransition", "edgeStumble", "chase", "flash", "milestoneRemaining", "skillCharge", "skillBlockedCoins", "stumbles", "reviewedPosts"])
    check(s[key] >= 0, "negative-state", `${key}=${s[key]}`);
  for (const key of ["coins", "score", "stumbles", "reviewedPosts", "shieldAbsorbed"])
    check(Number.isInteger(s[key]), "integer-counter", key);
  check(s.score <= Math.floor(s.distance * 10) + s.coins * 50, "score-exceeds-earned");
  for (const [key, value] of Object.entries(s.boosts))
    check(Number.isFinite(value) && value >= 0, "boost-timer", `${key}=${value}`);
  check(Number.isInteger(s.boosts.shield) && s.boosts.shield <= 3, "shield-hits");
  check((s.boosts.shield === 0) === (s.boosts.shieldTime === 0), "shield-lifetime");
  check(!s.review || ["paused", "over"].includes(s.mode), "review-must-freeze");
  check(!(s.rail && (s.sceneTransition || s.turnRemaining || s.railReturnRemaining)), "overlapping-cinematics");
  check(!s.fork || s.fork.blockedDirection === undefined || [-1, 1].includes(s.fork.blockedDirection), "fork-blocked-direction");
  check([-1, 0, 1].includes(s.lastForkBlockedDirection), "last-fork-blocked-direction");
  check(s.sceneTransition ? scenes.includes(s.sceneTransitionFrom) : s.sceneTransitionFrom === null, "transition-source-lifetime");
  check(!s.pendingScene || s.sceneTransition > 0, "orphaned-destination");
  for (const collection of [s.obstacles, s.pickups, s.relics]) {
    const ids = new Set();
    for (const item of collection) {
      check(Number.isFinite(item.at) && Number.isFinite(item.lane), "finite-course-object");
      check(item.lane >= -1 && item.lane <= 1, "course-lane", item.lane);
      check(!ids.has(item.id), "duplicate-object-id", item.id);
      ids.add(item.id);
    }
    check(collection.length < 1000, "unbounded-lookahead", collection.length);
  }
  if (s.rail) {
    const r = s.rail;
    check(["boarding", "question", "feedback", "falling", "complete"].includes(r.phase), "rail-phase");
    check([3, 4].includes(r.questions.length) && new Set(r.questions).size === r.questions.length, "rail-question-set");
    check(Number.isInteger(r.index) && r.index >= 0 && r.index < r.questions.length, "rail-index");
    check([...r.optionOrder].sort().join() === "0,1,2", "rail-option-permutation");
    check(r.remaining >= 0 && r.remaining <= r.duration, "rail-countdown");
    check(Number.isFinite(r.elapsed) && r.elapsed >= 0, "rail-elapsed");
    check(railSpeed(s) >= 12 && railSpeed(s) <= 30, "rail-pace");
    check(r.correctCount >= 0 && r.correctCount <= r.questions.length, "rail-correct-count");
    check(r.phase !== "question" || r.duration === railQuestionDuration(currentRailQuestion(s)), "rail-reading-window");
    check(r.phase !== "falling" || (r.correct === false && r.failure && r.reward === 0), "rail-failure-state");
    check(r.phase !== "complete" || (r.correctCount === r.questions.length && r.reward > 0), "rail-complete-state");
    check(!s.jump && !s.slide, "rail-airborne");
  }
}

class Session {
  constructor(spec, recording = true) {
    this.spec = spec;
    this.state = fixture(spec);
    this.trace = [];
    this.recording = recording;
    this.paid = new WeakSet();
    this.ridesSeen = new WeakSet();
    this.completed = 0;
    this.forkEntry = null;
    validate(this.state);
  }
  perform(command) {
    this.trace.push(command);
    const s = this.state;
    const before = {
      mode: s.mode, distance: s.distance, score: s.score, coins: s.coins,
      time: s.time, jump: s.jump, slide: s.slide, stumble: s.stumbles,
      lastForkAt: s.lastForkAt, transition: s.sceneTransition, return: s.railReturnRemaining,
      rail: s.rail, railElapsed: s.rail?.elapsed, railRemaining: s.rail?.remaining,
      boosts: { ...s.boosts }, scene: s.scene, lane: s.lane,
    };
    if (this.recording) { coverage.commands++; count(coverage.modes, s.mode); }
    if (command.op === "reset") {
      this.state = fixture({ ...this.spec, seed: command.seed });
      this.forkEntry = null;
      if (this.recording) coverage.resets++;
      validate(this.state);
      return;
    }
    if (command.op === "tick") {
      const frozen = s.mode !== "running" ? clone(s) : null;
      update(s, command.dt, levels);
      if (frozen) {
        check(JSON.stringify(s) === JSON.stringify(frozen), "paused-or-over-update-mutates");
        if (this.recording) coverage.pauseChecks++;
      }
      if (this.recording) {
        coverage.ticks++;
        coverage.simulationSeconds += s.time - before.time + ((s.rail?.elapsed ?? before.rail?.elapsed ?? 0) - (before.railElapsed ?? 0));
        count(coverage.dt, command.dt);
      }
      if (s.lastForkAt !== before.lastForkAt) {
        // Infer the crossing substep from the public turn timer. A boost may
        // expire later in this same delayed update, so inspect its lifetime
        // at entry, rather than its remaining value after the whole call.
        const elapsedAtEntry = Math.min(Math.max(command.dt, 0), 0.25) - (TURN_DURATION - s.turnRemaining);
        const elapsedBeforeEntry = Math.max(0, (Math.ceil((elapsedAtEntry - 1e-8) * 120) - 1) / 120);
        const speedBoosted = ["rush", "headstart", "portal"].some((kind) => before.boosts[kind] > elapsedBeforeEntry);
        const centered = Math.abs(s.turnEntryX) < LANE_WIDTH * 0.5;
        const redirected = speedBoosted && s.lastForkBlockedDirection !== 0;
        this.forkEntry = { at: s.lastForkAt, speedBoosted, centered, redirected };
        check(s.turnDirection !== s.lastForkBlockedDirection, "entered-fork-dead-end");
        if (centered) {
          check(speedBoosted, "unboosted-center-entered-fork");
          if (!redirected) check(s.turnDirection === (before.lane > 0 ? 1 : -1), "boosted-fork-ignores-selected-route");
        } else if (!redirected) check(Math.sign(s.turnEntryX) === s.turnDirection, "fork-ignores-physical-lane");
      }
      if (before.rail && s.rail === before.rail) {
        check(s.time === before.time, "rail-advances-normal-clock");
        check(JSON.stringify(s.boosts) === JSON.stringify(before.boosts), "rail-consumes-boost");
        check(s.coins === before.coins, "early-rail-payout");
      }
      if (before.rail && !s.rail) {
        check(!this.paid.has(before.rail), "duplicate-rail-payout");
        check(before.rail.phase === "complete", "rail-cleared-without-completion");
        check(s.coins - before.coins === before.rail.reward, "rail-reward-amount");
        check(s.railReturnRemaining > 0 && s.mode === "running", "rail-exit-lock");
        check(s.nextRailAt > s.distance && s.nextForkAt > s.distance && s.nextPortalAt > s.distance, "stale-event-after-rail");
        this.paid.add(before.rail);
        this.completed++;
        if (this.recording) {
          coverage.rides.completed++;
          coverage.rides.rewardCoins += before.rail.reward;
        }
      }
      if (before.return >= Math.min(command.dt, 0.25) + 1e-8 || before.transition >= Math.min(command.dt, 0.25) + 1e-8) {
        check(s.distance === before.distance && s.time === before.time, "cinematic-advances-run");
        check(JSON.stringify(s.boosts) === JSON.stringify(before.boosts), "cinematic-consumes-boost");
      }
    } else if (command.op === "act") {
      const frozen = s.mode !== "running" ? JSON.stringify(s) : null;
      const accepted = act(s, command.action);
      if (frozen) check(!accepted && JSON.stringify(s) === frozen, "input-mutates-paused-or-over");
      if (this.recording) {
        count(coverage.actions, command.action);
        if (!accepted) coverage.rejectedInputs++;
        if (accepted && ((command.action === "jump" && before.slide) || (command.action === "slide" && before.jump))) coverage.interruptions++;
      }
    } else if (command.op === "boost") {
      const accepted = activateBoost(s, command.kind, command.level);
      if (this.recording && accepted) count(coverage.boostActivations, command.kind);
      check(!accepted || (before.mode === "running" && !before.rail && !before.transition && !before.return), "boost-bypasses-input-lock");
    } else if (command.op === "pause") {
      togglePause(s);
    } else if (command.op === "review") {
      finishReview(s);
      check(before.mode !== "over" || s.mode === "over", "review-revives-failure");
    } else if (command.op === "lane") {
      selectRailLane(s, command.lane);
    } else if (command.op === "travel") {
      const accepted = startSceneTravel(s, command.scene);
      if (this.recording && accepted) count(coverage.transitions, `${before.scene}->${command.scene}`);
    } else if (command.op === "expect") {
      if (command.rule === "fork-ended") {
        if (command.closed) check(s.mode === "over", "closed-fork-did-not-fail");
        else if (s.mode === "over") {
          // A sufficiently early reversal can bring the body back into the
          // blocked center or opposite dead end instead of completing a turn.
          const centered = Math.abs(s.x) < LANE_WIDTH * 0.5;
          const blockedBranch = s.fork?.blockedDirection === Math.sign(s.x);
          check(command.reversed && (centered || blockedBranch) &&
            (s.reason.includes("center route") || s.reason.includes("dead end")), "fork-outcome");
        } else {
          check(s.lastForkAt !== null && s.mode === "running" && !s.turnRemaining, "fork-stalled");
          const boostedAssist = this.forkEntry?.at === s.lastForkAt && this.forkEntry.speedBoosted &&
            (this.forkEntry.centered || this.forkEntry.redirected);
          check(boostedAssist || Math.sign(s.turnEntryX) === s.turnDirection, "fork-ignores-physical-lane");
        }
      } else if (command.rule === "rail-ended") {
        if (command.wrong) {
          check(s.mode === "over" && s.rail?.phase === "falling" && s.reason.includes("Better choice:"), "wrong-answer-did-not-fail");
          check(s.coins === 0 && this.completed === 0, "wrong-answer-paid");
        } else {
          check(s.mode === "running" && !s.rail && !s.railReturnRemaining && this.completed === 1, "correct-ride-stalled");
          check(s.coins >= command.minimumReward, "late-ride-reward-too-low");
        }
      } else if (command.rule === "coins-equal") {
        check(s.coins === command.value, "rail-reward-repeated-after-exit");
      } else if (command.rule === "boosts-expired") {
        for (const kind of boosts) check(s.boosts[kind] === 0, "boost-never-expires", kind);
        check(s.mode === "running" && !s.sceneTransition, "expiry-run-ended-or-stuck");
      } else throw new Error(`Unknown replay expectation ${command.rule}`);
    } else throw new Error(`Unknown replay operation ${command.op}`);
    check(s.distance >= before.distance, "distance-goes-backward");
    check(s.score >= before.score, "score-goes-backward");
    check(s.coins >= before.coins, "coins-go-backward");
    if (this.recording) {
      coverage.edgeStumbles += s.lastStumble === "edge" ? s.stumbles - before.stumble : 0;
      if (s.lastForkAt !== before.lastForkAt) coverage.forks[s.turnDirection < 0 ? "left" : "right"]++;
      if (before.mode !== "over" && s.mode === "over" && (s.reason.includes("center route") || s.reason.includes("dead end"))) coverage.forks.closed++;
      if (s.rail) {
        count(coverage.phases, s.rail.phase);
        if (!this.ridesSeen.has(s.rail)) {
          this.ridesSeen.add(s.rail);
          coverage.rides[s.rail.questions.length === 3 ? "three" : "four"]++;
        }
        if (before.mode !== "over" && s.mode === "over") coverage.rides.failed++;
      }
      for (const kind of boosts) if (before.boosts[kind] > 0 && s.boosts[kind] === 0) count(coverage.boostExpiries, kind);
    }
    validate(s);
  }
}

function replay(spec, commands) {
  const session = new Session(spec, false);
  for (const command of commands) session.perform(command);
  return session.state;
}
function failureSignature(error) { return error.code ?? `${error.name}:${error.message}`; }
function persistFailure(session, error) {
  const target = failureSignature(error);
  let reduced = session.trace;
  const deadline = performance.now() + 2500;
  let attempts = 0;
  for (let chunk = Math.floor(reduced.length / 2); chunk >= 1 && performance.now() < deadline; chunk = Math.floor(chunk / 2)) {
    for (let i = 0; i + chunk <= reduced.length && performance.now() < deadline && attempts < 150; i += chunk) {
      const candidate = [...reduced.slice(0, i), ...reduced.slice(i + chunk)];
      attempts++;
      try { replay(session.spec, candidate); }
      catch (failure) {
        if (failureSignature(failure) === target) { reduced = candidate; i = Math.max(-chunk, i - chunk); }
      }
    }
  }
  const directory = new URL("./engine-fuzz-failures-20260910/", import.meta.url);
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${session.spec.kind}-${session.spec.distance ?? 0}-${session.spec.seed}.json`;
  const payload = {
    version: 1, seed: session.spec.seed, spec: session.spec, failure: target,
    originalCommandCount: session.trace.length, minimizedCommandCount: reduced.length,
    minimizationAttempts: attempts, minimization: "bounded chunk deletion; not guaranteed globally minimal",
    commands: reduced, originalCommands: session.trace,
    replay: `ENGINE_FUZZ_REPLAY=tests/fuzz/engine-fuzz-failures-20260910/${filename} node --test tests/fuzz/engine-state-fuzz.test.mjs`,
  };
  fs.writeFileSync(new URL(filename, directory), JSON.stringify(payload, null, 2));
  error.message += `\nSeed ${session.spec.seed}; saved ${filename} (${reduced.length}/${session.trace.length} commands)`;
}
function exercise(spec, run) {
  const session = new Session(spec);
  coverage.seeds++;
  try { run(session, rng(spec.seed ^ 0x5a17ab1e)); }
  catch (error) { persistFailure(session, error); throw error; }
  check(performance.now() - started < 150000, "fuzz-time-budget");
  return session;
}
function tick(session, random, large = false) {
  const dt = large ? [0.12, 0.19, 0.25, 0.51][Math.floor(random() * 4)] : deltas[Math.floor(random() * deltas.length)];
  session.perform({ op: "tick", dt });
}
function pauseProbe(session, random) {
  if (session.state.mode !== "running") return;
  session.perform({ op: "pause" });
  tick(session, random, true);
  session.perform({ op: "act", action: actions[Math.floor(random() * 4)] });
  session.perform({ op: "boost", kind: boosts[Math.floor(random() * boosts.length)], level: 3 });
  session.perform({ op: "pause" });
}

const replayFile = process.env.ENGINE_FUZZ_REPLAY;
const seedOffset = Number(process.env.ENGINE_FUZZ_SEED_OFFSET ?? 0);
test("saved engine fuzz traces replay against the production engine", { skip: !replayFile }, () => {
  const saved = JSON.parse(fs.readFileSync(replayFile, "utf8"));
  replay(saved.spec, saved.commands);
});

test("384 seeded input streams interrupt movement, recover from edges, pause and reset safely", { skip: !!replayFile }, () => {
  for (let seed = 1 + seedOffset; seed <= 384 + seedOffset; seed++) exercise({ kind: "mixed", seed, distance: [0, 1200, 9100][seed % 3] }, (session, random) => {
    for (let index = 0; index < 500; index++) {
      const s = session.state;
      if (s.mode === "over") {
        tick(session, random);
        session.perform({ op: "review" });
        session.perform({ op: "reset", seed: Math.floor(random() * 0xffffffff) });
        continue;
      }
      if (s.review) { session.perform({ op: "review" }); continue; }
      const choice = random();
      if (choice < 0.53) tick(session, random);
      else if (choice < 0.81) {
        const action = actions[Math.floor(random() * actions.length)];
        session.perform({ op: "act", action });
        // Bursts include repeated margins and opposite inputs without a frame.
        if (random() < 0.4) session.perform({ op: "act", action: random() < 0.5 ? action : actions[(actions.indexOf(action) + 1) % 4] });
      } else if (choice < 0.90) session.perform({ op: "boost", kind: boosts[Math.floor(random() * boosts.length)], level: 1 + Math.floor(random() * 3) });
      else if (choice < 0.95) pauseProbe(session, random);
      else session.perform({ op: "travel", scene: scenes[Math.floor(random() * scenes.length)] });
    }
  });
});

test("96 seeded boost runs expire naturally across pauses and season transitions", { skip: !!replayFile }, () => {
  for (let seed = 401 + seedOffset; seed <= 496 + seedOffset; seed++) exercise({ kind: "expiry", seed, distance: [0, 1200, 9100][seed % 3] }, (session, random) => {
    const s = session.state;
    for (const kind of boosts) session.perform({ op: "boost", kind, level: 1 + seed % 3 });
    let transported = false;
    for (let i = 0; s.time < (session.spec.distance ? 60 + session.spec.distance / 12 : 0) + 27; i++) {
      check(i < 400, "expiry-run-stalled");
      if (i % 19 === 0) pauseProbe(session, random);
      if (!transported && i > 12) {
        session.perform({ op: "travel", scene: scenes[(seed + 1) % scenes.length] });
        transported = true;
      }
      if (random() < 0.5) session.perform({ op: "act", action: actions[Math.floor(random() * 4)] });
      tick(session, random, true);
    }
    session.perform({ op: "expect", rule: "boosts-expired" });
  });
});

test("192 seeded railway rides retain reading time, carry lanes, fail correctly and pay once", { skip: !!replayFile }, () => {
  // Four longest questions plus boarding, feedback and the return leg, even
  // if every generated tick uses the shortest 0.12-second large-step delta.
  const maximumTicks = Math.ceil((4 * Math.max(...RAIL_QUESTIONS.map(railQuestionDuration)) + 12) / 0.12);
  for (let seed = 501 + seedOffset; seed <= 692 + seedOffset; seed++) exercise({ kind: "rail", seed, distance: [950, 3500, 10000][seed % 3] }, (session, random) => {
    const s = session.state;
    session.perform({ op: "boost", kind: seed % 2 ? "rush" : "shield", level: 3 });
    const wrong = seed % 3 === 0;
    const observed = new Set();
    let boarded = false;
    for (let i = 0; i < maximumTicks; i++) {
      const ride = s.rail;
      if (ride) {
        boarded = true;
        const phase = `${ride.phase}-${ride.index}`;
        if (!observed.has(phase)) { observed.add(phase); pauseProbe(session, random); }
        if (["boarding", "question"].includes(ride.phase)) {
          session.perform({ op: "act", action: random() < 0.5 ? "jump" : "slide" });
          if (ride.phase === "question" && ride.remaining < 1) {
            const correct = ride.optionOrder.indexOf(currentRailQuestion(s).correctIndex);
            const index = wrong && ride.index === seed % ride.questions.length ? (correct + 1 + seed % 2) % 3 : correct;
            session.perform({ op: "lane", lane: index - 1 });
          } else if (random() < 0.65) session.perform({ op: "act", action: random() < 0.5 ? "left" : "right" });
        }
        if (random() < 0.06) session.perform({ op: "boost", kind: boosts[Math.floor(random() * boosts.length)], level: 3 });
      }
      tick(session, random, true);
      if (s.mode === "over" || (boarded && !s.rail && !s.railReturnRemaining)) break;
    }
    check(boarded, "rail-never-boarded");
    session.perform({ op: "expect", rule: "rail-ended", wrong, minimumReward: session.spec.distance >= 10000 ? 100 : 1 });
    const coins = s.coins;
    for (let i = 0; i < 10; i++) tick(session, random);
    session.perform({ op: "expect", rule: "coins-equal", value: coins });
  });
});

test("96 seeded fork approaches handle late reversals, closed centers and turn locks", { skip: !!replayFile }, () => {
  for (let seed = 701 + seedOffset; seed <= 796 + seedOffset; seed++) exercise({ kind: "fork", seed, distance: [450, 1500, 9100][seed % 3] }, (session, random) => {
    const s = session.state;
    // This matrix deliberately has no active speed boosts; a centered body
    // must still fail. Boosted fallbacks are exercised by the focused suite.
    const shouldFail = seed % 4 === 0;
    const preferredDirection = seed % 2 ? -1 : 1;
    let reversed = false;
    for (let i = 0; i < 100; i++) {
      if (!shouldFail && !s.turnRemaining) {
        const target = s.fork?.blockedDirection ? -s.fork.blockedDirection : preferredDirection;
        const direction = target < 0 ? "left" : "right";
        session.perform({ op: "act", action: direction });
        if (!reversed && (s.nextForkAt - s.distance) / s.speed < 0.12) {
          session.perform({ op: "act", action: direction === "left" ? "right" : "left" });
          reversed = true;
        }
      }
      if (i === 2 || s.turnRemaining > 1.2) pauseProbe(session, random);
      tick(session, random);
      if (s.mode === "over" || (s.lastForkAt !== null && !s.turnRemaining)) break;
    }
    session.perform({ op: "expect", rule: "fork-ended", closed: shouldFail, reversed });
  });
});

test("fuzz coverage and deterministic replay are recorded without production hooks", { skip: !!replayFile }, () => {
  const spec = { kind: "mixed", seed: 424242, distance: 1200 };
  const commands = [];
  const random = rng(821);
  for (let i = 0; i < 80; i++) {
    commands.push({ op: "act", action: actions[Math.floor(random() * 4)] });
    commands.push({ op: "tick", dt: deltas[Math.floor(random() * deltas.length)] });
  }
  assert.deepEqual(replay(spec, commands), replay(spec, commands));
  check(coverage.seeds === 768, "seed-coverage", coverage.seeds);
  check(coverage.interruptions > 100 && coverage.edgeStumbles > 100 && coverage.pauseChecks > 1000, "input-coverage");
  check(Object.keys(coverage.phases).length === 5 && coverage.rides.completed >= 128 && coverage.rides.failed >= 64, "rail-coverage");
  check(coverage.rides.three > 30 && coverage.rides.four > 30, "rail-question-count-coverage");
  for (const kind of boosts.filter((kind) => kind !== "portal")) check(coverage.boostExpiries[kind] > 0, "expiry-coverage", kind);
  check(Object.values(coverage.forks).every((value) => value > 15), "fork-coverage");
  const artifact = {
    generatedAt: new Date().toISOString(), elapsedSeconds: (performance.now() - started) / 1000,
    sourceSha256: Object.fromEntries(["engine", "railway", "boosts"].map((name) => [name, crypto.createHash("sha256").update(fs.readFileSync(new URL(`../../src/lib/game/${name}.ts`, import.meta.url))).digest("hex")])),
    coverage,
    limits: ["Engine-only fuzzing; not rendering, browser events, phone performance, or cloud concurrency.", "Fixtures choose initial checkpoints; subsequent mutations use exported production engine APIs.", "Finite valid dt includes delayed frames; game simulation deliberately clamps a call to 250ms.", "Boost/store skill purchase and bank operations are covered by separate store fuzz tests.", "Failure reduction is bounded to 2.5 seconds and 150 replay attempts."],
    replay: "node --test tests/fuzz/engine-state-fuzz.test.mjs",
  };
  fs.writeFileSync(new URL("./engine-state-fuzz-results-20260910.json", import.meta.url), JSON.stringify(artifact, null, 2));
  console.log(`Engine fuzz: ${coverage.seeds} seeds, ${coverage.commands} commands, ${coverage.ticks} ticks, ${coverage.rides.completed} successful / ${coverage.rides.failed} failed rides; ${(performance.now() - started).toFixed(0)}ms.`);
});
