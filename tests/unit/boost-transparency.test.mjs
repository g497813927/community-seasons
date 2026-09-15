import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/compile.mjs';
const {Renderer}=await import('../helpers/compiled/render.mjs');
const {createRun,update}=await import('../helpers/compiled/engine.mjs');
const {createRailRide}=await import('../helpers/compiled/railway.mjs');
globalThis.window={devicePixelRatio:1};
const noop=()=>{};
function state(){return Object.assign(createRun(4182,'spring'),{mode:'running',time:20,distance:300,nextRow:1e9,nextForkAt:1e9,nextRailAt:1e9,nextPortalAt:1e9,obstacles:[],pickups:[],relics:[]});}
function renderer(){
 const fills=[],texts=[],alphaWrites=[],stack=[];
 const gradient={addColorStop:noop};
 const ctx=new Proxy({globalAlpha:1,
  fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha});},
  fillText(value){texts.push({value,alpha:this.globalAlpha});},
  save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()??1;},
 },{get:(o,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:o[k]??noop,
 set:(o,k,v)=>{if(k==='globalAlpha')alphaWrites.push(v);o[k]=v;return true;}});
 const r=new Renderer({getContext:()=>ctx,getBoundingClientRect:()=>({width:440,height:752})});r.resize();
 return{r,ctx,fills,texts,alphaWrites};
}
const bare=faces=>faces.map(({opacity,...rest})=>rest);
test('only obstacle-ignoring boosts gently pulse the same intact TV geometry',()=>{
 for(const kind of ['rush','headstart','portal']){
  const values=[];
  for(let time=0;time<=2;time+=.125){
   const s=state();s.time=time;const normal=renderer().r;normal.runner(s,0);
   s.boosts[kind]=8;const before=structuredClone(s),active=renderer().r;active.runner(s,0);
   assert.deepEqual(bare(active.faces),normal.faces,'boost changed the body geometry/material/depth');
   assert.deepEqual(s,before,'drawing changed the simulation');
   assert.ok(active.faces.every(f=>f.opacity>=.45-1e-9&&f.opacity<=.65+1e-9));
   assert.equal(new Set(active.faces.map(f=>f.opacity)).size,1,'body parts pulse out of sync');
   values.push(active.faces[0].opacity);
  }
  assert.ok(Math.max(...values)-Math.min(...values)>.18,'pulse does not animate');
 }
});
test('magnet, double coins, shield, recovery grace and expired boosts remain opaque',()=>{
 for(const kind of ['magnet','doubleCoins','shield','grace']){
  const s=state();s.boosts[kind]=8;const{r}=renderer();r.runner(s,50);
  assert.ok(r.faces.every(f=>f.opacity===undefined),`${kind} incorrectly signals blanket invulnerability`);
 }
 for(const kind of ['rush','headstart','portal']){
  const s=state();s.boosts[kind]=.01;update(s,.02);const{r}=renderer();r.runner(s,50);
  assert.equal(s.boosts[kind],0);assert.ok(r.faces.every(f=>f.opacity===undefined),'expired boost leaves the TV translucent');
 }
});
test('pause freezes pulse despite wall clock movement, and quiz passengers stay opaque',()=>{
 const s=state();s.mode='paused';s.boosts.rush=5;
 const a=renderer().r,b=renderer().r;a.render(s,1);b.render(s,500);
 assert.deepEqual(a.faces,b.faces,'wall clock changes paused boost geometry/opacity');
 s.rail=createRailRide(()=>.5);const{r}=renderer();r.railCart(s,500);
 assert.ok(r.faces.length>0&&r.faces.every(f=>f.opacity===undefined),'cart/quiz passenger appears invulnerable');
});
test('runner marking never affects existing world faces, pursuers, labels or subsequent draws',()=>{
 const s=state();s.boosts.rush=5;s.chase=3;
 const{r,ctx,fills,texts}=renderer();
 r.face([[-1,0,5],[1,0,5],[1,1,5],[-1,1,5]],'#123456');
 r.runner(s,0);const end=r.faces.length;r.commenters(s,0,'en');
 assert.equal(r.faces[0].opacity,undefined);
 assert.ok(r.faces.slice(1,end).every(f=>f.opacity!==undefined));
 assert.ok(r.faces.length>end&&r.faces.slice(end).every(f=>f.opacity===undefined));
 s.obstacles=[{id:1,kind:'block',lane:-1,at:310,resolved:false}];
 r.render(s,0);
 assert.ok(fills.some(f=>f.alpha<1),'actual draw loop ignores face opacity');
 assert.ok(fills.filter(f=>['#d8cdb1','#cfc2a5','#c4b99f','#f0d9cc','#583644','#39334f'].includes(f.color)).every(f=>f.alpha===1),'opacity leaks onto world/pursuers');
 assert.ok(texts.length>0&&texts.every(t=>t.alpha===1),'obstacle/pursuer labels became transparent');
 assert.equal(ctx.globalAlpha,1);
});
