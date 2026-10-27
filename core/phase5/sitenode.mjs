// ════════════════════════════════════════════════════════════════
// core/phase5/sitenode.mjs — the living site as a node of the mesh (Phase 5, pass 3: claims N1 and N2). Booted the same
// way in Node, each cell in its own operating-system process, or in a browser tab, every cell in the tab: the site's own
// node, and break-it's and konomi-slm's real nodes (their adapter modules handed in: from clones at their pinned commits
// in Node, from their own live sites on this origin in a tab).
//
// siteMesh(cells, inputs) is the one scenario both run. The carry is the only path between cells: it hands a packet to
// its node and every reply onward, and reads nothing in the bytes except whether they frame as LIGHT.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { makeIdentity, hex, unhex } from '../identity.mjs';
import { createNode, meshGenesis, assetOf } from '../node.mjs';
import { frame, prepare, finish, KINDS } from '../vendor/light/packet.mjs';
import { opsOf } from '../cells.mjs';

export const SEEDS = Object.freeze({ founder: 60, site: 51, breakit: 61, konomi: 62, stranger: 53, screenSender: 40 });   // 40 = 0x28: break-it's node/pins.json test key
export const ROLES = Object.freeze(['site', 'breakit', 'konomi']);
export const CLOCK = () => new Date('2026-10-27T12:00:00Z');
const seedOf = (n) => new Uint8Array(32).fill(n);

/** The identities and the ledger genesis. siteIdentity: the tab's own fresh key, or the fixed test seed when absent. */
export async function meshOf(siteIdentity) {
  const ids = {};
  for (const [k, n] of Object.entries(SEEDS)) ids[k] = k === 'site' && siteIdentity ? siteIdentity : await makeIdentity(seedOf(n));
  const genesis = await meshGenesis(ids.founder, [ids.site.id, ids.breakit.id, ids.konomi.id]);
  return { ids, genesis };
}

/** Boot one role. mods = { breakit (break-it's node/breakit-node.mjs), konomi (konomi-slm's node/konomi-node.mjs), pins }. */
export async function bootSite(role, mods, siteIdentity) {
  const m = mods && typeof mods === 'object' ? mods : {};
  const { ids, genesis } = await meshOf(siteIdentity);
  if (role === 'site') return { node: await createNode({ name: 'living-site', identity: ids.site, genesis, clock: CLOCK, budget: 1000 }), extra: {} };
  if (role === 'breakit') return { node: (await m.breakit.breakitNode({ identity: ids.breakit, genesis, clock: CLOCK, budget: 1000, pins: m.pins })).node, extra: {} };
  if (role === 'konomi') return { node: (await m.konomi.konomiNode({ identity: ids.konomi, genesis, clock: CLOCK, budget: 1000 })).node, extra: {} };
  throw new Error('no such role: ' + role);
}

/** A cell in this same process or tab. */
export async function localSiteCell(role, mods, siteIdentity) {
  const { node, extra } = await bootSite(role, mods, siteIdentity);
  return { id: node.id, call: opsOf(node, extra), close: async () => {} };
}

/** A packet from a key nobody pinned, addressed to `to`: the attack the site refuses and shares. */
export async function strangerPacket(stranger, to) {
  const p = prepare({ sender: stranger.slot, counter: 1n, kind: KINDS.JSON, value: { t: 'ask', to, id: 'ask:stranger:1', skill: 'screen', input: { hex: '00' }, token: {} }, dictId: 0 });
  return hex(finish(p.unsigned, await stranger.sign(p.signed)).bytes);
}

/** The only path between the cells: carry(to, hex) hands a packet to its node and every reply onward; ask(skill, input) is the site's. */
export function carrier(cells) {
  const byId = Object.fromEntries(Object.values(cells).map((c) => [c.id, c]));
  const wire = { messages: 0, nonLight: 0, bytes: 0 };
  const carry = async (to, bytesHex) => {
    const b = unhex(bytesHex);
    wire.messages++; wire.bytes += b.length;
    if (!frame(b, {}).ok) wire.nonLight++;
    const r = await byId[to].call('hear', { bytes: bytesHex });
    const after = [];
    for (const rep of r.replies || []) after.push(...(await carry(rep.to, rep.bytes)));
    return [r, ...after];
  };
  const ask = async (skill, input) => {
    const a = await cells.site.call('ask', { skill, input });
    if (!a.ok) return { a, answer: null };
    const hops = await carry(a.to, a.bytes);
    return { a, answer: hops.find((h) => h.t === 'answer') || null };
  };
  return { carry, ask, wire };
}

/**
 * cells = { site, breakit, konomi }, each { id, call(op, args) }; inputs = { brk1: [{ name, hex, expect }], rows: [triage rows] }.
 * → { n1, n2, steps }. onStep(name, result) is told of each step.
 */
export async function siteMesh(cells, inputs, stranger, onStep) {
  const S = cells.site, B = cells.breakit, K = cells.konomi;
  const { carry, ask, wire } = carrier(cells), steps = [];
  const note = (name, r) => { steps.push(name); if (typeof onStep === 'function') onStep(name, r); return r; };
  for (const [x, y] of [[S, B], [B, S], [S, K], [K, S]]) note('pin', await x.call('pin', { card: await y.call('card') }));

  // N1 — the site reaches two other nodes' capabilities, in LIGHT, and checks what comes back
  const screens = [];
  for (const c of inputs.brk1) {
    const x = await ask('screen', { hex: c.hex });
    note('screen', x.answer);
    screens.push({ case: c.name, expect: c.expect, stage: x.answer && x.answer.answer ? x.answer.answer.stage : null, outcome: x.answer ? x.answer.outcome : null, to: x.a.to === B.id ? 'break-it' : x.a.to || null });
  }
  let verified = 0, receiptsHold = 0, toKonomi = 0;
  for (const row of inputs.rows) {
    const x = await ask('triage', row);
    note('triage', x.answer);
    if (x.a.to === K.id) toKonomi++;
    if (x.answer && x.answer.outcome === 'verified') { verified++; if (x.answer.recorded === true) receiptsHold++; }
  }
  const ledger = await S.call('ledger');
  const values = ledger.log.filter((e) => e.entry.type === 'value' && e.entry.by === S.id);
  const ledgerValues = values.length, ledgerTriage = values.filter((e) => e.entry.asset === assetOf(K.id)).length, ledgerScreen = values.filter((e) => e.entry.asset === assetOf(B.id)).length;
  const n1 = { screens, triage: { asks: inputs.rows.length, toKonomi, verified, receiptsHold }, messages: wire.messages, nonLight: wire.nonLight, bytes: wire.bytes, ledgerValues, ledgerTriage, ledgerScreen };

  // N2 — an attack the site refused, break-it then refuses on sight; and an honest packet still gets in
  const attack = await strangerPacket(stranger, S.id);
  const refused = note('attack', await S.call('hear', { bytes: attack }));
  const bundle = await S.call('shareAntibodies', { to: B.id });
  const adoptR = bundle ? note('antibodies', (await carry(B.id, bundle.bytes))[0]) : { adopted: 0, autoimmuneBlocked: 0 };
  const again = note('attack-again', await B.call('hear', { bytes: attack }));
  const honest = note('honest', (await carry(B.id, (await S.call('shareLedger', { to: B.id })).bytes))[0]);
  const brief = (r) => ({ ok: r.ok === true, stage: r.ok === true ? null : r.stage || null, recognised: r.recognised === true });
  const n2 = { refused: brief(refused), offered: adoptR.offered || 0, adopted: adoptR.adopted || 0, autoimmuneBlocked: adoptR.autoimmuneBlocked || 0, again: brief(again), honest: brief(honest) };
  return { n1, n2, steps };
}
