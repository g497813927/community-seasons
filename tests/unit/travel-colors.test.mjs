import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const { travelPalette } = await import("../helpers/compiled/travel-colors.mjs");
const { createRun, update, startSceneTravel, SCENE_TRANSITION_DURATION, RAIL_RETURN_DURATION } =
  await import("../helpers/compiled/engine.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
const { railTravelFrame } = await import("../helpers/compiled/rail-transition.mjs");
const scenes = ["spring", "summer", "autumn", "winter"];
const channels = (color) => color.match(/\d+/g).map(Number);
const brightness = (rgb) => {
  const c = rgb
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
test("all season transitions blend bounded source/destination colors with no white midpoint", () => {
  for (const from of scenes)
    for (const to of scenes) {
      const start = travelPalette(from, to, 0),
        end = travelPalette(from, to, 1);
      assert.deepEqual(start, travelPalette(from, from, 0));
      assert.deepEqual(end, travelPalette(to, to, 1));
      let last = start;
      for (let i = 1; i <= 120; i++) {
        const palette = travelPalette(from, to, i / 120);
        for (const key of ["background", "edge", "accent", "panel"]) {
          const a = channels(start[key]),
            b = channels(end[key]),
            v = channels(palette[key]),
            prev = channels(last[key]);
          for (let j = 0; j < 3; j++) {
            assert.ok(v[j] >= Math.min(a[j], b[j]) && v[j] <= Math.max(a[j], b[j]));
            assert.ok(Math.abs(v[j] - prev[j]) <= 2);
          }
        }
        assert.ok(Math.max(...channels(palette.background)) < 210);
        assert.ok(
          (brightness(channels(palette.ink)) + 0.05) /
            (brightness(channels(palette.panel)) + 0.05) >
            7,
        );
        last = palette;
      }
    }
});
test("midpoint scene swap retains the original palette and pausing freezes it", () => {
  for (const from of scenes)
    for (const to of scenes.filter((v) => v !== from)) {
      const s = createRun(22, from);
      s.mode = "running";
      assert.equal(startSceneTravel(s, to), true);
      const destination = s.pendingScene;
      for(let i=0;i<49;i++) update(s, SCENE_TRANSITION_DURATION * 0.01);
      const before = travelPalette(
        s.sceneTransitionFrom,
        destination,
        1 - s.sceneTransition / SCENE_TRANSITION_DURATION,
      );
      for(let i=0;i<2;i++) update(s, SCENE_TRANSITION_DURATION * 0.01);
      assert.equal(s.scene, to);
      assert.equal(s.sceneTransitionFrom, from);
      const after = travelPalette(
        s.sceneTransitionFrom,
        destination,
        1 - s.sceneTransition / SCENE_TRANSITION_DURATION,
      );
      channels(before.background).forEach((v, i) =>
        assert.ok(Math.abs(v - channels(after.background)[i]) <= 3),
      );
      s.mode = "paused";
      update(s, 0.5);
      assert.deepEqual(
        travelPalette(
          s.sceneTransitionFrom,
          destination,
          1 - s.sceneTransition / SCENE_TRANSITION_DURATION,
        ),
        after,
      );
    }
});
test("rail entry and exit retain continuous shared color progress across geometry swaps", () => {
  for (const scene of scenes) {
    const s = Object.assign(createRun(10, scene), {
      time: 70,
      speed: 20,
      nextRailAt: 1000,
      railPreparedAt: 1000,
      distance: 1000,
    });
    const incoming = railTravelFrame(s);
    s.rail = createRailRide(() => 0.4);
    const boarded = railTravelFrame(s);
    assert.equal(incoming.progress, boarded.progress);
    assert.deepEqual(
      travelPalette(scene, scene, incoming.progress, "run", "rail"),
      travelPalette(scene, scene, boarded.progress, "run", "rail"),
    );
    s.rail.phase = "complete";
    s.rail.remaining = 0;
    const exiting = railTravelFrame(s);
    s.rail = null;
    s.railReturnRemaining = RAIL_RETURN_DURATION;
    const returned = railTravelFrame(s);
    assert.ok(Math.abs(exiting.progress - returned.progress) < 1e-12);
    assert.deepEqual(
      travelPalette(scene, scene, exiting.progress, "rail", "run"),
      travelPalette(scene, scene, returned.progress, "rail", "run"),
    );
    assert.notEqual(
      travelPalette(scene, scene, 0, "rail", "run").background,
      travelPalette(scene, scene, 1, "rail", "run").background,
    );
  }
});
