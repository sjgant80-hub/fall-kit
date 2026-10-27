// ════════════════════════════════════════════════════════════════
// core/phase6/books.mjs — Phase 6, pass 2 (claims C1–C4): the nodes at work, and the auditor's books.
//
// run(cells, inputs) carries every packet between the nodes (in their own processes, or in a tab) and keeps, as
// evidence, each holder's own signed answer packet by the job it answered. Each node writes a value for every answer it
// used whose receipt it checked: that is the foundation's node, unchanged.
//
// books(...) is the auditor: each node sends it its ledger as a signed LIGHT packet; the auditor admits the packet
// through the foundation's edge (a pinned sender, its signature), replays the node's log, and reconciles it into one set
// of books under its own gate, which re-checks every entry: a node's release against its card, a routing value against
// the holder's own signed answer packet (its signature, its digest, its receipt; a door answer by running the door
// again), a Phase 4 specialist's release and leave-one-out value against Phase 4's committed receipt.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { frame, open } from '../vendor/light/packet.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { pack, unpack } from '../vendor/light/vault.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import { hex, unhex, verifyBytes } from '../identity.mjs';
import { digestOf, assetOf, receiptHolds } from '../node.mjs';
import { outbound } from '../edge.mjs';
import { looUnits } from '../economy.mjs';
import { doorChecks, AT } from './world.mjs';

const enc = (s) => new TextEncoder().encode(s);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** The asks of the run, in order: [asker, skill, input]. inputs = { brk1: [{ hex }], rows: [triage rows 8–27], messages: [5 texts] }. */
export function asksOf(inputs) {
  const out = [];
  for (const c of inputs.brk1) out.push(['site', 'screen', { hex: c.hex }]);
  for (const row of inputs.rows.slice(0, 10)) out.push(['site', 'triage', row]);
  for (const row of inputs.rows.slice(10, 20)) out.push(['breakit', 'triage', row]);
  for (const c of inputs.brk1) out.push(['konomi', 'screen', { hex: c.hex }]);
  for (const text of inputs.messages) out.push(['breakit', 'door', { text }]);
  for (const text of inputs.messages) out.push(['konomi', 'door', { text }]);
  return out;
}

/** The nodes at work. cells = { site, breakit, konomi, liar }; auditorCard = the auditor's card, which every node pins. */
export async function run(cells, inputs, auditorCard) {
  const byId = Object.fromEntries(Object.values(cells).map((c) => [c.id, c])), roleOf = Object.fromEntries(Object.entries(cells).map(([r, c]) => [c.id, r]));
  const wire = { messages: 0, nonLight: 0, bytes: 0 }, evidence = {}, asks = [];
  const carry = async (to, bytesHex) => {
    const b = unhex(bytesHex);
    wire.messages++; wire.bytes += b.length;
    if (!frame(b, {}).ok) wire.nonLight++;
    const r = await byId[to].call('hear', { bytes: bytesHex });
    if (r.t === 'answer' && typeof r.id === 'string') evidence[r.id] = { packet: bytesHex, holder: r.from, asker: to, skill: r.skill, outcome: r.outcome };
    for (const rep of r.replies || []) await carry(rep.to, rep.bytes);
    return r;
  };
  const honest = ['site', 'breakit', 'konomi'];
  for (const a of Object.keys(cells)) for (const b of Object.keys(cells)) if (a !== b && (honest.includes(a) || honest.includes(b))) await cells[a].call('pin', { card: await cells[b].call('card') });
  for (const r of honest) await cells[r].call('pin', { card: auditorCard });
  for (const [asker, skill, input] of asksOf(inputs)) {
    const a = await cells[asker].call('ask', { skill, input });
    if (!a.ok) { asks.push({ asker, skill, to: null, outcome: 'not asked: ' + a.why }); continue; }
    await carry(a.to, a.bytes);
    const ev = evidence[a.id];
    asks.push({ asker, skill, to: roleOf[a.to], job: a.id, outcome: ev ? ev.outcome : 'no answer' });
  }
  const ledgers = {}, sent = {};
  for (const r of Object.keys(cells)) {
    ledgers[r] = await cells[r].call('ledger');
    const s = honest.includes(r) ? await cells[r].call('shareLedger', { to: auditorCard.id }) : null;
    sent[r] = s ? s.bytes : null;
  }
  return { wire, evidence, asks, ledgers, sent };
}

/** What one node's ledger shows of its own contributions. */
export function ownWork(log, id, liarAsset) {
  const es = log.map((x) => x.entry);
  return { entries: es.length, release: es.some((e) => e.type === 'release' && e.by === id && e.asset === assetOf(id)), valuesBy: es.filter((e) => e.type === 'value' && e.by === id).length, onLiar: es.filter((e) => e.type === 'value' && e.asset === liarAsset).length };
}

/** The Phase 4 specialists the gate let in, from its committed receipt. */
export function specialistsOf(receipt) {
  const f = receipt && receipt.facts ? receipt.facts : {};
  const ds = [...((f.g1 && f.g1.candidates) || []), ...((f.g2 && f.g2.controls) || [])].filter((d) => isObj(d) && d.joined && d.pass === true);
  return ds.map((d) => ({ skill: d.skill, patternId: d.patternId, kind: f.g1.candidates.includes(d) ? 'candidate' : 'control', gain: d.diff, units: looUnits(d.diff), asset: 'phase4:' + d.skill + ':' + d.patternId, job: 'phase4:gate:' + d.skill }));
}

/**
 * The auditor's gate. ctx = { cards: Map(id → card), evidence, phase4: { sha, specialists }, growth: id, founder: id }.
 * Records, as it goes, which values it re-checked against an answer packet (ctx.checked).
 */
export function auditGate(ctx) {
  const cardOf = (asset) => [...ctx.cards.values()].find((c) => assetOf(c.id) === asset) || null;
  return async (entry, ledger) => {
    const p = entry.proofs && entry.proofs[0];
    if (entry.type === 'release' && entry.form === 'card') {
      const s = ctx.phase4.specialists.find((x) => x.asset === entry.asset);
      return s && entry.by === ctx.growth && entry.proofs.length === 1 && p.kind === 'phase4-receipt' && p.ref === s.patternId && p.digest === ctx.phase4.sha ? { ok: true } : { ok: false, why: 'not a specialist Phase 4\'s receipt lets in' };
    }
    if (entry.type === 'release') {
      const c = ctx.cards.get(entry.by);
      if (!c) return { ok: false, why: 'the auditor holds no card for that key' };
      const { sig, release, ...body } = c;
      return entry.asset === assetOf(c.id) && entry.form === 'node' && entry.proofs.length === 1 && p.digest === digestOf(body) ? { ok: true } : { ok: false, why: 'the release does not match the card' };
    }
    if (entry.type === 'value' && entry.basis === 'mesh-share') {
      const s = ctx.phase4.specialists.find((x) => x.asset === entry.asset);
      return s && entry.by === ctx.founder && entry.job === s.job && entry.units === s.units && p.kind === 'phase4-receipt' && p.digest === ctx.phase4.sha ? { ok: true } : { ok: false, why: 'not the leave-one-out Phase 4\'s receipt measured' };
    }
    if (entry.type === 'value' && entry.basis === 'routing') {
      const ev = ctx.evidence[entry.job], holder = cardOf(entry.asset);
      if (!ev || !holder || ev.holder !== holder.id || ev.asker !== entry.by) return { ok: false, why: 'no answer packet for that job from that holder to that asker' };
      // an asset id names a key but does not bind it: whoever releases it first holds it. A value counts only on an asset
      // released by the very key that answered, so nobody who squats an id is ever credited with another node's work
      const held = ledger && ledger.assets ? ledger.assets[entry.asset] : null;
      if (!held || held.maker !== holder.id) return { ok: false, why: 'the asset was released by another key than the one that answered' };
      const b = unhex(ev.packet), f = frame(b, {});
      if (!f.ok || !(await verifyBytes(holder.id, f.signed, f.sig))) return { ok: false, why: 'the answer packet is not signed by the holder' };
      const v = open(b, { keyFor: () => unhex(holder.id), verify: () => true, lastCounter: () => 0n });
      const m = v.admit && isObj(v.value) ? v.value : null;
      if (!m || m.t !== 'answer' || m.id !== entry.job || m.to !== entry.by) return { ok: false, why: 'the packet is not that answer' };
      if (digestOf(m.answer) !== p.digest) return { ok: false, why: 'the answer is not the one valued' };
      const good = m.answer.verdict === 'VERIFIED' && (m.skill === 'door' ? doorChecks(m.answer) : receiptHolds(m.answer));
      if (good) ctx.checked.add(entry.job);
      return good ? { ok: true } : { ok: false, why: 'its receipt does not check' };
    }
    return { ok: false, why: 'not an entry the auditor gates' };
  };
}

/** The auditor's books: the genesis, every node's ledger as it sent it, then Phase 4's specialists. */
export async function books(world, out, ctx, founderKeys, growthKeys) {
  let l = (await L.record(L.empty(), world.genesis, {})).ledger;
  const gate = auditGate(ctx), peers = [...ctx.cards.values()].map((c) => ({ slot: c.slot, id: c.id, raw: unhex(c.id) }));
  const merged = {};
  for (const r of ['site', 'breakit', 'konomi']) {
    const o = await outbound(unhex(out.sent[r]), { peers, lastCounter: () => 0n, verifyBytes });
    if (!o.ok || !isObj(o.value) || o.value.t !== 'ledger' || o.value.to !== ctx.auditor) { merged[r] = { admitted: false, why: o.why || 'not a ledger to the auditor' }; continue; }
    const theirs = await L.replay(o.value.log, { gate });
    if (!theirs.ok) { merged[r] = { admitted: true, replayed: false, why: theirs.why }; continue; }
    const rc = await L.reconcile(l, theirs.ledger, { gate });
    l = rc.ledger;
    merged[r] = { admitted: true, replayed: true, from: o.from === world.ids[r].id, sent: o.value.log.length, added: rc.added, skipped: rc.skipped, refused: rc.refused };
  }
  const specialists = [];
  let planted = null;
  for (const s of ctx.phase4.specialists) {
    const proof = [{ kind: 'phase4-receipt', ref: s.patternId, digest: ctx.phase4.sha }];
    const rel = await L.sign(growthKeys, { type: 'release', asset: s.asset, at: AT, form: 'card', lineage: [], proofs: proof });
    const a = await L.record(l, rel.entry, { gate });
    if (a.ok) l = a.ledger;
    if (planted === null) {   // the planted value: this specialist's own job, one unit over what the receipt measured
      const pv = await L.sign(founderKeys, { type: 'value', asset: s.asset, at: AT, basis: 'mesh-share', job: s.job, proofs: proof, units: s.units + 1 });
      const pr = await L.record(l, pv.entry, { gate });
      if (pr.ok) l = pr.ledger;
      planted = { asset: s.asset, units: s.units + 1, ok: pr.ok, why: pr.ok ? null : pr.why };
    }
    const val = await L.sign(founderKeys, { type: 'value', asset: s.asset, at: AT, basis: 'mesh-share', job: s.job, proofs: proof, units: s.units });
    const b = await L.record(l, val.entry, { gate });
    if (b.ok) l = b.ledger;
    specialists.push({ ...s, released: a.ok, valued: b.ok, why: a.ok && b.ok ? null : a.why || b.why });
  }
  return { ledger: l, merged, specialists, planted };
}

/** The books as files: the log as JSON text, and the same file packed as a LIGHT vault. */
export function bookFiles(ledger) {
  const json = JSON.stringify(ledger.log, null, 1) + '\n', bytes = enc(json);
  const v = pack([{ path: 'books.json', bytes }]);
  return { json, light: v.ok ? v.bytes : null, sha: hex(sha256(bytes)) };
}
/** Does a LIGHT vault read back exactly this text? */
export function vaultHolds(light, json) {
  const u = unpack(light);
  return u.ok && u.entries.length === 1 && u.entries[0].path === 'books.json' && new TextDecoder().decode(u.entries[0].bytes) === json;
}
