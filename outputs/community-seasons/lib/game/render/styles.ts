import type { SceneKind } from "../scenes";

export const PALETTES = {
  stone: ["#80785a", "#5c624a", "#a49a72"],
  dark: ["#394e40", "#273c32", "#657052"],
  bark: ["#4a4230", "#313a2b", "#64553c"],
  leaf: ["#24533d", "#123e32", "#40704a"],
  gold: ["#e8ad41", "#986329", "#ffe19a"],
};
export const WORLD_STYLES = {
  spring: {
    sky: ["#6799a4", "#c8e3d1", "#acd1ae", "#6c9b85"],
    glow: "#fff1d8aa",
    ground: "#78a582",
    road: ["#d8cdb1", "#cfc2a5", "#c4b99f"],
    fog: "196,222,205",
    palette: {
      ...PALETTES,
      stone: ["#d9d9c5", "#a6b3a2", "#eff0dd"],
      dark: ["#50786c", "#365d58", "#8ca590"],
      bark: ["#927868", "#675747", "#b09c7c"],
      leaf: ["#ebafbe", "#d98fa5", "#ffe0df", "#f2c9d0"],
    },
  },
  summer: {
    sky: ["#4f9aaf", "#b9e4df", "#87c9ae", "#4d997f"],
    glow: "#fff2b5bb",
    ground: "#579a71",
    road: ["#dbcda4", "#cebf96", "#c5b48b"],
    fog: "163,211,198",
    palette: {
      ...PALETTES,
      stone: ["#d0d9c7", "#9cbaaa", "#edf1d3"],
      dark: ["#376f6a", "#24534f", "#81ad96"],
      bark: ["#997a57", "#735e43", "#b69b71"],
      leaf: ["#398759", "#256849", "#65a86b", "#7ab76e"],
    },
  },
  autumn: {
    sky: ["#99859d", "#ead1aa", "#d3b48a", "#998777"],
    glow: "#fff0c0aa",
    ground: "#ae9c70",
    road: ["#cba389", "#be947d", "#b68d77"],
    fog: "217,189,156",
    palette: {
      ...PALETTES,
      stone: ["#d9c6ad", "#ab9785", "#eedbc0"],
      dark: ["#7a6c65", "#574e4d", "#b09a7a"],
      bark: ["#8f7258", "#6b5344", "#b1956f"],
      leaf: ["#d19048", "#bb6647", "#e6b252", "#e8c074"],
    },
  },
  winter: {
    sky: ["#667da4", "#c6d8e4", "#aabed0", "#819ab2"],
    glow: "#fff0d0aa",
    ground: "#d8e4e6",
    road: ["#b4c4cd", "#a8bac5", "#9daeba"],
    fog: "195,213,226",
    palette: {
      ...PALETTES,
      stone: ["#dae5e7", "#a6bac9", "#f5f5ec"],
      dark: ["#657e8e", "#405d70", "#a6b9c2"],
      bark: ["#887e7e", "#656071", "#b4a8a0"],
      leaf: ["#dfe9e8", "#abc4c7", "#f3f5ee", "#c9dcdb"],
    },
  },
} satisfies Record<SceneKind, object>;
export const PORTAL_NAMES: Record<SceneKind, string> = {
  spring: "春日广场",
  summer: "夏日河畔",
  autumn: "秋日长街",
  winter: "冬日街区",
};
