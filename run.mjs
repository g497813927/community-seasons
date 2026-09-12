#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { TerminalDashboard } from './terminal-dashboard.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const help=`Community Seasons fuzz test kit (Node.js 22.13+)

  node run.mjs quick                   One short pass (about 10–20 seconds)
  node run.mjs full                    One full pass (about 2 minutes)
  node run.mjs quick --forever         Stress until failure or Ctrl+C
  node run.mjs quick --rounds 2 --seed 12345
  node run.mjs quick --suite renderer --renderer-seeds 8

Options:
  --suite all|engine|economy|renderer|engine-properties|save-properties|typed-generators
  --forever             Repeat with fresh deterministic seeds; stop on failure
  --rounds N            Run exactly N seeded stress rounds
  --seed N              Reproducible unsigned 32-bit master seed
  --renderer-seeds N    Renderer seeds per round (quick 16; full 224)
  --renderer-offset N   Offset within the renderer's seed list
  --store-seeds N       Economy seeds per round (quick 32; full 1024)
  --actions N           Actions per economy seed (default 400)
  --runs N              Cases per fast-check property (quick 200; full originals)
  --budget-seconds N    Renderer runtime guard per round (default 170 seconds)
  --tui                Live dashboard on a capable interactive terminal
  --no-tui             Plain progress logs, including on an interactive terminal
  --help

Dependencies install once from the exact lockfile, with scripts disabled.
Results keep only the latest round and the first failure; Ctrl+C saves a summary.
See README.md for individual seed/path replay and typed generator guidance.`;
const args=process.argv.slice(2);
if(args.includes('--help')){console.log(help);process.exit(0);}
const mode=args[0]&&!args[0].startsWith('--')?args.shift():'quick';
const fail=(text)=>{console.error(text);process.exit(2);};
if(!['quick','full'].includes(mode))fail(help);
const opts={suite:'all'};
const accepted=new Set(['suite','rounds','seed','renderer-seeds','renderer-offset','store-seeds','actions','runs','budget-seconds']);
while(args.length){const flag=args.shift(),key=flag?.slice(2);if(flag==='--forever'){opts.forever=true;continue;}if(flag==='--tui'||flag==='--no-tui'){if(opts.tui!==undefined)fail('Choose only one of --tui and --no-tui.');opts.tui=flag==='--tui';continue;}const value=args.shift();if(!flag?.startsWith('--')||!accepted.has(key)||value===undefined)fail(`Unknown/incomplete option: ${flag}`);opts[key]=value;}
const scripts={engine:'work/community-tests/engine-state-fuzz.test.mjs',economy:'work/community-tests/store-economy-fuzz.test.mjs','engine-properties':'work/property-tests/engine-invalid.test.mjs','save-properties':'work/property-tests/save-invalid.test.mjs','typed-generators':'work/property-tests/typed-arbitraries.test.mjs',renderer:'work/renderer-fuzz.mjs'};
const available=Object.keys(scripts);
if(opts.suite!=='all'&&!available.includes(opts.suite))fail('Unknown/unavailable suite. Use --help.');
if(opts.forever&&opts.rounds!==undefined)fail('Choose either --forever or --rounds, not both.');
for(const[key,value]of Object.entries(opts)){
  if(['suite','forever','tui'].includes(key))continue;
  const n=Number(value),minimum=['seed','renderer-offset'].includes(key)?0:1,maximum=key==='seed'?0xffffffff:1000000;
  if(!Number.isSafeInteger(n)||n<minimum||n>maximum)fail(`Invalid --${key}: expected an integer from ${minimum} to ${maximum}.`);
  opts[key]=n;
}
const repeating=Boolean(opts.forever||opts.rounds!==undefined),seeded=repeating||opts.seed!==undefined;
const replayKeys=['ENGINE_FUZZ_REPLAY','STORE_FUZZ_SEED','RENDERER_FUZZ_SEED','RENDERER_FUZZ_SCENARIO','FC_PROPERTY','FC_SEED','FC_PATH','FC_SAVE_CASE','FC_SAVE_SEED','FC_SAVE_PATH','FC_TYPED_SEED','FC_TYPED_PATH'];
if(seeded&&replayKeys.some(k=>process.env[k]!==undefined))fail('Unset exact-replay environment variables before using --seed/--rounds/--forever. Replays are single passes.');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))fail('Please install Node.js 22.13 or newer, then rerun.');
let stopped=false,stopSignal=null,active=null,shutdownTimer=null,dashboard=null;
let activeSuite=null,suiteStartedAt=null;
const sessionStartedAt=Date.now();
const notify=(text,error=false)=>dashboard?dashboard.log(text,error):(error?console.error:console.log)(text);
const killActive=(signal='SIGTERM')=>{
  if(!active)return;
  try{if(process.platform==='win32')spawn('taskkill',['/PID',String(active.pid),'/T','/F'],{stdio:'ignore'});else process.kill(-active.pid,signal);}catch(error){if(error.code!=='ESRCH')active.kill(signal);}
};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;stopSignal=signal;notify('Stopping; saving the current summary…');killActive();shutdownTimer??=setTimeout(()=>killActive('SIGKILL'),2000);shutdownTimer.unref();});
process.on('exit',()=>{dashboard?.close();killActive();});
process.on('uncaughtExceptionMonitor',()=>{dashboard?.close();killActive();});
function child(command,arguments_,{env=process.env,logFile,timeout=120000,inherit=false}={}){
  return new Promise(resolve=>{
    let tail='',written=0,truncated=false,timedOut=false,error=null,settled=false;
    const limit=1024*1024,fd=logFile?fs.openSync(logFile,'w'):null;
    const proc=spawn(command,arguments_,{env,stdio:inherit?'inherit':['ignore','pipe','pipe'],detached:process.platform!=='win32'});active=proc;
    const record=data=>{if(fd!==null){const remaining=Math.max(0,limit-written);if(remaining)written+=fs.writeSync(fd,data,0,Math.min(remaining,data.length));if(data.length>remaining)truncated=true;}tail=(tail+data.toString('utf8')).slice(-14000);};
    proc.stdout?.on('data',record);proc.stderr?.on('data',record);
    let hardStop;
    const timer=setTimeout(()=>{timedOut=true;killActive();hardStop=setTimeout(()=>killActive('SIGKILL'),2000);},timeout);
    const finish=(status,signal)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(hardStop);if(fd!==null)fs.closeSync(fd);if(active===proc){active=null;clearTimeout(shutdownTimer);shutdownTimer=null;}resolve({status,signal,error,tail,truncated,timedOut});};
    proc.on('error',e=>{error=String(e);finish(null,null);});
    proc.on('close',finish);
  });
}
const expected=JSON.parse(fs.readFileSync('package.json','utf8')).devDependencies;
const ready=Object.entries(expected).every(([name,version])=>{try{return JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`,'utf8')).version===version;}catch{return false;}});
if(!ready){
  console.log('Installing locked test dependencies (first run only)…');
  const npmCli=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  if(process.platform==='win32'&&!fs.existsSync(npmCli))fail('Run npm ci --ignore-scripts --no-audit --no-fund once, then rerun this command.');
  const command=process.platform==='win32'?process.execPath:'npm';
  const npmArgs=[...(process.platform==='win32'?[npmCli]:[]),'ci','--ignore-scripts','--no-audit','--no-fund','--cache',process.env.npm_config_cache??path.join(root,'.npm-cache')];
  const install=await child(command,npmArgs,{inherit:true});
  if(install.status!==0){console.error('Dependency installation did not complete.');fs.mkdirSync('results',{recursive:true});fs.writeFileSync('results/summary.json',JSON.stringify({version:2,status:stopped?'interrupted':'dependency-error',phase:'dependency-install',completedRounds:0,stopSignal},null,2)+'\n');process.exit(stopped?(stopSignal==='SIGTERM'?143:130):1);}
}
const baseEnv={...process.env};
function setting(env,key,value){if(value!==undefined)env[key]=String(value);}
setting(baseEnv,'RENDERER_FUZZ_SEEDS',opts['renderer-seeds']??baseEnv.RENDERER_FUZZ_SEEDS??(mode==='quick'?16:224));
setting(baseEnv,'RENDERER_FUZZ_OFFSET',opts['renderer-offset']);
setting(baseEnv,'STORE_FUZZ_SEEDS',opts['store-seeds']??baseEnv.STORE_FUZZ_SEEDS??(mode==='quick'?32:1024));
setting(baseEnv,'STORE_FUZZ_ACTIONS',opts.actions);
for(const key of ['FC_RUNS','FC_SAVE_RUNS','FC_TYPED_RUNS'])setting(baseEnv,key,opts.runs??baseEnv[key]??(mode==='quick'?200:undefined));
setting(baseEnv,'RENDERER_FUZZ_BUDGET_MS',opts['budget-seconds']!==undefined?opts['budget-seconds']*1000:undefined);
const manifest=JSON.parse(fs.readFileSync('snapshot.json','utf8'));
const readSourceHashes=()=>Object.fromEntries(Object.keys(manifest.sourceHashes).map(file=>{try{return [file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}catch(error){return [file,`unreadable:${error.code}`];}}));
const hashes=readSourceHashes();
const changedInputs=()=>{const current=readSourceHashes();return JSON.stringify(current)===JSON.stringify(hashes)?null:current;};
const baseSeed=seeded?(opts.seed??crypto.randomBytes(4).readUInt32LE()):null;
const report={version:2,startedAt:new Date().toISOString(),mode,repeating,requestedRounds:opts.forever?'forever':opts.rounds??1,masterSeed:baseSeed,node:process.versions.node,dependencies:expected,sourceHashes:hashes,matchesBundledSnapshot:JSON.stringify(hashes)===JSON.stringify(manifest.sourceHashes),completedRounds:0,roundCounts:{passed:0,failed:0,interrupted:0,timeBudget:0,inputsChanged:0},totalElapsedSeconds:0,latestRound:null,status:'running'};
const resultPath='results/summary.json';fs.mkdirSync('results',{recursive:true});
if(!report.matchesBundledSnapshot)notify('Game source differs from the bundled snapshot; current hashes are recorded.');
if(seeded)notify(`Master seed: ${baseSeed}. Reproduce with --seed ${baseSeed}.`);
const savedKeys=['ENGINE_FUZZ_REPLAY','ENGINE_FUZZ_SEED_OFFSET','RENDERER_FUZZ_SEEDS','RENDERER_FUZZ_SEED','RENDERER_FUZZ_SCENARIO','RENDERER_FUZZ_BASE_SEED','RENDERER_FUZZ_OFFSET','RENDERER_FUZZ_BUDGET_MS','STORE_FUZZ_SEEDS','STORE_FUZZ_SEED','STORE_FUZZ_SEED_OFFSET','STORE_FUZZ_ACTIONS','FC_RUNS','FC_PROPERTY','FC_SEED','FC_PATH','FC_SAVE_RUNS','FC_SAVE_CASE','FC_SAVE_SEED','FC_SAVE_PATH','FC_TYPED_RUNS','FC_TYPED_SEED','FC_TYPED_PATH'];
const write=()=>fs.writeFileSync(resultPath,JSON.stringify(report,null,2)+'\n');
const selected=opts.suite==='all'?available:[opts.suite];
const roundLimit=opts.forever?Infinity:opts.rounds??1;
const tuiEnabled=Boolean(process.stdout.isTTY&&process.env.TERM!=='dumb'&&opts.tui!==false&&(process.stdout.columns||80)>=44&&(process.stdout.rows||24)>=14);
report.terminalMode=tuiEnabled?'tui':'plain';
dashboard=new TerminalDashboard({enabled:tuiEnabled,snapshot:()=>({mode,status:stopped?'stopping':report.status,requestedRounds:report.requestedRounds,round:report.latestRound?.number,roundCounts:report.roundCounts,suite:activeSuite,elapsed:(Date.now()-sessionStartedAt)/1000,suiteElapsed:suiteStartedAt===null?0:(Date.now()-suiteStartedAt)/1000,masterSeed:baseSeed,roundSeed:report.latestRound?.seed})});
const settleRound=(status)=>{
  report.latestRound.status=status;report.status=status;
  const key={passed:'passed',failed:'failed',interrupted:'interrupted','time-budget':'timeBudget','inputs-changed':'inputsChanged'}[status];
  if(key)report.roundCounts[key]++;
  report.completedRounds=report.roundCounts.passed;
  write();
  notify(`Round ${report.latestRound.number} ${status}; passed ${report.roundCounts.passed}, failed ${report.roundCounts.failed}.`);
};
try {
dashboard.start();
for(let round=1;round<=roundLimit&&!stopped;round++){
  const env={...baseEnv},roundSeed=seeded?(baseSeed+Math.imul(round-1,2654435761))>>>0:null;
  if(seeded){
    setting(env,'ENGINE_FUZZ_SEED_OFFSET',(roundSeed^0x17ac3401)>>>0);
    setting(env,'STORE_FUZZ_SEED_OFFSET',(roundSeed^0x32e78109)>>>0);
    setting(env,'RENDERER_FUZZ_BASE_SEED',(roundSeed^0x4c9815d3)>>>0);
    setting(env,'FC_SEED',(roundSeed^0x596abd21)|0);
    setting(env,'FC_SAVE_SEED',(roundSeed^0x63a19187)|0);
    setting(env,'FC_TYPED_SEED',(roundSeed^0x76fe23d1)|0);
  }
  report.status='running';
  report.latestRound={number:round,seed:roundSeed,settings:Object.fromEntries(savedKeys.filter(k=>env[k]!==undefined).map(k=>[k,env[k]])),suites:[],elapsedSeconds:0,status:'running'};
  write();notify(`Round ${round}${seeded?` · seed ${roundSeed}`:''}`);
  for(const suite of selected){
    if(stopped)break;
    const beforeChange=changedInputs();
    if(beforeChange){report.status='inputs-changed';report.latestRound.status='inputs-changed';report.observedSourceHashes=beforeChange;report.inputChangeBoundary=`before ${suite}`;write();notify('Game source changed during this session. Restart after edits; this is not a gameplay failure.');break;}
    activeSuite=suite;suiteStartedAt=Date.now();
    notify(`Running ${suite}…`);const started=Date.now();
    const command=suite==='renderer'?[scripts[suite]]:['--test',scripts[suite],...(suite==='engine'?['work/community-tests/rail-approach-warmup.test.mjs','work/community-tests/railway-forks.test.mjs','work/community-tests/boost-fork-assist.test.mjs','work/community-tests/cottage-roof-visibility.test.mjs','work/community-tests/summer-boardwalk-supports.test.mjs','work/community-tests/boost-barrier-protection.test.mjs']:[])];
    const timeout=suite==='renderer'?Number(env.RENDERER_FUZZ_BUDGET_MS??170000)+30000:120000;
    const result=await child(process.execPath,command,{env,logFile:`results/${suite}.log`,timeout});
    const afterChange=changedInputs();
    const status=stopped?'interrupted':afterChange?'inputs-changed':result.status===0?'passed':result.timedOut||(suite==='renderer'&&result.status===3)?'time-budget':'failed';
    if(afterChange){report.observedSourceHashes=afterChange;report.inputChangeBoundary=`after ${suite}`;}
    const row={name:suite,status,exitCode:result.status,signal:result.signal,elapsedSeconds:(Date.now()-started)/1000,log:`results/${suite}.log`,logTruncated:result.truncated};
    activeSuite=null;suiteStartedAt=null;
    report.latestRound.suites.push(row);report.latestRound.elapsedSeconds+=row.elapsedSeconds;report.totalElapsedSeconds+=row.elapsedSeconds;write();
    notify(`${status.toUpperCase()} ${suite} (${row.elapsedSeconds.toFixed(1)}s)`);
    if(status!=='passed'){
      report.latestRound.status=status;report.status=status;
      if(status==='inputs-changed')notify('Game source changed during this session. Restart after edits; this is not a gameplay failure.');
      if(!stopped&&status!=='inputs-changed'){notify(result.error??result.tail,true);fs.mkdirSync('results/failure',{recursive:true});for(const item of report.latestRound.suites)fs.copyFileSync(item.log,`results/failure/${item.name}.log`);fs.writeFileSync('results/failure/summary.json',JSON.stringify(report,null,2)+'\n');}
      break;
    }
  }
  if(stopped){settleRound('interrupted');break;}
  if(report.latestRound.status!=='running'){settleRound(report.latestRound.status);break;}
  settleRound('passed');
}
if(stopped)report.status='interrupted';
report.finishedAt=new Date().toISOString();report.stopSignal=stopSignal;write();
if(['failed','time-budget'].includes(report.status))fs.writeFileSync('results/failure/summary.json',JSON.stringify(report,null,2)+'\n');
} finally { dashboard.close(); }
console.log(`${report.status==='passed'?'All requested rounds passed.':report.status==='interrupted'?'Stopped cleanly.':report.status==='inputs-changed'?'Stopped because game source changed.':report.status==='time-budget'?'Stopped at the runtime limit.':'Stopped at the first failed suite.'} Passed rounds: ${report.roundCounts.passed}; failed: ${report.roundCounts.failed}; interrupted: ${report.roundCounts.interrupted}; time budget: ${report.roundCounts.timeBudget}; inputs changed: ${report.roundCounts.inputsChanged}. Results: ${path.join(root,resultPath)}`);
process.exitCode=stopped?(stopSignal==='SIGTERM'?143:130):report.status==='passed'?0:1;
