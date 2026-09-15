import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { collectLicenses, renderNotices } from '../../src/scripts/licenses.mjs';

const app = fileURLToPath(new URL('../../src/', import.meta.url));
function fixture(t, entries, installed = entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'community-licenses-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: {} }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    '': { dependencies: {} }, ...Object.fromEntries(entries.map(e => [e.location, { version: e.version ?? '1.0.0', ...e.lock }]))
  } }));
  for (const e of installed) {
    const dir = path.join(root, e.location); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: e.name, version: e.version ?? '1.0.0', license: 'MIT', ...e.pkg }));
    for (const [file, text] of Object.entries(e.files ?? { LICENSE: 'Copyright original author\nPermission granted.\n' })) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    }
  }
  return root;
}

test('current inventory covers every installed locked package version with exact original notices', () => {
  const inventory = collectLicenses(app), lock = JSON.parse(fs.readFileSync(path.join(app, 'package-lock.json')));
  const installed = new Set();
  for (const location of Object.keys(lock.packages).filter(Boolean)) {
    const manifest = path.join(app, location, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest)); installed.add(`${pkg.name}@${pkg.version}`);
    }
  }
  assert.deepEqual(new Set(inventory.packages.map(p => `${p.name}@${p.version}`)), installed);
  assert.deepEqual(inventory.issues, []);
  for (const [name, file] of [['react', 'LICENSE'], ['lucide-react', 'LICENSE'], ['typescript', 'ThirdPartyNoticeText.txt'], ['undici', 'lib/web/fetch/LICENSE'], ['vite', 'LICENSE.md']]) {
    const original = fs.readFileSync(path.join(app, 'node_modules', name, file), 'utf8');
    assert.equal(inventory.packages.find(p => p.name === name).notices.find(n => n.file === file).text, original);
    assert.ok(renderNotices(inventory).includes(original), `${name} notice changed in downloadable text`);
  }
  const nativeBindings = inventory.packages.filter(p => p.name.startsWith('@rolldown/binding-'));
  assert.ok(nativeBindings.length > 0, 'the build platform needs a native Rolldown binding');
  for (const binding of nativeBindings) assert.equal(binding.status, 'complete');
  assert.ok(inventory.packages.find(p => p.name === 'rolldown').notices.some(n => n.file === 'upstream/THIRD-PARTY-LICENSE'));
  assert.deepEqual(collectLicenses(app), inventory, 'generation must be deterministic without timestamps');
});

test('license, copyright, nested vendor notices and CRLF/BOM content remain verbatim', t => {
  const text = '\ufeffOriginal copyright\r\nAll rights retained.\r\n';
  const root = fixture(t, [{ location: 'node_modules/example', name: 'example', files: {
    LICENSE: text, COPYRIGHT: 'A separate copyright', 'vendor/NOTICE.txt': 'Original vendor notice',
    'LICENSES/MIT.txt': 'Original MIT grant', 'src/ordinary.js': 'not a notice',
    'node_modules/unlocked/LICENSE': 'not this package',
  } }]);
  const p = collectLicenses(root).packages[0];
  assert.equal(p.notices.find(n => n.file === 'LICENSE').text, text);
  assert.deepEqual(p.notices.map(n => n.file), ['COPYRIGHT', 'LICENSE', 'LICENSES/MIT.txt', 'vendor/NOTICE.txt']);
  assert.ok(renderNotices(collectLicenses(root)).includes(text));
});

test('duplicate copies are deduplicated by name/version and retain distinct notices with production precedence', t => {
  const root = fixture(t, [
    { location: 'node_modules/example', name: 'example', lock: { dev: true }, files: { LICENSE: 'Shared' } },
    { location: 'node_modules/parent/node_modules/example', name: 'example', files: { LICENSE: 'Shared', NOTICE: 'Extra notice' } },
    { location: 'node_modules/older/node_modules/example', name: 'example', version: '0.9.0' },
  ]);
  const inventory = collectLicenses(root);
  assert.equal(inventory.packages.length, 2);
  const p = inventory.packages.find(p => p.version === '1.0.0');
  assert.equal(p.scope, 'production');
  assert.deepEqual(p.notices, [{ file: 'LICENSE', text: 'Shared' }, { file: 'NOTICE', text: 'Extra notice' }]);
});

test('absent optional platform packages are reported, while missing mandatory packages stop generation', t => {
  const optional = { location: 'node_modules/platform-binary', name: 'platform-binary', lock: { optional: true } };
  const root = fixture(t, [optional], []);
  assert.deepEqual(collectLicenses(root).omittedOptionalPackages, [{ name: 'platform-binary', version: '1.0.0' }]);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  delete lock.packages[optional.location].optional;
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => collectLicenses(root), /not installed/);
});

test('stale package versions, dependency metadata and conflicting licenses are rejected', t => {
  const root = fixture(t, [{ location: 'node_modules/example', name: 'example', pkg: { version: '2.0.0' } }]);
  assert.throws(() => collectLicenses(root), /does not match/);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }));
  assert.throws(() => collectLicenses(root), /differs from the lockfile/);
  const conflicting = fixture(t, [
    { location: 'node_modules/example', name: 'example' },
    { location: 'node_modules/parent/node_modules/example', name: 'example', pkg: { license: 'ISC' } },
  ]);
  assert.throws(() => collectLicenses(conflicting), /Conflicting licenses/);
});

test('missing text and undeclared licenses are surfaced without inventing a license grant', t => {
  const root = fixture(t, [
    { location: 'node_modules/no-text', name: 'no-text', files: {} },
    { location: 'node_modules/no-declaration', name: 'no-declaration', pkg: { license: null } },
  ]);
  const inventory = collectLicenses(root);
  assert.equal(inventory.packages.find(p => p.name === 'no-text').status, 'missing-license-text');
  assert.equal(inventory.packages.find(p => p.name === 'no-declaration').license, 'UNKNOWN');
  assert.equal(inventory.issues.length, 2);
  assert.match(renderNotices(inventory), /REVIEW REQUIRED/);
});

test('repository metadata is normalized to safe public links without changing license declarations', t => {
  const values = ['owner/project', 'git+https://github.com/owner/project.git', 'git+ssh://git@github.com/owner/project.git', 'git://git@github.com/owner/project.git'];
  const root = fixture(t, values.map((repository, i) => ({ location: `node_modules/pkg${i}`, name: `pkg${i}`, pkg: { repository } })));
  for (const pkg of collectLicenses(root).packages) assert.equal(pkg.repository, 'https://github.com/owner/project');
});

for (const version of ['1.0.1', '1.0.3']) {
  test(`Rolldown ${version} supplements use verified notices from the exact release`, t => {
    const root = fixture(t, [{ location: 'node_modules/@rolldown/binding-test', name: '@rolldown/binding-test', version,
      pkg: { repository: 'https://github.com/rolldown/rolldown' }, files: {} }]);
    fs.cpSync(path.join(app, 'scripts/license-supplements'), path.join(root, 'scripts/license-supplements'), { recursive: true });
    const notices = collectLicenses(root).packages[0].notices;
    assert.equal(notices.length, 2);
    for (const notice of notices) {
      assert.equal(notice.source, `https://raw.githubusercontent.com/rolldown/rolldown/v${version}/${path.basename(notice.file)}`);
    }
    fs.appendFileSync(path.join(root, `scripts/license-supplements/rolldown-${version}/LICENSE`), 'changed');
    assert.throws(() => collectLicenses(root), /Changed upstream license supplement/);
  });
}

for (const pkg of [
  { name: '@napi-rs/wasm-runtime', version: '1.2.3', directory: 'napi-wasm-runtime-1.2.3',
    repository: { url: 'git+https://github.com/napi-rs/napi-rs.git', directory: 'wasm-runtime' } },
  { name: '@tybys/wasm-util', version: '0.10.3', directory: 'tybys-wasm-util-0.10.3',
    repository: { url: 'git+https://github.com/toyobayashi/wasm-util.git' } },
]) {
  test(`${pkg.name} optional WASI license is original, version-specific and tamper checked`, t => {
    const root = fixture(t, [{ location: `node_modules/${pkg.name}`, name: pkg.name, version: pkg.version,
      pkg: { repository: pkg.repository }, lock: { optional: true }, files: {} }]);
    fs.cpSync(path.join(app, 'scripts/license-supplements'), path.join(root, 'scripts/license-supplements'), { recursive: true });
    const inventory = collectLicenses(root);
    assert.deepEqual(inventory.issues, []);
    assert.equal(inventory.packages[0].notices[0].text, fs.readFileSync(path.join(app, `scripts/license-supplements/${pkg.directory}/LICENSE`), 'utf8'));
    assert.match(inventory.packages[0].notices[0].source, /\/[^/]+\/[a-f0-9]{40}\/LICENSE$/);
    const manifest = path.join(root, `node_modules/${pkg.name}/package.json`);
    const original = JSON.parse(fs.readFileSync(manifest));
    fs.writeFileSync(manifest, JSON.stringify({ ...original, repository: 'https://github.com/unrelated/project' }));
    assert.throws(() => collectLicenses(root), /Review the upstream license supplement/);
    fs.writeFileSync(manifest, JSON.stringify(original));
    fs.appendFileSync(path.join(root, `scripts/license-supplements/${pkg.directory}/LICENSE`), 'changed');
    assert.throws(() => collectLicenses(root), /Changed upstream license supplement/);
  });
}

test('generated public files match the collector and prebuild/check scripts keep them current', () => {
  const inventory = collectLicenses(app);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(app, 'public/open-source-licenses.json'))), inventory);
  assert.equal(fs.readFileSync(path.join(app, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8'), renderNotices(inventory));
  const scripts = JSON.parse(fs.readFileSync(path.join(app, 'package.json'))).scripts;
  assert.match(scripts.prebuild, /licenses:generate/);
  assert.match(scripts.typecheck, /licenses:check/);
});

test('reusable CLI supports another project and output path, checks without writing, and reports stale notices', t => {
  const root = fixture(t, [{ location: 'node_modules/example', name: 'example' }]);
  const script = path.join(app, 'scripts/licenses.mjs');
  const args = ['--root', root, '--out-dir', 'review files/notices'];
  const run = (...flags) => spawnSync(process.execPath, [script, ...args, ...flags], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(run('--write').status, 0);
  const file = path.join(root, 'review files/notices/THIRD-PARTY-NOTICES.txt');
  assert.match(fs.readFileSync(file, 'utf8'), /^THIRD-PARTY NOTICES/);
  assert.ok(!fs.existsSync(path.join(root, 'public')), 'custom output should not also write public');
  const before = fs.statSync(file).mtimeMs;
  assert.equal(run('--check').status, 0);
  assert.equal(fs.statSync(file).mtimeMs, before, 'check is read only');
  fs.appendFileSync(path.join(root, 'node_modules/example/LICENSE'), 'Updated notice');
  const stale = run('--check');
  assert.equal(stale.status, 1); assert.match(stale.stderr, /stale/);
  assert.equal(fs.statSync(file).mtimeMs, before);
  assert.equal(run('--write').status, 0);
  assert.match(fs.readFileSync(file, 'utf8'), /Updated notice/);
});

test('CLI rejects invalid arguments and preserves valid output when licenses become incomplete', t => {
  const root = fixture(t, [{ location: 'node_modules/example', name: 'example' }]);
  const script = path.join(app, 'scripts/licenses.mjs');
  const run = (...flags) => spawnSync(process.execPath, [script, '--root', root, ...flags], { encoding: 'utf8' });
  assert.equal(run('--write').status, 0);
  const file = path.join(root, 'public/open-source-licenses.json'), original = fs.readFileSync(file, 'utf8');
  for (const flags of [['--write','--check'], ['--out-dir'], ['--mispelled'], ['--out-dir','one','--out-dir','two']])
    assert.equal(run(...flags).status, 1);
  fs.rmSync(path.join(root, 'node_modules/example/LICENSE'));
  const failed = run('--write');
  assert.equal(failed.status, 1); assert.match(failed.stderr, /No original license/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(help.status, 0); assert.match(help.stdout, /--root PATH/);
});

test('CLI can use bundled pinned notices for another project without changing that project', t => {
  const root = fixture(t, [{ location: 'node_modules/@rolldown/binding-test', name: '@rolldown/binding-test', version: '1.0.1',
    pkg: { repository: 'https://github.com/rolldown/rolldown' }, files: {} }]);
  const result = spawnSync(process.execPath, [path.join(app, 'scripts/licenses.mjs'), '--root', root, '--write'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'public/open-source-licenses.json'))).packages[0].notices.length, 2);
  assert.ok(!fs.existsSync(path.join(root, 'scripts')));
});
