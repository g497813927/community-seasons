export * from '../../outputs/community-seasons/lib/game/engine';
import {createRun as actualCreateRun, type Mode} from '../../outputs/community-seasons/lib/game/engine';
const pending=new WeakMap<object,Mode>();
export const createRun:typeof actualCreateRun=(...args)=>{
 const run=Object.assign(actualCreateRun(...args),{mode:'running' as const,time:180,distance:6387,score:90324,coins:529,scene:'autumn' as const,nextRailAt:Infinity,nextForkAt:Infinity,nextPortalAt:Infinity,nextRow:Infinity,nextRelicAt:Infinity,obstacles:[],pickups:[],relics:[],chaseRemaining:0,reason:'The disruptors caught up.',reviewedPosts:18});
 if(window.__androidQA.maxNumbers)Object.assign(run,{score:Number.MAX_SAFE_INTEGER,distance:Number.MAX_SAFE_INTEGER,coins:Number.MAX_SAFE_INTEGER});
 pending.set(run,window.__androidQA.mode);window.__androidQA.live=run;return run;
};
export const update=(run:any)=>{if(pending.has(run)){run.mode=pending.get(run)!;pending.delete(run);} };
