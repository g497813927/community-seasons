import { createRun } from "./engine";
import { Renderer } from "./render";
import { createRailRide } from "./railway";
import { translate, type Locale } from "./i18n";
import { isSceneKind, sceneDefinition, type SceneKind } from "./scenes";

export interface SharePosterSnapshot {
  score: number;
  distance: number;
  coins: number;
  best: number;
  scene: SceneKind;
  locale: Locale;
  mode?: "run" | "rail";
}

export const SHARE_POSTER_WIDTH = 720;
export const SHARE_POSTER_HEIGHT = 960;
const INK = "#173f43";
const CREAM = "#fffdf0";
const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const count = (value: number) => Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value))) : 0;

function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number,
  options: { width?: number; color?: string; outline?: boolean; weight?: number } = {}) {
  c.font = `${options.weight ?? 800} ${size}px ${FONT}`;
  const width = options.width ?? 624;
  if (c.measureText(value).width > width) {
    size *= width / c.measureText(value).width;
    c.font = `${options.weight ?? 800} ${size}px ${FONT}`;
  }
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.lineJoin = "round";
  if (options.outline) {
    c.strokeStyle = CREAM;
    c.lineWidth = 6;
    c.strokeText(value, x, y);
  }
  c.fillStyle = options.color ?? INK;
  c.fillText(value, x, y);
}

// Exact Lucide Flower2 geometry, matching the game title's existing logo.
function flower(c: CanvasRenderingContext2D, x: number, y: number, size = 36) {
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(size / 24, size / 24);
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const path of [
    "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1",
    "M12 10v12",
    "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z",
    "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
  ]) c.stroke(new Path2D(path));
  c.beginPath(); c.arc(12, 8, 2, 0, Math.PI * 2); c.stroke();
  c.restore();
}

async function qrImage(dataUrl: string): Promise<HTMLImageElement> {
  if (dataUrl.length > 1_400_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error("Invalid QR image.");
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => { img.onload = null; img.onerror = null; reject(new Error("QR image timed out.")); }, 8000);
    const finish = (error?: Error) => {
      clearTimeout(timeout); img.onload = null; img.onerror = null;
      if (error) reject(error);
      else if (img.naturalWidth < 80 || img.naturalWidth > 1024 || img.naturalWidth !== img.naturalHeight) reject(new Error("Invalid QR dimensions."));
      else resolve(img);
    };
    img.onload = () => finish();
    img.onerror = () => finish(new Error("QR image could not be decoded."));
    img.src = dataUrl;
  });
}

/** One result snapshot; this never reads storage, profiles, or live game state. */
export async function createSharePoster(snapshot: SharePosterSnapshot, qrDataUrl?: string): Promise<Blob> {
  const locale: Locale = snapshot.locale === "zh-CN" ? "zh-CN" : "en";
  const scene = isSceneKind(snapshot.scene) ? snapshot.scene : "spring";
  const score = count(snapshot.score), distance = count(snapshot.distance), coins = count(snapshot.coins);
  const best = Math.max(score, count(snapshot.best));
  const l = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  const number = (n: number) => n.toLocaleString(locale);
  const qr = qrDataUrl ? await qrImage(qrDataUrl) : null;
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_POSTER_WIDTH; canvas.height = SHARE_POSTER_HEIGHT;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Image rendering is unavailable.");
  c.fillStyle = "#a1e0db"; c.fillRect(0, 0, 720, 960);

  const landscape = document.createElement("canvas");
  landscape.width = 720; landscape.height = 410;
  const renderer = new Renderer(landscape);
  renderer.w = 720; renderer.h = 410; renderer.landscapeOnly = true;
  const pose = createRun(4182, scene);
  Object.assign(pose, { mode: "paused", time: 12, distance: 56, obstacles: [], pickups: [], relics: [], nextForkAt: Infinity, nextRailAt: Infinity, nextPortalAt: Infinity });
  if (snapshot.mode === "rail") {
    // Show intact railway scenery, independent of a failed answer's falling
    // animation. The poster has no character, question gates, or collectibles.
    pose.rail = createRailRide(() => 0.5);
    pose.rail.remaining = 0;
  }
  renderer.render(pose, 12, true, locale);
  c.drawImage(landscape, 0, 350);
  // Renderer uses an opaque canvas for gameplay performance. Erasing its
  // alpha with destination-in turns the sky black in browsers. Blend the
  // poster's background over that opaque image instead.
  const blend = c.createLinearGradient(0, 350, 0, 540);
  blend.addColorStop(0, "#a1e0db"); blend.addColorStop(1, "#a1e0db00");
  c.fillStyle = blend; c.fillRect(0, 350, 720, 190);
  // A light wash gives the authored game scenery the bright poster palette.
  const wash = c.createLinearGradient(0, 430, 0, 760);
  wash.addColorStop(0, "#fff8db00"); wash.addColorStop(1, "#fff8db45");
  c.fillStyle = wash; c.fillRect(0, 430, 720, 330);
  flower(c, 64, 52);
  text(c, l("COMMUNITY SEASONS", "四季共建"), 94, 63, locale === "en" ? 23 : 30, { width: 420 });
  text(c, l("MY COMMUNITY CHALLENGE SCORE", "在社区同行挑战中，我的得分"), 50, 139, 27, { outline: true });
  text(c, number(score), 50, 335, 168, { width: 620, color: "#e76513", outline: true });
  text(c, l("A better community,", "跑过四季，"), 50, 401, 31, { outline: true });
  text(c, l("one good move at a time.", "把善意留在社区。"), 50, 441, 31, { outline: true });
  const distanceText = `${number(distance)} ${l("m travelled", "米")}`;
  const coinsText = `${number(coins)} ${l("coins", "金币")}`;
  const combined = `${distanceText}   ·   ${coinsText}`;
  c.font = `800 25px ${FONT}`;
  // Long full values get their own rows instead of becoming tiny text.
  const splitMetrics = c.measureText(combined).width > 624;
  text(c, splitMetrics ? distanceText : combined, 50, 489, 25, { outline: true });
  if (splitMetrics) text(c, coinsText, 50, 525, 25, { outline: true });
  const metricOffset = splitMetrics ? 36 : 0;
  text(c, `${l("BEST", "最佳纪录")}  ${number(best)}`, 50, 525 + metricOffset, 19, { outline: true, weight: 600, color: "#356064" });
  const seasonName = translate(locale, sceneDefinition(scene).name);
  c.fillStyle = "#fffbedee"; c.beginPath(); c.roundRect(46, 564 + metricOffset, 254, 46, 23); c.fill();
  text(c, seasonName, 65, 595 + metricOffset, 23, { width: 215 });
  if (snapshot.mode === "rail") {
    c.fillStyle = "#fffbedee"; c.beginPath(); c.roundRect(316, 564 + metricOffset, 354, 46, 23); c.fill();
    text(c, l("Community Cart", "社区小列车"), 336, 595 + metricOffset, 23, { width: 312 });
  }

  c.fillStyle = "#fffdf5"; c.fillRect(0, 760, 720, 200);
  c.fillStyle = "#d5cfae"; c.fillRect(0, 760, 720, 2);
  text(c, l("YOUR TURN TO MAKE", "和我一起，"), 48, 816, 24, { width: 405 });
  text(c, l("A GOOD MOVE.", "四季共建。"), 48, 855, 34, { width: 405 });
  text(c, qr ? l("Scan to start your journey", "扫码开启你的社区旅程") : l("Every season, a better conversation.", "每一季，都多一份善意。"), 48, 902, 20, { width: 420, weight: 600, color: "#4a7475" });
  if (qr) {
    c.fillStyle = "#fff"; c.fillRect(500, 779, 180, 166);
    c.imageSmoothingEnabled = false;
    c.drawImage(qr, 512, 782, 160, 160);
    c.imageSmoothingEnabled = true;
    // A small central badge leaves the finder patterns and quiet zone intact.
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(592, 862, 13, 0, Math.PI * 2); c.fill();
    flower(c, 592, 862, 18);
  } else {
    flower(c, 602, 835);
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed.")), "image/png"));
}
