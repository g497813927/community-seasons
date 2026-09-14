import { Renderer as OriginalRenderer } from '../../src/lib/game/render';
const qa=(window as any).__phoneQA;
export class Renderer extends OriginalRenderer {
 private qaDepth=0;
 override render(...args: Parameters<OriginalRenderer['render']>) {
  const outer=this.qaDepth++===0,began=outer?performance.now():0;
  if(outer){qa.renderer=this;qa.setRun(args[0]);}
  try { return super.render(...args); } finally {this.qaDepth--;if(outer)qa.metric('render',performance.now()-began);}
 }
}
