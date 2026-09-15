import test from 'node:test';
import assert from 'node:assert/strict';
import { installProbe } from '../preview/probe.mjs';

function fixture() {
  let now = 100, nextFrame;
  class Storage {
    get length() { return 0; }
    key() { return null; }
    getItem() { return null; }
    setItem() {}
    removeItem() {}
  }
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible', hasFocus: () => true,
    documentElement: { lang: 'en' }, getElementById: () => null,
    querySelector: () => new EventTarget(),
  });
  const host = Object.assign(new EventTarget(), {
    document, Storage, performance: { now: () => now }, navigator: {},
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    requestAnimationFrame(callback) { nextFrame = callback; },
  });
  installProbe(host);
  return {
    host, document, qa: host.__communitySeasonsQA,
    at(time) { now = time; },
    frame(time) { now = time; nextFrame(time); },
  };
}

test('the first callback records a stall immediately after capture reset', () => {
  const f = fixture();
  f.frame(116);
  f.at(120);
  f.qa.resetMetrics();
  f.frame(420);
  const metrics = f.qa.report().metrics;
  assert.equal(metrics.elapsedMs, 300);
  assert.equal(metrics.frames, 1);
  assert.equal(metrics.frameGapMaxMs, 300);
  assert.equal(metrics.frameGapP95Ms, 300);
});

test('a queued callback timestamp before reset cannot move the capture baseline backward', () => {
  const f = fixture();
  f.at(120);
  f.qa.resetMetrics();
  f.frame(116);
  assert.equal(f.qa.report().metrics.frames, 0);
  f.frame(136);
  assert.equal(f.qa.report().metrics.frames, 1);
  assert.equal(f.qa.report().metrics.frameGapMaxMs, 16);
});

test('visibility, pagehide and focus losses remain latched after the page recovers', () => {
  const f = fixture();
  f.qa.resetMetrics();
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.host.dispatchEvent(new Event('pagehide'));
  f.host.dispatchEvent(new Event('blur'));
  f.document.visibilityState = 'visible';
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.host.dispatchEvent(new Event('pageshow'));
  f.host.dispatchEvent(new Event('focus'));
  const recovered = f.qa.report();
  assert.equal(recovered.environment.visible, true);
  assert.equal(recovered.environment.focused, true);
  assert.deepEqual(recovered.metrics.interruptions, { visibilityLosses: 1, pageHides: 1, focusLosses: 1 });
  recovered.metrics.interruptions.focusLosses = 0;
  assert.equal(f.qa.report().metrics.interruptions.focusLosses, 1, 'Exporting a report cannot clear the latch');
  assert.deepEqual(f.qa.resetMetrics().metrics.interruptions, { visibilityLosses: 0, pageHides: 0, focusLosses: 0 });
});
