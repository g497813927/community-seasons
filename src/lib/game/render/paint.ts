import type { Renderer } from "../render";
import type { SceneKind } from "../scenes";
import type { Face, V } from "./types";
import { WORLD_STYLES } from "./styles";

export function paintFaces(renderer: Renderer, scene: SceneKind) {
  const c = renderer.ctx,
    w = renderer.w,
    h = renderer.h;
  const world = WORLD_STYLES[scene] ?? WORLD_STYLES.spring;
  // Sorting and painting share the same camera for this frame. Keep the
  // transformed vertices here so each face is transformed only once, without
  // retaining camera coordinates in reusable scenery or across frames.
  const views = new Map<Face, V[]>();
  // Road slabs cross the runner's depth. Sorting their average z with body
  // parts can paint a slab over grounded feet despite positive foot height.
  // Draw the ground first, then depth-sort every above-ground object.
  for (const face of renderer.faces) {
    const view = renderer.faceView(face);
    views.set(face, view);
    // Keep authored overlay offsets (TV vents, printed panels) while
    // changing the scene sort from road-distance to camera-distance.
    const bias =
      face.z - face.points.reduce((sum, point) => sum + point[2], 0) / face.points.length;
    face.z = view.reduce((sum, point) => sum + point[2], 0) / view.length + bias;
  }
  renderer.faces.sort((a, b) => a.layer - b.layer || b.z - a.z);
  for (const face of renderer.faces) {
    const view = views.get(face)!;
    if (face.cull && !renderer.frontFacing(view)) continue;
    const clipped = renderer.clipNear(view);
    if (clipped.length < 3) continue;
    const pts = clipped.map((p) => renderer.projectView(p));
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
        ? renderer.journeyPreview(face.journey.scene, face.journey.mode)
        : renderer.portalPreview(face.portal!);
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
}
