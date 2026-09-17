import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { compileGameModules } from '../helpers/compile-game-modules.mjs';

const out = new URL('./renderer-fuzz/', import.meta.url);
const sourceHashes = compileGameModules(new URL('compiled/', out));
const { Renderer } = await import('./renderer-fuzz/compiled/render.mjs');
const E = await import('./renderer-fuzz/compiled/engine.mjs');
const Store = await import('./renderer-fuzz/compiled/store.mjs');
const { nextScene } = await import('./renderer-fuzz/compiled/scenes.mjs');
globalThis.window = { devicePixelRatio: 2 };
const scenes = ['spring','summer','autumn','winter'];
const sizes = [[320,568],[390,844],[440,752],[844,390],[740,360],[1024,600],[1280,720],[256,512]];
const locales = ['en','zh-CN'];
const coverage = { scenes:{},locales:{},sizes:{},phases:{},boosts:{},modes:{},directions:{},landscape:0,pulsedFrames:0,previewDraws:0 };
const summary = { version:1,sourceHashes,seeds:0,scenarios:0,frames:0,drawCalls:0,vertices:0,maxFaces:0,maxSceneryTemplates:0,maxCanvasSaveDepth:0,coverage };
let current = null;
const seedOffset=Number(process.env.RENDERER_FUZZ_OFFSET??0);
summary.seedOffset=seedOffset;
function rng(seed) { let s=seed>>>0; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
function add(bucket,key) { bucket[key]=(bucket[key]??0)+1; }
function finite(values,where) { for (const n of values) assert.equal(typeof n==='number'&&Number.isFinite(n),true,`${where}: non-finite ${String(n)}`); }
function canvas(width,height,child=false) {
  const stack=[]; const properties={globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1};
  function gradient(...args) { finite(args,'gradient'); return {addColorStop(at,color){finite([at],'color stop');assert.ok(at>=0&&at<=1);assert.ok(typeof color==='string'&&!/NaN|Infinity/.test(color));}}; }
  const methods = {
    createLinearGradient:gradient,createRadialGradient:gradient,
    save(){stack.push({...properties});summary.maxCanvasSaveDepth=Math.max(summary.maxCanvasSaveDepth,stack.length);},
    restore(){assert.ok(stack.length,'restore without save');Object.assign(properties,stack.pop());},
    beginPath(){},closePath(){},fill(){summary.drawCalls++;},stroke(){summary.drawCalls++;},clip(){},
    measureText(text){return {width:String(text).length*8};},
    drawImage(image,...args){assert.ok(image&&image.getContext,'preview must be a real fixture canvas');finite(args,'drawImage');assert.ok(args[2]>=0&&args[3]>=0,'negative image dimensions');summary.drawCalls++;if(child)coverage.previewDraws++;},
    fillText(text,...args){assert.equal(typeof text,'string');finite(args,'fillText');summary.drawCalls++;},
    arc(x,y,r,...rest){finite([x,y,r,...rest.filter(v=>typeof v==='number')],'arc');assert.ok(r>=0,'negative radius');},
    ellipse(x,y,rx,ry,...rest){finite([x,y,rx,ry,...rest.filter(v=>typeof v==='number')],'ellipse');assert.ok(rx>=0&&ry>=0,'negative ellipse radius');},
  };
  for(const method of ['moveTo','lineTo','fillRect','clearRect','strokeRect','translate','rotate','scale','transform','setTransform','bezierCurveTo','quadraticCurveTo']) methods[method]=(...args)=>{finite(args,method);summary.drawCalls++;};
  const ctx = new Proxy(properties,{
    get(o,k){if(k in methods)return methods[k];if(k in o)return o[k];throw new Error(`Unvalidated canvas API ${String(k)}`);},
    set(o,k,v){if(typeof v==='number')finite([v],`ctx.${String(k)}`);if(k==='globalAlpha')assert.ok(v>=0&&v<=1,`invalid alpha ${v}`);if(typeof v==='string')assert.ok(!/NaN|Infinity/.test(v),`invalid ${String(k)} ${v}`);o[k]=v;return true;}
  });
  return {width,height,getContext:()=>ctx,getBoundingClientRect(){return {width:this.widthCss??width,height:this.heightCss??height};},ownerDocument:{createElement(tag){assert.equal(tag,'canvas');coverage.previewDraws++;return canvas(256,512,true);}},ctx,stack};
}
function makeRenderer(size) { const c=canvas(...size),r=new Renderer(c);r.resize();return {r,c}; }
function base(seed,scene,distance=0) {
  const s=E.createRun(seed,scene);
  Object.assign(s,{mode:'running',distance,time:distance===0?0:70+distance/12,speed:Math.min(66,12+distance*.006),nextRow:distance+35,nextForkAt:Infinity,nextRailAt:Infinity,nextPortalAt:Infinity,nextRelicAt:distance+45});
  E.generateAhead(s);return s;
}
function checkFrame(renderer,s,wall,locale,tag,preview=false) {
  const {r,c}=renderer;
  current.tag=tag;current.lastState=structuredClone(s);
  const before=JSON.stringify({...s,flash:undefined});
  const flash=s.flash;
  r.render(s,wall,preview,locale);
  assert.equal(JSON.stringify({...s,flash:undefined}),before,'render changed gameplay state');
  assert.equal(s.flash,s.mode==='over'&&flash>0?Math.max(0,flash-.016):flash,'unexpected flash mutation');
  assert.equal(c.ctx.globalAlpha,1,'alpha leaked after render');
  assert.equal(c.ctx.globalCompositeOperation,'source-over','composite leaked');
  assert.equal(c.stack.length,0,'canvas save leaked');
  assert.ok(r.faces.length<5000,`unbounded faces ${r.faces.length}`);
  assert.ok(r.portalPreviews.size<=4&&r.railPreviews.size<=4,'unbounded preview cache');
  assert.ok(r.sceneryTemplates.size<=48,`unbounded scenery cache ${r.sceneryTemplates.size}`);
  for(const face of r.faces){
    finite([face.z,face.layer],'face sort');
    for(const point of face.points){finite(point,'world point');summary.vertices++;}
    const view=r.faceView(face);for(const point of view)finite(point,'camera point');
    const clipped=r.clipNear(view);for(const point of clipped){finite(point,'clipped point');assert.ok(point[2]>=-9-1e-7,'near clipping retained invalid depth');finite(r.projectView(point),'projection');}
    if(face.opacity!==undefined)assert.ok(face.opacity>=.45-1e-8&&face.opacity<=.65+1e-8,'boost pulse outside range');
  }
  summary.maxFaces=Math.max(summary.maxFaces,r.faces.length);
  summary.maxSceneryTemplates=Math.max(summary.maxSceneryTemplates,r.sceneryTemplates.size);
  summary.frames++;
  add(coverage.scenes,s.scene);add(coverage.locales,locale);add(coverage.sizes,`${r.w}x${r.h}`);add(coverage.phases,tag);add(coverage.modes,s.mode);
  if(r.landscapeOnly)coverage.landscape++;
  if(r.faces.some(f=>f.opacity!==undefined))coverage.pulsedFrames++;
  for(const kind of ['rush','headstart','portal','magnet','shield','doubleCoins'])if(s.boosts[kind]>0)add(coverage.boosts,kind);
}
function scenario(seed,name,scene,body) {
  if(process.env.RENDERER_FUZZ_SEED&&seed!==Number(process.env.RENDERER_FUZZ_SEED))return;
  if(process.env.RENDERER_FUZZ_SCENARIO&&name!==process.env.RENDERER_FUZZ_SCENARIO)return;
  const random=rng(seed^name.length*1831),size=sizes[(seed>>>4)%sizes.length],renderer=makeRenderer(size);
  current={seed,name,scene,size,actions:[]};summary.scenarios++;
  body(random,renderer);
}
function step(s,dt,action) {current.actions.push({dt,action});if(action)E.act(s,action);E.update(s,dt);}
const started=performance.now();
try {
  const seeds=process.env.RENDERER_FUZZ_SEED ? [Number(process.env.RENDERER_FUZZ_SEED)] : Array.from({length:Number(process.env.RENDERER_FUZZ_SEEDS??224)},(_,i)=>(Number(process.env.RENDERER_FUZZ_BASE_SEED??4182)+Math.imul(i+seedOffset,2654435761))>>>0);
  for(const seed of seeds){
    if(process.env.RENDERER_FUZZ_SEED&&seed!==Number(process.env.RENDERER_FUZZ_SEED))continue;
    summary.seeds++;
    const scene=scenes[seed%4];
    scenario(seed,'normal',scene,(random,renderer)=>{
      const boost=['rush','headstart','portal','magnet','shield','doubleCoins'][seed%6];
      const distance=['headstart','portal'].includes(boost)?0:[0,350,2300,8950,13000][seed%5],s=base(seed,scene,distance);
      if(boost==='portal'){
        const progress=Store.createProgress();progress.scene=scene;progress.portalDestination=nextScene(scene);progress.inventory.portal=1;
        assert.ok(Store.activateOwnedBooster(s,progress,'portal').ok);
      }else assert.ok(E.activateBoost(s,boost,1+seed%3));
      for(let i=0;i<24;i++){
        if(s.review)E.finishReview(s);
        const action=['left','right','jump','slide',undefined][Math.floor(random()*5)];
        step(s,[1/120,1/60,.05,.1,.25][Math.floor(random()*5)],action);
        if(i%3===0||s.mode==='over')checkFrame(renderer,s,100+i,locales[i%2],`normal-${s.edgeStumble>0?'recoil':s.mode}`);
        if(s.mode==='over')break;
      }
      const mode=s.mode;s.mode='paused';checkFrame(renderer,s,500,'en','paused');checkFrame(renderer,s,900,'zh-CN','paused');s.mode=mode;
      renderer.r.landscapeOnly=true;checkFrame(renderer,s,901,'en','landscape',true);renderer.r.landscapeOnly=false;
      s.mode='ready';for(let i=0;i<3;i++)checkFrame(renderer,s,1000+i*.1,locales[i%2],'attract');
    });
    for(const direction of [-1,1])scenario(seed,`fork-${direction}`,scene,(random,renderer)=>{
      const s=base(seed,scene,[470,3500,9000][seed%3]);s.nextForkAt=s.distance+8+random()*45;s.fork=null;E.update(s,.001);
      // Keep explicit left/right turn coverage while retaining generated
      // dead ends on the opposite side of each selected fixture branch.
      if(s.fork.blockedDirection)s.fork.blockedDirection=-direction;
      s.lane=direction;s.x=direction*E.LANE_WIDTH;
      checkFrame(renderer,s,0,'en','fork-approach');
      let turned=false,finished=false;
      for(let i=0;i<110;i++){
        step(s,.05);
        if(s.turnRemaining>0){turned=true;add(coverage.directions,direction);if(i%3===0)checkFrame(renderer,s,i*.05,locales[i%2],'fork-turn');}
        else if(turned){if(i%3===0)checkFrame(renderer,s,i*.05,locales[i%2],'fork-exit');if(i*.05>4.5){finished=true;break;}}
        else if(i%4===0)checkFrame(renderer,s,i*.05,locales[i%2],'fork-approach');
        if(s.mode==='over'){assert.ok(turned,'fixture failed to select open fork');checkFrame(renderer,s,i*.05,'en','fork-exit-over');finished=true;break;}
      }
      assert.ok(turned&&finished,'fork coverage did not traverse exit');
    });
    scenario(seed,'rail',scene,(random,renderer)=>{
      const s=base(seed,scene,[980,4500,10000][seed%3]);s.nextRailAt=s.distance+.1;E.update(s,.025);assert.ok(s.rail,'rail never entered');
      const wrong=seed%2===0;let last='',sawReturn=false;
      for(let i=0;i<300;i++){
        if(s.rail?.phase==='question'){
          const question=E.currentRailQuestion(s),index=s.rail.optionOrder.indexOf(question.correctIndex);
          E.selectRailLane(s,((wrong&&s.rail.index===seed%3)?(index+1)%3:index)-1);
        }
        const phase=s.rail?.phase??(s.railReturnRemaining>0?'return':'run');
        if(phase!==last||i%11===0){checkFrame(renderer,s,i*.25,locales[i%2],`rail-${phase}`);last=phase;}
        if(s.railReturnRemaining>0)sawReturn=true;
        if(s.mode==='over'){checkFrame(renderer,s,i*.25,'zh-CN','rail-over');break;}
        if(sawReturn&&!s.rail&&s.railReturnRemaining===0){checkFrame(renderer,s,i*.25,'en','rail-resumed');break;}
        step(s,.25);
      }
      assert.ok(wrong?s.mode==='over':sawReturn,'rail fixture did not reach its intended outcome');
    });
    scenario(seed,'transport',scene,(random,renderer)=>{
      const s=base(seed,scene,2450);s.nextPortalAt=2500;s.portalLane=seed%3-1;
      checkFrame(renderer,s,0,'en','transport-gate');
      assert.equal(E.startSceneTravel(s,nextScene(scene)),true);
      for(let i=0;i<11;i++){checkFrame(renderer,s,i*.2,locales[i%2],'transport-transition');step(s,.2);}
      assert.equal(s.scene,nextScene(scene));
      checkFrame(renderer,s,3,'en','transport-arrived');
    });
    if(performance.now()-started>=Number(process.env.RENDERER_FUZZ_BUDGET_MS??170000)){const error=new Error('Renderer reached its configured runtime budget; increase --budget-seconds.');error.code='FUZZ_TIME_BUDGET';throw error;}
  }
  assert.ok(summary.frames>0,'no renderer samples');
  if(!process.env.RENDERER_FUZZ_SEED&&!process.env.RENDERER_FUZZ_SCENARIO&&summary.seeds>=16){
  assert.ok(summary.frames>500,'insufficient renderer samples');
  for(const key of ['fork-approach','fork-turn','fork-exit','rail-boarding','rail-question','rail-feedback','rail-falling','rail-complete','rail-return','rail-resumed','transport-transition','attract','landscape','paused'])assert.ok(coverage.phases[key],`missing ${key} coverage`);
  assert.equal(Object.keys(coverage.scenes).length,4);assert.equal(Object.keys(coverage.sizes).length,8);assert.equal(Object.keys(coverage.boosts).length,6);assert.ok(coverage.pulsedFrames>0);
  }
  summary.status='passed';
  fs.rmSync(new URL('repro.json',out),{force:true});
} catch(error) {
  summary.status=error.code==='FUZZ_TIME_BUDGET'?'time-budget':'failed';summary.failure={message:error.message,stack:error.stack,...current};
  fs.writeFileSync(new URL('repro.json',out),JSON.stringify(summary.failure,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,2));
  process.exitCode=error.code==='FUZZ_TIME_BUDGET'?3:1;
}
summary.elapsedSeconds=(performance.now()-started)/1000;
fs.writeFileSync(new URL('results.json',out),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,sourceHashes:undefined,failure:summary.failure?{seed:current.seed,name:current.name,tag:current.tag,message:summary.failure.message}:undefined},null,2));
