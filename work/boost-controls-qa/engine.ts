export * from '../../src/lib/game/engine';
import {
  createRun as actualCreateRun,
  update as actualUpdate,
  type RunState,
} from '../../src/lib/game/engine';

declare global {
  interface Window {
    __boostQA: { created: number; frozen: boolean; live?: RunState };
  }
}

export const createRun: typeof actualCreateRun = (...args) => {
  const run = actualCreateRun(...args);
  run.boosts.grace = 1e8;
  window.__boostQA.live = run;
  window.__boostQA.created++;
  return run;
};

export const update: typeof actualUpdate = (run, dt, ...rest) => {
  if (window.__boostQA.frozen && run.mode === 'running') return;
  return actualUpdate(run, dt, ...rest);
};
