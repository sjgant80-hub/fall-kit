import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, BOOKS, BOOKS_CONTRIBUTORS, NETWORK_CONTRIBUTORS, FUZZ, C8_REFUSED } from './judge.mjs';

const CLAIMS = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const IDS = CLAIMS.attacks.map((a) => a.id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const PARTS = { aa: 600, bb: 400 };
function good() {
  return {
    n1: { attacks: IDS.map((id, i) => ({ id, asset: 'node:x' + i, ok: false, why: 'refused: node:x' + i + ' is not yours' })), books: { entries: 52, bound: 52 }, network: { entries: 7, bound: 7 }, pairs: { total: 100, right: 100 }, fuzz: { cases: 10000, throws: 0, shaped: 10000 } },
    n2: { atDoor: IDS.map((id) => ({ id, ok: false, why: 'no' })), own: [0, 1, 2].map(() => ({ released: true, valued: true })), unbound: 0 },
    n3: { merged: true, booksEntries: 52, added: 51, skipped: 1, refused: [], genesisOnly: true, siteRelease: true, siteValues: { books: 10, merged: 10 } },
    n4: { switched: true, pool: 1000, total: 1000, parts: PARTS, booksContributors: 4, booksContributorsCovered: 4, siteCovered: true, networkContributors: 3, networkContributorsCovered: 3, replayed: true, replayWhy: null, replaySame: true },
    n5: { squatted: true, refused: true, recorded: 0, unbound: [{ asset: 'node:s' }, { asset: 'network:node-1' }], expected: ['node:s', 'network:node-1'], siteNamed: true, unchanged: true },
    n6: { control: { refused: Array.from({ length: 11 }, (_, n) => ({ n })), booksContributorsCovered: 3, booksContributors: 4 }, sealed: { refused: Array.from({ length: 11 }, (_, n) => ({ n })), booksContributorsCovered: 3, booksContributors: 4 } },
    n7: { exit: 0, last: 'the receipt and the books reproduced byte for byte' },
    n8: { where: 'a tab', refused: 0, booksEntries: 52, added: 51, skipped: 1, parts: { ...PARTS }, unboundRefused: true, siteNamed: true, seconds: 1.5 },
    n9: { files: { 'core/names.mjs': [], 'core/phase6b/net.mjs': [] }, page: [] },
  };
}
const verdict = (facts, id, claims = CLAIMS) => judge(claims, facts).verdicts.find((v) => v.id === id);
const held = (facts, id, claims) => verdict(facts, id, claims).held;
function set(facts, path, value) { const f = clone(facts), ks = path.split('.'); let o = f; for (const k of ks.slice(0, -1)) o = o[k]; if (value === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = value; return f; }
const breaks = (id, path, value) => assert.equal(held(set(good(), path, value), id), false, id + ' should fail when ' + path + ' = ' + JSON.stringify(value));

test('the sealed numbers', () => {
  assert.deepEqual([BOOKS, BOOKS_CONTRIBUTORS, NETWORK_CONTRIBUTORS, FUZZ, C8_REFUSED], [52, 4, 3, 10000, 11]);
  assert.equal(IDS.length, 9);
});

test('every claim holds on good facts, and says what it measured', () => {
  const j = judge(CLAIMS, good());
  assert.deepEqual(j.verdicts.map((v) => [v.id, v.pass, v.held]), [['N1', 1, true], ['N2', 2, true], ['N3', 2, true], ['N4', 2, true], ['N5', 3, true], ['N6', 3, true], ['N7', 3, true], ['N8', 4, true], ['N9', 4, true]]);
  assert.deepEqual([j.held, j.failed, j.open], [9, 0, 0]);
  const m = Object.fromEntries(j.verdicts.map((v) => [v.id, v.measured]));
  assert.equal(m.N1, '9 of 9 sealed attacks refused, each naming its asset; 52 of the books\' 52 entries and 7 of the bound network\'s 7 pass the rule; 100 of 100 key and name pairs judged right (a name passes for its own key only); 10000 fuzzed values, 0 throws, 10000 answered ok true, or false with a reason');
  assert.equal(m.N2, '9 of 9 attacks refused at the network\'s own door; 3 of its 3 contributors released under their own names, 3 valued; releases in it that break the rule: 0');
  assert.equal(m.N3, '52 entries of the books: 51 added, 1 already held (the genesis), 0 refused; the living site\'s release recorded under its own key, 10 of the 10 values on its asset recorded');
  assert.equal(m.N4, 'the network switch recorded, 1000 of 1000 given, covering 4 of the books\' 4 contributors (the living site among them) and 3 of the network\'s 3; the merged log replayed through the rule: the same allocation');
  assert.equal(m.N5, 'Phase 6\'s mock network holding the squat: the merge refused, 0 entries recorded; it named 2 releases that break the rule (node:s, network:node-1), every one a second count finds; the site\'s name under another key named; the target unchanged');
  assert.equal(m.N6, 'Phase 6\'s network path without the rule: 11 refused, the books\' contributors covered 3 of 4; field for field the c8 facts of Phase 6\'s receipt');
  assert.equal(m.N7, 'node core/phase6/measure.mjs --check exited 0: the receipt and the books reproduced byte for byte');
  assert.equal(m.N8, 'in a tab at a tab: 52 entries, 51 added, 1 already held, 0 refused; the allocation part for part this receipt\'s; Phase 6\'s mock refused, naming the site\'s name, in 1.5 s');
  assert.equal(m.N9, '2 modules read, 0 with a barred word; the page text: none');
});

test('the other branch of every measured line', () => {
  const f = good();
  f.n3 = { ...f.n3, genesisOnly: false, siteRelease: false };
  f.n4 = { ...f.n4, switched: false, siteCovered: false, replaySame: false };
  f.n5 = { ...f.n5, squatted: false, refused: false, siteNamed: false, unchanged: false, expected: ['node:s'] };
  f.n6 = { ...f.n6, sealed: {} };
  f.n7 = { exit: null, last: 7 };
  f.n8 = { ...f.n8, parts: { aa: 1 }, unboundRefused: false, siteNamed: false, seconds: 'x', where: 5 };
  f.n9 = { files: { 'core/names.mjs': ['wordx', 'wordy'], 'core/phase6b/a.mjs': 'z', 'core/phase6b/b.mjs': [] }, page: ['wordz', 'wordw'] };
  const m = Object.fromEntries(judge(CLAIMS, f).verdicts.map((v) => [v.id, v.measured]));
  assert.equal(m.N3, '52 entries of the books: 51 added, 1 already held (NOT only the genesis), 0 refused; the living site\'s release NOT recorded, 10 of the 10 values on its asset recorded');
  assert.equal(m.N4, 'the network switch NOT recorded, 1000 of 1000 given, covering 4 of the books\' 4 contributors (the living site NOT among them) and 3 of the network\'s 3; the merged log replayed through the rule: a DIFFERENT allocation');
  assert.equal(m.N5, 'Phase 6\'s mock network NOT holding the squat: the merge NOT refused, 0 entries recorded; it named 2 releases that break the rule (node:s, network:node-1), NOT the 1 a second count finds; the site\'s name under another key NOT named; the target CHANGED');
  assert.equal(m.N6, 'Phase 6\'s network path without the rule: 11 refused, the books\' contributors covered 3 of 4; NOT the c8 facts of Phase 6\'s receipt');
  assert.equal(m.N7, 'node core/phase6/measure.mjs --check exited without a code: ');
  assert.equal(m.N8, 'in a tab at : 52 entries, 51 added, 1 already held, 0 refused; the allocation NOT this receipt\'s; Phase 6\'s mock NOT refused, NOT naming the site\'s name');
  assert.equal(m.N9, '3 modules read, 2 with a barred word (core/names.mjs: wordx wordy; core/phase6b/a.mjs: ); the page text: wordz wordw');
  const g = good();
  g.n3 = { ...g.n3, merged: false, why: 'it was refused' };
  g.n4 = { ...g.n4, replayed: false, replayWhy: 'entry 3' };
  g.n7 = { exit: 1, last: 'differs' };
  const k = Object.fromEntries(judge(CLAIMS, g).verdicts.map((v) => [v.id, v.measured]));
  assert.equal(k.N3, 'the merge was refused: it was refused');
  assert.match(k.N4, /replayed through the rule: REFUSED, entry 3$/);
  assert.equal(k.N7, 'node core/phase6/measure.mjs --check exited 1: differs');
});

test('N1 fails on each thing its rule names', () => {
  const g = good();
  assert.equal(held(set(g, 'n1.attacks', g.n1.attacks.slice(1)), 'N1'), false);
  assert.equal(held(set(g, 'n1.attacks', [g.n1.attacks[1], g.n1.attacks[0], ...g.n1.attacks.slice(2)]), 'N1'), false);
  assert.equal(held(set(g, 'n1.attacks', [...g.n1.attacks, { ...g.n1.attacks[0] }]), 'N1'), false);
  breaks('N1', 'n1.attacks.0.ok', true);
  breaks('N1', 'n1.attacks.0.ok', undefined);
  breaks('N1', 'n1.attacks.0.asset', '');
  breaks('N1', 'n1.attacks.0.asset', 5);
  breaks('N1', 'n1.attacks.0.why', 'refused, naming nothing');
  breaks('N1', 'n1.attacks.0.why', undefined);
  breaks('N1', 'n1.books.entries', 0);
  breaks('N1', 'n1.books.bound', 51);
  breaks('N1', 'n1.network.entries', 0);
  breaks('N1', 'n1.network.bound', 6);
  breaks('N1', 'n1.pairs.total', 0);
  breaks('N1', 'n1.pairs.right', 99);
  breaks('N1', 'n1.fuzz.cases', 9999);
  breaks('N1', 'n1.fuzz.throws', 1);
  breaks('N1', 'n1.fuzz.throws', undefined);
  breaks('N1', 'n1.fuzz.shaped', 9999);
  let f = set(set(g, 'n1.books.entries', 0), 'n1.books.bound', 0);
  assert.equal(held(f, 'N1'), false);
  f = set(set(set(set(g, 'n1.network.entries', 0), 'n1.network.bound', 0), 'n1.pairs.total', 0), 'n1.pairs.right', 0);
  assert.equal(held(f, 'N1'), false);
  assert.equal(held(set(set(g, 'n1.pairs.total', 0), 'n1.pairs.right', 0), 'N1'), false);
  assert.equal(held(set(set(g, 'n1.network.entries', 0), 'n1.network.bound', 0), 'N1'), false);
  const none = { ...CLAIMS, attacks: [] };
  assert.equal(held(set(g, 'n1.attacks', []), 'N1', none), false);
  assert.equal(held(set(g, 'n2.atDoor', []), 'N2', none), false);
  assert.equal(held(g, 'N1', { ...CLAIMS, attacks: 'a1' }), false);
  assert.equal(held(g, 'N1', { ...CLAIMS, attacks: [...CLAIMS.attacks.slice(0, 8), 5] }), false);
  assert.equal(held(set(g, 'n1.attacks', [...g.n1.attacks.slice(0, 8), 5]), 'N1'), false);
});

test('N2 fails on each thing its rule names', () => {
  const g = good();
  assert.equal(held(set(g, 'n2.atDoor', g.n2.atDoor.slice(1)), 'N2'), false);
  assert.equal(held(set(g, 'n2.atDoor', [g.n2.atDoor[1], g.n2.atDoor[0], ...g.n2.atDoor.slice(2)]), 'N2'), false);
  breaks('N2', 'n2.atDoor.3.ok', true);
  breaks('N2', 'n2.atDoor.3.ok', undefined);
  assert.equal(held(set(g, 'n2.own', g.n2.own.slice(1)), 'N2'), false);
  assert.equal(held(set(g, 'n2.own', [...g.n2.own, { released: true, valued: true }]), 'N2'), false);
  assert.equal(held(set(g, 'n2.own', [...g.n2.own.slice(1), 5]), 'N2'), false);
  breaks('N2', 'n2.own.1.released', false);
  breaks('N2', 'n2.own.2.valued', 'yes');
  breaks('N2', 'n2.unbound', 1);
  breaks('N2', 'n2.unbound', undefined);
  assert.equal(verdict(set(g, 'n2.own', [{ released: true, valued: false }, { released: false, valued: true }, { released: true, valued: true }]), 'N2').measured, '9 of 9 attacks refused at the network\'s own door; 2 of its 3 contributors released under their own names, 2 valued; releases in it that break the rule: 0');
});

test('N3 fails on each thing its rule names', () => {
  breaks('N3', 'n3.merged', 'true');
  breaks('N3', 'n3.booksEntries', 51);
  breaks('N3', 'n3.booksEntries', 53);
  breaks('N3', 'n3.added', 50);
  breaks('N3', 'n3.skipped', 2);
  breaks('N3', 'n3.refused', [{ n: 3 }]);
  breaks('N3', 'n3.genesisOnly', 1);
  breaks('N3', 'n3.siteRelease', 1);
  breaks('N3', 'n3.siteValues.books', 0);
  breaks('N3', 'n3.siteValues.merged', 9);
  breaks('N3', 'n3.siteValues', undefined);
  assert.equal(held(set(set(set(good(), 'n3.booksEntries', 51), 'n3.added', 50), 'n3.skipped', 1), 'N3'), false);
  assert.equal(held(set(set(good(), 'n3.siteValues.books', 0), 'n3.siteValues.merged', 0), 'N3'), false);
  assert.equal(held(set(good(), 'n3.refused', 'none'), 'N3'), true);
});

test('N4 fails on each thing its rule names', () => {
  breaks('N4', 'n4.switched', 'yes');
  breaks('N4', 'n4.pool', 999);
  breaks('N4', 'n4.total', 999);
  breaks('N4', 'n4.booksContributors', 5);
  breaks('N4', 'n4.booksContributorsCovered', 3);
  breaks('N4', 'n4.siteCovered', 1);
  breaks('N4', 'n4.networkContributors', 4);
  breaks('N4', 'n4.networkContributorsCovered', 2);
  breaks('N4', 'n4.replayed', 1);
  breaks('N4', 'n4.replaySame', 1);
  assert.equal(held(set(set(good(), 'n4.pool', 0), 'n4.total', 0), 'N4'), false);
  assert.equal(held(set(set(good(), 'n4.booksContributors', 3), 'n4.booksContributorsCovered', 3), 'N4'), false);
  assert.equal(held(set(set(good(), 'n4.networkContributors', 2), 'n4.networkContributorsCovered', 2), 'N4'), false);
});

test('N5 fails on each thing its rule names', () => {
  breaks('N5', 'n5.squatted', 1);
  breaks('N5', 'n5.refused', 1);
  breaks('N5', 'n5.recorded', 1);
  breaks('N5', 'n5.recorded', undefined);
  breaks('N5', 'n5.expected', ['network:node-1', 'node:s']);
  breaks('N5', 'n5.expected', ['node:s']);
  breaks('N5', 'n5.unbound', [{ asset: 'node:s' }]);
  breaks('N5', 'n5.siteNamed', 1);
  breaks('N5', 'n5.unchanged', 1);
  assert.equal(held(set(set(good(), 'n5.expected', []), 'n5.unbound', []), 'N5'), false);
  assert.equal(held(set(good(), 'n5.unbound', [{ asset: 'node:s' }, 5, { asset: 'network:node-1' }]), 'N5'), true);
});

test('N6 fails unless the control is Phase 6\'s c8, field for field, with its eleven refusals', () => {
  const g = good();
  breaks('N6', 'n6.control.booksContributorsCovered', 4);
  breaks('N6', 'n6.control.refused', g.n6.control.refused.slice(1));
  breaks('N6', 'n6.control.extra', 1);
  breaks('N6', 'n6.sealed', {});
  assert.equal(held(set(set(g, 'n6.sealed', {}), 'n6.control', {}), 'N6'), false);
  assert.equal(held(set(set(g, 'n6.sealed.refused', g.n6.sealed.refused.slice(1)), 'n6.control.refused', g.n6.sealed.refused.slice(1)), 'N6'), false);
  assert.equal(held(set(set(g, 'n6.sealed.booksContributorsCovered', 4), 'n6.control.booksContributorsCovered', 4), 'N6'), false);
  assert.equal(held(set(set(g, 'n6.sealed.booksContributorsCovered', 5), 'n6.control.booksContributorsCovered', 5), 'N6'), false);
});

test('N7 holds on exit 0 only', () => {
  breaks('N7', 'n7.exit', 1);
  breaks('N7', 'n7.exit', '0');
  breaks('N7', 'n7.exit', undefined);
});

test('N8 fails on each thing its rule names, and waits for N4\'s facts', () => {
  breaks('N8', 'n8.refused', 1);
  breaks('N8', 'n8.refused', undefined);
  breaks('N8', 'n8.booksEntries', 51);
  breaks('N8', 'n8.added', 50);
  breaks('N8', 'n8.parts', 'parts');
  breaks('N8', 'n8.parts', { aa: 600, bb: 401 });
  breaks('N8', 'n8.unboundRefused', 1);
  breaks('N8', 'n8.siteNamed', 1);
  assert.equal(held(set(set(good(), 'n8.parts', {}), 'n4.parts', {}), 'N8'), false);
  assert.equal(held(set(set(set(good(), 'n8.booksEntries', 51), 'n8.added', 50), 'n8.skipped', 1), 'N8'), false);
  assert.equal(held(set(good(), 'n4', undefined), 'N8'), null);
  assert.equal(verdict(set(good(), 'n4', undefined), 'N8').measured, 'not measured yet');
  assert.equal(held(set(good(), 'n8', undefined), 'N8'), null);
});

test('N9 fails on a barred word anywhere, or on fewer than the modules sealed', () => {
  breaks('N9', 'n9.files', { 'core/phase6b/net.mjs': [], 'core/phase6b/x.mjs': [] });
  breaks('N9', 'n9.files', { 'core/names.mjs': [] });
  breaks('N9', 'n9.files', { 'core/names.mjs': ['wordx'], 'core/phase6b/net.mjs': [] });
  breaks('N9', 'n9.page', ['wordx']);
  breaks('N9', 'n9.page', undefined);
  assert.equal(held(set(good(), 'n9.files', { 'core/names.mjs': [], 'core/phase6b/net.mjs': null }), 'N9'), false);
});

test('a count that is not a whole number, or below zero, never adds up to a pass', () => {
  for (const [added, skipped] of [[53, -1], [50.5, 1.5], [52, NaN], [51, '1'], [-1, 53]]) {
    assert.equal(held(set(set(good(), 'n3.added', added), 'n3.skipped', skipped), 'N3'), false, added + ' + ' + skipped);
    assert.equal(held(set(set(good(), 'n8.added', added), 'n8.skipped', skipped), 'N8'), false, added + ' + ' + skipped);
  }
  assert.equal(held(set(set(good(), 'n4.pool', 1.5), 'n4.total', 1.5), 'N4'), false);
  assert.equal(held(set(set(good(), 'n6.control.booksContributorsCovered', -3), 'n6.sealed.booksContributorsCovered', -3), 'N6'), false);
  assert.equal(held(set(set(good(), 'n1.books.entries', 2.5), 'n1.books.bound', 2.5), 'N1'), false);
  assert.equal(verdict(set(good(), 'n2.unbound', 'none'), 'N2').measured, '9 of 9 attacks refused at the network\'s own door; 3 of its 3 contributors released under their own names, 3 valued; releases in it that break the rule: NaN');
});

test('one is enough where a rule asks for at least one', () => {
  const one = { ...CLAIMS, attacks: [CLAIMS.attacks[0]] }, g = good();
  const f = set(set(g, 'n1.attacks', g.n1.attacks.slice(0, 1)), 'n2.atDoor', g.n2.atDoor.slice(0, 1));
  assert.equal(held(f, 'N1', one), true);
  assert.equal(held(f, 'N2', one), true);
  for (const [k, a, b] of [['n1.books', 'entries', 'bound'], ['n1.network', 'entries', 'bound'], ['n1.pairs', 'total', 'right'], ['n3.siteValues', 'books', 'merged'], ['n4', 'pool', 'total']]) assert.equal(held(set(set(good(), k + '.' + a, 1), k + '.' + b, 1), k.slice(0, 2).toUpperCase()), true, k);
  assert.equal(held(set(set(good(), 'n5.expected', ['node:s']), 'n5.unbound', [{ asset: 'node:s' }]), 'N5'), true);
  assert.equal(held(set(set(good(), 'n8.parts', { aa: 1000 }), 'n4.parts', { aa: 1000 }), 'N8'), true);
});

test('a claim with no facts is not measured; junk is never a verdict', () => {
  const j = judge(CLAIMS, {});
  assert.deepEqual(j.verdicts.map((v) => v.held), Array(9).fill(null));
  assert.deepEqual([j.held, j.failed, j.open], [0, 0, 9]);
  assert.ok(j.verdicts.every((v) => v.measured === 'not measured yet'));
  for (const x of [null, 5, 'facts', []]) assert.equal(judge(CLAIMS, x).open, 9);
  for (const x of [null, 5, {}, { claims: 'x' }]) assert.deepEqual(judge(x, good()), { verdicts: [], held: 0, failed: 0, open: 0 });
  const odd = judge({ claims: [{ id: 'N99', pass: 9 }, 5, { id: 7 }, { id: 'toString', pass: 1 }, { id: 'n1', pass: 1 }] }, good());
  assert.deepEqual(odd.verdicts, [{ id: 'N99', pass: 9, held: null, measured: 'not measured yet' }, { id: '', pass: undefined, held: null, measured: 'not measured yet' }, { id: 'toString', pass: 1, held: null, measured: 'not measured yet' }, { id: 'n1', pass: 1, held: null, measured: 'not measured yet' }]);
  for (const k of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n9']) assert.equal(held({ ...good(), [k]: [] }, k.toUpperCase()), null);
  const f = good(); f.n1 = { ...f.n1, books: 5, network: [], pairs: null, fuzz: 'x' };
  assert.equal(held(f, 'N1'), false);
  assert.equal(held({ ...good(), n6: { control: 5, sealed: 5 } }, 'N6'), false);
});
