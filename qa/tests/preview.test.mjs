import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPreviewBuildIsCurrent } from '../preview/build-info.mjs';

test('built preview records the current source and dependency lockfiles', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const sources = await assertPreviewBuildIsCurrent(root, fileURLToPath(new URL('../preview/dist/', import.meta.url)));
  for (const file of ['qa/preview/bootstrap.ts', 'src/main.tsx', 'package-lock.json', 'src/package-lock.json'])
    assert.match(sources[file], /^[a-f0-9]{64}$/);
});

test('general preview includes isolation and excludes the production Toy provider', () => {
  const root = new URL('../preview/dist/', import.meta.url);
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /community-seasons-qa-v1/);
  const embedded = html.match(/<script[^>]*id="community-seasons-qa-build"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'Device provenance must be embedded in the loaded HTML');
  assert.deepEqual(JSON.parse(embedded[1]), JSON.parse(fs.readFileSync(new URL('qa-build-info.json', root), 'utf8')));
  assert.doesNotMatch(html, /(?:src|href)="\//);
  const scripts = fs.readdirSync(new URL('assets/', root))
    .filter(name => name.endsWith('.js'))
    .map(name => fs.readFileSync(new URL('assets/' + name, root), 'utf8')).join('\n');
  assert.match(scripts, /qa-community-seasons-v1:/);
  assert.match(scripts, /__communitySeasonsQA/);
  assert.doesNotMatch(scripts, /toy-sdk\.js|s1\.hdslb\.com|qa-iphone-20260910/);
  assert.deepEqual(fs.readFileSync(new URL('favicon.svg', root)), fs.readFileSync(new URL('../../src/public/favicon.svg', import.meta.url)));
});
