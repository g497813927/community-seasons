// This module is imported only by the isolated preview. Its public surface
// exposes copied outcomes and one fixed input baseline, never engine controls.
export function createInputProbe() {
  let binding;
  const current = () => {
    if (!binding) throw Error('QA input observer is not attached to the game.');
    return binding;
  };
  const snapshot = () => {
    const { read, jumpHeight, chargeCoins } = current();
    const run = read();
    return {
      mode: run.mode, skin: run.skin, outfit: { ...run.outfit }, lane: run.lane, x: run.x,
      jump: run.jump, slide: run.slide, height: jumpHeight(run),
      distance: run.distance, permanentSkill: run.permanentSkill,
      skillCharge: run.skillCharge, skillChargeRequired: chargeCoins,
      skillRechargeLocked: run.skillRechargeLocked,
      shield: run.boosts.shield, shieldTime: run.boosts.shieldTime,
    };
  };
  const inputs = Object.freeze({
    snapshot,
    // Read-only observations for natural-clock device traversal. Copies keep
    // an inspector from mutating the live engine or accessing saved progress.
    course() {
      const run = current().read();
      return {
        mode: run.mode, time: run.time, distance: run.distance, speed: run.speed,
        scene: run.scene, seed: run.seed, lane: run.lane, x: run.x,
        jump: run.jump, slide: run.slide, review: !!run.review,
        rail: run.rail ? { phase: run.rail.phase } : null,
        railReturnRemaining: run.railReturnRemaining, nextRailAt: run.nextRailAt,
        fork: run.fork ? { ...run.fork } : null,
        nextForkAt: run.nextForkAt, lastForkAt: run.lastForkAt,
        turnRemaining: run.turnRemaining, turnDirection: run.turnDirection,
        sceneTransition: run.sceneTransition,
        nextPortalAt: run.nextPortalAt, portalLane: run.portalLane,
        boosts: { ...run.boosts },
        obstacles: run.obstacles
          .filter(o => o.at >= run.distance - 2 && o.at <= run.distance + run.speed * 5)
          .map(({ id, kind, lane, at, resolved }) => ({ id, kind, lane, at, resolved })),
      };
    },
    prepare() {
      const { read, availability, chargeCoins } = current();
      const run = read();
      const { storeOpen, setupOpen, shieldUnlocked } = availability();
      if (
        run.mode !== 'running' || run.review || run.rail ||
        run.sceneTransition > 0 || run.turnRemaining > 0 || run.railReturnRemaining > 0 ||
        storeOpen || setupOpen || run.permanentSkill !== 'shield' || !shieldUnlocked
      ) throw Error('QA input baseline requires an active, unobstructed run with an unlocked, equipped shield skill.');
      // Preserve course, clocks, progress and storage. Each real browser input
      // starts from neutral motion and the same charged skill prerequisites.
      run.lane = 0;
      run.x = 0;
      run.jump = 0;
      run.slide = 0;
      run.boosts.shield = 0;
      run.boosts.shieldTime = 0;
      run.skillCharge = chargeCoins;
      run.skillRechargeLocked = false;
      return snapshot();
    },
  });
  return Object.freeze({
    inputs,
    attach(read, availability, jumpHeight, chargeCoins) {
      const owner = { read, availability, jumpHeight, chargeCoins };
      binding = owner;
      return () => { if (binding === owner) binding = undefined; };
    },
  });
}

export const inputProbe = createInputProbe();
