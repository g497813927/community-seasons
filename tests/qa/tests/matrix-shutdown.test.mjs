import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { changedFiles } from '../preview/build-info.mjs';
import { MATRIX_BROWSER_LAUNCH_OPTIONS, MatrixSourceChangedError, assertFixtureHealthy, caseFailureStatus, closeMatrixResources } from '../web/matrix-shutdown.mjs';

function matrixRuntimeParts() {
  const source = fs.readFileSync(new URL('../web/outfit-matrix.mjs', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('outfit-matrix.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parts = {};
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) parts[node.name.text] = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'signal') parts.signal = node.initializer.getText(ast);
    if (ts.isCatchClause(node)) {
      const block = node.block.getText(ast);
      if (block.includes('result.status = caseFailureStatus')) parts.caseHandler = block;
      if (block.includes('console.error(error.stack)')) parts.workerHandler = block;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return parts;
}

function sourceCheckContext(extra = {}) {
  return vm.createContext({
    stopReason: null, sourceCheck: null, lastSourceCheck: 0,
    invocation: { stopReason: null, stopRequestedAt: null, stopSignal: null },
    build: { sourceHashes: { 'src/lib/game/render.ts': 'before' } },
    currentHashes: async () => ({ 'src/lib/game/render.ts': 'after' }),
    changedFiles, MatrixSourceChangedError, performance: { now: () => 10000 },
    console: { log() {}, error() {} }, ...extra,
  });
}

function installSourceCheck(context, parts = matrixRuntimeParts()) {
  vm.runInContext(`const signal = ${parts.signal};\n${parts.verifySources}`, context);
}

test('actual invocation lifecycle records setup and launch failures, cleans partial resources, and persists completion', async () => {
  const source = fs.readFileSync(new URL('../web/outfit-matrix.mjs', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('outfit-matrix.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let signal, lifecycle;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'signal') signal = node.initializer.getText(ast);
    if (ts.isTryStatement(node) && node.finallyBlock?.getText(ast).includes('invocation.completedAt')) lifecycle = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(signal && lifecycle);
  for (const stage of ['checkpoint', 'bootstrap', 'listen', 'browser-launch']) {
    const failure = Error(`${stage} failed`), listeners = new Set(), saved = [], closedBrowsers = [];
    let writes = 0, errorListener, fixtureClosed = false;
    const fixture = {
      listening: false,
      once(_event, callback) { errorListener = callback; },
      listen(_port, _host, callback) {
        if (stage === 'listen') errorListener(failure);
        else { this.listening = true; callback(); }
      },
      address: () => ({ port: 12345 }), closeAllConnections() {},
      close(callback) { fixtureClosed = true; this.listening = false; callback(); },
    };
    const context = vm.createContext({
      stopReason: null, shuttingDown: false, server: undefined, origin: undefined, url: undefined,
      invocation: { stopReason: null, stopRequestedAt: null, stopSignal: null, completedAt: null },
      process: { on(name) { listeners.add(name); }, removeListener(name) { listeners.delete(name); } },
      onInterrupt() {}, onTerminate() {}, onHangup() {},
      async persist() { if (++writes === 1 && stage === 'checkpoint') throw failure; saved.push(structuredClone(context.invocation)); },
      http: { createServer() { if (stage === 'bootstrap') throw failure; return fixture; } },
      fixtureHandler() {}, DIST: '/fixture', PREFIX: '/qa/', output: '/results',
      manifest: { engines: ['chromium', 'webkit'], caseCount: 2560 }, jobs: [], options: { workers: 2, duration: 60 },
      scheduler: { limits: { chromium: 1, webkit: 1 }, take() {}, release() {} },
      browsers: new Map(), MATRIX_BROWSER_LAUNCH_OPTIONS, closeMatrixResources,
      ENGINES: Object.fromEntries(['chromium', 'webkit'].map(engine => [engine, {
        async launch() {
          if (stage === 'browser-launch' && engine === 'webkit') throw failure;
          return { on() {}, async close() { closedBrowsers.push(engine); } };
        },
      }])),
      summary: () => ({ counts: { failed: 0, interrupted: 0 } }),
      console: { log() {}, error() {} },
    });
    vm.runInContext(`const signal = ${signal};`, context);
    await assert.rejects(vm.runInContext(`(async () => { ${lifecycle} })()`, context), error => error === failure);
    const recorded = saved.at(-1);
    assert.equal(recorded.stopReason, failure.message, `${stage} lost its cause`);
    assert.ok(Number.isFinite(Date.parse(recorded.stopRequestedAt)), `${stage} lost its stop timestamp`);
    assert.equal(recorded.stopSignal, null);
    assert.ok(Number.isFinite(Date.parse(recorded.completedAt)), `${stage} skipped finalization`);
    assert.deepEqual(recorded.cleanupErrors, []);
    assert.equal(listeners.size, 0, `${stage} leaked signal handlers`);
    assert.deepEqual(closedBrowsers, stage === 'browser-launch' ? ['chromium'] : []);
    assert.equal(fixtureClosed, stage === 'browser-launch');
    assert.equal(context.process.exitCode, 1);
  }
});

test('actual checkpoint writer retries finalization after a transient initial write failure', async () => {
  const source = fs.readFileSync(new URL('../web/outfit-matrix.mjs', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('outfit-matrix.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let persist;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'persist') persist = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let writes = 0;
  const renamed = [], failure = Error('temporary write failure');
  const context = vm.createContext({
    checkpoint: {}, summary: () => ({}), progressHtml: () => 'partial results', persisted: Promise.resolve(), output: '/results',
    path: { join: (...parts) => parts.join('/') },
    fs: { async writeFile() { if (++writes === 1) throw failure; }, async rename(_temporary, final) { renamed.push(final); } },
  });
  vm.runInContext(persist, context);
  await assert.rejects(vm.runInContext('persist()', context), error => error === failure);
  await vm.runInContext('persist()', context);
  assert.deepEqual(renamed, ['/results/checkpoint.json', '/results/summary.json', '/results/progress.html']);
});

test('actual source-change and worker-error handlers record the first stop cause and timestamp without inventing a signal', async () => {
  const parts = matrixRuntimeParts();
  const handlers = { source: parts.caseHandler, worker: parts.workerHandler };
  assert.ok(parts.signal && parts.verifySources && handlers.source && handlers.worker, 'the actual runtime handlers must be exercised');
  for (const [kind, reason] of [['source', 'Source changed during matrix run: src/lib/game/render.ts'], ['worker', 'Cannot read matrix source']]) {
    let now = '2026-09-19T10:00:00.000Z';
    const context = sourceCheckContext({
      error: Error(reason), result: { errors: [], blockedRequests: [] }, page: null,
      caseFailureStatus, errorDetails: error => ({ name: error.name, message: error.message }),
      Date: class extends Date { constructor() { super(now); } },
    });
    installSourceCheck(context, parts);
    if (kind === 'source') {
      await assert.rejects(vm.runInContext('verifySources()', context), error => {
        context.error = error;
        return error instanceof MatrixSourceChangedError;
      });
    }
    await vm.runInContext(`(async () => ${handlers[kind]})()`, context);
    if (kind === 'source') {
      assert.equal(context.result.status, 'interrupted');
      assert.deepEqual(structuredClone(context.result.interruption), { reason, signal: null, requestedAt: now });
    }
    assert.equal(context.stopReason, reason);
    assert.equal(context.invocation.stopReason, reason);
    assert.equal(context.invocation.stopRequestedAt, now, `${kind} stop skipped its request timestamp`);
    assert.equal(context.invocation.stopSignal, null, 'runtime failures must not be labeled operating-system signals');
    const firstAt = context.invocation.stopRequestedAt;
    now = '2026-09-19T10:00:10.000Z';
    context.error = new MatrixSourceChangedError(['src/another-source.ts']);
    await vm.runInContext(`(async () => ${handlers.source})()`, context);
    await vm.runInContext(`(async () => ${handlers.worker})()`, context);
    vm.runInContext("signal('SIGINT')", context);
    assert.equal(context.stopReason, reason);
    assert.equal(context.invocation.stopReason, reason);
    assert.equal(context.invocation.stopRequestedAt, firstAt, 'later errors/signals replaced the first cause timestamp');
    assert.equal(context.invocation.stopSignal, 'SIGINT', 'only an explicit signal should populate stopSignal');
  }
});

test('concurrent actual source checks share an interruption and record its cause before any waiter handles it', async () => {
  let resolveHashes, reads = 0;
  const context = sourceCheckContext({
    currentHashes() { reads++; return new Promise(resolve => { resolveHashes = resolve; }); },
  });
  installSourceCheck(context);
  const pending = vm.runInContext('Promise.allSettled([verifySources(), verifySources(), verifySources(true)])', context);
  assert.equal(reads, 1, 'concurrent workers must share the pending hash read');
  resolveHashes({ 'src/lib/game/render.ts': 'after' });
  const outcomes = await pending;
  const first = outcomes[0].reason;
  assert.ok(first instanceof MatrixSourceChangedError);
  assert.equal(first.name, 'MatrixSourceChangedError');
  assert.equal(first.interrupted, true);
  assert.equal(context.stopReason, first.message);
  assert.equal(context.invocation.stopReason, first.message);
  assert.ok(Number.isFinite(Date.parse(context.invocation.stopRequestedAt)));
  assert.equal(context.invocation.stopSignal, null);
  assert.equal(context.sourceCheck, null, 'settled source checks must release the shared promise');
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason, first);
    assert.equal(caseFailureStatus(outcome.reason), 'interrupted');
  }
  assert.equal(caseFailureStatus(first, { pageErrors: [{ message: 'Browser page crashed.' }] }), 'failed');
  assert.equal(caseFailureStatus(first, { blockedRequests: [{ url: 'https://example.test' }] }), 'failed');
});

test('actual renderer and functional loops validate final health after detecting source changes and preserve unrelated failures', async () => {
  const parts = matrixRuntimeParts();
  const definition = { id: 'classic_none_none_none_spring', skin: 'classic', outfit: { hat: null, shoes: null, effect: null }, scene: 'spring' };
  for (const phase of ['renderer', 'functional']) {
    for (const condition of ['healthy', 'fixture-error', 'source-read-error']) {
      let now = 10000, reads = 0;
      const methods = [], readError = Error('Cannot read matrix source');
      const result = {}, job = { definition };
      const rendererState = {
        caseId: definition.id, status: 'running', errors: [], elapsedMs: 0, frames: 0,
        environment: { visible: true }, canvas: { finite: true, width: 1280, height: 900 }, metrics: { maxGapMs: 0 },
      };
      const functionalState = {
        ready: true, caseId: definition.id, scenario: 'season', skin: definition.skin, outfit: definition.outfit,
        environment: { visible: 'visible' }, errors: [], violations: [],
        elapsedMs: 0, distance: 0, x: 0, coins: 0, sceneTransition: 0, railReturnRemaining: 0,
        ui: { canvas: true, storeOpen: false, setupOpen: false, dialogs: [], documentOverflow: 0 },
      };
      const page = {
        async goto() {}, async waitForFunction() {},
        async evaluate(_callback, { method }) {
          methods.push(method);
          assert.ok(['prepare', 'stop'].includes(method), `unexpected functional call ${method}`);
          return { ...functionalState, violations: method === 'stop' && condition === 'fixture-error' ? ['Outfit changed during production flow.'] : [] };
        },
      };
      const context = sourceCheckContext({
        // VM literals and host fixture objects have different prototypes; compare
        // their cloned data with the same strict assertions as the actual runner.
        assert: { ...assert, deepEqual: (actual, expected, message) => assert.deepEqual(structuredClone(actual), structuredClone(expected), message) },
        assertFixtureHealthy, finite: value => typeof value === 'number' && Number.isFinite(value),
        performance: { now: () => now += 6000 }, POLICY: { pollMs: 5000, maximumFrameGapMs: 1000 },
        options: { duration: 60 }, baseCases: [definition], url: 'http://fixture.test/',
        page, job, result, wait: async () => {}, bounded: promise => promise,
        async currentHashes() {
          reads++;
          if (phase === 'functional' && reads === 1) return { 'src/lib/game/render.ts': 'before' };
          if (condition === 'source-read-error') throw readError;
          return { 'src/lib/game/render.ts': 'after' };
        },
        async rendererSnapshot(_page, method) {
          methods.push(method);
          if (method === 'cases') return [definition];
          if (method === 'requirements') return {};
          if (method === 'start') return rendererState;
          assert.equal(method, 'stop', 'source change must stop before another renderer sample');
          return {
            ...rendererState,
            status: condition === 'fixture-error' ? 'failed' : 'interrupted',
            errors: condition === 'fixture-error' ? ['Non-finite geometry'] : [context.stopReason],
          };
        },
      });
      installSourceCheck(context, parts);
      vm.runInContext(`${parts.validateSnapshot}\n${parts.runRenderer}\n${parts.runFunctional}`, context);
      let observed;
      await assert.rejects(vm.runInContext(`run${phase === 'renderer' ? 'Renderer' : 'Functional'}(page, job, result, '/unused')`, context), error => {
        observed = error;
        return true;
      });
      assert.equal(caseFailureStatus(observed), condition === 'healthy' ? 'interrupted' : 'failed', `${phase}/${condition}`);
      if (condition === 'source-read-error') {
        assert.equal(observed, readError, `${phase} must rethrow unrelated source-read errors`);
        assert.equal(context.stopReason, null);
        assert.equal(methods.includes('stop'), false);
      } else {
        assert.equal(context.stopReason, 'Source changed during matrix run: src/lib/game/render.ts');
        assert.equal(methods.at(-1), 'stop');
        const final = phase === 'renderer' ? result.renderer.final : result.functional.scenarios[0].final;
        assert.ok(final, `${phase} must capture its final fixture health`);
        if (phase === 'renderer') assert.ok(result.renderer.hostElapsedMs > 0, 'stopped renderers must retain host elapsed time even when final health fails');
        assert.equal(condition === 'healthy' ? observed.interrupted : observed.name, condition === 'healthy' ? true : 'AssertionError');
      }
    }
  }
});

test('stopping the actual renderer checks the last cadence window before classifying an interruption', async (t) => {
  const parts = matrixRuntimeParts();
  const definition = { id: 'ocean_sprout_skates_none_spring' };
  for (const scenario of [
    { name: 'source change preserves a slow final window despite a healthy overall average', trigger: 'source', elapsedMs: 10000, frames: 320, expected: 'failed' },
    { name: 'healthy source-change interruption remains interrupted', trigger: 'source', elapsedMs: 10000, frames: 600, expected: 'interrupted' },
    { name: 'a source change detected by another worker preserves a slow final window', trigger: 'peer', elapsedMs: 10000, frames: 320, expected: 'failed' },
    { name: 'an explicit stop also preserves a slow final window', trigger: 'signal', elapsedMs: 10000, frames: 320, expected: 'failed' },
    { name: 'a short final tail retains the existing three-second minimum', trigger: 'signal', elapsedMs: 7500, frames: 301, expected: 'interrupted' },
  ]) await t.test(scenario.name, async () => {
    let now = 10000, waits = 0, reads = 0, stopped;
    const initial = {
      caseId: definition.id, status: 'running', elapsedMs: 0, frames: 0, errors: [],
      environment: { visible: true }, canvas: { finite: true, width: 940, height: 900 }, metrics: { maxGapMs: 250 },
    };
    const healthy = { ...initial, elapsedMs: 5000, frames: 300 };
    const result = {};
    const context = sourceCheckContext({
      assert, assertFixtureHealthy, finite: value => typeof value === 'number' && Number.isFinite(value),
      performance: { now: () => now }, POLICY: { pollMs: 5000, maximumFrameGapMs: 1000, windowFps: 8, averageFps: 15 },
      options: { duration: 60 }, baseCases: [definition], url: 'http://fixture.test/',
      page: { async goto() {}, async waitForFunction() {} }, job: { definition }, result,
      async wait() {
        waits++;
        now += waits === 1 ? 5000 : scenario.elapsedMs - 5000;
        if (waits === 2 && scenario.trigger !== 'source') vm.runInContext(
          scenario.trigger === 'signal' ? "signal('SIGINT')" : "signal('Source changed during matrix run: src/lib/game/render.ts')", context);
        assert.ok(waits <= 2, 'the requested stop must be handled at the next loop boundary');
      },
      async currentHashes() { return { 'src/lib/game/render.ts': ++reads === 1 ? 'before' : 'after' }; },
      async rendererSnapshot(_page, method) {
        if (method === 'cases') return [definition];
        if (method === 'requirements') return {};
        if (method === 'start') return initial;
        if (method === 'snapshot') {
          assert.equal(waits, 1, 'only the first healthy poll may precede shutdown');
          return healthy;
        }
        assert.equal(method, 'stop');
        stopped = { ...initial, status: 'interrupted', elapsedMs: scenario.elapsedMs, frames: scenario.frames, errors: [context.stopReason] };
        return stopped;
      },
    });
    installSourceCheck(context, parts);
    vm.runInContext(`${parts.validateSnapshot}\n${parts.runRenderer}`, context);
    let observed;
    await assert.rejects(vm.runInContext("runRenderer(page, job, result, '/unused')", context), error => {
      observed = error;
      return true;
    });
    assert.equal(caseFailureStatus(observed, { stopSignal: context.invocation.stopSignal }), scenario.expected);
    assert.equal(result.renderer.final, stopped, 'retain stopped evidence even when its cadence fails');
    assert.equal(result.renderer.samples[0], healthy);
    assert.equal(result.renderer.hostElapsedMs, scenario.elapsedMs);
    if (scenario.expected === 'failed') {
      assert.match(observed.message, /Observed 4\.00 frames\/s in a 5000ms window; minimum 8\./);
    } else assert.equal(observed.interrupted, true);
    assert.equal(context.invocation.stopSignal, scenario.trigger === 'signal' ? 'SIGINT' : null);
    assert.equal(reads, scenario.trigger === 'source' ? 2 : 1);
  });
});

test('interrupted renderers enforce average cadence without requiring completed coverage', async (t) => {
  const parts = matrixRuntimeParts();
  const definition = { id: 'ocean_sprout_skates_none_spring' };
  for (const scenario of [
    { name: 'source change at completion retains a 10 FPS average failure', trigger: 'source', elapsedMs: 60000, fps: 10, expected: 'failed' },
    { name: 'peer stop near completion retains a 10 FPS average failure', trigger: 'peer', elapsedMs: 59900, fps: 10, expected: 'failed' },
    { name: 'signal at completion retains a 10 FPS average failure', trigger: 'signal', elapsedMs: 60000, fps: 10, expected: 'failed' },
    { name: 'a recovered final window cannot hide a low cumulative average', trigger: 'source', elapsedMs: 60000, fps: 10, recovered: true, expected: 'failed' },
    { name: 'a partial capture retains a 10 FPS average failure', trigger: 'peer', elapsedMs: 30000, fps: 10, expected: 'failed' },
    { name: 'average validation begins at three seconds', trigger: 'signal', elapsedMs: 3000, fps: 10, expected: 'failed' },
    { name: '44 frames at three seconds fails average cadence', trigger: 'signal', elapsedMs: 3000, fps: 44 / 3, expected: 'failed' },
    { name: '45 frames at three seconds remains interrupted', trigger: 'signal', elapsedMs: 3000, fps: 15, expected: 'interrupted' },
    { name: 'a sub-three-second capture remains interrupted', trigger: 'source', elapsedMs: 2999, fps: 10, expected: 'interrupted' },
    { name: 'an immediate stop remains interrupted', trigger: 'source', elapsedMs: 0, fps: 0, expected: 'interrupted' },
    { name: 'exactly 15 FPS at completion remains interrupted', trigger: 'peer', elapsedMs: 60000, fps: 15, expected: 'interrupted' },
    { name: 'a healthy partial capture does not require full duration or coverage', trigger: 'source', elapsedMs: 5000, fps: 15, expected: 'interrupted' },
  ]) await t.test(scenario.name, async () => {
    let elapsed = 0, waits = 0, stopped;
    const result = {};
    const snapshot = status => ({
      caseId: definition.id, status, elapsedMs: elapsed,
      frames: Math.floor(elapsed / 1000 * scenario.fps) + (scenario.recovered ? Math.max(0, elapsed - 55000) / 100 : 0),
      errors: status === 'interrupted' ? [context.stopReason] : [],
      environment: { visible: true }, canvas: { finite: true, width: 940, height: 900 }, metrics: { maxGapMs: 100 },
    });
    const context = sourceCheckContext({
      assert, assertFixtureHealthy, finite: Number.isFinite,
      performance: { now: () => 10000 + elapsed },
      POLICY: { pollMs: 5000, maximumFrameGapMs: 1000, windowFps: 8, averageFps: 15 },
      options: { duration: 60 }, baseCases: [definition], url: 'http://fixture.test/',
      page: { async goto() {}, async waitForFunction() {} }, job: { definition }, result,
      async wait(milliseconds) {
        assert.ok(++waits <= 12, 'shutdown must finish within the bounded capture');
        elapsed = Math.min(scenario.elapsedMs, elapsed + milliseconds);
        if (elapsed === scenario.elapsedMs && scenario.trigger !== 'source') vm.runInContext(
          scenario.trigger === 'signal' ? "signal('SIGINT')" : "signal('Source changed during matrix run: src/lib/game/render.ts')", context);
      },
      async currentHashes() { return { 'src/lib/game/render.ts': elapsed === scenario.elapsedMs ? 'after' : 'before' }; },
      async rendererSnapshot(_page, method) {
        if (method === 'cases') return [definition];
        if (method === 'requirements') return {};
        if (method === 'start' || method === 'snapshot') return snapshot('running');
        assert.equal(method, 'stop');
        // The fixture keeps its passed status if it already reached duration.
        stopped = snapshot(elapsed >= 60000 ? 'passed' : 'interrupted');
        return stopped;
      },
    });
    installSourceCheck(context, parts);
    vm.runInContext(`${parts.validateSnapshot}\n${parts.runRenderer}`, context);
    let observed;
    await assert.rejects(vm.runInContext("runRenderer(page, job, result, '/unused')", context), error => {
      observed = error;
      return true;
    });
    assert.equal(caseFailureStatus(observed, { stopSignal: context.invocation.stopSignal }), scenario.expected);
    assert.equal(result.renderer.final, stopped, 'average failures must retain the final snapshot');
    assert.equal(result.renderer.hostElapsedMs, scenario.elapsedMs);
    assert.equal(context.invocation.stopSignal, scenario.trigger === 'signal' ? 'SIGINT' : null);
    if (scenario.expected === 'failed') assert.match(observed.message, /Average cadence below 15 frames\/s\./);
    else assert.equal(observed.interrupted, true);
  });
});

test('normal final snapshots still require average cadence, duration and coverage', () => {
  const definition = { id: 'ocean_sprout_skates_none_spring' };
  const snapshot = {
    caseId: definition.id, status: 'passed', elapsedMs: 60000, frames: 900, errors: [],
    environment: { visible: true }, canvas: { finite: true, width: 940, height: 900, samples: 60, nonBlankSamples: 60 },
    metrics: { maxGapMs: 100 },
  };
  const context = vm.createContext({ assert, assertFixtureHealthy, finite: Number.isFinite,
    POLICY: { averageFps: 15, maximumFrameGapMs: 1000 }, options: { duration: 60 }, snapshot, definition });
  vm.runInContext(matrixRuntimeParts().validateSnapshot, context);
  const validate = () => vm.runInContext('validateSnapshot(snapshot, definition, { final: true })', context);
  assert.doesNotThrow(validate);
  snapshot.frames = 899;
  assert.throws(validate, /Average cadence below 15 frames\/s\./);
  snapshot.frames = 900;
  snapshot.elapsedMs = 59999;
  assert.throws(validate, /requested real duration/);
  snapshot.elapsedMs = 60000;
  snapshot.canvas.samples = 0;
  assert.throws(validate, /Too few finite\/nonblank canvas observations/);
});

test('actual renderer retains the failing snapshot and elapsed time before fixture, cadence and geometry assertions', async () => {
  const parts = matrixRuntimeParts();
  const definition = { id: 'ocean_sprout_skates_none_spring' };
  for (const failure of ['fixture', 'cadence', 'geometry']) {
    let now = 10000;
    const initial = {
      caseId: definition.id, status: 'running', elapsedMs: 0, frames: 0, errors: [],
      environment: { visible: true }, canvas: { finite: true, width: 940, height: 900 }, metrics: { maxGapMs: 0 },
    };
    const sample = {
      ...initial, elapsedMs: 5000, frames: failure === 'cadence' ? 30 : 200,
      status: failure === 'fixture' ? 'failed' : 'running',
      errors: failure === 'fixture' ? ['Animation frame interruption: 1200ms'] : [],
      canvas: { ...initial.canvas, finite: failure !== 'geometry' },
    };
    const result = {};
    const context = vm.createContext({
      assert, assertFixtureHealthy, finite: value => typeof value === 'number' && Number.isFinite(value),
      performance: { now: () => now }, POLICY: { pollMs: 5000, maximumFrameGapMs: 1000, windowFps: 8 },
      options: { duration: 60 }, baseCases: [definition], url: 'http://fixture.test/', stopReason: null,
      page: { async goto() {}, async waitForFunction() {} }, job: { definition }, result,
      async wait(milliseconds) { now += milliseconds; }, async verifySources() {},
      async rendererSnapshot(_page, method) {
        if (method === 'cases') return [definition];
        if (method === 'requirements') return {};
        if (method === 'start') return initial;
        assert.equal(method, 'snapshot');
        return sample;
      },
      MatrixSourceChangedError,
    });
    vm.runInContext(`${parts.validateSnapshot}\n${parts.runRenderer}`, context);
    let observed;
    await assert.rejects(vm.runInContext("runRenderer(page, job, result, '/unused')", context), error => {
      observed = error;
      return true;
    });
    assert.equal(result.renderer.initial, initial, `${failure}: preserve the starting observation`);
    assert.equal(result.renderer.final, sample, `${failure}: preserve the exact observation that failed validation`);
    assert.equal(result.renderer.samples.length, 1, `${failure}: append evidence before validating it`);
    assert.equal(result.renderer.samples[0], sample);
    assert.equal(result.renderer.hostElapsedMs, 5000, `${failure}: incomplete attempts still need measured host elapsed time`);
    assert.equal(caseFailureStatus(observed), 'failed');
    if (failure === 'fixture') {
      assert.match(observed.message, /Animation frame interruption: 1200ms/);
      assert.doesNotMatch(observed.message, /before interruption/, 'a regular failed poll is not an interruption request');
    } else if (failure === 'cadence') {
      assert.match(observed.message, /Observed 6\.00 frames\/s in a 5000ms window; minimum 8\./);
    } else {
      assert.match(observed.message, /Canvas geometry must remain finite/);
    }
  }
});

test('stopping preserves renderer failures observed between host polls, excluding only the explicit stop reason', () => {
  assert.doesNotThrow(() => assertFixtureHealthy({ status: 'interrupted', errors: ['SIGINT'] }, { renderer: true, interruptedBy: 'SIGINT' }));
  for (const snapshot of [
    { status: 'failed', errors: ['Non-finite geometry'] },
    { status: 'failed', errors: [] },
    { status: 'interrupted', errors: ['Non-finite geometry', 'SIGINT'] },
    { status: 'interrupted', errors: ['unexpected error'] },
  ]) {
    assert.throws(() => assertFixtureHealthy(snapshot, { renderer: true, interruptedBy: 'SIGINT' }), error => {
      assert.equal(caseFailureStatus(error, { stopSignal: 'SIGINT' }), 'failed');
      return true;
    });
  }
});

test('a functional stop snapshot with an invariant violation or App error remains a failed case', () => {
  assert.doesNotThrow(() => assertFixtureHealthy({ errors: [], violations: [] }));
  for (const snapshot of [
    { errors: [], violations: ['Outfit changed during production flow.'] },
    { errors: ['Production App exception'], violations: [] },
  ]) {
    assert.throws(() => assertFixtureHealthy(snapshot), error => {
      assert.equal(caseFailureStatus(error, { stopSignal: 'SIGTERM' }), 'failed');
      return true;
    });
  }
});

test('an explicit signal classifies closed active pages as interrupted, without masking failures', () => {
  const closed = Error('page.evaluate: Target page, context or browser has been closed');
  for (const stopSignal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    assert.equal(caseFailureStatus(closed, { stopSignal }), 'interrupted');
    assert.equal(caseFailureStatus(Object.assign(Error('bad geometry'), { name: 'AssertionError' }), { stopSignal }), 'failed');
    assert.equal(caseFailureStatus(Error('renderer timeout'), { stopSignal }), 'failed');
    assert.equal(caseFailureStatus(closed, { stopSignal, pageErrors: [{ message: 'Browser page crashed.' }] }), 'failed');
    assert.equal(caseFailureStatus(closed, { stopSignal, blockedRequests: [{ url: 'https://example.test' }] }), 'failed');
  }
  assert.equal(caseFailureStatus(closed), 'failed', 'an unexpected browser closure is still a failure');
  assert.equal(caseFailureStatus(closed, { stopSignal: 'browser process disconnected' }), 'failed');
  assert.equal(caseFailureStatus(Object.assign(Error('Interrupted by SIGINT'), { interrupted: true })), 'interrupted');
});

test('resource cleanup closes all browsers before fixture sockets and returns bounded errors', async () => {
  const calls = [];
  const browsers = new Map([
    ['chromium', { close: async () => { calls.push('chromium'); } }],
    ['webkit', { close: async () => { calls.push('webkit'); throw Error('browser close failed'); } }],
    ['stuck', { close: () => { calls.push('stuck'); return new Promise(() => {}); } }],
  ]);
  const server = {
    closeAllConnections() { calls.push('sockets'); },
    close(callback) { calls.push('server'); callback(); },
  };
  const errors = await closeMatrixResources(browsers, server, 10);
  assert.deepEqual(calls, ['chromium', 'webkit', 'stuck', 'sockets', 'server']);
  assert.deepEqual(errors.sort(), ['browser close failed', 'stuck browser close exceeded 10ms.']);
});

test('a stuck fixture server cannot prevent the final checkpoint from recording its cleanup error', async () => {
  const errors = await closeMatrixResources(new Map(), { closeAllConnections() {}, close() {} }, 10);
  assert.deepEqual(errors, ['Fixture server close exceeded 10ms.']);
});
