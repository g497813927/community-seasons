import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { QA_ID, QA_PREFIX, runAction } from './actions.mjs';
import { validatePage } from './targets.mjs';

function fixture() {
  const page = validatePage('http://127.0.0.1:3030/');
  const calls = [];
  let resets = 0;
  const interruptions = { visibilityLosses: 0, pageHides: 0, focusLosses: 0 };
  const sourceHashes = { 'src/game.ts': 'a'.repeat(64), 'tests/qa/preview/bootstrap.ts': 'b'.repeat(64) };
  const state = {
    location: { href: page.url.href },
    document: { visibilityState: 'visible', hasFocus: () => true },
    navigator: { userAgent: 'Test inspector browser', userActivation: { hasBeenActive: true } },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    __communitySeasonsQA: {
      id: QA_ID, storagePrefix: QA_PREFIX, cloud: 'disabled',
      build: { version: 1, sourceHashes: { ...sourceHashes } },
      report: () => ({ metrics: { resets, interruptions: { ...interruptions } } }),
      resetMetrics() { resets++; for (const key of Object.keys(interruptions)) interruptions[key] = 0; return this.report(); },
    },
  };
  state.window = state;
  Object.defineProperty(state, 'localStorage', { get() { assert.fail('Device inspection must not read storage.'); } });
  const session = {
    async contextForFrame(id) { assert.equal(id, 'qa-frame'); return { id: 17 }; },
    async call(method, params = {}) {
      calls.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'qa-frame', url: page.url.href } } };
      if (method === 'Runtime.evaluate') {
        assert.equal(params.contextId, 17);
        try { return { result: { value: vm.runInNewContext(params.expression, state) } }; }
        catch { return { exceptionDetails: { text: 'Guard rejected' } }; }
      }
      if (method === 'Page.captureScreenshot') return { data: 'iVBORw0KGgo=' };
      return {};
    },
  };
  return { page, state, session, calls, sourceHashes, interruptions, resetCount: () => resets };
}

function runFixture(fixture, name, options = {}) {
  return runAction(fixture.session, fixture.page, name, { getSourceHashes: async () => ({ ...fixture.sourceHashes }), ...options });
}

test('status reads only the chosen QA context, without resetting metrics or navigating', async () => {
  const f = fixture();
  const result = await runFixture(f, 'status');
  assert.equal(result.environment.userAgent, 'Test inspector browser');
  assert.equal(f.resetCount(), 0);
  assert.equal(f.calls.some(call => /navigate|Storage|capture/.test(call.method)), false);
});

test('all page actions reject the wrong identity and cloud-enabled previews before mutation or screenshot', async () => {
  for (const action of ['status', 'measure', 'screenshot']) {
    for (const patch of [{ id: 'production' }, { storagePrefix: 'community-seasons-' }, { cloud: 'enabled' }]) {
      const f = fixture();
      Object.assign(f.state.__communitySeasonsQA, patch);
      await assert.rejects(runFixture(f, action, { seconds: 1, wait: async () => {} }), /QA guard/);
      assert.equal(f.resetCount(), 0);
      assert.equal(f.calls.some(call => call.method === 'Page.captureScreenshot'), false);
    }
  }
});

test('measurement resets metrics once and rechecks real activation, focus and visibility throughout', async () => {
  const f = fixture();
  let waits = 0;
  const result = await runFixture(f, 'measure', { seconds: 2, wait: async ms => { assert.equal(ms, 1000); waits++; } });
  assert.equal(waits, 2);
  assert.equal(f.resetCount(), 1);
  assert.equal(result.seconds, 2);
  assert.equal(result.qa.metrics.resets, 1);
  for (const change of [state => state.navigator.userActivation.hasBeenActive = false, state => state.document.hasFocus = () => false, state => state.document.visibilityState = 'hidden']) {
    const invalid = fixture();
    change(invalid.state);
    await assert.rejects(runFixture(invalid, 'measure', { seconds: 1, wait: async () => {} }), /QA guard/);
    assert.equal(invalid.resetCount(), 0);
  }
  const hidden = fixture();
  await assert.rejects(runFixture(hidden, 'measure', { seconds: 2, wait: async () => { hidden.state.document.visibilityState = 'hidden'; } }), /QA guard/);
});

test('navigation and invalid durations cannot operate on another page', async () => {
  const f = fixture();
  f.state.location.href = 'http://127.0.0.1:3001/';
  await assert.rejects(runFixture(f, 'status'), /QA guard/);
  const untouched = fixture();
  await assert.rejects(runFixture(untouched, 'measure', { seconds: 0 }), /1 to 60/);
  assert.equal(untouched.calls.length, 0);
});

test('measurements reject a brief interruption even when the page is active again before polling', async () => {
  for (const event of ['visibilityLosses', 'pageHides', 'focusLosses']) {
    const f = fixture();
    await assert.rejects(runFixture(f, 'measure', { seconds: 2, wait: async () => {
      f.interruptions[event]++;
      // Polling sees an active page again; the event latch must still reject it.
      assert.equal(f.state.document.visibilityState, 'visible');
      assert.equal(f.state.document.hasFocus(), true);
    } }), /measurement was interrupted/);
    assert.equal(f.resetCount(), 1);
  }
});

test('an interruption after the last timed poll is rejected by the final report', async () => {
  const f = fixture();
  const original = f.state.__communitySeasonsQA.report;
  let reports = 0;
  f.state.__communitySeasonsQA.report = () => {
    if (++reports === 4) f.interruptions.pageHides++;
    return original();
  };
  await assert.rejects(runFixture(f, 'measure', { seconds: 1, wait: async () => {} }), /measurement was interrupted/);
});

test('screenshot validates QA identity before capturing the selected page', async () => {
  const f = fixture();
  const result = await runFixture(f, 'screenshot');
  assert.equal(result.png.length, 8);
  assert.ok(f.calls.findIndex(call => call.method === 'Runtime.evaluate') < f.calls.findIndex(call => call.method === 'Page.captureScreenshot'));
  assert.equal(f.resetCount(), 0);
});

test('device measurements reject dev, malformed and stale builds before resetting metrics', async () => {
  for (const [build, status] of [
    [null, 'unbuilt'],
    [{ version: 1, sourceHashes: {} }, 'invalid'],
    [{ version: 1, sourceHashes: { 'src/game.ts': 'not-a-sha256' } }, 'invalid'],
    [{ version: 1, sourceHashes: { 'src/game.ts': 'c'.repeat(64) } }, 'stale'],
  ]) {
    const f = fixture();
    f.state.__communitySeasonsQA.build = build;
    const observed = await runFixture(f, 'status');
    assert.equal(observed.provenance.status, status);
    await assert.rejects(runFixture(f, 'measure', { seconds: 1, wait: async () => {} }), /requires current build provenance.*qa:build/);
    assert.equal(f.resetCount(), 0);
  }
});

test('device reports retain source hashes and reject local or loaded-build changes during measurement', async () => {
  const current = fixture();
  const observed = await runFixture(current, 'measure', { seconds: 1, wait: async () => {} });
  assert.equal(observed.provenance.status, 'current');
  assert.deepEqual({ ...observed.build.sourceHashes }, current.sourceHashes);

  const edited = fixture();
  await assert.rejects(runFixture(edited, 'measure', { seconds: 1, wait: async () => {
    edited.sourceHashes['src/game.ts'] = 'f'.repeat(64);
  } }), /requires current build provenance \(stale\)/);
  assert.equal(edited.resetCount(), 1);

  const reloaded = fixture();
  await assert.rejects(runFixture(reloaded, 'measure', { seconds: 1, wait: async () => {
    reloaded.state.__communitySeasonsQA.build = null;
  } }), /requires current build provenance \(unbuilt\)/);
});
