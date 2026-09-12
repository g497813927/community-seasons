import { RAIL_RETURN_DURATION, RAIL_UNLOCK_TIME, type RunState } from "./engine";

export type RailTravelFrame = {
  direction: "boarding" | "return";
  opacity: number;
  progress?: number;
};
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Cover the geometry swap at the station, then reveal the new activity. All
// timings derive from the simulation, so pausing also pauses the transition.
export function railTravelFrame(
  s: Pick<
    RunState,
    "rail" | "railReturnRemaining" | "time" | "speed" | "distance" | "nextRailAt" | "railPreparedAt"
  >,
): RailTravelFrame | null {
  if (s.rail?.phase === "boarding") {
    const elapsed = s.rail.duration - s.rail.remaining;
    return elapsed < 1.85
      ? {
          direction: "boarding",
          opacity: 1 - smooth((elapsed - 0.5) / 1.35),
          progress: Math.min(1, (1 + elapsed) / 3),
        }
      : null;
  }
  if (s.rail?.phase === "complete" && s.rail.remaining < 1)
    return {
      direction: "return",
      opacity: smooth(1 - s.rail.remaining),
      progress: (1 - s.rail.remaining) / (1 + RAIL_RETURN_DURATION),
    };
  if (s.railReturnRemaining > 0)
    return {
      direction: "return",
      opacity: smooth(s.railReturnRemaining / (RAIL_RETURN_DURATION - 0.3)),
      progress: 1 - s.railReturnRemaining / (1 + RAIL_RETURN_DURATION),
    };
  if (!s.rail && s.time >= RAIL_UNLOCK_TIME && s.railPreparedAt === s.nextRailAt) {
    const seconds = (s.nextRailAt - s.distance) / Math.max(1, s.speed);
    if (seconds >= 0 && seconds < 1)
      return { direction: "boarding", opacity: smooth(1 - seconds), progress: (1 - seconds) / 3 };
  }
  return null;
}
