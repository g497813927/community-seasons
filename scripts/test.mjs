import {fileURLToPath} from 'node:url';
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const files=readdirSync('work/community-tests').filter(n=>n.endsWith('.test.mjs')&&!n.includes('fuzz')).sort().map(n=>'work/community-tests/'+n);
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(r.status??1);
