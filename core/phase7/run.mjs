// ════════════════════════════════════════════════════════════════
// core/phase7/run.mjs — Phase 7's runs, the same in Node (cells in their own processes) and in a tab (cells in the tab).
// A cell is { id, call(op, args) } (core/cells.mjs opsOf with world.mjs extraOf). Every packet between nodes is carried
// here, and kept by its sender, so the measure can read every byte a node sent.
//
//   carrier(byId, wire, dead)     carry bytes to a node and every reply on; a packet to a dead node is dropped
//   rosterUp(cells, sign)         the roster of the cells' cards, signed by `sign` (a founder), and each node pinning from it
//   forge(slot, to, key, n)       a packet in the name of `slot`, signed by `key` (another's key): refused at signature by a
//                                 node that pins that slot, at sender by one that does not
//   signedAs(id, to, value, n)    a genuine packet from an identity, with a counter n above anything it has sent
//   bundleAs(id, to, hexes, n)    an antibody message from an identity, offering these packets as hostile
//   ask(...)                      one ask, carried; asked again if it went to a dead node (the lost ask expired)
//   runEstate / runChild / runCoupled   the three runs the claims measure
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { frame, prepare, finish, KINDS } from '../vendor/light/packet.mjs';
import { makeBundle } from '../vendor/immune/exchange.mjs';
import { hex, unhex } from '../identity.mjs';
import { makeRoster } from '../roster.mjs';
import { createNode } from '../node.mjs';

export function wireOf() { return { messages: 0, nonLight: 0, bytes: 0, sent: {}, evidence: {} }; }

export function carrier(byId, w, dead = new Set()) {
  const carry = async (from, to, bytesHex) => {
    const b = unhex(bytesHex);
    w.messages++; w.bytes += b.length;
    if (!frame(b, {}).ok) w.nonLight++;
    (w.sent[from] = w.sent[from] || []).push(bytesHex);
    if (dead.has(to) || !byId[to]) return { dropped: true };
    const r = await byId[to].call('hear', { bytes: bytesHex });
    if (r.t === 'answer' && typeof r.id === 'string') w.evidence[r.id] = { packet: bytesHex, holder: r.from, asker: to, skill: r.skill, outcome: r.outcome, answer: r.answer };
    for (const rep of r.replies || []) await carry(to, rep.to, rep.bytes);
    return r;
  };
  return carry;
}

export async function rosterUp(cells, makeIt) {
  const cards = [];
  for (const c of Object.values(cells)) cards.push(await c.call('card'));
  const ro = await makeIt(cards);
  if (!ro.ok) throw new Error('the roster was not made: ' + ro.why);
  const pinned = {};
  for (const [role, c] of Object.entries(cells)) pinned[role] = (await c.call('pinRoster', { roster: ro.roster, founder: ro.roster.founder })).pinned;
  return { roster: ro.roster, cards, pinned };
}

async function packetOf(sender, counter, value, signer) {
  const p = prepare({ sender, counter: BigInt(counter), kind: KINDS.JSON, value, dictId: 0 });
  return hex(finish(p.unsigned, await signer.sign(p.signed)).bytes);
}
export const forge = (slot, to, key, n) => packetOf(slot, n, { t: 'ledger', to, log: [] }, key);
export const signedAs = (id, to, value, n) => packetOf(id.slot, n, { ...value, to }, id);
export async function bundleAs(id, to, hexes, n) {
  let msg = null;
  makeBundle(id.id, hexes, (x) => { msg = x; return new Uint8Array(64); });
  const sig = await id.sign(msg);
  return packetOf(id.slot, n, { t: 'antibody', to, bundle: makeBundle(id.id, hexes, () => sig) }, id);
}

/** One ask, carried. If it went to a dead holder, the asker's ask expires and it is asked again. → the ask's story */
export async function ask(cells, carry, w, dead, asker, skill, input) {
  const roleOf = Object.fromEntries(Object.entries(cells).map(([r, c]) => [c.id, r]));
  const lost = [];
  for (let tries = 0; tries < 4; tries++) {
    const a = await cells[asker].call('ask', { skill, input });
    if (!a.ok) return { asker, skill, input, outcome: 'not asked: ' + a.why, lost };
    await carry(cells[asker].id, a.to, a.bytes);
    if (dead.has(a.to)) { lost.push(roleOf[a.to]); await cells[asker].call('expire', { id: a.id }); continue; }
    const ev = w.evidence[a.id];
    return { asker, skill, input, to: roleOf[a.to], job: a.id, outcome: ev ? ev.outcome : 'no answer', answer: ev ? ev.answer : null, lost };
  }
  return { asker, skill, input, outcome: 'every try went to a dead holder', lost };
}

/** The 24 stay asks in the sealed order: every cabin for each range in turn; ask k by askers[k mod 3]. */
export function stayAsks(claims) {
  const out = [];
  for (const [checkin, checkout] of claims.stay.ranges) for (const cabin of claims.stay.cabins) out.push({ cabin, checkin, checkout });
  return out;
}

/** Model A: the estate's mesh with the client's node in it. cells = { site, breakit, konomi, wishwood }; ids = estate identities. */
export async function runEstate(cells, claims, ids) {
  const w = wireOf(), dead = new Set(), byId = Object.fromEntries(Object.values(cells).map((c) => [c.id, c]));
  const carry = carrier(byId, w, dead);
  const up = await rosterUp(cells, (cards) => makeRoster(ids.founder, cards));
  const outsiderCard = (await createNode({ name: 'outsider', identity: ids.stranger })).card();
  const outsider = await makeRoster(ids.stranger, [outsiderCard, ...up.cards]);
  const offered = {};
  for (const [r, c] of Object.entries(cells)) offered[r] = await c.call('pinRoster', { roster: outsider.roster, founder: ids.founder.id });
  const stays = [], guards = [];
  const qs = stayAsks(claims);
  for (let k = 0; k < qs.length; k++) stays.push(await ask(cells, carry, w, dead, claims.askers[k % claims.askers.length], 'stay', qs[k]));
  for (const set of claims.guard.sets) guards.push({ id: set.id, ...(await ask(cells, carry, w, dead, claims.guard.asker, 'guard', { feeds: set.feeds })) });
  // A5: a packet in the living site's name signed by a stranger, first at break-it; then another, first at the client's node
  const immune = [];
  for (const [first, others, n] of [['breakit', ['wishwood'], 700001], ['wishwood', ['site', 'breakit', 'konomi'], 700002]]) {
    const bad = await forge(ids.site.slot, cells[first].id, ids.stranger, n);
    const at = await cells[first].call('hear', { bytes: bad });
    const adopted = {}, again = {};
    for (const o of others) {
      const s = await cells[first].call('shareAntibodies', { to: cells[o].id });
      adopted[o] = s ? await carry(cells[first].id, cells[o].id, s.bytes) : null;
      again[o] = await cells[o].call('hear', { bytes: bad });
    }
    immune.push({ first, at, adopted, again });
  }
  const ledgers = {}, cards = {};
  for (const [r, c] of Object.entries(cells)) { ledgers[r] = await c.call('ledger'); cards[r] = await c.call('card'); }
  return { w, up, offered, stays, guards, immune, ledgers, cards };
}

/** A signed packet from every node of one organism (its ledger, shared with a peer it pins). → { role: hex } */
export async function packetsOf(cells) {
  const out = {};
  for (const [r, c] of Object.entries(cells)) {
    const peer = (await c.call('pinned'))[0];
    const s = peer ? await c.call('shareLedger', { to: peer }) : null;
    out[r] = s ? s.bytes : null;
  }
  return out;
}

/** Model B, sovereign: the client's own organism. cells = { desk, stay-a, stay-b, gate }; planted = core/seed.mjs plant(). */
export async function runChild(cells, claims, planted, estateIds, cases, kill, estate) {
  const w = wireOf(), dead = new Set(), byId = Object.fromEntries(Object.values(cells).map((c) => [c.id, c]));
  const carry = carrier(byId, w, dead);
  const { rosterOf } = await import('../seed.mjs');
  const up = await rosterUp(cells, (cards) => rosterOf(planted, cards));
  // the forged packet: in the desk's name, signed by a stranger, first at stay-a, shared with the other three
  const bad = await forge(planted.ids.desk.slot, cells['stay-a'].id, estateIds.stranger, 700003);
  const first = await cells['stay-a'].call('hear', { bytes: bad });
  const adopted = {}, again = {};
  for (const o of ['desk', 'stay-b', 'gate']) {
    const s = await cells['stay-a'].call('shareAntibodies', { to: cells[o].id });
    adopted[o] = s ? await carry(cells['stay-a'].id, cells[o].id, s.bytes) : null;
    again[o] = await cells[o].call('hear', { bytes: bad });
  }
  // B2: a signed packet from every estate node to every client node, and from every client node to every estate node
  const packets = await packetsOf(cells), cross = { intoChild: {}, intoEstate: {} };
  for (const [er, bytes] of Object.entries(estate.packets)) { cross.intoChild[er] = {}; for (const [cr, c] of Object.entries(cells)) cross.intoChild[er][cr] = bytes ? (await c.call('hear', { bytes })).stage || 'admitted' : 'no packet'; }
  for (const [cr, bytes] of Object.entries(packets)) { cross.intoEstate[cr] = {}; for (const [er, c] of Object.entries(estate.cells)) cross.intoEstate[cr][er] = bytes ? (await c.call('hear', { bytes })).stage || 'admitted' : 'no packet'; }
  const screens = [];
  for (const c of cases) screens.push({ name: c.name, expect: c.expect, hex: c.hex, ...(await ask(cells, carry, w, dead, 'desk', 'screen', { hex: c.hex })) });
  const stays = [], qs = stayAsks(claims).slice(0, 12);
  for (let k = 0; k < qs.length; k++) {
    const r = await ask(cells, carry, w, dead, 'desk', 'stay', qs[k]);
    stays.push(r);
    if (k === 5 && r.to) { await kill(r.to); dead.add(cells[r.to].id); }
  }
  const ledgers = {}, cards = {};
  for (const [r, c] of Object.entries(cells)) if (!dead.has(c.id)) ledgers[r] = await c.call('ledger');
  for (const [r, c] of Object.entries(cells)) if (!dead.has(c.id)) cards[r] = await c.call('card');
  return { w, up, immune: { first, adopted, again }, packets, cross, screens, stays, killed: [...dead].map((id) => Object.keys(cells).find((r) => cells[r].id === id)), ledgers, cards };
}

/** Model B, coupled: the same organism on the estate's genesis; the desk pins the estate's immune hub (break-it), and the hub the desk. */
export async function runCoupled(cells, claims, planted, estateIds, hub) {
  const all = { ...cells, hub };
  const w = wireOf(), dead = new Set(), byId = Object.fromEntries(Object.values(all).map((c) => [c.id, c]));
  const carry = carrier(byId, w, dead);
  const { rosterOf } = await import('../seed.mjs');
  const up = await rosterUp(cells, (cards) => rosterOf(planted, cards));
  const pinHub = await cells.desk.call('pin', { card: await hub.call('card') });
  const pinDesk = await hub.call('pin', { card: await cells.desk.call('card') });
  const stays = [], qs = stayAsks(claims).slice(0, 12);
  for (const q of qs) stays.push(await ask(cells, carry, w, dead, 'desk', 'stay', q));
  // the hub's antibodies for a forged packet (in the living site's name, signed by a stranger), and the desk sharing them on
  const bad = await forge(estateIds.site.slot, hub.id, estateIds.stranger, 700004);
  const atHub = await hub.call('hear', { bytes: bad });
  const s = await hub.call('shareAntibodies', { to: cells.desk.id });
  const adopted = s ? await carry(hub.id, cells.desk.id, s.bytes) : null;
  const again = await cells.desk.call('hear', { bytes: bad });
  const sharedOn = {};
  for (const o of ['stay-a', 'stay-b', 'gate']) {
    const on = await cells.desk.call('shareAntibodies', { to: cells[o].id });
    sharedOn[o] = on ? { shared: true, adopted: await carry(cells.desk.id, cells[o].id, on.bytes), again: await cells[o].call('hear', { bytes: bad }) } : { shared: false };
  }
  // an antibody made from a genuine packet of the client's own: stay-a to the desk, fresh, offered by the hub as hostile
  const genuine = await signedAs(planted.ids['stay-a'], cells.desk.id, { t: 'ledger', log: [] }, 900001);
  const falseOffer = await carry(hub.id, cells.desk.id, await bundleAs(estateIds.breakit, cells.desk.id, [genuine], 900002));
  const ledgers = {}, cards = {};
  for (const [r, c] of Object.entries(cells)) { ledgers[r] = await c.call('ledger'); cards[r] = await c.call('card'); }
  return { w, up, pinHub, pinDesk, stays, immune: { atHub, adopted, again, sharedOn }, falseOffer, ledgers, cards };
}
