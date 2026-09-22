// Observe browser animation callbacks, including callbacks that skip painting.
// This is a measured presentation ceiling, not a hardware/model assumption.
export class DisplayRefresh {
  fps: 60 | 90 | 120 = 60;
  private sampled = false;
  private previous: number | null = null;
  private elapsed = 0;
  private frames = 0;
  private fast120 = 0;
  private fast90 = 0;
  private initialElapsed = 0;
  private initialFrames = 0;

  get hasSample(): boolean { return this.sampled; }

  private resetWindow() {
    this.elapsed = this.frames = this.fast120 = this.fast90 = 0;
  }

  observe(now: number, active: boolean) {
    if (!active) {
      this.previous = null;
      this.resetWindow();
      this.initialElapsed = this.initialFrames = 0;
      return;
    }
    if (!Number.isFinite(now)) return;
    if (this.previous === null) {
      this.previous = now;
      return;
    }
    const gap = now - this.previous;
    // Duplicate or reordered timestamps cannot create extra fast samples.
    if (gap <= 0) return;
    this.previous = now;
    if (!this.sampled) {
      // Sustained very slow rendering must still confirm the conservative
      // default. Cap each gap so one idle interruption cannot do that alone.
      this.initialElapsed += Math.min(gap, 250);
      this.initialFrames++;
      this.sampled = this.initialElapsed >= 2000 && this.initialFrames >= 8;
    }
    if (gap > 250) {
      this.resetWindow();
      return;
    }
    this.elapsed += gap;
    this.frames++;
    if (gap <= 9.5) this.fast120++;
    if (gap <= 12) this.fast90++;
    if (this.elapsed < 2000 || this.frames < 8) return;

    // Several short callbacks alone can be timestamp jitter on a slower
    // display. Require corroborating cadence over the whole window while
    // tolerating occasional missed frames and input/GC stalls.
    const mean = this.elapsed / this.frames;
    const credible = Math.max(8, this.frames / 3);
    this.fps = this.fast120 >= credible && mean <= 11 ? 120
      : this.fast90 >= credible && mean <= 14 ? 90 : 60;
    this.sampled = true;
    this.resetWindow();
  }
}
