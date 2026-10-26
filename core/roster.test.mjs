import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoster, readRoster, onRoster, rosterChanges, ROSTER, MAX_MEMBERS } from './roster.mjs';
import { createNode, stableJson } from './node.mjs';
import { makeIdentity, hex } from './identity.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const clock = () => new Date('2026-10-26T12:00:00Z');
const founder = await makeIdentity(seed(70)), other = await makeIdentity(seed(71));
const nodes = [];
for (const n of [72, 73, 74]) nodes.push(await createNode({ name: 'n' + n, identity: await makeIdentity(seed(n)), clock }));
const stranger = await createNode({ name: 'stranger', identity: await makeIdentity(seed(75)), clock });
const cards = nodes.map((n) => n.card());
// a roster signed by hand, for the rosters makeRoster will not make (a member named twice)
const signed = async (cs, by = founder) => { const body = { schema: ROSTER, founder: by.id, cards: cs }; return { ...body, sig: hex(await by.sign(new TextEncoder().encode(stableJson(body)))) }; };
const fakes = (k) => Array.from({ length: k }, (_, i) => ({ id: i.toString(16).padStart(64, '0') }));

test('the constants', () => {
  assert.equal(ROSTER, 'fall-kit.roster.v1');
  assert.equal(MAX_MEMBERS, 256);
});

test('a roster the founder signed reads back, every card checked, in one order', async () => {
  const r = await makeRoster(founder, [cards[2], cards[0], cards[1]]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.roster.cards.map((c) => c.id), cards.map((c) => c.id).sort(), 'cards sorted by key');
  assert.match(r.roster.sig, /^[0-9a-f]{128}$/);
  const read = await readRoster(r.roster, founder.id);
  assert.deepEqual([read.ok, read.ids], [true, cards.map((c) => c.id).sort()]);
  assert.deepEqual((await makeRoster(founder, cards)).roster, r.roster, 'the same members in any order: the same roster');
  for (const c of cards) assert.equal(onRoster(read, c), true);
  assert.equal(onRoster(read, stranger.card()), false, 'a card the roster does not name');
  assert.equal(onRoster(read, { ...cards[0], sig: stranger.card().sig }), false, 'the right key with another signature');
  assert.equal(onRoster({ ok: false, cards }, cards[0]), false, 'a roster that did not read');
  assert.equal(onRoster(null, cards[0]), false);
  assert.equal(onRoster({ ok: true, cards: 'x' }, cards[0]), false);
  assert.equal(onRoster(read, null), false);
  assert.equal(onRoster(read, 'x'), false);
});

test('every way a roster can be wrong is refused by name', async () => {
  const r = (await makeRoster(founder, cards)).roster;
  const no = async (x, id = founder.id) => (await readRoster(x, id)).why;
  assert.equal(await no(null), 'not a fall-kit.roster.v1 roster');
  assert.equal(await no({ ...r, schema: 'x' }), 'not a fall-kit.roster.v1 roster');
  assert.equal(await no(r, other.id), 'the roster is not the founder’s', 'another founder’s key');
  assert.equal(await no(r, 'x'), 'the roster is not the founder’s');
  assert.equal(await no(r, founder.id.toUpperCase()), 'the roster is not the founder’s', 'one canonical form of a key');
  assert.equal(await no({ ...r, founder: 'x' }, 'x'), 'the roster is not the founder’s', 'a founder that is not a key, even when the roster names the same');
  assert.equal(await no({ ...r, founder: founder.id.toUpperCase() }, founder.id.toUpperCase()), 'the roster is not the founder’s', 'and not a key in another case');
  assert.equal(await no({ ...r, founder: 5 }, 5), 'the roster is not the founder’s');
  assert.equal(await no({ ...r, cards: [] }), 'a roster names 1–256 cards');
  assert.equal(await no({ ...r, cards: 'x' }), 'a roster names 1–256 cards');
  assert.equal(await no({ ...r, cards: Array(MAX_MEMBERS + 1).fill(cards[0]) }), 'a roster names 1–256 cards');
  assert.equal(await no({ ...r, sig: 'x' }), 'a roster is signed');
  assert.equal(await no({ ...r, sig: 5 }), 'a roster is signed');
  assert.equal(await no({ ...r, sig: r.sig.toUpperCase() }), 'a roster is signed');
  assert.equal(await no({ ...r, cards: r.cards.slice(1) }), 'the founder did not sign this roster', 'a member dropped after signing');
  const byOther = (await makeRoster(other, cards)).roster;
  assert.equal(await no({ ...byOther, founder: founder.id }), 'the founder did not sign this roster', 'signed by another key, named as the founder');
  const bad = (await makeRoster(founder, [{ ...cards[0], name: 'changed' }])).roster;
  assert.match(await no(bad), /^a card in the roster is not good: /, 'a card changed after its owner signed it');
  assert.equal(await no(await signed([cards[0], cards[0]])), 'a member is named twice', 'signed, but a member named twice');
  assert.equal(await no(await signed([cards[0], cards[1], cards[0]])), 'a member is named twice');
  assert.equal(await no(await signed(Array(MAX_MEMBERS).fill(cards[0]))), 'a member is named twice', 'the bound itself is allowed; the duplicates are not');
  assert.equal(await no(await signed(Array(MAX_MEMBERS + 1).fill(cards[0]))), 'a roster names 1–256 cards');
  assert.equal((await readRoster(await signed(cards.slice().reverse()), founder.id)).ok, true, 'a roster the founder signed in another order still reads');
});

test('makeRoster refuses what cannot be a roster', async () => {
  assert.deepEqual(await makeRoster(null, cards), { ok: false, why: 'a roster needs its founder' });
  assert.deepEqual(await makeRoster({ id: 5, sign: founder.sign }, cards), { ok: false, why: 'a roster needs its founder' });
  assert.deepEqual(await makeRoster({ id: founder.id }, cards), { ok: false, why: 'a roster needs its founder' });
  assert.deepEqual(await makeRoster(founder, []), { ok: false, why: 'a roster names 1–256 cards' });
  assert.deepEqual(await makeRoster(founder, 'x'), { ok: false, why: 'a roster names 1–256 cards' });
  assert.deepEqual(await makeRoster(founder, Array(MAX_MEMBERS + 1).fill(cards[0])), { ok: false, why: 'a roster names 1–256 cards' });
  assert.equal((await makeRoster(founder, fakes(MAX_MEMBERS))).ok, true, 'exactly the bound');
  assert.deepEqual(await makeRoster(founder, [cards[0], cards[0]]), { ok: false, why: 'a member is named twice' }, 'a roster that could never read is not made');
  assert.deepEqual(await makeRoster(founder, [cards[1], cards[0], cards[1]]), { ok: false, why: 'a member is named twice' });
  assert.deepEqual(await makeRoster(founder, [null, null]), { ok: false, why: 'a member is named twice' });
  const twin = await createNode({ name: 'another name', identity: await makeIdentity(seed(72)), clock });
  assert.deepEqual(await makeRoster(founder, [cards[0], twin.card()]), { ok: false, why: 'a member is named twice' }, 'one key on two cards is one member twice');
  const order = (await makeRoster(founder, fakes(40).reverse())).roster.cards.map((c) => c.id);
  assert.deepEqual(order, fakes(40).map((c) => c.id), 'sorted by key, whatever the order given');
  assert.equal((await makeRoster(founder, [cards[0]])).ok, true, 'one member');
  assert.equal((await makeRoster(founder, [null, cards[0]])).ok, true, 'junk is sorted, and refused when the roster is read');
});

test('rosterChanges: pin the members a node lacks, unpin every key the roster no longer names', async () => {
  const all = await readRoster((await makeRoster(founder, cards)).roster, founder.id);
  const ids = cards.map((c) => c.id);
  assert.deepEqual(rosterChanges(all, [], ids[0]), { pin: all.cards.filter((c) => c.id !== ids[0]), unpin: [] }, 'joining: every other member, never itself');
  assert.deepEqual(rosterChanges(all, [ids[1], ids[2]], ids[0]), { pin: [], unpin: [] }, 'already matching: nothing to do');
  const two = await readRoster((await makeRoster(founder, [cards[0], cards[1]])).roster, founder.id);
  assert.deepEqual(rosterChanges(two, [ids[1], ids[2]], ids[0]), { pin: [], unpin: [ids[2]] }, 'the founder dropped a member');
  const s = stranger.card().id, extra = [ids[2], s, 'a'].sort();
  assert.deepEqual(rosterChanges(two, [ids[1], ...extra], ids[0]).unpin, [...extra].sort(), 'every key not named, in one order');
  assert.deepEqual(rosterChanges(two, [ids[1]], ids[2]).pin.map((c) => c.id), [ids[0]], 'a node the roster dropped still reads the rest');
  for (const bad of [null, { ok: false, cards }, { ok: true, cards: 'x' }, 'x']) assert.deepEqual(rosterChanges(bad, [ids[1]], ids[0]), { pin: [], unpin: [] }, 'a roster that did not read changes nothing');
  assert.deepEqual(rosterChanges(two, 'x', ids[0]), { pin: two.cards.filter((c) => c.id !== ids[0]), unpin: [] }, 'no list of pins: nothing to unpin');
});
