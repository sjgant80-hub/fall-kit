import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, RULES } from './judge.mjs';

const sealed = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const hostile = (o = {}) => Array.from({ length: 6 }, (_, i) => ({ ok: false, decoded: false, stage: ['signature', 'sender', 'counter'][i % 3], ...o }));
const GOOD = {
  wire: { messages: 40, nonLight: 0 },
  hostile: { cases: hostile() },
  couplings: { honest: 900000, dishonest: 125000, next: 20, toHonest: 20 },
  immunity: { shared: 1, adopted: 1, recognisedAfter: true, autoimmuneBlocked: 1, adoptedAdmitted: 0 },
  ledger: { used: 12, records: 12, creditsEqual: true, replayed: true },
  memory: { identical: true, topIsTriageAnswer: true, vaultBytes: 900, plainBytes: 9000 },
  budget: { allowed: 5, sixthRefused: true, sixthPackets: 0 },
  seed: { same: true, count: 3 },
  processes: { ran: true, steps: 60, identical: true },
};
const held = (facts, id) => judge(sealed, facts).verdicts.find((v) => v.id === id).held;
const set = (k, patch) => ({ ...GOOD, [k]: { ...GOOD[k], ...patch } });

test('the sealed claims are the nine this judge has rules for', () => {
  assert.deepEqual(sealed.claims.map((c) => c.id), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']);
  assert.deepEqual(Object.keys(RULES), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']);
});

test('good facts hold every claim, and the counts add up', () => {
  const r = judge(sealed, GOOD);
  assert.equal(r.held, 9);
  assert.equal(r.failed, 0);
  assert.equal(r.unmeasured, 0);
  for (const v of r.verdicts) { assert.equal(v.held, true, v.id + ': ' + v.measured); assert.equal(v.predicted, 'HOLD'); assert.ok(v.claim.length > 20); }
  assert.match(r.verdicts[0].measured, /40 messages between the nodes; 0 not a LIGHT packet/);
  assert.match(r.verdicts[1].measured, /6 hostile packets: 6 refused, 0 decoded, 0 admitted \(signature, sender, counter, signature, sender, counter\)/);
  assert.match(r.verdicts[2].measured, /honest 900000, dishonest 125000 .* of the next 20 asks, 20 went to the honest peer/);
  assert.match(r.verdicts[3].measured, /1 antigens shared, 1 adopted .* recognised on sight; .* 1 blocked; .* admits: 0/);
  assert.match(r.verdicts[4].measured, /12 verified answers used, 12 value records written; credits identical .* re-derives both chains/);
  assert.match(r.verdicts[5].measured, /vault 900 B for 9000 B of memory, byte-identical .* is the triage answer/);
  assert.match(r.verdicts[6].measured, /5 asks inside a budget of 5; the sixth refused by the wallet, 0 packets/);
  assert.match(r.verdicts[7].measured, /3 patterns re-grown .* every id the same/);
  assert.match(r.verdicts[8].measured, /60 verdicts from separate processes: identical/);
});

test('each claim fails on exactly the fact that breaks it', () => {
  assert.equal(held(set('wire', { nonLight: 1 }), 'F1'), false);
  assert.equal(held(set('wire', { messages: 0 }), 'F1'), false);
  assert.equal(held(set('wire', { messages: 1 }), 'F1'), true);
  assert.equal(held(set('hostile', { cases: hostile().slice(0, 5) }), 'F2'), false, 'six cases, not five');
  assert.equal(held(set('hostile', { cases: [...hostile(), { ok: false, decoded: false }] }), 'F2'), false, 'nor seven');
  assert.equal(held(set('hostile', { cases: hostile({ decoded: true }) }), 'F2'), false);
  assert.equal(held(set('hostile', { cases: [...hostile().slice(0, 5), { ok: true, decoded: false }] }), 'F2'), false);
  assert.equal(held(set('hostile', { cases: [...hostile().slice(0, 5), { ok: 'no', decoded: false }] }), 'F2'), false, 'only a refusal counts as refused');
  assert.equal(held(set('couplings', { next: 19, toHonest: 19 }), 'F3'), false);
  assert.equal(held(set('couplings', { honest: 125000 }), 'F3'), false, 'equal links do not hold');
  assert.equal(held(set('couplings', { toHonest: 17 }), 'F3'), false);
  assert.equal(held(set('couplings', { toHonest: 18 }), 'F3'), true, 'eighteen of twenty is the bar');
  assert.equal(held(set('immunity', { adopted: 0 }), 'F4'), false);
  assert.equal(held(set('immunity', { recognisedAfter: false }), 'F4'), false);
  assert.equal(held(set('immunity', { autoimmuneBlocked: 0 }), 'F4'), false);
  assert.equal(held(set('immunity', { adoptedAdmitted: 1 }), 'F4'), false);
  assert.equal(held(set('ledger', { used: 0, records: 0 }), 'F5'), false);
  assert.equal(held(set('ledger', { records: 11 }), 'F5'), false);
  assert.equal(held(set('ledger', { creditsEqual: false }), 'F5'), false);
  assert.equal(held(set('ledger', { replayed: false }), 'F5'), false);
  assert.equal(held(set('memory', { identical: false }), 'F6'), false);
  assert.equal(held(set('memory', { topIsTriageAnswer: false }), 'F6'), false);
  assert.equal(held(set('budget', { allowed: 4 }), 'F7'), false);
  assert.equal(held(set('budget', { sixthRefused: false }), 'F7'), false);
  assert.equal(held(set('budget', { sixthPackets: 1 }), 'F7'), false);
  assert.equal(held(set('seed', { same: false }), 'F8'), false);
  assert.equal(held(set('seed', { count: 0 }), 'F8'), false);
  assert.equal(held(set('processes', { ran: false }), 'F9'), false);
  assert.equal(held(set('processes', { steps: 0 }), 'F9'), false);
  assert.equal(held(set('processes', { identical: false }), 'F9'), false);
  assert.match(judge(sealed, set('processes', { ran: false })).verdicts[8].measured, /did not run/);
  assert.match(judge(sealed, set('processes', { identical: false })).verdicts[8].measured, /DIFFERENT/);
  assert.match(judge(sealed, set('memory', { identical: false })).verdicts[5].measured, /NOT identical .* is the triage answer/);
  assert.match(judge(sealed, set('memory', { topIsTriageAnswer: false })).verdicts[5].measured, /is not the triage answer/);
  assert.match(judge(sealed, set('budget', { sixthRefused: false })).verdicts[6].measured, /NOT refused/);
  assert.match(judge(sealed, set('seed', { same: false })).verdicts[7].measured, /ids differ/);
  assert.match(judge(sealed, set('ledger', { creditsEqual: false, replayed: false })).verdicts[4].measured, /credits different .* replay failed/);
  assert.match(judge(sealed, set('immunity', { recognisedAfter: false })).verdicts[3].measured, /not recognised/);
});

test('missing facts are unmeasured, never held; junk never throws', () => {
  const r = judge(sealed, {});
  assert.equal(r.unmeasured, 9);
  assert.equal(r.held, 0);
  assert.ok(r.verdicts.every((v) => v.held === null && v.measured === 'not measured here'));
  const some = judge(sealed, { wire: GOOD.wire });
  assert.deepEqual([some.held, some.unmeasured], [1, 8]);
  assert.equal(judge(sealed, { wire: 'x' }).unmeasured, 9, 'a fact that is not a record is not measured');
  assert.equal(judge(sealed, { wire: null }).unmeasured, 9);
  assert.equal(judge(sealed, { wire: [] }).verdicts[0].held, false, 'an empty list is a record of nothing');
  assert.equal(judge(sealed, { ...GOOD, couplings: { honest: 1.5, dishonest: 0, next: 20, toHonest: 20 } }).verdicts[2].held, false, 'only whole numbers count');
  assert.deepEqual(judge(null, GOOD), { verdicts: [], held: 0, failed: 0, unmeasured: 0 });
  assert.equal(judge({ claims: [{ id: 'F99', claim: 'x' }] }, GOOD).unmeasured, 1, 'a claim with no rule is unmeasured');
  assert.equal(judge({ claims: [{ id: 'toString' }] }, GOOD).unmeasured, 1, 'no inherited rules');
  assert.equal(judge({ claims: [null] }, GOOD).verdicts[0].id, 'undefined');
  const r2 = judge({ claims: [{ id: 'F1' }] }, GOOD);
  assert.deepEqual([r2.verdicts[0].claim, r2.verdicts[0].predicted], ['', '']);
  assert.doesNotThrow(() => judge(sealed, { hostile: { cases: [null, 5, 'x'] } }));
  assert.equal(judge(sealed, { hostile: { cases: 'x' } }).verdicts[1].held, false);
  assert.equal(judge(sealed, 7).unmeasured, 9);
});
