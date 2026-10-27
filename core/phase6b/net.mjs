// ════════════════════════════════════════════════════════════════
// core/phase6b/net.mjs — Phase 6b's world: the nine sealed attacks, a mock network that holds the rule at its own door,
// the books merged into it, and Phase 6's own mock refused. The same code runs in Node (measure.mjs) and in a browser
// tab (tab.mjs), on the same public test seeds, the same genesis and the same books.
//
//   ctxOf(evidence)                       the auditor's gate context over Phase 6's published evidence, fresh each call
//   keysOf(world)                         the ledger keys the paths sign with
//   attacksOf(attacks, world)             the sealed attacks (claims.attacks), each signed by the key it names
//   boundNetwork(world, signed)           a network built through boundGate: the attacks offered at its door first, then
//                                         its three contributors released under their own keys' names, with their values
//   fixPath(books, world, gate, ...)      the books merged into it by mergeBound; the switch on a copy; the allocation;
//                                         the merged log replayed through the rule
//   refusePath(books, world, gate)        the books offered to Phase 6's mock, which does not bind names: refused, unchanged
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import * as L from '../vendor/ledger/contrib.mjs';
import { assetOf } from '../node.mjs';
import { bound, boundGate, unboundIn, mergeBound } from '../names.mjs';
import { counselDigest, mockNetwork } from '../phase6/paths.mjs';
import { AT } from '../phase6/world.mjs';

const MOCK = Object.freeze([{ kind: 'mock-network', ref: 'network', digest: counselDigest('a mock of a larger network') }]);
const UNITS = Object.freeze([5, 7, 11]);
const open = async () => ({ ok: true });

export const ctxOf = (ev) => ({ cards: new Map(ev.cards.map((c) => [c.id, c])), evidence: ev.evidence, phase4: ev.phase4, growth: ev.growth, founder: ev.founder, auditor: ev.auditor, checked: new Set() });

export function keysOf(world) {
  const i = world.ids;
  return { founder: i.founder.ledgerKeys, site: i.site.ledgerKeys, liar: i.liar.ledgerKeys, network: i.network.map((x) => x.ledgerKeys), networkMeasurer: i.networkMeasurer.ledgerKeys };
}

/** The sealed attacks, signed. Each names its key and its asset in the sealed words; a word this does not know stops the run. */
export async function attacksOf(attacks, world) {
  const site = assetOf(world.ids.site.id), k = keysOf(world);
  const by = { 'network[0]': k.network[0], founder: k.founder, networkMeasurer: k.networkMeasurer, liar: k.liar };
  const asset = { 'the site\'s name': site, 'the site\'s name followed by -2': site + '-2', 'network:node-1': 'network:node-1', 'network[0]\'s own name': assetOf(k.network[0].pub) };
  const out = [];
  for (const a of attacks) {
    if (!by[a.by] || !asset[a.asset]) throw new Error('attack ' + a.id + ' names a key or an asset this measure does not know: ' + a.by + ', ' + a.asset);
    const s = await L.sign(by[a.by], { type: 'release', asset: asset[a.asset], at: AT, form: a.form, lineage: [], proofs: MOCK });
    out.push({ id: a.id, by: a.by, asset: asset[a.asset], form: a.form, entry: s.entry });
  }
  return out;
}

/** A mock network that holds the rule at its own door. */
export async function boundNetwork(world, signed) {
  const k = keysOf(world), gate = boundGate(open), ids = new Set();
  let l = (await L.record(L.empty(), world.genesis, {})).ledger;
  ids.add(await L.idOf(world.genesis));
  const put = async (entry) => { const r = await L.record(l, entry, { gate }); if (r.ok) { l = r.ledger; ids.add(r.id); } return r; };
  const atDoor = [];
  for (const a of signed) { const r = await put(a.entry); atDoor.push({ id: a.id, ok: r.ok, why: r.ok ? null : r.why }); }
  const own = [];
  for (let i = 0; i < k.network.length; i++) {
    const name = assetOf(k.network[i].pub);
    const rel = await put((await L.sign(k.network[i], { type: 'release', asset: name, at: AT, form: 'node', lineage: [], proofs: MOCK })).entry);
    const val = await put((await L.sign(k.networkMeasurer, { type: 'value', asset: name, at: AT, basis: 'routing', job: 'network:job-' + (i + 1), proofs: MOCK, units: UNITS[i] })).entry);
    own.push({ asset: name, released: rel.ok, valued: val.ok, why: rel.ok && val.ok ? null : rel.why || val.why });
  }
  return { ledger: l, ids, atDoor, own };
}

/** The fix: the books merged into the bound network, the switch on a copy, the allocation, the replay through the rule. */
export async function fixPath(books, world, auditGate, pool, counsel, signed) {
  const net = await boundNetwork(world, signed), k = keysOf(world), site = assetOf(world.ids.site.id);
  const gate = async (entry, ledger) => (net.ids.has(await L.idOf(entry)) ? { ok: true } : auditGate(entry, ledger));
  const m = await mergeBound(net.ledger, books, { gate });
  if (!m.ok) return { merged: false, why: m.why };
  const held = [];
  for (const { n, entry } of books.log) if (net.ledger.ids[await L.idOf(entry)] !== undefined) held.push(n);
  const sw = await L.sign(k.founder, { type: 'switch', at: AT, path: 'network', pool, counsel: counselDigest(counsel) });
  const on = await L.record(m.ledger, sw.entry, {});
  const live = on.ok ? L.allocate(on.ledger, {}) : { ok: false, why: on.why };
  const again = on.ok ? await L.replay(on.ledger.log, { gate: boundGate(gate) }) : { ok: false, why: 'no switch' };
  const replayed = again.ok ? L.allocate(again.ledger, {}) : { ok: false };
  const booksKeys = Object.keys(L.credits(books).credits || {}), netKeys = k.network.map((x) => x.pub), parts = live.ok ? live.parts : {};
  const siteValues = (l) => l.log.filter((x) => x.entry.type === 'value' && x.entry.asset === site).length;
  return {
    merged: true, booksEntries: books.log.length, added: m.added, skipped: m.skipped, heldAlready: held, genesisOnly: held.length === 1 && held[0] === 0 && books.log[0].entry.type === 'genesis',
    refused: m.refused.map((x) => ({ n: x.n, type: books.log[x.n].entry.type, asset: books.log[x.n].entry.asset || null, why: x.why })),
    siteRelease: !!(m.ledger.assets[site] && m.ledger.assets[site].maker === world.ids.site.id), siteValues: { books: siteValues(books), merged: siteValues(m.ledger) },
    switched: on.ok, pool: live.ok ? live.pool : null, total: live.ok ? live.total : null, parts: live.ok ? live.parts : null,
    booksContributorsCovered: booksKeys.filter((x) => parts[x] > 0).length, booksContributors: booksKeys.length, siteCovered: parts[world.ids.site.id] > 0,
    networkContributorsCovered: netKeys.filter((x) => parts[x] > 0).length, networkContributors: netKeys.length,
    replayed: again.ok, replayWhy: again.ok ? null : again.why, replaySame: replayed.ok && live.ok && JSON.stringify(replayed.parts) === JSON.stringify(live.parts),
    network: { atDoor: net.atDoor, own: net.own, unbound: unboundIn(net.ledger), entries: net.ledger.log.length, entriesBound: net.ledger.log.filter((x) => bound(x.entry).ok).length },
  };
}

/** The refusal: the books offered to Phase 6's own mock network, which holds the squat. */
export async function refusePath(books, world, auditGate) {
  const k = keysOf(world), site = assetOf(world.ids.site.id);
  const mock = await mockNetwork(world, k);
  const gate = async (entry, ledger) => (mock.ids.has(await L.idOf(entry)) ? { ok: true } : auditGate(entry, ledger));
  const before = { length: mock.ledger.log.length, head: mock.ledger.head };
  const r = await mergeBound(mock.ledger, books, { gate });
  const unbound = Array.isArray(r.unbound) ? r.unbound.map((u) => ({ asset: u.asset, maker: u.maker, at: u.at })) : [];
  return {
    squatted: mock.squatted, refused: !r.ok, why: r.ok ? null : r.why, recorded: r.ok ? r.added : 0, unbound,
    siteNamed: unbound.some((u) => u.asset === site && u.maker === k.network[0].pub) && !r.ok && r.why.includes(site),
    unchanged: mock.ledger.log.length === before.length && mock.ledger.head === before.head, length: before.length, head: before.head,
  };
}
