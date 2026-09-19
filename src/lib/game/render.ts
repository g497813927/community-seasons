import { type RunState, LANE_WIDTH, RELIC_HEIGHT, createRun, advancePreview } from "./engine";
import type { BoostKind } from "./boosts";
import { nextScene, type SceneKind } from "./scenes";
import { createRailRide } from "./railway";
import { DEFAULT_SKIN, type SkinId } from "./skins";
import { createOutfit, type Outfit } from "./cosmetics";
import type { travelPalette } from "./travel-colors";
import type { V, Face } from "./render/types";
import { PALETTES } from "./render/styles";
import * as geometry from "./render/geometry";
import * as camera from "./render/camera";
import * as road from "./render/road";
import * as railway from "./render/railway";
import * as gates from "./render/gates";
import * as collectibles from "./render/collectibles";
import * as landmarks from "./render/scenes/landmarks";
import * as scenery from "./render/scenes/index";
import { runner } from "./render/characters/runner";
import { commenters } from "./render/characters/commenters";
import { railCart } from "./render/characters/cart";
import { drawSky, drawGround } from "./render/environment";
import { drawObstacles } from "./render/obstacles";
import { paintFaces } from "./render/paint";
import { drawEffects, transportTunnel } from "./render/effects";
export { getSkinPreview } from "./render/skin-preview";

// Public renderer API, per-canvas state and frame composition. Drawing lives in render/.
export class Renderer {
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  pixelRatio = 0;
  focal = 0;
  center = 0;
  horizon = 0;
  faces: Face[] = [];
  layer = 1;
  portalPreviews = new Map<SceneKind, HTMLCanvasElement>();
  railPreviews = new Map<SceneKind, HTMLCanvasElement>();
  renderSkin: SkinId = DEFAULT_SKIN;
  renderOutfit: Outfit = createOutfit();
  private reducedMotionValue = false;
  get reducedMotion() { return this.reducedMotionValue; }
  set reducedMotion(value: boolean) {
    if (this.reducedMotionValue === value) return;
    this.reducedMotionValue = value;
    // Passenger effects use the motion preference when baking gate previews.
    this.railPreviews.clear();
  }
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
  forkBlockedDirection: -1 | 0 | 1 = 0;
  renderLocale: "en" | "zh-CN" = "en";
  previewRun = createRun(4182);
  previewAt: number | null = null;
  previewScene: SceneKind | null = null;
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    const changed = this.w !== rect.width || this.h !== rect.height || this.pixelRatio !== ratio ||
      this.canvas.width !== width || this.canvas.height !== height;
    if (!changed) return false;
    this.w = rect.width;
    this.h = rect.height;
    this.pixelRatio = ratio;
    // Assigning even the same canvas dimensions clears its visible bitmap.
    // Mobile viewport/layout notifications must not blank an unchanged frame.
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }
  turnPoint(along: number, direction = this.curveDirection): [number, number, number] {
    return camera.turnPoint(this, along, direction);
  }
  configureCamera(s: RunState) {
    return camera.configureCamera(this, s);
  }
  cameraPoint(point: V): V {
    return camera.cameraPoint(this, point);
  }
  project(point: V): [number, number] {
    return geometry.project(this, point);
  }
  projectView(point: V): [number, number] {
    return geometry.projectView(this, point);
  }
  face(points: V[], color: string, text?: Face["text"]) {
    return geometry.face(this, points, color, text);
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
    return geometry.label(this, x, y, z, width, height, value, color, background, emphasis);
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
    return geometry.box(this, x, y, z, w, h, d, colors, rx, rz, drawTop);
  }
  frontFacing(points: V[]) {
    return geometry.frontFacing(this, points);
  }
  faceView(face: Face): V[] {
    return geometry.faceView(this, face);
  }
  clipNear(points: V[]): V[] {
    return geometry.clipNear(this, points);
  }
  foliage(
    x: number,
    y: number,
    z: number,
    size: number,
    seed: number,
    colors = ["#28543b", "#356544", "#1e4935", "#42704a"],
  ) {
    return landmarks.foliage(this, x, y, z, size, seed, colors);
  }
  coin(x: number, z: number, _t: number, height = 1) {
    return collectibles.coin(this, x, z, _t, height);
  }
  forkSpread(z: number) {
    return camera.forkSpread(this, z);
  }
  turnRoadWidth(along: number) {
    return camera.turnRoadWidth(this, along);
  }
  roadPoint(branch: number, x: number, y: number, z: number): V {
    return camera.roadPoint(this, branch, x, y, z);
  }
  forkWorldPoint(branch: number, x: number, y: number, z: number): V {
    return camera.forkWorldPoint(this, branch, x, y, z);
  }
  water(x: number, z: number, width: number, length: number, frozen = false) {
    return landmarks.water(this, x, z, width, length, frozen);
  }
  lamp(x: number, z: number, winter = false) {
    return landmarks.lamp(this, x, z, winter);
  }
  bench(x: number, z: number, scene: SceneKind) {
    return landmarks.bench(this, x, z, scene);
  }
  cottage(x: number, z: number, winter = false, variant = 0) {
    return landmarks.cottage(this, x, z, winter, variant);
  }
  market(x: number, z: number, variant: number) {
    return landmarks.market(this, x, z, variant);
  }
  sailboat(x: number, z: number, side: number) {
    return landmarks.sailboat(this, x, z, side);
  }
  scenery(scene: SceneKind, row: number, z: number) {
    return scenery.scenery(this, scene, row, z);
  }
  sceneryViewPoint(branch: number, x: number, y: number, z: number): V {
    return scenery.sceneryViewPoint(this, branch, x, y, z);
  }
  beginCourseObject(z: number) {
    return camera.beginCourseObject(this, z);
  }
  endCourseObject(start: number) {
    return camera.endCourseObject(this, start);
  }
  road(s: RunState, travel: number) {
    return road.road(this, s, travel);
  }
  railGateway(
    z: number,
    locale: "en" | "zh-CN",
    scene: SceneKind = "spring",
    mode: "rail" | "run" = "rail",
  ) {
    return gates.railGateway(this, z, locale, scene, mode);
  }
  visualTravel(s: RunState) {
    // Rail mileage advances at the ride's latched pace. Drawing its
    // recorded distance keeps scenery, sleepers and score on one clock.
    return s.distance;
  }
  railTracks(s: RunState) {
    return railway.railTracks(this, s);
  }
  railCart(s: RunState, _t: number) {
    return railCart(this, s, _t);
  }
  railExitGateway(s: RunState) {
    return railway.railExitGateway(this, s);
  }
  journeyPreview(scene: SceneKind, mode: "rail" | "run", skin = this.renderSkin, outfit = this.renderOutfit): HTMLCanvasElement | null {
    if (mode === "run") return this.portalPreview(scene);
    if (this.renderSkin !== skin || this.renderOutfit.hat !== outfit.hat ||
        this.renderOutfit.shoes !== outfit.shoes || this.renderOutfit.effect !== outfit.effect) {
      this.renderSkin = skin;
      this.renderOutfit = { ...outfit };
      this.railPreviews.clear();
    }
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
    state.skin = this.renderSkin;
    state.outfit = { ...this.renderOutfit };
    view.reducedMotion = this.reducedMotion;
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
    return gates.portal(this, x, z, scene, locale);
  }
  relic(x: number, z: number, t: number, kind: BoostKind, height = RELIC_HEIGHT) {
    return collectibles.relic(this, x, z, t, kind, height);
  }
  runner(
    s: RunState,
    t: number,
    pose?: { seated?: number; elevation?: number; depth?: number; stride?: number },
  ) {
    return runner(this, s, t, pose);
  }
  commenters(s: RunState, t: number, locale: "en" | "zh-CN") {
    return commenters(this, s, t, locale);
  }
  spire(x: number, y: number, z: number, width: number, height: number, colors: string[]) {
    return landmarks.spire(this, x, y, z, width, height, colors);
  }
  transportTunnel(progress: number, alpha: number, palette: ReturnType<typeof travelPalette>) {
    return transportTunnel(this, progress, alpha, palette);
  }
  render(s: RunState, wallTime: number, preview = false, locale: "en" | "zh-CN" = "en") {
    if (this.renderSkin !== s.skin || this.renderOutfit.hat !== s.outfit.hat ||
        this.renderOutfit.shoes !== s.outfit.shoes || this.renderOutfit.effect !== s.outfit.effect) {
      this.renderSkin = s.skin;
      this.renderOutfit = { ...s.outfit };
      this.railPreviews.clear();
    }
    if (s.mode === "ready" && !preview) {
      const elapsed =
        this.previewAt === null ? 0 : Math.max(0, Math.min(wallTime - this.previewAt, 0.1));
      this.previewAt = wallTime;
      if (this.previewScene !== s.scene) {
        this.previewRun = createRun(4182, s.scene);
        this.previewScene = s.scene;
      }
      this.previewRun.skin = s.skin;
      this.previewRun.outfit = { ...s.outfit };
      advancePreview(this.previewRun, elapsed);
      this.render(this.previewRun, wallTime, true, locale);
      return;
    }
    if (!preview) {
      this.previewAt = null;
      this.previewScene = null;
    }
    const w = this.w,
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
    drawSky(this, s.scene);
    this.renderLocale = locale;
    this.configureCamera(s);
    this.forkDepth = !preview && s.fork ? s.fork.at - travel : null;
    drawGround(this, s.scene);
    scenery.backdrop(this, s.scene);
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
    drawObstacles(this, s, locale);
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
    paintFaces(this, s.scene);
    drawEffects(this, s, t);
  }
}
