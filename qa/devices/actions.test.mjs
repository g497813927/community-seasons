import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { QA_ID, QA_PREFIX, runAction } from './actions.mjs';
import { validatePage } from './targets.mjs';

function fixture() {
  const page = validatePage('http://127.0.0.1:3030/');
  const calls = [];
  let resets = 0;
  const state = {
    location: { href: page.url.href },
    document: { visibilityState: 'visible', hasFocus: () => true },
    navigator: { userAgent: 'Test inspector browser', userActivation: { hasBeenActive: true } },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    __communitySeasonsQA: {
      id: QA_ID, storagePrefix: QA_PREFIX, cloud: 'disabled',
      report: () => ({ metrics: { resets } }),
      resetMetrics() { resets++; return this.report(); },
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
  return { page, state, session, calls, resetCount: () => resets };
}

test('status reads only the chosen QA context, without resetting metrics or navigating', async () => {
  const f = fixture();
  const result = await runAction(f.session, f.page, 'status');
  assert.equal(result.environment.userAgent, 'Test inspector browser');
  assert.equal(f.resetCount(), 0);
  assert.equal(f.calls.some(call => /navigate|Storage|capture/.test(call.method)), false);
});

test('all page actions reject the wrong identity and cloud-enabled previews before mutation or screenshot', async () => {
  for (const action of ['status', 'measure', 'screenshot']) {
    for (const patch of [{ id: 'production' }, { storagePrefix: 'community-seasons-' }, { cloud: 'enabled' }]) {
      const f = fixture();
      Object.assign(f.state.__communitySeasonsQA, patch);
      await assert.rejects(runAction(f.session, f.page, action, { seconds: 1, wait: async () => {} }), /QA guard/);
      assert.equal(f.resetCount(), 0);
      assert.equal(f.calls.some(call => call.method === 'Page.captureScreenshot'), false);
    }
  }
});

test('measurement resets metrics once and rechecks real activation, focus and visibility throughout', async () => {
  const f = fixture();
  let waits = 0;
  const result = await runAction(f.session, f.page, 'measure', { seconds: 2, wait: async ms => { assert.equal(ms, 1000); waits++; } });
  assert.equal(waits, 2);
  assert.equal(f.resetCount(), 1);
  assert.equal(result.seconds, 2);
  assert.equal(result.qa.metrics.resets, 1);
  for (const change of [state => state.navigator.userActivation.hasBeenActive = false, state => state.document.hasFocus = () => false, state => state.document.visibilityState = 'hidden']) {
    const invalid = fixture();
    change(invalid.state);
    await assert.rejects(runAction(invalid.session, invalid.page, 'measure', { seconds: 1, wait: async () => {} }), /QA guard/);
    assert.equal(invalid.resetCount(), 0);
  }
  const hidden = fixture();
  await assert.rejects(runAction(hidden.session, hidden.page, 'measure', { seconds: 2, wait: async () => { hidden.state.document.visibilityState = 'hidden'; } }), /QA guard/);
});

test('navigation and invalid durations cannot operate on another page', async () => {
  const f = fixture();
  f.state.location.href = 'http://127.0.0.1:3001/';
  await assert.rejects(runAction(f.session, f.page, 'status'), /QA guard/);
  const untouched = fixture();
  await assert.rejects(runAction(untouched.session, untouched.page, 'measure', { seconds: 0 }), /1 to 60/);
  assert.equal(untouched.calls.length, 0);
});

test('screenshot validates QA identity before capturing the selected page', async () => {
  const f = fixture();
  const result = await runAction(f.session, f.page, 'screenshot');
  assert.equal(result.png.length, 8);
  assert.ok(f.calls.findIndex(call => call.method === 'Runtime.evaluate') < f.calls.findIndex(call => call.method === 'Page.captureScreenshot'));
  assert.equal(f.resetCount(), 0);
});
