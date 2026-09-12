import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('early probe isolates game saves, preserves unrelated storage, and bounds RAM samples',()=>{
 let clock=0;const callbacks=[];class Storage{data=new Map();getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
 const localStorage=new Storage(),sessionStorage=new Storage();localStorage.setItem('community-seasons-progress-v1','production-save');localStorage.setItem('sdk-login','untouched');
 const context={Storage,localStorage,sessionStorage,performance:{now:()=>clock},document:{visibilityState:'visible',hasFocus:()=>true,querySelector:()=>({getAttribute:()=>'width=device-width,initial-scale=1,viewport-fit=cover'}),addEventListener(){}},navigator:{userAgent:'iPhone QA test',language:'en',languages:['en'],userActivation:{isActive:false,hasBeenActive:true}},visualViewport:{width:390,height:700,scale:1,offsetLeft:0,offsetTop:0},devicePixelRatio:3,innerWidth:390,innerHeight:844,screen:{width:390,height:844},addEventListener(){},requestAnimationFrame:cb=>(callbacks.push(cb),callbacks.length),setTimeout(){},Blob,URL,console};context.window=context;
 vm.runInNewContext(fs.readFileSync(new URL('./public/probe.js',import.meta.url),'utf8'),context);
 assert.equal(localStorage.getItem('community-seasons-progress-v1'),null,'QA reads production game progress');
 localStorage.setItem('community-seasons-progress-v1','qa-save');assert.equal(localStorage.data.get('community-seasons-progress-v1'),'production-save');assert.equal(localStorage.data.get('qa-iphone-20260910-community-seasons-progress-v1'),'qa-save');assert.equal(localStorage.getItem('sdk-login'),'untouched');
 sessionStorage.setItem('community-seasons-scene','winter');assert.equal(sessionStorage.data.get('community-seasons-scene'),undefined);
 for(let i=0;i<6100;i++){clock=i*16.67;callbacks.shift()(clock);}
 context.requestAnimationFrame(()=>{clock+=7;context.__phoneQA.metric('render',5)});callbacks.shift()(clock+16.67);callbacks.shift()(clock);
 const output=context.__phoneQA.export();assert.equal(output.frames.length,6000);assert.equal(output.summary.device.userAgent,'iPhone QA test');assert.equal(output.frames.at(-1).callbackCPU,7);assert.equal(output.frames.at(-1).renderCPU,5);
 assert.equal(output.summary.device.userActivation.hasBeenActive,true);assert.equal(output.summary.device.userActivation.isActive,false);assert.equal(output.summary.device.visualViewport.height,700);assert.equal(output.summary.device.visualViewport.scale,1);assert.equal(output.summary.device.viewportMeta,'width=device-width,initial-scale=1,viewport-fit=cover');delete context.visualViewport;delete context.navigator.userActivation;assert.equal(context.__phoneQA.export().summary.device.visualViewport,null);assert.equal(context.__phoneQA.export().summary.device.userActivation,null);assert.equal(typeof context.__phoneQA.summary(),'string');assert.ok(!JSON.stringify(output).includes('production-save'));assert.ok(!JSON.stringify(output).includes('qa-save'));
 context.__phoneQA.reset('new');assert.equal(context.__phoneQA.export().frames.length,0);assert.equal(localStorage.getItem('community-seasons-progress-v1'),'qa-save');
});
test('built preview is relative-path safe and cloud requests use an isolated key',()=>{
 const root=new URL('./dist-20260910/',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8');assert.ok(html.includes('<script src="./probe.js"></script>'));assert.ok(html.indexOf('./probe.js')<html.indexOf('type="module"'));assert.ok(!/\b(?:src|href)="\//.test(html));
 const scripts=fs.readdirSync(new URL('assets/',root)).filter(n=>n.endsWith('.js')).map(n=>fs.readFileSync(new URL(`assets/${n}`,root),'utf8')).join('\n');assert.ok(scripts.includes('qa-iphone-20260910-community-seasons-save-v1'));assert.ok(!scripts.includes('"community-seasons-save-v1"'));assert.ok(scripts.includes('QA blocked access to a non-isolated cloud save key.'));
 for(const name of ['font-qa.js','render-scale-qa.js'])assert.equal(fs.existsSync(new URL(name,root)),false,`${name} must not enter the production-equivalent phone build`);
 assert.equal(scripts.includes('qa-iphone-20260908-'),false,'old save namespaces leaked into the new build');
 assert.ok(!html.includes('font-qa')&&!html.includes('render-scale-qa'));
});
