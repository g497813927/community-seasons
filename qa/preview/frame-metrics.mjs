// A fixed histogram keeps every interval without accumulating raw frame samples.
// Bins are upper bounds at 1ms resolution; intervals over 60s share an overflow
// bin whose conservative upper bound is the observed maximum.
const LAST_BUCKET_MS = 60000;

export function createFrameMetrics() {
  const buckets = new Float64Array(LAST_BUCKET_MS + 2);
  let frames = 0, maximum = null;
  return {
    record(gap) {
      if (!Number.isFinite(gap) || gap < 0) return;
      buckets[Math.min(Math.ceil(gap), LAST_BUCKET_MS + 1)]++;
      frames++;
      maximum = Math.max(maximum ?? 0, gap);
    },
    reset() { buckets.fill(0); frames = 0; maximum = null; },
    report() {
      let p95 = null;
      if (frames) {
        const rank = Math.ceil(frames * .95);
        let total = 0;
        for (let bucket = 0; bucket < buckets.length; bucket++) {
          total += buckets[bucket];
          if (total >= rank) { p95 = bucket > LAST_BUCKET_MS ? maximum : Math.min(bucket, maximum); break; }
        }
      }
      return {
        frames, frameGapP95Ms: p95, frameGapMaxMs: maximum,
        frameGapP95Method: 'Upper bound from 1ms histogram; gaps over 60000ms use the observed maximum.',
        scope: 'All visible frame intervals since the last reset.',
      };
    },
  };
}
