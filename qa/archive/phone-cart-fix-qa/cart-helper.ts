import * as engine from '../../../src/lib/game/engine';

export const CART_SEED = 1017116225;
export const CHECKPOINT_STEP = 0.025;
export const CHECKPOINT_STEPS = 2480;
export const MAX_CART_SAMPLES = 1200;
export const MAX_CART_WALL_MS = 20000;

export function deriveCartCheckpoint() {
  const run = engine.createRun(CART_SEED);
  run.mode = 'running';
  // Match the regression's contact-only immunity, not an active speed boost.
  run.boosts.grace = 1e9;
  for (let frame = 0; frame < CHECKPOINT_STEPS; frame++) {
    if (run.fork && (run.fork.at - run.distance) / run.speed < 2.2 &&
      !run.turnRemaining && run.lane !== -1) engine.act(run, 'left');
    engine.update(run, CHECKPOINT_STEP);
    if (run.mode !== 'running' || run.rail) throw Error('Exact natural checkpoint no longer reaches the pre-station road.');
  }
  if (run.time < 60 || run.railPreparedAt !== run.nextRailAt || !Number.isFinite(run.lastForkAt))
    throw Error('Exact checkpoint must retain the natural first fork and an unlocked, prepared station.');
  return {
    run,
    metadata: {
      seed: CART_SEED, simulatedSteps: CHECKPOINT_STEPS, stepSeconds: CHECKPOINT_STEP,
      simulatedElapsed: CHECKPOINT_STEPS * CHECKPOINT_STEP,
      time: run.time, distance: run.distance, stationAt: run.nextRailAt,
      firstForkAt: run.lastForkAt, preparedFrom: run.railPreparedFrom,
      contactGraceOnly: true, syntheticStation: false,
      note: 'Exact natural opening simulated to 62 seconds locally; the phone renders and updates the remaining real approach. No speed boost, custom gate position, or full-suite scenario is used.',
    },
  };
}

export function simulationClock(run: engine.RunState) {
  return run.time + (run.rail?.elapsed ?? 0);
}

type Stamp = { wallMs: number; simulationSeconds: number; distance: number; normalTime: number; railElapsed: number; phase: string | null };
type Sample = Stamp & { gapMs: number | null; mode: string; speed: number; visible: boolean };
export function createCartMeasurement(run: engine.RunState, startedWall: number) {
  const samples: Sample[] = [];
  const events: Array<Stamp & { kind: string; obstacleAt?: number }> = [];
  let previousDistance = run.distance;
  let previousWall = startedWall;
  let lastObstacleAt = -Infinity;
  let stopped: string | null = null;
  const stamp = (state: engine.RunState, wallMs: number): Stamp => ({
    wallMs, simulationSeconds: simulationClock(state), distance: state.distance,
    normalTime: state.time, railElapsed: state.rail?.elapsed ?? 0, phase: state.rail?.phase ?? null,
  });
  const seen = (kind: string) => events.some(event => event.kind === kind);
  const mark = (kind: string, state: engine.RunState, wallMs: number) => {
    if (!seen(kind)) events.push({ kind, ...stamp(state, wallMs) });
  };
  const interval = (from: Stamp | undefined, to: Stamp | undefined) => from && to ? {
    wallSeconds: (to.wallMs - from.wallMs) / 1000,
    simulationSeconds: to.simulationSeconds - from.simulationSeconds,
    excessWallSeconds: (to.wallMs - from.wallMs) / 1000 - (to.simulationSeconds - from.simulationSeconds),
  } : null;
  return {
    sample(state: engine.RunState, wallMs: number, visible = true) {
      if (stopped) return stopped;
      if (!visible) return stopped = 'hidden';
      if (state.mode !== 'running') return stopped = `mode-${state.mode}`;
      if (samples.length >= MAX_CART_SAMPLES || wallMs - startedWall > MAX_CART_WALL_MS)
        return stopped = 'measurement-limit';
      samples.push({ ...stamp(state, wallMs), gapMs: samples.length ? wallMs - previousWall : null,
        mode: state.mode, speed: state.speed, visible });
      // Passed objects remain in the real engine array for another 12m.
      // This mirrors the regression's contact-plane tolerance without altering them.
      if (!state.rail) {
        for (const obstacle of state.obstacles) {
          if (obstacle.at >= previousDistance - 0.23 && obstacle.at <= state.distance + 0.22 && obstacle.at > lastObstacleAt) {
            lastObstacleAt = obstacle.at;
            events.push({ kind: 'obstacle-pass', obstacleAt: obstacle.at, ...stamp(state, wallMs) });
          }
        }
      }
      if (!state.rail && state.railPreparedAt === state.nextRailAt) {
        const ahead = state.nextRailAt - state.distance;
        if (ahead > 0 && ahead < 130) mark('station-visible-range', state, wallMs);
        if (ahead > 0 && ahead / state.speed < 1) mark('fade-start', state, wallMs);
      }
      if (state.rail) mark('boarding', state, wallMs);
      if (state.rail?.phase === 'question') {
        mark('first-question', state, wallMs);
        stopped = 'complete';
      }
      previousDistance = state.distance;
      previousWall = wallMs;
      return stopped;
    },
    finish(reason: string) { stopped ??= reason; },
    export() {
      const lastObstacle = events.filter(event => event.kind === 'obstacle-pass').at(-1);
      const boarding = events.find(event => event.kind === 'boarding');
      const question = events.find(event => event.kind === 'first-question');
      const gaps = samples.flatMap(sample => sample.gapMs === null ? [] : [sample.gapMs]);
      return {
        status: stopped ?? 'running', startedWall, samples: [...samples], events: [...events],
        lastObstacleAt: Number.isFinite(lastObstacleAt) ? lastObstacleAt : null,
        intervals: { lastObstacleToBoarding: interval(lastObstacle, boarding),
          lastObstacleToFirstQuestion: interval(lastObstacle, question), boardingToQuestion: interval(boarding, question) },
        cadence: { frames: samples.length, maxGapMs: gaps.length ? Math.max(...gaps) : null,
          over50ms: gaps.filter(gap => gap > 50).length, over100ms: gaps.filter(gap => gap > 100).length,
          over250ms: gaps.filter(gap => gap > 250).length, over1000ms: gaps.filter(gap => gap > 1000).length },
      };
    },
  };
}
