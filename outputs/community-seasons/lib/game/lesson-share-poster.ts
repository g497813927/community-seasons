import type { Locale } from "./i18n";
import type { RailCopy } from "./railway";
import type { SceneKind } from "./scenes";

/** Authored, redacted teaching copy, captured when the player opens sharing. */
export interface LessonShareSnapshot {
  locale: Locale;
  scene: SceneKind;
  kind?: "obstacle" | "quiz";
  title: RailCopy;
  example: RailCopy;
  guidance: RailCopy;
  explanation: RailCopy;
  sourceLabel?: RailCopy;
}

export const LESSON_POSTER_WIDTH = 720;
export const LESSON_POSTER_HEIGHT = 960;
const INK = "#173f43";
const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const PALETTES = {
  spring: ["#e4efe0", "#f9d9d5"],
  summer: ["#dcefeb", "#f8e3b4"],
  autumn: ["#f5e6d4", "#edc6ad"],
  winter: ["#e2eaf3", "#d0ddeb"],
} as const;

// Exact Lucide Flower2 paths, also used by the title and score poster.
function flower(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
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

function font(c: CanvasRenderingContext2D, size: number, weight = 600) {
  c.font = `${weight} ${size}px ${FONT}`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
}

/** Preserve every word; break CJK at characters and unusually long words only as needed. */
function wrap(c: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.trim().split(/\n+/)) {
    let line = "";
    const rawTokens = paragraph.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|\s+/gu) ?? [];
    // Keep Chinese closing punctuation with the preceding token. If the pair
    // no longer fits, move both to the next line rather than hanging punctuation
    // outside the card or leaving it alone at the start of a line.
    const tokens: string[] = [];
    for (const token of rawTokens) {
      if (/^[、。，．！？：；）】》〉」』〕］｝”’]/u.test(token) && tokens.length) {
        tokens[tokens.length - 1] += token;
      } else tokens.push(token);
    }
    for (const token of tokens) {
      if (!line && /^\s+$/.test(token)) continue;
      if (c.measureText(line + token).width <= width) {
        line += token;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = token.trimStart();
      if (c.measureText(line).width > width) {
        let fragment = "";
        for (const character of line) {
          if (fragment && c.measureText(fragment + character).width > width) {
            lines.push(fragment);
            fragment = "";
          }
          fragment += character;
        }
        line = fragment;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

function line(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = INK, weight = 600) {
  font(c, size, weight);
  c.fillStyle = color;
  c.fillText(value, x, y);
}

function block(c: CanvasRenderingContext2D, lines: string[], x: number, top: number, size: number, color = INK, weight = 600) {
  lines.forEach((value, index) => line(c, value, x, top + size + index * size * 1.3, size, color, weight));
}

async function qrImage(dataUrl: string): Promise<HTMLImageElement> {
  if (dataUrl.length > 1_400_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error("Invalid QR image.");
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.onload = null; img.onerror = null;
      reject(new Error("QR image timed out."));
    }, 8000);
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

/** A self-contained lesson image. No storage, profile, live game, or SDK side effects. */
export async function createLessonSharePoster(snapshot: LessonShareSnapshot, qrDataUrl?: string): Promise<Blob> {
  const zh = snapshot.locale === "zh-CN";
  const l = (en: string, chinese: string) => zh ? chinese : en;
  const copy = (value: RailCopy) => (zh ? value.zh : value.en).trim();
  const quiz = snapshot.kind === "quiz";
  const values = [snapshot.title, quiz ? snapshot.example : snapshot.guidance, quiz ? snapshot.guidance : snapshot.example, snapshot.explanation].map(copy);
  if (values.some((value) => !value || value.length > 2000)) throw new Error("Invalid lesson copy.");
  const source = snapshot.sourceLabel ? copy(snapshot.sourceLabel) : l("Fictional teaching example · Sensitive details redacted", "虚构教学示例 · 敏感内容已遮盖");
  if (source.length > 300) throw new Error("Lesson source label is too long.");
  const qr = qrDataUrl ? await qrImage(qrDataUrl) : null;
  const canvas = document.createElement("canvas");
  canvas.width = LESSON_POSTER_WIDTH; canvas.height = LESSON_POSTER_HEIGHT;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Image rendering is unavailable.");
  const palette = PALETTES[snapshot.scene] ?? PALETTES.spring;
  c.fillStyle = palette[0]; c.fillRect(0, 0, 720, 960);
  c.fillStyle = palette[1]; c.beginPath(); c.arc(685, 20, 155, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fffdf566"; c.beginPath(); c.arc(615, 205, 83, 0, Math.PI * 2); c.fill();
  flower(c, 64, 52, 36);
  line(c, l("COMMUNITY SEASONS", "四季共建"), 94, 63, zh ? 30 : 23, INK, 800);
  if (quiz) {
    // A small railway mark and route-card heading distinguish these scenarios
    // from the response-first cards shown after hitting a post obstacle.
    c.strokeStyle = "#527b7b"; c.lineWidth = 3; c.lineCap = "round";
    c.beginPath(); c.moveTo(598, 30); c.lineTo(583, 82);
    c.moveTo(622, 30); c.lineTo(637, 82);
    for (let i = 0; i < 5; i++) {
      const y = 34 + i * 10, half = 13 + i * 3;
      c.moveTo(610 - half, y); c.lineTo(610 + half, y);
    }
    c.stroke();
  }
  line(c, quiz
    ? l("COMMUNITY CART · A QUESTION TO CONSIDER", "社区小列车 · 想一想，再作答")
    : l("SMALL CHOICES. BETTER CONVERSATIONS.", "让每一次交流，都多一份善意。"), 48, 113, 17, "#47676a");

  // Fit complete authored copy as a whole, never shorten a safety explanation
  // or crop the ending of a suggested response to force it into a template.
  let layout: { sizes: number[]; rows: string[][]; heights: number[] } | undefined;
  for (const scale of [1, 0.96, 0.92, 0.88]) {
    const sizes = (quiz ? [36, 27, 28, 24] : [36, 30, 25, 24]).map((size) => Math.round(size * scale));
    const widths = [624, 568, 568, 624];
    const rows = values.map((value, index) => {
      font(c, sizes[index], (quiz ? index === 0 || index === 2 : index < 2) ? 800 : 600);
      return wrap(c, value, widths[index]);
    });
    const heights = rows.map((items, index) => items.length * sizes[index] * 1.3);
    if (heights.reduce((sum, value) => sum + value, 0) + 222 <= 604) {
      layout = { sizes, rows, heights };
      break;
    }
  }
  if (!layout) throw new Error("Lesson copy is too long for a readable card.");
  const { sizes, rows, heights } = layout;
  let y = 139;
  block(c, rows[0], 48, y, sizes[0], INK, 800);
  y += heights[0] + 24;

  const firstHeight = heights[1] + 66;
  c.fillStyle = "#fffdf2"; c.beginPath(); c.roundRect(44, y, 632, firstHeight, 22); c.fill();
  if (quiz) {
    c.strokeStyle = "#92afa7"; c.lineWidth = 1.5; c.stroke();
    // Track sleepers sit in the card margin, separate from the full question.
    c.strokeStyle = "#72978e"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(53, y + 24); c.lineTo(53, y + firstHeight - 24);
    c.moveTo(59, y + 24); c.lineTo(59, y + firstHeight - 24);
    for (let offset = 29; offset < firstHeight - 24; offset += 12) {
      c.moveTo(51, y + offset); c.lineTo(61, y + offset);
    }
    c.stroke();
  } else {
    c.fillStyle = "#417466"; c.beginPath(); c.roundRect(44, y, 6, firstHeight, 3); c.fill();
  }
  line(c, quiz ? l("THE SCENARIO & QUESTION", "情境与问题") : l("A HELPFUL RESPONSE", "可以这样做"), 72, y + 32, 17, "#417466", 800);
  block(c, rows[1], 72, y + 43, sizes[1], INK, quiz ? 600 : 800);
  y += firstHeight + 18;

  const secondHeight = heights[2] + 62;
  c.fillStyle = quiz ? "#eaf3e8" : "#fcf1e9"; c.beginPath(); c.roundRect(44, y, 632, secondHeight, 18); c.fill();
  if (quiz) {
    c.fillStyle = "#417466"; c.beginPath(); c.roundRect(44, y, 6, secondHeight, 3); c.fill();
  }
  line(c, quiz ? l("CORRECT RESPONSE", "正确回应") : l("Learning example", "情境示例"), 72, y + 30, 17, quiz ? "#417466" : "#975442", 800);
  block(c, rows[2], 72, y + 41, sizes[2], quiz ? INK : "#633f38", quiz ? 800 : 600);
  y += secondHeight + 20;
  line(c, l("WHY IT MATTERS", "为什么要这样做"), 48, y + 17, 17, "#47676a", 800);
  block(c, rows[3], 48, y + 29, sizes[3]);

  c.fillStyle = "#fffdf5"; c.fillRect(0, 760, 720, 200);
  c.fillStyle = "#d5dace"; c.fillRect(0, 760, 720, 2);
  font(c, 16);
  const sourceRows = wrap(c, source, 408);
  if (sourceRows.length > 3) throw new Error("Lesson source label is too long for the footer.");
  block(c, sourceRows, 48, 785, 16, "#526e70");
  line(c, l("PASS ON A GOOD RESPONSE.", "把有用的回应，分享出去。"), 48, 878, 22, INK, 800);
  line(c, qr ? l("Scan to learn through play", "扫码，在游戏中学会友善交流") : l("A better community starts with us.", "更友善的社区，从我们开始。"), 48, 918, 18, "#526e70");
  if (qr) {
    c.fillStyle = "#fff"; c.fillRect(500, 779, 180, 166);
    c.imageSmoothingEnabled = false; c.drawImage(qr, 512, 782, 160, 160); c.imageSmoothingEnabled = true;
    c.fillStyle = "#fff"; c.beginPath(); c.arc(592, 862, 13, 0, Math.PI * 2); c.fill();
    flower(c, 592, 862, 18);
  } else flower(c, 592, 862, 44);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed.")), "image/png"));
}
