// Rendering is paced; requestAnimationFrame, input and simulation keep running.
// Advance a deadline rather than waiting a full interval after each paint, so
// 60/120Hz displays can present a stable 30/20/15/10Hz cadence without drift.
export class FramePacer {
  private next: number | null = null;
  private interval = 0;

  reset() { this.next = null; }

  shouldRender(now: number, fps: number): boolean {
    const interval = 1000 / fps;
    if (this.next === null || interval !== this.interval) {
      this.interval = interval;
      this.next = now;
    }
    // Allow small callback jitter and timestamp rounding at native cadence;
    // the tiny epsilon also avoids floating-point misses at the 2ms boundary.
    const tolerance = 2.001;
    if (now + tolerance < this.next) return false;
    this.next += (Math.floor((Math.max(0, now - this.next) + tolerance) / interval) + 1) * interval;
    return true;
  }
}
