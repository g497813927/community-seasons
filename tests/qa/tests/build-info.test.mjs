import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPreviewBuildIsCurrent, BUILD_INFO_FILE, previewBuildInfo } from '../preview/build-info.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'community-qa-build-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dist = path.join(root, 'tests/qa/preview/dist');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(dist, { recursive: true });
  await fs.writeFile(path.join(root, 'src/game.ts'), 'export const score = 1;');
  await fs.writeFile(path.join(root, 'tests/qa/preview/bootstrap.ts'), 'import "../../../src/game";');
  await fs.writeFile(path.join(root, 'package.json'), '{"private":true}');
  await fs.writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  const watched = [];
  const assets = [];
  const context = {
    addWatchFile: file => watched.push(file),
    emitFile: asset => assets.push(asset),
  };
  async function build() {
    const plugin = previewBuildInfo(root);
    assets.length = 0;
    await plugin.buildStart.call(context);
    await plugin.generateBundle.call(context);
    for (const asset of assets) await fs.writeFile(path.join(dist, asset.fileName), asset.source);
    return plugin;
  }
  return { root, dist, watched, context, build };
}

test('build provenance accepts its source snapshot and ignores generated files', async t => {
  const fixtureState = await fixture(t);
  const { root, dist, watched, build } = fixtureState;
  const plugin = await build();
  const expected = await assertPreviewBuildIsCurrent(root, dist);
  const [embedded] = plugin.transformIndexHtml();
  assert.equal(embedded.attrs.id, 'community-seasons-qa-build');
  assert.equal(embedded.attrs.type, 'application/json');
  assert.deepEqual(JSON.parse(embedded.children), JSON.parse(await fs.readFile(path.join(dist, BUILD_INFO_FILE), 'utf8')));
  assert.deepEqual(Object.keys(expected).sort(), ['package-lock.json', 'package.json', 'src/game.ts', 'tests/qa/preview/bootstrap.ts']);
  assert.ok(watched.includes(path.join(root, 'src/game.ts')));
  await fs.writeFile(path.join(dist, 'index.html'), '<html></html>');
  await fs.mkdir(path.join(root, 'tests/qa/preview/.vite-cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'tests/qa/preview/.vite-cache/cache.json'), '{}');
  assert.deepEqual(await assertPreviewBuildIsCurrent(root, dist), expected);
});

test('changed, added, removed and lockfile inputs reject stale previews until rebuilt', async t => {
  for (const change of ['changed', 'added', 'removed', 'lockfile']) {
    const { root, dist, build } = await fixture(t);
    await build();
    if (change === 'changed') await fs.writeFile(path.join(root, 'src/game.ts'), 'export const score = 2;');
    if (change === 'added') await fs.writeFile(path.join(root, 'src/new.ts'), 'export const next = 1;');
    if (change === 'removed') await fs.unlink(path.join(root, 'src/game.ts'));
    if (change === 'lockfile') await fs.writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}');
    await assert.rejects(assertPreviewBuildIsCurrent(root, dist), /preview is stale.*qa:build/);
    await build();
    await assertPreviewBuildIsCurrent(root, dist);
  }
});

test('a missing or malformed record and edits during compilation cannot pass provenance checks', async t => {
  const { root, dist, context } = await fixture(t);
  await assert.rejects(assertPreviewBuildIsCurrent(root, dist), /no readable build-source record/);
  await fs.writeFile(path.join(dist, BUILD_INFO_FILE), '{"version":2,"sourceHashes":{}}');
  await assert.rejects(assertPreviewBuildIsCurrent(root, dist), /invalid build-source record/);
  const plugin = previewBuildInfo(root);
  await plugin.buildStart.call(context);
  await fs.writeFile(path.join(root, 'tests/qa/preview/bootstrap.ts'), 'import "../../../src/other";');
  await assert.rejects(plugin.generateBundle.call(context), /source changed during the build/);
});
