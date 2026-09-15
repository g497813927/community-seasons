import { loadToyCloudStorage as loadReal } from '../../../src/lib/game/toy-sdk';
import type { ToyCloudSdk } from '../../../src/lib/game/cloud-save';
export { isToyPage, loadToySdk } from '../../../src/lib/game/toy-sdk';
const qa=(window as any).__phoneQA;
let wrapped:ToyCloudSdk|null=null,previous:ToyCloudSdk|null=null;
function check(keys?:string[]){if(!keys?.length||keys.some(key=>!key.startsWith(qa.prefix)))throw new Error('QA blocked access to a non-isolated cloud save key.');}
async function measured<T>(operation:string,count:number,action:()=>Promise<T>):Promise<T>{const began=performance.now();let ok=false;try{const result=await action();ok=true;return result;}finally{qa.cloudMetric(operation,performance.now()-began,ok,count);}}
export async function loadToyCloudStorage():Promise<ToyCloudSdk|null>{
 const real=await measured('load-sdk',0,()=>loadReal());if(!real)return null;
 if(real===previous&&wrapped)return wrapped;previous=real;
 wrapped={
  isSupport:ability=>measured(`support:${ability}`,0,()=>real.isSupport(ability)),
  getCloudStorage:keys=>{check(keys);return measured('getCloudStorage',keys!.length,()=>real.getCloudStorage(keys));},
  setCloudStorage:items=>{const keys=Object.keys(items);check(keys);return measured('setCloudStorage',keys.length,()=>real.setCloudStorage(items));},
 };return wrapped;
}
