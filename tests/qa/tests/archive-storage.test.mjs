import test from 'node:test';
import assert from 'node:assert/strict';
import { startArchivedPreview } from '../archive/browser-bootstrap.mjs';

const origin = 'http://127.0.0.1:4317';
const prefix = 'qa-archive-storage-test:';
const otherPrefix = 'qa-other-archive:';

function fixture(actualOrigin = origin) {
  class Storage {
    values = new Map();
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(String(key)) ?? null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
    clear() { this.values.clear(); }
  }
  const localStorage = new Storage(), sessionStorage = new Storage();
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem('community-seasons-progress-v1', 'player-progress');
    storage.setItem('unrelated', 'keep');
    storage.setItem(prefix + 'community-seasons-best', 'old-own-qa');
    storage.setItem(otherPrefix + 'community-seasons-best', 'other-qa');
  }
  return { Storage, localStorage, sessionStorage, location: { origin: actualOrigin } };
}

test('wrong origin preserves every save and never touches storage, initialization or the game loader', () => {
  const host = fixture('https://www.bilibili.com');
  const before = [host.localStorage, host.sessionStorage].map(store => [...store.values]);
  const guarded = { location: host.location };
  for (const key of ['Storage', 'localStorage', 'sessionStorage'])
    Object.defineProperty(guarded, key, { get() { assert.fail('Storage accessed before origin validation'); } });
  assert.throws(() => startArchivedPreview({ origin, prefix,
    initialize: () => assert.fail('Initializer ran on the wrong origin'),
    loadGame: () => assert.fail('Game loaded on the wrong origin'),
  }, guarded), /fixture origin/);
  assert.deepEqual([host.localStorage, host.sessionStorage].map(store => [...store.values]), before);
  assert.equal(host.localStorage.getItem('community-seasons-progress-v1'), 'player-progress');
});

test('allowed archive startup clears only its local prefix before initialization and isolates game storage', async () => {
  const host = fixture();
  const order = [];
  const result = startArchivedPreview({ origin, prefix,
    initialize() {
      order.push('initialize');
      assert.equal(host.localStorage.getItem('community-seasons-best'), null);
      assert.equal(host.sessionStorage.getItem('community-seasons-best'), 'old-own-qa');
      host.localStorage.setItem('community-seasons-progress-v1', 'qa-progress');
    },
    loadGame() {
      order.push('load');
      assert.equal(host.localStorage.getItem('community-seasons-progress-v1'), 'qa-progress');
      host.sessionStorage.setItem('community-seasons-progress-v1', 'qa-session');
      host.sessionStorage.clear();
      host.localStorage.setItem('community-seasons-best', 42);
      return Promise.resolve('loaded');
    },
  }, host);
  assert.equal(await result, 'loaded');
  assert.deepEqual(order, ['initialize', 'load']);
  for (const storage of [host.localStorage, host.sessionStorage]) {
    assert.equal(storage.values.get('community-seasons-progress-v1'), 'player-progress');
    assert.equal(storage.values.get('unrelated'), 'keep');
    assert.equal(storage.values.get(otherPrefix + 'community-seasons-best'), 'other-qa');
  }
  assert.equal(host.localStorage.values.get(prefix + 'community-seasons-progress-v1'), 'qa-progress');
  assert.equal(host.localStorage.values.get(prefix + 'community-seasons-best'), '42');
  assert.equal([...host.sessionStorage.values.keys()].some(key => key.startsWith(prefix)), false);
});
