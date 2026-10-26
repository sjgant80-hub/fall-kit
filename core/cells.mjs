// ════════════════════════════════════════════════════════════════
// core/cells.mjs — the cells Phase 1's proof runs, booted the same way in Node or in a browser tab: break-it and
// konomi-slm (the two real organs — their adapter modules are handed in, from clones in Node or from their own live
// sites in a browser), a dishonest peer offering the same skill as konomi-slm with receipts that do not check, and a
// node with a budget of five. Every identity comes from a fixed, public test seed and the clock is fixed, so a run
// gives the same bytes every time: the receipt re-runs byte for byte, and a browser re-derives the receipt's facts.
//
// opsOf() is the one way a cell is driven, in the same process or its own: every argument and result is JSON, with
// bytes as hex, so the one-process run and the separate-process run go through exactly the same code.
// ════════════════════════════════════════════════════════════════
import { makeIdentity, hex, unhex } from './identity.mjs';
import { createNode, meshGenesis } from './node.mjs';
import { prepare, finish, KINDS } from './vendor/light/packet.mjs';
import { makeBundle } from './vendor/immune/exchange.mjs';

export const SEEDS = Object.freeze({ founder: 1, breakit: 21, konomi: 22, liar: 23, budgeted: 24, stranger: 30 });
export const ROLES = Object.freeze(['breakit', 'konomi', 'liar', 'budgeted']);
export const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const seedOf = (n) => new Uint8Array(32).fill(n);

export async function meshSetup() {
  const ids = {};
  for (const [k, n] of Object.entries(SEEDS)) ids[k] = await makeIdentity(seedOf(n));
  const genesis = await meshGenesis(ids.founder, [ids.breakit.id, ids.konomi.id, ids.liar.id, ids.budgeted.id]);
  return { ids, genesis };
}

const dishonestTriage = async () => ({ verdict: 'VERIFIED', domain: 'triage', label: 1, receipt: { model: 'konomi-slm/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) } });

/** Boot one role. mods = { breakit (break-it's node/breakit-node.mjs), konomi (konomi-slm's node/konomi-node.mjs), pins }. */
export async function bootRole(role, mods) {
  const m = mods && typeof mods === 'object' ? mods : {};
  const { ids, genesis } = await meshSetup();
  if (role === 'breakit') {
    const { node } = await m.breakit.breakitNode({ identity: ids.breakit, genesis, clock: CLOCK, budget: 1000, pins: m.pins });
    return { node, extra: {} };
  }
  if (role === 'konomi') {
    const { node } = await m.konomi.konomiNode({ identity: ids.konomi, genesis, clock: CLOCK, budget: 1000 });
    return { node, extra: { regrow: async () => m.konomi.regrow(node.card().genome) } };
  }
  if (role === 'liar') {
    const node = await createNode({ name: 'dishonest-peer', identity: ids.liar, skills: { triage: dishonestTriage }, genesis, clock: CLOCK, budget: 1000 });
    // the autoimmunity probe: a bundle carrying a VALID packet from this peer, one the target would admit right now.
    // Its counters are far above anything this node sends, so it is the last thing this peer says in a run.
    const autoimmuneProbe = async ({ to }) => {
      const sign = async (value, counter) => { const p = prepare({ sender: ids.liar.slot, counter, kind: KINDS.JSON, value, dictId: 0 }); return finish(p.unsigned, await ids.liar.sign(p.signed)).bytes; };
      const valid = await sign({ t: 'ledger', to, log: [] }, 900001n);
      let msg = null;
      makeBundle(ids.liar.id, [hex(valid)], (x) => { msg = x; return new Uint8Array(64); });
      const sig = await ids.liar.sign(msg);
      const bundle = makeBundle(ids.liar.id, [hex(valid)], () => sig);
      return { bytes: hex(await sign({ t: 'antibody', to, bundle }, 900000n)) };
    };
    return { node, extra: { autoimmuneProbe } };
  }
  if (role === 'budgeted') {
    const node = await createNode({ name: 'budgeted', identity: ids.budgeted, genesis, clock: CLOCK, budget: 5 });
    return { node, extra: {} };
  }
  throw new Error('no such role: ' + role);
}

const jsonSafe = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x, (k, v) => (v instanceof Uint8Array ? hex(v) : typeof v === 'bigint' ? v.toString() : v)));

/** The one way a cell is driven. → async (op, args) → a JSON value. */
export function opsOf(node, extra) {
  const table = {
    card: async () => node.card(),
    pin: async ({ card }) => node.pin(card),
    ask: async ({ skill, input }) => node.ask(skill, input),
    hear: async ({ bytes }) => node.hear(unhex(bytes)),
    shareAntibodies: async ({ to }) => { const b = await node.shareAntibodies(to); return b ? { bytes: b } : null; },
    shareLedger: async ({ to }) => { const b = await node.shareLedger(to); return b ? { bytes: b } : null; },
    weight: async ({ peer, skill }) => node.weight(peer, skill),
    stats: async () => node.stats(),
    credits: async () => node.credits(),
    vault: async () => node.vault(),
    recall: async ({ q }) => { const r = node.recall(q, 3); return { center: r.center ? { text: r.center.text, meta: r.center.meta } : null }; },
    budget: async () => node.budget(),
    ledger: async () => ({ log: node.ledger().log, head: node.ledger().head }),
    antigens: async () => node.antigens(),
    ...(extra || {}),
  };
  return async (op, args) => {
    if (!Object.prototype.hasOwnProperty.call(table, op)) throw new Error('no op ' + op);
    return jsonSafe(await table[op](args || {}));
  };
}

/** A cell in this same process (or tab), driven through opsOf. */
export async function localCell(role, mods) {
  const { node, extra } = await bootRole(role, mods);
  return { id: node.id, name: node.name, call: opsOf(node, extra), close: async () => {} };
}
