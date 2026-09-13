import type { Renderer } from "../render";
import { LANE_WIDTH, currentRailQuestion, railSpeed, type RunState } from "../engine";

export function railTracks(renderer: Renderer, s: RunState) {
  const rail = s.rail!;
  const scroll = renderer.visualTravel(s) % 3;
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
  renderer.layer = -1;
  renderer.face(
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
      renderer.layer = 0;
      if (deckEnd > z - 1.47)
        renderer.face(
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
      renderer.layer = 0.1;
      if (sleeperEnd > z - 0.15)
        renderer.face(
          [
            [x - 0.69, 0.02, z - 0.15],
            [x + 0.69, 0.02, z - 0.15],
            [x + 0.69, 0.02, sleeperEnd],
            [x - 0.69, 0.02, sleeperEnd],
          ],
          "#b69a70",
        );
      renderer.layer = 0.2;
      for (const side of [-1, 1])
        renderer.face(
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
      renderer.layer = 0;
      // A few broken sleepers sink into the visible gap. Their bounded
      // geometry makes both rejected tracks readable without particles.
      for (let piece = 0; piece < 3; piece++) {
        const z = gateZ + 8 + piece * 6,
          y = -0.24 - drop * (0.55 + piece * 0.12);
        renderer.face(
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
  renderer.layer = 1;
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
      for (const side of [-1, 1]) renderer.box(x + side * 0.72, 1.42, z, 0.11, 2.84, 0.22, p);
      renderer.box(x, 2.83, z, 1.55, 0.55, 0.25, p);
      renderer.label(x, 2.84, z - 0.14, 1.4, 0.43, ["A", "B", "C"][lane + 1], "#fff7dc", p[0], true);
    }
  }
}

export function railExitGateway(renderer: Renderer, s: RunState) {
  const rail = s.rail!;
  renderer.layer = 1;
  // One fixed gate approaches along the existing track. The final feedback
  // includes the two-second exit leg; switching phase never replaces the
  // world, moves the gate, repairs rejected tracks, or changes the passenger.
  renderer.railGateway(
    (rail.remaining + (rail.phase === "feedback" ? 2 : 0)) * railSpeed(s),
    renderer.renderLocale,
    s.scene,
    "run",
  );
}
