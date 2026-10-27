import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, FOUNDER, MIN_PHRASE, MAX_PHRASE, MAX_ORGANS, plan, plant, rosterOf } from './seed.mjs';
import { sha256 } from './vendor/light/sha256.mjs';
import * as L from './vendor/ledger/contrib.mjs';
import { makeIdentity } from './identity.mjs';
import { readRoster } from './roster.mjs';
import { createNode } from './node.mjs';

const PHRASE = 'a public test phrase for the seed tests only';
const POLICY = { makerPpm: 100000, lineagePpm: 0, earlyUntil: 40, earlyNum: 3, earlyDen: 2 };
const seedOf = (role, phrase = PHRASE) => sha256(new TextEncoder().encode(SEED + '\n' + role + '\n' + phrase));

test('the constants', () => {
  assert.equal(SEED, 'fall-kit.seed.v1');
  assert.equal(FOUNDER, 'founder');
  assert.deepEqual([MIN_PHRASE, MAX_PHRASE, MAX_ORGANS], [16, 512, 16]);
});

test('plan: the founder and every organ, each its key seed, worked out from the phrase alone', () => {
  const p = plan(PHRASE, ['desk', 'stay-a']);
  assert.equal(p.ok, true);
  assert.deepEqual(p.roles, ['founder', 'desk', 'stay-a']);
  for (const r of p.roles) assert.deepEqual(p.seeds[r], seedOf(r));
  assert.deepEqual(Object.keys(p.seeds), p.roles);
  assert.deepEqual(plan(PHRASE, ['stay-a', 'desk']).seeds.desk, p.seeds.desk);
  assert.notDeepEqual(plan(PHRASE + '.', ['desk']).seeds.desk, p.seeds.desk);
  assert.notDeepEqual(p.seeds.desk, p.seeds['stay-a']);
  assert.notDeepEqual(p.seeds.founder, p.seeds.desk);
  assert.equal(p.seeds.desk.length, 32);
});

test('plan: a phrase too short or too long is refused by name', () => {
  for (const x of [5, null, undefined, ['a phrase that is long enough'], {}]) assert.deepEqual(plan(x, ['desk']), { ok: false, why: 'a seed phrase is text' });
  const short = 'a seed phrase is at least 16 characters, not counting the spaces at its ends';
  for (const x of ['', 'x'.repeat(15), '   ' + 'x'.repeat(15) + '   ', '\n'.repeat(40)]) assert.deepEqual(plan(x, ['desk']), { ok: false, why: short });
  for (const x of ['x'.repeat(16), '  ' + 'x'.repeat(16), 'x'.repeat(512)]) assert.equal(plan(x, ['desk']).ok, true);
  assert.deepEqual(plan('x'.repeat(513), ['desk']), { ok: false, why: 'a seed phrase is at most 512 characters' });
});

test('plan: organs are named once, well, and never founder', () => {
  const count = 'a seed grows one to 16 organs', named = 'an organ is named in lowercase letters, digits and dashes, starting with a letter, up to 24 long';
  for (const x of [null, 'desk', {}, [], Array.from({ length: 17 }, (_, i) => 'o' + i)]) assert.deepEqual(plan(PHRASE, x), { ok: false, why: count });
  assert.equal(plan(PHRASE, Array.from({ length: 16 }, (_, i) => 'o' + i)).ok, true);
  for (const o of ['Desk', '1desk', 'de sk', '', 'a'.repeat(25), 5, null, '-desk', 'desk_1']) assert.deepEqual(plan(PHRASE, ['desk', o]), { ok: false, why: named }, String(o));
  for (const o of ['a', 'a-1', 'a'.repeat(24), 'stay-b2']) assert.equal(plan(PHRASE, [o]).ok, true, o);
  assert.deepEqual(plan(PHRASE, ['desk', 'founder']), { ok: false, why: 'founder is the seed\'s own key, not an organ' });
  assert.deepEqual(plan(PHRASE, ['desk', 'gate', 'desk']), { ok: false, why: 'an organ is named once' });
});

test('plant: the identities from the plan, and the organism\'s own genesis, signed by its founder', async () => {
  const s = await plant(PHRASE, ['desk', 'gate'], { policy: POLICY });
  assert.equal(s.ok, true);
  assert.equal(s.coupled, false);
  assert.deepEqual(s.roles, ['founder', 'desk', 'gate']);
  for (const r of s.roles) assert.equal(s.ids[r].id, (await makeIdentity(seedOf(r))).id, r);
  assert.equal(s.genesis.type, 'genesis');
  assert.equal(s.genesis.by, s.ids.founder.id);
  assert.deepEqual(s.genesis.activators, [s.ids.founder.id]);
  assert.deepEqual(s.genesis.measurers, [s.ids.desk.id, s.ids.gate.id]);
  assert.deepEqual(s.genesis.policy, POLICY);
  assert.equal((await L.record(L.empty(), s.genesis, {})).ok, true);
  const again = await plant(PHRASE, ['desk', 'gate'], { policy: POLICY });
  assert.deepEqual(again.genesis, s.genesis);
  assert.notEqual((await plant(PHRASE + '!', ['desk', 'gate'], { policy: POLICY })).genesis.by, s.genesis.by);
});

test('plant: coupled on a genesis the client and a larger mesh named together, and nothing else changes', async () => {
  const own = await plant(PHRASE, ['desk'], { policy: POLICY });
  const other = await makeIdentity(new Uint8Array(32).fill(90));
  const joint = (await L.sign(other.ledgerKeys, { type: 'genesis', activators: [other.id], measurers: [own.ids.desk.id], policy: POLICY })).entry;
  const c = await plant(PHRASE, ['desk'], { genesis: joint, policy: { junk: 1 } });
  assert.equal(c.ok, true);
  assert.equal(c.coupled, true);
  assert.equal(c.genesis, joint);
  assert.equal(c.ids.desk.id, own.ids.desk.id);
  assert.equal(c.ids.founder.id, own.ids.founder.id);
  for (const g of [null, 5, 'genesis', { type: 'release' }, []]) assert.deepEqual(await plant(PHRASE, ['desk'], { genesis: g }), { ok: false, why: 'a coupled seed is planted on a genesis entry' });
});

test('plant: a refusal of the plan, or a policy no ledger records, is a refusal', async () => {
  assert.deepEqual(await plant('short', ['desk'], { policy: POLICY }), { ok: false, why: plan('short', ['desk']).why });
  for (const opts of [null, undefined, 5, {}]) assert.deepEqual(await plant(PHRASE, ['desk'], opts), { ok: false, why: 'the organism’s genesis could not be signed: an entry holds only whole numbers, text, lists and records'.replace('’', "'") });
  for (const policy of [{ makerPpm: 2000000, lineagePpm: 0, earlyUntil: 1, earlyNum: 1, earlyDen: 1 }, { makerPpm: 1 }]) {
    const r = await plant(PHRASE, ['desk'], { policy });
    assert.equal(r.ok, false);
    assert.match(r.why, /^the organism's genesis is not one a ledger records: /);
  }
});

test('rosterOf: the founder\'s signed roster of the organism\'s cards', async () => {
  const s = await plant(PHRASE, ['desk', 'gate'], { policy: POLICY });
  const cards = [];
  for (const r of ['desk', 'gate']) cards.push((await createNode({ name: r, identity: s.ids[r], genesis: s.genesis })).card());
  const ro = await rosterOf(s, cards);
  assert.equal(ro.ok, true);
  const read = await readRoster(ro.roster, s.ids.founder.id);
  assert.equal(read.ok, true);
  assert.deepEqual(read.ids.slice().sort(), [s.ids.desk.id, s.ids.gate.id].sort());
  assert.equal((await rosterOf(s, [])).ok, false);
  for (const x of [null, 5, {}, { ok: false, ids: s.ids }, { ok: true }, { ok: true, ids: {} }, { ok: true, ids: 5 }]) assert.deepEqual(await rosterOf(x, cards), { ok: false, why: 'a roster is signed by a planted seed\'s founder' });
});
