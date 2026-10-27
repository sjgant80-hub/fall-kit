import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPM, creditsOf, partsOf, looUnits, barredIn, moneyNames } from './economy.mjs';
import * as L from './vendor/ledger/contrib.mjs';

const POLICY = { makerPpm: 100000, lineagePpm: 50000, earlyUntil: 3, earlyNum: 3, earlyDen: 2 };
const K = (c) => c.repeat(64);
const link = (n, entry) => ({ n, entry });

test('the constant', () => { assert.equal(PPM, 1000000n); });

test('creditsOf: maker, parents and owner of that moment, the early weight up to its position', () => {
  const A = K('a'), B = K('b'), C = K('c');
  const log = [
    link(0, { type: 'genesis' }),
    link(1, { type: 'release', asset: 'p', by: A, lineage: [] }),
    link(2, { type: 'release', asset: 'x', by: B, lineage: ['p'] }),
    link(3, { type: 'value', asset: 'x', units: 10 }),
    link(4, { type: 'give', asset: 'x', to: C }),
    link(5, { type: 'value', asset: 'x', units: 10 }),
    link(6, { type: 'value', asset: 'p', units: 1 }),
  ];
  const r = creditsOf(log, POLICY);
  assert.equal(r.ok, true);
  // n=3: 10×3=30 → maker B 3, parent A 1 (30×0.05=1.5→1), owner B 26. n=5: 10×2=20 → maker B 2, parent A 1, owner C 17. n=6: 1×2=2 → maker A 0, owner A 2
  assert.deepEqual(r.credits, { [B]: '31', [A]: '4', [C]: '17' });
  assert.equal(r.scale, 2);
  assert.deepEqual(r.lines, [
    { n: 3, asset: 'x', key: B, role: 'maker', credit: '3' }, { n: 3, asset: 'x', key: A, role: 'parent', credit: '1' }, { n: 3, asset: 'x', key: B, role: 'owner', credit: '26' },
    { n: 5, asset: 'x', key: B, role: 'maker', credit: '2' }, { n: 5, asset: 'x', key: A, role: 'parent', credit: '1' }, { n: 5, asset: 'x', key: C, role: 'owner', credit: '17' },
    { n: 6, asset: 'p', key: A, role: 'owner', credit: '2' },
  ]);
  const two = creditsOf([link(0, { type: 'release', asset: 'q', by: A, lineage: ['p', 'r'] }), link(1, { type: 'release', asset: 'p', by: B, lineage: [] }), link(2, { type: 'value', asset: 'q', units: 100 })], { ...POLICY, earlyUntil: 0 });
  assert.deepEqual(two.credits, { [A]: '190', [B]: '5' }, 'a parent the log never released takes nothing, and its part goes to no one (the ledger itself refuses such a release)');
});

test('creditsOf: refusals, never a throw', () => {
  assert.deepEqual(creditsOf([], null), { ok: false, why: 'not a policy' });
  assert.deepEqual(creditsOf([], { ...POLICY, earlyDen: 0 }), { ok: false, why: 'not a policy' });
  assert.deepEqual(creditsOf([], { ...POLICY, makerPpm: 600000, lineagePpm: 400001 }), { ok: false, why: 'not a policy' });
  assert.equal(creditsOf([], { ...POLICY, makerPpm: 600000, lineagePpm: 400000 }).ok, true, 'a million in all is allowed');
  assert.deepEqual(creditsOf([], { ...POLICY, earlyNum: 1.5 }), { ok: false, why: 'not a policy' });
  assert.equal(creditsOf([], { ...POLICY, earlyNum: 1, earlyDen: 1 }).ok, true, 'a weight of one over one is a policy');
  assert.deepEqual(creditsOf([], { ...POLICY, makerPpm: -1 }), { ok: false, why: 'not a policy' });
  assert.deepEqual(creditsOf('x', POLICY), { ok: false, why: 'not a log' });
  assert.deepEqual(creditsOf([7], POLICY), { ok: false, why: 'a log of linked entries' });
  assert.deepEqual(creditsOf([{ n: -1, entry: {} }], POLICY), { ok: false, why: 'a log of linked entries' });
  assert.deepEqual(creditsOf([{ n: 0, entry: 'x' }], POLICY), { ok: false, why: 'a log of linked entries' });
  assert.deepEqual(creditsOf([link(0, { type: 'value', asset: 'nope', units: 1 })], POLICY), { ok: false, why: 'a value on an asset the log does not release' });
  assert.deepEqual(creditsOf([link(0, { type: 'release', asset: 'a', by: K('a') }), link(1, { type: 'value', asset: 'a', units: 'x' })], POLICY), { ok: false, why: 'a value on an asset the log does not release' });
  assert.deepEqual(creditsOf([link(0, { type: 'release', asset: 'a', by: K('a') }), link(1, { type: 'give', asset: 'zz', to: K('b') })], POLICY), { ok: true, credits: {}, lines: [], scale: 2 }, 'a give of nothing changes nothing');
  assert.deepEqual(creditsOf([link(0, { type: 'release', asset: 'a', by: K('a'), lineage: 'x' }), link(1, { type: 'value', asset: 'a', units: 10 })], { ...POLICY, earlyUntil: 0 }).credits, { [K('a')]: '20' }, 'a lineage that is not a list is none');
});

test('creditsOf and partsOf agree with the ledger\'s own credits and allocation, on a real signed ledger', async () => {
  const [f, a, b, m] = await Promise.all(['founder', 'a', 'b', 'measurer'].map((s) => L.keysFromPhrase('economy-test/' + s)));
  const gate = async () => ({ ok: true });
  let l = L.empty();
  const put = async (keys, fields) => { const s = await L.sign(keys, fields); const r = await L.record(l, s.entry, { gate }); assert.equal(r.ok, true, r.why); l = r.ledger; };
  const at = '2026-10-27T12:00:00Z', proof = [{ kind: 'test', ref: 'r', digest: '0'.repeat(64) }];
  await put(f, { type: 'genesis', activators: [f.pub], measurers: [m.pub], policy: POLICY });
  await put(a, { type: 'release', asset: 'pa', at, form: 'node', lineage: [], proofs: proof });
  await put(b, { type: 'release', asset: 'pb', at, form: 'card', lineage: ['pa'], proofs: proof });
  for (let i = 0; i < 7; i++) await put(m, { type: 'value', asset: i % 2 ? 'pa' : 'pb', at, basis: 'routing', job: 'j' + i, proofs: proof, units: 3 + i });
  await put(b, { type: 'give', asset: 'pb', at, to: a.pub });
  await put(m, { type: 'value', asset: 'pb', at, basis: 'mesh-share', job: 'k', proofs: proof, units: 701 });
  const theirs = L.credits(l), mine = creditsOf(l.log, POLICY);
  assert.deepEqual(mine.credits, theirs.credits);
  assert.deepEqual(mine.lines.map((x) => [x.n, x.key, x.role, x.credit]), theirs.lines.map((x) => [x.n, x.key, x.role, x.credit]));
  for (const pool of [1, 7, 1000, 1000000, 999983]) {
    const al = L.allocate(l, { sandbox: true, pool });
    assert.deepEqual(partsOf(theirs.credits, pool), { ok: true, parts: al.parts, total: pool }, 'pool ' + pool);
  }
});

test('partsOf: floors, then the largest remainders, a tie to the smaller key', () => {
  const [a, b, c] = [K('a'), K('b'), K('c')];
  assert.deepEqual(partsOf({ [a]: '1', [b]: '1', [c]: '1' }, 10), { ok: true, parts: { [a]: 4, [b]: 3, [c]: 3 }, total: 10 });
  assert.deepEqual(partsOf({ [c]: '1', [b]: '1', [a]: '1' }, 2), { ok: true, parts: { [a]: 1, [b]: 1, [c]: 0 }, total: 2 }, 'ties to the smaller keys, whatever the order given');
  assert.deepEqual(partsOf({ [a]: '2', [b]: '1' }, 2), { ok: true, parts: { [a]: 1, [b]: 1 }, total: 2 }, '4/3 and 2/3: the larger remainder takes the unit');
  assert.deepEqual(partsOf({ [a]: '1', [b]: '2' }, 2), { ok: true, parts: { [a]: 1, [b]: 1 }, total: 2 });
  assert.deepEqual(partsOf({ [a]: '3', [b]: '1' }, 2), { ok: true, parts: { [a]: 2, [b]: 0 }, total: 2 }, '1.5 and 0.5: a tie of remainders goes to the smaller key');
  assert.deepEqual(partsOf({ [b]: '3', [a]: '1' }, 2), { ok: true, parts: { [a]: 1, [b]: 1 }, total: 2 });
  assert.deepEqual(partsOf({ [a]: '5' }, 1), { ok: true, parts: { [a]: 1 }, total: 1 });
  assert.deepEqual(partsOf({ [a]: '99999999999999999999', [b]: '1' }, 1000000), { ok: true, parts: { [a]: 1000000, [b]: 0 }, total: 1000000 }, 'exact past the safe integers');
  assert.deepEqual(partsOf({}, 5), { ok: true, parts: {}, total: 0 });
  assert.deepEqual(partsOf(null, 5), { ok: false, why: 'credits are a record of keys' });
  assert.deepEqual(partsOf([], 5), { ok: false, why: 'credits are a record of keys' });
  assert.deepEqual(partsOf({ [a]: '1' }, 0), { ok: false, why: 'a pool is a whole number of units, at least one' });
  assert.deepEqual(partsOf({ [a]: '1' }, 1.5), { ok: false, why: 'a pool is a whole number of units, at least one' });
  assert.deepEqual(partsOf({ [a]: '1' }, -1), { ok: false, why: 'a pool is a whole number of units, at least one' });
  for (const bad of [{ x: '1' }, { [a]: '0' }, { [a]: '01' }, { [a]: 1 }, { [a]: '-1' }, { [a]: '1.5' }, { ['A'.repeat(64)]: '1' }]) assert.deepEqual(partsOf(bad, 5), { ok: false, why: 'a credit is a key and a whole number above zero' });
});

test('looUnits: a thousandth of balanced accuracy is a unit', () => {
  assert.equal(looUnits(0.625455), 625);
  assert.equal(looUnits(0.701183), 701);
  assert.equal(looUnits(0.6905), 691, 'a half rounds up');
  assert.equal(looUnits(1), 1000);
  assert.equal(looUnits(0.0005), 1);
  assert.equal(looUnits(0.0004), 0);
  assert.equal(looUnits(1.0001), 1000, 'a gain is held to 1');
  assert.equal(looUnits(-0.5), 0, 'and to 0');
  for (const bad of [0, NaN, Infinity, -Infinity, '0.5', null]) assert.equal(looUnits(bad), 0, String(bad));
});

test('barredIn: whole words with their endings, phrases, and the signs only when asked', () => {
  const B = ['buy', 'earn', 'return on', 'KCC', 'token', '£', '$', 'pre-sale'];
  assert.deepEqual(barredIn('Nothing to see.', B, true), []);
  assert.deepEqual(barredIn('Buy now, earners, learn and relearn', B, false), ['buy'], 'earners is two endings: the sealed rule reads one');
  assert.deepEqual(barredIn('they earn', B), ['earn']);
  assert.deepEqual(barredIn('an earner', B), ['earn']);
  assert.deepEqual(barredIn('buying', B), ['buy']);
  assert.deepEqual(barredIn('a buyer', B), ['buy']);
  assert.deepEqual(barredIn('buys', B), ['buy']);
  assert.deepEqual(barredIn('buyed', B), ['buy']);
  assert.deepEqual(barredIn('buyes', B), ['buy']);
  assert.deepEqual(barredIn('buyers', B), [], 'only one ending is read, as the sealed rule says');
  assert.deepEqual(barredIn('rebuy', B), []);
  assert.deepEqual(barredIn('buy2', B), []);
  assert.deepEqual(barredIn('a return on it', B), ['return on']);
  assert.deepEqual(barredIn('return only', B), []);
  assert.deepEqual(barredIn('kcc units', B), ['KCC']);
  assert.deepEqual(barredIn('tokens', B), ['token']);
  assert.deepEqual(barredIn('a pre-sale', B), ['pre-sale']);
  assert.deepEqual(barredIn('£5 and $5', B, true), ['£', '$']);
  assert.deepEqual(barredIn('£5 and $5', B, false), []);
  assert.deepEqual(barredIn('£5', B, 'yes'), [], 'signs only when asked for exactly');
  assert.deepEqual(barredIn(7, B, true), []);
  assert.deepEqual(barredIn('buy', 'buy', true), []);
  assert.deepEqual(barredIn('buy', [7, '', 'buy'], true), ['buy']);
  assert.deepEqual(barredIn('a.b', ['a.b'], true), ['a.b']);
  assert.deepEqual(barredIn('axb', ['a.b'], true), [], 'a barred word is text, not a pattern');
});

test('moneyNames: any name that holds a sealed word', () => {
  assert.deepEqual(moneyNames(['allocate', 'shareOf', 'payOut', 'cashout', 'flipSwitch', 'record'], ['pay', 'cash', 'switch']), ['payOut', 'cashout', 'flipSwitch']);
  assert.deepEqual(moneyNames(['SELL'], ['sell']), ['SELL']);
  assert.deepEqual(moneyNames(['a', 7, null], ['a']), ['a']);
  assert.deepEqual(moneyNames(['a'], ['', 7]), []);
  assert.deepEqual(moneyNames('a', ['a']), []);
  assert.deepEqual(moneyNames(['a'], 'a'), []);
  assert.deepEqual(moneyNames(['Send'], ['SEND']), ['Send'], 'the words are read in any case too');
});

test('fuzz: 5,000 garbage inputs, never a throw', () => {
  let s = 9;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const junk = () => [null, 7, 'x', [], {}, { n: 1, entry: { type: 'value', asset: 'a', units: 1 } }, [{ n: 0, entry: { type: 'release', asset: 'a', by: K('a') } }], NaN, -1, 1e30, { [K('a')]: '3' }, POLICY][Math.floor(r() * 12)];
  for (let i = 0; i < 5000; i++) {
    creditsOf(junk(), r() < 0.5 ? POLICY : junk());
    partsOf(junk(), r() < 0.5 ? Math.floor(r() * 100) : junk());
    looUnits(r() < 0.5 ? r() * 2 - 0.5 : junk());
    barredIn(r() < 0.5 ? 'buy ' + i : junk(), r() < 0.5 ? ['buy'] : junk(), r() < 0.5);
    moneyNames(junk(), junk());
  }
});
