import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './compile.mjs';
const { Renderer } = await import('./compiled/render.mjs');
const { createRun, EDGE_STUMBLE_DURATION, TURN_DURATION } = await import('./compiled/engine.mjs');
const noop=()=>{};
globalThis.window={devicePixelRatio:1};
function renderer(width=390,height=760){
 const gradient={addColorStop:noop};
 const ctx=new Proxy({}, {get:(o,k)=> k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:o[k]??noop,set:(o,k,v)=>(o[k]=v,true)});
 const r=new Renderer({getContext:()=>ctx,getBoundingClientRect:()=>({width,height})}); r.resize();return r;
}
function state(scene='spring',extra={}) {return Object.assign(createRun(4182,scene),{mode:'running',time:120,distance:140,nextRow:1e9,nextPortalAt:1e9,nextRailAt:1e9,nextForkAt:1e9,obstacles:[],pickups:[],relics:[]},extra);}
function rail(phase='question',extra={}) {return {phase,questions:['respectful-disagreement'],index:0,remaining:5,duration:10,elapsed:0,optionOrder:[0,1,2],answerLane:null,correct:null,correctCount:0,failure:null,reward:0,...extra};}
test('all four seasons have distinct authored geometry and bounded reusable templates',()=>{
 const fingerprints=new Set();const counts={};
 for(const scene of ['spring','summer','autumn','winter']) {
  const r=renderer(),s=state(scene);r.render(s,0);
  counts[scene]=r.faces.length;
  fingerprints.add(JSON.stringify(r.faces.map(f=>f.points)));
  assert.ok(r.faces.length<1600,`${scene}: ${r.faces.length} faces exceeds phone budget`);
  assert.equal(r.sceneryTemplates.size,12);
  const original=[...r.sceneryTemplates.values()];
  for(let i=0;i<20;i++){s.distance+=.37;r.render(s,0);}
  assert.equal(r.sceneryTemplates.size,12);
  assert.ok(original.every(t=>[...r.sceneryTemplates.values()].includes(t)),'templates regenerated each frame');
 }
 assert.equal(fingerprints.size,4,'seasons differ only by palette');
 fs.writeFileSync(new URL('./seasonal-render-budget.json',import.meta.url),JSON.stringify(counts,null,2));
});
test('summer sailboats, autumn markets, spring flowers and snowy cabin roofs have distinct silhouettes',()=>{
 const materials={spring:'#ebafbe',summer:'#fff2d0',autumn:'#cf8860',winter:'#f0f5ed'};
 for(const [scene,material] of Object.entries(materials)){const r=renderer();r.render(state(scene),0);assert.ok(r.faces.some(f=>f.color===material),`${scene} landmark absent`);}
});
test('fork road physically separates into left and right branches while center sign blocks continuing straight',()=>{
 const r=renderer();r.render(state('spring',{fork:{at:182}}),0);
 const left=r.faces.filter(f=>f.layer===0&&f.points.every(p=>p[0]<-4&&p[2]>48));
 const right=r.faces.filter(f=>f.layer===0&&f.points.every(p=>p[0]>4&&p[2]>48));
 assert.ok(left.length>0&&right.length>0,'fork must contain two traversable road surfaces');
 assert.ok(r.faces.some(f=>f.text?.value==='←       →'));
});
test('camera rotates with the physical quarter-circle and lines up with the chosen road',()=>{
 const r=renderer(),s=state('spring',{lastForkAt:140,turnEntryX:1.65,turnDirection:1,turnRemaining:TURN_DURATION*.5,speed:54});r.render(s,0);
 assert.ok(r.cameraYaw>Math.PI/4&&r.cameraYaw<Math.PI/2,'camera does not follow the road heading');
 assert.ok(Math.abs(r.project([0,0,0])[0]-r.project([0,.9,0])[0])<1e-8,'camera moves the TV away from the new road center');
 assert.ok(Math.abs(r.project([0,0,0])[0]-r.center)<r.w*.35,'turn pans the player out of view');
 const point=r.project([0,0,35]);
 const lane=[[-.8,0,33.5],[.8,0,33.5],[.8,0,36.5],[-.8,0,36.5]].map(p=>r.project(p));
 const crosses=lane.map((a,i)=>{const b=lane[(i+1)%4];return(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);});
 assert.ok(crosses.every(v=>v>=0)||crosses.every(v=>v<=0),'road object no longer sits on its projected lane');
 s.turnRemaining=TURN_DURATION*.001;r.render(s,0);
 assert.ok(r.cameraYaw>1.56);assert.ok(Math.abs(r.project([0,0,70])[0]-r.center)<2,'camera never aligns to the outgoing road');
 s.turnDirection=-1;s.turnEntryX=-1.65;s.turnRemaining=TURN_DURATION*.5;r.render(s,0);assert.ok(r.cameraYaw<-.78);
});
test('ordinary lane dodges use subtle camera follow and turn the TV without a full road turn',()=>{
 const r=renderer(),s=state('spring',{x:.7,lane:1});r.render(s,0);
 assert.equal(r.cameraYaw,0);assert.ok(r.cameraShift>0&&r.cameraShift<.15);assert.ok(Math.abs(r.cameraRoll)<.01);
 const turning=renderer();turning.runner(s,0);const straight=renderer();straight.runner({...s,lane:s.x/1.65},0);
 assert.notDeepEqual(turning.faces,straight.faces,'TV only slides sideways instead of steering');
});
test('fork approach follows the occupied lane early and retains road and TV coordinates at crossing',()=>{
 for(const dir of [-1,1])for(const entry of [1.05,1.65]){
  const r=renderer(),s=state('spring',{speed:30,x:dir*entry,lane:dir,fork:{at:200},distance:141});
  r.render(s,0);assert.equal(Math.sign(r.cameraYaw),dir,'camera waits until the junction to follow');
  const distantYaw=Math.abs(r.cameraYaw);s.distance=175;r.render(s,0);
  assert.ok(Math.abs(r.cameraYaw)>distantYaw,'camera does not progressively anticipate the turn');
  s.distance=200;r.render(s,0);
  const playerBefore=r.project([s.x,0,0]);
  const roadBefore=[];
  for(const depth of [-6,0,6,20,60])for(const x of [-2.45,0,2.45]) roadBefore.push(r.projectView(r.roadPoint(depth < 0 ? 0 : dir,x,0,depth)));
  s.turnEntryX=s.x;s.lastForkAt=200;s.fork=null;s.turnDirection=dir;s.turnRemaining=TURN_DURATION;s.x=0;s.lane=0;r.render(s,0);
  const playerAfter=r.project([r.turnEntryOffset,0,0]);
  const roadAfter=[];
  for(const depth of [-6,0,6,20,60])for(const x of [-2.45,0,2.45]) roadAfter.push(r.projectView(r.roadPoint(depth < 0 ? 0 : dir,x,0,depth)));
  for(const [before,after] of [[playerBefore,playerAfter],...roadBefore.map((p,i)=>[p,roadAfter[i]])]){
   assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])<1e-7,'road or player snaps at the junction');
  }
 }
});
test('both outer lanes stay on the split road all the way to the fork',()=>{
 const inside=(p,poly)=>{const signs=poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return(b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);});return signs.every(v=>v>=-.06)||signs.every(v=>v<=.06);};
 for(let remaining=23;remaining>=0;remaining-=.5){
  const r=renderer(),s=state('spring',{fork:{at:200},distance:200-remaining});r.render(s,0);
  const road=r.faces.filter(f=>f.layer===0&&['#d8cdb1','#cfc2a5','#c4b99f'].includes(f.color));
  for(const dir of [-1,1])assert.ok(road.some(f=>inside(r.cameraPoint([dir*1.65,0,0]),f.points)),`lane ${dir} loses its road ${remaining}m before fork`);
 }
});
test('rail question draws three answer gates, seated TV and no normal obstacles or coins',()=>{
 const r=renderer();const s=state('autumn',{rail:rail(),pickups:[{id:1,lane:0,at:150,height:1,taken:false}],obstacles:[{id:1,lane:0,at:170,kind:'pillar',resolved:false}],chase:5});
 r.render(s,0);
 assert.deepEqual(r.faces.filter(f=>['A','B','C'].includes(f.text?.value)).map(f=>f.text.value).sort(),['A','B','C']);
 assert.equal(r.faces.some(f=>f.color==='#ffca63'||f.color==='#f0d9cc'||f.text?.value==='SPAM!!'),false);
 assert.ok(r.faces.some(f=>f.color==='#78c1c2'));
 assert.ok(r.faces.length<1600);
});
test('answer gates reach the cart when judged and continue behind during feedback',()=>{
 const r=renderer(),s=state('spring',{rail:rail('question',{remaining:0})});r.railTracks(s);
 assert.ok(r.faces.filter(f=>['A','B','C'].includes(f.text?.value)).every(f=>Math.abs(f.z)<.2));
 s.rail=rail('feedback',{remaining:.6,duration:1.6,answerLane:0,correct:true});r.faces=[];r.railTracks(s);
 assert.equal(r.faces.some(f=>['A','B','C'].includes(f.text?.value)),false,'passed gates remain ahead of cart');
});
test('wrong answer leaves a broken selected track and visibly lowers the cart',()=>{
 const r=renderer();let s=state('winter',{rail:rail('falling',{answerLane:0,correct:false,remaining:1.2,duration:1.2})});
 r.railTracks(s);
 assert.equal(r.faces.some(f=>f.color==='#cedbd3'&&f.points.every(p=>Math.abs(p[0])<.8)&&f.points.some(p=>p[2]>0)),false);
 r.faces=[];r.railCart(s,0);const high=Math.max(...r.faces.flatMap(f=>f.points.map(p=>p[1])));
 s.rail.remaining=.3;r.faces=[];r.railCart(s,0);const low=Math.max(...r.faces.flatMap(f=>f.points.map(p=>p[1])));
 assert.ok(high-low>3,'cart does not fall visibly');
});
test('only judged answers reveal both broken wrong tracks, respecting shuffled options',()=>{
 for(const phase of ['question','feedback','falling'])for(const order of [[0,1,2],[1,0,2],[2,1,0]]){
  const r=renderer(),s=state('spring',{rail:rail(phase,{optionOrder:order,remaining:.8,duration:1.6,answerLane:0})});
  r.railTracks(s);
  for(let lane=-1;lane<=1;lane++){
   const railAhead=r.faces.some(f=>f.color==='#cedbd3'&&f.points.every(p=>Math.abs(p[0]-lane*1.65)<.7&&p[2]>7&&p[2]<21));
   assert.equal(railAhead,phase==='question'||lane===order.indexOf(0)-1,`${phase}: lane ${lane}, order ${order}`);
  }
  assert.equal(r.faces.filter(f=>f.color==='#9c795e').length,phase==='question'?0:6);
 }
});
test('completion keeps the same seated cart and selected lane until the transport tunnel',()=>{
 const r=renderer(),s=state('autumn',{x:1.65,lane:1,rail:rail('complete',{remaining:0,duration:2})});
 const before=structuredClone(s);r.railCart(s,0);
 const seated=renderer();seated.railCart({...s,rail:{...s.rail,phase:'feedback'}},0);
 assert.deepEqual(r.faces,seated.faces);assert.deepEqual(s,before);
});
test('portal thumbnails use actual destination geometry only once per season',()=>{
 const r=renderer();let canvases=0;
 r.canvas.ownerDocument={createElement(){canvases++;const child=renderer();return {width:0,height:0,getContext:()=>child.ctx};}};
 for(const scene of ['spring','summer','autumn','winter']) {
  const first=r.portalPreview(scene),second=r.portalPreview(scene);
  assert.equal(first,second);assert.equal(first.width,256);assert.equal(first.height,512);
 }
 assert.equal(canvases,4);assert.equal(r.portalPreviews.size,4);
});
test('edge stumble recoils inward from either blocked side and recovers with feet above the path',()=>{
 for(const dir of [-1,1]) {
  const r=renderer(),s=state('spring',{x:dir*1.65,edgeStumble:EDGE_STUMBLE_DURATION/2,edgeStumbleDirection:dir});
  r.runner(s,0);
  const body=r.faces.filter(f=>f.color==='#72d0e7').flatMap(f=>f.points);
  assert.ok(body.reduce((n,p)=>n+p[0],0)/body.length*dir<1.65,'TV does not recoil back onto the path');
  assert.ok(Math.min(...r.faces.flatMap(f=>f.points.map(p=>p[1])))>=.029);
  assert.equal(r.faces.filter(f=>f.color==='#ffdf95').length,3);
 }
});
test('export actual seasonal and activity geometry for visual review',()=>{
 const cases=[['Spring park',state('spring')],['Summer boardwalk',state('summer')],['Autumn market',state('autumn')],['Winter village',state('winter')],['Fork ahead',state('spring',{fork:{at:182}})],['Turning right',state('summer',{turnEntryX:1.65,turnDirection:1,turnRemaining:TURN_DURATION*.8})],['Rail question',state('autumn',{rail:rail()})],['Cart fall',state('winter',{rail:rail('falling',{answerLane:0,correct:false,remaining:.65,duration:1.2})})]];
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1520" viewBox="0 0 1600 1520">';
 for(const [i,[title,s]] of cases.entries()) {
  const r=renderer(400,760);r.render(s,0);svg+=`<svg x="${i%4*400}" y="${Math.floor(i/4)*760}" width="400" height="760" viewBox="0 0 400 760"><rect width="400" height="760" fill="#bdd9d3"/><rect y="220" width="400" height="540" fill="${{spring:'#78a582',summer:'#65b5bd',autumn:'#ae9c70',winter:'#d8e4e6'}[s.scene]}"/>`;
  for(const face of r.faces){if(r.curveStrength>0&&face.points.some(p=>r.cameraPoint(p)[2]<-9))continue;const pts=face.points.map(p=>r.project(p));svg+=`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${face.color}"/>`;if(face.text?.value){const x=pts.reduce((n,p)=>n+p[0],0)/pts.length,y=pts.reduce((n,p)=>n+p[1],0)/pts.length;svg+=`<text x="${x}" y="${y}" text-anchor="middle" fill="${face.text.color}" font-family="sans-serif" font-size="9">${face.text.value.replaceAll('&','&amp;').replaceAll('<','&lt;')}</text>`;}}
  svg+=`<rect x="0" y="0" width="400" height="42" fill="#0a2b24"/><text x="200" y="29" text-anchor="middle" fill="#f0ddb5" font-family="sans-serif" font-size="18">${title}</text></svg>`;
 }
 svg+='</svg>';fs.writeFileSync(new URL('./seasonal-road-poses.svg',import.meta.url),svg);
});
