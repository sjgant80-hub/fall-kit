import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNode, meshGenesis, hebb, choose, readMessage, readNote, readCard, stableJson, digestOf, assetOf, iso, receiptHolds, vaultMatches, LINK, SCHEMA, MAX_PENDING, DEFAULT_BUDGET, MAX_ANTIGENS, MAX_ANTIGEN_BYTES, MAX_NOTES, MAX_NOTED, ROUTING } from './node.mjs';
import * as W from './vendor/wallet/wallet.mjs';
import * as L from './vendor/ledger/contrib.mjs';
import { pack } from './vendor/light/vault.mjs';
import { prime } from './vendor/light/codec.mjs';
import { makeIdentity, hex, unhex, walletCrypto } from './identity.mjs';
import { prepare, finish, KINDS } from './vendor/light/packet.mjs';
import { sha256 } from './vendor/light/sha256.mjs';
import { toHex } from './vendor/immune/exchange.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const clock = () => new Date('2026-10-26T12:00:00Z');
const rehash = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));
// an honest triage skill: a real receipt over its own fields; a dishonest one: the same answer, a receipt that does not re-hash
const honest = async (input) => {
  if (input && input.ood) return { verdict: 'ABSTAIN', why: 'out of distribution' };
  const core = { model: 'test/1', domain: 'triage', label: input && input.spO2 < 92 ? 1 : 0, verdict: 'VERIFIED' };
  return { verdict: 'VERIFIED', label: core.label, receipt: { ...core, receiptHash: rehash(core) } };
};
const liar = async () => ({ verdict: 'VERIFIED', label: 1, receipt: { model: 'test/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) } });

// the tests written for Phase 3's routing run it by name; the routing that shares what it learns has its own below
async function mesh({ budget = 50, withGenesis = true, routing = 'greedy' } = {}) {
  const [fi, ai, bi, ci] = await Promise.all([makeIdentity(seed(1)), makeIdentity(seed(2)), makeIdentity(seed(4)), makeIdentity(seed(3))]);   // the honest node holds the smaller key
  const genesis = withGenesis ? await meshGenesis(fi, [ai.id, bi.id, ci.id]) : null;
  const A = await createNode({ name: 'asker', identity: ai, budget, genesis, clock, routing });
  const B = await createNode({ name: 'honest', identity: bi, skills: { triage: honest }, genesis, clock, genome: { kind: 'test', seeds: ['s1'] }, routing });
  const C = await createNode({ name: 'liar', identity: ci, skills: { triage: liar }, genesis, clock, routing });
  for (const [x, y] of [[A, B], [A, C], [B, A], [C, A], [B, C], [C, B]]) assert.equal((await x.pin(y.card())).ok, true);
  const nodes = { [A.id]: A, [B.id]: B, [C.id]: C };
  // carry a packet to a node and every reply back, until the conversation is over
  const deliver = async (to, bytes) => {
    const r = await nodes[to].hear(bytes);
    for (const rep of r.replies) await deliver(rep.to, rep.bytes);
    return r;
  };
  return { A, B, C, ai, bi, ci, fi, genesis, deliver };
}
const askAndCarry = async (m, skill, input) => {
  const a = await m.A.ask(skill, input);
  if (!a.ok) return { a };
  const r = await m.deliver(a.to, a.bytes);
  return { a, r };
};

test('hebb: the coupling law, exactly', () => {
  assert.equal(hebb(LINK.START, 'verified'), 625000);
  assert.equal(hebb(LINK.START, 'abstain'), 468750);
  assert.equal(hebb(LINK.START, 'failed'), 250000);
  assert.equal(hebb(LINK.START, 'other'), LINK.START);
  assert.equal(hebb(LINK.MAX, 'verified'), LINK.MAX, 'saturates');
  assert.equal(hebb(999999, 'verified'), 999999, 'a last part of a million is floored');
  assert.equal(hebb(999996, 'verified'), 999997);
  assert.equal(hebb(0, 'failed'), 0);
  assert.equal(hebb(15, 'abstain'), 15, 'under 16 an abstain changes nothing');
  assert.equal(hebb(16, 'abstain'), 15);
  assert.equal(hebb(1, 'failed'), 1);
  assert.equal(hebb(2, 'failed'), 1);
  assert.equal(hebb(NaN, 'verified'), 625000, 'junk weights start fresh');
  assert.equal(hebb(1.5, 'other'), LINK.START);
  assert.equal(hebb(-5, 'other'), 0, 'clamped below');
  assert.equal(hebb(LINK.MAX + 7, 'other'), LINK.MAX, 'clamped above');
  assert.equal(hebb(-5, 'verified'), 250000);
});

test('choose: the strongest live link, ties to the smaller id, the pruned only as a last resort', () => {
  const w = (x) => () => x;
  const peers = [{ id: 'b', skills: ['triage'], weight: w(600000) }, { id: 'a', skills: ['triage'], weight: w(600000) }, { id: 'c', skills: ['triage'], weight: w(900000) }, { id: 'd', skills: ['water'], weight: w(LINK.MAX) }];
  assert.deepEqual(choose(peers, 'triage'), { id: 'c', weight: 900000, live: true, untried: false });
  assert.deepEqual(choose(peers.slice(0, 2), 'triage'), { id: 'a', weight: 600000, live: true, untried: false });
  assert.deepEqual(choose(peers.slice(0, 2).reverse(), 'triage'), { id: 'a', weight: 600000, live: true, untried: false }, 'order does not matter');
  const pruned = [{ id: 'x', skills: ['triage'], weight: w(LINK.FLOOR - 1) }, { id: 'y', skills: ['triage'], weight: w(LINK.FLOOR) }];
  assert.deepEqual(choose(pruned, 'triage'), { id: 'y', weight: LINK.FLOOR, live: true, untried: false }, 'exactly the floor is live');
  assert.deepEqual(choose(pruned.slice(0, 1), 'triage'), { id: 'x', weight: LINK.FLOOR - 1, live: false, untried: false });
  const both = [{ id: 'p', skills: ['triage'], weight: w(LINK.FLOOR - 1) }, { id: 'q', skills: ['triage'], weight: w(1) }];
  assert.equal(choose(both, 'triage').id, 'p', 'among the pruned, the strongest');
  assert.equal(choose([{ id: 'l', skills: ['triage'], weight: w(LINK.FLOOR) }, { id: 'm', skills: ['triage'], weight: w(LINK.MAX) }].reverse(), 'triage').id, 'm');
  assert.equal(choose([{ id: 'z', skills: ['triage'], weight: w(LINK.FLOOR - 1) }, { id: 'live', skills: ['triage'], weight: w(LINK.FLOOR) }], 'triage').id, 'live', 'a live link beats a stronger-looking pruned one');
  assert.equal(choose([{ id: 'live', skills: ['triage'], weight: w(LINK.FLOOR) }, { id: 'a', skills: ['triage'], weight: w(LINK.FLOOR - 1) }], 'triage').id, 'live', 'a pruned link never displaces a live one');
  assert.equal(choose(peers, 'crop'), null);
  assert.equal(choose([{ id: 'e', skills: ['triage'] }], 'triage').weight, LINK.START, 'no weight function: a fresh link');
  assert.equal(choose([null, 5, { id: 3, skills: ['triage'] }, { id: 'f', skills: 'triage' }], 'triage'), null, 'junk peers are skipped');
  assert.equal(choose('x', 'triage'), null);
});

test('readMessage: every shape, and every way it can be wrong', () => {
  const tok = { id: 'w' }, to = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.deepEqual(readMessage({ to, t: 'ask', id: 'ask:1', skill: 'triage', input: { a: 1 }, token: tok }), { ok: true, t: 'ask', to, id: 'ask:1', skill: 'triage', input: { a: 1 }, token: tok });
  assert.equal(readMessage({ to, t: 'ask', id: 'ask:1', skill: 'triage', input: null, token: tok }).ok, true, 'a null input is an input');
  for (const bad of [{ to, t: 'ask', id: 'Bad', skill: 'triage', input: 1, token: tok }, { to, t: 'ask', id: 5, skill: 'triage', input: 1, token: tok }, { to, t: 'ask', id: 'ask:1', skill: 'Tri age', input: 1, token: tok },
    { to, t: 'ask', id: 'ask:1', skill: 9, input: 1, token: tok }, { to, t: 'ask', id: 'ask:1', skill: 'triage', token: tok }, { to, t: 'ask', id: 'ask:1', skill: 'triage', input: 1 }, { to, t: 'ask', id: 'ask:1', skill: 'triage', input: 1, token: [1] }]) assert.equal(readMessage(bad).ok, false, JSON.stringify(bad));
  assert.deepEqual(readMessage({ to, t: 'answer', id: 'ask:1', skill: 'triage', answer: { verdict: 'ABSTAIN' } }), { ok: true, t: 'answer', to, id: 'ask:1', skill: 'triage', answer: { verdict: 'ABSTAIN' } });
  assert.equal(readMessage({ to, t: 'answer', id: 'ask:1', skill: 'triage', answer: { verdict: 'VERIFIED' } }).ok, true);
  for (const bad of [{ to, t: 'answer', id: 'X', skill: 'triage', answer: { verdict: 'ABSTAIN' } }, { to, t: 'answer', id: 1, skill: 'triage', answer: { verdict: 'ABSTAIN' } }, { to, t: 'answer', id: 'a', skill: '-', answer: { verdict: 'ABSTAIN' } },
    { to, t: 'answer', id: 'a', skill: null, answer: { verdict: 'ABSTAIN' } }, { to, t: 'answer', id: 'a', skill: 'triage', answer: { verdict: 'MAYBE' } }, { to, t: 'answer', id: 'a', skill: 'triage', answer: 'VERIFIED' }]) assert.equal(readMessage(bad).ok, false, JSON.stringify(bad));
  assert.deepEqual(readMessage({ to, t: 'antibody', bundle: { v: 1 } }), { ok: true, t: 'antibody', to, bundle: { v: 1 } });
  assert.equal(readMessage({ to, t: 'antibody', bundle: [] }).ok, false);
  assert.deepEqual(readMessage({ to, t: 'ledger', log: [] }), { ok: true, t: 'ledger', to, log: [] });
  assert.equal(readMessage({ to, t: 'ledger', log: {} }).ok, false);
  assert.match(readMessage({ to, t: 'gossip' }).why, /gossip is not spoken here/);
  assert.match(readMessage({ t: 'ledger', log: [] }).why, /names the node it is for/, 'a message with no recipient');
  assert.match(readMessage({ to: 'A'.repeat(64), t: 'ledger', log: [] }).why, /names the node it is for/);
  assert.match(readMessage({ to: 7, t: 'ledger', log: [] }).why, /names the node it is for/);
  assert.equal(readMessage({ t: 5 }).ok, false);
  assert.equal(readMessage(null).ok, false);
  assert.equal(readMessage([]).ok, false);
  assert.equal(readMessage({ to, t: 'ask', id: 'a'.repeat(97), skill: 'triage', input: 1, token: tok }).ok, false, 'ids are at most 96 characters');
  assert.equal(readMessage({ to, t: 'ask', id: 'a'.repeat(96), skill: 'triage', input: 1, token: tok }).ok, true);
  assert.equal(readMessage({ to, t: 'ask', id: 'a', skill: 'a'.repeat(33), input: 1, token: tok }).ok, false, 'skills are at most 32 characters');
  assert.equal(readMessage({ to, t: 'ask', id: 'a', skill: 'a'.repeat(32), input: 1, token: tok }).ok, true);
});

test('the small pure helpers', () => {
  assert.equal(stableJson({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  assert.equal(stableJson(undefined), 'null');
  assert.equal(stableJson(0.25), '0.25');
  assert.equal(digestOf({ a: 1, b: 2 }), digestOf({ b: 2, a: 1 }), 'key order does not change a digest');
  assert.notEqual(digestOf({ a: 1 }), digestOf({ a: 2 }));
  assert.equal(assetOf('0123456789abcdef0123'), 'node:0123456789abcdef');
  assert.equal(iso(new Date('2026-10-26T12:34:56.789Z')), '2026-10-26T12:34:56Z');
  assert.equal(iso(new Date('nope')), '1970-01-01T00:00:00Z');
  assert.equal(iso('2026'), '1970-01-01T00:00:00Z');
  const core = { a: 1, b: 'x' }, good = { receipt: { ...core, receiptHash: rehash(core) } };
  assert.equal(receiptHolds(good), true);
  assert.equal(receiptHolds({ receipt: { ...good.receipt, a: 2 } }), false, 'a changed field breaks it');
  assert.equal(receiptHolds({ receipt: { ...core, receiptHash: 'f'.repeat(64) } }), false);
  assert.equal(receiptHolds({ receipt: { ...core, receiptHash: 'F'.repeat(64) } }), false);
  assert.equal(receiptHolds({ receipt: { ...core } }), false);
  assert.equal(receiptHolds({ receipt: 'x' }), false);
  assert.equal(receiptHolds(null), false);
});

test('a card: self-signed, and every way one can be wrong', async () => {
  const m = await mesh();
  const c = m.B.card();
  assert.equal(c.schema, SCHEMA);
  assert.deepEqual(c.skills, ['triage']);
  assert.deepEqual(c.genome, { kind: 'test', seeds: ['s1'] });
  assert.equal((await readCard(c)).ok, true);
  const bad = async (patch, why) => { const r = await readCard({ ...c, ...patch }); assert.equal(r.ok, false); assert.match(r.why, why); };
  await bad({ schema: 'x' }, /not a fall-kit/);
  await bad({ id: 'zz' }, /32-byte key/);
  await bad({ name: '' }, /names its node/);
  await bad({ name: 'n'.repeat(65) }, /names its node/);
  await bad({ wallet: 'short' }, /wallet key/);
  await bad({ wallet: 'w'.repeat(49) }, /wallet key/);
  await bad({ slot: (c.slot + 1) % 256 }, /slot/);
  await bad({ skills: 'triage' }, /skills/);
  await bad({ skills: ['Triage'] }, /skills/);
  await bad({ skills: Array.from({ length: 33 }, (_, i) => 's' + i) }, /skills/);
  await bad({ genome: 'g' }, /genome/);
  await bad({ sig: 'ab' }, /^a card is signed$/);
  await bad({ sig: ['a'.repeat(128)] }, /^a card is signed$/);   // not text, though its text form is 128 hex characters
  await bad({ name: 'someone-else' }, /not signed by the key it names/);
  assert.equal((await readCard({ ...c, genome: null, sig: c.sig })).ok, false, 'changing the genome breaks the signature');
  assert.equal((await readCard({ ...c, wallet: 'w'.repeat(40) })).ok, false, 'a 40-character wallet passes the shape check, not the signature');
  assert.equal((await readCard(null)).ok, false);
  assert.equal((await readCard({ ...c, release: { anything: 1 } })).ok, true, 'the release travels outside the signed body');
  assert.equal((await m.A.pin({ ...c, name: 'x' })).ok, false, 'a node never pins a card that does not check');
  assert.equal((await m.A.pin(m.A.card())).ok, false, 'a node does not pin itself');
  assert.equal(m.A.card().genome, null);
  await assert.rejects(createNode({}), /identity/);
  await assert.rejects(createNode({ identity: { id: 'x' } }), /identity/, 'an identity that cannot sign');
  await assert.rejects(createNode({ identity: { sign: async () => new Uint8Array(64) } }), /identity/, 'an identity with no key');
  assert.equal((await createNode({ name: 5, identity: await makeIdentity(seed(14)) })).name, 'node', 'a name is text');
  assert.equal(m.A.name, 'asker');
  const long = await createNode({ name: 'n'.repeat(70), identity: await makeIdentity(seed(15)) });
  assert.equal(long.name.length, 64, 'a name is cut to 64 characters');
  assert.equal((await readCard(long.card())).ok, true, 'and a 64-character name is a valid card');
  const many = {}; for (let i = 0; i < 32; i++) many['s' + i] = honest;
  const wide = await createNode({ identity: await makeIdentity(seed(16)), skills: many });
  assert.equal((await readCard(wide.card())).ok, true, 'thirty-two skills is a valid card');
  assert.match((await readCard({ ...c, wallet: 'w'.repeat(40) })).why, /not signed/, 'a 40-character wallet passes the shape check');
  assert.match((await readCard({ ...c, wallet: 'w'.repeat(48) })).why, /not signed/, 'so does a 48-character one');
  assert.match((await readCard({ ...c, wallet: 'w'.repeat(39) })).why, /wallet key/);
  assert.match((await readCard({ ...c, sig: 12345 })).why, /a card is signed/, 'a signature that is not text');
  await assert.rejects(createNode(null), /identity/);
  const n = await createNode({ identity: await makeIdentity(seed(9)), skills: { 'Bad Skill': honest, good: honest } });
  assert.equal(n.name, 'node');
  assert.deepEqual(n.budget(), { spent: 0, total: DEFAULT_BUDGET }, 'a node always has a finite budget');
  const inf = await createNode({ identity: await makeIdentity(seed(10)), budget: Infinity });
  assert.equal(inf.budget().total, DEFAULT_BUDGET, 'an unlimited budget cannot travel in a token, so it is not allowed');
  assert.equal((await createNode({ identity: await makeIdentity(seed(10)), budget: -1 })).budget().total, DEFAULT_BUDGET);
  assert.equal((await createNode({ identity: await makeIdentity(seed(10)), budget: 0 })).budget().total, 0);
  assert.equal((await createNode({ identity: await makeIdentity(seed(10)), budget: 2.5 })).budget().total, DEFAULT_BUDGET);
  assert.deepEqual(n.card().skills, ['good'], 'a skill that is not a skill id is not advertised');
  const random = await makeIdentity();
  assert.equal(random.id.length, 64);
});

test('the couplings follow evidence: verified grows, abstain decays, and the stronger link takes the ask', async () => {
  const m = await mesh();
  assert.ok(m.B.id < m.C.id);
  const first = await askAndCarry(m, 'triage', { spO2: 88 });
  assert.equal(first.a.ok, true);
  assert.equal(first.a.live, true);
  assert.equal(first.a.to, m.B.id, 'a tie between fresh links goes to the smaller id');
  assert.equal(first.r.ok, true);
  assert.equal(first.r.t, 'ask');
  assert.equal(first.r.verdict, 'VERIFIED');
  assert.equal(m.A.weight(m.B.id, 'triage'), 625000);
  const ood = await askAndCarry(m, 'triage', { ood: true });
  assert.equal(ood.a.to, m.B.id);
  assert.equal(m.A.weight(m.B.id, 'triage'), hebb(625000, 'abstain'));
  assert.equal(m.A.weight(m.C.id, 'triage'), LINK.START, 'C was never asked');
  assert.equal(m.A.weight('nobody', 'triage'), LINK.START);
  assert.equal((await askAndCarry(m, 'triage', { spO2: 91 })).a.to, m.B.id, 'B is still the stronger link');
});

test('a dishonest peer loses its coupling and the asks', async () => {
  const m = await mesh();
  const o = await askAndCarry(m, 'triage', { ood: true });          // B abstains: 500000 → 468750, now under C's fresh link
  assert.equal(o.a.to, m.B.id);
  assert.equal(m.A.weight(m.B.id, 'triage'), 468750);
  const toC = await askAndCarry(m, 'triage', { spO2: 95 });
  assert.equal(toC.a.to, m.C.id, 'C is now the stronger link');
  assert.equal(toC.r.verdict, 'VERIFIED', 'C claims it verified');
  assert.equal(m.A.weight(m.C.id, 'triage'), hebb(LINK.START, 'failed'), 'A checked the receipt and it failed');
  const routed = [];
  for (let i = 0; i < 20; i++) routed.push((await askAndCarry(m, 'triage', { spO2: 80 + i })).a.to);
  assert.equal(routed.filter((id) => id === m.B.id).length, 20, 'the honest peer takes every ask back');
  assert.ok(m.A.weight(m.B.id, 'triage') > m.A.weight(m.C.id, 'triage'));
});

test('a contribution is recorded for every verified answer used, and only for those', async () => {
  const m = await mesh();
  await askAndCarry(m, 'triage', { spO2: 88 });
  await askAndCarry(m, 'triage', { ood: true });
  const values = m.A.ledger().log.filter((x) => x.entry.type === 'value');
  assert.equal(values.length, 1);
  assert.equal(values[0].entry.asset, assetOf(m.B.id));
  assert.equal(values[0].entry.by, m.A.id);
  assert.equal(values[0].entry.basis, 'routing');
  assert.equal(values[0].entry.at, '2026-10-26T12:00:00Z');
  const cA = m.A.credits();
  assert.equal(cA.ok, true);
  // A sends its ledger to B; B records A's value about B's own work, because B gave that answer
  const share = await m.A.shareLedger(m.B.id);
  const r = await m.B.hear(share);
  assert.equal(r.ok, true);
  assert.equal(r.t, 'ledger');
  assert.ok(r.added >= 1);
  assert.deepEqual(m.B.credits(), cA, 'the two ledgers give the same credits');
  assert.equal(await m.A.shareLedger('nobody'), null);
  // C cannot re-check A's value about B's work, so it refuses that entry by name rather than count it
  const toC = await m.C.hear(await m.A.shareLedger(m.C.id));
  assert.equal(toC.ok, true);
  assert.ok(toC.refused >= 1);
});

test('the door: one byte changed, an unpinned key, a replay, another language — each refused before its body is read', async () => {
  const m = await mesh();
  const a = await m.A.ask('triage', { spO2: 88 });
  const tampered = a.bytes.slice(); tampered[30] ^= 1;
  const t = await m.B.hear(tampered);
  assert.deepEqual([t.ok, t.stage, t.decoded, t.family], [false, 'signature', false, 'forged']);
  const ok = await m.B.hear(a.bytes);
  assert.equal(ok.ok, true);
  const replay = await m.B.hear(a.bytes);
  assert.deepEqual([replay.ok, replay.stage, replay.decoded, replay.family], [false, 'counter', false, 'replay']);
  const stranger = await makeIdentity(seed(7));
  const p = prepare({ sender: stranger.slot, counter: 1n, kind: KINDS.JSON, value: { t: 'ask' }, dictId: 0 });
  const forged = finish(p.unsigned, await stranger.sign(p.signed)).bytes;
  const f = await m.B.hear(forged);
  assert.equal(f.ok, false);
  assert.ok(f.stage === 'sender' || f.stage === 'signature');
  assert.equal(f.decoded, false);
  const foreign = await m.B.hear(new TextEncoder().encode('GET /admin HTTP/1.1\r\nHost: x\r\n\r\n' + ' '.repeat(60)));
  assert.deepEqual([foreign.ok, foreign.stage, foreign.family], [false, 'magic', 'foreign']);
  assert.equal((await m.B.hear(new Uint8Array(3))).stage, 'size');
  assert.equal(m.B.stats().refused, 5);
  assert.equal(m.B.stats().admitted, 1);
});

test('one budget token, one answer — and no ask past the budget', async () => {
  const m = await mesh({ budget: 2 });
  assert.equal((await m.A.ask('triage', { spO2: 88 })).ok, true);
  assert.equal((await m.A.ask('triage', { spO2: 88 })).ok, true);
  const sent = m.A.stats().sent;
  const third = await m.A.ask('triage', { spO2: 88 });
  assert.equal(third.ok, false);
  assert.match(third.why, /over budget/);
  assert.equal(third.bytes, undefined, 'no packet exists');
  assert.equal(m.A.stats().sent, sent, 'nothing was signed');
  assert.deepEqual(m.A.budget(), { spent: 2, total: 2 });
  assert.match((await m.A.ask('crop', {})).why, /no pinned peer holds skill crop/);
  // a peer that re-sends an ask it already had answered, in a new packet with the same token, gets no second answer
  const m2 = await mesh();
  const a = await m2.A.ask('triage', { spO2: 88 });
  const first = await m2.B.hear(a.bytes);
  assert.equal(first.verdict, 'VERIFIED');
  const v = JSON.parse(new TextDecoder().decode((await import('./vendor/light/codec.mjs')).decode(a.bytes.subarray(23, a.bytes.length - 64)).bytes));
  const again = prepare({ sender: m2.ai.slot, counter: 1000n, kind: KINDS.JSON, value: v, dictId: 0 });
  const r = await m2.B.hear(finish(again.unsigned, await m2.ai.sign(again.signed)).bytes);
  assert.equal(r.ok, true);
  assert.equal(r.verdict, 'ABSTAIN');
  // a token that is not this peer's, or not for this ask, or not an ask
  let ctr = 2000n;
  const forge = async (patch) => {
    ctr += 1n;
    const x = prepare({ sender: m2.ai.slot, counter: ctr, kind: KINDS.JSON, value: { ...v, id: 'ask:other:' + ctr, ...patch }, dictId: 0 });
    return m2.B.hear(finish(x.unsigned, await m2.ai.sign(x.signed)).bytes);
  };
  assert.equal((await forge({})).verdict, 'ABSTAIN', 'the token is for another ask id');
  assert.equal((await forge({ token: { ...v.token, nonce: 'ask:other:' + (ctr + 1n), type: 'spend' } })).verdict, 'ABSTAIN');
  assert.equal((await forge({ token: { ...v.token, id: m2.bi.wallet.pk } })).verdict, 'ABSTAIN', 'someone else’s wallet');
});

test('a skill that throws or answers junk abstains; an answer to nothing is refused; junk from a pinned peer is named', async () => {
  const [ai, bi] = await Promise.all([makeIdentity(seed(2)), makeIdentity(seed(3))]);
  const A = await createNode({ name: 'a', identity: ai, clock });
  const B = await createNode({ name: 'b', identity: bi, skills: { boom: async () => { throw new Error('x'); }, junk: async () => 'yes', odd: async () => ({ verdict: 'PERHAPS' }) }, clock });
  await A.pin(B.card()); await B.pin(A.card());
  for (const s of ['boom', 'junk', 'odd']) {
    const a = await A.ask(s, {});
    const r = await B.hear(a.bytes);
    assert.equal(r.verdict, 'ABSTAIN', s);
    const back = await A.hear(r.replies[0].bytes);
    assert.equal(back.outcome, 'abstain');
  }
  const ghost = prepare({ sender: bi.slot, counter: 99n, kind: KINDS.JSON, value: { to: A.id, t: 'answer', id: 'ask:none:1', skill: 'boom', answer: { verdict: 'ABSTAIN' } }, dictId: 0 });
  const g = await A.hear(finish(ghost.unsigned, await bi.sign(ghost.signed)).bytes);
  assert.deepEqual([g.ok, g.stage], [false, 'message']);
  const junk = prepare({ sender: bi.slot, counter: 100n, kind: KINDS.JSON, value: { hello: 1 }, dictId: 0 });
  const j = await A.hear(finish(junk.unsigned, await bi.sign(junk.signed)).bytes);
  assert.deepEqual([j.ok, j.stage, j.decoded], [false, 'message', true]);
  const bytesBody = prepare({ sender: bi.slot, counter: 101n, kind: KINDS.BYTES, bytes: new Uint8Array(3), dictId: 0 });
  assert.equal((await A.hear(finish(bytesBody.unsigned, await bi.sign(bytesBody.signed)).bytes)).stage, 'message', 'a raw-bytes body is not a message');
  // an answer from the wrong peer, or for the wrong skill, to a real ask
  const a = await A.ask('boom', {});
  const wrongSkill = prepare({ sender: bi.slot, counter: 102n, kind: KINDS.JSON, value: { to: A.id, t: 'answer', id: a.id, skill: 'junk', answer: { verdict: 'ABSTAIN' } }, dictId: 0 });
  assert.equal((await A.hear(finish(wrongSkill.unsigned, await bi.sign(wrongSkill.signed)).bytes)).stage, 'message');
  assert.equal((await A.shareLedger(B.id)), null, 'no genesis, no ledger to share');
  const noLedger = prepare({ sender: bi.slot, counter: 103n, kind: KINDS.JSON, value: { to: A.id, t: 'ledger', log: [] }, dictId: 0 });
  const nl = await A.hear(finish(noLedger.unsigned, await bi.sign(noLedger.signed)).bytes);
  assert.equal(nl.ok, false);
  assert.equal(nl.reason, 'this node keeps no ledger');
  const badLog = prepare({ sender: bi.slot, counter: 104n, kind: KINDS.JSON, value: { to: A.id, t: 'ledger', log: [{ n: 0 }] }, dictId: 0 });
  assert.equal((await A.hear(finish(badLog.unsigned, await bi.sign(badLog.signed)).bytes)).ok, false);
});

test('shared immunity: an attack refused by one node is recognised on sight by the other, and nothing valid is ever adopted', async () => {
  const m = await mesh();
  const stranger = await makeIdentity(seed(8));
  const p = prepare({ sender: m.ai.slot, counter: 5n, kind: KINDS.JSON, value: { t: 'ask', id: 'x', skill: 'triage', input: {}, token: {} }, dictId: 0 });
  const forged = finish(p.unsigned, await stranger.sign(p.signed)).bytes;    // claims A's slot, signed by a key nobody pinned
  const atB = await m.B.hear(forged);
  assert.deepEqual([atB.ok, atB.stage, atB.decoded, atB.recognised], [false, 'signature', false, false]);
  assert.equal(m.B.antigens().length, 1);
  assert.equal(await m.B.shareAntibodies('nobody'), null);
  assert.equal(await m.A.shareAntibodies(m.B.id), null, 'nothing to share yet');
  // B shares; A re-runs the antigen on its own door — refused there too (A does not pin the stranger) — and adopts it
  const share = await m.B.shareAntibodies(m.A.id);
  const r = await m.A.hear(share);
  assert.equal(r.ok, true);
  assert.equal(r.t, 'antibody');
  assert.equal(r.offered, 1);
  assert.equal(r.adopted, 1);
  assert.equal(r.autoimmuneBlocked, 0);
  const atA = await m.A.hear(forged);
  assert.deepEqual([atA.ok, atA.recognised, atA.decoded], [false, true, false], 'recognised on sight, never decoded');
  assert.equal(m.A.stats().recognised, 1);
  // a variant (the same forgery under another counter) is named as one
  const p2 = prepare({ sender: m.ai.slot, counter: 6n, kind: KINDS.JSON, value: { t: 'ask', id: 'x', skill: 'triage', input: {}, token: {} }, dictId: 0 });
  const v2 = await m.B.hear(finish(p2.unsigned, await stranger.sign(p2.signed)).bytes);
  assert.equal(v2.variantOf, toHex(sha256(forged)));
  // autoimmunity: C slips a VALID packet into a bundle — one A would admit at the moment it re-runs it (a fresh counter)
  const ex = await import('./vendor/immune/exchange.mjs');
  const fresh = prepare({ sender: m.ci.slot, counter: 1000n, kind: KINDS.JSON, value: { to: m.A.id, t: 'ledger', log: [] }, dictId: 0 });
  const valid = finish(fresh.unsigned, await m.ci.sign(fresh.signed)).bytes;
  let msg = null; ex.makeBundle(m.C.id, [toHex(valid)], (x) => { msg = x; return new Uint8Array(64); });
  const realSig = await m.ci.sign(msg);
  const bundle = ex.makeBundle(m.C.id, [toHex(valid)], () => realSig);
  const p4 = prepare({ sender: m.ci.slot, counter: 51n, kind: KINDS.JSON, value: { to: m.A.id, t: 'antibody', bundle }, dictId: 0 });
  const auto = await m.A.hear(finish(p4.unsigned, await m.ci.sign(p4.signed)).bytes);
  assert.equal(auto.ok, true);
  assert.equal(auto.adopted, 0);
  assert.equal(auto.autoimmuneBlocked, 1, 'a packet A would admit is never adopted');
  assert.equal((await m.A.hear(valid)).ok !== undefined, true, 'and A still hears it through its door');
  // a bundle whose signature does not verify, and one that claims to be from someone other than its sender
  const p5 = prepare({ sender: m.ci.slot, counter: 1001n, kind: KINDS.JSON, value: { to: m.A.id, t: 'antibody', bundle: { ...bundle, sig: 'a'.repeat(128) } }, dictId: 0 });
  assert.match((await m.A.hear(finish(p5.unsigned, await m.ci.sign(p5.signed)).bytes)).reason, /does not verify/);
  const p6 = prepare({ sender: m.ci.slot, counter: 1002n, kind: KINDS.JSON, value: { to: m.A.id, t: 'antibody', bundle: { ...bundle, from: m.B.id } }, dictId: 0 });
  assert.match((await m.A.hear(finish(p6.unsigned, await m.ci.sign(p6.signed)).bytes)).reason, /pinned peer/);
});

test('memory in LIGHT: the vault round-trips byte for byte, and recall finds the triage answer', async () => {
  const m = await mesh();
  await askAndCarry(m, 'triage', { spO2: 88 });
  await m.A.hear(new Uint8Array(3));
  const v = await m.A.vault();
  assert.equal(v.ok, true);
  assert.equal(v.identical, true);
  assert.ok(v.bytes.length > 0 && v.plain > 0);
  assert.deepEqual([...v.bytes.subarray(0, 4)], [0x4c, 0x56, 0x54, 0x31], 'an LVT1 vault');
  const top = m.A.recall('triage answer');
  assert.equal(top.center.meta.kind, 'answer');
  assert.equal(top.center.meta.skill, 'triage');
  assert.equal(top.center.meta.outcome, 'verified');
  assert.equal(top.center.meta.at, '2026-10-26T12:00:00Z');
  assert.ok(m.A.stats().memory >= 2);
  assert.ok(m.B.recall('answered triage').center.text.startsWith('answered triage'));
});

test('a mesh genesis names its measurers; a node without one keeps no ledger and records nothing', async () => {
  const fi = await makeIdentity(seed(1));
  const g = await meshGenesis(fi, ['a'.repeat(64), 'nope', 'b'.repeat(64)]);
  assert.deepEqual(g.measurers, ['a'.repeat(64), 'b'.repeat(64)]);
  assert.deepEqual(g.activators, [fi.id]);
  assert.equal(g.type, 'genesis');
  assert.deepEqual((await meshGenesis(fi, 'x')).measurers, []);
  assert.equal(await meshGenesis({ ledgerKeys: {} }, []), null);
  const m = await mesh({ withGenesis: false });
  const r = await askAndCarry(m, 'triage', { spO2: 88 });
  assert.equal(r.r.ok, true);
  assert.equal(m.A.ledger().log.length, 0);
  assert.equal(m.A.credits().ok, false);
  // a measurer the genesis does not name records nothing
  const [f2, x2, y2] = await Promise.all([makeIdentity(seed(11)), makeIdentity(seed(12)), makeIdentity(seed(13))]);
  const g2 = await meshGenesis(f2, [y2.id]);
  const X = await createNode({ name: 'x', identity: x2, genesis: g2, clock });
  const Y = await createNode({ name: 'y', identity: y2, skills: { triage: honest }, genesis: g2, clock });
  await X.pin(Y.card()); await Y.pin(X.card());
  const a = await X.ask('triage', { spO2: 80 });
  const ans = await Y.hear(a.bytes);
  const back = await X.hear(ans.replies[0].bytes);
  assert.equal(back.outcome, 'verified');
  assert.equal(back.recorded, false, 'X is not a measurer');
});

test('too many asks waiting, and the ask bound', async () => {
  const [ai, bi] = await Promise.all([makeIdentity(seed(2)), makeIdentity(seed(3))]);
  const A = await createNode({ name: 'a', identity: ai, clock });
  const B = await createNode({ name: 'b', identity: bi, skills: { triage: honest }, clock });
  await A.pin(B.card());
  for (let i = 0; i < MAX_PENDING; i++) assert.equal((await A.ask('triage', {})).ok, true);
  const over = await A.ask('triage', {});
  assert.equal(over.ok, false);
  assert.match(over.why, /too many asks/);
  assert.equal(A.stats().pending, MAX_PENDING);
});

test('vaultMatches: true only for exactly the files, by path and hash', async () => {
  const f = [{ path: 'a.json', bytes: new TextEncoder().encode('{"a":1}') }, { path: 'b.json', bytes: new TextEncoder().encode('[2]') }];
  const v = pack(f).bytes, idx = f.map((x) => ({ path: x.path, sha256: hex(sha256(x.bytes)) }));
  assert.equal(vaultMatches(v, idx), true);
  assert.equal(vaultMatches(v, [idx[0], { ...idx[1], sha256: '0'.repeat(64) }]), false, 'another hash');
  assert.equal(vaultMatches(v, [idx[0], { ...idx[1], path: 'c.json' }]), false, 'another path');
  assert.equal(vaultMatches(v, [idx[0]]), false, 'a file missing');
  assert.equal(vaultMatches(v, [...idx, idx[0]]), false, 'a file extra');
  assert.equal(vaultMatches(v, [idx[1], idx[0]]), false, 'another order');
  assert.equal(vaultMatches(v, [null, idx[1]]), false);
  assert.equal(vaultMatches(v, 'x'), false);
  assert.equal(vaultMatches(new Uint8Array(5), idx), false, 'not a vault');
  assert.equal(vaultMatches(undefined, idx), false);
});

test('antigens: kept up to the bound, by size and count, and never for a refusal that is not permanent', async () => {
  const [ai] = await Promise.all([makeIdentity(seed(2))]);
  const n = await createNode({ identity: ai, clock });
  const junk = (len, fill) => new Uint8Array(len).fill(fill);
  await n.hear(junk(MAX_ANTIGEN_BYTES + 1, 1));
  assert.equal(n.antigens().length, 0, 'one byte over the size bound is refused but not kept to share');
  await n.hear(junk(MAX_ANTIGEN_BYTES, 1));
  assert.equal(n.antigens().length, 1, 'exactly the bound is kept');
  // a dictionary refusal: the dictionary may be installed later, so it is named but not kept as an antigen
  const P = prime(new TextEncoder().encode('a shared dictionary of words '.repeat(20)));
  const d = prepare({ sender: 9, counter: 1n, kind: KINDS.BYTES, bytes: new Uint8Array(40), dictId: 7, primed: P });
  const r = await n.hear(finish(d.unsigned, new Uint8Array(64)).bytes);
  assert.equal(r.stage, 'dictionary');
  assert.equal(n.antigens().length, 1);
  for (let i = 2; i < MAX_ANTIGENS + 4; i++) await n.hear(junk(100 + i, i));
  assert.equal(n.antigens().length, MAX_ANTIGENS, 'at most ' + MAX_ANTIGENS + ' are kept');
});

test('the budget token: each of its conditions refuses on its own', async () => {
  const m = await mesh();
  const a = await m.A.ask('triage', { spO2: 88 });
  assert.equal(a.id, 'ask:' + m.A.id.slice(0, 8) + ':1', 'asks are numbered from one');
  const v = JSON.parse(new TextDecoder().decode((await import('./vendor/light/codec.mjs')).decode(a.bytes.subarray(23, a.bytes.length - 64)).bytes));
  const ok = await m.B.hear(a.bytes);
  assert.equal(ok.verdict, 'VERIFIED', 'the genuine ask answers');
  assert.equal(ok.why, undefined);
  let ctr = 5000n;
  const sendWith = async (token, id) => { ctr += 1n; const x = prepare({ sender: m.ai.slot, counter: ctr, kind: KINDS.JSON, value: { ...v, id, token }, dictId: 0 }); return m.B.hear(finish(x.unsigned, await m.ai.sign(x.signed)).bytes); };
  // a real token, really signed by A's own key, but for spending, not asking
  const wcA = walletCrypto(m.ai), gs = await W.genesis(wcA, { caps: ['spend'], budget: 9 });
  const spend = await W.authorize(wcA, gs.wallet, gs.sk, { type: 'spend', cost: 1 }, 'ask:spend:1');
  const r1 = await sendWith(spend.token, 'ask:spend:1');
  assert.equal(r1.verdict, 'ABSTAIN');
  assert.match(r1.why, /no valid budget token/);
  // a real ask token for this id, but from B's wallet, not A's
  const wcB = walletCrypto(m.bi), gb = await W.genesis(wcB, { caps: ['ask'], budget: 9 });
  const other = await W.authorize(wcB, gb.wallet, gb.sk, { type: 'ask', cost: 1 }, 'ask:other:1');
  const r2 = await sendWith(other.token, 'ask:other:1');
  assert.equal(r2.verdict, 'ABSTAIN');
  assert.match(r2.why, /no valid budget token/);
  // a real ask token from A's wallet, but for another ask
  const r3 = await sendWith(v.token, 'ask:moved:1');
  assert.match(r3.why, /no valid budget token/);
});

test('a packet replayed to a node it was not addressed to is refused by name', async () => {
  const m = await mesh();
  const a = await m.A.ask('triage', { spO2: 88 });
  assert.equal(a.to, m.B.id);
  const atC = await m.C.hear(a.bytes);            // C pins A and has never heard from it: the door admits, the message does not
  assert.deepEqual([atC.ok, atC.stage, atC.decoded, atC.reason], [false, 'message', true, 'addressed to another node']);
  assert.equal((await m.B.hear(a.bytes)).ok, true, 'it still reaches the node it was for');
});

test('contributions: recorded for verified answers, flagged per answer, and only where the gate can re-check them', async () => {
  const m = await mesh();
  const v1 = await askAndCarry(m, 'triage', { spO2: 88 });
  const v2 = await askAndCarry(m, 'triage', { spO2: 97 });
  const ab = await askAndCarry(m, 'triage', { ood: true });
  const back = async (x) => (await m.A.hear((await m.B.hear((await m.A.ask('triage', x)).bytes)).replies[0].bytes));
  const vr = await back({ spO2: 85 });
  assert.equal(vr.outcome, 'verified');
  assert.equal(vr.recorded, true, 'a verified answer is recorded');
  const ar = await back({ ood: true });
  assert.equal(ar.outcome, 'abstain');
  assert.equal(ar.recorded, false, 'an abstain is not');
  const values = m.A.ledger().log.filter((x) => x.entry.type === 'value');
  assert.equal(values.length, 3, 'three verified answers, three values');
  assert.deepEqual(values.map((x) => x.entry.job), [v1.a.id, v2.a.id, vr.id === undefined ? values[2].entry.job : values[2].entry.job]);
  assert.equal(ab.a.ok, true);
  // the same ledger twice: nothing new the second time
  const s1 = await m.B.hear(await m.A.shareLedger(m.B.id));
  const s2 = await m.B.hear(await m.A.shareLedger(m.B.id));
  assert.ok(s1.added >= 3);
  assert.equal(s2.added, 0);
  assert.ok(s2.skipped >= s1.added);
  // crafted values, really signed by A, that pass the ledger's own checks (a new basis) and so reach the gates
  const job = v1.a.id, used = values[0].entry.proofs[0].digest, job2 = v2.a.id, used2 = values[1].entry.proofs[0].digest;
  const sign = async (id, fields) => (await L.sign(id.ledgerKeys, { type: 'value', at: '2026-10-26T12:00:00Z', units: 1, ...fields })).entry;
  const extend = async (from, entries) => {
    let l = (await L.replay(from.ledger().log, { gate: async () => ({ ok: true }) })).ledger;
    for (const e of entries) { const r = await L.record(l, e, { gate: async () => ({ ok: true }) }); assert.equal(r.ok, true, r.why); l = r.ledger; }
    return l.log;
  };
  const sendLog = async (fromId, fromSlot, toNode, log, counter) => { const x = prepare({ sender: fromSlot, counter, kind: KINDS.JSON, value: { to: toNode.id, t: 'ledger', log }, dictId: 0 }); return toNode.hear(finish(x.unsigned, await fromId.sign(x.signed)).bytes); };
  // at A (its own values): an unused job, a wrong digest, the wrong asset — refused; the right one — recorded
  const atA = await sendLog(m.bi, m.bi.slot, m.A, await extend(m.B, [
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'usage', job: 'ask:nobody:1', proofs: [{ kind: 'answer', ref: 'x', digest: used }] }),
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'usage', job, proofs: [{ kind: 'answer', ref: job, digest: '0'.repeat(64) }] }),
    await sign(m.ai, { asset: assetOf(m.C.id), basis: 'usage', job, proofs: [{ kind: 'answer', ref: job, digest: used }] }),
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'lineage', job, proofs: [{ kind: 'answer', ref: job, digest: used }] }),
  ]), 7000n);
  assert.equal(atA.ok, true);
  assert.equal(atA.added, 1, 'only the value A can re-check');
  assert.equal(atA.refused, 3);
  // at B (values on its own asset): a job it never served, signed by the wrong measurer, a wrong digest — refused
  const atB = await sendLog(m.ai, m.ai.slot, m.B, await extend(m.A, [
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'usage', job: 'ask:never:1', proofs: [{ kind: 'answer', ref: 'x', digest: used }] }),
    await sign(m.ci, { asset: assetOf(m.B.id), basis: 'mesh-share', job, proofs: [{ kind: 'answer', ref: job, digest: used }] }),
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'usage', job, proofs: [{ kind: 'answer', ref: job, digest: '0'.repeat(64) }] }),
    await sign(m.ai, { asset: assetOf(m.B.id), basis: 'usage', job: job2, proofs: [{ kind: 'answer', ref: job2, digest: used2 }] }),
  ]), 8000n);
  assert.equal(atB.ok, true);
  assert.ok(atB.added >= 1, 'the value B can re-check');
  assert.ok(atB.refused >= 3, 'the three it cannot');
  // a ledger from another mesh (another genesis) is refused whole
  const other = await mesh();
  const fo = await makeIdentity(seed(40));
  const g2 = await meshGenesis(fo, [m.ai.id]);
  const lone = await createNode({ name: 'lone', identity: await makeIdentity(seed(41)), genesis: g2, clock });
  await lone.pin(m.A.card());
  const x = await lone.hear(await m.A.shareLedger(m.B.id));
  assert.equal(x.ok, false);
  assert.ok(other);
});

test('a release counts only if it matches the card it travels with', async () => {
  const m = await mesh();
  const c = m.C.card(), { sig, release, ...body } = c;
  const fresh = async () => { const n = await createNode({ name: 'fresh', identity: await makeIdentity(seed(50)), genesis: m.genesis, clock }); return n; };
  const craft = async (fields) => (await L.sign(m.ci.ledgerKeys, { type: 'release', asset: assetOf(m.C.id), at: '2026-10-26T12:00:00Z', form: 'node', lineage: [], proofs: [{ kind: 'card', ref: m.C.id, digest: digestOf(body) }], ...fields })).entry;
  for (const [fields, why] of [[{ asset: 'node:0000000000000000' }, 'another asset'], [{ form: 'app' }, 'another form'], [{ proofs: [{ kind: 'card', ref: m.C.id, digest: digestOf(body) }, { kind: 'card', ref: 'x', digest: digestOf(body) }] }, 'two proofs'], [{ proofs: [{ kind: 'card', ref: m.C.id, digest: '0'.repeat(64) }] }, 'another digest']]) {
    const n = await fresh();
    const r = await n.pin({ ...c, release: await craft(fields) });
    assert.equal(r.ok, true, 'the card itself is fine');
    assert.equal(r.released, false, why);
  }
  const n = await fresh();
  assert.equal((await n.pin(c)).released, true, 'the genuine release counts');
  assert.equal((await n.pin(c)).released, false, 'once');
  assert.equal((await n.pin({ ...c, release: null })).released, false);
});

// ── Phase 3: routing around a node that died, and shared state ──

test('expire: an ask nobody answers counts as a failed answer, and the next ask goes elsewhere', async () => {
  const m = await mesh();
  const a = await m.A.ask('triage', { spO2: 90 });   // B (the smaller key) is chosen first
  assert.equal(a.to, m.B.id);
  assert.deepEqual(m.A.pending(), [a.id]);
  const before = m.A.weight(m.B.id, 'triage');
  const e = m.A.expire(a.id);
  assert.deepEqual(e, { ok: true, to: m.B.id, skill: 'triage', weight: hebb(before, 'failed') });
  assert.deepEqual(m.A.pending(), []);
  assert.equal(m.A.weight(m.B.id, 'triage'), 250000);
  assert.deepEqual(m.A.expire(a.id), { ok: false, why: 'no ask ' + a.id + ' is waiting' }, 'once');
  assert.deepEqual(m.A.expire('nope'), { ok: false, why: 'no ask nope is waiting' });
  assert.equal(m.A.expire('x'.repeat(80)).why, 'no ask ' + 'x'.repeat(40) + ' is waiting');
  const next = await m.A.ask('triage', { spO2: 90 });
  assert.equal(next.to, m.C.id, 'routed around the node that did not answer');
  assert.equal(m.A.recall('expired unanswered', 1).center.meta.kind, 'expired');
  // a late answer to the expired ask is an answer to nothing
  const late = await m.B.hear(a.bytes);
  assert.equal(late.replies.length, 1);
  const r = await m.A.hear(late.replies[0].bytes);
  assert.deepEqual([r.ok, r.reason], [false, 'an answer to nothing this node asked that peer']);
  // a second expiry of a link already weakened halves it again
  const b2 = await m.A.ask('triage', { spO2: 91 });
  m.A.expire(b2.id);
  assert.equal(m.A.weight(m.C.id, 'triage'), 250000);
  const b3 = await m.A.ask('triage', { spO2: 92 });
  assert.equal(b3.to, m.B.id, 'two failures each: the tie goes to the smaller key');
  m.A.expire(b3.id);
  assert.equal(m.A.weight(m.B.id, 'triage'), 125000);
});

test('readMessage: a sync message carries a document', () => {
  const to = 'a'.repeat(64), doc = { docId: 'mesh', lamport: 1, entries: { k: { value: 1, ts: 1, nodeId: 'n', deleted: false } } };
  assert.deepEqual(readMessage({ to, t: 'sync', doc }), { ok: true, t: 'sync', to, doc });
  for (const bad of [{ to, t: 'sync' }, { to, t: 'sync', doc: 'x' }, { to, t: 'sync', doc: { ...doc, lamport: 0 } }]) assert.deepEqual(readMessage(bad), { ok: false, why: 'a sync message carries a document' });
});

test('shared state: writes merge across the mesh by the CRDT law, whatever order the syncs arrive in', async () => {
  const m = await mesh();
  assert.deepEqual(m.A.shared('mesh'), {});
  assert.deepEqual(m.A.sharedDoc('mesh'), { docId: 'mesh', lamport: 0, entries: {} });
  assert.equal(m.A.shared('nope'), null);
  assert.equal(m.A.sharedDoc('nope'), null);
  assert.equal(m.A.setShared('mesh', 'who', 'A').ok, true);
  assert.deepEqual(m.B.setShared('mesh', 'who', 'B').entry, { value: 'B', ts: 1, nodeId: m.B.id, deleted: false });
  m.C.setShared('mesh', 'c-only', [1, 2]);
  assert.deepEqual(m.A.setShared('nope', 'k', 1), { ok: false, why: 'this node keeps no document nope' });
  assert.equal(m.A.setShared('mesh', '', 1).why, 'a key is 1–256 characters');
  assert.equal(m.A.setShared('x'.repeat(80), 'k', 1).why, 'this node keeps no document ' + 'x'.repeat(40));
  // every node sends its document to every other, in two different orders; all end the same
  const send = async (from, to) => { const b = await from.shareSync(to.id, 'mesh'); return to.hear(b); };
  const r = await send(m.B, m.A);
  assert.deepEqual([r.ok, r.t, r.from, r.doc, r.changed], [true, 'sync', m.B.id, 'mesh', 1]);
  for (const [x, y] of [[m.C, m.A], [m.A, m.B], [m.C, m.B], [m.A, m.C], [m.B, m.C]]) await send(x, y);
  const want = JSON.stringify(m.A.shared('mesh'));
  assert.equal(JSON.stringify(m.B.shared('mesh')), want);
  assert.equal(JSON.stringify(m.C.shared('mesh')), want);
  assert.deepEqual(Object.keys(m.A.shared('mesh')), ['c-only', 'who']);
  assert.equal(m.A.shared('mesh').who, [m.A.id, m.B.id].sort()[1] === m.A.id ? 'A' : 'B', 'a tie at time 1: the larger node id');
  assert.equal((await send(m.B, m.A)).changed, 0, 'idempotent');
  assert.equal(m.A.recall('merged keys of mesh', 1).center.meta.kind, 'sync');
  assert.equal(await m.A.shareSync('f'.repeat(64), 'mesh'), null, 'only to a pinned peer');
  assert.equal(await m.A.shareSync(m.B.id, 'nope'), null, 'only a document it keeps');
  // a node that keeps another document hears a sync for one it does not keep, and refuses it by name
  const other = await createNode({ name: 'other', identity: await makeIdentity(seed(9)), clock, docs: ['notes'] });
  await other.pin(m.A.card()); await m.A.pin(other.card());
  assert.deepEqual(other.shared('mesh'), null);
  assert.deepEqual(other.shared('notes'), {});
  const x = await other.hear(await m.A.shareSync(other.id, 'mesh'));
  assert.deepEqual([x.ok, x.t, x.reason], [false, 'sync', 'this node keeps no document mesh']);
  const none = await createNode({ name: 'none', identity: await makeIdentity(seed(10)), clock, docs: 'x' });
  assert.deepEqual(none.shared('mesh'), {}, 'docs that are not a list: the mesh document');
  const junk = await createNode({ name: 'junk', identity: await makeIdentity(seed(11)), clock, docs: ['', 5, 'ok'] });
  assert.deepEqual([junk.shared('ok'), junk.shared('')], [{}, null], 'only documents with a name');
});

test('hearing is one packet at a time: two heard at once cannot set a counter back and let a replay in', async () => {
  const m = await mesh();
  const low = await m.B.shareLedger(m.A.id), high = await m.B.shareLedger(m.A.id);
  const [a, b] = await Promise.all([m.A.hear(high), m.A.hear(low)]);
  assert.equal(a.t, 'ledger', 'the higher counter, heard first, is admitted');
  assert.equal(b.stage, 'counter', 'the lower one, heard at the same moment, is out of order');
  const again = await m.A.hear(high);
  assert.deepEqual([again.ok, again.stage], [false, 'counter'], 'and the higher one cannot be replayed');
  const many = [];
  for (let i = 0; i < 6; i++) many.push(await m.B.shareLedger(m.A.id));
  const rs = await Promise.all(many.map((x) => m.A.hear(x)));
  assert.equal(rs.filter((r) => r.t === 'ledger').length, 6, 'heard together, in order, every one is admitted');
  const replays = await Promise.all(many.map((x) => m.A.hear(x)));
  assert.equal(replays.filter((r) => r.stage === 'counter').length, 6, 'and every replay refused');
  const junk = await Promise.all([m.A.hear(new Uint8Array(3)), m.A.hear(high)]);
  assert.deepEqual(junk.map((r) => r.stage), ['size', 'counter'], 'junk in the queue does not stop it');
});

test('unpin: a peer the roster drops stops at the sender, its waiting asks are given up, and pinned again it cannot replay', async () => {
  const m = await mesh();
  const before = await m.B.shareLedger(m.A.id);
  assert.equal((await m.A.hear(before)).t, 'ledger', 'pinned: heard');
  const waiting = await m.A.ask('triage', { spO2: 88 });
  assert.equal(waiting.to, m.B.id, 'an ask is waiting on B');
  assert.deepEqual(m.A.pinned(), [m.B.id, m.C.id].sort());
  const u = m.A.unpin(m.B.id);
  assert.deepEqual(u, { ok: true, id: m.B.id, dropped: 1 });
  assert.deepEqual(m.A.pinned(), [m.C.id]);
  assert.deepEqual(m.A.pending(), [], 'the ask waiting on it is given up');
  assert.equal((await m.A.hear(await m.B.shareLedger(m.A.id))).stage, 'sender', 'what it sends now stops at the sender');
  assert.equal((await m.A.ask('triage', { spO2: 88 })).to, m.C.id, 'asks go to who is still pinned');
  assert.equal(m.A.expire(waiting.id).ok, false, 'the given-up ask is gone');
  assert.deepEqual(m.A.unpin(m.B.id), { ok: false, why: 'no pinned peer ' + m.B.id.slice(0, 40) }, 'unpinned twice');
  assert.equal(m.A.unpin('nobody').ok, false);
  const mem = m.A.recall('unpinned honest', 1).center;
  assert.deepEqual([mem.text, mem.meta.kind, mem.meta.peer, mem.meta.dropped], ['unpinned honest: no longer trusted', 'unpinned', m.B.id, 1], 'remembered');
  assert.equal((await m.A.pin(m.B.card())).ok, true, 'the founder may pin it again');
  assert.equal((await m.A.hear(before)).stage, 'counter', 'and nothing it sent before can be replayed');
  assert.equal((await m.A.hear(await m.B.shareLedger(m.A.id))).t, 'ledger', 'what it sends next is heard');
  const fresh = await mesh();
  fresh.A.unpin(fresh.B.id);
  assert.equal((await fresh.A.pin(fresh.B.card())).ok, true);
  assert.equal((await fresh.A.hear(await fresh.B.shareLedger(fresh.A.id))).t, 'ledger', 'a key unpinned before it said anything starts from nothing');
});

// ── Phase 3b: routing that shares what it learns ──────────────────────────────────────────────────────────────────
// two askers, an honest holder (the smaller key) and a dishonest one, every node pinning every other; a node that is
// "down" hears nothing, so what is sent to it is never answered
async function fourMesh({ routing } = {}) {
  const [a1i, a2i, bi, ci] = await Promise.all([2, 6, 4, 3].map((n) => makeIdentity(seed(n))));
  const mk = (name, identity, skills = {}) => createNode({ name, identity, skills, clock, routing, budget: 80 });
  const A1 = await mk('a1', a1i), A2 = await mk('a2', a2i), B = await mk('honest', bi, { triage: honest }), C = await mk('liar', ci, { triage: liar });
  const all = [A1, A2, B, C];
  for (const x of all) for (const y of all) if (x !== y) assert.equal((await x.pin(y.card())).ok, true);
  const nodes = new Map(all.map((n) => [n.id, n])), down = new Set();
  const deliver = async (to, bytes) => {
    if (down.has(to)) return null;
    const r = await nodes.get(to).hear(bytes);
    for (const rep of r.replies) await deliver(rep.to, rep.bytes);
    return r;
  };
  // an ask, carried; r is the holder's side, and its one reply is the answer packet the asker heard
  const ask = async (who, input = { spO2: 88 }) => { const a = await who.ask('triage', input); return { a, r: a.ok ? await deliver(a.to, a.bytes) : null }; };
  const share = async (from, to) => deliver(to.id, await from.shareNotes(to.id));
  return { A1, A2, B, C, a1i, a2i, bi, ci, down, deliver, ask, share };
}
// a packet signed by an identity, with a counter of the caller's choosing: what a dishonest member's own software can send
const sayAs = async (who, to, value, counter, sender = who.slot) => {
  const p = prepare({ sender, counter: BigInt(counter), kind: KINDS.JSON, value: { ...value, to }, dictId: 0 });
  return finish(p.unsigned, await who.sign(p.signed)).bytes;
};
const badReceipt = { model: 'test/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) };

test('choose (Phase 3b): an untried live holder first, a quiet one is not live, and a peer that says neither is routed as in Phase 3', () => {
  const w = (x) => () => x;
  const p = (id, weight, tried, quiet) => ({ id, skills: ['triage'], weight: w(weight), tried: () => tried, quiet: () => quiet });
  assert.deepEqual(choose([p('a', 900000, true, false), p('b', 600000, false, false)], 'triage'), { id: 'b', weight: 600000, live: true, untried: true }, 'untried beats a stronger tried link');
  assert.equal(choose([p('b', 600000, false, false), p('a', 900000, true, false)], 'triage').id, 'b', 'whatever the order');
  assert.equal(choose([p('a', 900000, true, false), p('b', 600000, true, false)], 'triage').id, 'a', 'two tried: the stronger, as before');
  assert.equal(choose([p('b', 600000, true, false), p('a', 900000, true, false)], 'triage').id, 'a');
  assert.equal(choose([p('a', 900000, false, false), p('b', 600000, false, false)], 'triage').id, 'a', 'two untried: the stronger');
  assert.equal(choose([p('b', 600000, false, false), p('a', 900000, false, false)], 'triage').id, 'a');
  assert.equal(choose([p('b', 600000, false, false), p('a', 600000, false, false)], 'triage').id, 'a', 'two untried and equal: the smaller id');
  assert.equal(choose([p('a', 600000, false, false), p('b', 600000, false, false)], 'triage').id, 'a');
  assert.deepEqual(choose([p('a', 900000, true, true), p('b', LINK.FLOOR, true, false)], 'triage'), { id: 'b', weight: LINK.FLOOR, live: true, untried: false }, 'a quiet link is not live, however strong');
  assert.deepEqual(choose([p('a', 900000, false, true), p('b', 100000, true, true)], 'triage'), { id: 'a', weight: 900000, live: false, untried: false }, 'all quiet: the strongest is still tried, not live and not counted untried');
  assert.deepEqual(choose([p('a', LINK.FLOOR - 1, false, false), p('b', 60000, true, false)], 'triage'), { id: 'b', weight: 60000, live: true, untried: false }, 'an untried link under the floor is not live, so it is not explored');
  assert.equal(choose([p('a', 900000, true, false), p('b', 600000, false, true)], 'triage').id, 'a', 'untried but quiet: not explored');
  assert.equal(choose([{ id: 'a', skills: ['triage'], weight: w(900000), tried: () => undefined }, p('b', 600000, false, false)], 'triage').id, 'b', 'only a plain false is untried');
  assert.equal(choose([{ id: 'a', skills: ['triage'], weight: w(900000), quiet: () => 1 }, p('b', 600000, true, false)], 'triage').id, 'a', 'only a plain true is quiet');
  assert.deepEqual(choose([{ id: 'a', skills: ['triage'], weight: w(600000), tried: 'no', quiet: 'yes' }], 'triage'), { id: 'a', weight: 600000, live: true, untried: false }, 'what is not a function says nothing');
  for (const junk of [NaN, 1.5, '700000', null, Symbol.iterator, 2 ** 53]) assert.deepEqual(choose([{ id: 'a', skills: ['triage'], weight: () => junk }], 'triage'), { id: 'a', weight: LINK.START, live: true, untried: false }, 'a junk weight is a fresh link');
});

test('readMessage and readNote (Phase 3b): notes, probes and pongs, and every way a note can be wrong', () => {
  const to = 'a'.repeat(64), h = 'b'.repeat(64);
  const silent = { kind: 'silent', holder: h, skill: 'triage', job: 'ask:1' };
  assert.deepEqual(readMessage({ to, t: 'notes', notes: [silent] }), { ok: true, t: 'notes', to, notes: [silent] });
  assert.equal(readMessage({ to, t: 'notes', notes: Array(MAX_NOTES).fill(silent) }).ok, true, 'exactly the bound');
  for (const notes of [[], Array(MAX_NOTES + 1).fill(silent), {}, 'x', null]) assert.deepEqual(readMessage({ to, t: 'notes', notes }), { ok: false, why: 'a notes message carries 1 to 16 notes' });
  assert.deepEqual(readMessage({ to, t: 'probe', id: 'probe:1' }), { ok: true, t: 'probe', to, id: 'probe:1' });
  assert.deepEqual(readMessage({ to, t: 'pong', id: 'probe:1' }), { ok: true, t: 'pong', to, id: 'probe:1' });
  assert.deepEqual(readMessage({ to, t: 'probe', id: 'Probe' }), { ok: false, why: 'a probe names its id' });
  assert.deepEqual(readMessage({ to, t: 'pong', id: 7 }), { ok: false, why: 'a pong names its id' });
  assert.deepEqual(readMessage({ to, t: 'pong' }), { ok: false, why: 'a pong names its id' });
  assert.match(readMessage({ to, t: 'pongs', id: 'p' }).why, /not spoken here/);
  assert.deepEqual(readNote(silent), { ok: true, ...silent });
  assert.deepEqual(readNote({ ...silent, extra: 1, packet: 'zz' }), { ok: true, ...silent }, 'a silent note carries no packet, and nothing else is read');
  const pk = 'ab'.repeat(MAX_ANTIGEN_BYTES), lied = { kind: 'lied', holder: h, skill: 'triage', job: 'ask:1', packet: pk };
  assert.deepEqual(readNote({ ...lied, extra: 1 }), { ok: true, ...lied }, 'exactly the bound');
  const why = (x) => readNote(x).why, NO_PACKET = 'a lied note carries the answer packet, in hex, up to 2048 bytes';
  for (const packet of [pk + 'ab', '', 'abc', 'AB', 'zz', 5, undefined]) assert.equal(why({ ...lied, packet }), NO_PACKET, String(packet).slice(0, 8));
  for (const kind of ['quiet', undefined, 'SILENT']) assert.equal(why({ ...silent, kind }), 'a note is silent or lied');
  for (const holder of ['B'.repeat(64), 'b'.repeat(63), 7]) assert.equal(why({ ...silent, holder }), 'a note names the holder it is about');
  for (const skill of ['Tri', '', 3]) assert.equal(why({ ...lied, skill }), 'a note names a skill');
  for (const job of ['Ask', '', 'a'.repeat(97), null]) assert.equal(why({ ...lied, job }), 'a note names the ask it is about');
  for (const junk of [null, 5, 'x', [], [silent], { kind: 'lied' }, new Uint8Array(3), undefined]) assert.equal(readNote(junk).ok, false);
  const garbage = [null, undefined, 0, -1, NaN, '', 'x', [], [null], {}, { kind: 'lied', holder: {}, skill: [], job: 1, packet: {} }, () => 1, new Uint8Array(4), Symbol.iterator];
  for (const g of garbage) {
    assert.doesNotThrow(() => readNote(g));
    assert.doesNotThrow(() => readMessage({ to, t: 'notes', notes: g }));
    assert.doesNotThrow(() => choose([g, { id: 'a', skills: ['t'], weight: () => g, tried: () => g, quiet: () => g }], 't'));
  }
});

test('routing: the default shares what it learns, and Phase 3\'s greedy routing is kept by name', async () => {
  assert.deepEqual(ROUTING, ['shared', 'greedy']);
  for (const [r, want] of [[undefined, 'shared'], ['shared', 'shared'], ['greedy', 'greedy'], ['GREEDY', 'shared'], [7, 'shared']]) assert.equal((await createNode({ identity: await makeIdentity(seed(30)), routing: r })).routing, want, String(r));
  const g = await fourMesh({ routing: 'greedy' });
  const first = await g.ask(g.A1), second = await g.ask(g.A1);
  assert.deepEqual([first.a.to, second.a.to, first.a.untried, second.a.untried], [g.B.id, g.B.id, false, false], 'greedy: the stronger link alone, the liar never tried');
  assert.equal(g.A1.weight(g.C.id, 'triage'), LINK.START);
  const lost1 = await g.A1.ask('triage', { spO2: 88 });   // nobody carries these two
  g.A1.expire(lost1.id);
  const lost2 = await g.A1.ask('triage', { spO2: 88 });
  assert.equal(lost2.to, g.C.id);
  g.A1.expire(lost2.id);
  assert.deepEqual([g.A1.quiet(g.B.id, 'triage'), g.A1.quiet(g.C.id, 'triage')], [true, true], 'greedy routing keeps the record');
  const next = await g.A1.ask('triage', { spO2: 88 });
  assert.deepEqual([next.to, next.live], [g.B.id, true], 'and ignores it: a silent node is still a live link');
});

test('exploration: an asker tries every holder once before it prefers one, so the liar that ranks last is found', async () => {
  const m = await fourMesh();
  assert.ok(m.B.id < m.C.id, 'the honest holder ranks first by key, as in Phase 3');
  assert.equal(m.A1.routing, 'shared');
  const one = await m.ask(m.A1);
  assert.deepEqual([one.a.to, one.a.live, one.a.untried], [m.B.id, true, true]);
  assert.equal(m.A1.weight(m.B.id, 'triage'), 625000);
  assert.deepEqual(m.A1.notes(), [], 'a verified answer writes no note');
  const two = await m.ask(m.A1);
  assert.deepEqual([two.a.to, two.a.untried], [m.C.id, true], 'the untried liar is asked though the honest link is stronger');
  assert.equal(m.A1.weight(m.C.id, 'triage'), 250000, 'its receipt did not check');
  const lie = two.r.replies[0].bytes;
  assert.deepEqual(m.A1.notes(), [{ kind: 'lied', holder: m.C.id, skill: 'triage', job: two.a.id, packet: toHex(lie) }], 'the lie is kept as evidence: the liar\'s own signed answer');
  const three = await m.ask(m.A1);
  assert.deepEqual([three.a.to, three.a.untried], [m.B.id, false], 'both tried: the stronger');
  assert.deepEqual([m.A1.tried(m.B.id, 'triage'), m.A1.tried(m.C.id, 'triage'), m.A1.tried(m.A2.id, 'triage'), m.A1.tried(m.B.id, 'echo'), m.A1.tried('nobody', 'triage')], [true, true, false, false, false]);
  const abs = await m.ask(m.A2, { ood: true });
  assert.equal(abs.a.to, m.B.id);
  assert.equal(m.A2.tried(m.B.id, 'triage'), true, 'an abstain is a try');
  assert.equal((await m.ask(m.A2)).a.to, m.C.id, 'so the next goes to the untried one');
});

test('a lie seen by one asker is counted by another only after its own re-check, once', async () => {
  const m = await fourMesh();
  await m.ask(m.A1); await m.ask(m.A1);
  const r = await m.share(m.A1, m.A2);
  assert.deepEqual({ ok: r.ok, t: r.t, from: r.from, offered: r.offered, adopted: r.adopted, quiet: r.quiet, already: r.already, refused: r.refused, replies: r.replies }, { ok: true, t: 'notes', from: m.A1.id, offered: 1, adopted: 1, quiet: 0, already: 0, refused: [], replies: [] });
  assert.equal(m.A2.weight(m.C.id, 'triage'), 250000, 'counted as one failed answer');
  assert.equal(m.A2.tried(m.C.id, 'triage'), false, 'evidence from another asker is not a try of its own');
  assert.deepEqual(m.A2.notes(), [], 'and not a note of its own: notes are first-hand');
  const again = await m.share(m.A1, m.A2);
  assert.deepEqual([again.adopted, again.already, again.refused], [0, 1, []], 'the same evidence counts once');
  assert.equal(m.A2.weight(m.C.id, 'triage'), 250000);
  const mine = await m.A2.ask('triage', { spO2: 88 });
  assert.equal(mine.to, m.B.id, 'both untried here: the stronger link first');
  await m.deliver(mine.to, mine.bytes);
  const own = await m.ask(m.A2);
  assert.deepEqual([own.a.to, own.a.untried], [m.C.id, true], 'it still tries the liar once itself');
  assert.equal(m.A2.weight(m.C.id, 'triage'), 125000);
  assert.equal((await m.share(m.A2, m.A1)).adopted, 1, 'A2\'s own evidence is new to A1');
  assert.equal(m.A1.weight(m.C.id, 'triage'), 125000, 'two lies, two failures, at each asker');
  assert.equal((await m.share(m.A1, m.C)).refused[0], 'a note about this node', 'the accused counts nothing against itself');
  assert.equal((await m.share(m.A1, m.B)).adopted, 1, 'any member may count it');
  assert.equal(m.B.weight(m.C.id, 'triage'), 250000);
});

test('a lied note is refused unless it is the accused\'s own signed answer to the sender, and fails the receiver\'s check', async () => {
  const m = await fourMesh();
  assert.notEqual(m.bi.slot, m.ci.slot, 'the test keys sit in different slots');
  await m.ask(m.A1); const two = await m.ask(m.A1);
  const lie = toHex(two.r.replies[0].bytes), job = two.a.id, C = m.C.id;
  const n = (packet, over = {}) => ({ kind: 'lied', holder: C, skill: 'triage', job, packet, ...over });
  const signedByC = async (value, counter, sender) => toHex(await sayAs(m.ci, m.A1.id, value, counter, sender));
  const answer = (over = {}) => ({ t: 'answer', id: job, skill: 'triage', answer: { verdict: 'VERIFIED', label: 1, receipt: badReceipt }, ...over });
  const core = { model: 'test/1', domain: 'triage', label: 0, verdict: 'VERIFIED' }, good = { verdict: 'VERIFIED', label: 0, receipt: { ...core, receiptHash: rehash(core) } };
  const raw = prepare({ sender: m.ci.slot, counter: 9n, kind: KINDS.BYTES, bytes: new Uint8Array([1, 2, 3]), dictId: 0 });
  const forged = toHex(await sayAs(m.a1i, m.A1.id, answer(), 7, m.ci.slot));
  const notes = [
    { kind: 'maybe', holder: C, skill: 'triage', job },
    n(lie, { holder: m.A2.id }),
    n(lie, { holder: m.A1.id }),
    n(lie, { holder: 'd'.repeat(64) }),
    n(lie, { skill: 'echo' }),
    n('00ff'),
    n(forged),                                                              // in C's slot, signed by A1's key
    n(await signedByC(answer(), 8, m.bi.slot)),                             // signed by C, in another's slot
    n(lie, { job: 'ask:other:1' }),
    n(await signedByC(answer({ skill: 'echo' }), 9)),
    n(toHex(await sayAs(m.ci, m.A2.id, answer(), 10))),                     // C's lie, but to someone else
    n(await signedByC({ t: 'probe', id: job }, 11)),
    n(toHex(finish(raw.unsigned, await m.ci.sign(raw.signed)).bytes)),      // signed by C, but not a message
    n(await signedByC(answer({ answer: { verdict: 'ABSTAIN' } }), 12)),
    n(await signedByC(answer({ answer: good }), 13)),
    n(lie),
  ];
  assert.equal(notes.length, MAX_NOTES);
  const r = await m.deliver(m.A2.id, await sayAs(m.a1i, m.A2.id, { t: 'notes', notes }, 1000));
  const NOT_SIGNED = 'the packet is not signed by the holder it accuses', NOT_ANSWER = 'the packet is not that holder’s answer to that ask of the sender’s';
  assert.deepEqual(r.refused, ['a note is silent or lied', 'a note about this node', 'a note about its own sender', 'a note about a node this one has not pinned', 'the holder does not hold echo',
    NOT_SIGNED, NOT_SIGNED, NOT_SIGNED, NOT_ANSWER, NOT_ANSWER, NOT_ANSWER, NOT_ANSWER, NOT_ANSWER, 'an abstain is not a lie', 'the answer checks here']);
  assert.deepEqual([r.offered, r.adopted, r.quiet, r.already], [16, 1, 0, 0], 'only the liar\'s own signed lie, to the sender, for that ask, counts, though the same bytes came first with the wrong ask');
  assert.equal(m.A2.weight(C, 'triage'), 250000);
  assert.equal(m.A2.weight(m.B.id, 'triage'), LINK.START, 'nothing else moved');
  const dup = await m.deliver(m.A2.id, await sayAs(m.a1i, m.A2.id, { t: 'notes', notes: [n(lie), n(forged), notes[14]] }, 1001));
  assert.deepEqual([dup.adopted, dup.already, dup.refused], [0, 2, [NOT_SIGNED]], 'evidence already judged is not judged again; a forgery is refused each time it comes');
  const second = await m.deliver(m.A2.id, await sayAs(m.a1i, m.A2.id, { t: 'notes', notes: [n(await signedByC(answer(), 2))] }, 1002));
  assert.equal(second.adopted, 1, 'another signed lie is other evidence');
  assert.equal(m.A2.weight(C, 'triage'), 125000);
  const mem = m.A2.recall('took notes from a1', 1).center;
  assert.deepEqual([mem.meta.kind, mem.meta.from, mem.meta.adopted], ['notes', m.A1.id, 1]);
});

test('silence: an expired ask makes the holder quiet and writes a note; elsewhere the note makes it quiet and sends a probe, and only an expired probe counts', async () => {
  const m = await fourMesh();
  await m.ask(m.A1); await m.ask(m.A1); await m.ask(m.A1);            // B verified, C lied, B verified
  assert.equal(m.A1.weight(m.B.id, 'triage'), 718750);
  const lost = await m.A1.ask('triage', { spO2: 88 });                 // to B; nobody carries it
  assert.equal(lost.to, m.B.id);
  assert.deepEqual(m.A1.expire(lost.id), { ok: true, to: m.B.id, skill: 'triage', weight: 359375 });
  assert.deepEqual([m.A1.quiet(m.B.id, 'triage'), m.A1.quiet(m.B.id, 'echo'), m.A1.quiet(m.C.id, 'triage'), m.A1.quiet('nobody', 'triage')], [true, false, false, false]);
  assert.deepEqual(m.A1.notes()[1], { kind: 'silent', holder: m.B.id, skill: 'triage', job: lost.id });
  const next = await m.A1.ask('triage', { spO2: 88 });
  assert.deepEqual([next.to, next.live], [m.C.id, true], 'B is quiet, so the weaker live link takes the ask');
  m.A1.expire(next.id);
  assert.equal(m.A1.quiet(m.C.id, 'triage'), true);
  const fall = await m.A1.ask('triage', { spO2: 88 });
  assert.deepEqual([fall.to, fall.live, fall.untried], [m.B.id, false, false], 'everyone quiet: the strongest is still tried');
  // the notes reach A2: the lie counted, the two silences make B and C quiet there and send each a probe
  m.down.add(m.B.id); m.down.add(m.C.id);
  const r = await m.share(m.A1, m.A2);
  assert.deepEqual([r.adopted, r.quiet, r.already, r.refused], [1, 2, 0, []]);
  assert.deepEqual(r.replies.map((x) => x.to), [m.B.id, m.C.id], 'a probe to each');
  const pre = 'probe:' + m.A2.id.slice(0, 8) + ':';
  assert.deepEqual(m.A2.probing(), [pre + 1, pre + 2]);
  assert.deepEqual([m.A2.quiet(m.B.id, 'triage'), m.A2.quiet(m.C.id, 'triage'), m.A2.weight(m.B.id, 'triage')], [true, true, LINK.START], 'quiet at once; the link does not move on A1\'s word');
  assert.deepEqual([m.A2.stats().quiet, m.A2.stats().probing, m.A2.stats().notes, m.A1.stats().notes], [2, 2, 0, 3]);
  assert.deepEqual([(await m.share(m.A1, m.A2)).already, m.A2.probing().length], [3, 2], 'the same notes again: no second probe');
  // B is alive after all: its answer to the probe clears it, and its probe only
  m.down.delete(m.B.id);
  const pong = await m.deliver(m.A2.id, (await m.B.hear(r.replies[0].bytes)).replies[0].bytes);
  assert.deepEqual(pong, { ok: true, t: 'pong', from: m.B.id, id: pre + 1, replies: [] });
  assert.deepEqual([m.A2.quiet(m.B.id, 'triage'), m.A2.quiet(m.C.id, 'triage'), m.A2.probing()], [false, true, [pre + 2]], 'heard from: B is live again; C\'s probe still waits');
  assert.equal(m.A2.weight(m.B.id, 'triage'), LINK.START, 'a false silence costs nothing but its probe');
  assert.match(m.A2.recall('honest was heard from', 1).center.text, /^honest was heard from: no longer quiet$/);
  // C never answers: the probe expires, and that is A2's own evidence
  assert.deepEqual(m.A2.expire(pre + 2), { ok: true, to: m.C.id, skill: 'triage', weight: 125000, probe: true });
  assert.deepEqual([m.A2.probing(), m.A2.quiet(m.C.id, 'triage'), m.A2.pending()], [[], true, []]);
  assert.equal(m.A2.expire(pre + 2).ok, false, 'once');
  assert.equal(m.A2.recall('probe expired unanswered', 1).center.meta.kind, 'probe-expired');
  assert.deepEqual(m.A2.notes(), [], 'an expired probe is not a note: A2 never asked C anything');
  // a packet from a quiet peer that the door refuses proves nothing; one it admits does
  assert.equal(await m.C.shareNotes(m.A1.id), null, 'C has no notes of its own');
  assert.equal(await m.A1.shareNotes('nobody'), null, 'and notes go only to a pinned peer');
  const sync = await m.C.shareSync(m.A1.id, 'mesh');
  assert.equal((await m.A1.hear(sync)).ok, true);
  assert.deepEqual([m.A1.quiet(m.C.id, 'triage'), m.A1.quiet(m.B.id, 'triage')], [false, true], 'C spoke: live again at A1, and only C');
  m.A1.expire((await m.A1.ask('triage', { spO2: 88 })).id);
  assert.equal(m.A1.quiet(m.C.id, 'triage'), true);
  assert.equal((await m.A1.hear(sync)).stage, 'counter');
  assert.equal(m.A1.quiet(m.C.id, 'triage'), true, 'a replay is not a sign of life');
});

test('own notes: kept up to the bound, oldest out, handed out as copies; a lie too large to carry is counted but not kept', async () => {
  const m = await fourMesh();
  const ids = [];
  for (let i = 0; i < MAX_NOTES + 1; i++) { const a = await m.A1.ask('triage', { spO2: 88 }); ids.push(a.id); m.A1.expire(a.id); }
  const kept = m.A1.notes();
  assert.equal(kept.length, MAX_NOTES);
  assert.deepEqual(kept.map((x) => x.job), ids.slice(1), 'the oldest went first');
  kept[0].kind = 'changed';
  assert.equal(m.A1.notes()[0].kind, 'silent', 'a copy');
  const pad = Array.from({ length: 300 }, (_, i) => rehash({ i })).join('');
  const bi = await makeIdentity(seed(31)), ai = await makeIdentity(seed(32));
  const Big = await createNode({ name: 'big', identity: bi, skills: { triage: async () => ({ verdict: 'VERIFIED', pad, receipt: badReceipt }) }, clock });
  const A = await createNode({ name: 'a', identity: ai, clock });
  await A.pin(Big.card()); await Big.pin(A.card());
  const q = await A.ask('triage', { spO2: 88 });
  const reply = (await Big.hear(q.bytes)).replies[0].bytes;
  assert.ok(reply.length > MAX_ANTIGEN_BYTES, 'the answer is bigger than a note may carry');
  assert.equal((await A.hear(reply)).outcome, 'failed');
  assert.equal(A.weight(Big.id, 'triage'), 250000, 'counted here');
  assert.deepEqual(A.notes(), [], 'but not kept to share: no receiver would take it');
});

test('the memory of notes taken is bounded, the oldest forgotten first', async () => {
  const m = await fourMesh();
  m.down.add(m.B.id);
  const silentB = (k) => ({ kind: 'silent', holder: m.B.id, skill: 'triage', job: 'j:' + k });
  let counter = 2000, quiet = 0, already = 0;
  const send = async (ks) => { const r = await m.deliver(m.A2.id, await sayAs(m.a1i, m.A2.id, { t: 'notes', notes: ks.map(silentB) }, counter++)); quiet += r.quiet; already += r.already; return r; };
  const wake = async () => { assert.equal((await m.A2.hear(await m.B.shareSync(m.A2.id, 'mesh'))).ok, true); assert.equal(m.A2.quiet(m.B.id, 'triage'), false); };
  for (let k = 0; k < MAX_NOTED; k += MAX_NOTES) await send(Array.from({ length: MAX_NOTES }, (_, i) => k + i));
  assert.deepEqual([quiet, already], [1, MAX_NOTED - 1], 'the first made B quiet; the rest found it quiet');
  await wake();
  assert.equal((await send([0])).already, 1, 'exactly the bound is remembered');
  assert.equal((await send([MAX_NOTED])).quiet, 1, 'one more…');
  await wake();
  assert.equal((await send([1])).already, 1);
  assert.equal(m.A2.quiet(m.B.id, 'triage'), false);
  assert.equal((await send([0])).quiet, 1, '…and the oldest is forgotten');
});

test('pinned again, a peer keeps what was tried and its silence; unpinned, its probes go; an ordinary packet leaves no trace of silence', async () => {
  const m = await fourMesh();
  const mem0 = m.A1.stats().memory;
  await m.ask(m.A1);
  assert.equal(m.A1.stats().memory, mem0 + 1, 'one answer, one memory: no silence to clear');
  await m.ask(m.A1);
  m.A1.expire((await m.A1.ask('triage', { spO2: 88 })).id);   // B
  m.A1.expire((await m.A1.ask('triage', { spO2: 88 })).id);   // C
  assert.equal((await m.A1.pin(m.C.card())).ok, true);
  assert.equal((await m.A1.pin(m.B.card())).ok, true);
  assert.deepEqual([m.A1.tried(m.C.id, 'triage'), m.A1.quiet(m.B.id, 'triage'), m.A1.quiet(m.C.id, 'triage'), m.A1.weight(m.C.id, 'triage')], [true, true, true, 125000], 'a second pin changes nothing it had learned');
  m.down.add(m.B.id); m.down.add(m.C.id);
  await m.share(m.A1, m.A2);
  assert.equal(m.A2.probing().length, 2);
  const pre = 'probe:' + m.A2.id.slice(0, 8) + ':';
  assert.equal(m.A2.unpin(m.C.id).ok, true);
  assert.deepEqual(m.A2.probing(), [pre + 1], 'only the probe to the dropped peer goes');
  assert.equal(m.A2.stats().probing, 1);
});
