export const STAGES = [
  ['run', 8_000], ['motions', 10_000], ['fork-left', 6_000], ['fork-right', 6_000],
  ['rail-approach', 5_000], ['rail-question', 6_000], ['rail-feedback', 3_000],
  ['rail-falling', 3_000], ['rail-complete', 3_000], ['rail-return', 3_000],
  ['season', 5_000], ['paused', 1_000], ['run-resumed', 1_000],
] as const;
export type Stage = typeof STAGES[number][0];
export const REQUIREMENTS = {
  minimumDurationMs: 60_000,
  stages: STAGES.map(([id]) => id),
  poses: ['running', 'jump', 'slide', 'steering', 'recoil', 'paused'],
  obstacles: ['block', 'arch', 'pillar', 'roots'],
  turnDirections: ['-1', '1'],
  railPhases: ['boarding', 'question', 'feedback', 'falling', 'complete'],
  transitions: ['season-approach', 'season', 'rail-approach', 'rail-return'],
};
export function stageAt(elapsedMs: number): { id: Stage; start: number; cycle: number } {
  const cycle = Math.floor(elapsedMs / 60_000);
  const local = elapsedMs % 60_000;
  let start = cycle * 60_000;
  for (const [id, duration] of STAGES) {
    if (elapsedMs < start + duration) return { id, start, cycle };
    start += duration;
  }
  return { id: 'run', start: elapsedMs - local, cycle };
}
