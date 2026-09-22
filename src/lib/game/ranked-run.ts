import type { RunState } from "./engine";

/** A local integrity receipt, not server-side proof of an honest client. */
export interface RankedRunReceipt {
  readonly score: number;
  readonly distance: number;
  readonly coins: number;
  readonly durationMs: number;
  readonly completedAt: number;
}

interface RankedRun {
  distance: number;
  coins: number;
  score: number;
  time: number;
  seconds: number;
  observedAt: number;
  timeBudget: number;
  valid: boolean;
  depth: number;
  receipt: RankedRunReceipt | null;
}

// Nothing is attached to the mutable run, local save, or window. A saved best,
// cloned state, or object that merely looks like a receipt cannot be submitted.
const runs = new WeakMap<RunState, RankedRun>();
const receipts = new WeakSet<object>();
const CLOCK_ALLOWANCE_SECONDS = 0.75;
const MAX_DISTANCE_PER_SECOND = 132; // Current 66 m/s cap with a 2x opening boost.
const MAX_RAIL_REWARD = 118; // Four answers at the current maximum progression.

function countersMatch(s: RunState, run: RankedRun) {
  return s.distance === run.distance && s.coins === run.coins &&
    s.score === run.score && s.time === run.time;
}

/** Call only at the real Start boundary, after switching a fresh run to running. */
export function beginRankedRun(s: RunState): boolean {
  if (runs.has(s) || s.mode !== "running" || s.distance !== 0 ||
    s.score !== 0 || s.coins !== 0 || s.time !== 0 || s.bankedCoins !== 0 ||
    s.rail !== null || s.review !== null) return false;
  const observedAt = performance.now();
  if (!Number.isFinite(observedAt)) return false;
  runs.set(s, {
    distance: 0, coins: 0, score: 0, time: 0, seconds: 0,
    observedAt, timeBudget: CLOCK_ALLOWANCE_SECONDS, valid: true, depth: 0,
    receipt: null,
  });
  return true;
}

/** Only engine mutations may accumulate credit or finish an enrolled run. */
export function trackRankedRunMutation<T>(s: RunState, mutate: () => T): T {
  const run = runs.get(s);
  if (!run || !run.valid) return mutate();
  if (!countersMatch(s, run) || (s.mode === "over" && !run.receipt)) run.valid = false;
  if (!run.valid || run.receipt) return mutate();
  const previousSeconds = run.seconds;
  run.depth++;
  try {
    return mutate();
  } finally {
    run.depth--;
    const observedAt = performance.now();
    const elapsed = (observedAt - run.observedAt) / 1000;
    run.observedAt = observedAt;
    run.timeBudget = Math.min(CLOCK_ALLOWANCE_SECONDS, run.timeBudget + elapsed) -
      (run.seconds - previousSeconds);
    if (!Number.isFinite(elapsed) || elapsed < 0 || run.timeBudget < -1e-6 ||
      !countersMatch(s, run) || !Number.isSafeInteger(run.score) ||
      !Number.isSafeInteger(run.coins) || run.distance < 0 ||
      run.distance > run.seconds * MAX_DISTANCE_PER_SECOND + 1e-6 ||
      run.coins > run.distance * 4 + MAX_RAIL_REWARD) run.valid = false;
    if (run.valid && s.mode === "over" && run.seconds > 0 && run.score > 0) {
      run.receipt = Object.freeze({
        score: run.score,
        distance: run.distance,
        coins: run.coins,
        durationMs: Math.round(run.seconds * 1000),
        completedAt: Date.now(),
      });
      receipts.add(run.receipt);
    }
  }
}

function activeRun(s: RunState) {
  const run = runs.get(s);
  return run?.valid && run.depth > 0 && !run.receipt ? run : null;
}

// These hooks count only actual engine substeps. Railway and travel time still
// consume real time even though their rules deliberately freeze s.time.
export function recordRankedRunStep(s: RunState, seconds: number, runningClock: boolean) {
  const run = activeRun(s);
  if (!run) return;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1 / 120 + 1e-8) {
    run.valid = false;
    return;
  }
  run.seconds += seconds;
  if (runningClock) run.time += seconds;
}

export function recordRankedRunDistance(s: RunState, distance: number) {
  const run = activeRun(s);
  if (run) run.distance += distance;
}

export function recordRankedRunCoins(s: RunState, coins: number, source: "pickup" | "rail") {
  const run = activeRun(s);
  if (!run) return;
  if (!Number.isSafeInteger(coins) || coins < 1 ||
    coins > (source === "pickup" ? 2 : MAX_RAIL_REWARD)) run.valid = false;
  else run.coins += coins;
}

export function recordRankedRunScore(s: RunState) {
  const run = activeRun(s);
  if (run) run.score = Math.floor(run.distance * 10) + run.coins * 50;
}

export function getRankedRunReceipt(s: RunState): RankedRunReceipt | null {
  const run = runs.get(s);
  if (!run?.valid || !run.receipt || s.mode !== "over" || !countersMatch(s, run)) return null;
  return run.receipt;
}

export function isRankedRunReceipt(value: unknown): value is RankedRunReceipt {
  return typeof value === "object" && value !== null && receipts.has(value);
}
