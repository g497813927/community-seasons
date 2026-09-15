import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectInspector } from './cdp.mjs';
import { runAction } from './actions.mjs';
import { matchingTargets, selectTarget, validateEndpoint, validatePage, validateWebSocket } from './targets.mjs';

export const help = `Inspect one explicitly selected Community Seasons QA preview.

npm run qa:device -- --platform android|ios --endpoint http://127.0.0.1:9222 --page EXACT_URL --action list
npm run qa:device -- --platform android|ios --endpoint http://127.0.0.1:9222 --page EXACT_URL --target ID --action status|measure|screenshot [--seconds 10]

Use the externally configured iOS CDP bridge endpoint (often port 9223) for iOS.
List reads matching target metadata only. Other actions require an explicit target ID
and verify the exact QA frame, isolated storage prefix and disabled cloud provider.
Measure runs for 1–60 seconds; keep the device unlocked, page visible/focused, and
tap the real game first. Its embedded build hashes must match this checkout;
rebuild and reload after edits. Status/screenshot label unbuilt or stale pages.
Measurement resets only QA metrics. No command navigates a page.
Reports are saved under results/qa/device-*. Remote inspection does not establish
that a browser is running on physical hardware; reports retain the observed UA.
`;

export function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = {};
  const allowed = new Set(['platform', 'endpoint', 'page', 'target', 'action', 'seconds']);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.slice(2), value = args[index + 1];
    if (!args[index]?.startsWith('--') || !allowed.has(key) || !value || value.startsWith('--') || Object.hasOwn(options, key))
      throw Error('Use each documented --option VALUE once. Run with --help for usage.');
    options[key] = value;
  }
  if (!['android', 'ios'].includes(options.platform)) throw Error('Select --platform android or ios.');
  if (!options.endpoint || !options.page) throw Error('Specify --endpoint and the exact --page URL.');
  if (!['list', 'status', 'measure', 'screenshot'].includes(options.action)) throw Error('Select --action list, status, measure or screenshot.');
  if (options.action !== 'list' && !options.target) throw Error('Use --target ID after listing the matching preview.');
  if (options.action === 'list' && options.target) throw Error('List matching previews first without --target.');
  if (options.seconds && options.action !== 'measure') throw Error('--seconds applies only to measure.');
  const seconds = options.seconds === undefined ? 10 : Number(options.seconds);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw Error('--seconds must be an integer from 1 to 60.');
  return { ...options, seconds, endpoint: validateEndpoint(options.endpoint), page: validatePage(options.page) };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log(help); return; }
  const response = await fetch(new URL('/json/list', options.endpoint), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw Error(`Inspector target list failed (${response.status}).`);
  const rows = await response.json();
  if (options.action === 'list') {
    const targets = matchingTargets(rows, options.page).map(row => ({ id: String(row.id), url: row.url }));
    console.log(JSON.stringify({ method: 'remote-inspector', selectedPlatform: options.platform, targets }, null, 2));
    return;
  }
  const target = selectTarget(rows, options.page, options.target);
  const session = await connectInspector(validateWebSocket(target.webSocketDebuggerUrl, options.endpoint));
  try {
    const { png, ...observed } = await runAction(session, options.page, options.action, options);
    const report = {
      method: 'remote-inspector', selectedPlatform: options.platform, physicalHardwareVerified: false,
      action: options.action, timestamp: new Date().toISOString(), page: options.page.url.href,
      targetId: options.target, ...observed,
    };
    const directory = fileURLToPath(new URL(`../../../results/qa/device-${report.timestamp.replaceAll(':', '-')}-${options.platform}-${options.action}/`, import.meta.url));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (png) await writeFile(path.join(directory, 'screenshot.png'), png);
    console.log(JSON.stringify({ report: path.join(directory, 'report.json'), ...(png ? { screenshot: path.join(directory, 'screenshot.png') } : {}), method: report.method, selectedPlatform: report.selectedPlatform, provenance: report.provenance, environment: report.environment }, null, 2));
  } finally { session.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
