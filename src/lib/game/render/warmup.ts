// A one-time startup transition. Readiness needs healthy rendering evidence at
// the validated budget; elapsed time alone cannot finish it.
export class RenderWarmup {
  private previous: number | null = null;
  private elapsed = 0;
  private quiet = 0;
  private paints = 0;
  private fps = 0;
  private ratio = 0;
  private stable = false;
  private done = false;

  pause() {
    this.previous = null;
    this.quiet = this.paints = 0;
    this.stable = false;
  }

  observe(
    now: number, visible: boolean, rendered: boolean, fps: number, ratio: number,
    settled: boolean, animated = true,
  ): boolean {
    if (this.done) return true;
    if (!visible) { this.pause(); return false; }
    if (!Number.isFinite(now) || (this.previous !== null && now < this.previous)) return false;
    const gap = this.previous === null ? 0 : now - this.previous;
    this.previous = now;
    this.elapsed += gap;
    if (!animated || fps !== this.fps || ratio !== this.ratio) {
      this.quiet = this.paints = 0;
    } else if (settled && this.stable) {
      // Brief scheduling pressure pauses evidence instead of erasing it. Both
      // endpoints must be healthy so the unsettled gap contributes no time.
      this.quiet += gap;
      if (rendered) this.paints++;
    }
    this.fps = fps;
    this.ratio = ratio;
    this.stable = animated && settled;
    // A portrait warning or modal stops calibration. Reveal that blocking UI
    // after the minimum transition instead of covering it indefinitely.
    this.done = this.elapsed >= 2000 &&
      (!animated || (settled && this.quiet >= 1600 && this.paints >= 30));
    return this.done;
  }
}
