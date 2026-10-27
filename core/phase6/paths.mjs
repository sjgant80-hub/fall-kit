// ════════════════════════════════════════════════════════════════
// core/phase6/paths.mjs — Phase 6, pass 3 (claims C6–C8): the switch is off, and the two ways it could come on.
//
// Nothing here switches the books. The fork path and the network path are each shown on a copy: a switch entry is a
// signed record the ledger accepts only from an activator its genesis names, made here with the demo founder's public
// test key, in a copy that is thrown away. The books the receipt keeps are never switched.
//
//   fork(books, keys, pool, counsel)  the estate switches its own books: the activator's switch is recorded, the
//                                     live allocation then equals the sandbox one; a node's switch and a second switch
//                                     are refused
//   network(books, world, gate, ...)  the books merge into a mock larger network of the same schema and genesis, which
//                                     already holds a release of the living site's asset by another key; the merge
//                                     counts every entry once or refuses it by name; the network's switch, its
//                                     allocation, and the merged log replayed
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import * as L from '../vendor/ledger/contrib.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { hex } from '../identity.mjs';
import { assetOf } from '../node.mjs';
import { AT } from './world.mjs';

const enc = (s) => new TextEncoder().encode(s);
export const counselDigest = (text) => hex(sha256(enc(String(text))));
const AT2 = '2026-10-27T15:00:01Z';

/** The fork path, on a copy of the books. keys = { founder, site } (ledger keys). */
export async function fork(books, keys, pool, counsel) {
  const sandbox = L.allocate(books, { sandbox: true, pool });
  const sw = await L.sign(keys.founder, { type: 'switch', at: AT, path: 'fork', pool, counsel: counselDigest(counsel) });
  const on = await L.record(books, sw.entry, {});
  const live = on.ok ? L.allocate(on.ledger, {}) : { ok: false, why: on.why };
  const bySite = await L.sign(keys.site, { type: 'switch', at: AT, path: 'fork', pool, counsel: counselDigest(counsel) });
  const nodeSwitch = await L.record(books, bySite.entry, {});
  const again = await L.sign(keys.founder, { type: 'switch', at: AT2, path: 'fork', pool, counsel: counselDigest(counsel) });
  const second = on.ok ? await L.record(on.ledger, again.entry, {}) : { ok: false, why: 'no first switch' };
  return {
    recorded: on.ok, why: on.ok ? null : on.why,
    liveEqualsSandbox: live.ok && sandbox.ok && JSON.stringify(live.parts) === JSON.stringify(sandbox.parts) && live.pool === sandbox.pool,
    live: live.ok ? { pool: live.pool, total: live.total, sandbox: live.sandbox } : { why: live.why },
    nodeSwitch: { ok: nodeSwitch.ok, why: nodeSwitch.ok ? null : nodeSwitch.why },
    second: { ok: second.ok, why: second.ok ? null : second.why },
    booksStillOff: books.switch === null,
  };
}

/** A mock larger network of the same schema and genesis: three other contributors, and a release of the site's asset by another key. */
export async function mockNetwork(world, keys) {
  let l = (await L.record(L.empty(), world.genesis, {})).ledger;
  const ids = new Set(), mockProof = [{ kind: 'mock-network', ref: 'network', digest: counselDigest('a mock of a larger network') }];
  const put = async (k, fields) => { const s = await L.sign(k, fields); const r = await L.record(l, s.entry, { gate: async () => ({ ok: true }) }); if (r.ok) { l = r.ledger; ids.add(r.id); } return r; };
  const squat = await put(keys.network[0], { type: 'release', asset: assetOf(world.ids.site.id), at: AT, form: 'node', lineage: [], proofs: mockProof });
  for (let i = 0; i < keys.network.length; i++) {
    await put(keys.network[i], { type: 'release', asset: 'network:node-' + (i + 1), at: AT, form: 'node', lineage: [], proofs: mockProof });
    await put(keys.networkMeasurer, { type: 'value', asset: 'network:node-' + (i + 1), at: AT, basis: 'routing', job: 'network:job-' + (i + 1), proofs: mockProof, units: [5, 7, 11][i] });
  }
  return { ledger: l, ids, squatted: squat.ok };
}

/** The network path. auditGate = the books' own gate; the network's own entries pass by their identities. */
export async function network(books, world, keys, auditGate, pool, counsel) {
  const mock = await mockNetwork(world, keys);
  const gate = async (entry, ledger) => (mock.ids.has(await L.idOf(entry)) ? { ok: true } : auditGate(entry, ledger));
  const rc = await L.reconcile(mock.ledger, books, { gate });
  const sw = await L.sign(keys.founder, { type: 'switch', at: AT, path: 'network', pool, counsel: counselDigest(counsel) });
  const on = await L.record(rc.ledger, sw.entry, {});
  const live = on.ok ? L.allocate(on.ledger, {}) : { ok: false, why: on.why };
  const again = on.ok ? await L.replay(on.ledger.log, { gate }) : { ok: false };
  const replayed = again.ok ? L.allocate(again.ledger, {}) : { ok: false };
  const booksKeys = Object.keys((L.credits(books).credits) || {}), netKeys = keys.network.map((k) => k.pub);
  const parts = live.ok ? live.parts : {};
  return {
    squatted: mock.squatted, booksEntries: books.log.length, added: rc.added, skipped: rc.skipped,
    refused: rc.refused.map((x) => ({ n: x.n, type: books.log[x.n].entry.type, asset: books.log[x.n].entry.asset || null, why: x.why })),
    switched: on.ok, pool: live.ok ? live.pool : null, total: live.ok ? live.total : null,
    booksContributorsCovered: booksKeys.filter((k) => parts[k] > 0).length, booksContributors: booksKeys.length,
    networkContributorsCovered: netKeys.filter((k) => parts[k] > 0).length, networkContributors: netKeys.length,
    replaySame: replayed.ok && live.ok && JSON.stringify(replayed.parts) === JSON.stringify(live.parts),
  };
}
