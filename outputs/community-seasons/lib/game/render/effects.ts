import type { Renderer } from "../render";
import { jumpHeight, SCENE_TRANSITION_DURATION, RAIL_RETURN_DURATION, type RunState } from "../engine";
import { railTravelFrame } from "../rail-transition";
import { travelPalette } from "../travel-colors";

export function transportTunnel(
  renderer: Renderer,
  progress: number,
  alpha: number,
  palette: ReturnType<typeof travelPalette>,
) {
  const c = renderer.ctx,
    w = renderer.w,
    h = renderer.h;
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

export function drawEffects(renderer: Renderer, s: RunState, t: number) {
  const c = renderer.ctx,
    w = renderer.w,
    h = renderer.h;
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
    const [px, py] = renderer.project([s.x, 0.9 + jumpHeight(s), 0]);
    const unit = renderer.focal / 10;
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
    c.moveTo(renderer.center + h * 0.12 + i * 75, -20);
    c.lineTo(renderer.center - h * 0.35 + i * 110, h);
    c.lineTo(renderer.center - h * 0.5 + i * 110, h);
    c.lineTo(renderer.center + h * 0.05 + i * 75, -20);
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
    renderer.transportTunnel(
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
      renderer.transportTunnel(
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
