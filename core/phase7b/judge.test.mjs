import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, PHASES } from './judge.mjs';

const CLAIMS = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const FAILED = JSON.parse(readFileSync(new URL('../receipts/phase7.json', import.meta.url), 'utf8')).facts.b3;   // Phase 7's own b3, as it failed
const clone = (x) => JSON.parse(JSON.stringify(x));
const FIXED = { ...clone(FAILED), sharedOn: { 'stay-a': { shared: true, adopted: 1, recognised: true }, 'stay-b': { shared: true, adopted: 1, recognised: true }, gate: { shared: true, adopted: 1, recognised: true } } };
const SHA = 'a'.repeat(64);
function good() {
  return {
    r1: { b3: clone(FIXED), relayed: 2 },
    r2: { b3: clone(FAILED), relayed: null, sealed: clone(FAILED) },
    r3: { desk: { adopted: 1, relayed: 1 }, stayA: { shared: true, adopted: 4, blocked: 2 }, stayB: { shared: true, adopted: 1, blocked: 1 }, stayADoor: 'passed', stayBDoor: 'recognised' },
    r4: { commit: 'c'.repeat(40), nodeSha: SHA, nodeShaNow: SHA, results: PHASES.map((phase) => ({ phase, exit: 0, last: 'ok' })) },
    r5: { where: 'a tab', relayOn: { hubStage: 'signature', bridgeAdopted: 1, shared: true, adopted: 1, recognised: true }, relayOff: { hubStage: 'signature', bridgeAdopted: 1, shared: false, adopted: 0, recognised: false }, seconds: 1.2 },
    r6: { page: [], modules: { 'core/phase7b/a.mjs': [], 'core/phase7b/b.mjs': [] }, privacy: { 'core/phase7/index.html': [], 'core/receipts/phase7b.json': [] } },
  };
}
const verdict = (facts, id) => judge(CLAIMS, facts).verdicts.find((v) => v.id === id);
const held = (facts, id) => verdict(facts, id).held;
function set(facts, path, value) { const f = clone(facts), ks = path.split('.'); let o = f; for (const k of ks.slice(0, -1)) o = o[k]; if (value === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = value; return f; }
const breaks = (id, path, value) => assert.equal(held(set(good(), path, value), id), false, id + ' should fail when ' + path + ' = ' + JSON.stringify(value));

test('the sealed list of phases, and the claims', () => {
  assert.deepEqual(PHASES, ['phase2', 'phase3', 'phase3c', 'phase4', 'phase5', 'phase5b', 'phase6', 'phase6b', 'phase7']);
  assert.deepEqual(CLAIMS.claims.map((c) => c.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  assert.equal(FAILED.sharedOn['stay-a'].shared, false, 'Phase 7\'s own b3 is the one that failed');
});

test('every claim holds on good facts, and says what it measured', () => {
  const j = judge(CLAIMS, good());
  assert.deepEqual(j.verdicts.map((v) => [v.id, v.pass, v.held]), [['R1', 1, true], ['R2', 1, true], ['R3', 2, true], ['R4', 3, true], ['R5', 4, true], ['R6', 4, true]]);
  assert.deepEqual([j.held, j.failed, j.open], [6, 0, 0]);
  const m = Object.fromEntries(j.verdicts.map((v) => [v.id, v.measured]));
  assert.match(m.R1, /^with the desk as a bridge \(it kept 2 to share on\), Phase 7's judge holds B3: planted on the estate's genesis: yes; .*shared on to 3 of 3 \(stay-a: shared, stay-b: shared, gate: shared\)/);
  assert.equal(m.R2, 'the desk booted as Phase 7 booted it: field for field the b3 facts of Phase 7\'s receipt, and Phase 7\'s judge fails B3 on them, as it did');
  assert.equal(m.R3, "the desk adopted 1 and kept 1 to share on; stay-a, whose door admits the packet, did not take its antibody and still lets the genuine packet through its door; stay-b, whose door refuses it, took it and refuses the packet on sight (of the whole bundle: stay-a adopted 4, 2 blocked; stay-b adopted 1)");
  assert.equal(m.R4, '9 of 9 phase checks exited 0 (phase2, phase3, phase3c, phase4, phase5, phase5b, phase6, phase6b, phase7) at ccccccc, on the core/node.mjs this receipt runs');
  assert.equal(m.R5, 'in a tab at a tab: with relay the member adopted 1 and refused the packet on sight; without, the bridge had nothing to share and the member did not know the packet, in 1.2 s');
  assert.equal(m.R6, '2 modules and the page read: no barred word; 2 published files read for the client\'s guests: none');
});

test('the other branch of every measured line', () => {
  const f = good();
  f.r1 = { b3: clone(FAILED), relayed: 'x' };
  f.r2 = { b3: clone(FIXED), relayed: null, sealed: clone(FAILED) };
  f.r3 = { ...f.r3, stayADoor: 'recognised', stayBDoor: 'passed' };
  f.r4 = { ...f.r4, nodeShaNow: 'b'.repeat(64), results: [{ phase: 'phase2', exit: 1 }, { phase: 'phase3', exit: 0 }] };
  f.r5 = { where: 5, relayOn: { adopted: 0, recognised: false }, relayOff: { shared: true, recognised: true }, seconds: 'x' };
  f.r6 = { page: ['wordx'], modules: { 'core/phase7b/a.mjs': ['wordy'], 'core/phase7b/b.mjs': 'z' }, privacy: { 'core/phase7/index.html': ['a guest name'], 'core/receipts/phase7b.json': 5 } };
  const m = Object.fromEntries(judge(CLAIMS, f).verdicts.map((v) => [v.id, v.measured]));
  assert.match(m.R1, /^with the desk as a bridge \(it kept NaN to share on\), Phase 7's judge FAILS B3: /);
  assert.equal(m.R2, 'the desk booted as Phase 7 booted it: NOT the b3 facts of Phase 7\'s receipt, and Phase 7\'s judge HOLDS B3 on them');
  assert.equal(m.R3, "the desk adopted 1 and kept 1 to share on; stay-a, whose door admits the packet, did NOT let the genuine packet through its door (recognised); stay-b, whose door refuses it, did NOT refuse it on sight (passed) (of the whole bundle: stay-a adopted 4, 2 blocked; stay-b adopted 1)");
  assert.equal(m.R4, '1 of 2 phase checks exited 0 (phase2 EXIT 1, phase3) at ccccccc, NOT on the core/node.mjs this receipt runs');
  assert.equal(m.R5, 'in a tab at : with relay the member adopted 0 and did NOT refuse it on sight; without, the bridge SHARED and the member KNEW it');
  assert.equal(m.R6, '2 modules and the page read: barred words in core/phase7b/a.mjs, core/phase7b/b.mjs, the page; 2 published files read for the client\'s guests: FOUND in core/phase7/index.html, core/receipts/phase7b.json');
  const g = good();
  assert.match(verdict(set(g, 'r1.b3', {}), 'R1').measured, /Phase 7's judge FAILS B3/);
  assert.match(verdict(set(g, 'r1.b3', 5), 'R1').measured, /Phase 7's judge cannot judge B3: not measured yet$/);
  assert.match(verdict(set(g, 'r2.b3', 5), 'R2').measured, /Phase 7's judge cannot judge them$/);
});

test('R1 and R2 fail on each thing their rules name', () => {
  for (const [p, v] of [['r1.b3', clone(FAILED)], ['r1.b3.sharedOn.gate.shared', false], ['r1.relayed', 0], ['r1.relayed', undefined], ['r1.b3', undefined]]) breaks('R1', p, v);
  assert.equal(held(set(good(), 'r1.relayed', 1), 'R1'), true);
  for (const [p, v] of [['r2.b3', clone(FIXED)], ['r2.sealed', clone(FIXED)], ['r2.sealed', {}], ['r2.sealed', undefined], ['r2.relayed', 0], ['r2.relayed', undefined], ['r2.b3.asks', 99]]) breaks('R2', p, v);
  assert.equal(held(set(set(good(), 'r2.b3', clone(FIXED)), 'r2.sealed', clone(FIXED)), 'R2'), false, 'equal, but B3 held: not the failure it was');
  assert.equal(held(set(set(good(), 'r2.b3', {}), 'r2.sealed', {}), 'R2'), false);
});

test('R3, R4, R5, R6 fail on each thing their rules name', () => {
  for (const [p, v] of [['r3.desk.adopted', 0], ['r3.desk.relayed', 0], ['r3.desk.relayed', null], ['r3.stayA.shared', false], ['r3.stayADoor', 'recognised'], ['r3.stayADoor', 'sender'], ['r3.stayADoor', undefined], ['r3.stayB.shared', false], ['r3.stayB', undefined], ['r3.stayBDoor', 'passed'], ['r3.stayBDoor', undefined]]) breaks('R3', p, v);
  const g = good();
  for (const [p, v] of [['r4.results', g.r4.results.slice(1)], ['r4.results', [...g.r4.results.slice(1), g.r4.results[0]]], ['r4.results.4.exit', 1], ['r4.results.8.exit', null], ['r4.results.2.phase', 'phase3b'], ['r4.nodeSha', ''], ['r4.nodeSha', 'b'.repeat(64)], ['r4.nodeShaNow', undefined], ['r4.commit', 'c'.repeat(39)], ['r4.commit', 5]]) breaks('R4', p, v);
  assert.equal(held(set(set(g, 'r4.nodeSha', ''), 'r4.nodeShaNow', ''), 'R4'), false);
  assert.equal(held(set(g, 'r4.results', [...g.r4.results.slice(0, 8), 5]), 'R4'), false);
  for (const [p, v] of [['r5.relayOn.adopted', 0], ['r5.relayOn.recognised', 1], ['r5.relayOff.shared', true], ['r5.relayOff.shared', undefined], ['r5.relayOff.recognised', true], ['r5.relayOff.recognised', undefined]]) breaks('R5', p, v);
  assert.equal(held(set(g, 'r5.relayOn.adopted', 1), 'R5'), true);
  for (const [p, v] of [['r6.page', ['wordx']], ['r6.page', null], ['r6.modules', { 'core/phase7b/a.mjs': [] }], ['r6.modules', { 'core/phase7b/a.mjs': ['wordx'], 'core/phase7b/b.mjs': [] }], ['r6.modules', { 'core/phase7b/a.mjs': [], 'core/phase7b/b.mjs': 'none' }],
    ['r6.privacy', { 'core/receipts/phase7b.json': [] }], ['r6.privacy', { 'core/phase7/index.html': [] }], ['r6.privacy', { ...g.r6.privacy, 'core/phase7b/local/r5.json': ['an email address'] }], ['r6.privacy', { ...g.r6.privacy, 'core/phase7b/local/r5.json': null }]]) breaks('R6', p, v);
  assert.equal(verdict(set(g, 'r6.modules', { 'core/phase7b/a.mjs': ['wordx'], 'core/phase7b/b.mjs': [] }), 'R6').measured, '2 modules and the page read: barred words in core/phase7b/a.mjs; 2 published files read for the client\'s guests: none');
});

test('a claim with no facts is not measured; junk is never a verdict', () => {
  const j = judge(CLAIMS, {});
  assert.deepEqual([j.held, j.failed, j.open], [0, 0, 6]);
  assert.ok(j.verdicts.every((v) => v.held === null && v.measured === 'not measured yet'));
  for (const x of [null, 5, 'facts', []]) assert.equal(judge(CLAIMS, x).open, 6);
  for (const x of [null, 5, {}, { claims: 'x' }]) assert.deepEqual(judge(x, good()), { verdicts: [], held: 0, failed: 0, open: 0 });
  const odd = judge({ claims: [{ id: 'X9', pass: 9 }, 5, { id: 7 }, { id: 'toString', pass: 1 }, { id: 'r1', pass: 1 }] }, good());
  assert.deepEqual(odd.verdicts.map((v) => [v.id, v.held]), [['X9', null], ['', null], ['toString', null], ['r1', null]]);
  for (const k of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) { assert.equal(held({ ...good(), [k]: [] }, k.toUpperCase()), null, k); assert.equal(held({ ...good(), [k]: {} }, k.toUpperCase()), false, k); }
});

test('the boundaries the gate found untested', () => {
  const one = { genesisIsEstate: true };
  assert.equal(held(set(set(good(), 'r2.b3', one), 'r2.sealed', one), 'R2'), true, 'one field, equal, and B3 fails on it: the rule holds');
  breaks('R3', 'r3.desk.adopted', 1.5);
  breaks('R1', 'r1.relayed', 1.5);
});
