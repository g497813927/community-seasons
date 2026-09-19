import { Renderer } from '../../../src/lib/game/render';
import { act, createRun, update, selectRailLane, submitRailAnswer, LANE_WIDTH, RAIL_RETURN_DURATION, type RunState } from '../../../src/lib/game/engine';
import { createRailRide, beginRailQuestion, currentRailQuestion } from '../../../src/lib/game/railway';
import { createFrameMetrics } from '../preview/frame-metrics.mjs';
import { readEmbeddedBuildInfo } from '../preview/provenance.mjs';
import { MATRIX_CASES, caseById, MINIMUM_DURATION_MS, type MatrixCase } from './cases';
import { REQUIREMENTS, stageAt, type Stage } from './stages';

type Status = 'idle' | 'running' | 'passed' | 'failed' | 'interrupted';
type Bucket = Record<string, number>;
const add = (bucket: Bucket, key: string) => { bucket[key] = (bucket[key] ?? 0) + 1; };
const emptyCoverage = () => ({ stages: {} as Bucket, poses: {} as Bucket, obstacles: {} as Bucket,
  turnDirections: {} as Bucket, railPhases: {} as Bucket, transitions: {} as Bucket });
const copy = <T,>(value: T): T => structuredClone(value);

export function createMatrixController(canvas: HTMLCanvasElement, changed: () => void) {
  const build = readEmbeddedBuildInfo(document);
  let status: Status = 'idle', selected: MatrixCase | null = null, state = createRun();
  let durationMs = MINIMUM_DURATION_MS, start = 0, previous = 0, ended = 0, startedAt = 0;
  let stage: Stage = 'run', stageKey = '', stageStart = 0, motionStep = -1;
  let frames = 0, lastCheck = 0, lastPixels = 0, lastNotify = 0;
  let canvasFinite = true, pixelSamples = 0, nonBlankSamples = 0;
  let coverage = emptyCoverage(), errors: string[] = [], fiveSecondFrames: number[] = [];
  const metrics = createFrameMetrics();
  const finite = (values: unknown[], label: string) => {
    if (values.some(value => typeof value === 'number' && !Number.isFinite(value))) {
      canvasFinite = false;
      throw Error(`Non-finite ${label}`);
    }
  };
  // Validate the real Canvas2D calls, while preserving the native drawing
  // implementation and receiver. This is not a mock renderer or fake clock.
  const native = canvas.getContext('2d', { alpha: false })!;
  const methods = new Map<PropertyKey, unknown>();
  const context = new Proxy(native, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) methods.set(key, (...args: unknown[]) => {
        finite(args, `canvas.${String(key)}`);
        return value.apply(target, args);
      });
      return methods.get(key);
    },
    set(target, key, value) {
      finite([value], `canvas.${String(key)}`);
      if (key === 'globalAlpha' && (value < 0 || value > 1)) throw Error('Canvas alpha outside 0..1');
      return Reflect.set(target, key, value, target);
    },
  });
  const drawingCanvas = new Proxy(canvas, {
    get(target, key) {
      if (key === 'getContext') return () => context;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set: (target, key, value) => Reflect.set(target, key, value, target),
  });
  const renderer = new Renderer(drawingCanvas);
  renderer.resize();
  const sample = document.createElement('canvas');
  sample.width = sample.height = 32;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true })!;

  function finish(next: Status, message?: string) {
    if (message) errors.push(message.slice(0, 600));
    errors = errors.slice(-30);
    status = next;
    ended = performance.now();
    changed();
  }
  function base(): RunState {
    const run = createRun(4182, selected!.scene);
    Object.assign(run, { skin: selected!.skin, outfit: { ...selected!.outfit }, mode: 'running', time: 120,
      distance: 140, nextRow: Infinity, nextRelicAt: Infinity, nextForkAt: Infinity,
      nextRailAt: Infinity, nextPortalAt: Infinity });
    return run;
  }
  function initializeStage(id: Stage) {
    state = base();
    motionStep = -1;
    if (id === 'run') {
      const kinds = ['block', 'arch', 'pillar', 'roots'] as const;
      // The center lane is clear; authored cards still pass the real camera
      // at close range on both sides and retain the actual collision logic.
      state.obstacles = Array.from({ length: 16 }, (_, index) => ({ id: index + 1,
        kind: kinds[index % 4], lane: index % 2 ? 1 : -1,
        at: state.distance + 20 + index * 8, resolved: false }));
    } else if (id === 'fork-left' || id === 'fork-right') {
      const direction = id === 'fork-left' ? -1 : 1;
      state.distance = 450;
      state.fork = { at: 470, blockedDirection: direction === -1 ? 1 : -1 };
      state.nextForkAt = 470;
      state.lane = direction; state.x = direction * LANE_WIDTH;
    } else if (id === 'rail-approach') {
      // Start 30m out, showing the real station and its native approach veil
      // before update() enters boarding. No direct phase assignment here.
      state.nextRailAt = state.distance + 30;
    } else if (id.startsWith('rail-') && id !== 'rail-return') {
      state.rail = createRailRide(() => 0.5);
      beginRailQuestion(state.rail, () => 0.5);
      if (id === 'rail-feedback' || id === 'rail-falling') {
        const question = currentRailQuestion(state)!;
        const correctLane = state.rail.optionOrder.indexOf(question.correctIndex) - 1;
        const lane = id === 'rail-falling' ? (correctLane === -1 ? 0 : -1) : correctLane;
        selectRailLane(state, lane as -1 | 0 | 1);
        submitRailAnswer(state);
      } else if (id === 'rail-complete') {
        Object.assign(state.rail, { phase: 'complete', remaining: 2, duration: 2,
          index: state.rail.questions.length - 1, answerLane: 0, correct: true });
      }
    } else if (id === 'rail-return') state.railReturnRemaining = RAIL_RETURN_DURATION;
    else if (id === 'season') {
      state.nextPortalAt = state.distance + 30;
      state.portalLane = 0;
    }
    else if (id === 'paused') state.mode = 'paused';
  }
  function noteCoverage() {
    add(coverage.stages, stage);
    if (state.mode === 'running' && !state.rail) add(coverage.poses, 'running');
    if (state.jump > 0) add(coverage.poses, 'jump');
    if (state.slide > 0) add(coverage.poses, 'slide');
    if (Math.abs(state.x - state.lane * LANE_WIDTH) > 0.01) add(coverage.poses, 'steering');
    if (state.edgeStumble > 0) add(coverage.poses, 'recoil');
    if (state.mode === 'paused') add(coverage.poses, 'paused');
    for (const obstacle of state.obstacles) if (obstacle.at - state.distance < 138 && obstacle.at - state.distance > -7)
      add(coverage.obstacles, obstacle.kind);
    if (state.turnRemaining > 0) add(coverage.turnDirections, String(state.turnDirection));
    if (state.rail) add(coverage.railPhases, state.rail.phase);
    if (!state.rail && state.nextRailAt - state.distance <= 30 && state.nextRailAt > state.distance)
      add(coverage.transitions, 'rail-approach');
    if (state.railReturnRemaining > 0) add(coverage.transitions, 'rail-return');
    if (!state.sceneTransition && state.nextPortalAt - state.distance <= 30 && state.nextPortalAt > state.distance)
      add(coverage.transitions, 'season-approach');
    if (state.sceneTransition > 0) add(coverage.transitions, 'season');
  }
  function validateGeometry() {
    if (renderer.faces.length > 5000) throw Error(`Unbounded face count: ${renderer.faces.length}`);
    if (renderer.portalPreviews.size > 4 || renderer.railPreviews.size > 4 || renderer.sceneryTemplates.size > 48)
      throw Error('Renderer cache exceeded its bounded size');
    for (const face of renderer.faces) {
      finite([face.z, face.layer, face.opacity], 'face');
      for (const point of face.points) finite(point, 'world point');
      for (const point of renderer.clipNear(renderer.faceView(face))) finite(renderer.projectView(point), 'projection');
    }
    if (context.globalAlpha !== 1 || context.globalCompositeOperation !== 'source-over')
      throw Error('Canvas composition leaked between frames');
    if (state.skin !== selected!.skin || JSON.stringify(state.outfit) !== JSON.stringify(selected!.outfit))
      throw Error('Equipped appearance changed during the case');
  }
  function samplePixels() {
    sampleContext.drawImage(canvas, 0, 0, 32, 32);
    const pixels = sampleContext.getImageData(0, 0, 32, 32).data;
    let colored = false, varied = false;
    for (let i = 0; i < pixels.length; i += 4) {
      colored ||= !!(pixels[i] || pixels[i + 1] || pixels[i + 2]);
      varied ||= pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2];
    }
    pixelSamples++;
    if (colored && varied) nonBlankSamples++;
    else throw Error('Rendered canvas is blank or uniform');
  }
  function validateCompletion() {
    for (const group of ['stages', 'poses', 'obstacles', 'turnDirections', 'railPhases', 'transitions'] as const)
      for (const key of REQUIREMENTS[group]) if (!coverage[group][key]) throw Error(`Missing ${group} coverage: ${key}`);
    if (frames < durationMs / 1000 * 15) throw Error(`Insufficient real rendered frames: ${frames}`);
    if (pixelSamples < 25 || nonBlankSamples !== pixelSamples) throw Error('Insufficient nonblank canvas samples');
  }
  function tick(now: number) {
    requestAnimationFrame(tick);
    if (status !== 'running') return;
    try {
      if (document.visibilityState !== 'visible') throw Error('Matrix page became hidden');
      // A RAF scheduled before start() may carry the preceding frame stamp.
      if (now < previous) return;
      const gap = now - previous, elapsed = now - start;
      if (gap < 0 || gap > 1000) throw Error(`Animation frame interruption: ${gap.toFixed(1)}ms`);
      metrics.record(gap);
      previous = now;
      const active = stageAt(Math.min(elapsed, durationMs - 0.001));
      const key = `${active.cycle}:${active.id}`;
      if (key !== stageKey) {
        stageKey = key; stage = active.id; stageStart = active.start;
        initializeStage(stage);
      }
      if (stage === 'motions') {
        const actionIndex = Math.floor((elapsed - stageStart) / 1000);
        if (actionIndex !== motionStep) {
          motionStep = actionIndex;
          const actions = ['jump', 'slide', 'left', 'left', 'left', 'right', 'right', 'right', 'jump', 'slide'] as const;
          act(state, actions[Math.min(actionIndex, actions.length - 1)]);
        }
      }
      update(state, gap / 1000);
      renderer.render(state, now / 1000);
      frames++;
      const bucket = Math.min(Math.ceil(durationMs / 5000) - 1, Math.floor(elapsed / 5000));
      fiveSecondFrames[bucket] = (fiveSecondFrames[bucket] ?? 0) + 1;
      noteCoverage();
      if (elapsed - lastCheck >= 250) { validateGeometry(); lastCheck = elapsed; }
      if (elapsed - lastPixels >= 1000) { samplePixels(); lastPixels = elapsed; }
      if (elapsed >= durationMs) { validateGeometry(); validateCompletion(); finish('passed'); }
      else if (elapsed - lastNotify >= 100) { changed(); lastNotify = elapsed; }
    } catch (error) { finish('failed', error instanceof Error ? error.message : String(error)); }
  }
  requestAnimationFrame(tick);
  addEventListener('resize', () => { renderer.resize(); if (status === 'running') renderer.render(state, performance.now() / 1000); });
  addEventListener('error', event => { if (status === 'running') finish('failed', event.message); });
  addEventListener('unhandledrejection', event => { if (status === 'running') finish('failed', String(event.reason)); });
  document.addEventListener('visibilitychange', () => {
    if (status === 'running' && document.visibilityState !== 'visible') finish('failed', 'Matrix page became hidden');
  });

  function snapshot() {
    const elapsedMs = status === 'idle' ? 0 : (status === 'running' ? performance.now() : ended) - start;
    const measured = metrics.report();
    return {
      id: 'community-seasons-outfit-matrix-v1', caseId: selected?.id ?? null, status, stage,
      durationMs, elapsedMs, frames, startedAt, endedAt: ended ? startedAt + ended - start : null,
      build, errors: [...errors], coverage: copy(coverage),
      metrics: { ...measured, maxGapMs: measured.frameGapMaxMs, fiveSecondFrames: [...fiveSecondFrames] },
      canvas: { width: canvas.width, height: canvas.height, finite: canvasFinite, samples: pixelSamples, nonBlankSamples },
      environment: { visible: document.visibilityState === 'visible', focused: document.hasFocus(),
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, ua: navigator.userAgent },
      note: 'Real elapsed browser rendering of authored engine stages. Not a native-device performance measurement or an actual question-answer UI test; functional.html covers real UI flow.',
    };
  }
  const api = Object.freeze({
    id: 'community-seasons-outfit-matrix-v1', cloud: 'disabled', storage: 'unused', build,
    cases: () => copy(MATRIX_CASES), requirements: () => copy(REQUIREMENTS), snapshot,
    start(caseId: string, requestedDuration = MINIMUM_DURATION_MS) {
      if (status === 'running') throw Error('A matrix case is already running');
      if (!build) throw Error('Build this fixture before measuring it; development pages have no provenance');
      const item = caseById(caseId);
      if (!item) throw Error('Choose an exact matrix case ID');
      if (!Number.isInteger(requestedDuration) || requestedDuration < MINIMUM_DURATION_MS || requestedDuration > 3_600_000)
        throw Error('Case duration must be 60000..3600000 real milliseconds');
      selected = copy(item); durationMs = requestedDuration;
      metrics.reset(); coverage = emptyCoverage(); errors = []; fiveSecondFrames = [];
      frames = 0; canvasFinite = true; pixelSamples = nonBlankSamples = 0;
      lastCheck = lastPixels = lastNotify = 0; stageKey = ''; ended = 0;
      start = previous = performance.now(); startedAt = Date.now(); status = 'running';
      renderer.reducedMotion = false;
      changed();
      return snapshot();
    },
    stop(reason = 'Case interrupted by runner') { if (status === 'running') finish('interrupted', reason); return snapshot(); },
  });
  return { api, renderer, read: () => state };
}
