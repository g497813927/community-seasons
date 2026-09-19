import type { registerGameTools as productionRegister } from '../../../src/lib/game/tools';
import { bindFunctionalGame } from './functional-probe';

// Only this fixture resolves the production integration seam to this module.
// Production bundles still resolve src/lib/game/tools.ts normally.
export function registerGameTools(...args: Parameters<typeof productionRegister>) {
  return bindFunctionalGame(args);
}
