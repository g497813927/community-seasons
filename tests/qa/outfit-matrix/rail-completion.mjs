// Capture the engine's declared reward before the completed ride is discarded.
// Host screenshots and polling can skip the entire two-second complete phase.
export function createRailCompletionObserver() {
  let completion = null;
  return {
    observe(run) {
      if (completion || run.rail?.phase !== 'complete') return;
      completion = {
        reward: run.rail.reward,
        questionCount: run.rail.questions.length,
        correctCount: run.rail.correctCount,
        coinsBeforeAward: run.coins,
      };
    },
    snapshot() { return completion ? { ...completion } : null; },
    reset() { completion = null; },
  };
}
