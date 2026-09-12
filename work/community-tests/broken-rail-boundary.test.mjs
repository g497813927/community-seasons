import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "./compile.mjs";

const { Renderer } = await import("./compiled/render.mjs");
const { createRun, LANE_WIDTH } = await import("./compiled/engine.mjs");
const { beginRailQuestion } = await import("./compiled/railway.mjs");

const TRACK_COLORS = new Set(["#73684f", "#b69a70", "#cedbd3"]);
const ORDERS = [[0, 1, 2], [1, 0, 2], [2, 1, 0]];

function state(phase, order, phaseElapsed = 0) {
  const duration = phase === "feedback" ? 1.6 : phase === "falling" ? 1.2 : phase === "complete" ? 2 : 10;
  const correctLane = order.indexOf(0) - 1;
  return Object.assign(createRun(41, "autumn"), {
    mode: "running",
    distance: 951.37,
    lane: correctLane,
    x: correctLane * LANE_WIDTH,
    rail: {
      speed: 12,
      phase,
      questions: ["respectful-disagreement", "private-address"],
      index: 0,
      remaining: duration - phaseElapsed,
      duration,
      // A separate, non-round ride clock ensures the cutoff follows this
      // gate's position rather than slab wrapping or the ride start time.
      elapsed: 25.17 + phaseElapsed,
      optionOrder: [...order],
      answerLane: phase === "question" ? null : phase !== "falling" ? correctLane : (correctLane + 2) % 3 - 1,
      correct: phase === "question" ? null : phase !== "falling",
      correctCount: phase === "feedback" ? 1 : 0,
      failure: null,
      reward: 0,
    },
  });
}

function draw(s) {
  const renderer = new Renderer({ getContext: () => ({}) });
  renderer.railTracks(s);
  return renderer.faces;
}

function laneTracks(faces, lane, color = null) {
  const center = lane * LANE_WIDTH;
  return faces.filter((face) =>
    TRACK_COLORS.has(face.color) && (!color || face.color === color) &&
    face.points.every(([x]) => Math.abs(x - center) < 0.8),
  );
}

function reachesDepth(faces, depth) {
  return faces.some((face) =>
    Math.min(...face.points.map((p) => p[2])) <= depth &&
    Math.max(...face.points.map((p) => p[2])) >= depth,
  );
}

test("every unanswered lane stays intact near the cart, midway, and at the horizon", () => {
  for (const order of ORDERS) {
    for (const elapsed of [0, 5, 9.999]) {
      const faces = draw(state("question", order, elapsed));
      for (let lane = -1; lane <= 1; lane++) {
        const rails = laneTracks(faces, lane, "#cedbd3");
        for (const depth of [0, 4, 40, 80, 130]) {
          assert.ok(reachesDepth(rails, depth), `unanswered lane ${lane} is missing at ${depth}m`);
        }
      }
      assert.equal(faces.some((face) => face.color === "#9c795e"), false, "debris hints at an answer before judgment");
    }
  }
});

test("judged wrong lanes contain no intact track anywhere beyond the moving answer gate", () => {
  for (const order of ORDERS) {
    const correctLane = order.indexOf(0) - 1;
    for (const phase of ["feedback", "falling", "complete"]) {
      for (const elapsed of [0, 0.15, 0.45, 0.7, 1.1]) {
        const gateZ = -(elapsed + (phase === "complete" ? 1.6 : 0)) * 12;
        const faces = draw(state(phase, order, elapsed));
        for (let lane = -1; lane <= 1; lane++) {
          const tracks = laneTracks(faces, lane);
          if (lane === correctLane) {
            const rails = laneTracks(faces, lane, "#cedbd3");
            for (const depth of [0, 4, 40, 80, 130]) {
              assert.ok(reachesDepth(rails, depth), `${phase}: safe lane ${lane} is missing at ${depth}m`);
            }
          } else {
            assert.ok(
              tracks.every((face) => face.points.every((p) => p[2] <= gateZ + 1e-8)),
              `${phase} ${elapsed}s: wrong lane ${lane} extends beyond gate ${gateZ}m`,
            );
            if (gateZ > -6) {
              const rails = laneTracks(faces, lane, "#cedbd3");
              assert.ok(reachesDepth(rails, gateZ - 0.1), "the intact approach rail ends prematurely before the gate");
              assert.ok(
                Math.abs(Math.max(...rails.flatMap((face) => face.points.map((p) => p[2]))) - gateZ) < 1e-8,
                "the cut snaps to a slab boundary instead of following the gate",
              );
            }
          }
        }
      }
    }
  }
});

test("broken sleepers move back with the judged gate instead of hovering at a fixed gap", () => {
  for (const phase of ["feedback", "falling"]) {
    const positions = [0, 0.25].map((elapsed) => draw(state(phase, ORDERS[1], elapsed))
      .filter((face) => face.color === "#9c795e")
      .map((face) => face.points.reduce((sum, point) => sum + point[2], 0) / face.points.length));
    assert.ok(positions[0].length > 0, "broken tracks have no visible debris");
    assert.equal(positions[0].length, positions[1].length);
    for (let i = 0; i < positions[0].length; i++) {
      assert.ok(Math.abs(positions[1][i] - positions[0][i] + 3) < 1e-8, "debris is detached from the moving gate");
    }
  }
});

test("starting the next question restores three unbiased tracks without moving the cart", () => {
  for (const order of ORDERS) {
    const s = state("feedback", order, 1.5);
    const before = { lane: s.lane, x: s.x, elapsed: s.rail.elapsed };
    s.rail.index++;
    beginRailQuestion(s.rail, () => 0.31);
    assert.equal(s.rail.phase, "question");
    assert.equal(s.rail.answerLane, null);
    assert.equal(s.rail.correct, null);
    assert.deepEqual({ lane: s.lane, x: s.x, elapsed: s.rail.elapsed }, before);
    const faces = draw(s);
    for (let lane = -1; lane <= 1; lane++) {
      const rails = laneTracks(faces, lane, "#cedbd3");
      for (const depth of [0, 40, 130]) assert.ok(reachesDepth(rails, depth));
    }
    assert.equal(faces.some((face) => face.color === "#9c795e"), false);
  }
});

test("export actual renderer poses as the right-hand safe track passes the gate", () => {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get: (target, key) => key === "createLinearGradient" || key === "createRadialGradient"
      ? () => gradient : target[key] ?? noop,
    set: (target, key, value) => (target[key] = value, true),
  });
  globalThis.window = { devicePixelRatio: 1 };
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="1560" viewBox="0 0 1560 1560"><rect width="1560" height="1560" fill="#0a2b24"/>';
  for (const [index, elapsed] of [0, 0.35, 0.8, 1.4].entries()) {
    const renderer = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 390, height: 760 }) });
    renderer.resize();
    const s = state("feedback", [2, 1, 0], elapsed);
    renderer.render(s, 0);
    svg += `<svg x="${index % 2 * 780}" y="${Math.floor(index / 2) * 780}" width="780" height="780" viewBox="0 0 390 760"><defs><clipPath id="frame-${index}"><rect width="390" height="760"/></clipPath></defs><g clip-path="url(#frame-${index})"><rect width="390" height="760" fill="#ead1aa"/><rect y="220" width="390" height="540" fill="#ae9c70"/>`;
    for (const face of renderer.faces) {
      const points = face.points.map((p) => renderer.project(p));
      svg += `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${face.color}"/>`;
      if (face.text?.value) {
        const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
        const y = points.reduce((sum, p) => sum + p[1], 0) / points.length;
        svg += `<text x="${x}" y="${y}" text-anchor="middle" fill="${face.text.color}" font-family="sans-serif" font-size="10">${face.text.value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text>`;
      }
    }
    svg += `<rect width="390" height="44" fill="#0a2b24"/><text x="195" y="28" text-anchor="middle" fill="#f0ddb5" font-family="sans-serif" font-size="16">Right track safe · ${elapsed.toFixed(2)}s after gate</text></g></svg>`;
  }
  svg += "</svg>";
  fs.writeFileSync(new URL("./broken-rail-boundary-poses.svg", import.meta.url), svg);
});
