import fs from 'node:fs/promises';
import path from 'node:path';
import { fileHashes, changedFiles } from '../preview/build-info.mjs';
import { BUILD_INFO_ELEMENT, validateBuildInfo } from '../preview/provenance.mjs';

export const BUILD_INFO_FILE = 'qa-build-info.json';
export function matrixSourceHashes(root) {
  return fileHashes(root, ['src', 'tests/qa/outfit-matrix', 'tests/qa/preview', 'package.json', 'package-lock.json']
    .map(file => path.join(root, file)));
}
export function matrixBuildInfo(root, cases, requirements) {
  let sourceHashes;
  return {
    name: 'outfit-matrix-build-record', apply: 'build',
    async buildStart() {
      sourceHashes = await matrixSourceHashes(root);
      for (const file of Object.keys(sourceHashes)) this.addWatchFile(path.join(root, file));
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { id: BUILD_INFO_ELEMENT, type: 'application/json' },
        children: JSON.stringify({ version: 1, sourceHashes }).replaceAll('<', '\\u003c'), injectTo: 'head-prepend' }];
    },
    async generateBundle() {
      if (changedFiles(sourceHashes, await matrixSourceHashes(root)).length)
        throw Error('Matrix sources changed during build; rebuild after edits finish.');
      this.emitFile({ type: 'asset', fileName: BUILD_INFO_FILE, source: JSON.stringify({ version: 1, sourceHashes }, null, 2) + '\n' });
      this.emitFile({ type: 'asset', fileName: 'outfit-matrix-manifest.json', source: JSON.stringify({
        version: 1, minimumDurationMs: 60_000, caseCount: cases.length, cases, requirements,
        scope: 'Source renderer/engine soak; actual UI/answer flow is checked in functional.html. Real elapsed time, no accelerated clocks.',
      }, null, 2) + '\n' });
    },
  };
}
export async function assertMatrixBuildIsCurrent(root, dist) {
  const build = validateBuildInfo(JSON.parse(await fs.readFile(path.join(dist, BUILD_INFO_FILE), 'utf8')));
  const current = await matrixSourceHashes(root);
  const changed = changedFiles(build.sourceHashes, current);
  if (changed.length) throw Error(`Matrix build is stale (${changed.length} files changed). Rebuild before running.`);
  return current;
}
