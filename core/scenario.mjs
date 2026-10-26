// ════════════════════════════════════════════════════════════════
// core/scenario.mjs — Phase 1's scenario: what the cells do, in order, and the facts it measures. Browser-safe: the
// same function runs in core/prove.mjs (cells in one process, then each in its own) and on the live page (cells in the
// tab), so the page re-derives the receipt's facts from the real organs rather than showing them.
//
// The relay (carry) is the only path between cells. It hands a packet to its node and every reply onward, and reads
// nothing in the bytes except whether they frame as LIGHT — the count claim F1 rests on.
// ════════════════════════════════════════════════════════════════
import { frame, prepare, finish, KINDS } from './vendor/light/packet.mjs';
import { replay } from './vendor/ledger/contrib.mjs';
import { hex, unhex } from './identity.mjs';
import { LINK } from './node.mjs';
import { meshSetup } from './cells.mjs';

/** konomi-slm's own held-out triage rows, as asks would carry them. domains = konomi-slm's vendor/seed-library/domains.mjs */
export function triageRowsFrom(domains, n) {
  const d = domains.loadDomain('triage', {});
  return d.heldRows.slice(0, n).map((i) => Object.fromEntries(d.features.map((f) => [f, Math.round(d.cols[f][i] * 1e6) / 1e6])));
}

/** BRK1 packets break-it's gate refuses at named stages. wire = break-it's src/wire.mjs; stranger = an identity no one pins. */
export async function brk1CasesFrom(wire, stranger) {
  const rec = (sender) => wire.encodeUnsigned({ sender, counter: 1n, op: wire.OPS.REC, account: 1000, period: 63, amount: 100 });
  const zero = wire.withSignature(rec(1), new Uint8Array(64));
  const n = wire.rawCheck(zero).n;
  const forged = wire.withSignature(rec(1), await stranger.sign(wire.signedBytes(zero, n)));
  return [
    { name: 'not a packet at all', hex: 'deadbeef', expect: 'size' },
    { name: 'a record with a blank signature', hex: hex(zero), expect: 'signature' },
    { name: 'a record from a sender break-it never pinned', hex: hex(wire.withSignature(rec(9), new Uint8Array(64))), expect: 'sender' },
    { name: 'a record signed by a key that is not the sender’s', hex: hex(forged), expect: 'signature' },
  ];
}

// what a step's result says, without its bytes — the list two runs are compared on (F9)
export function brief(r) {
  if (!r || typeof r !== 'object') return r === undefined ? null : r;
  const o = {};
  for (const k of ['ok', 't', 'stage', 'family', 'verdict', 'outcome', 'recorded', 'decoded', 'recognised', 'offered', 'adopted', 'autoimmuneBlocked', 'recognitionOnly', 'added', 'skipped', 'refused', 'released', 'why']) if (r[k] !== undefined) o[k] = r[k];
  return o;
}

/** cells = { breakit, konomi, liar, budgeted }, each { id, call(op, args) }. inputs = { rows, brk1 }. onStep(name, r) is told of each step. */
export async function scenario(cells, inputs, onStep) {
  const { ids } = await meshSetup();
  const B = cells.breakit, K = cells.konomi, D = cells.liar, G = cells.budgeted;
  const byId = { [B.id]: B, [K.id]: K, [D.id]: D, [G.id]: G };
  const rows = inputs.rows;
  const steps = [], wire = { messages: 0, nonLight: 0, bytes: 0 };
  const note = (name, r) => { steps.push([name, brief(r)]); if (typeof onStep === 'function') onStep(name, r); return r; };
  const carry = async (to, bytesHex) => {
    const b = unhex(bytesHex);
    wire.messages++; wire.bytes += b.length;
    if (!frame(b, {}).ok) wire.nonLight++;
    const r = await byId[to].call('hear', { bytes: bytesHex });
    const after = [];
    for (const rep of r.replies || []) after.push(...(await carry(rep.to, rep.bytes)));
    return [r, ...after];
  };
  const ask = async (from, skill, input) => {
    const a = await from.call('ask', { skill, input });
    if (!a.ok) return { a, hops: [], answer: null };
    const hops = await carry(a.to, a.bytes);
    return { a, hops, answer: hops.find((h) => h.t === 'answer') || null };
  };

  for (const [x, y] of [[B, K], [K, B], [B, D], [D, B], [K, D], [D, K], [G, K]]) note('pin', await x.call('pin', { card: await y.call('card') }));

  // F3, F5 — break-it asks for triage: a training run (some asks no verified pattern covers), then twenty measured asks
  const used = { breakit: 0, konomi: 0 };
  const training = [{}, rows[0], {}, rows[1], rows[2], rows[3], {}, rows[4], rows[5], rows[6]];
  for (const input of training) { const x = await ask(B, 'triage', input); note('train', x.answer); if (x.answer && x.answer.outcome === 'verified') used.breakit++; }
  let toHonest = 0;
  for (let i = 0; i < 20; i++) {
    const x = await ask(B, 'triage', rows[7 + i]);
    note('ask', x.answer);
    if (x.a.to === K.id) toHonest++;
    if (x.answer && x.answer.outcome === 'verified') used.breakit++;
  }
  const couplings = { honest: await B.call('weight', { peer: K.id, skill: 'triage' }), dishonest: await B.call('weight', { peer: D.id, skill: 'triage' }), start: LINK.START, next: 20, toHonest };
  couplings.dishonestShrank = couplings.dishonest < LINK.START;

  // konomi-slm asks break-it to screen BRK1 packets
  const screens = [];
  for (const c of inputs.brk1) {
    const x = await ask(K, 'screen', { hex: c.hex });
    note('screen', x.answer);
    if (x.answer && x.answer.outcome === 'verified') used.konomi++;
    screens.push({ case: c.name, expect: c.expect, stage: x.answer && x.answer.answer ? x.answer.answer.stage : null, outcome: x.answer ? x.answer.outcome : null });
  }

  // F2 — at each organ: one byte changed, a key it never pinned, a replay; each handed straight to the node
  const cases = [];
  const forgeAs = async (slot, value, counter) => { const p = prepare({ sender: slot, counter, kind: KINDS.JSON, value, dictId: 0 }); return hex(finish(p.unsigned, await ids.stranger.sign(p.signed)).bytes); };
  for (const [X, Y, ySlot, at] of [[K, B, ids.breakit.slot, 'konomi-slm'], [B, K, ids.konomi.slot, 'break-it']]) {
    const genuine = (await Y.call('shareLedger', { to: X.id })).bytes;
    note('genuine', (await carry(X.id, genuine))[0]);
    const another = unhex((await Y.call('shareLedger', { to: X.id })).bytes); another[30] ^= 1;
    const t = await X.call('hear', { bytes: hex(another) });
    const s = await X.call('hear', { bytes: await forgeAs(ySlot, { t: 'ledger', to: X.id, log: [] }, 1n) });
    const r = await X.call('hear', { bytes: genuine });
    for (const [kind, v] of [['one byte changed', t], ['a key never pinned', s], ['a replay', r]]) { cases.push({ at, kind, ok: v.ok, stage: v.stage, decoded: v.decoded }); note('hostile', v); }
  }

  // F4 — an attack refused at break-it immunises konomi-slm; a valid packet slipped into a bundle is never adopted
  const attack = await forgeAs(ids.konomi.slot, { t: 'ask', to: B.id, id: 'ask:attack:1', skill: 'screen', input: { hex: 'aa' }, token: {} }, 7n);
  const atB = note('attack', await B.call('hear', { bytes: attack }));
  const shared = await B.call('antigens');
  const bundle = await B.call('shareAntibodies', { to: K.id });
  const adoptR = note('antibodies', (await carry(K.id, bundle.bytes))[0]);
  const after = note('attack-again', await K.call('hear', { bytes: attack }));
  let adoptedAdmitted = 0;
  for (const h of shared) if ((await K.call('hear', { bytes: h })).ok === true) adoptedAdmitted++;
  const probe = await D.call('autoimmuneProbe', { to: K.id });
  const auto = note('autoimmunity', (await carry(K.id, probe.bytes))[0]);
  const immunity = { attackAtSender: atB.stage, shared: shared.length, adopted: adoptR.adopted, recognisedAfter: after.recognised === true, autoimmuneBlocked: auto.autoimmuneBlocked, adoptedAdmitted };

  // F5 — each organ sends the other its ledger; each records only what it can re-check
  note('ledger', (await carry(K.id, (await B.call('shareLedger', { to: K.id })).bytes))[0]);
  note('ledger', (await carry(B.id, (await K.call('shareLedger', { to: B.id })).bytes))[0]);
  const cB = await B.call('credits'), cK = await K.call('credits');
  const lB = await B.call('ledger'), lK = await K.call('ledger');
  const records = lB.log.filter((x) => x.entry.type === 'value' && x.entry.by === B.id).length + lK.log.filter((x) => x.entry.type === 'value' && x.entry.by === K.id).length;
  let replayed = true;
  for (const l of [lB, lK]) { const r = await replay(l.log, { gate: async () => ({ ok: true }) }); if (!r.ok || r.ledger.head !== l.head) replayed = false; }
  // "the ledgers agree": who is credited what (the totals), and which entries each holds. The line items' log positions
  // depend on the order each ledger received its entries, so they are reported, not compared.
  const totals = (c) => (c && c.ok ? JSON.stringify(Object.fromEntries(Object.entries(c.credits).sort())) : null);
  const sigs = (l) => l.log.map((x) => x.entry.sig).sort().join(',');
  const ledger = {
    used: used.breakit + used.konomi, usedByBreakit: used.breakit, usedByKonomi: used.konomi, records, entries: [lB.log.length, lK.log.length],
    creditsEqual: totals(cB) !== null && totals(cB) === totals(cK), sameEntries: sigs(lB) === sigs(lK),
    lineItemsSameOrder: JSON.stringify(cB.lines) === JSON.stringify(cK.lines), replayed, credits: cB.ok ? cB.credits : null,
  };

  // F6 — break-it's memory in LIGHT, and recall
  const v = await B.call('vault');
  const top = await B.call('recall', { q: 'triage answer from konomi-slm' });
  const memory = { identical: v.identical === true, vaultBytes: unhex(v.bytes || '').length, plainBytes: v.plain, topIsTriageAnswer: !!(top.center && top.center.meta.kind === 'answer' && top.center.meta.skill === 'triage'), top: top.center ? top.center.text : null };

  // F7 — a node with a budget of five
  let allowed = 0;
  for (let i = 0; i < 5; i++) if ((await G.call('ask', { skill: 'triage', input: rows[30] })).ok) allowed++;
  const before = (await G.call('stats')).sent;
  const sixth = await G.call('ask', { skill: 'triage', input: rows[30] });
  note('budget', sixth);
  const budget = { allowed, sixthRefused: sixth.ok === false && /over budget/.test(String(sixth.why)), sixthPackets: (await G.call('stats')).sent - before, why: sixth.why };

  // F8 — konomi-slm grown again from the genome its card carries
  const g = await K.call('regrow');
  const seed = { same: g.same === true, count: Object.keys(g.ids || {}).length, ids: g.ids };

  return { facts: { wire, hostile: { cases }, couplings, screens, immunity, ledger, memory, budget, seed }, steps };
}
