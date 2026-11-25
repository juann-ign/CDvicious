const MAX_INERTIA_FRAME_MS = 32;

/** One continuous Lenis clock, with a fresh epoch for each timed navigation. */
export class RailAnimationClock {
  private previousTime: number;
  private animationTime: number;
  private programmatic = false;
  private visible: boolean;

  constructor(now: number, visible: boolean) {
    this.previousTime = now;
    // Lenis treats time=0 as an uninitialized clock. Prime it before scrollTo.
    this.animationTime = Math.max(1, now);
    this.visible = visible;
  }

  get time() { return this.animationTime; }

  setProgrammatic(active: boolean, now: number) {
    // Even two consecutive menu/flight commands have different start epochs.
    // Discard the unconsumed interval before this command, never rebase the
    // accumulated clock Lenis subtracts from its own previous timestamp.
    if (active || this.programmatic) this.previousTime = now;
    this.programmatic = active;
  }

  setVisible(visible: boolean, now: number) {
    if (visible && !this.visible && !this.programmatic) this.previousTime = now;
    this.visible = visible;
    // Timed menu/flight navigation includes hidden elapsed time. It catches
    // up only on a visible frame; inertia never inherits a background gap.
  }

  advance(now: number) {
    if (!this.visible) return this.animationTime;
    const elapsed = Math.max(0, now - this.previousTime);
    this.previousTime = Math.max(this.previousTime, now);
    this.animationTime += this.programmatic
      ? elapsed
      : Math.min(elapsed, MAX_INERTIA_FRAME_MS);
    return this.animationTime;
  }
}
