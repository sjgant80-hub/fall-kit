import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPACE, bound, boundGate, unboundIn, mergeBound } from './names.mjs';
import * as L from './vendor/ledger/contrib.mjs';
import { assetOf } from './node.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const AT = '2026-10-27T15:00:00Z';
const PROOF = [{ kind: 'test', ref: 'names', digest: 'a'.repeat(64) }];
const pass = async () => ({ ok: true });
const K = await Promise.all([1, 2, 3, 4].map((n) => L.keysFromSeed(seed(n))));
const [A, B, C, F] = K;
const rel = (by, asset, form = 'node') => ({ type: 'release', asset, at: AT, form, lineage: [], proofs: PROOF, by });

async function genesis() { return (await L.sign(F, { type: 'genesis', activators: [F.pub], measurers: [F.pub], policy: { makerPpm: 100000, lineagePpm: 0, earlyUntil: 4, earlyNum: 3, earlyDen: 2 } })).entry; }
async function ledgerOf(g, releases, gate = pass) {
  let l = (await L.record(L.empty(), g, {})).ledger;
  for (const [keys, asset, form] of releases) {
    const s = await L.sign(keys, { type: 'release', asset, at: AT, form: form || 'node', lineage: [], proofs: PROOF });
    const r = await L.record(l, s.entry, { gate });
    assert.equal(r.ok, true, r.why);
    l = r.ledger;
  }
  return l;
}

test('the space', () => { assert.equal(SPACE, 'node:'); });

test('bound: only a record is an entry; anything but a release passes', () => {
  for (const x of [null, undefined, 5, 'release', [], [rel(A.pub, 'x')]]) assert.deepEqual(bound(x), { ok: false, why: 'not an entry' });
  for (const type of ['genesis', 'value', 'give', 'switch', undefined]) assert.deepEqual(bound({ type, asset: assetOf(B.pub), form: 'node', by: A.pub }), { ok: true });
});

test('bound: a node under its own key\'s name passes; under another\'s it is refused, naming both', () => {
  assert.deepEqual(bound(rel(A.pub, assetOf(A.pub))), { ok: true });
  assert.deepEqual(bound(rel(A.pub, assetOf(B.pub))), { ok: false, why: 'a node is released under its own key\'s name: ' + assetOf(B.pub) + ' is not the name of the key that signed it (' + assetOf(A.pub) + ' is)' });
  assert.deepEqual(bound(rel(A.pub, assetOf(A.pub) + '-2')), { ok: false, why: 'a node is released under its own key\'s name: ' + assetOf(A.pub) + '-2 is not the name of the key that signed it (' + assetOf(A.pub) + ' is)' });
  assert.deepEqual(bound(rel(A.pub, 'network:node-1')), { ok: false, why: 'a node is released under its own key\'s name: network:node-1 is not the name of the key that signed it (' + assetOf(A.pub) + ' is)' });
});

test('bound: a node\'s name is carried by a node release only, even its own key\'s', () => {
  for (const form of ['card', 'mint', 'app', undefined]) {
    assert.deepEqual(bound({ ...rel(A.pub, assetOf(B.pub)), form }), { ok: false, why: assetOf(B.pub) + ' is in the node: space, a node\'s name: only the node\'s own release carries it, and this is a ' + String(form) + ' release' });
    assert.deepEqual(bound({ ...rel(A.pub, assetOf(A.pub)), form }), { ok: false, why: assetOf(A.pub) + ' is in the node: space, a node\'s name: only the node\'s own release carries it, and this is a ' + String(form) + ' release' });
  }
  assert.deepEqual(bound(rel(A.pub, SPACE, 'card')).ok, false);
  for (const asset of ['card:x', 'nodes:x', 'xnode:x', 'node', 'network:node-1', 'NODE:' + A.pub.slice(0, 16)]) assert.deepEqual(bound(rel(B.pub, asset, 'card')), { ok: true });
});

test('bound: a release to be bound names a key, or it is refused', () => {
  for (const by of [undefined, 5, '', A.pub.slice(1), A.pub.toUpperCase(), A.pub + '0']) {
    assert.deepEqual(bound(rel(by, assetOf(A.pub))), { ok: false, why: 'a release of ' + assetOf(A.pub) + ' names no key to bind it to' });
    assert.deepEqual(bound(rel(by, assetOf(A.pub), 'card')), { ok: false, why: 'a release of ' + assetOf(A.pub) + ' names no key to bind it to' });
  }
  assert.deepEqual(bound(rel(undefined, 'card:x', 'card')), { ok: true });
});

test('bound: a node release with no text for a name is refused and never throws', () => {
  const s = Symbol('x');
  for (const asset of [undefined, 5, null, { toString: () => assetOf(A.pub) }]) assert.equal(bound(rel(A.pub, asset)).ok, false);
  assert.deepEqual(bound(rel(A.pub, s)), { ok: false, why: 'a node is released under its own key\'s name: Symbol(x) is not the name of the key that signed it (' + assetOf(A.pub) + ' is)' });
  assert.deepEqual(bound(rel(A.pub, s, Symbol('f'))), { ok: true });
  assert.deepEqual(bound(rel(5, s)), { ok: false, why: 'a release of Symbol(x) names no key to bind it to' });
  assert.deepEqual(bound({ ...rel(A.pub, assetOf(B.pub)), form: Symbol('f') }), { ok: false, why: assetOf(B.pub) + ' is in the node: space, a node\'s name: only the node\'s own release carries it, and this is a Symbol(f) release' });
});

test('boundGate: what the rule refuses never reaches the gate; the rest is the gate\'s answer, as it gave it', async () => {
  const seen = [], ledger = { mark: 1 };
  const inner = async (e, l) => { seen.push([e.asset, l]); return e.asset === 'card:no' ? { ok: false, why: 'inner says no' } : { ok: true, from: 'inner' }; };
  const g = boundGate(inner);
  assert.deepEqual(await g(rel(A.pub, assetOf(B.pub)), ledger), bound(rel(A.pub, assetOf(B.pub))));
  assert.deepEqual(seen, []);
  assert.deepEqual(await g(rel(A.pub, assetOf(A.pub)), ledger), { ok: true, from: 'inner' });
  assert.deepEqual(await g(rel(A.pub, 'card:no', 'card'), ledger), { ok: false, why: 'inner says no' });
  assert.deepEqual(await g({ type: 'value', asset: assetOf(B.pub) }, ledger), { ok: true, from: 'inner' });
  assert.deepEqual(seen, [[assetOf(A.pub), ledger], ['card:no', ledger], [assetOf(B.pub), ledger]]);
  assert.deepEqual(await g(null, ledger), { ok: false, why: 'not an entry' });
  for (const x of [undefined, null, 5, {}]) {
    assert.deepEqual(await boundGate(x)(rel(A.pub, assetOf(A.pub)), ledger), { ok: false, why: 'no gate was given behind the rule' });
    assert.deepEqual(await boundGate(x)(rel(A.pub, assetOf(B.pub)), ledger), bound(rel(A.pub, assetOf(B.pub))));
  }
});

test('unboundIn: every release that breaks the rule, in the order recorded, and nothing else', async () => {
  const g = await genesis();
  const l = await ledgerOf(g, [[A, assetOf(A.pub)], [B, assetOf(A.pub) + '-2'], [C, 'card:c', 'card'], [B, assetOf(B.pub)], [C, assetOf(A.pub).replace('node:', 'node:0'), 'card'], [A, 'network:node-1']]);
  const u = unboundIn(l);
  assert.equal(u.ok, true);
  assert.deepEqual(u.unbound, [
    { asset: assetOf(A.pub) + '-2', maker: B.pub, at: 2, why: bound(rel(B.pub, assetOf(A.pub) + '-2')).why },
    { asset: assetOf(A.pub).replace('node:', 'node:0'), maker: C.pub, at: 5, why: bound(rel(C.pub, assetOf(A.pub).replace('node:', 'node:0'), 'card')).why },
    { asset: 'network:node-1', maker: A.pub, at: 6, why: bound(rel(A.pub, 'network:node-1')).why },
  ]);
  assert.deepEqual(unboundIn(await ledgerOf(g, [[A, assetOf(A.pub)], [C, 'card:c', 'card']])), { ok: true, unbound: [] });
  assert.deepEqual(unboundIn(L.empty()), { ok: true, unbound: [] });
  for (const x of [null, 5, [], {}, { assets: null }, { assets: [] }, { assets: { 'node:x': null } }, { assets: { 'card:x': 5 } }]) assert.deepEqual(unboundIn(x), { ok: false, why: 'not a contribution ledger' });
});

test('mergeBound: a target that does not bind names is refused before anything is recorded', async () => {
  const g = await genesis();
  const into = await ledgerOf(g, [[A, assetOf(A.pub)], [B, assetOf(C.pub)], [C, 'network:node-3']]);
  const from = await ledgerOf(g, [[C, assetOf(C.pub)]]);
  const before = JSON.stringify(into);
  const r = await mergeBound(into, from, { gate: pass });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'the target does not bind names to keys, so nothing is merged into it: it holds ' + assetOf(C.pub) + ' (entry 2, by ' + B.pub.slice(0, 16) + '…), network:node-3 (entry 3, by ' + C.pub.slice(0, 16) + '…)');
  assert.deepEqual(r.unbound, unboundIn(into).unbound);
  assert.equal(r.ledger, undefined);
  assert.equal(JSON.stringify(into), before);
});

test('mergeBound: into a bound target, through the rule and then the gate; each entry once', async () => {
  const g = await genesis();
  const into = await ledgerOf(g, [[A, assetOf(A.pub)]]);
  const from = await ledgerOf(g, [[B, assetOf(A.pub) + '-2'], [C, assetOf(C.pub)], [B, 'card:no', 'card'], [B, assetOf(B.pub)]]);
  const asked = [];
  const r = await mergeBound(into, from, { gate: async (e) => { asked.push(e.asset); return e.asset === 'card:no' ? { ok: false, why: 'no' } : { ok: true }; } });
  assert.equal(r.ok, true);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.refused, [{ n: 1, why: 'its gate did not pass: ' + bound(rel(B.pub, assetOf(A.pub) + '-2')).why }, { n: 3, why: 'its gate did not pass: no' }]);
  assert.deepEqual(asked, [assetOf(C.pub), 'card:no', assetOf(B.pub)]);
  assert.deepEqual(Object.keys(r.ledger.assets), [assetOf(A.pub), assetOf(C.pub), assetOf(B.pub)]);
  const none = await mergeBound(into, from, null);
  assert.deepEqual(none.refused.map((x) => x.why), ['its gate did not pass: ' + bound(rel(B.pub, assetOf(A.pub) + '-2')).why, 'its gate did not pass: no gate was given behind the rule', 'its gate did not pass: no gate was given behind the rule', 'its gate did not pass: no gate was given behind the rule']);
  assert.deepEqual((await mergeBound(into, from)).refused.length, 4);
});

test('mergeBound: junk is a refusal, never a throw', async () => {
  const g = await genesis();
  const into = await ledgerOf(g, [[A, assetOf(A.pub)]]);
  for (const x of [null, 5, {}, { assets: 5 }]) assert.deepEqual(await mergeBound(x, into, { gate: pass }), { ok: false, why: 'not a contribution ledger' });
  assert.deepEqual(await mergeBound(into, null, { gate: pass }), { ok: false, why: 'both must be contribution ledgers of this schema' });
  assert.deepEqual(await mergeBound(into, { schema: into.schema, genesis: into.genesis, log: 5 }, { gate: pass }), { ok: false, why: 'not a ledger that can be merged' });
  const other = await ledgerOf((await L.sign(A, { type: 'genesis', activators: [A.pub], measurers: [], policy: g.policy })).entry, []);
  assert.equal((await mergeBound(into, other, { gate: pass })).why, 'they began from different geneses: their policies and keys differ, so their entries are not the same economy');
});
