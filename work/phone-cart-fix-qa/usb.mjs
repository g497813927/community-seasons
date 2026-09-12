// Explicitly scoped phone diagnostics for this isolated cart preview only.
import fs from 'node:fs';
const action=process.argv[2]??'status';
if(!['status','start','begin','arm','export','screenshot'].includes(action))throw Error('Unsupported action');
const config=JSON.parse(fs.readFileSync('work/phone-cart-fix-qa/preview.json','utf8'));
const pageUrl=new URL(config.preview_url);
if(pageUrl.origin!=='https://www.bilibili.com'||!/^\/toy\/preview\/preview_\w+\/index.html$/.test(pageUrl.pathname))throw Error('Invalid isolated preview');
const deadline=setTimeout(()=>{console.error('Phone cart QA connection timed out.');process.exit(2);},25000);
let ws;
try{
 const rows=await(await fetch('http://127.0.0.1:9223/json/list',{signal:AbortSignal.timeout(5000)})).json();
 const target=rows.find(t=>t.url===pageUrl.href);if(!target)throw Error('Specific cart preview is not open on phone');
 ws=new WebSocket(target.webSocketDebuggerUrl);let sequence=0;const pending=new Map(),contexts=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.executionContextCreated')contexts.push(m.params.context);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 await call('Runtime.enable');await call('Page.enable');const tree=await call('Page.getFrameTree');
 await new Promise(r=>setTimeout(r,300));
 const frames=[];const visit=x=>{if(!x)return;frames.push(x.frame);for(const f of x.childFrames??[])visit(f);};visit(tree.frameTree);
 const frame=frames.find(f=>{try{const u=new URL(f.url);return u.origin==='https://www.bilibilitoy.com'&&u.pathname===pageUrl.pathname;}catch{return false;}});
 const context=contexts.find(c=>c.auxData?.frameId===frame?.id&&c.auxData?.isDefault);if(!context)throw Error('Cart preview frame not ready');
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{contextId:context.id,expression,returnByValue:true});if(r.exceptionDetails||r.wasThrown)throw Error(JSON.stringify(r.exceptionDetails??r.result));return r.result?.value;};
 if(await evaluate('window.__phoneQA?.prefix')!=='qa-cart-20260910-')throw Error('Refusing access outside isolated cart preview');
 let result;
 if(action==='arm')result=await evaluate('JSON.stringify(__cartQA.arm())');
 if(action==='begin'){
  result=await evaluate(`(() => { if (!navigator.userActivation.hasBeenActive || !document.hasFocus() || document.visibilityState !== 'visible') throw Error('Real touch and visible Safari required'); const b=[...document.querySelectorAll('.run-setup-dialog button')].find(b=>b.textContent.trim()==='Begin run' && !b.disabled && b.getClientRects().length); if(!b) throw Error('Visible Begin run control unavailable'); b.click(); return 'Started using the actual Begin run control'; })()`);
  await new Promise(r=>setTimeout(r,100));
  result=await evaluate('JSON.stringify(__cartQA.status().status === "running" ? __cartQA.status() : __cartQA.start())');
 }
 if(action==='start')result=await evaluate('JSON.stringify(__cartQA.start())');
 if(action==='status')result=await evaluate('JSON.stringify({visible:document.visibilityState,focused:document.hasFocus(),activated:navigator.userActivation.hasBeenActive,cart:__cartQA.status(),run:__phoneQA.snapshot(),buttons:[...document.querySelectorAll("button")].filter(b=>b.getClientRects().length).map(b=>({text:b.textContent,aria:b.getAttribute("aria-label"),disabled:b.disabled}))})');
 if(action==='export'){
  result=await evaluate('JSON.stringify({cart:__cartQA.export(),probe:__phoneQA.export(),device:{userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visible:document.visibilityState}})');
  fs.writeFileSync('work/phone-cart-fix-qa/physical-result.json',result+'\n');result='Saved scoped physical-result.json';
 }
 if(action==='screenshot'){
  const r=await call('Page.captureScreenshot',{format:'png'});if(typeof r.data!=='string')throw Error('Screenshot unavailable');fs.writeFileSync('work/phone-cart-fix-qa/physical-screenshot.png',Buffer.from(r.data,'base64'));result='Saved physical-screenshot.png';
 }
 console.log(result);
}catch(e){console.error(String(e));process.exitCode=1;}finally{ws?.close();clearTimeout(deadline);}
