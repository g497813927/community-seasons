import {
  boostDefinition,
  PICKUP_BOOSTERS,
  HEAD_START_WINDOW,
  type SkillKind,
  createBoostState,
  createBoostCounts,
  createBoostLevels,
  normalizeBoostLevel,
  isBoostKind,
  type BoostKind,
  type BoostState,
  type BoostLevel,
} from "./boosts";
import { nextScene, type SceneKind } from "./scenes";
import { beginRailQuestion, createRailQuestionDeck, createRailRide, currentRailQuestion, type RailQuestionDeck, type RailRide } from "./railway";
export { currentRailQuestion } from "./railway";

export type Mode = "ready" | "running" | "paused" | "over";
export type Action = "left" | "right" | "jump" | "slide";
export type ObstacleKind = "block" | "arch" | "pillar" | "roots";
export interface Obstacle {
  id: number;
  lane: number;
  at: number;
  kind: ObstacleKind;
  resolved: boolean;
}
export interface PostReview {
  id: number;
  kind: ObstacleKind;
  shielded: boolean;
}
export interface Coin {
  route?: "guide" | "option" | "connector";
  height?: number;
  trailAt?: number;
  id: number;
  lane: number;
  at: number;
  taken: boolean;
}
export interface RelicPickup {
  height?: number;
  id: number;
  lane: number;
  at: number;
  kind: BoostKind;
  taken: boolean;
}
export interface RunState {
  fork: { at: number; preparedFrom?: number; blockedDirection?: -1 | 1 } | null;
  nextForkAt: number;
  lastForkAt: number | null;
  lastForkBlockedDirection: -1 | 0 | 1;
  turnDirection: -1 | 0 | 1;
  turnEntryX: number;
  turnRemaining: number;
  rail: RailRide | null;
  railQuestionDeck: RailQuestionDeck;
  railReturnRemaining: number;
  nextRailAt: number;
  railPreparedAt: number | null;
  railPreparedFrom: number | null;
  edgeStumble: number;
  edgeStumbleDirection: -1 | 0 | 1;
  review: PostReview | null;
  reviewedPosts: number;
  scene: SceneKind;
  nextPortalAt: number;
  portalLane: number;
  milestone: number;
  milestoneRemaining: number;
  sceneTransition: number;
  sceneTransitionFrom: SceneKind | null;
  pendingScene: SceneKind | null;
  mode: Mode;
  distance: number;
  coins: number;
  score: number;
  speed: number;
  lane: number;
  x: number;
  jump: number;
  slide: number;
  time: number;
  obstacles: Obstacle[];
  pickups: Coin[];
  reason: string;
  seed: number;
  nextRow: number;
  rows: number;
  rowBurstRemaining?: number;
  nextId: number;
  flash: number;
  collectedAt: number;
  bankedCoins: number;
  boosts: BoostState;
  effectLevels: Record<BoostKind, BoostLevel>;
  relics: RelicPickup[];
  collectedRelics: Record<BoostKind, number>;
  nextRelicAt: number;
  lastTrailLane: number;
  lastTrailEnd: number;
  permanentSkill: SkillKind | null;
  skillCharge: number;
  skillRechargeLocked: boolean;
  skillBlockedCoins: number;
  chase: number;
  stumbles: number;
  lastStumble: "roots" | "edge" | null;
  shieldAbsorbed: number;
}
export const JUMP_DURATION = 0.92;
export const SLIDE_DURATION = 0.8;
export const LANE_WIDTH = 1.65;
export const INITIAL_SPEED = 12;
export const MAX_SPEED = 66;
export const TURN_DURATION = 1.4;
export const EDGE_STUMBLE_DURATION = 0.65;
export const RAIL_RETURN_DURATION = 1.1;
export const RAIL_SPEED = 12;
export const MAX_RAIL_SPEED = 30;
export const FORK_UNLOCK_TIME = 25;
export const RAIL_UNLOCK_TIME = 60;
export const CHASE_DURATION = 6;
export const MONSTER_INTRO_DURATION = 3.5;
export const CHASE_APPROACH_DURATION = 1.1;
export const MIN_RELIC_JUMP_HEIGHT = 0.9;
export const RELIC_HEIGHT = 3.1;
export const FORCED_ACTION_UNLOCK_TIME = 30;
export const PORTAL_INTERVAL = 2500;
export const MILESTONE_INTERVAL = 500;
export const MILESTONE_DURATION = 3;
export const SCENE_TRANSITION_DURATION = 2;
function normalSpeedAt(distance: number): number {
  return Math.min(MAX_SPEED, INITIAL_SPEED + Math.max(0, distance) * 0.006);
}
// Latch each ride's pace at boarding so its answer gates and mileage advance
// together. Temporary boosts do not shorten the question's reading window.
export function railSpeed(s: RunState): number {
  return Math.max(
    RAIL_SPEED,
    Math.min(
      MAX_RAIL_SPEED,
      s.rail?.speed ?? s.rail?.entryNormalSpeed ?? normalSpeedAt(s.distance),
    ),
  );
}
// Visual approach is independent of danger: the opening and active chase keep
// their full collision windows while the pursuers run into view from behind.
export function monsterPresence(s: RunState): number {
  if (s.mode === "ready" || s.rail || s.boosts.headstart > 0 || s.boosts.portal > 0) return 0;
  const remaining = s.chase > 0 ? s.chase : MONSTER_INTRO_DURATION - s.time;
  const elapsed = s.chase > 0 ? CHASE_DURATION - s.chase : s.time;
  const approach = Math.max(0, Math.min(1, elapsed / CHASE_APPROACH_DURATION));
  return approach * approach * (3 - 2 * approach) * Math.max(0, Math.min(1, remaining / 1.2));
}
// Convert normal running time to distance while the run accelerates, then
// continue linearly once its 5.5x cap is reached.
function distanceAfterNormalSeconds(distance: number, seconds: number) {
  const speed = Math.min(MAX_SPEED, INITIAL_SPEED + distance * 0.006);
  const untilCap = Math.max(0, Math.log(MAX_SPEED / speed) / 0.006);
  const accelerating = Math.min(seconds, untilCap);
  return (
    distance +
    (speed * Math.expm1(0.006 * accelerating)) / 0.006 +
    MAX_SPEED * (seconds - accelerating)
  );
}
export function createRun(
  seed = 4182,
  scene: SceneKind = "spring",
  railQuestionDeck = createRailQuestionDeck(),
): RunState {
  const run: RunState = {
    fork: null,
    nextForkAt: 430 + ((seed >>> 0) % 90),
    lastForkAt: null,
    lastForkBlockedDirection: 0,
    turnDirection: 0,
    turnEntryX: 0,
    turnRemaining: 0,
    rail: null,
    railQuestionDeck,
    railReturnRemaining: 0,
    nextRailAt: 930 + ((seed >>> 0) % 120),
    railPreparedAt: null,
    railPreparedFrom: null,
    edgeStumble: 0,
    edgeStumbleDirection: 0,
    review: null,
    reviewedPosts: 0,
    scene,
    nextPortalAt: PORTAL_INTERVAL,
    portalLane: ((seed >>> 0) % 3) - 1,
    milestone: 0,
    milestoneRemaining: 0,
    sceneTransition: 0,
    sceneTransitionFrom: null,
    pendingScene: null,
    mode: "ready",
    distance: 0,
    coins: 0,
    score: 0,
    speed: INITIAL_SPEED,
    lane: 0,
    x: 0,
    jump: 0,
    slide: 0,
    time: 0,
    obstacles: [],
    pickups: [],
    reason: "",
    seed,
    nextRow: 50,
    rows: 0,
    rowBurstRemaining: 0,
    nextId: 1,
    flash: 0,
    collectedAt: -10,
    bankedCoins: 0,
    boosts: createBoostState(),
    effectLevels: createBoostLevels(),
    relics: [],
    collectedRelics: createBoostCounts(),
    nextRelicAt: 0,
    lastTrailLane: 0,
    lastTrailEnd: -Infinity,
    permanentSkill: null,
    skillCharge: 0,
    skillRechargeLocked: false,
    skillBlockedCoins: 0,
    chase: 0,
    stumbles: 0,
    lastStumble: null,
    shieldAbsorbed: 0,
  };
  // A matching obstacle row places the first pickup roughly 10–16 seconds
  // into the run; it is no longer attached to the fixed 65-meter opening.
  run.nextRelicAt = distanceAfterNormalSeconds(0, 10 + random(run) * 3);
  return run;
}
export function jumpHeight(s: RunState) {
  return s.jump > 0 ? Math.sin(Math.PI * (1 - s.jump / JUMP_DURATION)) * 2.15 : 0;
}
function boostedForkApproach(s: RunState) {
  return (
    s.fork !== null &&
    (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0) &&
    s.fork.at - s.distance <= Math.max(8, s.speed * 0.55)
  );
}
export function act(s: RunState, action: Action): boolean {
  if (
    s.mode !== "running" ||
    s.sceneTransition > 0 ||
    s.turnRemaining > 0 ||
    s.railReturnRemaining > 0
  )
    return false;
  if (s.rail) {
    if (action !== "left" && action !== "right") return false;
    return selectRailLane(
      s,
      Math.max(-1, Math.min(1, s.lane + (action === "left" ? -1 : 1))) as -1 | 0 | 1,
    );
  }
  if (action === "left" || action === "right") {
    const direction = action === "left" ? -1 : 1;
    if (boostedForkApproach(s)) {
      // Near a boosted fork, a direction chooses the branch directly. Requiring
      // a center-lane stop would override a deliberate choice. A closed branch
      // cannot replace the safe route selected by the active speed boost.
      const safeDirection = s.fork!.blockedDirection === direction ? -direction : direction;
      const changed = s.lane !== safeDirection;
      s.lane = safeDirection;
      return changed;
    }
    const reversing = direction * (s.lane * LANE_WIDTH - s.x) < 0;
    const nearestLane = Math.sign(s.x) * Math.round(Math.abs(s.x) / LANE_WIDTH);
    // Reverse from the actual position, discarding the old destination.
    // Same-direction taps can still request another lane ahead.
    const origin = reversing ? nearestLane : s.lane;
    const lane = Math.max(-1, Math.min(1, origin + direction));
    if (lane === s.lane) {
      if (origin + direction < -1 || origin + direction > 1) stumble(s, "edge");
      return false;
    }
    s.lane = lane;
    return true;
  }
  // Different motions take over immediately. Extra jump inputs leave the
  // current arc intact; repeated slide inputs can still restart the slide.
  if (action === "jump") {
    if (s.jump > 0) return false;
    s.slide = 0;
    s.jump = JUMP_DURATION;
    return true;
  }
  if (action === "slide") {
    s.jump = 0;
    s.slide = SLIDE_DURATION;
    return true;
  }
  return false;
}
export function togglePause(s: RunState) {
  if (s.review) return;
  if (s.mode === "running") s.mode = "paused";
  else if (s.mode === "paused") s.mode = "running";
}
// Reading a post freezes the run; dismissing it never revives a failed run.
export function finishReview(s: RunState) {
  if (!s.review) return false;
  s.review = null;
  s.reviewedPosts++;
  if (s.mode === "paused") {
    s.mode = "running";
    s.boosts.grace = Math.max(s.boosts.grace, 1.2);
  }
  return true;
}
function reviewPost(s: RunState, obstacle: Obstacle, shielded: boolean) {
  s.review = { id: obstacle.id, kind: obstacle.kind, shielded };
  if (s.mode === "running") s.mode = "paused";
}
export function activateBoost(s: RunState, kind: BoostKind, level: BoostLevel = 1): boolean {
  if (
    s.mode !== "running" ||
    s.rail !== null ||
    s.railReturnRemaining > 0 ||
    s.turnRemaining > 0 ||
    s.sceneTransition > 0 ||
    kind === "portal" ||
    !isBoostKind(kind) ||
    s.boosts[kind] > 0 ||
    (kind === "headstart" && s.time >= HEAD_START_WINDOW)
  )
    return false;
  level = normalizeBoostLevel(level);
  s.boosts[kind] = boostDefinition(kind, level).duration;
  s.effectLevels[kind] = level;
  if (kind === "shield") s.boosts.shieldTime = boostDefinition(kind, level).shieldDuration;
  if (kind === "headstart") s.chase = 0;
  return true;
}
function protectedFromHit(s: RunState): boolean {
  if (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0 || s.boosts.grace > 0)
    return true;
  if (s.boosts.shield > 0 && s.boosts.shieldTime > 0) {
    s.boosts.shield--;
    s.shieldAbsorbed++;
    if (!s.boosts.shield) s.boosts.shieldTime = 0;
    s.boosts.grace = 1.2;
    return true;
  }
  return false;
}
function stumble(s: RunState, cause: "roots" | "edge") {
  // Speed boosts ignore lane barriers as well as posts. Handle this before
  // edge recovery, which would otherwise summon or extend a chase.
  if (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0) return false;
  if (cause === "edge") {
    if (s.edgeStumble > 0 || s.boosts.grace > 0) return false;
    s.edgeStumble = EDGE_STUMBLE_DURATION;
    s.edgeStumbleDirection = s.lane < 0 ? -1 : 1;
    s.stumbles++;
    s.lastStumble = "edge";
    // An existing pursuer stays visible when another edge hit extends the
    // chase. Resetting to the full duration would restart its approach at zero.
    s.chase =
      s.chase > 0 ? Math.max(s.chase, CHASE_DURATION - CHASE_APPROACH_DURATION) : CHASE_DURATION;
    s.boosts.grace = Math.max(s.boosts.grace, 0.5);
    s.flash = 0.1;
    return false;
  }
  if (protectedFromHit(s)) return false;
  const guardianClose = s.chase > 0 || s.time < MONSTER_INTRO_DURATION;
  s.stumbles++;
  s.lastStumble = cause;
  if (guardianClose) {
    s.mode = "over";
    s.flash = 0.6;
    s.reason = "The disruptors caught up. A hit during a chase ends the run.";
    return true;
  }
  s.chase = CHASE_DURATION;
  s.flash = 0.15;
  return false;
}
function random(s: RunState) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
interface SpecialRange {
  kind: "fork" | "rail";
  clearStart: number;
  clearEnd: number;
  rowStart: number;
  rowEnd: number;
  resumeAt: number;
}
function approachSpeed(s: RunState, at: number) {
  const normal = Math.min(MAX_SPEED, INITIAL_SPEED + at * 0.006);
  const multiplier =
    s.boosts.headstart > 0 || s.boosts.portal > 0 ? 2 : s.boosts.rush > 0 ? 1.65 : 1;
  return { normal, actual: Math.max(s.speed, normal * multiplier) };
}
function forkRange(s: RunState, at = s.fork?.at ?? s.nextForkAt): SpecialRange {
  const speed = approachSpeed(s, at);
  // The camera follows the fork for 2.2 seconds before crossing. Clear full
  // row tails ahead of that, then leave the 1.4-second turn plus reaction time.
  const clearStart = at - speed.actual * 2.2;
  const rowEnd = at + speed.actual * 2.8;
  return {
    kind: "fork",
    clearStart,
    clearEnd: rowEnd - speed.normal * 0.46,
    rowStart: clearStart - speed.normal * 0.68,
    rowEnd,
    resumeAt: rowEnd + 0.1,
  };
}
function railRange(s: RunState): SpecialRange {
  const at = s.nextRailAt;
  const { normal: normalSpeed, actual: actualSpeed } = approachSpeed(s, at);
  // The one-second boarding fade begins after all ordinary row tails end.
  // Scale this approach with speed instead of imposing 90+ empty meters.
  const clearStart = at - Math.max(14, actualSpeed * 1.1);
  const clearEnd = at + Math.max(36, actualSpeed * 2.4);
  const rowEnd = clearEnd + normalSpeed * 0.46;
  return {
    kind: "rail",
    clearStart,
    clearEnd,
    rowStart: clearStart - normalSpeed * 0.68,
    rowEnd,
    resumeAt: rowEnd + 0.1,
  };
}
function specialRanges(s: RunState): SpecialRange[] {
  const ranges: SpecialRange[] = [];
  if (Number.isFinite(s.fork?.at ?? s.nextForkAt)) ranges.push(forkRange(s));
  // Warmup can still move the station ahead of a boosted runner. Reserving
  // each provisional location would leave a long, permanently empty road.
  // Keep normal rows until the station unlocks and its approach is settled.
  if (s.time >= RAIL_UNLOCK_TIME && Number.isFinite(s.nextRailAt)) ranges.push(railRange(s));
  return ranges;
}
function clearRange(s: RunState, from: number, to: number) {
  s.obstacles = s.obstacles.filter((item) => item.at < from || item.at > to);
  s.pickups = s.pickups.filter((item) => item.at < from || item.at > to);
  s.relics = s.relics.filter((item) => item.at < from || item.at > to);
  s.lastTrailEnd = -Infinity;
}
function clearSpecialRange(s: RunState, range: SpecialRange) {
  clearRange(s, range.clearStart, range.clearEnd);
  // If a speed boost widens an already generated approach, remove the whole
  // affected guide rather than leaving coins pointing through a cleared row.
  s.obstacles = s.obstacles.filter((item) => item.at < range.clearStart || item.at > range.rowEnd);
  s.pickups = s.pickups.filter(
    (item) => item.trailAt == null || item.trailAt < range.rowStart || item.trailAt > range.rowEnd,
  );
  s.relics = s.relics.filter((item) => item.at < range.clearStart || item.at > range.rowEnd);
}
function clearLanding(s: RunState, railway = false) {
  if (!railway) {
    const range = forkRange(s, s.lastForkAt ?? s.distance);
    clearSpecialRange(s, { ...range, clearStart: s.distance - 15 });
    s.nextRow = Math.max(s.nextRow, range.resumeAt);
    s.nextRelicAt = Math.max(s.nextRelicAt, range.resumeAt);
    return;
  }
  const exit = s.distance + Math.max(36, s.speed * 2.4);
  const padding = Math.min(MAX_SPEED, INITIAL_SPEED + s.distance * 0.006) * 0.46 + 0.1;
  // Rail travel may have passed ordinary rows and their pickup schedule.
  // Discard that old road rather than replaying it at the exit.
  s.obstacles = s.obstacles.filter((item) => item.at > exit);
  s.pickups = s.pickups.filter((item) => item.at > exit);
  s.relics = s.relics.filter((item) => item.at > exit);
  s.lastTrailEnd = -Infinity;
  if (s.nextRelicAt < s.distance)
    s.nextRelicAt = distanceAfterNormalSeconds(s.distance, 22 + random(s) * 16);
  s.nextRow = Math.max(s.nextRow, exit + padding);
  s.nextRelicAt = Math.max(s.nextRelicAt, exit + padding);
}
function separateEvent(at: number, other: number, s: RunState) {
  if (!Number.isFinite(at)) return at;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(at - other) < 300) at = other + 330;
    const portal = Math.round(at / PORTAL_INTERVAL) * PORTAL_INTERVAL;
    if (Number.isFinite(s.nextPortalAt) && portal > 0 && Math.abs(at - portal) < 270)
      at = portal + 300;
  }
  return at;
}
function prepareSpecialEvents(s: RunState) {
  // Reschedule after restored checkpoints instead of firing a stale gate.
  if (s.nextForkAt < s.distance - 1) {
    s.nextForkAt = s.distance + 240;
    s.fork = null;
  }
  if (s.nextRailAt < s.distance - 1) {
    s.nextRailAt = s.distance + 570;
    s.railPreparedAt = null;
    s.railPreparedFrom = null;
  }
  if (!s.fork) {
    if (s.time < FORK_UNLOCK_TIME && s.nextForkAt < s.distance + 145)
      s.nextForkAt = s.distance + 145;
    s.nextForkAt = separateEvent(s.nextForkAt, s.nextRailAt, s);
    if (s.time >= FORK_UNLOCK_TIME && s.nextForkAt <= s.distance + 135) {
      const route = random(s);
      s.fork = {
        at: s.nextForkAt,
        blockedDirection: route < 0.25 ? -1 : route < 0.5 ? 1 : undefined,
      };
    }
  }
  if (s.fork) {
    const range = forkRange(s);
    if (s.fork.preparedFrom == null || range.clearStart < s.fork.preparedFrom - 0.1) {
      s.fork.preparedFrom = range.clearStart;
      clearSpecialRange(s, range);
    }
  }
  if (s.time < RAIL_UNLOCK_TIME && s.nextRailAt < s.distance + 165) s.nextRailAt = s.distance + 165;
  s.nextRailAt = separateEvent(s.nextRailAt, s.fork?.at ?? s.nextForkAt, s);
  const approach = railRange(s);
  if (
    s.time >= RAIL_UNLOCK_TIME &&
    s.nextRailAt <= s.distance + 135 &&
    (s.railPreparedAt !== s.nextRailAt ||
      s.railPreparedFrom == null ||
      approach.clearStart < s.railPreparedFrom - 0.1)
  ) {
    s.railPreparedAt = s.nextRailAt;
    s.railPreparedFrom = approach.clearStart;
    clearRange(s, approach.clearStart, approach.clearEnd);
  }
}
export function selectRailLane(s: RunState, lane: -1 | 0 | 1): boolean {
  if (
    s.mode !== "running" ||
    !s.rail ||
    !["boarding", "question"].includes(s.rail.phase) ||
    ![-1, 0, 1].includes(lane)
  )
    return false;
  if (s.lane === lane) return false;
  s.lane = lane;
  return true;
}
function judgeRailAnswer(s: RunState) {
  const ride = s.rail!;
  const question = currentRailQuestion(s)!;
  const optionIndex = ride.optionOrder[s.lane + 1];
  ride.answerLane = s.lane;
  ride.correct = optionIndex === question.correctIndex;
  if (ride.correct) {
    ride.correctCount++;
    ride.phase = "feedback";
    ride.duration = 1.6;
    ride.remaining = 1.6;
  } else {
    ride.failure = { questionId: question.id, optionIndex, correctIndex: question.correctIndex };
    ride.phase = "falling";
    ride.duration = 1.2;
    ride.remaining = 1.2;
  }
}
export function submitRailAnswer(s: RunState): boolean {
  if (
    s.mode !== "running" ||
    !s.rail ||
    s.rail.phase !== "question" ||
    s.review ||
    s.sceneTransition > 0 ||
    s.turnRemaining > 0 ||
    s.railReturnRemaining > 0 ||
    ![-1, 0, 1].includes(s.lane)
  )
    return false;
  // Submit the selected lane now without simulating the unused reading time.
  // The ordinary feedback/fall and end-of-ride reward still run exactly once.
  judgeRailAnswer(s);
  return true;
}
function startRail(s: RunState) {
  s.rail = createRailRide(() => random(s), s.railQuestionDeck ??= createRailQuestionDeck());
  s.rail.entryNormalSpeed = normalSpeedAt(s.distance);
  s.rail.speed = railSpeed(s);
  s.jump = 0;
  s.slide = 0;
  s.lane = 0;
  s.x = 0;
  s.fork = null;
  clearLanding(s, true);
}
function stepMilestone(s: RunState, dt: number) {
  s.milestoneRemaining = Math.max(0, s.milestoneRemaining - dt);
  const milestone = Math.floor(s.distance / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;
  if (milestone > s.milestone) {
    s.milestone = milestone;
    s.milestoneRemaining = MILESTONE_DURATION;
  }
}
function stepRail(s: RunState, dt: number) {
  const ride = s.rail!;
  // Existing hot-reloaded rides acquire the same stable pace on their next tick.
  ride.entryNormalSpeed ??= normalSpeedAt(s.distance);
  ride.speed ??= railSpeed(s);
  // Keep track scrolling continuous across question/feedback phases. Older
  // hot-reloaded rides may not yet have this visual-only clock.
  ride.elapsed = (ride.elapsed ?? 0) + dt;
  s.distance += railSpeed(s) * dt;
  s.score = Math.floor(s.distance * 10) + s.coins * 50;
  stepMilestone(s, dt);
  // Track sections do not offer optional road portals. Advance any passed
  // gate now so it cannot unexpectedly trigger when normal running resumes.
  while (s.distance >= s.nextPortalAt) {
    s.nextPortalAt += PORTAL_INTERVAL;
    s.portalLane = ((s.portalLane + 2 + Math.floor(random(s) * 2)) % 3) - 1;
  }
  s.x += (s.lane * LANE_WIDTH - s.x) * (1 - Math.exp(-22 * dt));
  ride.remaining = Math.max(0, ride.remaining - dt);
  if (ride.remaining > 1e-8) return;
  if (ride.phase === "boarding") {
    beginRailQuestion(ride, () => random(s));
  } else if (ride.phase === "question") {
    judgeRailAnswer(s);
  } else if (ride.phase === "feedback") {
    if (ride.index + 1 < ride.questions.length) {
      ride.index++;
      // Keep the cart on the chosen track. The next answers may change, but
      // only the player's next input should change its physical lane.
      beginRailQuestion(ride, () => random(s));
    } else {
      ride.phase = "complete";
      ride.duration = 2;
      ride.remaining = 2;
      const progression = Math.max(
        1,
        Math.min(MAX_SPEED / INITIAL_SPEED, ride.entryNormalSpeed / INITIAL_SPEED),
      );
      ride.reward = Math.ceil((30 + ride.questions.length * 5) * (1 + (progression - 1) * 0.3));
    }
  } else if (ride.phase === "falling") {
    const question = currentRailQuestion(s)!;
    s.mode = "over";
    s.reason = `The cart took the wrong track. ${question.options[ride.failure!.optionIndex].why.en} Better choice: ${question.options[question.correctIndex].label.en}`;
  } else {
    s.coins += ride.reward;
    s.score = Math.floor(s.distance * 10) + s.coins * 50;
    s.rail = null;
    s.railReturnRemaining = RAIL_RETURN_DURATION;
    s.railPreparedAt = null;
    s.railPreparedFrom = null;
    s.lane = 0;
    s.x = 0;
    s.nextRailAt = separateEvent(s.distance + 1500 + random(s) * 1000, s.nextForkAt, s);
    s.nextForkAt = separateEvent(Math.max(s.nextForkAt, s.distance + 420), s.nextRailAt, s);
    s.boosts.grace = Math.max(s.boosts.grace, 1.2);
    s.speed = approachSpeed(s, s.distance).actual;
    clearLanding(s, true);
  }
}
function nextRowInterval(s: RunState) {
  // The first few rows introduce the controls before irregular bursts begin.
  if (s.rows < 5 && s.time < FORCED_ACTION_UNLOCK_TIME) {
    s.rowBurstRemaining = 0;
    return 1.65 + random(s) * 0.55;
  }
  if ((s.rowBurstRemaining ?? 0) > 0) {
    s.rowBurstRemaining = (s.rowBurstRemaining ?? 0) - 1;
    return 1.2 + random(s) * 0.18;
  }
  const rhythm = random(s);
  if (rhythm < 0.38) {
    // Two to four compact intervals; independently selected runs can join,
    // so there is no repeating burst/break cycle for the player to memorize.
    s.rowBurstRemaining = 1 + Math.floor(random(s) * 3);
    return 1.2 + random(s) * 0.18;
  }
  if (rhythm < 0.87) return 1.3 + random(s) * 0.45;
  return 2.1 + random(s) * 0.7;
}
export function generateAhead(s: RunState) {
  if (s.rail) return;
  while (s.nextRow < s.distance + 135) {
    const ranges = specialRanges(s);
    const reserved = ranges.find(
      ({ rowStart, rowEnd }) => s.nextRow >= rowStart && s.nextRow <= rowEnd,
    );
    if (reserved) {
      // A long gap can be scheduled before the station unlocks, when its
      // reservation is still deliberately absent. Reconsider that pending row
      // now, so its breather does not stack onto the boarding runway. The same
      // envelope remains clear, and this never adds a last-second obstacle.
      if (reserved.kind === "rail") {
        const finalRow = reserved.rowStart - 0.1;
        const rowSpeed = normalSpeedAt(finalRow);
        let previousObstacle = -Infinity;
        for (const obstacle of s.obstacles)
          if (obstacle.at <= reserved.rowEnd) previousObstacle = Math.max(previousObstacle, obstacle.at);
        const safeGap = Number.isFinite(previousObstacle) &&
          finalRow - previousObstacle >= normalSpeedAt(previousObstacle) * 1.3 + 0.1;
        const trailStart = finalRow - rowSpeed * 0.56;
        const safeTrail = s.lastTrailEnd < trailStart &&
          !s.pickups.some(coin => coin.at >= trailStart && coin.at < reserved.clearEnd);
        const enoughWarning = finalRow - s.distance >= Math.max(s.speed, rowSpeed) * 1.3;
        const otherReservation = ranges.some(range => range !== reserved &&
          finalRow >= range.rowStart && finalRow <= range.rowEnd);
        if (safeGap && safeTrail && enoughWarning && !otherReservation) {
          s.nextRow = finalRow;
          continue;
        }
      }
      s.nextRow = reserved.resumeAt;
      s.rowBurstRemaining = 0;
      s.lastTrailEnd = -Infinity;
      continue;
    }
    const nearestPortal = Math.round(s.nextRow / PORTAL_INTERVAL) * PORTAL_INTERVAL;
    if (nearestPortal > 0 && Math.abs(s.nextRow - nearestPortal) < 24) {
      s.nextRow += 24;
      continue;
    }
    const rowAt = s.nextRow;
    const rowSpeed = Math.min(MAX_SPEED, INITIAL_SPEED + rowAt * 0.006);
    const safeLane = Math.floor(random(s) * 3) - 1;
    const blocked = [-1, 0, 1].filter((lane) => lane !== safeLane);
    if (random(s) > 0.5) blocked.reverse();
    // Active time protects boosted starts too. Full rows share one action.
    const challenge = s.time >= FORCED_ACTION_UNLOCK_TIME && s.rows >= 4 && s.rows % 3 === 1;
    const requiredKind: ObstacleKind = random(s) < 0.5 ? "block" : "arch";
    const laneClosure =
      !challenge &&
      s.rows >= 3 &&
      random(s) < 0.2 &&
      !(
        nearestPortal > 0 &&
        rowAt < nearestPortal + 24 &&
        rowAt + rowSpeed * 0.3 > nearestPortal - 24
      );
    const lanes = challenge ? [-1, 0, 1] : blocked;
    const count = challenge ? 3 : laneClosure ? 2 : s.rows < 3 ? 1 : random(s) > 0.48 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const roll = random(s);
      const kind: ObstacleKind = challenge
        ? requiredKind
        : laneClosure
          ? "pillar"
          : s.rows === 0
            ? "block"
            : s.rows === 1
              ? "arch"
              : s.rows === 2 || roll < 0.23
                ? "roots"
                : roll < 0.54
                  ? "block"
                  : roll < 0.78
                    ? "arch"
                    : "pillar";
      // A short, clearly closed pair of lanes leaves the gold route open.
      for (const offset of laneClosure ? [0, rowSpeed * 0.15, rowSpeed * 0.3] : [0]) {
        s.obstacles.push({
          id: s.nextId++,
          lane: lanes[i],
          at: rowAt + offset,
          kind,
          resolved: false,
        });
      }
    }
    const hasRelic = rowAt >= s.nextRelicAt && (!challenge || requiredKind === "block");
    if (hasRelic) {
      const kind = PICKUP_BOOSTERS[Math.floor(random(s) * PICKUP_BOOSTERS.length)].id;
      s.relics.push({
        id: s.nextId++,
        lane: safeLane,
        at: rowAt,
        height: RELIC_HEIGHT,
        kind,
        taken: false,
      });
      // Schedule from every opportunity, even when the player misses it.
      // At least 22 normal seconds also outlast a full 12-second Momentum
      // burst at 1.65x, so successive road pickups cannot sustain that boost.
      s.nextRelicAt = distanceAfterNormalSeconds(rowAt, 22 + random(s) * 16);
    }
    const showTrail = challenge || hasRelic || s.rows % 3 !== 2;
    if (showTrail) {
      const jumpTrail = (challenge && requiredKind === "block") || hasRelic;
      const slideTrail = challenge && requiredKind === "arch";
      const halfSpan = jumpTrail ? 0.46 : 0.3;
      const start = rowAt - rowSpeed * halfSpan;
      const end = rowAt + rowSpeed * (laneClosure ? 0.68 : halfSpan);
      // Diagonal coins signal lane changes only in the clear gap between rows.
      // Both ends sit beyond obstacle and jump/slide clearance envelopes.
      const bridgeStart = s.lastTrailEnd + rowSpeed * 0.1;
      const bridgeEnd = start - rowSpeed * 0.1;
      if (
        Number.isFinite(bridgeStart) &&
        bridgeEnd > bridgeStart &&
        s.lastTrailLane !== safeLane &&
        random(s) < 0.25
      ) {
        for (let j = 1; j <= 3; j++) {
          const u = j / 4;
          s.pickups.push({
            id: s.nextId++,
            route: "connector",
            lane: s.lastTrailLane + (safeLane - s.lastTrailLane) * u,
            at: bridgeStart + (bridgeEnd - bridgeStart) * u,
            height: 1,
            trailAt: rowAt,
            taken: false,
          });
        }
      }
      // Offer simultaneous choices only where a lane is clear, or where every
      // lane shares the same required motion. The main trail still leads to
      // the airborne booster and supplies the demo's steering target.
      const choices = [-1, 0, 1].filter(
        (lane) =>
          lane !== safeLane &&
          (challenge || !s.obstacles.some((o) => o.at === rowAt && o.lane === lane)),
      );
      const trailLanes = [safeLane, ...choices.filter(() => random(s) < (challenge ? 0.65 : 0.85))];
      for (const lane of trailLanes) {
        const isGuide = lane === safeLane;
        const isJump = challenge ? requiredKind === "block" : hasRelic && isGuide;
        const trailStart = rowAt - rowSpeed * (isJump ? 0.46 : 0.3);
        const trailEnd = rowAt + rowSpeed * (laneClosure ? 0.68 : isJump ? 0.46 : 0.3);
        const coinCount =
          isJump || hasRelic ? 5 + Math.floor(random(s) * 5) : 3 + Math.floor(random(s) * 7);
        for (let j = 0; j < coinCount; j++) {
          const u = j / (coinCount - 1);
          const at = trailStart + (trailEnd - trailStart) * u;
          if (hasRelic && Math.abs(at - rowAt) < 1.5) continue;
          const jumpPhase = Math.max(
            0,
            Math.min(1, (at - trailStart) / (rowSpeed * JUMP_DURATION)),
          );
          const height = isJump ? 1 + Math.sin(Math.PI * jumpPhase) * 2.15 : slideTrail ? 0.6 : 1;
          s.pickups.push({
            id: s.nextId++,
            route: isGuide ? "guide" : "option",
            lane,
            at,
            height,
            trailAt: rowAt,
            taken: false,
          });
        }
      }
      s.lastTrailLane = safeLane;
      s.lastTrailEnd = end;
    } else {
      // Leave a complete coin-free interval; never bridge across a break.
      s.lastTrailEnd = -Infinity;
    }
    // A 1.2-second floor leaves the .68-second closure tail and .46-second
    // next jump guide separate, even inside the quickest burst at 5.5x.
    s.nextRow += nextRowInterval(s) * rowSpeed;
    const approaching = specialRanges(s).find(
      ({ rowStart }) => rowStart > rowAt && rowStart < s.nextRow,
    );
    if (approaching && approaching.rowStart - rowAt >= rowSpeed * 1.3 + 0.1) {
      // A breather must not stack onto a fork/station's own clear approach.
      // Fit one final safe row before its reserved tail envelope when possible.
      s.nextRow = approaching.rowStart - 0.1;
    }
    s.rows++;
  }
}
// Travel is a short cinematic: gameplay and all effect timers wait until exit.
export function startSceneTravel(s: RunState, destination: SceneKind): boolean {
  if (
    s.mode !== "running" ||
    s.rail ||
    s.railReturnRemaining > 0 ||
    s.turnRemaining > 0 ||
    s.sceneTransition > 0 ||
    destination === s.scene
  )
    return false;
  s.sceneTransitionFrom = s.scene;
  s.pendingScene = destination;
  s.sceneTransition = SCENE_TRANSITION_DURATION;
  s.chase = 0;
  s.jump = 0;
  s.slide = 0;
  s.obstacles = s.obstacles.filter((o) => o.at > s.distance + 30 || o.at < s.distance - 1);
  return true;
}
function step(s: RunState, dt: number, levels: Record<BoostKind, BoostLevel>) {
  if (s.mode !== "running") return;
  if (s.rail) {
    stepRail(s, dt);
    return;
  }
  if (s.railReturnRemaining > 0) {
    s.railReturnRemaining = Math.max(0, s.railReturnRemaining - dt);
    if (s.railReturnRemaining < 1e-8) s.railReturnRemaining = 0;
    return;
  }
  if (s.sceneTransition > 0) {
    s.sceneTransition = Math.max(0, s.sceneTransition - dt);
    if (s.sceneTransition <= SCENE_TRANSITION_DURATION / 2 && s.pendingScene) {
      s.scene = s.pendingScene;
      s.pendingScene = null;
    }
    if (s.sceneTransition < 1e-8) {
      s.sceneTransition = 0;
      s.sceneTransitionFrom = null;
      s.boosts.grace = Math.max(s.boosts.grace, 1);
    }
    return;
  }
  prepareSpecialEvents(s);
  s.time += dt;
  s.turnRemaining = Math.max(0, s.turnRemaining - dt);
  s.edgeStumble = Math.max(0, s.edgeStumble - dt);
  s.speed =
    Math.min(MAX_SPEED, INITIAL_SPEED + s.distance * 0.006) *
    (s.boosts.headstart > 0 || s.boosts.portal > 0 ? 2 : s.boosts.rush > 0 ? 1.65 : 1);
  const speedBoosted = s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0;
  if (boostedForkApproach(s)) {
    // Choose a safe default before the sign, using the ordinary lane animation
    // and camera follow. A dead end overrides an unsafe earlier lane choice.
    if (s.fork!.blockedDirection) s.lane = -s.fork!.blockedDirection;
    else if (s.lane === 0) s.lane = -1;
  }
  const oldDistance = s.distance;
  s.distance += s.speed * dt;
  if (s.fork && s.distance >= s.fork.at) {
    const insideCenter = Math.abs(s.x) < LANE_WIDTH * 0.5;
    const physicalDirection = s.x < 0 ? -1 : 1;
    const blockedDirection = s.fork.blockedDirection;
    if (!speedBoosted && (insideCenter || physicalDirection === blockedDirection)) {
      s.mode = "over";
      s.reason = blockedDirection === -1
        ? "The left branch is a dead end. Take the right branch at this fork."
        : blockedDirection === 1
          ? "The right branch is a dead end. Take the left branch at this fork."
          : "The center route is closed. Choose the left or right branch at a fork.";
      s.score = Math.floor(s.distance * 10) + s.coins * 50;
      return;
    }
    s.lastForkAt = s.fork.at;
    s.lastForkBlockedDirection = blockedDirection ?? 0;
    // Normally commit the track the body reaches. A boost activated too late
    // to leave center or a dead end can still turn safely, retaining its entry pose
    // so the camera and runner ease onto the branch without a sideways snap.
    s.turnEntryX = s.x;
    s.turnDirection = speedBoosted && blockedDirection
      ? blockedDirection === -1 ? 1 : -1
      : insideCenter ? (s.lane > 0 ? 1 : -1) : physicalDirection;
    s.turnRemaining = TURN_DURATION;
    s.lane = 0;
    s.x = 0;
    s.jump = 0;
    s.slide = 0;
    s.fork = null;
    s.nextForkAt = separateEvent(s.distance + 800 + random(s) * 650, s.nextRailAt, s);
    clearLanding(s);
  }
  if (s.time >= RAIL_UNLOCK_TIME && s.distance >= s.nextRailAt) {
    startRail(s);
    return;
  }
  stepMilestone(s, dt);
  s.x += (s.lane * LANE_WIDTH - s.x) * (1 - Math.exp(-22 * dt));
  if (s.distance >= s.nextPortalAt) {
    const entersPortal =
      s.lane === s.portalLane && Math.abs(s.x - s.portalLane * LANE_WIDTH) < LANE_WIDTH / 2;
    s.nextPortalAt += PORTAL_INTERVAL;
    // Choose a different lane only after passing this gateway, keeping the
    // approaching portal and its sign stable while the player makes a choice.
    s.portalLane = ((s.portalLane + 2 + Math.floor(random(s) * 2)) % 3) - 1;
    if (entersPortal) {
      startSceneTravel(s, nextScene(s.scene));
      return;
    }
  }
  s.jump = Math.max(0, s.jump - dt);
  s.slide = Math.max(0, s.slide - dt);
  s.flash = Math.max(0, s.flash - dt);
  s.chase = Math.max(0, s.chase - dt);
  const wasRushing = s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0;
  s.boosts.portal = Math.max(0, s.boosts.portal - dt);
  s.boosts.headstart = Math.max(0, s.boosts.headstart - dt);
  s.boosts.doubleCoins = Math.max(0, s.boosts.doubleCoins - dt);
  s.boosts.magnet = Math.max(0, s.boosts.magnet - dt);
  s.boosts.rush = Math.max(0, s.boosts.rush - dt);
  s.boosts.grace = Math.max(0, s.boosts.grace - dt);
  s.boosts.shieldTime = Math.max(0, s.boosts.shieldTime - dt);
  if (s.boosts.shieldTime === 0) s.boosts.shield = 0;
  if (s.skillRechargeLocked && s.permanentSkill && s.boosts[s.permanentSkill] <= 0)
    s.skillRechargeLocked = false;
  if (wasRushing && s.boosts.rush === 0 && s.boosts.headstart === 0 && s.boosts.portal === 0)
    s.boosts.grace = Math.max(s.boosts.grace, 0.5);
  generateAhead(s);
  const magnetActive = s.boosts.magnet > 0;
  const coinReach = magnetActive
    ? boostDefinition("magnet", s.effectLevels.magnet).magnetRange
    : 1.15;
  for (const coin of s.pickups) {
    if (
      !coin.taken &&
      coin.at >= oldDistance - 1.15 &&
      coin.at <= s.distance + coinReach &&
      (magnetActive ||
        (Math.abs(s.x - coin.lane * LANE_WIDTH) < 0.9 &&
          Math.abs(1 + jumpHeight(s) - (coin.height ?? 1)) < 1.25))
    ) {
      coin.taken = true;
      const value = s.boosts.doubleCoins > 0 ? 2 : 1;
      s.coins += value;
      if (s.skillRechargeLocked) s.skillBlockedCoins += value;
      s.collectedAt = s.time;
    }
  }
  for (const relic of s.relics) {
    if (
      !relic.taken &&
      relic.at >= oldDistance - 0.9 &&
      relic.at <= s.distance + 0.9 &&
      Math.abs(s.x - relic.lane * LANE_WIDTH) < 0.78 &&
      jumpHeight(s) >= MIN_RELIC_JUMP_HEIGHT
    ) {
      relic.taken = true;
      s.collectedRelics[relic.kind]++;
      // Path pickups activate immediately, or refill an existing effect.
      // Only boosters bought in the store use the inventory.
      s.boosts[relic.kind] = Math.max(
        s.boosts[relic.kind],
        boostDefinition(relic.kind, levels[relic.kind]).duration,
      );
      s.effectLevels[relic.kind] = levels[relic.kind];
      // A matching road pickup also holds the equipped skill's charge until
      // its effect ends; collecting it does not spend or refill that charge.
      if (relic.kind === s.permanentSkill) s.skillRechargeLocked = true;
      if (relic.kind === "shield")
        s.boosts.shieldTime = boostDefinition("shield", levels.shield).shieldDuration;
    }
  }
  for (const obstacle of s.obstacles) {
    if (obstacle.resolved || obstacle.at > s.distance + 0.22) continue;
    obstacle.resolved = true;
    if (obstacle.at < oldDistance - 0.3 || Math.abs(s.x - obstacle.lane * LANE_WIDTH) > 0.94)
      continue;
    const clears =
      (obstacle.kind === "block" && jumpHeight(s) > 0.92) ||
      (obstacle.kind === "roots" && jumpHeight(s) > 0.45) ||
      (obstacle.kind === "arch" && s.slide > 0.04);
    if (!clears) {
      if (obstacle.kind === "roots") {
        const stumblesBefore = s.stumbles;
        const shieldBefore = s.shieldAbsorbed;
        stumble(s, "roots");
        if (s.stumbles > stumblesBefore || s.shieldAbsorbed > shieldBefore) {
          reviewPost(s, obstacle, s.shieldAbsorbed > shieldBefore);
          break;
        }
        continue;
      }
      const shieldBefore = s.shieldAbsorbed;
      if (protectedFromHit(s)) {
        if (s.shieldAbsorbed > shieldBefore) {
          reviewPost(s, obstacle, true);
          break;
        }
        continue;
      }
      s.mode = "over";
      s.flash = 0.6;
      s.reason =
        obstacle.kind === "block"
          ? "Jump over low comment cards."
          : obstacle.kind === "arch"
            ? "Slide under overhead post banners."
            : "Change lanes to avoid full-height post stacks.";
      reviewPost(s, obstacle, false);
      break;
    }
  }
  s.score = Math.floor(s.distance * 10) + s.coins * 50;
  s.obstacles = s.obstacles.filter((o) => o.at > s.distance - 12);
  s.pickups = s.pickups.filter((o) => o.at > s.distance - 12);
  s.relics = s.relics.filter((o) => o.at > s.distance - 12);
}
export function update(
  s: RunState,
  seconds: number,
  levels: Record<BoostKind, BoostLevel> = createBoostLevels(),
) {
  // Substeps keep actions and contact detection reliable after a slow frame.
  let remaining = Math.max(0, Math.min(seconds, 0.25));
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, 1 / 120);
    step(s, dt, levels);
    remaining -= dt;
  }
}

// A separate, deterministic attract-mode run. It uses normal physics and
// collisions, steering toward the clear coin trail before each simulation step.
export function advancePreview(s: RunState, seconds: number) {
  if (s.mode === "over") Object.assign(s, createRun(s.seed + 1, s.scene));
  // The home preview demonstrates the saved starting world without travelling.
  s.nextPortalAt = Infinity;
  s.nextForkAt = Infinity;
  s.nextRailAt = Infinity;
  s.fork = null;
  s.lastForkBlockedDirection = 0;
  s.rail = null;
  s.railReturnRemaining = 0;
  s.turnDirection = 0;
  s.turnEntryX = 0;
  s.turnRemaining = 0;
  s.sceneTransition = 0;
  s.sceneTransitionFrom = null;
  s.pendingScene = null;
  // Demonstration collisions must never open a player's learning dialog.
  if (s.review) finishReview(s);
  s.mode = "running";
  let remaining = Math.max(0, Math.min(seconds, 0.25));
  while (remaining > 1e-8) {
    generateAhead(s);
    const next = s.obstacles.find((o) => !o.resolved && o.at > s.distance - 0.3);
    if (next) {
      const row = s.obstacles.filter((o) => o.at === next.at);
      const safe = [-1, 0, 1].filter((lane) => row.every((o) => o.lane !== lane));
      const trail =
        s.pickups.find(
          (c) =>
            !c.taken &&
            c.trailAt === next.at &&
            (c.route === undefined || c.route === "guide") &&
            Number.isInteger(c.lane) &&
            (safe.length === 0 || safe.includes(c.lane)),
        ) ??
        s.pickups.find(
          (c) => !c.taken && c.at >= next.at - 9.1 && c.at <= next.at + 1 && safe.includes(c.lane),
        );
      if (safe.length) {
        s.lane = trail?.lane ?? (safe.includes(s.lane) ? s.lane : safe[0]);
      } else {
        if (trail) s.lane = trail.lane;
        const secondsToRow = (next.at - s.distance) / Math.max(INITIAL_SPEED, s.speed);
        if (secondsToRow < 0.36 && secondsToRow > 0) {
          const action = next.kind === "arch" ? "slide" : "jump";
          // Preview decisions run every substep. Let the chosen motion finish;
          // only a new player input should restart an active slide.
          if (s[action] <= 0) act(s, action);
        }
      }
    }
    const relic = s.relics.find((r) => !r.taken && r.at > s.distance && r.lane === s.lane);
    if (relic && (relic.at - s.distance) / Math.max(INITIAL_SPEED, s.speed) < 0.36) {
      const lowBeam = s.obstacles.some(
        (o) =>
          !o.resolved &&
          o.kind === "arch" &&
          o.lane === s.lane &&
          Math.abs(o.at - relic.at) < s.speed * JUMP_DURATION,
      );
      if (!lowBeam && s.jump <= 0) act(s, "jump");
    }
    const dt = Math.min(remaining, 1 / 120);
    update(s, dt);
    remaining -= dt;
  }
}
