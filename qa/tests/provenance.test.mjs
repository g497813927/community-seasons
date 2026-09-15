import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_INFO_ELEMENT, readEmbeddedBuildInfo, validateBuildInfo } from '../preview/provenance.mjs';

test('the loaded page captures immutable source provenance independently of later HTML changes', () => {
  const build = { version: 1, sourceHashes: { 'src/game.ts': 'a'.repeat(64) } };
  const element = { textContent: JSON.stringify(build) };
  const captured = readEmbeddedBuildInfo({ getElementById(id) { assert.equal(id, BUILD_INFO_ELEMENT); return element; } });
  element.textContent = JSON.stringify({ version: 1, sourceHashes: { 'src/game.ts': 'b'.repeat(64) } });
  assert.equal(captured.sourceHashes['src/game.ts'], 'a'.repeat(64));
  assert.ok(Object.isFrozen(captured));
  assert.ok(Object.isFrozen(captured.sourceHashes));
  assert.throws(() => { captured.sourceHashes['src/game.ts'] = 'c'.repeat(64); }, TypeError);
  assert.equal(readEmbeddedBuildInfo({ getElementById: () => null }), null);
});

test('invalid hashes, missing files and paths outside the source record are rejected', () => {
  for (const sourceHashes of [{}, [], { 'src/game.ts': 'unknown' }, { '../game.ts': 'a'.repeat(64) }, { '/game.ts': 'a'.repeat(64) }])
    assert.throws(() => validateBuildInfo({ version: 1, sourceHashes }), /Invalid QA build/);
});
