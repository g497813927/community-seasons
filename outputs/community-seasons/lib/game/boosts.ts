export type SkillKind = "shield" | "magnet" | "rush";
export type ConsumableKind = "headstart" | "shield" | "doubleCoins" | "portal";
export type BoostKind = SkillKind | ConsumableKind;
export type BoostLevel = 1 | 2 | 3;
export const HEAD_START_WINDOW = 5;
export const PORTAL_PRICE = 1000;
export const BOOSTERS = [
  {
    id: "headstart",
    name: "Fresh Start",
    shortName: "Fresh Start",
    key: "1",
    price: 100,
    duration: 5,
    durationLabel: "5 seconds",
    description:
      "Boost in your current world during the first 5 seconds with a protected 2× speed burst.",
  },
  {
    id: "shield",
    name: "Boundary Shield",
    shortName: "Boundary Shield",
    key: "2",
    price: 75,
    duration: 1,
    durationLabel: "1 hit · 12s max",
    description: "Absorb one collision within 12 seconds.",
  },
  {
    id: "doubleCoins",
    name: "Shared Rewards",
    shortName: "Shared Rewards",
    key: "3",
    price: 100,
    duration: 12,
    durationLabel: "12 seconds",
    description: "Collected coins are worth twice as much, including skill charge.",
  },
  {
    id: "portal",
    name: "Season Pass",
    shortName: "Season Pass",
    key: "4",
    price: PORTAL_PRICE,
    duration: 5,
    durationLabel: "5 seconds",
    description:
      "Travel through a seasonal tunnel to another world, then enjoy a protected 2× burst. One fixed level; hold one at a time.",
  },
] as const;
// These effects are found on the path or unlocked as permanent skills.
// They never become one-use items in the shop inventory.
const SKILL_EFFECTS = [
  {
    id: "magnet",
    name: "Kindness Magnet",
    shortName: "Kindness Magnet",
    key: "E",
    price: 450,
    duration: 12,
    durationLabel: "12 seconds",
    description: "Pull nearby coins from every lane, even while jumping.",
  },
  {
    id: "rush",
    name: "Community Momentum",
    shortName: "Momentum",
    key: "E",
    price: 600,
    duration: 8,
    durationLabel: "8 seconds",
    description: "Run 65% faster and pass safely through every obstacle.",
  },
] as const;
export const UPGRADE_BOOSTERS = [...BOOSTERS.filter((b) => b.id !== "portal"), ...SKILL_EFFECTS];
export const PICKUP_BOOSTERS = [
  ...BOOSTERS.filter((b) => b.id !== "headstart" && b.id !== "portal"),
  ...SKILL_EFFECTS,
];
export function createBoostLevels(): Record<BoostKind, BoostLevel> {
  return {
    shield: 1,
    magnet: 1,
    rush: 1,
    headstart: 1,
    doubleCoins: 1,
    portal: 1,
  };
}
export function normalizeBoostLevel(level: unknown): BoostLevel {
  return level === 2 || level === 3 ? level : 1;
}
export function boostDefinition<K extends BoostKind>(kind: K, level: BoostLevel = 1) {
  level = kind === "portal" ? 1 : level;
  const base = [...BOOSTERS, ...SKILL_EFFECTS].find((boost) => boost.id === kind)!;
  const duration =
    kind === "shield"
      ? level
      : kind === "headstart" || kind === "portal"
        ? 5 + (level - 1) * 2
        : kind === "rush"
          ? 8 + (level - 1) * 2
          : 12 + (level - 1) * 4;
  return {
    ...base,
    id: kind,
    level,
    duration,
    shieldDuration: 12 + (level - 1) * 4,
    durationLabel:
      kind === "shield"
        ? `${duration} hit${duration > 1 ? "s" : ""} · ${12 + (level - 1) * 4}s max`
        : `${duration} seconds`,
    magnetRange: 8 + (level - 1) * 2,
    description:
      kind === "shield"
        ? `Absorb ${duration} collision${duration > 1 ? "s" : ""} within ${12 + (level - 1) * 4} seconds.`
        : base.description,
  };
}
export function upgradePrice(kind: BoostKind, level: BoostLevel): number | null {
  if (kind === "portal") return null;
  const prices = {
    shield: [200, 500],
    magnet: [300, 750],
    rush: [400, 900],
    headstart: [300, 750],
    doubleCoins: [300, 750],
  };
  return level === 3 ? null : prices[kind][level - 1];
}
export function createBoostCounts(): Record<BoostKind, number> {
  return {
    shield: 0,
    magnet: 0,
    rush: 0,
    headstart: 0,
    doubleCoins: 0,
    portal: 0,
  };
}
export function createInventory(): Record<ConsumableKind, number> {
  return { headstart: 0, shield: 0, doubleCoins: 0, portal: 0 };
}
export function isBoostKind(value: unknown): value is BoostKind {
  return typeof value === "string" && [...BOOSTERS, ...SKILL_EFFECTS].some((b) => b.id === value);
}
export function isConsumableKind(value: unknown): value is ConsumableKind {
  return typeof value === "string" && BOOSTERS.some((b) => b.id === value);
}
export function isSkillKind(value: unknown): value is SkillKind {
  return value === "shield" || value === "magnet" || value === "rush";
}
export interface BoostState extends Record<BoostKind, number> {
  grace: number;
  shieldTime: number;
}
export function createBoostState(): BoostState {
  return { ...createBoostCounts(), grace: 0, shieldTime: 0 };
}
export const PERMANENT_SKILLS = [
  {
    id: "shield",
    name: "Personal Boundaries",
    shortName: "Shield skill",
    key: "E",
    price: 300,
    chargeCoins: 100,
  },
  {
    id: "magnet",
    name: "Active Listening",
    shortName: "Magnet skill",
    key: "E",
    price: 450,
    chargeCoins: 100,
  },
  {
    id: "rush",
    name: "Community Momentum",
    shortName: "Rush skill",
    key: "E",
    price: 600,
    chargeCoins: 100,
  },
] as const;
export interface SkillProgress {
  unlocked: boolean;
}
export function createSkillProgress(): Record<SkillKind, SkillProgress> {
  return {
    shield: { unlocked: false },
    magnet: { unlocked: false },
    rush: { unlocked: false },
  };
}
export function skillDefinition(kind: SkillKind) {
  return PERMANENT_SKILLS.find((skill) => skill.id === kind)!;
}
