// ════════════════════════════════════════════════════════════════
// core/phase7b/world.mjs — Phase 7b's world is Phase 7's, with one difference: in the world called 'bridge', the client's
// coupled desk is booted with relay set (core/node.mjs, Phase 7b), so it keeps what it adopts to share on. Its card is
// the card Phase 7's coupled desk carries (relay is not on a card), so the client's roster is the same roster. Every other
// role, in every world, is booted by Phase 7's own world.mjs, unchanged.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { createNode } from '../node.mjs';
import { bootRole as bootPhase7, estateOf, childOf, CLOCK, BUDGET } from '../phase7/world.mjs';

export { ESTATE, CHILD, estateOf, childOf, extraOf, feedSetsOf } from '../phase7/world.mjs';

/** Boot one node. world: 'estate', 'child', 'coupled' (Phase 7's), or 'bridge' (coupled, the desk relaying). */
export async function bootRole(role, mods, claims, world = 'estate') {
  if (world !== 'bridge') return bootPhase7(role, mods, claims, world);
  if (role !== 'desk') return bootPhase7(role, mods, claims, 'coupled');
  const child = await childOf(claims, (await estateOf(claims)).genesis), W = mods.wishwood;
  return { node: await createNode({ identity: child.ids.desk, genesis: child.genesis, clock: CLOCK, budget: BUDGET, name: 'desk', checks: { stay: W.stayChecks, guard: W.guardChecksFor(mods.feedSets) }, relay: true }) };
}
