import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderNotices } from '../src/scripts/licenses.mjs';

const app = fileURLToPath(new URL('../src/', import.meta.url));
const refresh = 'Run npm --prefix src run licenses:generate and commit both public notice files.';

// Check the committed snapshot before any lifecycle script can regenerate it.
// Do not collect installed packages here: optional dependencies vary by OS.
export function checkCommittedNotices(root = app) {
  const lockfile = fs.readFileSync(path.join(root, 'package-lock.json'));
  const expected = `sha256:${crypto.createHash('sha256').update(lockfile).digest('hex')}`;
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'public/open-source-licenses.json'), 'utf8'));
  if (inventory.schemaVersion !== 1 || inventory.generatedFromLockfile !== expected) {
    throw new Error(`Committed license inventory is stale for src/package-lock.json. ${refresh}`);
  }
  const notices = fs.readFileSync(path.join(root, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8');
  if (notices !== renderNotices(inventory)) {
    throw new Error(`Committed THIRD-PARTY-NOTICES.txt does not match the committed JSON inventory. ${refresh}`);
  }
  return {
    lockfile: expected,
    packages: inventory.packages.length,
    omittedOptionalPackages: inventory.omittedOptionalPackages.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkCommittedNotices();
    console.log(`Committed notices match ${result.lockfile}; ${result.packages} package versions, ${result.omittedOptionalPackages} omitted optional packages.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
