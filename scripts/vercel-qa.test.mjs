import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertProtectedProject, configuration, deployQA, QA_PROJECT_NAME, readArtifact, requirePassingQA, shareAccess, shareQA } from './vercel-qa.mjs';

const config = { token: 'test-only-api-credential', projectId: 'prj_test', teamId: 'team_test', ttl: 3600 };
const secret = 'test_only_share_secret_123456';
const timestamp = Date.UTC(2026, 8, 15);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const project = { id: config.projectId, accountId: config.teamId, name: QA_PROJECT_NAME, ssoProtection: { deploymentType: 'all' }, targets: { production: { id: 'dpl_bootstrap', target: 'production', readyState: 'READY' } } };
const deployment = { id: 'dpl_test', projectId: config.projectId, target: null, url: 'community-seasons-qa-test.vercel.app', readyState: 'READY', meta: { communitySeasonsQA: 'community-seasons-qa-v1' } };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vercel-qa-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = { 'src/example.ts': 'export const game = 1;', 'qa/preview/example.mjs': 'export const qa = 1;', 'package.json': '{}', 'package-lock.json': '{}' };
  const sourceHashes = Object.fromEntries(Object.entries(source).map(([file, contents]) => [file, sha(contents)]));
  const outputs = {
    'qa/preview/dist/index.html': '<meta name="community-seasons-qa" content="community-seasons-qa-v1"><script src="./assets/qa-test.js"></script>',
    'qa/preview/dist/assets/qa-test.js': 'window.__communitySeasonsQA={id:"community-seasons-qa-v1",storagePrefix:"qa-community-seasons-v1:",cloud:"disabled"};',
    'qa/preview/dist/assets/main-test.js': 'export const fixtureGame = true;',
    'qa/preview/dist/assets/main-test.css': 'body { margin: 0; }',
    'qa/preview/dist/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>',
    'qa/preview/dist/open-source-licenses.json': JSON.stringify({ packages: [{ name: 'fixture-package', version: '1.0.0', license: 'MIT', text: 'Fixture license notice.' }] }),
    'qa/preview/dist/THIRD-PARTY-NOTICES.txt': 'fixture-package 1.0.0 — MIT\nFixture license notice.\n',
    'qa/preview/dist/qa-build-info.json': JSON.stringify({ version: 1, sourceHashes }),
  };
  for (const [file, contents] of Object.entries({ ...source, ...outputs })) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), contents);
  }
  const report = {
    requestedPlatform: 'all', status: 'passed', errors: [], changedSourceFiles: [], serverClosed: true, finishedAt: new Date(timestamp).toISOString(),
    rows: ['web', 'android', 'ios'].flatMap(platform => ['en', 'zh-CN'].map(locale => ({ platform, locale, passed: true }))),
    sourceHashes,
    distHashes: Object.fromEntries(Object.entries(outputs).map(([file, contents]) => [file, sha(contents)])),
  };
  const reportFile = path.join(root, 'results/qa/run/report.json');
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report));
  return { root, report, reportFile };
}

function apiFixture({ protection = project, ready = deployment, anonymousStatus = 401, anonymousHeaders = {}, share = { protectionBypass: { [secret]: { scope: 'shareable-link', expires: timestamp + config.ttl * 1000 } } } } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://api.vercel.com')) {
      assert.equal(options.headers.authorization, `Bearer ${config.token}`);
      assert.equal(new URL(url).searchParams.get('teamId'), config.teamId);
      assert.equal(options.redirect, 'error');
      let value;
      if (url.includes('/v9/projects/')) value = protection;
      else if (options.method === 'POST') value = { id: deployment.id };
      else if (url.includes('/protection-bypass')) value = share;
      else value = ready;
      return Response.json(value);
    }
    assert.equal(options.headers, undefined, 'bearer credentials must never be sent to a deployment');
    return new Response('', { status: anonymousStatus, headers: anonymousHeaders });
  };
  return { calls, fetchImpl, now: () => timestamp };
}

// Real temporary files, but requested chmod modes are deliberately ignored.
function privateFiles({ directoryMode = 0o700, fileMode = 0o600, failWrite = false } = {}) {
  const state = { writes: 0 };
  const fsImpl = {
    ...fs,
    async mkdtemp(prefix) {
      state.directory = await fs.mkdtemp(prefix);
      await fs.chmod(state.directory, directoryMode);
      return state.directory;
    },
    async chmod() {},
    async open(file, flags) {
      state.file = file;
      state.handle = await fs.open(file, flags, fileMode);
      await state.handle.chmod(fileMode);
      return {
        async chmod() {},
        stat: () => state.handle.stat(),
        async writeFile(data) {
          state.writes++;
          await state.handle.writeFile(data);
          if (failWrite) throw Error(data); // Must never reach an error message.
        },
        truncate: size => state.handle.truncate(size),
        close: () => state.handle.close(),
      };
    },
    async writeFile() { assert.fail('Credentials must be written through the verified handle.'); },
  };
  return { state, fsImpl };
}

test('configuration requires explicit QA identifiers, main CI ref and a bounded nonzero TTL', () => {
  const env = { VERCEL_TOKEN: config.token, VERCEL_PROJECT_ID: config.projectId, VERCEL_ORG_ID: config.teamId };
  assert.equal(configuration(env).ttl, 3600);
  assert.equal(configuration(env, ['--ttl-seconds', '82800']).ttl, 82800);
  assert.equal(configuration(env, ['share', '--deployment', deployment.id]).mode, 'share');
  assert.equal(configuration(env, ['--deploy-only']).deployOnly, true);
  assert.equal(configuration(env, ['share', '--help']).help, true);
  assert.throws(() => configuration(env, ['share', '--deployment', deployment.id, '--deploy-only']));
  assert.throws(() => configuration(env, ['--deploy-only', '--ttl-seconds', '3600']));
  for (const ttl of ['0', '59', '82801', 'Infinity', '1.5']) assert.throws(() => configuration(env, ['--ttl-seconds', ttl]));
  assert.throws(() => configuration({ ...env, VERCEL_PROJECT_ID: '' }));
  assert.throws(() => configuration({ ...env, GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/feature' }), /main/);
});

test('unknown and repeated options point to help for the selected command', () => {
  assert.throws(() => configuration({}, ['--unknown']), /npm run qa:deploy -- --help/);
  assert.throws(() => configuration({}, ['share', '--unknown']), /npm run qa:share -- --help/);
  assert.throws(() => configuration({}, ['share', '--deployment', deployment.id, '--deployment', deployment.id]), /npm run qa:share -- --help/);
});

test('project identity and All Deployments protection must match', () => {
  assert.doesNotThrow(() => assertProtectedProject(project, config));
  for (const patch of [{ id: 'prj_other' }, { accountId: 'team_other' }, { name: 'public-game' }, { ssoProtection: null }, { ssoProtection: { deploymentType: 'preview' } }])
    assert.throws(() => assertProtectedProject({ ...project, ...patch }, config));
});

test('unprotected project fails before any upload or bypass mutation', async t => {
  const f = await fixture(t), api = apiFixture({ protection: { ...project, ssoProtection: null } });
  await assert.rejects(deployQA(config, { root: f.root, ...api }), /All Deployments/);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].options.method, 'GET');
});

test('empty projects and unfinished production bootstraps fail before upload', async t => {
  const f = await fixture(t);
  for (const targets of [undefined, {}, { production: { id: 'dpl_bootstrap', target: 'production', readyState: 'BUILDING' } }, { production: { id: 'dpl_bootstrap', target: null, readyState: 'READY' } }]) {
    const api = apiFixture({ protection: { ...project, targets } });
    await assert.rejects(deployQA(config, { root: f.root, ...api }), /protected production bootstrap/);
    assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].options.method, 'GET');
  }
});

test('only the tested current static QA files are deployed as preview', async t => {
  const f = await fixture(t), api = apiFixture();
  const result = await deployQA(config, { root: f.root, ...api });
  const posted = JSON.parse(api.calls.find(call => call.options.method === 'POST').options.body);
  assert.equal(posted.project, config.projectId);
  assert.equal(posted.name, QA_PROJECT_NAME);
  for (const field of ['target', 'env', 'build', 'gitSource', 'customEnvironmentSlugOrId']) assert.equal(Object.hasOwn(posted, field), false);
  assert.deepEqual(posted.files.map(file => file.file).sort(), [
    'THIRD-PARTY-NOTICES.txt', 'assets/main-test.css', 'assets/main-test.js', 'assets/qa-test.js',
    'favicon.svg', 'index.html', 'open-source-licenses.json', 'qa-build-info.json',
  ]);
  const bypass = api.calls.find(call => call.options.method === 'PATCH');
  assert.deepEqual(JSON.parse(bypass.options.body), { ttl: 3600 });
  const access = JSON.parse(await fs.readFile(result.accessFile, 'utf8'));
  assert.equal(new URL(access.url).searchParams.get('_vercel_share'), secret);
  assert.equal((await fs.stat(result.accessFile)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(result.accessFile))).mode & 0o777, 0o700);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const safeReport = await fs.readFile(path.join(path.dirname(result.accessFile), 'deployment.json'), 'utf8');
  assert.equal(safeReport.includes(config.token), false);
  assert.equal(safeReport.includes(secret), false);
});

test('unexpected output files, symlinks and a production bundle are rejected', async t => {
  const f = await fixture(t);
  const bad = path.join(f.root, 'qa/preview/dist/.env');
  await fs.writeFile(bad, 'do not upload');
  await assert.rejects(readArtifact(f.root), /unexpected file/);
  await fs.unlink(bad);
  await fs.symlink(path.join(f.root, 'src/example.ts'), bad);
  await assert.rejects(readArtifact(f.root), /symbolic links/);
  await fs.unlink(bad);
  await fs.writeFile(path.join(f.root, 'qa/preview/dist/assets/qa-test.js'), 'window.production=true;');
  await assert.rejects(readArtifact(f.root), /isolated QA preview/);
});

test('CI deploy-only never creates an inaccessible secret, and local sharing never uploads files', async t => {
  const f = await fixture(t), deployApi = apiFixture();
  const deployed = await deployQA({ ...config, deployOnly: true }, { root: f.root, ...deployApi });
  assert.equal(deployed.accessFile, undefined);
  assert.equal(deployApi.calls.some(call => call.options.method === 'PATCH'), false);
  const shareApi = apiFixture();
  const shared = await shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, ...shareApi });
  assert.ok(shared.accessFile.endsWith('/access.json'));
  assert.equal(shareApi.calls.some(call => call.options.method === 'POST'), false);
  const otherApi = apiFixture({ ready: { ...deployment, meta: {} } });
  await assert.rejects(shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, ...otherApi }), /created by/);
  assert.equal(otherApi.calls.some(call => call.options.method === 'PATCH'), false);
});

test('both share entry points reject ignored private modes before minting or writing a credential', async t => {
  for (const mode of [{ directoryMode: 0o755 }, { fileMode: 0o644 }, { fileMode: 0o660 }]) {
    for (const operation of [deployQA, shareQA]) {
      const f = await fixture(t), api = apiFixture(), files = privateFiles(mode);
      await assert.rejects(operation({ ...config, deploymentId: deployment.id }, { root: f.root, ...api, fsImpl: files.fsImpl }), /private file preparation/);
      assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
      assert.equal(files.state.writes, 0);
      if (files.state.handle) assert.equal(files.state.handle.fd, -1);
      await assert.rejects(fs.stat(files.state.directory), { code: 'ENOENT' });
    }
  }
});

test('an empty private file is verified before minting and the same handle writes the credential', async t => {
  const f = await fixture(t), api = apiFixture(), files = privateFiles();
  const fetchImpl = async (url, options) => {
    if (options?.method === 'PATCH') {
      assert.equal((await files.state.handle.stat()).mode & 0o777, 0o600);
      assert.equal((await fs.stat(files.state.directory)).mode & 0o777, 0o700);
      assert.equal(await fs.readFile(files.state.file, 'utf8'), '');
    }
    return api.fetchImpl(url, options);
  };
  const result = await shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, now: api.now, fetchImpl, fsImpl: files.fsImpl });
  assert.equal(files.state.writes, 1);
  assert.equal(files.state.handle.fd, -1);
  assert.equal(new URL(JSON.parse(await fs.readFile(result.accessFile, 'utf8')).url).searchParams.get('_vercel_share'), secret);
  const again = await shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, ...api });
  assert.notEqual(again.directory, result.directory, 'Identical timestamps must still create unique directories.');
});

test('a pre-existing access-file collision is neither changed nor deleted', async t => {
  const f = await fixture(t), api = apiFixture();
  let collision;
  const fsImpl = { ...fs, async open(file, flags, mode) {
    collision = file;
    await fs.writeFile(file, 'preserve-existing-file', { flag: 'wx', mode: 0o644 });
    return fs.open(file, flags, mode);
  } };
  await assert.rejects(shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, ...api, fsImpl }), /private file preparation/);
  assert.equal(await fs.readFile(collision, 'utf8'), 'preserve-existing-file');
  assert.equal((await fs.stat(collision)).mode & 0o777, 0o644);
  assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
});

test('request failure, changed permissions and write failure close and remove only the new private file', async t => {
  for (const failure of ['request', 'permissions', 'write']) {
    const f = await fixture(t), api = apiFixture(), files = privateFiles({ failWrite: failure === 'write' });
    const fetchImpl = async (url, options) => {
      if (options?.method === 'PATCH') {
        if (failure === 'request') throw Error(secret);
        if (failure === 'permissions') await files.state.handle.chmod(0o644);
      }
      return api.fetchImpl(url, options);
    };
    await assert.rejects(shareQA({ ...config, deploymentId: deployment.id }, { root: f.root, now: api.now, fetchImpl, fsImpl: files.fsImpl }), error =>
      /QA sharing failed/.test(error.message) && !error.message.includes(secret) && !error.message.includes(config.token));
    assert.equal(files.state.writes, failure === 'write' ? 1 : 0);
    assert.equal(files.state.handle.fd, -1);
    await assert.rejects(fs.stat(files.state.file), { code: 'ENOENT' });
    await assert.rejects(fs.stat(files.state.directory), { code: 'ENOENT' });
  }
});

test('Windows sharing rejects before minting while deploy-only needs no private-file support', async t => {
  const f = await fixture(t);
  for (const operation of [shareQA, deployQA]) {
    const api = apiFixture();
    await assert.rejects(operation({ ...config, deploymentId: deployment.id }, { root: f.root, ...api, platform: 'win32', fsImpl: {} }), /POSIX permissions/);
    assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
  }
  const api = apiFixture();
  const result = await deployQA({ ...config, deployOnly: true }, { root: f.root, ...api, platform: 'win32', fsImpl: {} });
  assert.equal(result.accessFile, undefined);
  assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
});

test('stale source, changed assets, partial scenarios and failed QA prevent upload', async t => {
  const f = await fixture(t), artifact = await readArtifact(f.root);
  assert.ok(await requirePassingQA(f.root, artifact));
  for (const patch of [{ status: 'failed' }, { rows: f.report.rows.slice(0, 2) }, { distHashes: {} }, { sourceHashes: {} }]) {
    await fs.writeFile(f.reportFile, JSON.stringify({ ...f.report, ...patch }));
    await assert.rejects(requirePassingQA(f.root, artifact), /No passing/);
  }
  await fs.writeFile(f.reportFile, JSON.stringify(f.report));
  await fs.writeFile(path.join(f.root, 'src/example.ts'), 'changed after QA');
  await assert.rejects(requirePassingQA(f.root, artifact), /provenance/);
});

test('wrong project, production target or anonymous success never creates a share link', async t => {
  const f = await fixture(t);
  for (const options of [{ ready: { ...deployment, projectId: 'prj_other' } }, { ready: { ...deployment, target: 'production' } }, { anonymousStatus: 200 }]) {
    const api = apiFixture(options);
    await assert.rejects(deployQA(config, { root: f.root, ...api }));
    assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
  }
});

test('Vercel HTTPS SSO redirects confirm anonymous denial before a share link is requested', async t => {
  for (const status of [302, 303, 307, 308]) {
    const f = await fixture(t);
    const api = apiFixture({ anonymousStatus: status, anonymousHeaders: { Location: 'https://vercel.com/sso-api?url=qa-preview' } });
    const result = await deployQA(config, { root: f.root, ...api });
    assert.equal(result.anonymousStatus, status);
    const anonymousIndex = api.calls.findIndex(call => call.url === `https://${deployment.url}/`);
    const shareIndex = api.calls.findIndex(call => call.options.method === 'PATCH');
    assert.ok(anonymousIndex >= 0 && shareIndex > anonymousIndex);
  }
});

test('missing, insecure, unexpected and lookalike SSO locations never create a share link', async t => {
  const f = await fixture(t);
  for (const location of [undefined, '/sso-api', 'http://vercel.com/sso-api', 'https://vercel.com/other', 'https://other.example/sso-api', 'https://vercel.com.evil.example/sso-api']) {
    const api = apiFixture({ anonymousStatus: 302, anonymousHeaders: location ? { Location: location } : {} });
    await assert.rejects(deployQA(config, { root: f.root, ...api }), /Anonymous access was not denied/);
    assert.equal(api.calls.some(call => call.options.method === 'PATCH'), false);
  }
});

test('share response requires one valid secret and a finite bounded expiry', () => {
  assert.equal(shareAccess({ secret, expiresAt: timestamp + 3600000 }, timestamp, 3600).secret, secret);
  assert.equal(shareAccess({ [secret]: { scope: 'shareable-link', expires: timestamp + 3600000 } }, timestamp, 3600).secret, secret);
  for (const value of [{ secret }, { secret, expiresAt: timestamp + 86400000 }, { secret, expiresAt: timestamp - 1 }, { secret: 'bad', expiresAt: timestamp + 3600000 }, { unrelated: secret }])
    assert.throws(() => shareAccess(value, timestamp, 3600));
});

test('network and API errors never echo sensitive payloads', async t => {
  const f = await fixture(t);
  for (const fetchImpl of [async () => { throw Error(config.token); }, async () => Response.json({ message: config.token }, { status: 403 })]) {
    await assert.rejects(deployQA(config, { root: f.root, fetchImpl }), error => !error.message.includes(config.token) && /Vercel request failed/.test(error.message));
  }
});
