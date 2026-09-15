import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import '../helpers/compile.mjs';
const {getLessonReference,getLesson,LESSONS,CASES_URL}=await import('../helpers/compiled/community.mjs');
const {createRun}=await import('../helpers/compiled/engine.mjs');
const {Renderer}=await import('../helpers/compiled/render.mjs');

test('every lesson keeps its reviewed case URL, including the user-selected replacements',()=>{
 const expected={
  'personal-attack':4339707,
  'group-hostility':4453194,
  threat:4177256,
  privacy:4175673,
  'pile-on':4268407,
  'unsupported-claim':4158016,
  scam:4464686,
  'shock-bait':4221831,
 };
 assert.deepEqual(LESSONS.map(l=>l.id).sort(),Object.keys(expected).sort());
 for(const [id,caseId] of Object.entries(expected)){
  const ref=getLessonReference(id);
  assert.equal(ref.kind,'case',id);
  assert.equal(ref.url,`https://www.bilibili.com/blackroom/ban/${caseId}`,id);
 }
});

test('privacy reference describes threatened disclosure rather than claiming completed publication',()=>{
 const ref=getLessonReference('privacy');
 assert.match(ref.note.en,/threat(?:en|ened|ening|s)?/i);
 assert.match(ref.note.zh,/威胁/);
 assert.doesNotMatch(ref.note.en,/private information disclosed in direct messages|combines private-information disclosure with threats/i);
 assert.doesNotMatch(ref.note.zh,/涉及在私信中泄露他人隐私|同时涉及泄露私人信息与威胁/);
 assert.notEqual(ref.title.en,'Real case: private-information disclosure');
 assert.notEqual(ref.title.zh,'真实案例：泄露私人信息');
});
test('shock-bait links to the verified graphic-cartoon case and names its actual official category',()=>{
 const ref=getLessonReference('shock-bait');
 assert.equal(ref.kind,'case');
 assert.equal(ref.url,'https://www.bilibili.com/blackroom/ban/4221831');
 assert.match(ref.note.zh,/发布青少年不良内容/);
 assert.match(ref.note.en,/harmful content for minors/);
 assert.ok(!JSON.stringify(ref).includes('4285836'));
});
test('reference correction preserves original shock-bait lesson and obstacle wording',()=>{
 const lesson=LESSONS.find(l=>l.id==='shock-bait');
 assert.deepEqual(lesson.title,{en:'Graphic shock bait',zh:'不适内容诱导'});
 assert.deepEqual(lesson.label,{en:'SHOCK BAIT',zh:'猎奇诱导'});
 assert.deepEqual(lesson.example,{en:'A surprise for your feed: [graphic material removed].',zh:'给你一个惊喜：[强刺激画面已遮挡]。'});
});

test('reference edits preserve all original bilingual lesson copy',()=>{
 // Snapshot taken before this reference-only correction; includes all titles,
 // obstacle labels, examples, explanations, responses and suggested rewrites.
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(LESSONS)).digest('hex'),
  'bb105da8a6f5a6eedb2883aae7f8714eaefe5e42417ab611adc27f363f84de0b');
});

test('every lesson retains its full original category and movement text on near and far obstacle faces',()=>{
 const noop=()=>{};
 globalThis.window={devicePixelRatio:1};
 const context=new Proxy({}, {
  get:(target,key)=>key==='createLinearGradient'||key==='createRadialGradient'
   ? ()=>({addColorStop:noop}) : target[key]??noop,
  set:(target,key,value)=>{target[key]=value;return true;},
 });
 const renderer=new Renderer({getContext:()=>context,getBoundingClientRect:()=>({width:390,height:720})});
 renderer.resize();
 const actions={block:{en:'↑ JUMP',zh:'↑ 跳过'},arch:{en:'↓ SLIDE',zh:'↓ 下滑'},pillar:{en:'← DODGE →',zh:'← 换道 →'}};
 for(const lesson of LESSONS)for(const kind of ['block','arch','pillar','roots'])for(const locale of ['en','zh-CN']){
  let id=1;
  while(id<100&&getLesson({id,kind}).id!==lesson.id)id++;
  assert.ok(id<100,`${lesson.id} remains reachable on ${kind}`);
  const key=locale==='en'?'en':'zh';
  const expected=[lesson.label[key],...(actions[kind]?[actions[kind][key]]:[])].sort();
  for(const distance of [8,100]){
   const state=createRun(4182);
   Object.assign(state,{mode:'running',time:120,distance:9000,nextRow:1e9,nextPortalAt:1e9});
   state.obstacles=[{id,kind,lane:0,at:state.distance+distance,resolved:false}];
   renderer.render(state,0,false,locale);
   const text=renderer.faces.filter(f=>f.text?.emphasis).map(f=>f.text.value).sort();
   assert.deepEqual(text,expected,`${lesson.id}/${kind}/${locale}/${distance}m`);
  }
 }
});
test('an unmatched lesson uses an explicitly identified archive instead of a fabricated case',()=>{
 const ref=getLessonReference('unknown');assert.equal(ref.kind,'archive');assert.equal(ref.url,CASES_URL);assert.match(ref.note.en,/No individual case/);
});
