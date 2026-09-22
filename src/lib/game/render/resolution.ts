// Adapt rendering only. CSS text, input and the simulation clock are independent
// of these detail and presentation budgets. Prefer less decoration before FPS.
const TIERS = [
  { ratio: 2, fps: 120 },
  { ratio: 2, fps: 90 },
  { ratio: 2, fps: 60 },
  { ratio: 1.5, fps: 60 },
  { ratio: 1, fps: 30 },
  { ratio: 1, fps: 20 },
  { ratio: 1, fps: 15 },
  { ratio: 1, fps: 10 },
] as const;

export class RenderResolution {
  private level = 2;
  private displayRate: 60 | 90 | 120 = 60;
  private previous: number | null = null;
  private elapsed = 0;
  private frames = 0;
  private slow = 0;
  private work = 0;
  private recovery = 0;
  private pressureHistory = 0;
  private recentSlow = 0;
  private settledValue = false;
  private calibrating = false;
  private allowGapPressure = true;
  private rejectedCeiling = 0;
  private upwardProbe: number | null = null;
  private referenceLevel: number | null = null;
  private referenceWork: number | null = null;
  private improvementWindows = 0;

  get limit(): number { return TIERS[this.level].ratio; }
  get fps(): number { return TIERS[this.level].fps; }
  get settled(): boolean {
    return this.settledValue && this.improvementWindows === 0 &&
      (this.level === TIERS.length - 1 || this.recentSlow < 3);
  }

  private fastestTier() { return this.displayRate === 120 ? 0 : this.displayRate === 90 ? 1 : 2; }
  private fasterTier() { return this.level <= 2 ? this.fastestTier() : this.level - 1; }

  setDisplayRate(fps: 60 | 90 | 120) {
    if (fps === this.displayRate) return;
    this.displayRate = fps;
    this.level = Math.max(this.fastestTier(), this.level);
    // 90Hz is useful on a 90Hz panel; on 120Hz prefer evenly spaced 60/120Hz.
    if (fps === 120 && this.level === 1) this.level = 2;
    this.resetWindow(true);
    this.recovery = 0;
    this.settledValue = false;
    this.upwardProbe = null;
    this.clearRejection();
  }

  private clearRejection() {
    this.rejectedCeiling = 0;
    this.referenceLevel = this.referenceWork = null;
    this.improvementWindows = 0;
  }

  private resetWindow(resetPressure = false) {
    this.elapsed = this.frames = this.slow = this.work = 0;
    if (resetPressure) this.pressureHistory = this.recentSlow = 0;
  }

  observe(now: number, workMs: number, animated: boolean, rendered = true,
      allowGapPressure = true, calibrating = false) {
    if (calibrating !== this.calibrating || allowGapPressure !== this.allowGapPressure) {
      this.calibrating = calibrating;
      this.allowGapPressure = allowGapPressure;
      // Activation changes which cadence evidence is trustworthy. Do not
      // retroactively classify the earlier host-limited gaps as rendering load.
      this.resetWindow(true);
      this.recovery = 0;
      this.improvementWindows = 0;
      this.settledValue = false;
    }
    if (animated && !rendered) return;
    const gap = this.previous === null ? 0 : now - this.previous;
    this.previous = animated ? now : null;
    // Pauses, hidden tabs and long idle host interruptions are not samples.
    // A long frame that actually spent time doing game work still counts.
    if (!animated || !Number.isFinite(gap) || !Number.isFinite(workMs) ||
        gap <= 0 || (gap > 250 && workMs <= 14) || workMs < 0) {
      this.resetWindow(true);
      this.recovery = 0;
      this.improvementWindows = 0;
      this.settledValue = false;
      return;
    }
    this.elapsed += gap;
    this.frames++;
    this.work += workMs;
    const budget = 1000 / this.fps;
    // An unactivated embedded frame can be host-throttled until interaction.
    // Its cadence alone is not rendering pressure; real CPU work still is.
    // Allow display quantization (e.g. alternating 11/22ms for 60fps on 90Hz).
    const pressure = (allowGapPressure && gap > budget + (1000 / this.displayRate) * 0.8) ||
      workMs > budget * 0.8;
    if (pressure) this.slow++;
    // Catch emerging sustained load before the full classification window,
    // but let isolated GC/input spikes coexist with a confirmed healthy tier.
    // Three of the last ten paints meet the same 30% pressure threshold.
    this.recentSlow += Number(pressure) - ((this.pressureHistory >>> 9) & 1);
    this.pressureHistory = ((this.pressureHistory << 1) | Number(pressure)) & 1023;
    // Require sustained pressure: a cold preview, resize or single GC pause
    // must not lower quality. Include cadence to detect deferred raster work.
    if (this.elapsed < 1200 || this.frames < 20) return;
    const meanWork = this.work / this.frames;
    const meanGap = this.elapsed / this.frames;
    // Quantized individual gaps may be tolerable even when the actual average
    // cannot sustain a high-refresh target. Validate the whole window too.
    const cadencePressure = allowGapPressure && meanGap > budget * 1.12;
    const windowPressure = this.slow / this.frames >= 0.3 || cadencePressure;
    const healthyWindow = this.slow / this.frames <= 0.05 && !cadencePressure;
    // A retained fallback may tolerate moderate pressure. Capture its actual
    // cost now, before a later healthy window would replace it with cheaper work.
    if (this.referenceLevel === this.level && this.referenceWork === null && !windowPressure) {
      this.referenceWork = meanWork;
    }
    if (this.referenceLevel === this.level && healthyWindow) {
      if (this.referenceWork !== null && meanWork < this.referenceWork && meanWork <= this.referenceWork * 0.75) {
        this.improvementWindows++;
        if (this.improvementWindows >= 2) this.clearRejection();
      } else this.improvementWindows = 0;
    } else this.improvementWindows = 0;
    const faster = this.fasterTier();
    const canImprove = faster < this.level && faster >= this.rejectedCeiling;
    const previousLevel = this.level;
    if (windowPressure) {
      this.level = Math.min(TIERS.length - 1, this.level === 0 ? 2 : this.level + 1);
      if (this.upwardProbe === previousLevel) {
        // Keep a measured rejection after startup too. Retry only when the
        // same fallback tier is meaningfully cheaper, or display evidence changes.
        this.rejectedCeiling = Math.max(this.rejectedCeiling, previousLevel + 1);
        this.referenceLevel = this.level;
        this.referenceWork = null;
      }
      this.upwardProbe = null;
      this.recovery = 0;
      this.improvementWindows = 0;
      this.settledValue = this.level === previousLevel;
    } else if (canImprove && healthyWindow &&
        ((!allowGapPressure && TIERS[faster].fps <= 60) || meanGap < budget * 1.12) &&
        meanWork < (1000 / TIERS[faster].fps) * 0.55) {
      // Require headroom for the NEXT tier, not merely a steady current cap.
      // Hidden startup can probe promptly; visible play restores cautiously.
      this.recovery += this.elapsed;
      this.settledValue = false;
      if (this.recovery >= (calibrating ? 3000 : 15000)) {
        this.level = faster;
        this.upwardProbe = faster;
        this.recovery = 0;
      }
    } else {
      this.recovery = 0;
      this.settledValue = true;
    }
    // Keep the recent burst guard across classification boundaries; a healthy
    // long window must not briefly hide load that began near its end.
    this.resetWindow(this.level !== previousLevel);
  }
}
