import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA_PROJECT_NAME = 'community-seasons-qa';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const API = 'https://api.vercel.com';
const MAX_TTL = 23 * 60 * 60;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const sameHashes = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([name, value]) => b[name] === value);

export function configuration(env, args = []) {
  if ((args.length === 1 && ['--help', '-h'].includes(args[0])) ||
      (args.length === 2 && args[0] === 'share' && ['--help', '-h'].includes(args[1]))) return { help: true };
  const mode = args[0] === 'share' ? 'share' : 'deploy';
  const options = {};
  for (let index = mode === 'share' ? 1 : 0; index < args.length; index++) {
    const key = args[index];
    if (!['--ttl-seconds', '--deployment', '--deploy-only'].includes(key) || Object.hasOwn(options, key))
      throw Error(`Unknown or repeated option. Run npm run qa:${mode} -- --help for usage.`);
    if (key === '--deploy-only') options[key] = true;
    else {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error('Expected a value after the option.');
      options[key] = args[++index];
    }
  }
  if (mode === 'share' && (!/^dpl_[A-Za-z0-9]+$/.test(options['--deployment'] ?? '') || options['--deploy-only']))
    throw Error('Use npm run qa:share -- --deployment dpl_ID [--ttl-seconds 3600].');
  if (mode === 'deploy' && options['--deployment']) throw Error('Use qa:share to access an existing deployment.');
  if (options['--deploy-only'] && options['--ttl-seconds']) throw Error('--deploy-only does not create an access link or use a TTL.');
  const ttl = options['--ttl-seconds'] === undefined ? 3600 : Number(options['--ttl-seconds']);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > MAX_TTL)
    throw Error('Link duration must be an integer from 60 to 82800 seconds.');
  if (!env.VERCEL_TOKEN || !/^prj_[A-Za-z0-9]+$/.test(env.VERCEL_PROJECT_ID ?? '') || !/^team_[A-Za-z0-9]+$/.test(env.VERCEL_ORG_ID ?? ''))
    throw Error('Set VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_ORG_ID for the protected Community Seasons QA project.');
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF !== 'refs/heads/main')
    throw Error('Hosted QA deployment is restricted to main in GitHub Actions.');
  return { token: env.VERCEL_TOKEN, projectId: env.VERCEL_PROJECT_ID, teamId: env.VERCEL_ORG_ID, ttl, mode, deployOnly: !!options['--deploy-only'], deploymentId: options['--deployment'] };
}

async function walk(directory, visitor, ignore = new Set()) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignore.has(entry.name) || (ignore.has('.vite*') && entry.name.startsWith('.vite'))) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file, visitor, ignore);
    else if (entry.isFile()) await visitor(file);
    else throw Error('QA inputs must contain regular files only; symbolic links are not accepted.');
  }
}

async function sourceHashes(root) {
  const hashes = {};
  for (const directory of ['src', 'tests/qa/preview'])
    await walk(path.join(root, directory), async file => { hashes[path.relative(root, file).split(path.sep).join('/')] = digest(await fs.readFile(file)); }, new Set(['node_modules', 'dist', '.git', '.vite*']));
  for (const file of ['package.json', 'package-lock.json']) hashes[file] = digest(await fs.readFile(path.join(root, file)));
  return hashes;
}

export async function readArtifact(root = ROOT) {
  const directory = path.join(root, 'tests/qa/preview/dist');
  const files = [], hashes = {};
  let html = '', scripts = '', buildInfo;
  await walk(directory, async file => {
    const relative = path.relative(directory, file).split(path.sep).join('/');
    if (!/^(?:index\.html|qa-build-info\.json|favicon\.svg|open-source-licenses\.json|THIRD-PARTY-NOTICES\.txt|assets\/[A-Za-z0-9_.-]+\.(?:js|css))$/.test(relative))
      throw Error('QA output contains an unexpected file. Rebuild tests/qa/preview/dist before deploying.');
    const contents = await fs.readFile(file);
    hashes[`tests/qa/preview/dist/${relative}`] = digest(contents);
    files.push({ file: relative, data: contents.toString('base64'), encoding: 'base64' });
    if (relative === 'index.html') html = contents.toString('utf8');
    if (relative === 'qa-build-info.json') {
      try { buildInfo = JSON.parse(contents.toString('utf8')); }
      catch { throw Error('QA build provenance is invalid. Rebuild the QA preview.'); }
    }
    if (relative.endsWith('.js')) scripts += contents.toString('utf8');
  });
  if (!html.includes('name="community-seasons-qa"') || !html.includes('community-seasons-qa-v1') ||
      !scripts.includes('__communitySeasonsQA') || !scripts.includes('qa-community-seasons-v1:') ||
      !/cloud\s*:\s*["'`]disabled["'`]/.test(scripts) || /s1\.hdslb\.com\/bfs\/seed\/toy\/app\/sdk|toy-sdk\.js/.test(scripts))
    throw Error('Output is not the isolated QA preview with cloud disabled.');
  if (!files.some(file => file.file.startsWith('assets/') && file.file.endsWith('.js')))
    throw Error('QA JavaScript assets are missing.');
  if (buildInfo?.version !== 1 || !buildInfo.sourceHashes || typeof buildInfo.sourceHashes !== 'object')
    throw Error('QA build provenance is missing. Rebuild the QA preview.');
  return { files, hashes, buildSourceHashes: buildInfo.sourceHashes };
}

export async function requirePassingQA(root, artifact) {
  const expectedSources = await sourceHashes(root);
  if (!sameHashes(artifact.buildSourceHashes, expectedSources))
    throw Error('QA build provenance does not match current source. Rebuild and rerun QA.');
  const resultDirectory = path.join(root, 'results/qa');
  let directories;
  try { directories = await fs.readdir(resultDirectory, { withFileTypes: true }); }
  catch { throw Error('Run npm run qa:build and npm run qa:all before deploying.'); }
  for (const directory of directories.filter(entry => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    let report;
    try { report = JSON.parse(await fs.readFile(path.join(resultDirectory, directory.name, 'report.json'), 'utf8')); }
    catch { continue; }
    if (report.status !== 'passed' || report.requestedPlatform !== 'all' || report.errors?.length !== 0 || report.changedSourceFiles?.length !== 0 || !report.serverClosed) continue;
    if (!Array.isArray(report.rows) || report.rows.length !== 6 ||
        !['web', 'android', 'ios'].every(platform => ['en', 'zh-CN'].every(locale => report.rows.some(row => row.platform === platform && row.locale === locale && row.passed)))) continue;
    if (!sameHashes(report.distHashes ?? {}, artifact.hashes) || !sameHashes(report.sourceHashes ?? {}, expectedSources)) continue;
    return { report: path.relative(root, path.join(resultDirectory, directory.name, 'report.json')), finishedAt: report.finishedAt };
  }
  throw Error('No passing Web/Android/iOS QA report matches the current source and built files. Run npm run qa:build and npm run qa:all.');
}

export function assertProtectedProject(project, config) {
  if (project?.id !== config.projectId || project.accountId !== config.teamId || project.name !== QA_PROJECT_NAME)
    throw Error('Vercel project does not match the explicitly selected Community Seasons QA project/team.');
  if (project.ssoProtection?.deploymentType !== 'all')
    throw Error('QA project must have Vercel Authentication set to All Deployments.');
}

function assertProjectInitialized(project) {
  // Vercel can classify the first deployment in an empty project as production,
  // even when target is omitted. Keep a protected placeholder as its baseline.
  const baseline = project.targets?.production;
  if (!/^dpl_[A-Za-z0-9]+$/.test(baseline?.id ?? '') || baseline.target !== 'production' || baseline.readyState !== 'READY')
    throw Error('QA project needs a READY protected production bootstrap before preview upload. Follow docs/QA_HOSTING.md; no files were uploaded.');
}

function deploymentUrl(deployment, config) {
  if (!/^dpl_[A-Za-z0-9]+$/.test(deployment?.id ?? '') || deployment.projectId !== config.projectId || deployment.target !== null)
    throw Error('Vercel did not confirm a preview deployment in the selected QA project.');
  if (typeof deployment.url !== 'string' || !/^[a-z0-9-]+\.vercel\.app$/.test(deployment.url))
    throw Error('Vercel returned an unexpected deployment hostname.');
  return `https://${deployment.url}/`;
}

// The public API leaves the response object open-ended. Accept only an explicit
// share secret with a finite, short expiry; never print an unknown API payload.
export function shareAccess(response, createdAfter, ttl) {
  const expiry = value => typeof value === 'string' && !/^\d+$/.test(value) ? Date.parse(value) : Number(value) * (Number(value) < 1e12 ? 1000 : 1);
  const candidates = [];
  if (response && typeof response.secret === 'string') candidates.push({ secret: response.secret, value: response });
  const map = response?.protectionBypass ?? response;
  if (map && typeof map === 'object') for (const [secret, value] of Object.entries(map))
    if (value && typeof value === 'object' && value.scope === 'shareable-link') candidates.push({ secret, value });
  const valid = candidates.map(({ secret, value }) => ({ secret, expiresAt: expiry(value.expiresAt ?? value.expires) }))
    .filter(candidate => /^[A-Za-z0-9_-]{16,512}$/.test(candidate.secret) && Number.isFinite(candidate.expiresAt) &&
      candidate.expiresAt > createdAfter && candidate.expiresAt <= createdAfter + ttl * 1000 + 120000);
  if (valid.length !== 1) throw Error('Vercel did not confirm exactly one short-lived share link; no access URL was saved.');
  return valid[0];
}

function apiClient(config, fetchImpl) {
  return async function request(route, { method = 'GET', body, phase } = {}) {
    let response;
    try {
      response = await fetchImpl(`${API}${route}${route.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(config.teamId)}`, {
        method, headers: { authorization: `Bearer ${config.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000),
      });
    } catch { throw Error(`Vercel request failed during ${phase}.`); }
    if (!response.ok) throw Error(`Vercel request failed during ${phase} (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw Error(`Vercel returned invalid JSON during ${phase}.`); }
  };
}

async function verifyAccessProtection(deployment, config, request, fetchImpl) {
  const url = deploymentUrl(deployment, config);
  if (deployment.readyState !== 'READY' || deployment.meta?.communitySeasonsQA !== 'community-seasons-qa-v1')
    throw Error('Select a READY preview created by the Community Seasons QA trigger.');
  assertProtectedProject(await request(`/v9/projects/${config.projectId}`, { phase: 'protection check' }), config);
  let anonymous;
  try { anonymous = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) }); }
  catch { throw Error('Could not verify anonymous access is denied. No share link was created.'); }
  const authRedirect = [302, 303, 307, 308].includes(anonymous.status) && (() => {
    try { const location = new URL(anonymous.headers.get('location')); return location.protocol === 'https:' && location.hostname === 'vercel.com' && location.pathname.startsWith('/sso-api'); }
    catch { return false; }
  })();
  if (![401, 403].includes(anonymous.status) && !authRedirect)
    throw Error('Anonymous access was not denied by deployment protection. No share link was created.');
  return { url, anonymousStatus: anonymous.status };
}

async function mintShare(config, deployment, url, request, root, now, { fsImpl, platform }) {
  if (platform === 'win32')
    throw Error('Private share links require a filesystem with POSIX permissions. On Windows, use --deploy-only and Vercel Authentication, or run qa:share on macOS/Linux.');
  let directory, accessFile, handle, complete = false;
  let phase = 'private file preparation';
  const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
  async function verifyPrivateFile() {
    const folder = await fsImpl.lstat(directory);
    const opened = await handle.stat();
    const entry = await fsImpl.lstat(accessFile);
    if (!folder.isDirectory() || (folder.mode & 0o777) !== 0o700 ||
        !opened.isFile() || (opened.mode & 0o777) !== 0o600 || opened.nlink !== 1 ||
        !entry.isFile() || !sameFile(opened, entry)) throw Error('Private file verification failed.');
  }
  try {
    const parent = path.join(root, 'results/qa');
    await fsImpl.mkdir(parent, { recursive: true });
    directory = await fsImpl.mkdtemp(path.join(parent, `vercel-access-${new Date(now()).toISOString().replaceAll(':', '-')}-${deployment.id}-`));
    await fsImpl.chmod(directory, 0o700);
    const folder = await fsImpl.lstat(directory);
    if (!folder.isDirectory() || (folder.mode & 0o777) !== 0o700) throw Error('Private directory verification failed.');
    accessFile = path.join(directory, 'access.json');
    handle = await fsImpl.open(accessFile, 'wx', 0o600);
    await handle.chmod(0o600);
    await verifyPrivateFile();
    phase = 'share-link request';
    const linkRequestedAt = now();
    const access = shareAccess(await request(`/aliases/${deployment.id}/protection-bypass`, { method: 'PATCH', body: { ttl: config.ttl }, phase: 'expiring share link' }), linkRequestedAt, config.ttl);
    const accessUrl = new URL(url);
    accessUrl.searchParams.set('_vercel_share', access.secret);
    phase = 'private file write';
    await verifyPrivateFile();
    await handle.writeFile(JSON.stringify({ url: accessUrl.href, expiresAt: new Date(access.expiresAt).toISOString() }, null, 2) + '\n');
    await verifyPrivateFile();
    await handle.close();
    complete = true;
    return { directory, accessFile, ttlSeconds: config.ttl, expiresAt: new Date(access.expiresAt).toISOString() };
  } catch {
    // Filesystem and request errors may contain payloads; only fixed phase names are logged.
    throw Error(`QA sharing failed during ${phase}; no access URL was returned. Use a filesystem that enforces POSIX 0700/0600 permissions. See docs/QA_HOSTING.md.`);
  } finally {
    if (handle && !complete) {
      await handle.truncate(0).catch(() => {});
      const opened = await handle.stat().catch(() => null);
      const entry = await fsImpl.lstat(accessFile).catch(() => null);
      if (opened && entry && sameFile(opened, entry)) await fsImpl.unlink(accessFile).catch(() => {});
    }
    if (handle && !complete) await handle.close().catch(() => {});
    // Never remove a pre-existing collision or recursively delete another entry.
    if (directory && !complete) await fsImpl.rmdir(directory).catch(() => {});
  }
}

export async function shareQA(config, { root = ROOT, fetchImpl = fetch, now = Date.now, fsImpl = fs, platform = process.platform } = {}) {
  if (!Number.isInteger(config.ttl) || config.ttl < 60 || config.ttl > MAX_TTL) throw Error('A bounded access TTL is required.');
  if (!/^dpl_[A-Za-z0-9]+$/.test(config.deploymentId ?? '')) throw Error('Select an explicit deployment ID.');
  const request = apiClient(config, fetchImpl);
  assertProtectedProject(await request(`/v9/projects/${config.projectId}`, { phase: 'protection check' }), config);
  const deployment = await request(`/v13/deployments/${config.deploymentId}`, { phase: 'deployment status' });
  if (deployment.id !== config.deploymentId) throw Error('Vercel deployment identity changed.');
  const verified = await verifyAccessProtection(deployment, config, request, fetchImpl);
  const access = await mintShare(config, deployment, verified.url, request, root, now, { fsImpl, platform });
  return { deploymentId: deployment.id, ...verified, ...access };
}

export async function deployQA(config, { root = ROOT, fetchImpl = fetch, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onStatus = () => {}, fsImpl = fs, platform = process.platform } = {}) {
  if (!Number.isInteger(config.ttl) || config.ttl < 60 || config.ttl > MAX_TTL) throw Error('A bounded access TTL is required.');
  const artifact = await readArtifact(root);
  const validation = await requirePassingQA(root, artifact);
  const request = apiClient(config, fetchImpl);
  const project = await request(`/v9/projects/${config.projectId}`, { phase: 'protection check' });
  assertProtectedProject(project, config);
  assertProjectInitialized(project);
  const body = {
    name: QA_PROJECT_NAME, project: config.projectId, files: artifact.files,
    projectSettings: { framework: null, buildCommand: '', installCommand: '', outputDirectory: '.', rootDirectory: null },
    meta: { communitySeasonsQA: 'community-seasons-qa-v1' },
    // With the protected baseline in place, omit target to request a preview.
  };
  if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024)
    throw Error('QA upload exceeds the 4 MiB inline request limit used by this trigger. No files were uploaded.');
  const created = await request('/v13/deployments', { method: 'POST', body, phase: 'preview upload' });
  if (!/^dpl_[A-Za-z0-9]+$/.test(created?.id ?? '')) throw Error('Vercel did not return a deployment ID.');
  onStatus({ deploymentId: created.id, status: 'waiting' });
  const deadline = now() + 5 * 60 * 1000;
  let deployment;
  while (now() < deadline) {
    deployment = await request(`/v13/deployments/${created.id}`, { phase: 'deployment status' });
    if (deployment.id !== created.id) throw Error('Vercel deployment identity changed.');
    deploymentUrl(deployment, config);
    if (deployment.readyState === 'READY') break;
    if (['ERROR', 'CANCELED'].includes(deployment.readyState)) throw Error('Vercel QA preview did not reach READY.');
    await wait(2000);
  }
  if (deployment?.readyState !== 'READY') throw Error('Vercel QA preview exceeded the five-minute readiness limit.');
  const verified = await verifyAccessProtection(deployment, config, request, fetchImpl);
  const access = config.deployOnly ? {} : await mintShare(config, deployment, verified.url, request, root, now, { fsImpl, platform });
  const directory = access.directory ?? path.join(root, 'results/qa', `vercel-deploy-${new Date(now()).toISOString().replaceAll(':', '-')}-${created.id}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const report = { deploymentId: created.id, projectId: config.projectId, teamId: config.teamId, ...verified, target: 'preview', protection: 'all', ...(access.expiresAt ? { ttlSeconds: config.ttl, expiresAt: access.expiresAt } : {}), validation, artifactHashes: artifact.hashes };
  await fs.writeFile(path.join(directory, 'deployment.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { ...report, ...(access.accessFile ? { accessFile: access.accessFile } : {}) };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const config = configuration(env, args);
  if (config.help) {
    console.log('Build and validate first: npm run qa:build && npm run qa:all\nSet VERCEL_TOKEN, VERCEL_PROJECT_ID and VERCEL_ORG_ID for community-seasons-qa.\nDeploy + private link: npm run qa:deploy -- [--ttl-seconds 3600]\nDeploy without a link (CI): npm run qa:deploy -- --deploy-only\nShare an existing QA preview: npm run qa:share -- --deployment dpl_ID [--ttl-seconds 3600]\nRequires Vercel Authentication: All Deployments. Access links are written only to ignored mode-0600 files; their values are never logged.');
    return;
  }
  const result = config.mode === 'share' ? await shareQA(config) : await deployQA(config, { onStatus: value => console.log(JSON.stringify(value)) });
  console.log(JSON.stringify({ deploymentId: result.deploymentId, url: result.url, expiresAt: result.expiresAt, accessFile: result.accessFile }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
