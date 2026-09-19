import assert from 'node:assert/strict';

export function assertCompletedRailReward(snapshot, rideCount) {
  const completion = snapshot.railCompletion;
  assert.ok(completion, 'The per-frame observer must retain the completed train reward.');
  assert.ok(Number.isSafeInteger(completion.reward) && completion.reward > 0, 'Completed train must award coins.');
  assert.equal(completion.questionCount, rideCount, 'The observed reward must belong to this train.');
  assert.equal(completion.correctCount, rideCount, 'Every train question must be correct before awarding coins.');
  assert.equal(completion.coinsBeforeAward, snapshot.initialCoins, 'The train reward must not be awarded before completion.');
  assert.equal(snapshot.coins, snapshot.initialCoins + completion.reward, 'The train reward must be awarded exactly once.');
}
