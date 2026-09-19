import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assertFixtureHealthy, caseFailureStatus, closeMatrixResources } from '../web/matrix-shutdown.mjs';

test('actual source-change and worker-error handlers record the first stop cause and timestamp without inventing a signal', async () => {
  const source = fs.readFileSync(new URL('../web/outfit-matrix.mjs', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('outfit-matrix.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let signal;
  const handlers = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'signal') signal = node.initializer.getText(ast);
    if (ts.isCatchClause(node)) {
      const block = node.block.getText(ast);
      if (block.includes('/Source changed/')) handlers.source = block;
      if (block.includes('console.error(error.stack)')) handlers.worker = block;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(signal && handlers.source && handlers.worker, 'the actual runtime handlers must be exercised');
  for (const [kind, reason] of [['source', 'Source changed during matrix run: src/lib/game/render.ts'], ['worker', 'Cannot read matrix source']]) {
    let now = '2026-09-19T10:00:00.000Z';
    const context = vm.createContext({
      stopReason: null,
      invocation: { stopReason: null, stopRequestedAt: null, stopSignal: null },
      error: Error(reason), result: { errors: [], blockedRequests: [] }, page: null,
      caseFailureStatus, errorDetails: error => ({ name: error.name, message: error.message }),
      console: { log() {}, error() {} },
      Date: class extends Date { constructor() { super(now); } },
    });
    vm.runInContext(`const signal = ${signal};`, context);
    await vm.runInContext(`(async () => ${handlers[kind]})()`, context);
    assert.equal(context.stopReason, reason);
    assert.equal(context.invocation.stopReason, reason);
    assert.equal(context.invocation.stopRequestedAt, now, `${kind} stop skipped its request timestamp`);
    assert.equal(context.invocation.stopSignal, null, 'runtime failures must not be labeled operating-system signals');
    const firstAt = context.invocation.stopRequestedAt;
    now = '2026-09-19T10:00:10.000Z';
    context.error = Error('Source changed again during shutdown');
    await vm.runInContext(`(async () => ${handlers.source})()`, context);
    await vm.runInContext(`(async () => ${handlers.worker})()`, context);
    vm.runInContext("signal('SIGINT')", context);
    assert.equal(context.stopReason, reason);
    assert.equal(context.invocation.stopReason, reason);
    assert.equal(context.invocation.stopRequestedAt, firstAt, 'later errors/signals replaced the first cause timestamp');
    assert.equal(context.invocation.stopSignal, 'SIGINT', 'only an explicit signal should populate stopSignal');
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
