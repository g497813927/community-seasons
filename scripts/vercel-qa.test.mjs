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

function apiFixture({ protection = project, ready = deployment, anonymousStatus = 401, share = { protectionBypass: { [secret]: { scope: 'shareable-link', expires: timestamp + config.ttl * 1000 } } } } = {}) {
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
    return new Response('', { status: anonymousStatus });
  };
  return { calls, fetchImpl, now: () => timestamp };
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
  assert.deepEqual(posted.files.map(file => file.file).sort(), ['assets/qa-test.js', 'index.html', 'qa-build-info.json']);
  const bypass = api.calls.find(call => call.options.method === 'PATCH');
  assert.deepEqual(JSON.parse(bypass.options.body), { ttl: 3600 });
  const access = JSON.parse(await fs.readFile(result.accessFile, 'utf8'));
  assert.equal(new URL(access.url).searchParams.get('_vercel_share'), secret);
  assert.equal((await fs.stat(result.accessFile)).mode & 0o777, 0o600);
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
