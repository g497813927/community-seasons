import test from 'node:test';
import assert from 'node:assert/strict';
import { isolateStorage, STORAGE_PREFIX } from '../preview/storage.mjs';

function fixture() {
  class Storage {
    values = new Map();
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(String(key)) ?? null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
    clear() { this.values.clear(); }
  }
  const local = new Storage(), session = new Storage();
  for (const store of [local, session]) {
    store.setItem('community-seasons-progress-v1', 'player-save');
    store.setItem('unrelated', 'keep');
  }
  isolateStorage(Storage.prototype);
  return [local, session];
}

test('QA reads, writes, removes and clears never overwrite player or unrelated saves', () => {
  for (const store of fixture()) {
    assert.equal(store.getItem('community-seasons-progress-v1'), null);
    store.setItem('community-seasons-progress-v1', 'test-save');
    assert.equal(store.getItem('community-seasons-progress-v1'), 'test-save');
    assert.equal(store.values.get('community-seasons-progress-v1'), 'player-save');
    store.removeItem('community-seasons-progress-v1');
    assert.equal(store.values.get('community-seasons-progress-v1'), 'player-save');
    store.setItem('community-seasons-best', 42);
    assert.equal(store.values.get(STORAGE_PREFIX + 'community-seasons-best'), '42');
    store.clear();
    assert.deepEqual([...store.values], [['community-seasons-progress-v1', 'player-save'], ['unrelated', 'keep']]);
  }
});

test('storage key coercion cannot bypass QA isolation', () => {
  const [store] = fixture();
  const key = { toString: () => 'community-seasons-best' };
  store.setItem(key, 13);
  assert.equal(store.getItem(key), '13');
  assert.equal(store.values.has('community-seasons-best'), false);
});
