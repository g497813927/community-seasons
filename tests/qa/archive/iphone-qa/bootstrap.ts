import * as engine from '../../../../src/lib/game/engine';
import { RAIL_QUESTIONS, railQuestionDuration } from '../../../../src/lib/game/railway';
import { isSceneKind, nextScene, type SceneKind } from '../../../../src/lib/game/scenes';
const qa=(window as any).__phoneQA;
qa.railQuestionDurations=Object.fromEntries(RAIL_QUESTIONS.map(question=>[question.id,railQuestionDuration(question)]));
function running(){const s=qa.run as engine.RunState|null;if(!s||s.mode!=='running')throw new Error('Use the real game Start / guide / Begin run controls first (and resume if paused).');return s;}
function base(distance:number,time:number,scene:SceneKind){const s=running();Object.assign(s,engine.createRun(4182,scene),{mode:'running',distance,time,score:Math.floor(distance*10),speed:Math.min(engine.MAX_SPEED,engine.INITIAL_SPEED+distance*.006),nextRow:distance+50,nextRelicAt:distance+160,nextForkAt:1e9,nextRailAt:1e9,nextPortalAt:1e9});engine.generateAhead(s);return s;}
qa.scenario=(name:string,options:{scene?:SceneKind;direction?:'left'|'right';stage?:'first'|'max';seconds?:number}={})=>{
 if(!['opening','mid','max','magnet','rush','fork','rail','transport'].includes(name))throw new Error(`Unknown scenario: ${name}`);
 const current=running(),scene=isSceneKind(options.scene)?options.scene:current.scene,maximum=name==='max'||options.stage==='max';
 const distance=maximum?9100:name==='opening'?0:name==='fork'?390:1200;
 const s=base(distance,name==='opening'?0:name==='fork'&&!maximum?30:100,scene);
 if(name==='magnet'||name==='rush')engine.activateBoost(s,name,3);
 else if(name==='fork'){const dir=options.direction==='left'?-1:1;s.lane=dir;s.x=dir*engine.LANE_WIDTH;s.nextForkAt=s.distance+s.speed*(options.seconds??3);s.fork=null;}
 else if(name==='rail')s.nextRailAt=s.distance+s.speed*(options.seconds??3);
 else if(name==='transport'){s.portalLane=options.direction==='left'?-1:1;s.lane=s.portalLane;s.x=s.lane*engine.LANE_WIDTH;s.nextPortalAt=s.distance+s.speed*(options.seconds??3);}
 qa.label(`${name}/${scene}/${maximum?'max':'normal'}`);return qa.snapshot();
};
qa.boost=(kind:'magnet'|'rush'|'shield'|'doubleCoins',level:1|2|3=3)=>{const ok=engine.activateBoost(running(),kind,level);qa.mark('boost',{kind,level,accepted:ok});return ok;};
qa.answer=(correct=true)=>{const s=running(),q=engine.currentRailQuestion(s);if(!q||s.rail?.phase!=='question')throw new Error('Wait for a railway question.');const option=correct?q.correctIndex:(q.correctIndex+1)%3;return engine.selectRailLane(s,(s.rail.optionOrder.indexOf(option)-1) as -1|0|1);};
qa.travel=(scene?:SceneKind)=>{const s=running();return engine.startSceneTravel(s,isSceneKind(scene)?scene:nextScene(s.scene));};
qa.pause=()=>qa.pauseWithUI();
qa.action=(action:engine.Action)=>engine.act(running(),action);
await import('../../../../src/main.tsx');
