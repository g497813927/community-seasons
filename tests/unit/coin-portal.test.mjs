import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/compile.mjs';

const { Renderer } = await import('../helpers/compiled/render.mjs');
const { createRun, LANE_WIDTH } = await import('../helpers/compiled/engine.mjs');
const { nextScene } = await import('../helpers/compiled/scenes.mjs');

globalThis.window = { devicePixelRatio: 1 };

function canvas(width = 390, height = 844, offscreen = false) {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(_, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return (...args) => {
          const stops = [];
          calls.push({ method: key, args, stops });
          return { addColorStop: (...stop) => stops.push(stop) };
        };
      }
      if (key === 'measureText') return (value) => ({ width: String(value).length * 8 });
      return target[key] ?? ((...args) => calls.push({ method: key, args, fill: target.fillStyle }));
    },
    set(_, key, value) { target[key] = value; return true; },
  });
  const surface = {
    width, height, calls,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height }),
  };
  if (!offscreen) surface.ownerDocument = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return canvas(0, 0, true);
    },
  };
  return surface;
}

function renderer() {
  const surface = canvas();
  const r = new Renderer(surface);
  r.resize();
  return { r, surface };
}

function run(scene = 'spring', lane = 0, portalDepth = 25) {
  const s = createRun(4182);
  Object.assign(s, {
    mode: 'running', time: 120, distance: 9000,
    nextRow: 1e9, nextPortalAt: 9000 + portalDepth,
    speed: 54, scene, portalLane: lane,
    pickups: [], obstacles: [], relics: [],
  });
  return s;
}

test('coins keep a stable silhouette and elevation throughout time in every lane', () => {
  for (const lane of [-1, 0, 1]) for (const height of [0.6, 1, 3.15]) {
    const captures = [];
    for (const t of [0, 0.3, 1.17, 70]) {
      const { r } = renderer();
      r.coin(lane * LANE_WIDTH, 15, t, height);
      captures.push(structuredClone(r.faces));
      assert.ok(r.faces.length > 0);
      const front = r.faces.find((face) => face.color === '#ffca63');
      assert.ok(front, 'coin retains its recognizable gold face');
      const ys = r.faces.flatMap((face) => face.points.map((point) => point[1]));
      assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - height) < 1e-10);
    }
    for (const capture of captures.slice(1)) assert.deepEqual(capture, captures[0]);
  }
});

test('coin drawing stays lightweight when all three lanes are populated', () => {
  const { r } = renderer();
  for (const lane of [-1, 0, 1]) for (let i = 0; i < 20; i++) {
    r.coin(lane * LANE_WIDTH, 5 + i * 5.5, i / 60, 1);
  }
  // The former 3D tokens generated more than 800 polygons for this route.
  // Keep the replacement comfortably below half that draw/sort workload.
  assert.ok(r.faces.length <= 240, `60 visible coins generated ${r.faces.length} faces`);
});

test('rendering preserves authored jump arcs and low slide guides, and omits collected coins', () => {
  const { r } = renderer();
  const s = run('spring', 0, 1e9);
  s.pickups = [0.6, 1, 2.3, 3.15, 2.3, 1].map((height, id) => ({
    id, lane: id % 3 - 1, at: s.distance + 8 + id * 2,
    height, taken: false,
  }));
  s.pickups.push({ id: 99, lane: 0, at: s.distance + 10, height: 1, taken: true });
  const captured = [];
  r.coin = (x, z, t, height) => captured.push({ x, z, height });
  r.render(s, 15);
  assert.deepEqual(captured, s.pickups.filter((coin) => !coin.taken).map((coin) => ({
    x: coin.lane * LANE_WIDTH, z: coin.at - s.distance, height: coin.height,
  })));
});

test('every portal previews its destination inside the correct lane and invites entry in both languages', () => {
  for (const scene of ['spring', 'summer', 'autumn', 'winter']) {
    for (const lane of [-1, 0, 1]) for (const locale of ['en', 'zh-CN']) {
      const { r, surface } = renderer();
      const s = run(scene, lane);
      r.render(s, 0, false, locale);
      const opening = r.faces.find((face) => face.portal);
      assert.ok(opening, `${scene}/${lane}/${locale}: missing destination view`);
      assert.equal(opening.portal, nextScene(scene));
      const xs = opening.points.map((point) => point[0]);
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - lane * LANE_WIDTH) < 1e-8);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 1);
      const labels = r.faces.filter((face) => face.text).map((face) => face.text.value).join(' ');
      assert.match(labels, locale === 'en' ? /enter|walk|travel/i : /进入|走入|穿过|前往/);
      assert.match(labels, locale === 'en' ? /spring|summer|autumn|winter/i : /春|夏|秋|冬/);
      const draws = surface.calls.filter((call) => call.method === 'drawImage');
      assert.equal(draws.length, 1, 'one seasonal vista appears in the gateway');
      const preview = draws[0].args[0];
      assert.ok(preview.calls.filter((call) => call.method === 'fill' || call.method === 'fillRect').length > 4,
        'destination has recognizable scenery beyond a flat blank fill');
    }
  }
});

test('destination illustrations are reused across frames instead of rebuilding a second world', () => {
  const { r, surface } = renderer();
  const pictures = new Map();
  for (const scene of ['spring', 'summer', 'autumn', 'winter']) {
    const s = run(scene);
    r.render(s, 0);
    const image = surface.calls.filter((call) => call.method === 'drawImage').at(-1).args[0];
    const commands = image.calls.length;
    r.render(s, 1);
    const again = surface.calls.filter((call) => call.method === 'drawImage').at(-1).args[0];
    assert.equal(again, image);
    assert.equal(image.calls.length, commands, 'cached illustration was unnecessarily repainted');
    pictures.set(nextScene(scene), image);
  }
  assert.equal(new Set(pictures.values()).size, 4, 'all destinations need distinct scene illustrations');
  const palettes = [...pictures.values()].map((image) => JSON.stringify(image.calls.map((call) => ({
    method: call.method, fill: call.fill, stops: call.stops,
  }))));
  assert.equal(new Set(palettes).size, 4, 'seasonal previews must visibly differ');
});

test('portal preview remains part of normal world depth sorting, behind closer obstacles and the runner', () => {
  const { r } = renderer();
  const s = run();
  s.obstacles = [
    { id: 91, lane: 0, at: s.distance + 8, kind: 'pillar', resolved: false },
    { id: 92, lane: 0, at: s.distance + 45, kind: 'pillar', resolved: false },
  ];
  r.render(s, 0);
  const portalIndex = r.faces.findIndex((face) => face.portal);
  assert.ok(portalIndex >= 0);
  const portal = r.faces[portalIndex];
  const close = r.faces.findIndex((face) => face.text?.emphasis && face.z < 10);
  const far = r.faces.findIndex((face) => face.text?.emphasis && face.z > 40);
  assert.ok(far >= 0 && far < portalIndex, 'far post must appear behind the destination view');
  assert.ok(close > portalIndex, 'near post must occlude the destination view');
  assert.equal(portal.layer, r.faces[close].layer);
  assert.ok(r.faces.slice(portalIndex + 1).some((face) => face.layer === portal.layer && face.z < 1),
    'runner remains in front of portal surface');
});
