import { ACCESSORIES, type Outfit } from '../../../src/lib/game/cosmetics';
import { SKINS, type SkinId } from '../../../src/lib/game/skins';
import { SCENES, type SceneKind } from '../../../src/lib/game/scenes';

export const MINIMUM_DURATION_MS = 60_000;
export interface MatrixCase { id: string; skin: SkinId; outfit: Outfit; scene: SceneKind }
const ids = <S extends keyof Outfit>(slot: S): Outfit[S][] =>
  [null, ...ACCESSORIES.filter(item => item.slot === slot).map(item => item.id)] as Outfit[S][];
export const MATRIX_CASES: readonly MatrixCase[] = SKINS.flatMap(({ id: skin }) =>
  ids('hat').flatMap(hat => ids('shoes').flatMap(shoes => ids('effect').flatMap(effect =>
    SCENES.map(({ id: scene }) => ({
      id: `${skin}_${hat ?? 'none'}_${shoes ?? 'none'}_${effect ?? 'none'}_${scene}`,
      skin, outfit: { hat, shoes, effect }, scene,
    })),
  ))),
);
const byId = new Map(MATRIX_CASES.map(item => [item.id, item]));
export function caseById(id: string): MatrixCase | undefined { return byId.get(id); }
