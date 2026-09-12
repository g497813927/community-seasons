import {
  type RunState,
  LANE_WIDTH,
  RELIC_HEIGHT,
  SCENE_TRANSITION_DURATION,
  SLIDE_DURATION,
  TURN_DURATION,
  EDGE_STUMBLE_DURATION,
  jumpHeight,
  monsterPresence,
  createRun,
  advancePreview,
  currentRailQuestion,
  RAIL_RETURN_DURATION,
  railSpeed,
} from "./engine";
import type { BoostKind } from "./boosts";
import { nextScene, sceneDefinition, type SceneKind } from "./scenes";
import { getLesson } from "./community";
import { createRailRide } from "./railway";
import { railTravelFrame } from "./rail-transition";
import { travelPalette } from "./travel-colors";
type V = [number, number, number];
type Face = {
  points: V[];
  color: string;
  z: number;
  layer: number;
  text?: { value: string; color: string; emphasis?: boolean };
  portal?: SceneKind;
  journey?: { scene: SceneKind; mode: "rail" | "run" };
  cameraSpace?: boolean;
  cull?: boolean;
  boardwalk?: boolean;
  opacity?: number;
};
const PALETTES = {
  stone: ["#80785a", "#5c624a", "#a49a72"],
  dark: ["#394e40", "#273c32", "#657052"],
  bark: ["#4a4230", "#313a2b", "#64553c"],
  leaf: ["#24533d", "#123e32", "#40704a"],
  gold: ["#e8ad41", "#986329", "#ffe19a"],
};
const WORLD_STYLES = {
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
// Shared outline: coins keep their trail height without per-frame spin/bobbing.
const COIN_OUTLINE = Array.from({ length: 10 }, (_, i) => [
  Math.cos((i * Math.PI) / 5),
  Math.sin((i * Math.PI) / 5),
]);
const PORTAL_NAMES: Record<SceneKind, string> = {
  spring: "春日广场",
  summer: "夏日河畔",
  autumn: "秋日长街",
  winter: "冬日街区",
};
export class Renderer {
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  focal = 0;
  center = 0;
  horizon = 0;
  faces: Face[] = [];
  layer = 1;
  portalPreviews = new Map<SceneKind, HTMLCanvasElement>();
  railPreviews = new Map<SceneKind, HTMLCanvasElement>();
  landscapeOnly = false;
  sceneryTemplates = new Map<string, Face[]>();
  curveDirection = 0;
  curveStrength = 0;
  turnArcLength = 60;
  turnProgress = 0;
  cameraYaw = 0;
  cameraShift = 0;
  cameraDepthOffset = 0;
  cameraRoll = 0;
  turnEntryOffset = 0;
  cameraTurnKey: number | null = null;
  cameraRun: RunState | null = null;
  captureScenery = false;
  captureBackdrop = false;
  curveAlong = 0;
  curveTail = false;
  turnEndDistance: number | null = null;
  sceneryForkAt: number | null = null;
  previousTurnRemaining = 0;
  previousTurnTime = 0;
  previousTurnDistance = 0;
  laneLean = 0;
  forkDepth: number | null = null;
  renderLocale: "en" | "zh-CN" = "en";
  previewRun = createRun(4182);
  previewAt: number | null = null;
  previewScene: SceneKind | null = null;
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * ratio);
    this.canvas.height = Math.round(this.h * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  turnPoint(along: number, direction = this.curveDirection): [number, number, number] {
    const radius = this.turnArcLength / (Math.PI / 2);
    if (along < 0) return [-direction * LANE_WIDTH, along, 0];
    if (along >= this.turnArcLength)
      return [direction * (radius + along - this.turnArcLength), radius, (direction * Math.PI) / 2];
    const angle = along / radius;
    return [
      direction * radius * (1 - Math.cos(angle)),
      radius * Math.sin(angle),
      direction * angle,
    ];
  }
  configureCamera(s: RunState) {
    if (this.cameraRun !== s) {
      this.cameraRun = s;
      this.cameraTurnKey = null;
      this.turnEndDistance = null;
      this.previousTurnRemaining = 0;
    }
    this.curveDirection = s.turnDirection ?? 0;
    this.curveStrength = Math.max(0, Math.min(1, (s.turnRemaining ?? 0) / TURN_DURATION));
    const turnKey = s.fork?.at ?? (this.curveStrength > 0 ? s.lastForkAt : null);
    if (turnKey !== null && this.cameraTurnKey !== turnKey) {
      this.cameraTurnKey = turnKey;
      this.turnArcLength = Math.max(24, s.speed * TURN_DURATION);
      this.turnEndDistance = null;
    }
    this.turnProgress = 1 - this.curveStrength;
    if (this.curveStrength === 0 && this.previousTurnRemaining > 0) {
      const elapsed = s.time - this.previousTurnTime;
      const fraction = elapsed > 0 ? Math.min(1, this.previousTurnRemaining / elapsed) : 1;
      this.turnEndDistance =
        this.previousTurnDistance + (s.distance - this.previousTurnDistance) * fraction;
    }
    this.previousTurnRemaining = s.turnRemaining ?? 0;
    this.previousTurnTime = s.time;
    this.previousTurnDistance = s.distance;
    // Keep the final bend behind the camera until its last roadside objects
    // have passed. Completion can occur inside a frame or before 24m of travel.
    this.curveTail =
      this.curveStrength === 0 &&
      s.lastForkAt !== null &&
      this.curveDirection !== 0 &&
      s.distance - (this.turnEndDistance ?? s.lastForkAt + this.turnArcLength) < 42;
    this.curveAlong =
      this.curveStrength > 0
        ? this.turnProgress * this.turnArcLength
        : this.turnArcLength +
          Math.max(0, s.distance - (this.turnEndDistance ?? s.lastForkAt! + this.turnArcLength));
    this.sceneryForkAt =
      s.fork?.at ?? (this.curveStrength > 0 || this.curveTail ? s.lastForkAt : null);
    this.laneLean = Math.max(-1, Math.min(1, (s.lane * LANE_WIDTH - s.x) / LANE_WIDTH));
    const approaching = s.fork
      ? Math.max(0, Math.min(1, 1 - (s.fork.at - s.distance) / (s.speed * 2.2)))
      : 0;
    const anticipation = approaching * approaching * (3 - 2 * approaching);
    const entryX = s.turnEntryX ?? this.curveDirection * LANE_WIDTH;
    // Follow the occupied outer lane before reaching the junction. Using x,
    // rather than the requested lane, also follows late changes continuously.
    this.cameraYaw =
      this.curveStrength > 0
        ? (this.curveDirection * this.turnProgress * Math.PI) / 2 +
          (entryX / LANE_WIDTH) * 0.18 * this.curveStrength +
          this.curveDirection * Math.sin(this.turnProgress * Math.PI) * 0.03
        : (s.x / LANE_WIDTH) * 0.18 * anticipation;
    // The route's coordinate origin moves to the chosen branch at crossing.
    // Offset the camera by exactly the same amount so neither road nor TV
    // jumps when the engine starts using the new center lane.
    this.cameraShift =
      this.curveStrength > 0
        ? s.x * 0.14 +
          (entryX * 0.7 - this.curveDirection * LANE_WIDTH * Math.cos(this.cameraYaw)) *
            this.curveStrength
        : s.x * (0.14 + 0.56 * anticipation);
    this.cameraDepthOffset =
      this.curveDirection * LANE_WIDTH * Math.sin(this.cameraYaw) * this.curveStrength;
    this.turnEntryOffset = (entryX - this.curveDirection * LANE_WIDTH) * this.curveStrength;
    this.cameraRoll =
      -0.009 *
      (this.curveStrength > 0
        ? Math.max(-1, Math.min(1, (this.curveDirection * LANE_WIDTH - entryX) / LANE_WIDTH)) *
          this.curveStrength
        : this.laneLean);
  }
  cameraPoint([x, y, z]: V): V {
    if (this.captureBackdrop) return [x, y, z];
    let viewX = x,
      viewZ = z;
    if (this.curveStrength > 0 || this.curveTail) {
      const along = this.curveAlong;
      const origin = this.turnPoint(along);
      const point = this.turnPoint(along + z);
      const wx = point[0] - origin[0] + x * Math.cos(point[2]);
      const wz = point[1] - origin[1] - x * Math.sin(point[2]);
      const yaw = this.curveTail ? (this.curveDirection * Math.PI) / 2 : this.cameraYaw;
      viewX = wx * Math.cos(yaw) - wz * Math.sin(yaw);
      viewZ = wx * Math.sin(yaw) + wz * Math.cos(yaw);
    } else if (this.cameraYaw !== 0) {
      viewX = x * Math.cos(this.cameraYaw) - z * Math.sin(this.cameraYaw);
      viewZ = x * Math.sin(this.cameraYaw) + z * Math.cos(this.cameraYaw);
    }
    return [viewX - this.cameraShift, y, viewZ + this.cameraDepthOffset];
  }
  project(point: V): [number, number] {
    return this.projectView(this.cameraPoint(point));
  }
  projectView([viewX, y, viewZ]: V): [number, number] {
    const scale = this.focal / Math.max(0.3, viewZ + 10);
    const px = viewX * scale,
      py = (5.4 - y) * scale;
    const cos = Math.cos(this.cameraRoll),
      sin = Math.sin(this.cameraRoll);
    return [this.center + px * cos - py * sin, this.horizon + px * sin + py * cos];
  }
  face(points: V[], color: string, text?: Face["text"]) {
    if (!this.captureScenery && points.every((point) => this.cameraPoint(point)[2] < -9)) return;
    this.faces.push({
      points,
      color,
      text,
      layer: this.layer,
      z: points.reduce((n, p) => n + p[2], 0) / points.length,
    });
  }
  label(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    value: string,
    color = "#26474b",
    background = "#f7f2de",
    emphasis = false,
  ) {
    this.face(
      [
        [x - width / 2, y - height / 2, z],
        [x + width / 2, y - height / 2, z],
        [x + width / 2, y + height / 2, z],
        [x - width / 2, y + height / 2, z],
      ],
      background,
      value ? { value, color, emphasis } : undefined,
    );
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    colors = PALETTES.stone,
    rx = 0,
    rz = 0,
    drawTop = true,
  ) {
    const cosX = Math.cos(rx),
      sinX = Math.sin(rx),
      cosZ = Math.cos(rz),
      sinZ = Math.sin(rz);
    const verts: V[] = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map((v) => {
      let a = (v[0] * w) / 2,
        b = (v[1] * h) / 2,
        c = (v[2] * d) / 2;
      const by = b * cosX - c * sinX;
      c = b * sinX + c * cosX;
      b = by;
      const ax = a * cosZ - b * sinZ;
      b = a * sinZ + b * cosZ;
      a = ax;
      return [a + x, b + y, c + z] as V;
    });
    const sides = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ];
    sides.forEach((ids, i) => {
      if (i === 4 && !drawTop) return;
      const p = ids.map((id) => verts[id]);
      if (this.captureScenery || this.frontFacing(p.map((point) => this.cameraPoint(point)))) {
        this.face(p, colors[i === 4 ? 2 : i === 0 ? 0 : 1]);
        if (this.captureScenery) this.faces[this.faces.length - 1].cull = true;
      }
    });
  }
  frontFacing(points: V[]) {
    const [a, b, c] = points;
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    return (
      (uy * vz - uz * vy) * -a[0] +
        (uz * vx - ux * vz) * (5.4 - a[1]) +
        (ux * vy - uy * vx) * (-10 - a[2]) >
      0
    );
  }
  faceView(face: Face): V[] {
    return face.cameraSpace ? face.points : face.points.map((p) => this.cameraPoint(p));
  }
  clipNear(points: V[]): V[] {
    const near = -9;
    if (points.every((p) => p[2] >= near)) return points;
    const clipped: V[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if (a[2] >= near) clipped.push(a);
      if (a[2] >= near !== b[2] >= near) {
        const t = (near - a[2]) / (b[2] - a[2]);
        clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
      }
    }
    return clipped;
  }
  foliage(
    x: number,
    y: number,
    z: number,
    size: number,
    seed: number,
    colors = ["#28543b", "#356544", "#1e4935", "#42704a"],
  ) {
    const top: V = [x, y + size * 0.68, z];
    const ring: V[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ring.push([
        x + Math.cos(a) * size,
        y + Math.sin(i * 3 + seed) * size * 0.13,
        z + Math.sin(a) * size,
      ]);
    }
    for (let i = 0; i < 7; i++) {
      this.face([top, ring[i], ring[(i + 1) % 7]], colors[i % colors.length]);
      this.face([[x, y - size * 0.5, z], ring[(i + 1) % 7], ring[i]], colors[1]);
    }
  }
  coin(x: number, z: number, _t: number, height = 1) {
    // Three flat shapes replace the spinning mesh. Perspective still carries
    // coins toward the player, and authored jump/slide trail heights stay intact.
    this.face(
      COIN_OUTLINE.map(([a, b]) => [x + a * 0.35, height + b * 0.36, z]),
      "#b97928",
    );
    this.face(
      COIN_OUTLINE.map(([a, b]) => [x + a * 0.31, height + b * 0.32 + 0.02, z - 0.01]),
      "#ffca63",
    );
    this.face(
      [
        [x - 0.035, height - 0.18, z - 0.02],
        [x + 0.035, height - 0.18, z - 0.02],
        [x + 0.035, height + 0.2, z - 0.02],
        [x - 0.035, height + 0.2, z - 0.02],
      ],
      "#fff0ab",
    );
  }
  forkSpread(z: number) {
    if (this.forkDepth === null) return 0;
    return z >= this.forkDepth ? LANE_WIDTH : 0;
  }
  turnRoadWidth(along: number) {
    if (along < 0) return 1;
    const amount = Math.max(0, Math.min(1, (along - 4) / 18));
    const width = 1 / 3 + (2 / 3) * amount * amount * (3 - 2 * amount);
    const radius = this.turnArcLength / (Math.PI / 2);
    const angle = Math.min(Math.PI / 2, along / radius);
    const center =
      LANE_WIDTH + radius * (1 - Math.cos(angle)) + Math.max(0, along - this.turnArcLength);
    // Keep both inner curbs outside the center divider, including long,
    // high-speed arcs whose streets take more distance to separate.
    const separated = (center - 0.55) / (2.69 * Math.max(0.001, Math.cos(angle)));
    return Math.min(width, separated);
  }
  // Road vertices are already in camera coordinates. This lets the shared
  // trunk end exactly at the junction while each exit starts at an outer lane.
  roadPoint(branch: number, x: number, y: number, z: number): V {
    const turning = this.curveStrength > 0 || this.curveTail;
    if (this.forkDepth === null && !turning) return this.cameraPoint([x, y, z]);
    if (branch === 0) {
      if (this.forkDepth !== null) return this.cameraPoint([x, y, z]);
      const origin = this.turnPoint(this.curveAlong);
      const wx = x - origin[0] - this.curveDirection * LANE_WIDTH;
      const wz = this.curveAlong + z - origin[1];
      const yaw = this.curveTail ? (this.curveDirection * Math.PI) / 2 : this.cameraYaw;
      return [
        wx * Math.cos(yaw) - wz * Math.sin(yaw) - this.cameraShift,
        y,
        wx * Math.sin(yaw) + wz * Math.cos(yaw) + this.cameraDepthOffset,
      ];
    }
    const along = this.forkDepth !== null ? z - this.forkDepth : this.curveAlong + z;
    return this.sceneryViewPoint(branch, x * this.turnRoadWidth(along), y, z);
  }
  forkWorldPoint(branch: number, x: number, y: number, z: number): V {
    if (this.forkDepth === null) return [x, y, z];
    const along = z - this.forkDepth;
    if (along < 0 || branch === 0) return [x, y, z];
    const radius = this.turnArcLength / (Math.PI / 2);
    const angle = Math.min(Math.PI / 2, along / radius);
    return [
      branch *
        (LANE_WIDTH + radius * (1 - Math.cos(angle)) + Math.max(0, along - this.turnArcLength)) +
        x * Math.cos(angle),
      y,
      this.forkDepth + radius * Math.sin(angle) - branch * x * Math.sin(angle),
    ];
  }
  water(x: number, z: number, width: number, length: number, frozen = false) {
    this.layer = -1;
    this.face(
      [
        [x - width / 2, -0.08, z - length / 2],
        [x + width / 2, -0.08, z - length / 2],
        [x + width / 2, -0.08, z + length / 2],
        [x - width / 2, -0.08, z + length / 2],
      ],
      frozen ? "#9cc9d9" : "#65b5bd",
    );
    for (let i = 0; i < 3; i++) {
      const pz = z - length / 3 + (i * length) / 3;
      this.face(
        [
          [x - width * 0.32, -0.065, pz],
          [x + width * 0.25, -0.065, pz + 0.35],
          [x + width * 0.32, -0.065, pz + 0.48],
          [x - width * 0.25, -0.065, pz + 0.14],
        ],
        frozen ? "#d7eff0" : "#b3ddd1",
      );
    }
    this.layer = 1;
  }
  lamp(x: number, z: number, winter = false) {
    const metal = ["#4b6268", "#32464f", "#849292"];
    this.box(x, 1.55, z, 0.12, 3.1, 0.12, metal);
    this.box(x, 3.12, z, 0.48, 0.45, 0.48, ["#f6d391", "#b89e62", "#fff1c4"]);
    this.box(x, 3.4, z, 0.65, 0.12, 0.65, winter ? WORLD_STYLES.winter.palette.stone : metal);
  }
  bench(x: number, z: number, scene: SceneKind) {
    const p = WORLD_STYLES[scene].palette;
    this.box(x, 0.58, z, 1.65, 0.17, 0.66, p.bark);
    this.box(x, 0.97, z + 0.29, 1.65, 0.63, 0.12, p.bark);
    for (const dx of [-0.62, 0.62]) this.box(x + dx, 0.25, z, 0.14, 0.5, 0.52, p.dark);
  }
  cottage(x: number, z: number, winter = false, variant = 0) {
    const wall = winter ? ["#a47d6e", "#6f6365", "#caa391"] : ["#c58e73", "#955f58", "#e5b297"];
    const roof = winter ? ["#f0f5ed", "#b6cdd6", "#ffffff"] : ["#78596a", "#534754", "#ac7880"];
    const width = 3.4,
      height = 2.6 + (variant % 2) * 0.6;
    // The pitched roof encloses the wall cap. Drawing that internal surface
    // creates light wedges when its depth ties with a roof slope.
    this.box(x, height / 2, z, width, height, 3, wall, 0, 0, false);
    const roofVertices: V[] = [
      [x - width * 0.57, height, z - 1.8],
      [x + width * 0.57, height, z - 1.8],
      [x, height + 1.4, z - 1.8],
      [x - width * 0.57, height, z + 1.8],
      [x + width * 0.57, height, z + 1.8],
      [x, height + 1.4, z + 1.8],
    ];
    // A closed, outward-facing roof keeps its hidden slope from painting over
    // the visible one when their average depths tie. Cache every side, then
    // select visible surfaces using the current camera, just as for the walls.
    const roofSides = [[0, 2, 1], [3, 4, 5], [0, 3, 5, 2], [2, 5, 4, 1], [0, 1, 4, 3]];
    const roofColors = [roof[0], roof[0], roof[1], roof[2], roof[1]];
    roofSides.forEach((ids, i) => {
      const points = ids.map((id) => roofVertices[id]);
      if (this.captureScenery || this.frontFacing(points.map((point) => this.cameraPoint(point)))) {
        this.face(points, roofColors[i]);
        if (this.captureScenery) this.faces[this.faces.length - 1].cull = true;
      }
    });
    this.label(x, 0.86, z - 1.515, 0.68, 1.72, "", "#314c59", "#43545e");
    for (const dx of [-1.08, 1.08])
      this.label(x + dx, 1.6, z - 1.52, 0.64, 0.85, "", "#fff0b3", winter ? "#f6d289" : "#a9d4d1");
    this.box(x + 1, height + 1.15, z + 0.45, 0.45, 1, 0.48, wall);
  }
  market(x: number, z: number, variant: number) {
    const timber = WORLD_STYLES.autumn.palette.bark;
    for (const dx of [-1.3, 1.3])
      for (const dz of [-0.75, 0.75]) this.box(x + dx, 1.05, z + dz, 0.1, 2.1, 0.1, timber);
    this.box(x, 0.7, z, 2.6, 0.75, 1.6, ["#a27254", "#74503c", "#c7a477"]);
    const colors = variant % 4 ? ["#cf8860", "#e9d3a2"] : ["#9da266", "#ede0b3"];
    for (let stripe = 0; stripe < 4; stripe++) {
      const left = x - 1.55 + stripe * 0.775;
      this.face(
        [
          [left, 2.15, z - 1.15],
          [left + 0.775, 2.15, z - 1.15],
          [left + 0.775, 2.6, z],
          [left, 2.6, z],
        ],
        colors[stripe % 2],
      );
      this.face(
        [
          [left, 2.6, z],
          [left + 0.775, 2.6, z],
          [left + 0.775, 2.15, z + 1.15],
          [left, 2.15, z + 1.15],
        ],
        colors[stripe % 2],
      );
    }
    for (const dx of [-0.8, 0, 0.8])
      this.box(x + dx, 1.18, z - 0.12, 0.58, 0.23, 0.6, ["#bd6c52", "#8d6241", "#e3b96c"]);
  }
  sailboat(x: number, z: number, side: number) {
    const hull = ["#b57c5b", "#6e5951", "#e1b58b"];
    this.box(x, 0.06, z, 1.5, 0.42, 3.7, hull);
    this.box(x, 1.55, z, 0.09, 3.2, 0.09, ["#c8b68d", "#918266", "#ecdfb4"]);
    this.face(
      [
        [x + 0.06, 0.65, z],
        [x + 0.06, 3.05, z],
        [x + side * 1.7, 0.7, z + 0.05],
      ],
      "#fff2d0",
    );
    this.face(
      [
        [x - 0.06, 0.65, z],
        [x - 0.06, 2.65, z],
        [x - side * 0.9, 0.7, z - 0.04],
      ],
      "#d5e7df",
    );
  }
  scenery(scene: SceneKind, row: number, z: number) {
    const variant = ((row % 6) + 6) % 6;
    for (const side of [-1, 1]) {
      const key = `${scene}:${variant}:${side}`;
      let template = this.sceneryTemplates.get(key);
      if (!template) {
        const saved = this.faces,
          layer = this.layer;
        this.faces = [];
        this.layer = 1;
        this.captureScenery = true;
        const p = WORLD_STYLES[scene].palette;
        const x = side * (5.1 + (variant % 3) * 0.8);
        if (scene === "spring") {
          this.box(x, 1.6, 0, 0.3, 3.2, 0.36, p.bark);
          this.foliage(x, 3.75, 0, 1.85 + (variant % 2) * 0.3, variant, p.leaf);
          if (variant === 0 || variant === 3) {
            const ax = side * 5.2;
            for (const dx of [-1, 1]) this.box(ax + dx, 1.4, 5, 0.18, 2.8, 0.28, p.dark);
            this.box(ax, 2.85, 5, 2.4, 0.2, 0.6, p.dark);
            for (const dx of [-0.8, 0, 0.8]) this.box(ax + dx, 2.96, 5, 0.12, 0.14, 1.1, p.bark);
            this.foliage(ax, 2.85, 5, 1.05, variant, p.leaf);
          } else if (variant === 1) this.water(side * 8.5, 5, 5.2, 9);
          else if (variant === 2) this.bench(side * 4, 4, scene);
          else if (variant === 4) this.lamp(side * 3.15, 5);
        } else if (scene === "summer") {
          // Timber pads connect every lamp to the boardwalk. Their inner edge
          // follows narrow fork connectors; road/rail slabs cover the overlap.
          const padStart = this.faces.length;
          this.layer = -0.3;
          for (const depth of [0.25, 1.75])
            this.box(side * 3.42, -0.55, depth, 0.16, 0.8, 0.16, p.bark);
          this.layer = -0.2;
          this.box(side * 3.01, -0.16, 1, 1.38, 0.28, 2.2, p.bark);
          this.layer = -0.1;
          for (const depth of [0.45, 1.05, 1.65])
            this.face(
              [
                [side * 2.32, -0.012, depth],
                [side * 3.7, -0.012, depth],
                [side * 3.7, -0.012, depth + 0.035],
                [side * 2.32, -0.012, depth + 0.035],
              ],
              p.bark[1],
            );
          for (let i = padStart; i < this.faces.length; i++) this.faces[i].boardwalk = true;
          this.layer = 1;
          this.lamp(side * 3.12, 1);
          if (variant % 2 === 0) this.sailboat(side * (7.8 + variant * 0.35), 5, side);
          if (variant === 1 || variant === 4) {
            this.layer = -0.2;
            const dockStart = this.faces.length;
            this.box(side * 5.16, -0.15, 4, 5.68, 0.28, 1.65, p.bark);
            for (let i = dockStart; i < this.faces.length; i++) this.faces[i].boardwalk = true;
            this.layer = 1;
            for (const step of [3.5, 5.3, 7.1])
              this.box(side * step, 0.6, 4.7, 0.12, 1.2, 0.12, p.dark);
            this.box(side * 5.3, 1.05, 4.7, 4, 0.1, 0.1, p.dark);
          }
          if (variant === 3) {
            this.box(side * 13, 1.7, 1, 0.5, 3.4, 0.5, p.bark);
            this.foliage(side * 13, 4.2, 1, 2.2, variant, p.leaf);
          }
        } else if (scene === "autumn") {
          if (variant % 2 === 0) this.market(side * 5.5, 2, variant);
          else {
            this.cottage(side * 7, 2, false, variant);
            this.lamp(side * 3.15, 5);
          }
          if (variant === 2 || variant === 5) {
            this.box(side * 10, 1.4, 6, 0.38, 2.8, 0.38, p.bark);
            this.foliage(side * 10, 3.5, 6, 2, variant, p.leaf);
          }
        } else {
          if (variant % 3 === 0) {
            this.cottage(side * 6.7, 3, true, variant);
            this.lamp(side * 3.15, 4, true);
          } else {
            this.box(x, 1.25, 0, 0.3, 2.5, 0.36, p.bark);
            for (let tier = 0; tier < 3; tier++) {
              this.spire(x, 0.7 + tier * 0.9, 0, 1.35 - tier * 0.23, 1.9, [
                "#416b67",
                "#35565d",
                "#759590",
              ]);
              this.spire(x, 1.15 + tier * 0.9, 0, 1.05 - tier * 0.2, 1.45, p.leaf);
            }
          }
          if (variant === 2) this.water(side * 9, 6, 7, 9, true);
        }
        template = this.faces;
        this.captureScenery = false;
        this.faces = saved;
        this.layer = layer;
        this.sceneryTemplates.set(key, template);
      }
      // Both sides of both outgoing streets exist before choosing a turn.
      // Keep the rejected street in the same world until it leaves the view.
      const junction = this.sceneryForkAt;
      const branches = junction !== null && row * 14 - junction > 14 ? [-1, 1] : [side];
      for (const branch of branches)
        for (const face of template) {
          const cameraSpace = junction !== null;
          const points: V[] = face.points.map(([x, y, pz]) => {
            if (cameraSpace && face.boardwalk && Math.abs(x) < 2.321) {
              const along = pz + z - (this.forkDepth ?? -this.curveAlong);
              x *= this.turnRoadWidth(along);
            }
            return cameraSpace ? this.sceneryViewPoint(branch, x, y, pz + z) : [x, y, pz + z];
          });
          const view = cameraSpace ? points : points.map((point) => this.cameraPoint(point));
          if ((face.cull && !this.frontFacing(view)) || view.every((p) => p[2] < -9)) continue;
          this.faces.push({
            ...face,
            points,
            cameraSpace,
            z: view.reduce((sum, point) => sum + point[2], 0) / view.length,
          });
        }
    }
  }
  sceneryViewPoint(branch: number, x: number, y: number, z: number): V {
    if (this.forkDepth !== null) return this.cameraPoint(this.forkWorldPoint(branch, x, y, z));
    const along = this.curveAlong;
    const direction = this.curveDirection;
    // Express each branch in the junction's original world coordinates, then
    // move/rotate that world around the selected road's camera origin.
    const point = this.turnPoint(along + z, branch);
    const origin = this.turnPoint(along);
    const wx =
      point[0] + branch * LANE_WIDTH - origin[0] - direction * LANE_WIDTH + x * Math.cos(point[2]);
    const wz = point[1] - origin[1] - x * Math.sin(point[2]);
    const yaw = this.curveTail ? (direction * Math.PI) / 2 : this.cameraYaw;
    return [
      wx * Math.cos(yaw) - wz * Math.sin(yaw) - this.cameraShift,
      y,
      wx * Math.sin(yaw) + wz * Math.cos(yaw) + this.cameraDepthOffset,
    ];
  }
  beginCourseObject(z: number) {
    const beyondJunction =
      this.forkDepth !== null
        ? z >= this.forkDepth
        : (this.curveStrength > 0 || this.curveTail) && this.curveAlong + z >= 0;
    if (!beyondJunction) return -1;
    // A future row exists on either possible exit. Retain every face until
    // the object has been placed on that street, then test its visibility.
    this.captureScenery = true;
    return this.faces.length;
  }
  endCourseObject(start: number) {
    if (start < 0) return;
    this.captureScenery = false;
    const template = this.faces.splice(start);
    for (const branch of [-1, 1]) {
      for (const face of template) {
        const points = face.points.map(([x, y, z]) => this.sceneryViewPoint(branch, x, y, z));
        if ((face.cull && !this.frontFacing(points)) || points.every((p) => p[2] < -9)) continue;
        this.faces.push({
          ...face,
          points,
          cameraSpace: true,
          z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
        });
      }
    }
  }
  road(s: RunState, travel: number) {
    const world = WORLD_STYLES[s.scene],
      p = world.palette;
    const junction =
      this.forkDepth ?? (this.curveStrength > 0 || this.curveTail ? -this.curveAlong : null);
    const paint = (points: V[], color: string) => {
      if (points.every((point) => point[2] < -9)) return;
      this.faces.push({
        points,
        color,
        cameraSpace: true,
        layer: 0,
        z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
      });
    };
    const strip = (branch: number, row: number, near: number, far: number) => {
      if (far - near < 0.000001) return;
      const point = (x: number, y: number, z: number) => this.roadPoint(branch, x, y, z);
      const along = junction === null ? Infinity : near - junction;
      // The first few meters are a single connector, then open back into the
      // three playable lanes once the two streets have separated.
      const connector = branch !== 0 && this.turnRoadWidth(along) < 0.85;
      const lanes = connector ? [0] : [-1, 0, 1];
      for (const lane of lanes) {
        const x = lane * LANE_WIDTH;
        const half = connector ? LANE_WIDTH * 1.5 - 0.0175 : (LANE_WIDTH - 0.035) / 2;
        paint(
          [
            point(x - half, -0.02, near),
            point(x + half, -0.02, near),
            point(x + half, -0.02, far),
            point(x - half, -0.02, far),
          ],
          world.road[Math.abs(row + lane) % 3],
        );
        if (s.scene === "summer") {
          const start = Math.max(near, row * 3 - travel - 0.5);
          const end = Math.min(far, row * 3 - travel - 0.46);
          if (end > start)
            paint(
              [
                point(x - half, 0.005, start),
                point(x + half, 0.005, start),
                point(x + half, 0.005, end),
                point(x - half, 0.005, end),
              ],
              "#8b775b",
            );
        } else if (s.scene === "autumn") {
          const start = Math.max(near, row * 3 - travel - 0.3);
          if (far > start)
            paint(
              [
                point(x, 0.005, start),
                point(x + 0.025, 0.005, start),
                point(x + 0.025, 0.005, far),
                point(x, 0.005, far),
              ],
              "#9b7565",
            );
        }
      }
      for (const side of [-1, 1]) {
        const x = side * 2.6;
        paint(
          [
            point(x - 0.09, 0.025, near),
            point(x + 0.09, 0.025, near),
            point(x + 0.09, 0.025, far),
            point(x - 0.09, 0.025, far),
          ],
          p.stone[0],
        );
      }
    };
    const first = Math.floor(travel / 3);
    for (let i = 50; i >= -2; i--) {
      const row = first + i,
        z = row * 3 - travel;
      const near = z - 1.49,
        far = z + 1.49;
      if (junction === null) strip(0, row, near, far);
      else {
        // Split a slab at the exact junction instead of overlaying two full
        // roads along the approach. The closed center lane simply ends here.
        if (near < junction) strip(0, row, near, Math.min(far, junction));
        if (far > junction)
          for (const branch of [-1, 1]) strip(branch, row, Math.max(near, junction), far);
      }
    }
    this.layer = 1;
    if (junction !== null && junction > -5 && junction < 130) {
      // Keep the same physical center barrier as it passes behind the TV.
      const start = this.faces.length;
      const savedCapture = this.captureScenery;
      this.captureScenery = true;
      const z = junction;
      this.box(0, 0.42, z - 0.06, 1.35, 0.84, 0.32, ["#9c6850", "#684739", "#d8b778"]);
      for (const x of [-0.43, 0, 0.43])
        this.box(x, 0.43, z - 0.23, 0.13, 0.61, 0.025, ["#fff0bb", "#d8b778", "#fff0bb"], 0, -0.35);
      this.box(0, 1, z, 0.18, 2, 0.18, p.dark);
      this.box(0, 1.95, z, 2.55, 0.9, 0.3, ["#63554d", "#423d3e", "#b39c76"]);
      this.label(0, 2.08, z - 0.16, 2.35, 0.47, "←       →", "#fff0bb", "#63554d", true);
      this.label(
        0,
        1.7,
        z - 0.17,
        2.35,
        0.25,
        this.renderLocale === "zh-CN" ? "前方分岔 · 请选择转向" : "FORK · TURN LEFT OR RIGHT",
        "#fff0bb",
        "#63554d",
      );
      this.captureScenery = savedCapture;
      const faces = this.faces.splice(start);
      for (const face of faces) {
        const points = face.points.map(([x, y, depth]) => this.roadPoint(0, x, y, depth));
        if ((face.cull && !this.frontFacing(points)) || points.every((point) => point[2] < -9))
          continue;
        this.faces.push({
          ...face,
          points,
          cameraSpace: true,
          z: points.reduce((sum, point) => sum + point[2], 0) / points.length,
        });
      }
    }
  }
  railGateway(
    z: number,
    locale: "en" | "zh-CN",
    scene: SceneKind = "spring",
    mode: "rail" | "run" = "rail",
  ) {
    const p = ["#5e9693", "#376969", "#b9ddd0"];
    this.face(
      [
        [-2.55, 0.06, z + 0.04],
        [2.55, 0.06, z + 0.04],
        [2.55, 3.8, z + 0.04],
        [-2.55, 3.8, z + 0.04],
      ],
      WORLD_STYLES[scene].sky[1],
    );
    this.faces[this.faces.length - 1].journey = { scene, mode };
    for (const side of [-1, 1]) this.box(side * 2.7, 2.1, z, 0.27, 4.2, 0.4, p);
    this.box(0, 4.2, z, 5.65, 0.75, 0.5, p);
    this.label(
      0,
      4.25,
      z - 0.27,
      5.3,
      0.53,
      mode === "rail"
        ? locale === "zh-CN"
          ? "进入共建列车"
          : "ENTER THE RAIL QUIZ"
        : locale === "zh-CN"
          ? "回到四季跑道"
          : "RETURN TO THE RUN",
      "#f5efd0",
      p[0],
    );
    this.box(0, 3.79, z - 0.05, 5.18, 0.27, 0.1, p);
    this.label(
      0,
      3.8,
      z - 0.12,
      4.9,
      0.22,
      mode === "rail"
        ? locale === "zh-CN"
          ? "换道选择答案 · 继续前进即可乘车"
          : "CHOOSE ANSWERS BY LANE · BOARD AHEAD"
        : locale === "zh-CN"
          ? PORTAL_NAMES[scene]
          : sceneDefinition(scene).name,
      "#f5efd0",
      p[1],
    );
  }
  visualTravel(s: RunState) {
    // Rail mileage advances at the ride's latched pace. Drawing its
    // recorded distance keeps scenery, sleepers and score on one clock.
    return s.distance;
  }
  railTracks(s: RunState) {
    const rail = s.rail!;
    const scroll = this.visualTravel(s) % 3;
    // Reveal track failures only once the answer has been judged. Every
    // question starts with identical intact tracks, so scenery cannot hint
    // at the correct answer before the player makes their choice.
    const question = currentRailQuestion(s);
    const revealBreaks =
      (rail.phase === "feedback" || rail.phase === "falling" || rail.phase === "complete") &&
      question !== null;
    const correctLane = question ? rail.optionOrder.indexOf(question.correctIndex) - 1 : null;
    // The rejected tracks end at the same moving boundary as the answer gate.
    // Removing a fixed patch ahead leaves disconnected rails next to the cart.
    const gateZ =
      rail.phase === "question"
        ? rail.remaining * railSpeed(s)
        : -(Math.max(0, rail.duration - rail.remaining) + (rail.phase === "complete" ? 1.6 : 0)) *
          railSpeed(s);
    this.layer = -1;
    this.face(
      [
        [-3, -1, -8],
        [3, -1, -8],
        [3, -1, 150],
        [-3, -1, 150],
      ],
      "#26434a",
    );
    for (let lane = -1; lane <= 1; lane++)
      for (let i = 48; i >= -2; i--) {
        const z = i * 3 - scroll,
          x = lane * LANE_WIDTH;
        const trackEnd = revealBreaks && lane !== correctLane ? gateZ : Infinity;
        if (z - 1.5 >= trackEnd) continue;
        const deckEnd = Math.min(z + 1.47, trackEnd);
        const sleeperEnd = Math.min(z + 0.15, trackEnd);
        const railEnd = Math.min(z + 1.5, trackEnd);
        this.layer = 0;
        if (deckEnd > z - 1.47)
          this.face(
            [
              [x - 0.72, 0, z - 1.47],
              [x + 0.72, 0, z - 1.47],
              [x + 0.72, 0, deckEnd],
              [x - 0.72, 0, deckEnd],
            ],
            "#73684f",
          );
        // All three surfaces span a row. Explicit heights in painter order
        // prevent tiny average-depth rounding differences from letting a
        // deck or sleeper erase the metal rails as that row approaches.
        this.layer = 0.1;
        if (sleeperEnd > z - 0.15)
          this.face(
            [
              [x - 0.69, 0.02, z - 0.15],
              [x + 0.69, 0.02, z - 0.15],
              [x + 0.69, 0.02, sleeperEnd],
              [x - 0.69, 0.02, sleeperEnd],
            ],
            "#b69a70",
          );
        this.layer = 0.2;
        for (const side of [-1, 1])
          this.face(
            [
              [x + side * 0.46 - 0.035, 0.07, z - 1.5],
              [x + side * 0.46 + 0.035, 0.07, z - 1.5],
              [x + side * 0.46 + 0.035, 0.07, railEnd],
              [x + side * 0.46 - 0.035, 0.07, railEnd],
            ],
            "#cedbd3",
          );
      }
    if (revealBreaks) {
      const drop =
        rail.phase === "complete"
          ? 1 + Math.max(0, rail.duration - rail.remaining) / 1.6
          : Math.max(0, 1 - rail.remaining / rail.duration);
      for (let lane = -1; lane <= 1; lane++) {
        if (lane === correctLane) continue;
        const x = lane * LANE_WIDTH;
        this.layer = 0;
        // A few broken sleepers sink into the visible gap. Their bounded
        // geometry makes both rejected tracks readable without particles.
        for (let piece = 0; piece < 3; piece++) {
          const z = gateZ + 8 + piece * 6,
            y = -0.24 - drop * (0.55 + piece * 0.12);
          this.face(
            [
              [x - 0.54, y, z - 0.16],
              [x + 0.52, y - 0.36, z + 0.03],
              [x + 0.47, y - 0.4, z + 0.26],
              [x - 0.58, y - 0.03, z + 0.11],
            ],
            "#9c795e",
          );
        }
      }
    }
    this.layer = 1;
    if (rail.phase === "question" || rail.phase === "feedback") {
      const z = gateZ;
      for (let lane = -1; lane <= 1; lane++) {
        const x = lane * LANE_WIDTH,
          selected = rail.answerLane === lane;
        const p = selected
          ? rail.correct
            ? ["#6cb899", "#428974", "#d6f4c0"]
            : ["#b76467", "#8a444e", "#ffd2a7"]
          : ["#659598", "#38656f", "#d7e8d6"];
        for (const side of [-1, 1]) this.box(x + side * 0.72, 1.42, z, 0.11, 2.84, 0.22, p);
        this.box(x, 2.83, z, 1.55, 0.55, 0.25, p);
        this.label(x, 2.84, z - 0.14, 1.4, 0.43, ["A", "B", "C"][lane + 1], "#fff7dc", p[0], true);
      }
    }
  }
  railCart(s: RunState, _t: number) {
    const rail = s.rail!;
    const progress = Math.max(0, Math.min(1, 1 - rail.remaining / rail.duration));
    const fall = rail.phase === "falling" ? progress * progress * 6 : 0;
    const arrival = rail.phase === "boarding" ? (1 - progress) * 1.1 : 0;
    const x = s.x,
      y = 0.05 - fall,
      z = -arrival;
    const shell = ["#78c1c2", "#407e86", "#bce8d9"],
      dark = ["#415560", "#283f4b", "#778b91"];
    for (const side of [-1, 1])
      for (const depth of [-0.44, 0.44])
        this.box(x + side * 0.58, y + 0.19, z + depth, 0.15, 0.34, 0.34, dark);
    this.box(x, y + 0.35, z, 1.32, 0.2, 1.36, dark);
    this.box(x, y + 0.72, z - 0.62, 1.39, 0.67, 0.13, shell);
    for (const side of [-1, 1]) this.box(x + side * 0.66, y + 0.7, z, 0.13, 0.65, 1.35, shell);
    this.label(x, y + 0.72, z - 0.69, 0.95, 0.34, "✦", "#f1d693", shell[0]);
    this.runner({ ...s, mode: "paused", jump: 0, slide: 0, edgeStumble: 0 }, _t, {
      seated: 1,
      elevation: -fall,
      depth: z,
    });
  }
  railExitGateway(s: RunState) {
    const rail = s.rail!;
    this.layer = 1;
    // One fixed gate approaches along the existing track. The final feedback
    // includes the two-second exit leg; switching phase never replaces the
    // world, moves the gate, repairs rejected tracks, or changes the passenger.
    this.railGateway(
      (rail.remaining + (rail.phase === "feedback" ? 2 : 0)) * railSpeed(s),
      this.renderLocale,
      s.scene,
      "run",
    );
  }
  journeyPreview(scene: SceneKind, mode: "rail" | "run"): HTMLCanvasElement | null {
    if (mode === "run") return this.portalPreview(scene);
    const cached = this.railPreviews.get(scene);
    if (cached) return cached;
    const canvas = this.canvas.ownerDocument?.createElement("canvas");
    if (!canvas) return null;
    canvas.width = 256;
    canvas.height = 512;
    if (!canvas.getContext("2d")) return null;
    const view = new Renderer(canvas);
    view.w = 256;
    view.h = 512;
    const state = createRun(4182, scene);
    state.mode = "paused";
    state.time = 12;
    state.distance = 56;
    state.nextPortalAt = Infinity;
    state.nextRailAt = Infinity;
    state.rail = createRailRide(() => 0.5);
    state.rail.remaining = 0;
    // Boarding shows the activity without exposing a question or safe lane.
    view.render(state, 12, true);
    this.railPreviews.set(scene, canvas);
    return canvas;
  }
  portalPreview(scene: SceneKind): HTMLCanvasElement | null {
    const cached = this.portalPreviews.get(scene);
    if (cached) return cached;
    const canvas = this.canvas.ownerDocument?.createElement("canvas");
    if (!canvas) return null;
    canvas.width = 256;
    canvas.height = 512;
    if (!canvas.getContext("2d")) return null;
    // Render the destination's actual geometry once, then reuse its texture.
    // No second simulation or per-frame scene rendering runs inside a gate.
    const view = new Renderer(canvas);
    view.w = 256;
    view.h = 512;
    view.landscapeOnly = true;
    const state = createRun(4182, scene);
    state.mode = "running";
    state.time = 12;
    state.distance = 56;
    state.nextPortalAt = Infinity;
    state.nextRailAt = Infinity;
    view.render(state, 12, true);
    this.portalPreviews.set(scene, canvas);
    return canvas;
  }
  portal(x: number, z: number, scene: SceneKind, locale: "en" | "zh-CN") {
    const frame = ["#53ccb1", "#227f77", "#c3ffee"];
    this.face(
      [
        [x - 0.68, 0, z + 0.04],
        [x + 0.68, 0, z + 0.04],
        [x + 0.68, 3.18, z + 0.04],
        [x - 0.68, 3.18, z + 0.04],
      ],
      WORLD_STYLES[scene].sky[1],
    );
    this.faces[this.faces.length - 1].portal = scene;
    for (const side of [-1, 1]) {
      this.box(x + side * 0.77, 1.65, z, 0.18, 3.3, 0.45, frame);
      this.box(x + side * 0.66, 1.65, z - 0.25, 0.05, 3.2, 0.08, ["#e9fff2", "#96e8cd", "#ffffff"]);
    }
    this.box(x, 3.35, z, 1.72, 0.3, 0.45, frame);
    this.box(x, 3.96, z, 2.55, 0.92, 0.3, ["#19594f", "#14473f", "#9ee8cc"]);
    this.label(
      x,
      4.16,
      z - 0.17,
      2.42,
      0.35,
      locale === "zh-CN" ? "走入传送门" : "WALK THROUGH",
      "#c2ffe5",
      "#19594f",
    );
    this.label(
      x,
      3.77,
      z - 0.18,
      2.42,
      0.36,
      locale === "zh-CN" ? PORTAL_NAMES[scene] : sceneDefinition(scene).name,
      "#ffffff",
      "#19594f",
    );
    for (const step of [1.1, 2.4, 3.7]) {
      this.face(
        [
          [x - 0.43, 0.025, z - step],
          [x, 0.025, z - step + 0.45],
          [x + 0.43, 0.025, z - step],
          [x + 0.43, 0.025, z - step - 0.2],
          [x, 0.025, z - step + 0.25],
          [x - 0.43, 0.025, z - step - 0.2],
        ],
        "#ceffe7",
      );
    }
  }
  relic(x: number, z: number, t: number, kind: BoostKind, height = RELIC_HEIGHT) {
    const y = height + Math.sin(t * 2.4) * 0.12;
    const colors = {
      shield: ["#86e5d4", "#267e75", "#d1fff1"],
      magnet: ["#f7d16e", "#9c6b20", "#fff0b0"],
      rush: ["#f59d66", "#a44e29", "#ffe0ad"],
      headstart: ["#f59d66", "#a44e29", "#ffe0ad"],
      portal: ["#d8d6ff", "#6761a6", "#ffffff"],
      doubleCoins: ["#f7d16e", "#9c6b20", "#fff0b0"],
    }[kind];
    // A larger, colored token with a distinct glyph separates it from coins.
    const outline: [number, number][] = [
      [0, 0.7],
      [0.55, 0.25],
      [0.55, -0.3],
      [0, -0.7],
      [-0.55, -0.3],
      [-0.55, 0.25],
    ];
    const front: V[] = outline.map(([a, b]) => [x + a, y + b, z - 0.18]);
    const back: V[] = outline.map(([a, b]) => [x + a, y + b, z + 0.18]);
    for (let i = 0; i < front.length; i++)
      this.face(
        [front[i], back[i], back[(i + 1) % front.length], front[(i + 1) % front.length]],
        colors[1],
      );
    this.face(front, colors[0]);
    const mark = (points: [number, number][], color = colors[2]) =>
      this.face(
        points.map(([a, b]) => [x + a, y + b, z - 0.2]),
        color,
      );
    if (kind === "shield") {
      mark([
        [-0.29, 0.33],
        [0.29, 0.33],
        [0.25, -0.13],
        [0, -0.4],
        [-0.25, -0.13],
      ]);
      mark(
        [
          [-0.07, 0.19],
          [0.07, 0.19],
          [0.07, -0.16],
          [-0.07, -0.16],
        ],
        colors[1],
      );
      mark(
        [
          [-0.18, 0.08],
          [0.18, 0.08],
          [0.18, -0.05],
          [-0.18, -0.05],
        ],
        colors[1],
      );
    } else if (kind === "doubleCoins") {
      // Paired coin glyph distinguishes double rewards from the Shield relic.
      for (const offset of [-0.17, 0.17]) {
        const ring: [number, number][] = [];
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5;
          ring.push([offset + Math.cos(a) * 0.19, Math.sin(a) * 0.3]);
        }
        mark(ring);
        mark(
          [
            [offset - 0.03, 0.16],
            [offset + 0.03, 0.16],
            [offset + 0.03, -0.16],
            [offset - 0.03, -0.16],
          ],
          colors[1],
        );
      }
    } else if (kind === "magnet") {
      mark([
        [-0.29, 0.32],
        [-0.12, 0.32],
        [-0.12, -0.13],
        [0.12, -0.13],
        [0.12, 0.32],
        [0.29, 0.32],
        [0.29, -0.2],
        [0.15, -0.36],
        [-0.15, -0.36],
        [-0.29, -0.2],
      ]);
      mark(
        [
          [-0.29, 0.32],
          [-0.12, 0.32],
          [-0.12, 0.17],
          [-0.29, 0.17],
        ],
        colors[1],
      );
      mark(
        [
          [0.12, 0.32],
          [0.29, 0.32],
          [0.29, 0.17],
          [0.12, 0.17],
        ],
        colors[1],
      );
    } else {
      mark([
        [0.07, 0.43],
        [-0.28, -0.04],
        [-0.03, -0.04],
        [-0.12, -0.44],
        [0.3, 0.1],
        [0.06, 0.1],
      ]);
    }
  }
  runner(
    s: RunState,
    t: number,
    pose?: { seated?: number; elevation?: number; depth?: number; stride?: number },
  ) {
    const firstFace = this.faces.length;
    const running = s.mode === "running" || s.mode === "ready";
    // The television faces forward down the path (+z), so the chase camera
    // sees its back panel. Feet stay above the road even when sliding.
    const slidePhase =
      s.slide > 0 ? Math.max(0, Math.min((SLIDE_DURATION - s.slide) / 0.12, s.slide / 0.14, 1)) : 0;
    const slide = slidePhase * slidePhase * (3 - 2 * slidePhase);
    const mix = (a: number, b: number) => a + (b - a) * slide;
    const stride =
      pose?.stride ??
      (running && s.jump === 0 ? Math.sin(t * (s.mode === "ready" ? 5 : 15)) * (1 - slide) : 0);
    const y = jumpHeight(s) + Math.abs(stride) * 0.055 + (pose?.elevation ?? 0);
    const seated = pose?.seated ?? 0;
    const point = (standing: V, sliding: V, sitting: V = standing): V => {
      const base = standing.map((v, i) => mix(v, sliding[i]) * (1 - seated) + sitting[i] * seated);
      return [s.x + base[0], y + base[1], base[2] + (pose?.depth ?? 0)];
    };
    const shell = ["#72d0e7", "#3295b3", "#b5eff9"];
    const trim = ["#284c60", "#183444", "#4c7285"];
    const segment = (a: V, b: V, width: number, depth: number, colors: string[]) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        dz = b[2] - a[2];
      this.box(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
        width,
        Math.hypot(dx, dy, dz),
        depth,
        colors,
        Math.atan2(dz, Math.hypot(dx, dy)),
        Math.atan2(-dx, dy),
      );
    };
    const body = point([0, 0.94, 0], [0, 0.53, -0.16], [0, 1.18, 0.05]);
    const lean = mix(0.04, 0.9) * (1 - seated);
    const cos = Math.cos(lean),
      sin = Math.sin(lean);
    const attached = (x: number, up: number, depth: number): V => [
      body[0] + x,
      body[1] + up * cos - depth * sin,
      body[2] + up * sin + depth * cos,
    ];
    this.box(...body, 1.02, 0.86, 0.46, shell, lean);
    // Rear-panel details share one surface depth so reclining keeps the vents
    // attached to the case. The forward-facing screen is hidden by the body.
    let panelDepth = attached(0, 0, -0.245)[2];
    const panel = (outline: [number, number][], color: string) => {
      this.face(
        outline.map(([x, up]) => attached(x, up, -0.25)),
        color,
      );
      this.faces[this.faces.length - 1].z = panelDepth;
      panelDepth -= 0.001;
    };
    const panelRect = (x: number, up: number, width: number, height: number, color: string) =>
      panel(
        [
          [x - width / 2, up - height / 2],
          [x + width / 2, up - height / 2],
          [x + width / 2, up + height / 2],
          [x - width / 2, up + height / 2],
        ],
        color,
      );
    panelRect(0, 0, 0.79, 0.58, "#3295b3");
    panelRect(0, 0, 0.71, 0.5, "#60bfd8");
    for (const up of [-0.08, 0.035, 0.15]) panelRect(0, up, 0.43, 0.037, "#284c60");
    panelRect(0.27, -0.17, 0.055, 0.045, "#f4a4bc");
    for (const side of [-1, 1]) {
      const swing = stride * side;
      segment(
        attached(side * 0.19, 0.41, 0.04),
        attached(side * 0.37, 0.76, 0.04),
        0.065,
        0.065,
        trim,
      );
      const hip = point(
        [side * 0.26, 0.53, 0],
        [side * 0.26, 0.25, 0.11],
        [side * 0.26, 0.76, 0.05],
      );
      const ankle = point(
        [side * 0.26, 0.17, swing * 0.24],
        [side * 0.3, 0.16, 0.76],
        [side * 0.26, 0.65, 0.4],
      );
      segment(hip, ankle, 0.14, 0.16, trim);
      this.box(
        ...point(
          [side * 0.26, 0.13, swing * 0.24],
          [side * 0.3, 0.13, 0.86],
          [side * 0.26, 0.61, 0.46],
        ),
        0.25,
        0.2,
        0.32,
        trim,
      );
      segment(
        attached(side * 0.5, 0.06, 0),
        point(
          [side * 0.64, 0.66, -swing * 0.22],
          [side * 0.67, 0.22, -0.19],
          [side * 0.62, 0.93, 0.2],
        ),
        0.14,
        0.16,
        shell,
      );
    }
    if (!s.rail && (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0)) {
      // A softly phased TV signals that these boosts pass through obstacles.
      // Simulation time freezes the pulse on pause; cart answers remain solid.
      const opacity = 0.55 + Math.sin(s.time * Math.PI * 1.2) * 0.1;
      for (let i = firstFace; i < this.faces.length; i++) this.faces[i].opacity = opacity;
    }
    const transformRunner = (transform: (point: V) => V) => {
      for (let i = firstFace; i < this.faces.length; i++) {
        const face = this.faces[i];
        const depthBias =
          face.z - face.points.reduce((sum, p) => sum + p[2], 0) / face.points.length;
        // Rotated boxes share corner arrays across faces. Never mutate those
        // corners here: doing so rotates a shared corner once per visible face.
        face.points = face.points.map(transform);
        face.z = face.points.reduce((sum, p) => sum + p[2], 0) / face.points.length + depthBias;
      }
    };
    const steering = Math.max(-1, Math.min(1, (s.lane * LANE_WIDTH - s.x) / LANE_WIDTH));
    if (steering !== 0) {
      const angle = steering * 0.24,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      transformRunner(([x, y, z]) => [
        s.x + (x - s.x) * cos + z * sin,
        y,
        z * cos - (x - s.x) * sin,
      ]);
    }
    if ((s.edgeStumble ?? 0) > 0) {
      const progress = 1 - Math.min(1, s.edgeStumble / EDGE_STUMBLE_DURATION);
      // A quick shoulder recoil away from the edge, followed by a slower
      // planted-foot recovery. Keep the silhouette compact and over the road.
      const amount = Math.sin(Math.PI * Math.pow(progress, 0.55));
      const direction = s.edgeStumbleDirection ?? 0;
      const angle = direction * amount * 0.14;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      let lowest = Infinity;
      transformRunner(([x, y, z]) => {
        const dx = x - s.x,
          dy = y - 0.13;
        const nextY = 0.13 + dx * sin + dy * cos;
        lowest = Math.min(lowest, nextY);
        return [s.x + dx * cos - dy * sin - direction * amount * 0.12, nextY, z];
      });
      if (lowest < 0.03) transformRunner(([x, y, z]) => [x, y + 0.03 - lowest, z]);
      const edge = s.x + (s.edgeStumbleDirection ?? 0) * 0.66;
      for (let mark = 0; mark < 3; mark++) {
        const x = edge + (mark - 1) * 0.16;
        this.face(
          [
            [x, 0.045, -0.45],
            [x + 0.08, 0.045, -0.45],
            [x + 0.14, 0.045, -0.66 - amount * 0.16],
            [x + 0.07, 0.045, -0.69 - amount * 0.16],
          ],
          "#ffdf95",
        );
      }
    }
  }
  commenters(s: RunState, t: number, locale: "en" | "zh-CN") {
    const presence = monsterPresence(s);
    if (presence <= 0) return;
    const caught = s.mode === "over" && s.chase > 0;
    // Cartoon avatars personify disruptive behavior, never a real identity.
    for (const [index, side] of [-1, 1].entries()) {
      const x = s.x * 0.65 + side * (caught ? 0.95 : 1.55);
      const z = (caught ? -0.5 : s.chase > 0 ? -2.8 : -4.2) - (1 - presence) * 6 - index * 0.35;
      const stride = Math.sin(t * 14 + index * Math.PI),
        bob = Math.abs(stride) * 0.055;
      const trim = ["#3c5363", "#2e3c4d", "#788996"];
      const cloak = index ? "#39334f" : "#583644";
      const cloakFold = index ? "#504564" : "#754451";
      const casing = [cloak, "#292635", cloakFold];
      // Like the runner, these TVs face down the path. Their rear silhouette
      // is wrapped in a cloak, with the warning printed directly on its fabric.
      this.face(
        [
          [x - 0.57, 1.18 + bob, z + 0.15],
          [x + 0.57, 1.18 + bob, z + 0.15],
          [x + 0.81, 0.2 + bob, z + 0.22],
          [x + 0.43, 0.13 + bob, z + 0.22],
          [x - 0.43, 0.13 + bob, z + 0.22],
          [x - 0.81, 0.2 + bob, z + 0.22],
        ],
        cloak,
      );
      this.box(x, 0.94 + bob, z, 1.04, 0.88, 0.48, casing);
      for (const sign of [-1, 1]) {
        this.box(x + sign * 0.29, 1.57 + bob, z + 0.01, 0.065, 0.4, 0.065, trim, 0, -sign * 0.48);
        this.box(
          x + sign * 0.26,
          0.34,
          z + sign * stride * 0.15,
          0.16,
          0.34,
          0.18,
          trim,
          sign * stride * 0.24,
        );
        this.box(x + sign * 0.26, 0.12, z - 0.04 + sign * stride * 0.15, 0.27, 0.18, 0.34, trim);
        this.box(
          x + sign * 0.61,
          0.87 + bob,
          z - sign * stride * 0.1,
          0.14,
          0.43,
          0.16,
          casing,
          -0.2,
          sign * 0.25,
        );
        this.face(
          [
            [x + sign * 0.53, 1.13 + bob, z - 0.275],
            [x + sign * 0.66, 0.43 + bob, z - 0.275],
            [x + sign * 0.8, 0.2 + bob, z - 0.275],
            [x + sign * 0.4, 0.16 + bob, z - 0.275],
            [x + sign * 0.45, 0.76 + bob, z - 0.275],
          ],
          cloakFold,
        );
      }
      this.face(
        [
          [x - 0.53, 1.39 + bob, z - 0.28],
          [x + 0.53, 1.39 + bob, z - 0.28],
          [x + 0.66, 0.45 + bob, z - 0.28],
          [x + 0.47, 0.14 + bob, z - 0.28],
          [x - 0.48, 0.18 + bob, z - 0.28],
          [x - 0.66, 0.45 + bob, z - 0.28],
        ],
        cloak,
      );
      this.label(
        x,
        0.83 + bob,
        z - 0.29,
        0.82,
        0.2,
        locale === "zh-CN" ? (index ? "引战!!" : "刷屏!!") : index ? "BAIT!!" : "SPAM!!",
        "#f3c9c8",
        cloak,
      );
    }
  }
  spire(x: number, y: number, z: number, width: number, height: number, colors: string[]) {
    const base: V[] = [
      [x - width, y, z - width],
      [x + width, y, z - width],
      [x + width, y, z + width],
      [x - width, y, z + width],
    ];
    const peak: V = [x + width * 0.16, y + height, z];
    for (let i = 0; i < 4; i++) this.face([base[i], base[(i + 1) % 4], peak], colors[i % 3]);
  }
  transportTunnel(progress: number, alpha: number, palette: ReturnType<typeof travelPalette>) {
    const c = this.ctx,
      w = this.w,
      h = this.h;
    c.save();
    c.globalAlpha = alpha;
    const tint = c.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, Math.max(w, h));
    tint.addColorStop(0, palette.background);
    tint.addColorStop(1, palette.edge);
    c.fillStyle = tint;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = alpha * 0.35;
    c.strokeStyle = palette.accent;
    c.lineWidth = 2;
    // Both journeys use the same luminous rings and simulation clock.
    for (let ring = 0; ring < 8; ring++) {
      const phase = (ring / 8 + progress * 0.7) % 1;
      const radius = 0.04 + phase * phase * 0.95;
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.46, w * radius, h * radius, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  render(s: RunState, wallTime: number, preview = false, locale: "en" | "zh-CN" = "en") {
    if (s.mode === "ready" && !preview) {
      const elapsed =
        this.previewAt === null ? 0 : Math.max(0, Math.min(wallTime - this.previewAt, 0.1));
      this.previewAt = wallTime;
      if (this.previewScene !== s.scene) {
        this.previewRun = createRun(4182, s.scene);
        this.previewScene = s.scene;
      }
      advancePreview(this.previewRun, elapsed);
      this.render(this.previewRun, wallTime, true, locale);
      return;
    }
    if (!preview) {
      this.previewAt = null;
      this.previewScene = null;
    }
    const c = this.ctx,
      w = this.w,
      h = this.h;
    if (!w || !h) return;
    const ready = preview;
    this.center = w * (ready && w > 800 ? 0.65 : 0.5);
    this.horizon = h * 0.255;
    this.focal = h * 0.9;
    this.faces = [];
    this.layer = 1;
    const t = s.mode === "running" ? s.time : s.mode === "ready" ? wallTime : s.time;
    const travel = this.visualTravel(s);
    const world = WORLD_STYLES[s.scene] ?? WORLD_STYLES.spring;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, world.sky[0]);
    sky.addColorStop(0.38, world.sky[1]);
    sky.addColorStop(0.65, world.sky[2]);
    sky.addColorStop(1, world.sky[3]);
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const sun = c.createRadialGradient(this.center, h * 0.17, 2, this.center, h * 0.17, h * 0.53);
    sun.addColorStop(0, world.glow);
    sun.addColorStop(0.25, world.glow.slice(0, 7) + "36");
    sun.addColorStop(1, world.glow.slice(0, 7) + "00");
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    this.renderLocale = locale;
    this.configureCamera(s);
    this.forkDepth = !preview && s.fork ? s.fork.at - travel : null;
    // A broad ground plane stays below the horizon as the camera turns.
    // Curving a huge four-corner terrain polygon makes its inner edge fold
    // behind the camera; only actual paths and landmarks follow the route.
    c.fillStyle = s.scene === "summer" ? "#65b5bd" : world.ground;
    c.fillRect(0, this.horizon + h * 0.035, w, h);
    // This distant panorama surrounds the whole route. Keep it independent
    // of the local fork coordinate frame, which changes at the junction.
    this.layer = 1;
    const firstBackdrop = this.faces.length;
    this.captureBackdrop = true;
    if (s.scene === "autumn") {
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) this.cottage(side * (12 + i * 8), 115 + i * 8, false, i);
    } else if (s.scene === "winter") {
      for (const side of [-1, 1]) {
        this.spire(side * 29, -1, 125, 29, 27, ["#c1d2db", "#91abba", "#e9eeec"]);
        this.spire(side * 47, -1, 146, 35, 33, ["#b8c9d7", "#829cac", "#e1ebeb"]);
      }
    } else if (s.scene === "spring") {
      for (const side of [-1, 1]) this.foliage(side * 26, 3, 123, 15, side, world.palette.leaf);
    }
    this.captureBackdrop = false;
    for (let i = firstBackdrop; i < this.faces.length; i++) this.faces[i].cameraSpace = true;
    if (s.rail) this.railTracks(s);
    else this.road(s, travel);
    if (
      s.rail?.phase === "complete" ||
      (s.rail?.phase === "feedback" && s.rail.index === s.rail.questions.length - 1)
    )
      this.railExitGateway(s);
    this.layer = 1;
    const firstSceneryRow = Math.floor(travel / 14);
    for (let i = 11; i >= (this.sceneryForkAt !== null ? -4 : -1); i--)
      this.scenery(s.scene, firstSceneryRow + i, (firstSceneryRow + i) * 14 - travel);
    const portalZ = s.nextPortalAt - travel;
    if (!preview && !s.rail && portalZ > -5 && portalZ < 135) {
      const start = this.beginCourseObject(portalZ);
      this.portal(s.portalLane * LANE_WIDTH, portalZ, nextScene(s.scene), locale);
      this.endCourseObject(start);
    }
    const railGateZ = s.nextRailAt - travel;
    if (
      !preview &&
      !s.rail &&
      s.railPreparedAt === s.nextRailAt &&
      railGateZ > 0 &&
      railGateZ < 130
    ) {
      const start = this.beginCourseObject(railGateZ);
      this.railGateway(railGateZ, locale, s.scene, "rail");
      this.endCourseObject(start);
    }
    const obstacles = s.rail ? [] : s.obstacles;
    for (const o of obstacles) {
      const z = o.at - s.distance;
      if (z < -7 || z > 138) continue;
      const start = this.beginCourseObject(z);
      const x = o.lane * LANE_WIDTH;
      const lesson = getLesson(o);
      const title = lesson.label[locale === "zh-CN" ? "zh" : "en"];
      const ink = "#392238";
      const paper = ["#f0d9cc", "#b58982", "#fff0dd"];
      const border = ["#a65761", "#733e50", "#d59186"];
      if (o.kind === "block") {
        // A low comment card has the same jump clearance as the old barrier.
        this.box(x, 0.47, z, 1.37, 0.94, 0.8, paper);
        this.box(x, 0.94, z, 1.42, 0.1, 0.83, border);
        this.label(x, 0.68, z - 0.414, 1.32, 0.52, title, ink, paper[0], true);
        this.label(
          x,
          0.24,
          z - 0.417,
          1.32,
          0.3,
          locale === "zh-CN" ? "↑ 跳过" : "↑ JUMP",
          ink,
          paper[0],
          true,
        );
      } else if (o.kind === "arch") {
        // A suspended post leaves the familiar sliding gap beneath it.
        this.box(x - 0.67, 1.2, z, 0.17, 2.4, 0.3, border);
        this.box(x + 0.67, 1.2, z, 0.17, 2.4, 0.3, border);
        this.box(x, 1.98, z, 1.55, 1.04, 0.63, paper);
        this.box(x, 1.44, z - 0.01, 1.55, 0.12, 0.66, border);
        this.label(x, 2.24, z - 0.325, 1.46, 0.46, title, ink, paper[0], true);
        this.label(
          x,
          1.75,
          z - 0.328,
          1.46,
          0.34,
          locale === "zh-CN" ? "↓ 下滑" : "↓ SLIDE",
          ink,
          paper[0],
          true,
        );
      } else if (o.kind === "roots") {
        // Repeated comment strips form a small trip hazard across the lane.
        this.box(x, 0.13, z, 1.48, 0.24, 0.45, paper);
        this.box(x + 0.06, 0.29, z + 0.07, 1.34, 0.1, 0.4, border);
        this.label(x, 0.2, z - 0.236, 1.42, 0.28, title, ink, paper[0], true);
      } else {
        // Tall post cards must be bypassed by changing lanes.
        this.box(x, 1.35, z, 1.28, 2.7, 1, paper);
        this.box(x, 2.69, z, 1.33, 0.12, 1.04, border);
        this.label(x, 2.25, z - 0.514, 1.23, 0.86, title, ink, paper[0], true);
        for (const [line, width] of [0.89, 0.67, 0.82].entries())
          this.box(x - (0.9 - width) / 2, 1.65 - line * 0.28, z - 0.52, width, 0.1, 0.025, border);
        this.label(
          x,
          0.5,
          z - 0.54,
          1.23,
          0.44,
          locale === "zh-CN" ? "← 换道 →" : "← DODGE →",
          ink,
          paper[0],
          true,
        );
      }
      this.endCourseObject(start);
    }
    for (const coin of s.rail ? [] : s.pickups) {
      const z = coin.at - s.distance;
      if (!coin.taken && z > -5 && z < 120) {
        const start = this.beginCourseObject(z);
        this.coin(coin.lane * LANE_WIDTH, z, t, coin.height ?? 1);
        this.endCourseObject(start);
      }
    }
    for (const relic of s.rail ? [] : s.relics) {
      const z = relic.at - s.distance;
      if (!relic.taken && z > -5 && z < 135) {
        const start = this.beginCourseObject(z);
        this.relic(relic.lane * LANE_WIDTH, z, t, relic.kind, relic.height ?? RELIC_HEIGHT);
        this.endCourseObject(start);
      }
    }
    if (!this.landscapeOnly && s.rail) this.railCart(s, t);
    else if (!this.landscapeOnly) {
      const visualState = this.turnEntryOffset !== 0 ? { ...s, x: s.x + this.turnEntryOffset } : s;
      this.runner(visualState, t);
      this.commenters(visualState, t, locale);
    }
    // Road slabs cross the runner's depth. Sorting their average z with body
    // parts can paint a slab over grounded feet despite positive foot height.
    // Draw the ground first, then depth-sort every above-ground object.
    for (const face of this.faces) {
      const view = this.faceView(face);
      // Keep authored overlay offsets (TV vents, printed panels) while
      // changing the scene sort from road-distance to camera-distance.
      const bias =
        face.z - face.points.reduce((sum, point) => sum + point[2], 0) / face.points.length;
      face.z = view.reduce((sum, point) => sum + point[2], 0) / view.length + bias;
    }
    this.faces.sort((a, b) => a.layer - b.layer || b.z - a.z);
    for (const face of this.faces) {
      const view = this.faceView(face);
      const clipped = this.clipNear(view);
      if (clipped.length < 3) continue;
      const pts = clipped.map((p) => this.projectView(p));
      if (
        pts.every((p) => p[0] < -50) ||
        pts.every((p) => p[0] > w + 50) ||
        pts.every((p) => p[1] < -100) ||
        pts.every((p) => p[1] > h + 100)
      )
        continue;
      if (face.opacity !== undefined) c.globalAlpha = face.opacity;
      c.beginPath();
      c.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) c.lineTo(...pts[i]);
      c.closePath();
      c.fillStyle = face.color;
      c.fill();
      if ((face.portal || face.journey) && clipped === view) {
        const preview = face.journey
          ? this.journeyPreview(face.journey.scene, face.journey.mode)
          : this.portalPreview(face.portal!);
        if (preview) {
          const left = Math.min(...pts.map((point) => point[0])),
            top = Math.min(...pts.map((point) => point[1])),
            right = Math.max(...pts.map((point) => point[0])),
            bottom = Math.max(...pts.map((point) => point[1]));
          c.save();
          c.clip();
          c.drawImage(preview, left, top, right - left, bottom - top);
          c.restore();
        }
      }
      // The material receives normal distance fog; its printed ink stays crisp.
      const fog = Math.min(0.72, Math.max(0, (face.z - 23) / 180));
      if (fog > 0) {
        c.fillStyle = `rgba(${world.fog},${fog})`;
        c.fill();
      }
      if (face.text) {
        const left = Math.min(...pts.map((point) => point[0])),
          right = Math.max(...pts.map((point) => point[0]));
        const top = Math.min(...pts.map((point) => point[1])),
          bottom = Math.max(...pts.map((point) => point[1]));
        // Preserve every original word. Wrapping a category on the physical
        // surface gives its letters more room without adding floating labels.
        const lines =
          face.text.emphasis && !/[↑↓←→]/.test(face.text.value) && face.text.value.includes(" ")
            ? face.text.value.split(" ")
            : [face.text.value];
        const units = Math.max(
          ...lines.map((line) =>
            Array.from(line).reduce(
              (total, char) => total + (char.charCodeAt(0) > 255 ? 1 : 0.65),
              0,
            ),
          ),
        );
        const size = Math.min(
          ((bottom - top) * (face.text.emphasis ? 0.9 : 0.63)) / lines.length,
          ((right - left) * (face.text.emphasis ? 0.98 : 0.91)) / Math.max(1, units),
        );
        if (size >= (face.text.emphasis ? 3 : 5.5)) {
          c.save();
          c.clip();
          // Reuse quarter-pixel font sizes as labels approach. Full-precision
          // sizes create thousands of native font variants during a short run.
          const fontSize = Math.round(size * 4) / 4;
          c.font = `${face.text.emphasis ? 900 : 700} ${fontSize}px system-ui, sans-serif`;
          c.fillStyle = face.text.color;
          c.textAlign = "center";
          c.textBaseline = "middle";
          for (const [index, line] of lines.entries())
            c.fillText(
              line,
              (left + right) / 2,
              (top + bottom) / 2 + (index - (lines.length - 1) / 2) * size * 1.05,
              (right - left) * 0.94,
            );
          c.restore();
        }
      }
      if (face.opacity !== undefined) c.globalAlpha = 1;
    }
    // Keep active relics legible without obscuring approaching obstacles.
    if (
      !s.rail &&
      (s.boosts.shield > 0 ||
        s.boosts.grace > 0 ||
        s.boosts.magnet > 0 ||
        s.boosts.rush > 0 ||
        s.boosts.headstart > 0 ||
        s.boosts.portal > 0 ||
        s.boosts.doubleCoins > 0)
    ) {
      const [px, py] = this.project([s.x, 0.9 + jumpHeight(s), 0]);
      const unit = this.focal / 10;
      c.save();
      if (s.boosts.shield > 0 || s.boosts.grace > 0) {
        c.strokeStyle = s.boosts.grace > 0 ? "#e0f7bfc4" : "#8ddbc38f";
        c.fillStyle = "#9cdfca0b";
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(px, py, unit * 0.66, unit * 1.06, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      if (s.boosts.magnet > 0 || s.boosts.doubleCoins > 0) {
        c.fillStyle = "#f3d284";
        for (let i = 0; i < 4; i++) {
          const phase = t * 3 + (i * Math.PI) / 2;
          c.beginPath();
          c.arc(
            px + Math.cos(phase) * unit * 0.78,
            py + Math.sin(phase) * unit * 0.25,
            3,
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
      if (s.boosts.rush > 0 || s.boosts.headstart > 0 || s.boosts.portal > 0) {
        c.strokeStyle = "#ffbe7775";
        c.lineWidth = 2;
        for (const side of [-1, 1])
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.moveTo(px + side * unit * (0.5 + i * 0.16), py + unit * 0.3);
            c.lineTo(px + side * unit * (0.7 + i * 0.2), py + unit * (1.2 + i * 0.17));
            c.stroke();
          }
      }
      c.restore();
    }
    // Seasonal light, petals, fireflies, leaves and snow stay behind the UI.
    c.save();
    c.globalCompositeOperation = "screen";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(this.center + h * 0.12 + i * 75, -20);
      c.lineTo(this.center - h * 0.35 + i * 110, h);
      c.lineTo(this.center - h * 0.5 + i * 110, h);
      c.lineTo(this.center + h * 0.05 + i * 75, -20);
      c.closePath();
      c.fillStyle = s.scene === "winter" ? "#afcaff0a" : "#d5dca008";
      c.fill();
    }
    // No animated scenery particles: the silhouettes carry each season.
    c.restore();
    const vignette = c.createRadialGradient(
      w * 0.52,
      h * 0.4,
      h * 0.15,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.69,
    );
    vignette.addColorStop(0, "#021f1800");
    vignette.addColorStop(
      1,
      s.scene === "autumn" ? "#412b2345" : s.scene === "winter" ? "#344c6a55" : "#174f424d",
    );
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
    if (s.sceneTransition > 0) {
      const progress = 1 - s.sceneTransition / SCENE_TRANSITION_DURATION;
      // Opaque seasonal color at the midpoint masks the world swap.
      const fade = Math.min(1, progress / 0.35, (1 - progress) / 0.35);
      const alpha = Math.max(0, fade * fade * (3 - 2 * fade));
      this.transportTunnel(
        progress,
        alpha,
        travelPalette(s.sceneTransitionFrom ?? s.scene, s.pendingScene ?? s.scene, progress),
      );
    } else if (s.rail?.phase === "complete" || s.railReturnRemaining > 0) {
      const frame = railTravelFrame(s);
      if (frame?.direction === "return") {
        const elapsed = s.rail
          ? 1 - s.rail.remaining
          : 1 + RAIL_RETURN_DURATION - s.railReturnRemaining;
        const progress = frame.progress ?? elapsed / (1 + RAIL_RETURN_DURATION);
        this.transportTunnel(
          progress,
          frame.opacity,
          travelPalette(s.scene, s.scene, progress, "rail", "run"),
        );
      }
    }
    if (s.mode === "over" && s.flash > 0) {
      c.fillStyle = `rgba(212,86,46,${s.flash * 0.38})`;
      c.fillRect(0, 0, w, h);
      s.flash = Math.max(0, s.flash - 0.016);
    }
  }
}
