import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingTargets, selectContext, selectFrame, selectTarget, validateEndpoint, validatePage, validateWebSocket } from './targets.mjs';
import { parseArgs } from './cli.mjs';

const local = validatePage('http://127.0.0.1:3030/');
const hosted = validatePage('https://www.bilibili.com/toy/preview/preview_abc123/index.html');

test('only local/LAN or isolated Toy previews are accepted', () => {
  for (const page of ['http://192.168.1.2:3030/', 'http://10.0.0.2:3030/', 'http://172.31.1.2:3030/', 'http://test-phone.local:3030/', 'http://[::1]:3030/'])
    assert.equal(validatePage(page).hosted, false);
  assert.equal(hosted.hosted, true);
  for (const page of ['https://www.bilibili.com/toy/community-seasons/index.html', 'https://evil.example/', 'https://www.bilibilitoy.com/toy/preview/preview_abc123/index.html', 'http://172.32.1.2/', 'http://user:secret@localhost:3030/', 'file:///tmp/qa/index.html', local.url.href + '#other', hosted.url.href + '?token=secret', local.url.href + '?token=secret', 'http://192.168.1.2:3030/?token=secret', 'http://test-phone.local:3030/?token=secret'])
    assert.throws(() => validatePage(page));
});

test('inspector discovery and WebSocket stay on the exact loopback endpoint', () => {
  const endpoint = validateEndpoint('http://127.0.0.1:9222');
  assert.equal(validateWebSocket('ws://127.0.0.1:9222/devtools/page/42', endpoint), 'ws://127.0.0.1:9222/devtools/page/42');
  for (const value of ['http://192.168.1.2:9222', 'http://127.0.0.1:9222/json/list', 'http://user:secret@127.0.0.1:9222', 'http://127.0.0.1:9222/?redirect=1'])
    assert.throws(() => validateEndpoint(value));
  for (const value of ['ws://evil.example:9222/page/42', 'ws://127.0.0.1:9223/page/42', 'ws://localhost:9222/page/42', 'wss://127.0.0.1:9222/page/42', 'ws://127.0.0.1:9222/page/42?token=secret'])
    assert.throws(() => validateWebSocket(value, endpoint));
});

test('target selection never falls back to another page or an ambiguous ID', () => {
  const selected = { id: 'qa', type: 'page', url: local.url.href };
  const rows = [selected, { id: 'other', type: 'page', url: 'http://127.0.0.1:3001/' }, { id: 'worker', type: 'service_worker', url: local.url.href }];
  assert.deepEqual(matchingTargets(rows, local), [selected]);
  assert.equal(selectTarget(rows, local, 'qa'), selected);
  for (const id of [undefined, 'other', 'worker']) assert.throws(() => selectTarget(rows, local, id));
  assert.throws(() => selectTarget([...rows, selected], local, 'qa'));
  assert.throws(() => matchingTargets({}, local));
});

test('standalone and Toy targets resolve only the exact game frame and default context', () => {
  const localTree = { frameTree: { frame: { id: 'main', url: local.url.href } } };
  assert.equal(selectFrame(localTree, local).id, 'main');
  const game = { frame: { id: 'game', url: 'https://www.bilibilitoy.com' + hosted.url.pathname } };
  const tree = { frameTree: { frame: { id: 'host', url: hosted.url.href }, childFrames: [game] } };
  assert.equal(selectFrame(tree, hosted).id, 'game');
  assert.throws(() => selectFrame(tree, local));
  assert.throws(() => selectFrame({ frameTree: { ...tree.frameTree, childFrames: [] } }, hosted));
  assert.throws(() => selectFrame({ frameTree: { ...tree.frameTree, childFrames: [game, game] } }, hosted));
  const contexts = [{ id: 1, auxData: { frameId: 'host', isDefault: true } }, { id: 2, auxData: { frameId: 'game', isDefault: false } }, { id: 3, auxData: { frameId: 'game', isDefault: true } }];
  assert.equal(selectContext(contexts, 'game').id, 3);
  assert.equal(selectContext([{ id: 4 }], 'game'), null);
  assert.throws(() => selectContext([...contexts, contexts[2]], 'game'));
});

test('CLI requires explicit selectors and bounded measurement duration', () => {
  const base = ['--platform', 'ios', '--endpoint', 'http://127.0.0.1:9223', '--page', local.url.href];
  assert.equal(parseArgs([...base, '--action', 'list']).action, 'list');
  assert.equal(parseArgs([...base, '--action', 'measure', '--target', '42', '--seconds', '1']).seconds, 1);
  assert.equal(parseArgs(['--help']).help, true);
  for (const args of [[], [...base, '--action', 'status'], [...base, '--action', 'list', '--target', '42'], [...base, '--action', 'status', '--target', '42', '--seconds', '1'], ...['0', '61', '1.5', 'NaN'].map(seconds => [...base, '--action', 'measure', '--target', '42', '--seconds', seconds]), [...base, '--action', 'list', '--platform', 'android']])
    assert.throws(() => parseArgs(args));
});
