import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, HONEST } from './judge.mjs';

const IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'];
const C = { claims: IDS.map((id, i) => ({ id, pass: 1 + (i % 4) })) };
const merged = () => ({ admitted: true, replayed: true, from: true, sent: 20, added: 19, skipped: 1, refused: [] });
const spec = (gain) => ({ skill: 's', kind: 'candidate', gain, units: Math.round(gain * 1000), released: true, valued: true });
function good() {
  return {
    c1: { processes: 4, messages: 80, nonLight: 0, nodes: { site: { release: true, valuesBy: 14, onLiar: 0 }, breakit: { release: true, valuesBy: 1, onLiar: 0 }, konomi: { release: true, valuesBy: 10, onLiar: 0 }, liar: { release: true, valuesBy: 0, onLiar: 0 } } },
    c2: { merged: { site: merged(), breakit: merged(), konomi: merged() }, values: 42, routing: 38, checked: 38, valuesJobs: true },
    c3: { entries: 52, head: 'h', replayed: true, sameHead: true, sameCredits: true, vault: true, booksSha: 's', lightBytes: 10, jsonBytes: 20 },
    c4: { specialists: [spec(0.625455), spec(0.7), spec(0.2159), spec(0.6908)], expected: 4, planted: { units: 626, ok: false, why: 'its gate did not pass' } },
    c5: { pool: 1000000, total: 1000000, sandbox: true, contributors: 4, sameParts: true, sameCredits: true, linesSum: 4, valuesWeighed: 42, values: 42, early: 35, parts: { a: 1 } },
    c6: { switchEntries: 0, switchOff: true, live: { ok: false, why: 'the switch is off: no allocation is live' }, names: ['allocate'], moneyNames: [], words: Array.from({ length: 16 }, (_, i) => 'w' + i) },
    c7: { recorded: true, liveEqualsSandbox: true, nodeSwitch: { ok: false, why: 'only an activator' }, second: { ok: false }, booksStillOff: true },
    c8: { squatted: true, booksEntries: 52, added: 50, skipped: 1, refused: [{ n: 3, type: 'release', asset: 'node:x', why: 'released already' }], switched: true, pool: 1000000, total: 1000000, booksContributors: 4, booksContributorsCovered: 4, networkContributors: 3, networkContributorsCovered: 3, replaySame: true },
    c9: { cases: 20000, throws: 0 },
    c10: { page: [], modules: { 'core/economy.mjs': [] }, says: ['not money', 'the switch is off', 'contribution unit'] },
    c11: { where: 'the page', head: 'h', sameCredits: true, parts: { a: 1 } },
  };
}
const v = (f, id) => judge(C, f).verdicts.find((x) => x.id === id);
function put(f, path, value) { const ks = path.split('.'); let o = f; for (const k of ks.slice(0, -1)) o = o[k]; if (value === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = value; return f; }
function eachFails(id, flips) {
  assert.equal(v(good(), id).held, true, id + ' holds on the good facts');
  for (const [p, val] of flips) assert.equal(v(put(good(), p, val), id).held, false, id + ': ' + p + ' = ' + JSON.stringify(val));
}

test('the honest nodes', () => { assert.deepEqual(HONEST, ['site', 'breakit', 'konomi']); assert.equal(Object.isFrozen(HONEST), true); });

test('judge: every claim held on the good facts, in the sealed order; nothing guessed', () => {
  const j = judge(C, good());
  assert.deepEqual(j.verdicts.map((x) => [x.id, x.held, x.pass]), IDS.map((id, i) => [id, true, 1 + (i % 4)]));
  assert.deepEqual([j.held, j.failed, j.open], [11, 0, 0]);
  const none = judge(C, {});
  assert.deepEqual([none.held, none.failed, none.open], [0, 0, 11]);
  assert.deepEqual(none.verdicts[0], { id: 'C1', pass: 1, held: null, measured: 'not measured yet' });
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.equal(judge({ claims: [{ id: 'X' }, null, { id: 'toString' }] }, good()).verdicts.every((x) => x.held === null), true);
  const g = good(); delete g.c3;
  assert.equal(v(g, 'C11').held, null, 'C11 needs the receipt\'s own head');
  assert.equal(v(good(), 'C11').held, true);
});

test('C1: every honest node records its own work; nobody values the dishonest peer', () => {
  eachFails('C1', [['c1.processes', 3], ['c1.nodes.site.release', false], ['c1.nodes.breakit.valuesBy', 0], ['c1.nodes.konomi', undefined], ['c1.nodes.liar.onLiar', 1], ['c1.nodes.site.onLiar', 2], ['c1.nodes.liar', undefined], ['c1.messages', 0], ['c1.nonLight', 1], ['c1.nodes.site.onLiar', 'x']]);
  assert.equal(v(put(good(), 'c1.nodes.liar.valuesBy', 3), 'C1').held, true, 'the peer\'s own values are not the claim');
  assert.match(v(good(), 'C1').measured, /^4 processes; site its release and 14 values it measured; breakit its release and 1 values it measured; konomi its release and 10 values it measured; values on the dishonest peer anywhere: 0; 80 messages, 0 not LIGHT$/);
  assert.match(v(put(put(good(), 'c1.nodes.site.release', false), 'c1.nodes.konomi', 7), 'C1').measured, /site NO release.*konomi no ledger/);
});

test('C2: each ledger merged once, nothing refused, every value re-checked', () => {
  eachFails('C2', [['c2.merged.site.admitted', false], ['c2.merged.breakit.replayed', false], ['c2.merged.konomi.from', false], ['c2.merged.site.sent', 0], ['c2.merged.site.added', 18], ['c2.merged.site.skipped', 2], ['c2.merged.breakit.refused', [{ n: 1 }]], ['c2.merged.konomi.refused', undefined], ['c2.routing', 0], ['c2.checked', 37], ['c2.valuesJobs', false], ['c2.merged.konomi', undefined]]);
  assert.match(v(good(), 'C2').measured, /^site: 20 sent, 19 added, 1 already held, 0 refused; breakit: .*; 38 routing values in the books, 38 re-checked against their answer packets$/);
  assert.match(v(put(put(good(), 'c2.merged.site.admitted', false), 'c2.merged.site.why', 'nope'), 'C2').measured, /\(NOT admitted: nope\)/);
});

test('C3, C4, C9', () => {
  eachFails('C3', [['c3.replayed', false], ['c3.sameHead', false], ['c3.sameCredits', false], ['c3.vault', false], ['c3.entries', 0], ['c3.booksSha', 5]]);
  assert.match(v(good(), 'C3').measured, /^52 entries replayed from nothing: the same head, the same credits; the LIGHT vault \(10 bytes for 20\) reads back the log byte for byte; CI rebuilds both files byte for byte$/);
  assert.match(v(put(put(put(good(), 'c3.sameHead', false), 'c3.sameCredits', false), 'c3.vault', false), 'C3').measured, /a DIFFERENT head, DIFFERENT credits; .* does NOT read back/);
  eachFails('C4', [['c4.expected', 3], ['c4.specialists', [spec(0.5)]], ['c4.specialists.0.valued', false], ['c4.specialists.1.released', false], ['c4.specialists.2.units', 217], ['c4.specialists.3.gain', 'x'], ['c4.planted.ok', true], ['c4.planted.units', 0]]);
  assert.equal(v(put(good(), 'c4.specialists.0', { ...spec(1.2), units: 1000 }), 'C4').held, true, 'a gain over 1 is held to 1000 units');
  assert.equal(v(put(good(), 'c4.specialists.0', { ...spec(-0.2), units: 0 }), 'C4').held, true, 'and under 0 to 0');
  assert.match(v(good(), 'C4').measured, /^s \(candidate\) 625 units for a gain of 0.625455; .*; the planted value of 626 units refused: its gate did not pass$/);
  assert.match(v(put(put(good(), 'c4.planted.ok', true), 'c4.specialists.0.valued', false), 'C4').measured, /NOT valued.*RECORDED$/);
  eachFails('C9', [['c9.cases', 19999], ['c9.throws', 1]]);
  assert.equal(v(good(), 'C9').measured, '20000 garbage inputs through every function core/economy.mjs exports: 0 throws');
});

test('C5: the sandbox allocation, exact', () => {
  eachFails('C5', [['c5.pool', 0], ['c5.total', 999999], ['c5.sandbox', false], ['c5.sameParts', false], ['c5.sameCredits', false], ['c5.contributors', 0], ['c5.linesSum', 3], ['c5.values', 0], ['c5.valuesWeighed', 41]]);
  assert.match(v(good(), 'C5').measured, /^a pool of 1000000 shared among 4 contributors: 1000000 given, every part equal to the second computation, the same credits; 4 contributors' lines sum to their credit; 42 of 42 values weighed as sealed \(35 early\)$/);
  assert.match(v(put(put(good(), 'c5.sameParts', false), 'c5.sameCredits', false), 'C5').measured, /parts NOT equal to the second computation, DIFFERENT credits/);
});

test('C6, C7: the switch off, and the fork path', () => {
  eachFails('C6', [['c6.switchEntries', 1], ['c6.switchOff', false], ['c6.live', { ok: true }], ['c6.live', { ok: false, why: 'something else' }], ['c6.moneyNames', ['payOut']], ['c6.moneyNames', 'x'], ['c6.names', []], ['c6.words', ['a']]]);
  assert.match(v(good(), 'C6').measured, /^0 switch entries; a live allocation: refused \(the switch is off: no allocation is live\); exported names that are a money verb or make a switch: none \(of 1, against 16 sealed words\)$/);
  assert.match(v(put(put(good(), 'c6.live', { ok: true }), 'c6.moneyNames', ['payOut']), 'C6').measured, /GIVEN; .*: payOut/);
  eachFails('C7', [['c7.recorded', false], ['c7.liveEqualsSandbox', false], ['c7.nodeSwitch', { ok: true }], ['c7.second', { ok: true }], ['c7.booksStillOff', false]]);
  assert.match(v(good(), 'C7').measured, /^the activator's fork switch recorded; the live allocation equals the sandbox one; a node's switch refused \(only an activator\); a second switch refused; the books still off$/);
  assert.match(v(put(put(put(put(put(good(), 'c7.recorded', false), 'c7.liveEqualsSandbox', false), 'c7.nodeSwitch', { ok: true }), 'c7.second', { ok: true }), 'c7.booksStillOff', false), 'C7').measured, /NOT recorded; .*does NOT equal.*RECORDED; a second switch RECORDED; the books SWITCHED$/);
});

test('C8: the network path counts nothing twice', () => {
  eachFails('C8', [['c8.squatted', false], ['c8.booksEntries', 0], ['c8.added', 49], ['c8.refused', []], ['c8.refused', [{ n: 3, type: 'release', why: 'x' }, { n: 4, type: 'value', why: 'y' }]], ['c8.refused', [{ n: 3, type: 'value', why: 'x' }]], ['c8.refused', [{ n: 3, type: 'release', why: '' }]], ['c8.refused', [7]],
    ['c8.switched', false], ['c8.pool', 0], ['c8.total', 1], ['c8.booksContributors', 0], ['c8.booksContributorsCovered', 3], ['c8.networkContributors', 0], ['c8.networkContributorsCovered', 2], ['c8.replaySame', false]]);
  assert.match(v(good(), 'C8').measured, /^52 entries of the books: 50 added, 1 already held, 1 refused \(release node:x: released already\); the network switch recorded, 1000000 of 1000000 given, covering 4 of the books' 4 contributors and 3 of the network's 3; the merged log replayed: the same allocation$/);
  const many = put(good(), 'c8.refused', [1, 2, 3, 4].map((n) => ({ n, type: 'value', asset: 'a', why: 'w' + n })));
  assert.match(v(many, 'C8').measured, /value a: w1; value a: w2; value a: w3; …\)/);
  assert.match(v(put(put(good(), 'c8.switched', false), 'c8.replaySame', false), 'C8').measured, /NOT recorded.*NOT the same$/);
});

test('every lower bound is a bound: each claim holds with its counts at exactly the least it allows', () => {
  const f = good();
  for (const r of ['site', 'breakit', 'konomi']) f.c1.nodes[r].valuesBy = 1;
  f.c1.messages = 1;
  for (const r of ['site', 'breakit', 'konomi']) f.c2.merged[r] = { ...merged(), sent: 1, added: 1, skipped: 0 };
  f.c2.routing = 1; f.c2.checked = 1;
  f.c3.entries = 1;
  f.c4.planted.units = 1;
  Object.assign(f.c5, { pool: 1, total: 1, contributors: 1, linesSum: 1, values: 1, valuesWeighed: 1 });
  Object.assign(f.c8, { booksEntries: 1, added: 0, skipped: 0, pool: 1, total: 1, booksContributors: 1, booksContributorsCovered: 1, networkContributors: 1, networkContributorsCovered: 1 });
  const j = judge(C, f);
  assert.deepEqual(j.verdicts.filter((x) => x.held !== true).map((x) => x.id), []);
  assert.equal(v(put(good(), 'c5.pool', 1.5), 'C5').held, false, 'a pool is a whole number');
  assert.equal(v(put(put(good(), 'c5.pool', 1.5), 'c5.total', 1.5), 'C5').held, false, 'and so is what was given');
  const three = put(good(), 'c8.refused', [1, 2, 3].map((n) => ({ n, type: 'value', asset: 'a', why: 'w' + n })));
  assert.match(v(three, 'C8').measured, /value a: w3\); the network switch/, 'three refusals are all named, with nothing after');
});

test('C10, C11: the page', () => {
  eachFails('C10', [['c10.page', ['buy']], ['c10.page', 'x'], ['c10.modules', {}], ['c10.modules', { a: ['earn'] }], ['c10.modules', { a: 'x' }], ['c10.says', ['not money', 'the switch is off']], ['c10.says', 'x']]);
  assert.equal(v(good(), 'C10').measured, 'barred words on the page: none; in 1 modules: none; the page says "not money", "the switch is off", "contribution unit"');
  assert.match(v(put(put(put(good(), 'c10.page', ['buy']), 'c10.modules', { m: ['earn'] }), 'c10.says', []), 'C10').measured, /page: buy; in 1 modules: m \(earn\); the page says none of the three$/);
  eachFails('C11', [['c11.head', 'x'], ['c11.head', 5], ['c11.sameCredits', false], ['c11.parts', { a: 2 }], ['c11.parts', 'x'], ['c5.parts', 'x']]);
  assert.equal(v(good(), 'C11').measured, 'in a real tab of the page: the books replayed to the receipt\'s head, the same credits, the same sandbox parts');
  assert.equal(v(put(put(put(put(good(), 'c11.head', 'x'), 'c11.sameCredits', false), 'c11.parts', { a: 2 }), 'c11.where', undefined), 'C11').measured, 'in a real tab: the books replayed to a DIFFERENT head, DIFFERENT credits, DIFFERENT parts');
});
