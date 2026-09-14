export interface RecordProgress {
  target: number;
  beaten: boolean;
  celebrateUntil: number;
}

export function createRecordProgress(best: number): RecordProgress {
  return {
    target: Number.isFinite(best) ? Math.max(0, Math.floor(best)) : 0,
    beaten: false,
    celebrateUntil: 0,
  };
}

// Keep the goal fixed for the whole run. A tie is not a new record, and the
// first run establishes a baseline instead of celebrating at the first point.
export function updateRecordProgress(progress: RecordProgress, score: number, activeTime: number) {
  if (progress.target === 0 || progress.beaten || score <= progress.target) return false;
  progress.beaten = true;
  progress.celebrateUntil = activeTime + 4;
  return true;
}
