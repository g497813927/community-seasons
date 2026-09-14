import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('general preview includes isolation and excludes the production Toy provider', () => {
  const root = new URL('../preview/dist/', import.meta.url);
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /community-seasons-qa-v1/);
  assert.doesNotMatch(html, /(?:src|href)="\//);
  const scripts = fs.readdirSync(new URL('assets/', root))
    .filter(name => name.endsWith('.js'))
    .map(name => fs.readFileSync(new URL('assets/' + name, root), 'utf8')).join('\n');
  assert.match(scripts, /qa-community-seasons-v1:/);
  assert.match(scripts, /__communitySeasonsQA/);
  assert.doesNotMatch(scripts, /toy-sdk\.js|s1\.hdslb\.com|qa-iphone-20260910/);
  assert.deepEqual(fs.readFileSync(new URL('favicon.svg', root)), fs.readFileSync(new URL('../../src/public/favicon.svg', import.meta.url)));
});
