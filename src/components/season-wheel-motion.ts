import { listenToMediaQuery } from "../lib/game/media-query";

export interface SeasonWheelCallbacks {
  onLabel(index: number): void;
  /** Reconcile the two slots, then acknowledge this step from a layout effect. */
  onStep(step: number): void;
  onArrive(): void;
}

export interface SeasonWheelMotion {
  advance(): void;
  setDestination(sceneIndex: number | null): void;
  committed(step: number): void;
  dispose(): void;
}

const seasonAt = (step: number) => ((step % 4) + 4) % 4;
const EPSILON = 1e-7;

/** Two reusable half-circles; four seasons occupy 720 degrees of virtual travel. */
export function createSeasonWheelMotion(wheel: HTMLElement, callbacks: SeasonWheelCallbacks): SeasonWheelMotion {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let phase = 0;
  let step = 0;
  let waiting: number | null = null;
  let destination: number | null = null;
  let target: number | null = null;
  let arrived = false;
  let disposed = false;
  let label = -1;
  let labelTimer: number | undefined;
  let animation: Animation | undefined;
  let segment: { from: number; to: number; duration: number } | undefined;

  const setLabel = (position: number) => {
    const next = seasonAt(Math.floor(position + 0.5));
    if (next !== label) {
      label = next;
      callbacks.onLabel(next);
    }
  };
  // Scenery moves left at the top so the stationary TV travels clockwise.
  const pose = () => { wheel.style.transform = `rotate(${phase * -180}deg)`; };
  const currentPhase = () => {
    const elapsed = animation?.currentTime;
    return segment && typeof elapsed === "number"
      ? segment.from + (segment.to - segment.from) * Math.min(1, Math.max(0, elapsed / segment.duration))
      : phase;
  };
  const stop = () => {
    phase = currentPhase();
    pose();
    const previous = animation;
    animation = undefined;
    segment = undefined;
    window.clearTimeout(labelTimer);
    labelTimer = undefined;
    previous?.cancel();
  };
  const requestStep = (next: number) => {
    waiting = next;
    callbacks.onStep(next);
  };
  const forwardTarget = (index: number, strictlyForward: boolean) => {
    let next = Math.floor(phase / 4) * 4 + index;
    if (strictlyForward ? next <= phase + EPSILON : next < phase - EPSILON) next += 4;
    return next;
  };

  const resume = () => {
    if (disposed || waiting !== null || animation) return;
    // An interruption can observe a finished animation before its promise runs.
    // Reconcile that boundary before planning any subsequent movement.
    if (phase >= step + 1 - EPSILON) {
      phase = step + 1;
      pose();
      setLabel(phase);
      requestStep(step + 1);
      return;
    }
    if (document.hidden) return;
    if (target !== null && Math.abs(phase - target) < EPSILON) {
      phase = target;
      pose();
      setLabel(phase);
      if (destination !== null) {
        if (!arrived) {
          arrived = true;
          callbacks.onArrive();
        }
        return;
      }
      target = null;
    }
    if (preference.matches || typeof wheel.animate !== "function") {
      const next = target ?? Math.ceil(phase);
      // The layout-effect acknowledgement applies the snap after the slot DOM
      // has been reconciled, so even a multi-season snap cannot expose old art.
      if (next !== step || phase !== next) requestStep(next);
      return;
    }

    const next = step + 1;
    const duration = (next - phase) * (target === null ? 4000 : 320);
    const from = phase;
    segment = { from, to: next, duration };
    const turn = wheel.animate([
      { transform: `rotate(${from * -180}deg)` },
      { transform: `rotate(${next * -180}deg)` },
    ], { duration, easing: "linear", fill: "forwards" });
    animation = turn;
    setLabel(phase);
    const midpoint = step + 0.5;
    if (from < midpoint) {
      const updateLabel = () => {
        if (disposed || animation !== turn) return;
        const position = currentPhase();
        setLabel(position);
        // A timer can run before WAAPI exposes the newest display sample.
        // Keep just one pending boundary timer rather than polling every frame.
        labelTimer = position < midpoint ? window.setTimeout(updateLabel,
          Math.max(16, (midpoint - position) / (next - from) * duration + 1)) : undefined;
      };
      labelTimer = window.setTimeout(updateLabel, (midpoint - from) / (next - from) * duration + 1);
    }
    void turn.finished.then(() => {
      if (disposed || animation !== turn) return;
      stop();
      phase = next;
      pose();
      setLabel(phase);
      // The old visible half is now fully hidden. Never rotate past this pose
      // until React has recycled that half and acknowledged the new pair.
      requestStep(next);
    }, () => {});
  };

  const updateMotion = () => {
    if (disposed) return;
    stop();
    resume();
  };
  const stopListening = listenToMediaQuery(preference, updateMotion);
  document.addEventListener("visibilitychange", updateMotion);
  pose();
  setLabel(phase);
  resume();

  return {
    advance() {
      if (disposed || destination !== null) return;
      stop();
      const pending = target ?? Math.floor(phase + 0.5);
      target = forwardTarget(seasonAt(pending + 1), true);
      resume();
    },
    setDestination(sceneIndex) {
      if (disposed) return;
      const next = sceneIndex === null ? null : seasonAt(Math.trunc(sceneIndex));
      if (next === destination) return;
      stop();
      destination = next;
      arrived = false;
      target = next === null ? null : forwardTarget(next, false);
      resume();
    },
    committed(next) {
      if (disposed || waiting !== next) return;
      step = next;
      phase = next;
      waiting = null;
      // A retarget can arrive while a reduced-motion snap is awaiting React.
      // Rebase its season against the newly committed pose before animating.
      if (target !== null && target < phase - EPSILON) target = forwardTarget(seasonAt(target), false);
      pose();
      setLabel(phase);
      resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      stopListening();
      document.removeEventListener("visibilitychange", updateMotion);
    },
  };
}
