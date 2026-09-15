import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILD_INFO_ELEMENT, validateBuildInfo } from './provenance.mjs';

export const BUILD_INFO_FILE = 'qa-build-info.json';

export async function fileHashes(root, paths) {
  const hashes = {};
  async function visit(file) {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(file, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.startsWith('.vite')) continue;
        await visit(path.join(file, entry.name));
      }
    } else if (stat.isFile()) {
      hashes[path.relative(root, file).split(path.sep).join('/')] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    }
  }
  for (const file of paths) await visit(file);
  return hashes;
}

export function previewSourceHashes(root) {
  return fileHashes(root, ['src', 'qa/preview', 'package.json', 'package-lock.json'].map(file => path.join(root, file)));
}

export function changedFiles(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
}

export function previewBuildInfo(root) {
  let sourceHashes;
  return {
    name: 'qa-build-source-record',
    apply: 'build',
    async buildStart() {
      sourceHashes = await previewSourceHashes(root);
      for (const file of Object.keys(sourceHashes)) this.addWatchFile(path.join(root, file));
    },
    transformIndexHtml() {
      return [{
        tag: 'script', attrs: { id: BUILD_INFO_ELEMENT, type: 'application/json' },
        children: JSON.stringify({ version: 1, sourceHashes }).replaceAll('<', '\\u003c'),
        injectTo: 'head-prepend',
      }];
    },
    async generateBundle() {
      if (changedFiles(sourceHashes, await previewSourceHashes(root)).length)
        throw Error('QA source changed during the build. Finish edits and run `npm run qa:build` again.');
      this.emitFile({ type: 'asset', fileName: BUILD_INFO_FILE, source: JSON.stringify({ version: 1, sourceHashes }, null, 2) + '\n' });
    },
  };
}

export async function assertPreviewBuildIsCurrent(root, previewDist) {
  let build;
  try { build = JSON.parse(await fs.readFile(path.join(previewDist, BUILD_INFO_FILE), 'utf8')); }
  catch { throw Error('QA preview has no readable build-source record. Run `npm run qa:build` first.'); }
  try { build = validateBuildInfo(build); }
  catch { throw Error('QA preview has an invalid build-source record. Run `npm run qa:build` again.'); }
  const sources = await previewSourceHashes(root);
  const changed = changedFiles(build.sourceHashes, sources);
  if (changed.length) throw Error(`QA preview is stale (${changed.length} changed source files). Run \`npm run qa:build\` before browser QA.`);
  return sources;
}
