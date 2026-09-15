export * from '../../../../src/lib/game/engine';
import {createRun as actualCreateRun} from '../../../../src/lib/game/engine';
export const createRun:typeof actualCreateRun=(...args)=>{const s=actualCreateRun(...args);s.boosts.grace=1e8;window.__licensesQA.live=s;window.__licensesQA.created++;return s;};
