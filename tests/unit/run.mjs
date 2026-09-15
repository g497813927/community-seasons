import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const regressionDirectory = 'tests/unit';
process.chdir(root);

// Randomized suites belong to tests/fuzz/run.mjs, which records seeds and source hashes.
const files = readdirSync(regressionDirectory)
  .filter(name => name.endsWith('.test.mjs') && !name.includes('fuzz'))
  .sort()
  .map(name => `${regressionDirectory}/${name}`);

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
