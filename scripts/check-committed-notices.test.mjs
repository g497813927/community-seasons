import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectLicenses, renderNotices } from '../src/scripts/licenses.mjs';
import { checkCommittedNotices } from './check-committed-notices.mjs';

function fixture(t, platform = 'darwin') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'community-committed-notices-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: {} }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: {} },
      'node_modules/native-darwin': { version: '1.0.0', optional: true, os: ['darwin'] },
      'node_modules/native-linux': { version: '1.0.0', optional: true, os: ['linux'] },
    },
  }));
  const directory = path.join(root, 'node_modules', `native-${platform}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: `native-${platform}`, version: '1.0.0', license: 'MIT' }));
  fs.writeFileSync(path.join(directory, 'LICENSE'), `Original ${platform} author notice.\n`);
  const inventory = collectLicenses(root);
  fs.mkdirSync(path.join(root, 'public'));
  fs.writeFileSync(path.join(root, 'public/open-source-licenses.json'), JSON.stringify(inventory, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), renderNotices(inventory));
  fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
  return root;
}

function snapshot(root) {
  return Object.fromEntries(['package-lock.json', 'public/open-source-licenses.json', 'public/THIRD-PARTY-NOTICES.txt'].map(file => {
    const absolute = path.join(root, file);
    return [file, { content: fs.readFileSync(absolute, 'utf8'), modified: fs.statSync(absolute, { bigint: true }).mtimeNs }];
  }));
}

test('macOS and Linux inventories for the same lock pass without installed dependencies or writes', t => {
  const roots = ['darwin', 'linux'].map(platform => fixture(t, platform));
  const results = roots.map(root => {
    const before = snapshot(root);
    const result = checkCommittedNotices(root);
    assert.deepEqual(snapshot(root), before);
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
    assert.equal(result.packages, 1);
    assert.equal(result.omittedOptionalPackages, 1);
    return result;
  });
  assert.equal(results[0].lockfile, results[1].lockfile);
  assert.notEqual(snapshot(roots[0])['public/open-source-licenses.json'].content, snapshot(roots[1])['public/open-source-licenses.json'].content);
});

test('a lockfile update fails before old notices can be replaced', t => {
  const root = fixture(t);
  const file = path.join(root, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(file));
  lock.packages['node_modules/native-linux'].version = '2.0.0';
  fs.writeFileSync(file, JSON.stringify(lock));
  const before = snapshot(root);
  assert.throws(() => checkCommittedNotices(root), /license inventory is stale.*licenses:generate/);
  assert.deepEqual(snapshot(root), before);
});

test('a mismatched text notice or missing provenance marker fails without writes', t => {
  const root = fixture(t);
  fs.appendFileSync(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), 'Uncommitted addition\n');
  let before = snapshot(root);
  assert.throws(() => checkCommittedNotices(root), /does not match the committed JSON inventory/);
  assert.deepEqual(snapshot(root), before);
  const file = path.join(root, 'public/open-source-licenses.json');
  const inventory = JSON.parse(fs.readFileSync(file));
  delete inventory.generatedFromLockfile;
  fs.writeFileSync(file, JSON.stringify(inventory));
  before = snapshot(root);
  assert.throws(() => checkCommittedNotices(root), /license inventory is stale/);
  assert.deepEqual(snapshot(root), before);
});
