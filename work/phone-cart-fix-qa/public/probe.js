/* Test-build instrumentation only. No external collection; data stays in RAM. */
(() => {
  const PREFIX = 'qa-cart-20260910-';
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const startedAt = new Date().toISOString();
  const now = () => performance.now();
  function ring(capacity) {
    const entries = new Array(capacity); let index = 0, size = 0;
    return {push(value) { entries[index] = value; index = (index + 1) % capacity; size = Math.min(capacity, size + 1); },
      values() { const out = []; for (let i = 0; i < size; i++) out.push(entries[(index - size + i + capacity) % capacity]); return out; },
      clear() { entries.fill(undefined); index = size = 0; }};
  }
  const frames = ring(6000), events = ring(256), storage = ring(512), cloud = ring(256);
  let liveRun = null, activeFrame = null, previousTimestamp = null, sequence = 0, label = 'manual', resetAt = now();
  function mark(kind, detail) { events.push({at:now(),kind,detail}); }
  function frame(timestamp) {
    if (activeFrame?.timestamp === timestamp) return activeFrame;
    const s = liveRun;
    activeFrame = {index:++sequence,timestamp,gap:previousTimestamp===null?null:timestamp-previousTimestamp,
      callbackCPU:0,callbacks:0,renderCPU:0,renders:0,engineCPU:0,updates:0,
      visible:document.visibilityState==='visible',focused:document.hasFocus(),scenario:label,
      mode:s?.mode??'loading',scene:s?.scene??null,rail:s?.rail?.phase??null,
      transition:s?.sceneTransition>0?'season':s?.railReturnRemaining>0?'rail-return':null,
      turn:s?.turnRemaining>0,boosts:s?[s.boosts.magnet>0?'magnet':'',s.boosts.rush>0?'rush':''].filter(Boolean).join('+'):'',
      distance:s?Math.floor(s.distance):0};
    previousTimestamp=timestamp;frames.push(activeFrame);return activeFrame;
  }
  // A native probe records display gaps even when the app is paused or another
  // callback blocks. App callback CPU is aggregated into the same timestamp.
  function heartbeat(timestamp) { frame(timestamp); nativeRAF(heartbeat); }
  nativeRAF(heartbeat);
  window.requestAnimationFrame = callback => nativeRAF(timestamp => {
    const sample=frame(timestamp), began=now();
    try { return callback(timestamp); } finally {sample.callbackCPU+=now()-began;sample.callbacks++;}
  });
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
  const mapped=key=>typeof key==='string'&&key.startsWith('community-seasons')?PREFIX+key:key;
  Storage.prototype.getItem=function(key){return nativeGet.call(this,mapped(key));};
  Storage.prototype.removeItem=function(key){return nativeRemove.call(this,mapped(key));};
  Storage.prototype.setItem=function(key,value){
    const began=now();let ok=false;
    try { const result=nativeSet.call(this,mapped(key),value);ok=true;return result; }
    finally {storage.push({at:began,ms:now()-began,ok,key:typeof key==='string'&&key.startsWith('community-seasons')?key:'[other-key]',bytes:typeof value==='string'?value.length:-1});}
  };
  function errorText(error){return String(error?.message??error??'Unknown error').slice(0,300);}
  window.addEventListener('error',e=>mark('error',{message:errorText(e.error??e.message),line:e.lineno,column:e.colno}));
  window.addEventListener('unhandledrejection',e=>mark('unhandledrejection',{message:errorText(e.reason)}));
  window.addEventListener('blur',()=>mark('blur'));window.addEventListener('focus',()=>mark('focus'));
  document.addEventListener('visibilitychange',()=>mark('visibility',{state:document.visibilityState}));
  window.addEventListener('pagehide',e=>mark('pagehide',{persisted:e.persisted}));
  for (const kind of ['pointerdown','pointerup','pointercancel']) document.addEventListener(kind,e=>mark(kind,{type:e.pointerType,target:e.target?.tagName}),{capture:true,passive:true});
  function statistics(values){
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    const percentile=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null;
    return {count:sorted.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1)??null,mean:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null};
  }
  const device=()=>{
    const visual=window.visualViewport,activation=navigator.userActivation;
    return {userAgent:navigator.userAgent,language:navigator.language,languages:[...navigator.languages],dpr:devicePixelRatio,
      viewport:{width:innerWidth,height:innerHeight},
      viewportMeta:document.querySelector?.('meta[name="viewport"]')?.getAttribute('content')??null,
      visualViewport:visual?{width:visual.width,height:visual.height,scale:visual.scale,offsetLeft:visual.offsetLeft,offsetTop:visual.offsetTop}:null,
      userActivation:activation?{isActive:activation.isActive,hasBeenActive:activation.hasBeenActive}:null,
      screen:{width:screen.width,height:screen.height},visibility:document.visibilityState,focused:document.hasFocus()};
  };
  function summarize(list){const gaps=list.map(f=>f.gap).filter(Number.isFinite);return {frames:list.length,gapMs:statistics(gaps),callbackCPUMs:statistics(list.map(f=>f.callbackCPU)),renderCPUMs:statistics(list.filter(f=>f.renders).map(f=>f.renderCPU)),engineCPUMs:statistics(list.filter(f=>f.updates).map(f=>f.engineCPU)),over20_9ms:gaps.filter(n=>n>20.9).length,over33_4ms:gaps.filter(n=>n>33.4).length,over50ms:gaps.filter(n=>n>50).length};}
  function summaryObject(){
    const all=frames.values(),foreground=all.filter(f=>f.visible),groups={};
    for(const f of foreground){const key=[f.scenario,f.mode,f.scene,f.rail??'run',f.transition??'',f.turn?'turn':'',f.boosts].join('/');(groups[key]??=[]).push(f);}
    return {build:'cart-fix-qa-20260910',startedAt,exportedAt:new Date().toISOString(),elapsedMs:now()-resetAt,storagePrefix:PREFIX,device:device(),all:summarize(all),foreground:summarize(foreground),groups:Object.fromEntries(Object.entries(groups).map(([key,list])=>[key,summarize(list)])),storage:{writes:storage.values().length,writeMs:statistics(storage.values().map(s=>s.ms)),failures:storage.values().filter(s=>!s.ok).length},cloud:{operations:cloud.values().length,timingMs:statistics(cloud.values().map(s=>s.ms)),failures:cloud.values().filter(s=>!s.ok).length},events:events.values()};
  }
  window.__phoneQA={
    prefix:PREFIX,engine:null,renderer:null,
    setRun(run){liveRun=run;},get run(){return liveRun;},
    metric(kind,ms){if(!activeFrame)return;if(kind==='render'){activeFrame.renderCPU+=ms;activeFrame.renders++;}else if(kind==='engine'){activeFrame.engineCPU+=ms;activeFrame.updates++;}},
    cloudMetric(operation,ms,ok,count){cloud.push({at:now(),operation,ms,ok,count});},
    mark,label(value){label=String(value).slice(0,100);mark('scenario',{label});},
    reset(nextLabel='manual'){frames.clear();events.clear();storage.clear();cloud.clear();previousTimestamp=null;activeFrame=null;sequence=0;resetAt=now();label=String(nextLabel);mark('reset',{label});return 'QA measurements reset; game and saves unchanged.';},
    snapshot(){const s=liveRun;return s?{at:new Date().toISOString(),mode:s.mode,scene:s.scene,time:s.time,distance:s.distance,speed:s.speed,lane:s.lane,rail:s.rail?{phase:s.rail.phase,index:s.rail.index,remaining:s.rail.remaining,speed:s.rail.speed,entryNormalSpeed:s.rail.entryNormalSpeed,reward:s.rail.reward}:null,railReturnRemaining:s.railReturnRemaining,turnRemaining:s.turnRemaining,transition:s.sceneTransition,transitionFrom:s.sceneTransitionFrom,pendingScene:s.pendingScene,boosts:{...s.boosts}}:null;},
    summaryObject,summary(){return JSON.stringify(summaryObject(),null,2);},
    export({includeFrames=true}={}){return {summary:summaryObject(),frames:includeFrames?frames.values():undefined,storage:storage.values(),cloud:cloud.values()};},
    download(){const blob=new Blob([JSON.stringify(this.export(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`community-seasons-iphone-qa-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);},
  };
  mark('probe-installed',{prefix:PREFIX});
})();
