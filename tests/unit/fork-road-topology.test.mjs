import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/compile.mjs';
const {Renderer}=await import('../helpers/compiled/render.mjs');
const {createRun,MAX_SPEED,LANE_WIDTH,TURN_DURATION}=await import('../helpers/compiled/engine.mjs');
globalThis.window={devicePixelRatio:1};
const noop=()=>{};
function setup(speed=15){
 const gradient={addColorStop:noop};
 const ctx=new Proxy({}, {get:(o,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>gradient:o[k]??noop,set:(o,k,v)=>(o[k]=v,true)});
 const r=new Renderer({getContext:()=>ctx,getBoundingClientRect:()=>({width:440,height:752})});r.resize();
 const s=Object.assign(createRun(4182,'spring'),{mode:'running',time:100,distance:432,speed,lane:0,x:0,fork:{at:472},nextForkAt:1e9,nextRailAt:1e9,nextPortalAt:1e9,obstacles:[],pickups:[],relics:[]});
 r.render(s,0);return{r,s};
}
function containsXZ(face,x,z){
 const p=face.points;
 const signs=p.map((a,i)=>{const b=p[(i+1)%p.length];return(b[0]-a[0])*(z-a[2])-(b[2]-a[2])*(x-a[0]);});
 return signs.every(v=>v>=-1e-7)||signs.every(v=>v<=1e-7);
}
const roadColors=['#d8cdb1','#cfc2a5','#c4b99f'];
test('incoming three lanes have one surface each, with no duplicated crossing decks',()=>{
 const{r}=setup();const road=r.faces.filter(f=>f.layer===0&&roadColors.includes(f.color));
 for(const z of [21.2,24.2,27.2,30.2,33.2,36.2,39.2])
  for(const x of [-LANE_WIDTH,0,LANE_WIDTH])
   assert.equal(road.filter(f=>containsXZ(f,x,z)).length,1,`overlapping/missing road at ${x},${z}`);
 assert.equal(road.filter(f=>containsXZ(f,0,41)).length,0,'closed center lane continues beyond the junction');
 assert.equal(r.faces.some(f=>f.layer===0&&f.color==='#78a582'),false,'independent ground overlay still cuts the road');
});
test('one-lane exits keep their inner curbs separated through low, maximum and doubled-speed arcs',()=>{
 for(const speed of [12,MAX_SPEED,MAX_SPEED*2]){
  const{r}=setup(speed);
  assert.ok(r.turnRoadWidth(0)>=.32&&r.turnRoadWidth(0)<=.34);
  for(let along=0;along<=r.turnArcLength+30;along+=.25){
   const z=r.forkDepth+along;
   const left=r.roadPoint(-1,2.69,0,z),right=r.roadPoint(1,-2.69,0,z);
   assert.ok(right[0]-left[0]>=1.09,`inner curbs intersect at speed ${speed}, depth ${along}`);
  }
  assert.equal(r.turnRoadWidth(speed*2.8),1,'post-turn obstacle row is wider than the roadway');
 }
});
test('both streets and the shared trunk retain their projected coordinates across commitment',()=>{
 for(const dir of [-1,1])for(const speed of [15,MAX_SPEED]){
  const{r,s}=setup(speed);s.distance=472;s.x=dir*LANE_WIDTH;s.lane=dir;r.render(s,0);
  const samples=[{branch:0,z:-6},{branch:0,z:0},{branch:-1,z:0},{branch:1,z:0},{branch:-1,z:10},{branch:1,z:10},{branch:-1,z:55},{branch:1,z:55}];
  const get=()=>samples.flatMap(({branch,z})=>[-2.45,0,2.45].map(x=>r.roadPoint(branch,x,0,z)));
  const before=get();Object.assign(s,{turnEntryX:s.x,lastForkAt:472,fork:null,turnDirection:dir,turnRemaining:TURN_DURATION,x:0,lane:0});r.render(s,0);
  const after=get();
  for(let i=0;i<before.length;i++)assert.ok(Math.hypot(...before[i].map((v,k)=>v-after[i][k]))<1e-7,'road jumps at the junction');
 }
});
test('solid barrier stays inside the closed center entry and does not cover either outer connector',()=>{
 const{r,s}=setup();s.distance=472;r.render(s,0);
 const barrier=r.faces.filter(f=>['#9c6850','#684739','#d8b778'].includes(f.color));
 assert.ok(barrier.length>0,'center lane has no physical barricade');
 for(const f of barrier)assert.ok(f.points.every(([x])=>Math.abs(x)<.7),'barrier blocks an outer lane');
 const road=r.faces.filter(f=>f.layer===0&&roadColors.includes(f.color));
 for(const lane of [-1,1])assert.ok(road.some(f=>containsXZ(f,lane*LANE_WIDTH,.05)),'outer entry is not connected');
});
