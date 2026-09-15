// Explicit USB diagnostics for the isolated September 10 QA preview only.
// No browser history, credentials, production saves, or other tabs are read.
import { readFile, writeFile } from 'node:fs/promises';
const command = process.argv[2] ?? 'probe';
const config = JSON.parse(await readFile(new URL('./preview-20260910.json', import.meta.url), 'utf8'));
const pageUrl = new URL(config.preview_url);
if (pageUrl.origin !== 'https://www.bilibili.com' || !/^\/toy\/preview\/preview_\w+\/index.html$/.test(pageUrl.pathname)) throw Error('Invalid QA preview URL');
const prefix = 'qa-iphone-20260910-';
const deadline = setTimeout(() => { console.error('USB operation timed out; page measurements are retained.'); process.exit(2); }, ['start','remaining','monitor'].includes(command) ? 1500000 : 25000);
let ws;
try {
  const rows = await (await fetch('http://127.0.0.1:9223/json/list', {signal:AbortSignal.timeout(10000)})).json();
  const target = rows.find(row => row.url === pageUrl.href);
  if (!target) throw Error('The isolated QA preview is not open in Safari.');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map(), contexts = [];
  ws.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.method === 'Runtime.executionContextCreated') contexts.push(value.params.context);
    if (value.id && pending.has(value.id)) {
      const task = pending.get(value.id); pending.delete(value.id); clearTimeout(task.timeout);
      value.error ? task.reject(Error(JSON.stringify(value.error))) : task.resolve(value.result);
    }
  });
  ws.addEventListener('close', () => {
    for (const task of pending.values()) {clearTimeout(task.timeout);task.reject(Error('USB inspector disconnected; results remain on the page.'));}
    pending.clear();
  });
  await new Promise((resolve,reject) => {ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call = (method, params={}) => new Promise((resolve,reject) => {
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Inspector command timed out: '+method));},18000);
    pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));
  });
  await call('Runtime.enable'); await call('Page.enable');
  const tree = await call('Page.getFrameTree');
  await new Promise(resolve=>setTimeout(resolve,750));
  const frames=[];
  const visit=branch=>{if(!branch)return;frames.push(branch.frame);for(const child of branch.childFrames??[])visit(child);};
  visit(tree.frameTree);
  const frame=frames.find(f=>{
    try {const u=new URL(f.url);return ['https://www.bilibilitoy.com','https://bilibilitoy.com'].includes(u.origin)&&u.pathname===pageUrl.pathname;}catch{return false;}
  });
  const context=contexts.find(c=>c.auxData?.frameId===frame?.id&&c.auxData?.isDefault);
  if(!context)throw Error('The QA game iframe has no default execution context yet.');
  const evaluate=async expression=>{
    const result=await call('Runtime.evaluate',{expression,contextId:context.id,returnByValue:true,awaitPromise:false});
    if(result.wasThrown||result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails??result.result));
    return result.result?.value;
  };
  if(await evaluate('window.__phoneQA?.prefix')!==prefix)throw Error('Refusing a non-QA save namespace.');
  const status=()=>evaluate('JSON.stringify({status:__phoneQA.suiteStatus,snapshot:__phoneQA.snapshot(),activated:navigator.userActivation.hasBeenActive,visible:document.visibilityState,focused:document.hasFocus(),rows:(__phoneQA.suiteResults||[]).map(r=>({phase:r.phase,seconds:r.seconds,frames:r.summary.foreground.frames,hz:1000/r.summary.foreground.gapMs.mean,gapMax:r.summary.foreground.gapMs.max,gap95:r.summary.foreground.gapMs.p95,render95:r.summary.foreground.renderCPUMs.p95,over50:r.summary.foreground.over50ms,errors:r.errors.length,checks:r.checks}))})');
  const exportResults=async()=>{
    const value=await evaluate('JSON.stringify({status:__phoneQA.suiteStatus,aggregate:__phoneQA.suiteAggregate,results:__phoneQA.suiteResults,interrupted:__phoneQA.suiteInterrupted,latest:__phoneQA.export(),device:{userAgent:navigator.userAgent,activated:navigator.userActivation.hasBeenActive,visible:document.visibilityState,focused:document.hasFocus(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio}})');
    await writeFile(new URL('./physical-iphone-20260910.json',import.meta.url),value+'\n');
  };
  if(command==='probe'||command==='status')console.log(await status());
  else if(command==='screenshot'){
    const shot=await call('Page.captureScreenshot',{format:'png'});
    if(typeof shot.data!=='string')throw Error('Screenshot unavailable');
    await writeFile(new URL('./physical-iphone-20260910.png',import.meta.url),Buffer.from(shot.data,'base64'));
    console.log('Saved physical-iphone-20260910.png');
  }
  else if(command==='ui')console.log(await evaluate('JSON.stringify({buttons:[...document.querySelectorAll("button")].filter(b=>b.getClientRects().length).map(b=>({text:b.textContent,aria:b.getAttribute("aria-label"),disabled:b.disabled})),viewport:{width:innerWidth,height:innerHeight}})'));
  else if(command==='stop')console.log(await evaluate('__phoneQA.stopSuite()'));
  else if(command==='pause')console.log(await evaluate('if(__phoneQA.run.mode==="running")__phoneQA.pause();JSON.stringify(__phoneQA.snapshot())'));
  else if(command==='export'){await exportResults();console.log('Saved physical-iphone-20260910.json');}
  else if(command==='start'||command==='remaining'||command==='monitor') {
    if(command==='start'||command==='remaining') {
      if(await evaluate('Boolean(__phoneQA.suiteStatus?.running)'))throw Error('QA is already running; no reset performed.');
      const eligible=JSON.parse(await evaluate('JSON.stringify({visible:document.visibilityState,activated:navigator.userActivation.hasBeenActive})'));
      if(eligible.visible!=='visible'||!eligible.activated)throw Error('Keep Safari visible and tap the game once before measurement.');
      await call('Debugger.setBreakpointsActive',{active:false});
      console.log(await evaluate(command==='remaining' ? '__phoneQA.startSuite({extended:true,durations:{normal:1}})' : '__phoneQA.startSuite({extended:true})')); 
    }
    let completed=0;
    while(true){
      await new Promise(resolve=>setTimeout(resolve,20000));
      const current=JSON.parse(await status());
      await writeFile(new URL('./physical-iphone-20260910-progress.json',import.meta.url),JSON.stringify(current,null,2)+'\n');
      for(const row of current.rows.slice(completed))console.log(JSON.stringify(row));
      completed=current.rows.length;
      if(!current.status?.running){await exportResults();console.log(JSON.stringify({status:current.status,file:'physical-iphone-20260910.json'}));break;}
    }
  } else throw Error('Unknown QA command.');
} catch(error) {console.error(String(error));process.exitCode=1;}
finally {ws?.close();clearTimeout(deadline);}
