export type CosmeticSlot = "hat" | "shoes" | "effect";
export type HatId = "cap" | "crown" | "sprout";
export type ShoesId = "sneakers" | "boots" | "skates";
export type EffectId = "sparkles" | "petals" | "orbit";
export type AccessoryId = HatId | ShoesId | EffectId;
export interface Outfit {
  hat: HatId | null;
  shoes: ShoesId | null;
  effect: EffectId | null;
}
export interface AccessoryDefinition {
  id: AccessoryId;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number;
  accent: string;
}
export const COSMETIC_SLOTS: readonly CosmeticSlot[] = ["hat", "shoes", "effect"];

/** Accessories are visual only and can be combined independently with any skin. */
export const ACCESSORIES: readonly AccessoryDefinition[] = [
  { id: "cap", slot: "hat", name: "Trail Cap", description: "A sporty cap for every path.", price: 500, accent: "#f37788" },
  { id: "crown", slot: "hat", name: "Golden Crown", description: "A little royal shine above your screen.", price: 2000, accent: "#f6c65a" },
  { id: "sprout", slot: "hat", name: "Little Sprout", description: "Fresh green leaves for a growing community.", price: 750, accent: "#79cf80" },
  { id: "sneakers", slot: "shoes", name: "Canvas Sneakers", description: "Comfy canvas kicks for colorful adventures.", price: 600, accent: "#ec7c96" },
  { id: "boots", slot: "shoes", name: "Explorer Boots", description: "Sturdy boots for all four seasons.", price: 1000, accent: "#bd8657" },
  { id: "skates", slot: "shoes", name: "Roller Skates", description: "Retro wheels with purely cosmetic flair.", price: 1500, accent: "#b098e8" },
  { id: "sparkles", slot: "effect", name: "Sparkle Trail", description: "A twinkling trail that follows your TV.", price: 900, accent: "#f7d56a" },
  { id: "petals", slot: "effect", name: "Petal Drift", description: "Soft petals float around your TV.", price: 1200, accent: "#f1a5c9" },
  { id: "orbit", slot: "effect", name: "Star Orbit", description: "Little stars circle your TV.", price: 2500, accent: "#94c9f2" },
];

export function createOutfit(): Outfit {
  return { hat: null, shoes: null, effect: null };
}
export function accessoryDefinition(value: unknown): AccessoryDefinition | undefined {
  return ACCESSORIES.find(({ id }) => id === value);
}
export function isAccessoryId(value: unknown): value is AccessoryId {
  return accessoryDefinition(value) !== undefined;
}
export function isAccessoryForSlot<S extends CosmeticSlot>(slot: S, value: unknown): value is NonNullable<Outfit[S]> {
  const definition = accessoryDefinition(value);
  return definition !== undefined && definition.slot === slot;
}
/** Local saves repair only damaged selections; ownership and coins remain separate. */
export function normalizeOutfit(value: unknown, owned: readonly AccessoryId[]): Outfit {
  const outfit = createOutfit();
  if (!value || typeof value !== "object" || Array.isArray(value)) return outfit;
  const record = value as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = record[slot];
    if (isAccessoryForSlot(slot, id) && owned.includes(id)) Object.assign(outfit, { [slot]: id });
  }
  return outfit;
}
