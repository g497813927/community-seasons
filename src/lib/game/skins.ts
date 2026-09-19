export type SkinId = "classic" | "blossom" | "ocean" | "amber" | "frost";
export const DEFAULT_SKIN: SkinId = "classic";

export interface SkinDefinition {
  id: SkinId;
  name: string;
  description: string;
  price: number;
  palette: {
    /** Base, shadow and highlight colors for the three-dimensional casing. */
    shell: string[];
    trim: string[];
    panel: string;
    indicator: string;
  };
}

/** Cosmetic only: skins never change movement, collision or rewards. */
export const SKINS: readonly SkinDefinition[] = [
  {
    id: "classic",
    name: "Classic TV",
    description: "The original sky-blue TV, ready for every season.",
    price: 0,
    palette: {
      shell: ["#72d0e7", "#3295b3", "#b5eff9"],
      trim: ["#284c60", "#183444", "#4c7285"],
      panel: "#60bfd8",
      indicator: "#f4a4bc",
    },
  },
  {
    id: "blossom",
    name: "Blossom TV",
    description: "Soft pink petals bring spring to every run.",
    price: 1000,
    palette: {
      shell: ["#ef9fba", "#b85980", "#ffd8e7"],
      trim: ["#6a3e5c", "#3d2038", "#97627f"],
      panel: "#e98aad",
      indicator: "#b7eedb",
    },
  },
  {
    id: "ocean",
    name: "Ocean TV",
    description: "Deep blue and seafoam colors for a summer escape.",
    price: 1000,
    palette: {
      shell: ["#589de0", "#285d9e", "#a8d9ff"],
      trim: ["#23475d", "#112c40", "#48768a"],
      panel: "#448bce",
      indicator: "#9cf0d5",
    },
  },
  {
    id: "amber",
    name: "Amber TV",
    description: "Warm amber and copper colors inspired by autumn.",
    price: 1000,
    palette: {
      shell: ["#e9ad57", "#ad6b2f", "#ffdfa0"],
      trim: ["#65442e", "#39291f", "#97724a"],
      panel: "#dd9744",
      indicator: "#c3e4a4",
    },
  },
  {
    id: "frost",
    name: "Frost TV",
    description: "Icy lavender and silver colors for winter adventures.",
    price: 1000,
    palette: {
      shell: ["#bbbde9", "#797cb0", "#e7eaff"],
      trim: ["#4b526f", "#2c314b", "#7782a4"],
      panel: "#a8addf",
      indicator: "#f8bdd8",
    },
  },
];

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === "string" && SKINS.some((skin) => skin.id === value);
}

export function skinDefinition(value: unknown): SkinDefinition {
  return SKINS.find((skin) => skin.id === value) ?? SKINS[0];
}
