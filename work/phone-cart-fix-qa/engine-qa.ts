import * as engine from '../../outputs/community-seasons/lib/game/engine';
export * from '../../outputs/community-seasons/lib/game/engine';
const qa = (window as any).__phoneQA;
qa.engine = engine;
export function update(...args: Parameters<typeof engine.update>) {
 qa.setRun(args[0]); const began=performance.now();
 try { return engine.update(...args); } finally { qa.metric('engine',performance.now()-began); }
}
export function act(...args: Parameters<typeof engine.act>) {
 const result=engine.act(...args);qa.mark('action',{action:args[1],accepted:result});return result;
}
