import { registerGameTools as registerProductionTools } from '../../../src/lib/game/tools';
import { jumpHeight } from '../../../src/lib/game/engine';
import { skillDefinition } from '../../../src/lib/game/boosts';
import { inputProbe } from './input-probe.mjs';

// The preview alias observes the same live ref used by the existing game
// integration. It does not replace movement, skill activation or game updates.
export function registerGameTools(...args: Parameters<typeof registerProductionTools>) {
  const [read, , , , store] = args;
  const detach = inputProbe.attach(read, () => ({
    storeOpen: store.isOpen(),
    setupOpen: store.setupOpen(),
    shieldUnlocked: store.read().skills.shield.unlocked,
  }), jumpHeight, skillDefinition('shield').chargeCoins);
  const unregister = registerProductionTools(...args);
  return () => { detach(); unregister(); };
}
