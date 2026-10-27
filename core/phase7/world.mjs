// ════════════════════════════════════════════════════════════════
// core/phase7/world.mjs — Phase 7's two worlds, booted the same way in Node (each node in its own process) or in a
// browser tab:
//   the estate's mesh    the living site, break-it's and konomi-slm's real nodes, and the client's node: the wishwood
//                        engine (node/wishwood-node.mjs, at the commit core/phase7/nodes.json names), on its demo calendar
//   the client's own     grown from the seed (core/seed.mjs) with the sealed public test phrase: its desk (which asks),
//   organism             its booking engine twice (stay-a, stay-b), and break-it's gateway on the client's own key table
//                        (the gate). Planted sovereign, on its own genesis; or coupled, on the estate's genesis, which
//                        names the client's desk among its measurers
// Every estate identity is a public test seed sealed in core/phase7/claims.json. mods = { breakit, konomi, wishwood (the
// adapter modules), pins (break-it's committed key table), bookings (the client's calendar), feedSets (the sealed feeds) }.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { makeIdentity } from '../identity.mjs';
import { createNode } from '../node.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import { plant } from '../seed.mjs';
import { readRoster, rosterChanges } from '../roster.mjs';
import { doorAnswer, doorChecks } from '../phase6/world.mjs';

export const ESTATE = Object.freeze(['site', 'breakit', 'konomi', 'wishwood']);
export const CHILD = Object.freeze(['desk', 'stay-a', 'stay-b', 'gate']);
export const CLOCK = () => new Date('2026-10-27T18:00:00Z');
export const AT = '2026-10-27T18:00:00Z';
export const BUDGET = 1000;
const seedOf = (n) => new Uint8Array(32).fill(n);

/** The client's organism: planted sovereign (no genesis given), or coupled on the given genesis. */
export async function childOf(claims, genesis) {
  const p = await plant(claims.child.phrase, claims.child.organs, genesis ? { genesis } : { policy: claims.policy });
  if (!p.ok) throw new Error('the seed did not plant: ' + p.why);
  return p;
}

/** The estate's keys, and its genesis: the founder its one activator; its measurers the four nodes, the founder and the client's desk. */
export async function estateOf(claims) {
  const ids = {};
  for (const k of ['founder', ...ESTATE, 'stranger']) ids[k] = await makeIdentity(seedOf(claims.seeds[k]));
  const desk = (await childOf(claims)).ids.desk;
  const g = await L.sign(ids.founder.ledgerKeys, { type: 'genesis', activators: [ids.founder.id], measurers: [...ESTATE.map((r) => ids[r].id), ids.founder.id, desk.id], policy: claims.policy });
  return { ids, genesis: g.entry };
}

/** The sealed guard feeds, as an asker that sent them keeps them. */
export const feedSetsOf = (claims) => claims.guard.sets.map((s) => s.feeds);

/** Boot one node. role ∈ ESTATE, or CHILD with world 'child' (sovereign) or 'coupled'. → { node } */
export async function bootRole(role, mods, claims, world = 'estate') {
  const m = mods || {}, W = m.wishwood;
  if (world === 'estate') {
    const { ids, genesis } = await estateOf(claims);
    const base = { identity: ids[role], genesis, clock: CLOCK, budget: BUDGET };
    if (role === 'site') return { node: await createNode({ ...base, name: 'living-site', skills: { door: async (input) => doorAnswer(input) }, checks: { door: doorChecks, stay: W.stayChecks, guard: W.guardChecksFor(m.feedSets) } }) };
    if (role === 'breakit') return { node: (await m.breakit.breakitNode({ ...base, pins: m.pins })).node };
    if (role === 'konomi') return { node: (await m.konomi.konomiNode(base)).node };
    if (role === 'wishwood') return { node: (await W.wishwoodNode({ ...base, bookings: m.bookings })).node };
    throw new Error('no such estate role: ' + role);
  }
  const genesis = world === 'coupled' ? (await estateOf(claims)).genesis : undefined;
  const child = await childOf(claims, genesis);
  const base = { identity: child.ids[role], genesis: child.genesis, clock: CLOCK, budget: BUDGET };
  if (role === 'desk') return { node: await createNode({ ...base, name: 'desk', checks: { stay: W.stayChecks, guard: W.guardChecksFor(m.feedSets) } }) };
  if (role === 'stay-a' || role === 'stay-b') return { node: (await W.wishwoodNode({ ...base, bookings: m.bookings })).node };
  if (role === 'gate') return { node: (await m.breakit.breakitNode({ ...base, pins: { 1: child.ids.desk.id } })).node };
  throw new Error('no such role in the client\'s organism: ' + role);
}

/** The ops a Phase 7 cell adds to core/cells.mjs opsOf: pin from a roster the node reads itself, what it has pinned, expire an ask. */
export function extraOf(node) {
  return {
    pinRoster: async ({ roster, founder }) => {
      const read = await readRoster(roster, founder);
      if (!read.ok) return { ok: false, why: read.why, pinned: node.pinned() };
      for (const c of rosterChanges(read, node.pinned(), node.id).pin) await node.pin(c);
      return { ok: true, pinned: node.pinned() };
    },
    pinned: async () => node.pinned(),
    expire: async ({ id }) => node.expire(id),
  };
}
