// The clock must already be installed before the page loads. Fix Date while
// pausing so protocol latency cannot turn the captured moment into the past.
export async function freezeClockAtCurrentTime(page) {
  const currentTime = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(currentTime);
  await page.clock.pauseAt(currentTime);
  // Restore advancing Date semantics while timers remain paused for runFor.
  await page.clock.setSystemTime(currentTime);
  return currentTime;
}
