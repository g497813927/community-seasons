import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fixtureHandler, initializeBrowserEmulation, snapshotDocumentScrollStyles, licensesCloseIsComplete } from '../web/runtime.mjs';

async function request(handler, method, url) {
  const response = {};
  await handler({ method, url }, {
    writeHead(status, headers) { response.status = status; response.headers = headers; },
    end(body) { response.body = body; },
  });
  return response;
}

test('HEAD returns file status without reading content, including missing files and directories', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-web-fixture-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'index.html'), '<p>Fixture</p>');
  await fs.mkdir(path.join(directory, 'folder'));
  let reads = 0;
  const handler = fixtureHandler(directory, '/qa/', {
    stat: fs.stat,
    readFile: async file => { reads++; return fs.readFile(file); },
  });
  const head = await request(handler, 'HEAD', '/qa/');
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  for (const url of ['/qa/missing.html', '/qa/folder', '/outside.html', '/qa/..%2Foutside.html'])
    assert.equal((await request(handler, 'HEAD', url)).status, 404);
  assert.equal(reads, 0, 'No HEAD response may load file contents');
  const get = await request(handler, 'GET', '/qa/');
  assert.equal(get.status, 200);
  assert.deepEqual(get.headers, head.headers);
  assert.equal(get.body.toString(), '<p>Fixture</p>');
  assert.equal(reads, 1);
  assert.equal((await request(handler, 'POST', '/qa/')).status, 404);
});

function emulate(orientation, platform = 'ios') {
  const stored = new Map();
  const context = { window: { orientation: 0 }, screen: { orientation }, innerHeight: 844, innerWidth: 390,
    localStorage: { setItem: (key, value) => stored.set(key, value) } };
  // Exercise the same serialization boundary as context.addInitScript.
  vm.runInNewContext(`(${initializeBrowserEmulation.toString()})(${JSON.stringify({ entries: { sentinel: 'kept' }, platform })})`, context);
  assert.equal(stored.get('sentinel'), 'kept');
  return context.window.__qaBrowserEmulation;
}

test('iOS simulation can continue when its orientation angle is non-configurable', () => {
  const orientation = { type: 'portrait-primary' };
  Object.defineProperty(orientation, 'angle', { value: 90, configurable: false });
  const metadata = emulate(orientation);
  assert.equal(orientation.angle, 90);
  assert.equal(metadata.orientationAdjusted, false);
  assert.match(metadata.orientationAdjustmentError, /not configurable/);
});

test('host rejection is recorded while a supported contradictory simulation is corrected', () => {
  const restricted = Object.preventExtensions(Object.create({ type: 'portrait-primary', angle: 90 }));
  const failed = emulate(restricted);
  assert.equal(failed.orientationAdjusted, false);
  assert.match(failed.orientationAdjustmentError, /TypeError/);
  const adjustable = { type: 'portrait-primary', angle: 90 };
  const adjusted = emulate(adjustable);
  assert.equal(adjustable.angle, 0);
  assert.equal(adjusted.orientationAdjusted, true);
  assert.equal(adjusted.orientationAdjustmentError, null);
  const android = { type: 'portrait-primary', angle: 90 };
  assert.equal(emulate(android, 'android').orientationAdjusted, false);
  assert.equal(android.angle, 90);
});

test('the iOS correction survives replacement native orientation objects without masking landscape', () => {
  const nativePrototype = { get angle() { return 90; } };
  const first = Object.assign(Object.create(nativePrototype), { type: 'portrait-primary' });
  assert.equal(emulate(first).orientationAdjusted, true);
  assert.equal(first.angle, 0);
  const replacement = Object.assign(Object.create(nativePrototype), { type: 'portrait-primary' });
  assert.equal(replacement.angle, 0, 'WebKit replacement objects must keep the portrait correction');
  replacement.type = 'landscape-primary';
  assert.equal(replacement.angle, 90, 'A consistent landscape orientation must retain its native angle');
});

function closingLicensesFixture() {
  const launcher = {};
  const nodes = new Map([['.licenses-launcher', launcher]]);
  const document = {
    documentElement: { style: { overflowX: 'visible', overflowY: 'auto' } },
    body: { style: { overflowX: '', overflowY: 'scroll' } },
    activeElement: launcher,
    querySelector: selector => nodes.get(selector) ?? null,
  };
  const evaluate = (fn, argument) => vm.runInNewContext(`(${fn.toString()})(${JSON.stringify(argument)})`, { document });
  const baseline = evaluate(snapshotDocumentScrollStyles);
  return { document, launcher, nodes, baseline, complete: () => evaluate(licensesCloseIsComplete, baseline) };
}

test('detached licenses with restored focus remain incomplete until deferred iOS scrolling cleanup', () => {
  const fixture = closingLicensesFixture();
  assert.equal(fixture.complete(), true);
  fixture.document.body.style.overflowX = 'hidden';
  fixture.document.body.style.overflowY = 'hidden';
  assert.equal(fixture.complete(), false, 'Popup removal and focus return do not release the document overflow lock');
  Object.assign(fixture.document.body.style, fixture.baseline.body);
  fixture.document.documentElement.style.overflowY = 'hidden';
  assert.equal(fixture.complete(), false, 'The lock may be applied to html instead of body');
  Object.assign(fixture.document.documentElement.style, fixture.baseline.html);
  assert.equal(fixture.complete(), true, 'Actual original overflow values must be restored, including non-empty styles');
});

test('licenses cleanup also requires return focus and removal of popup, backdrop and lock marker', () => {
  const fixture = closingLicensesFixture();
  fixture.document.activeElement = {};
  assert.equal(fixture.complete(), false, 'Deferred focus return must finish before the next interaction');
  fixture.document.activeElement = fixture.launcher;
  for (const selector of ['.licenses-dialog', '[data-slot="dialog-overlay"]', '[data-base-ui-scroll-locked]']) {
    fixture.nodes.set(selector, {});
    assert.equal(fixture.complete(), false, `${selector} still blocks completed cleanup`);
    fixture.nodes.delete(selector);
  }
  assert.equal(fixture.complete(), true);
  fixture.nodes.delete('.licenses-launcher');
  fixture.document.activeElement = null;
  assert.equal(fixture.complete(), false, 'A missing return target cannot count as restored focus');
});
