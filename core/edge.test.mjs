import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inbound, sealInside, outbound, shapeOk, shapeOf, MAX_DEPTH, MAX_REQUEST, IN_STAGES } from './edge.mjs';
import { makeIdentity, verifyBytes } from './identity.mjs';
import { prepare, finish, open, signedBytes, KINDS } from './vendor/light/packet.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const enc = (s) => new TextEncoder().encode(s);
const J = (v) => enc(JSON.stringify(v));
const nest = (n) => { let v = 0; for (let i = 0; i < n; i++) v = [v]; return v; };
const nestObj = (n) => { let v = 0; for (let i = 0; i < n; i++) v = { a: v }; return v; };

test('the constants', () => {
  assert.equal(MAX_DEPTH, 64);
  assert.equal(MAX_REQUEST, 1048576);
  assert.deepEqual(IN_STAGES, ['size', 'utf8', 'json', 'shape', 'packet']);
  assert.equal(Object.isFrozen(IN_STAGES), true);
});

test('shapeOk: each type, its edges, and its reason', () => {
  const ok = { ok: true };
  assert.deepEqual(shapeOk(null, { type: 'null' }), ok);
  assert.deepEqual(shapeOk(0, { type: 'null' }), { ok: false, why: 'not null' });
  assert.deepEqual(shapeOk(false, { type: 'bool' }), ok);
  assert.deepEqual(shapeOk(0, { type: 'bool' }), { ok: false, why: 'not true or false' });
  assert.deepEqual(shapeOk(3, { type: 'int', min: 3, max: 3 }), ok);
  assert.deepEqual(shapeOk(2, { type: 'int', min: 3 }), { ok: false, why: 'below 3' });
  assert.deepEqual(shapeOk(4, { type: 'int', max: 3 }), { ok: false, why: 'above 3' });
  assert.deepEqual(shapeOk(1.5, { type: 'int' }), { ok: false, why: 'not a whole number' });
  assert.deepEqual(shapeOk(2 ** 53, { type: 'int' }), { ok: false, why: 'not a whole number' });
  assert.deepEqual(shapeOk('3', { type: 'int' }), { ok: false, why: 'not a whole number' });
  assert.deepEqual(shapeOk(1.5, { type: 'number', min: 1.5, max: 1.5 }), ok);
  assert.deepEqual(shapeOk(1.4, { type: 'number', min: 1.5 }), { ok: false, why: 'below 1.5' });
  assert.deepEqual(shapeOk(1.6, { type: 'number', max: 1.5 }), { ok: false, why: 'above 1.5' });
  assert.deepEqual(shapeOk(Infinity, { type: 'number' }), { ok: false, why: 'not a number' });
  assert.deepEqual(shapeOk('1', { type: 'number' }), { ok: false, why: 'not a number' });
  assert.deepEqual(shapeOk(7, { type: 'number' }), ok, 'a whole number is a number');
  assert.deepEqual(shapeOk(5, { type: 'int', min: '1', max: '9' }), ok, 'a bound that is not a number is no bound');
  assert.deepEqual(shapeOk('abc', { type: 'string', max: 3 }), ok);
  assert.deepEqual(shapeOk('abcd', { type: 'string', max: 3 }), { ok: false, why: 'text longer than 3' });
  assert.deepEqual(shapeOk('', { type: 'string', max: 0 }), ok);
  assert.deepEqual(shapeOk('x'.repeat(50), { type: 'string' }), ok, 'no max: the request limit');
  assert.deepEqual(shapeOk('x', { type: 'string', max: -1 }).ok, true, 'a negative max is no max');
  assert.deepEqual(shapeOk(5, { type: 'string' }), { ok: false, why: 'not text' });
  assert.deepEqual(shapeOk([1, 2], { type: 'list', of: { type: 'int' }, max: 2 }), ok);
  assert.deepEqual(shapeOk([1, 2, 3], { type: 'list', of: { type: 'int' }, max: 2 }), { ok: false, why: 'a list longer than 2' });
  assert.deepEqual(shapeOk([1, 'x'], { type: 'list', of: { type: 'int' } }), { ok: false, why: 'item 1: not a whole number' });
  assert.deepEqual(shapeOk({}, { type: 'list', of: { type: 'int' } }), { ok: false, why: 'not a list' });
  assert.deepEqual(shapeOk([], { type: 'list' }), ok, 'an empty list fits');
  assert.deepEqual(shapeOk([1, true], { type: 'tuple', items: [{ type: 'int' }, { type: 'bool' }] }), ok);
  assert.deepEqual(shapeOk([1], { type: 'tuple', items: [{ type: 'int' }, { type: 'bool' }] }), { ok: false, why: 'a list of 1 where 2 are declared' });
  assert.deepEqual(shapeOk([1, 2], { type: 'tuple', items: [{ type: 'int' }, { type: 'bool' }] }), { ok: false, why: 'item 1: not true or false' });
  assert.deepEqual(shapeOk([1], { type: 'tuple' }), { ok: false, why: 'not a list' });
  assert.deepEqual(shapeOk('x', { type: 'tuple', items: [] }), { ok: false, why: 'not a list' });
  const rec = { type: 'object', fields: { a: { type: 'int' }, b: { type: 'string', max: 2 } }, required: ['a'] };
  assert.deepEqual(shapeOk({ a: 1 }, rec), ok);
  assert.deepEqual(shapeOk({ a: 1, b: 'xy' }, rec), ok);
  assert.deepEqual(shapeOk({ b: 'x' }, rec), { ok: false, why: 'missing a' });
  assert.deepEqual(shapeOk({ a: 1, c: 2 }, rec), { ok: false, why: 'an undeclared field c' });
  assert.deepEqual(shapeOk({ a: 1, ['k'.repeat(60)]: 2 }, rec), { ok: false, why: 'an undeclared field ' + 'k'.repeat(40) });
  assert.deepEqual(shapeOk({ a: 1, c: 2 }, { ...rec, extra: true }), ok, 'extra fields allowed when declared so');
  assert.deepEqual(shapeOk({ a: 1, c: 2 }, { ...rec, extra: 'yes' }).ok, false, 'only true allows extra');
  assert.deepEqual(shapeOk({ a: 'x' }, rec), { ok: false, why: 'a: not a whole number' });
  assert.deepEqual(shapeOk({ ['q'.repeat(50)]: 'x' }, { type: 'object', fields: { ['q'.repeat(50)]: { type: 'int' } } }), { ok: false, why: 'q'.repeat(40) + ': not a whole number' });
  assert.deepEqual(shapeOk({ a: 1, b: 'xyz' }, rec), { ok: false, why: 'b: text longer than 2' });
  assert.deepEqual(shapeOk([1], rec), { ok: false, why: 'not a record' });
  assert.deepEqual(shapeOk(null, rec), { ok: false, why: 'not a record' });
  assert.deepEqual(shapeOk({ a: 1 }, { type: 'object' }), { ok: false, why: 'not a record' }, 'an object shape needs its fields');
  assert.deepEqual(shapeOk({}, { type: 'object', fields: {} }), ok, 'no required list: nothing required');
  assert.deepEqual(shapeOk({ toString: 1 }, { type: 'object', fields: {} }), { ok: false, why: 'an undeclared field toString' }, 'only the declared fields, not inherited names');
  assert.deepEqual(shapeOk({}, { type: 'object', fields: {}, required: ['toString'] }), { ok: false, why: 'missing toString' });
  assert.deepEqual(shapeOk({ a: [1, { b: null }] }, { type: 'any' }), ok);
  // depth counts levels: a plain value is one, each list or record around it adds one
  assert.deepEqual(shapeOk(nest(2), { type: 'any', depth: 3 }), ok);
  assert.deepEqual(shapeOk(nest(3), { type: 'any', depth: 3 }), { ok: false, why: 'not JSON within depth 3' });
  assert.deepEqual(shapeOk(nest(63), { type: 'any' }), ok);
  assert.deepEqual(shapeOk(nest(64), { type: 'any' }), { ok: false, why: 'not JSON within depth 64' });
  assert.deepEqual(shapeOk(nest(63), { type: 'any', depth: 99 }), ok, 'a depth past the limit is the limit');
  assert.deepEqual(shapeOk(nest(64), { type: 'any', depth: 99 }), { ok: false, why: 'not JSON within depth 64' });
  assert.deepEqual(shapeOk('x', { type: 'any', depth: 1 }), ok, 'depth 1 holds a plain value');
  assert.deepEqual(shapeOk([], { type: 'any', depth: 1 }), { ok: false, why: 'not JSON within depth 1' }, 'depth 1 holds no list');
  assert.deepEqual(shapeOk({ a: 1 }, { type: 'any', depth: 2 }), ok);
  for (const d of [0, -1, 1.5, '3']) assert.deepEqual(shapeOk(nest(63), { type: 'any', depth: d }), ok, 'a depth that is not a whole number from 1 is the limit: ' + d);
  assert.deepEqual(shapeOk([nest(62)], { type: 'tuple', items: [{ type: 'any' }] }), ok, 'inside a list, the levels left');
  assert.deepEqual(shapeOk([nest(63)], { type: 'tuple', items: [{ type: 'any' }] }), { ok: false, why: 'item 0: not JSON within depth 63' });
  assert.deepEqual(shapeOk([nest(1)], { type: 'tuple', items: [{ type: 'any', depth: 2 }] }), ok);
  assert.deepEqual(shapeOk(NaN, { type: 'any' }).ok, false);
  assert.deepEqual(shapeOk({ a: undefined }, { type: 'any' }).ok, false, 'undefined is not JSON');
  assert.deepEqual(shapeOk(new Date(0), { type: 'any' }).ok, false, 'a date is not plain JSON');
  assert.deepEqual(shapeOk(Object.create(null), { type: 'any' }).ok, false, 'an object without the plain prototype is not plain JSON');
  assert.deepEqual(shapeOk(() => 1, { type: 'any' }).ok, false);
  assert.deepEqual(shapeOk(Symbol('x'), { type: 'any' }).ok, false);
  for (const s of [null, 'x', [], {}, { type: 'date' }, { type: 'toString' }]) assert.deepEqual(shapeOk(1, s), { ok: false, why: 'the shape is not one the edge declares' }, JSON.stringify(s));
  // depth: a declared shape nested past the limit is refused
  let deep = { type: 'int' };
  for (let i = 0; i < 64; i++) deep = { type: 'tuple', items: [deep] };
  assert.deepEqual(shapeOk(nest(64), deep).ok, false);
  assert.match(shapeOk(nest(64), deep).why, /nested deeper than 64$/);
  let d63 = { type: 'int' };
  for (let i = 0; i < 63; i++) d63 = { type: 'tuple', items: [d63] };
  assert.deepEqual(shapeOk(nest(63), d63), ok);
  // the same depth through lists and through records
  let l64 = { type: 'int' }, l63 = { type: 'int' };
  for (let i = 0; i < 64; i++) l64 = { type: 'list', of: l64 };
  for (let i = 0; i < 63; i++) l63 = { type: 'list', of: l63 };
  assert.match(shapeOk(nest(64), l64).why, /nested deeper than 64$/);
  assert.deepEqual(shapeOk(nest(63), l63), ok);
  let o64 = { type: 'int' }, o63 = { type: 'int' };
  for (let i = 0; i < 64; i++) o64 = { type: 'object', fields: { a: o64 } };
  for (let i = 0; i < 63; i++) o63 = { type: 'object', fields: { a: o63 } };
  assert.match(shapeOk(nestObj(64), o64).why, /nested deeper than 64$/);
  assert.deepEqual(shapeOk(nestObj(63), o63), ok);
  assert.deepEqual(shapeOk('x', { type: 'string', max: 0 }), { ok: false, why: 'text longer than 0' }, 'a max of 0 is a max');
  assert.deepEqual(shapeOk([1], { type: 'list', of: { type: 'int' }, max: 0 }), { ok: false, why: 'a list longer than 0' });
});

test('shapeOf: the exact shape of an example, which the example fits and its neighbours do not', () => {
  assert.deepEqual(shapeOf(null), { type: 'null' });
  assert.deepEqual(shapeOf(true), { type: 'bool' });
  assert.deepEqual(shapeOf(3), { type: 'int', min: 3, max: 3 });
  assert.deepEqual(shapeOf(1.5), { type: 'number', min: 1.5, max: 1.5 });
  assert.deepEqual(shapeOf('ab'), { type: 'string', max: 2 });
  assert.deepEqual(shapeOf([1, 'a']), { type: 'tuple', items: [{ type: 'int', min: 1, max: 1 }, { type: 'string', max: 1 }] });
  assert.deepEqual(shapeOf({ a: 1 }), { type: 'object', fields: { a: { type: 'int', min: 1, max: 1 } }, required: ['a'], extra: false });
  const ex = { name: 'Kar', n: 3, tags: ['a', 'b'], deep: { x: null, y: [1.5] } };
  assert.deepEqual(shapeOk(ex, shapeOf(ex)), { ok: true });
  assert.equal(shapeOk({ ...ex, n: 4 }, shapeOf(ex)).ok, false);
  assert.equal(shapeOk({ ...ex, extra: 1 }, shapeOf(ex)).ok, false);
  assert.equal(shapeOk({ ...ex, tags: ['a'] }, shapeOf(ex)).ok, false);
  assert.equal(shapeOk({ ...ex, name: 'Kars' }, shapeOf(ex)).ok, false);
  assert.deepEqual(shapeOk(nest(63), shapeOf(nest(63))), { ok: true }, 'every value shapeOf takes fits its shape');
  assert.equal(shapeOf(nest(64)), null, 'deeper than the edge reads: no shape');
  assert.equal(shapeOf(nestObj(64)), null);
  assert.equal(shapeOf(NaN), null);
  assert.equal(shapeOf(undefined), null);
  assert.equal(shapeOf({ a: () => 1 }), null);
});

test('inbound: size, then utf8, then json, then shape, each with its reason', () => {
  const shape = shapeOf({ a: 1 });
  assert.deepEqual(inbound(J({ a: 1 }), { shape }), { ok: true, value: { a: 1 } });
  assert.deepEqual(inbound('{"a":1}', { shape }), { ok: false, stage: 'size', why: 'not bytes' });
  assert.deepEqual(inbound(null, { shape }), { ok: false, stage: 'size', why: 'not bytes' });
  assert.deepEqual(inbound(new Uint8Array(0), { shape }), { ok: false, stage: 'size', why: 'a request is 1–1048576 bytes' });
  assert.deepEqual(inbound(J({ a: 1 }), { shape, maxBytes: 6 }), { ok: false, stage: 'size', why: 'a request is 1–6 bytes' });
  assert.deepEqual(inbound(J({ a: 1 }), { shape, maxBytes: 7 }), { ok: true, value: { a: 1 } }, 'exactly the limit is in');
  assert.equal(inbound(new Uint8Array(MAX_REQUEST + 1).fill(0x20), { shape }).stage, 'size', 'past the request limit');
  assert.equal(inbound(new Uint8Array(MAX_REQUEST).fill(0x20), { shape }).stage, 'json', 'at the request limit it is read');
  for (const m of [0, -1, 1.5, '9', MAX_REQUEST + 1]) assert.equal(inbound(J({ a: 1 }), { shape, maxBytes: m }).ok, true, 'a bad limit is the request limit: ' + m);
  assert.deepEqual(inbound(new Uint8Array(MAX_REQUEST + 1).fill(0x20), { shape, maxBytes: MAX_REQUEST + 5 }), { ok: false, stage: 'size', why: 'a request is 1–1048576 bytes' }, 'a limit past the request limit is the request limit');
  assert.equal(inbound(new Uint8Array(MAX_REQUEST).fill(0x20), { shape, maxBytes: MAX_REQUEST }).stage, 'json', 'a limit of exactly the request limit');
  assert.deepEqual(inbound(Uint8Array.of(0x22, 0xff, 0x22), { shape }), { ok: false, stage: 'utf8', why: 'not valid UTF-8' });
  assert.deepEqual(inbound(enc('{"a":1'), { shape }), { ok: false, stage: 'json', why: 'not JSON' });
  assert.deepEqual(inbound(J({ a: 2 }), { shape }), { ok: false, stage: 'shape', why: 'a: above 1' });
  assert.deepEqual(inbound(J({ a: 1 }), {}), { ok: false, stage: 'shape', why: 'the shape is not one the edge declares' }, 'no declared shape: nothing comes in');
  assert.deepEqual(inbound(J({ a: 1 }), null).stage, 'shape');
  assert.deepEqual(inbound(J({ a: 1 })).stage, 'shape');
  assert.deepEqual(inbound(enc(' {"a":1} '), { shape }), { ok: true, value: { a: 1 } }, 'JSON text as JSON allows');
});

async function pair() {
  const [edgeId, peer, other] = await Promise.all([makeIdentity(seed(52)), makeIdentity(seed(51)), makeIdentity(seed(30))]);
  return { edgeId, peer, other };
}
const peerOf = (id) => ({ slot: id.slot, id: id.id, raw: id.raw });
const signed = async (who, value, counter, kind = KINDS.JSON) => {
  const p = prepare(kind === KINDS.JSON ? { sender: who.slot, counter, kind, value, dictId: 0 } : { sender: who.slot, counter, kind, bytes: value, dictId: 0 });
  return finish(p.unsigned, await who.sign(p.signed)).bytes;
};

test('sealInside: a checked request becomes a packet the edge signed; a refused one builds none', async () => {
  const { edgeId } = await pair();
  const shape = shapeOf({ q: 'hi' });
  const r = await sealInside(J({ q: 'hi' }), { shape, sender: edgeId.slot, counter: 1n }, edgeId.sign);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { q: 'hi' });
  const opened = open(r.bytes, { keyFor: () => edgeId.raw, verify: () => true, lastCounter: () => 0n });
  assert.deepEqual([opened.admit, opened.sender, opened.counter, opened.value], [true, edgeId.slot, 1n, { q: 'hi' }]);
  assert.equal(await verifyBytes(edgeId.id, signedBytes(r.bytes, r.bytes.length - 87), r.bytes.subarray(r.bytes.length - 64)), true, 'the signature is the edge key’s');
  let called = 0;
  const counting = async (b) => { called++; return edgeId.sign(b); };
  for (const [bytes, stage] of [[J({ q: 'hello' }), 'shape'], [enc('{'), 'json'], [Uint8Array.of(0xff), 'utf8'], [new Uint8Array(0), 'size']]) {
    const x = await sealInside(bytes, { shape, sender: edgeId.slot, counter: 2n }, counting);
    assert.deepEqual([x.ok, x.stage, x.bytes], [false, stage, undefined]);
  }
  assert.equal(called, 0, 'a refused request is never signed');
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 300, counter: 1n }, edgeId.sign), { ok: false, stage: 'packet', why: 'sender is a whole number 0–255' });
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 1, counter: 0n }, edgeId.sign), { ok: false, stage: 'packet', why: 'counter is a u64 from 1' });
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 1, counter: 1n }, async () => new Uint8Array(3)), { ok: false, stage: 'packet', why: 'the edge could not sign: a signature is 64 bytes' });
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 1, counter: 1n }, async () => { throw new Error('x'); }), { ok: false, stage: 'packet', why: 'the edge could not sign: a signature is 64 bytes' });
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 1, counter: 1n }, async () => 'x'.repeat(64)), { ok: false, stage: 'packet', why: 'the edge could not sign: a signature is 64 bytes' });
  assert.deepEqual(await sealInside(J({ q: 'hi' }), { shape, sender: 1, counter: 1n }), { ok: false, stage: 'packet', why: 'the edge could not sign: a signature is 64 bytes' });
  assert.equal((await sealInside(J({ q: 'hi' }), null, edgeId.sign)).stage, 'shape');
});

test('outbound: through the door first, then standard JSON; anything the door refuses says nothing', async () => {
  const { edgeId, peer, other } = await pair();
  assert.notEqual(peer.slot, other.slot, 'the test needs the stranger on another slot');
  const counters = new Map();
  const opts = { peers: [peerOf(peer)], verifyBytes, lastCounter: (slot, id) => counters.get(id) || 0n };
  const value = { a: [1, 'two', null, { b: true }], c: 1.5 };
  const b1 = await signed(peer, value, 5n);
  const r = await outbound(b1, opts);
  assert.deepEqual(r, { ok: true, json: JSON.stringify(value), value, sender: peer.slot, counter: 5n, from: peer.id });
  assert.deepEqual(JSON.parse(r.json), value);
  counters.set(peer.id, 5n);
  assert.deepEqual(await outbound(b1, opts), { ok: false, stage: 'counter', why: 'counter 5 is not after 5: a replay, or out of order', decoded: false });
  const t = b1.slice(); t[30] ^= 1;
  assert.deepEqual(await outbound(t, opts), { ok: false, stage: 'signature', why: 'the signature does not verify for sender ' + peer.slot, decoded: false });
  assert.deepEqual(await outbound(await signed(other, value, 1n), opts), { ok: false, stage: 'sender', why: 'sender ' + other.slot + ' is not pinned here', decoded: false });
  assert.deepEqual(await outbound(enc('{"a":1}'.repeat(20)), opts), { ok: false, stage: 'magic', why: 'not a LIGHT packet: it does not begin with LGT1', decoded: false });
  assert.deepEqual(await outbound(enc('{}'), opts), { ok: false, stage: 'size', why: 'a LIGHT packet is 87–1048576 bytes', decoded: false });
  assert.deepEqual(await outbound('x', opts), { ok: false, stage: 'size', why: 'not bytes', decoded: false });
  assert.deepEqual(await outbound(await signed(peer, Uint8Array.of(1, 2, 3), 9n, KINDS.BYTES), opts), { ok: false, stage: 'kind', why: 'only a JSON packet leaves as JSON', decoded: true });
  // the verifier is handed in: one that throws or says anything but true is a refusal
  for (const v of [async () => { throw new Error('x'); }, async () => 'yes', async () => 1, undefined]) {
    const x = await outbound(await signed(peer, value, 20n), { ...opts, verifyBytes: v });
    assert.deepEqual([x.ok, x.stage], [false, 'signature']);
  }
  // a counter source that throws or lies about its type fails closed at the counter
  for (const lc of [() => { throw new Error('x'); }, () => 3, () => null]) {
    const x = await outbound(await signed(peer, value, 21n), { ...opts, lastCounter: lc });
    assert.deepEqual([x.ok, x.stage], [false, 'counter'], String(lc));
  }
  assert.equal((await outbound(await signed(peer, value, 22n), { ...opts, lastCounter: undefined })).ok, true, 'no counter source: every counter is after 0');
  assert.equal((await outbound(await signed(peer, value, 23n), null)).stage, 'sender', 'no peers: nobody is pinned');
  assert.equal((await outbound(await signed(peer, value, 24n), { ...opts, peers: 'x' })).stage, 'sender');
  assert.equal((await outbound(await signed(peer, value, 25n), { ...opts, peers: [null, 5, { slot: peer.slot, id: other.id }] })).stage, 'signature', 'a pinned slot with the wrong key: the signature');
  const two = await outbound(await signed(peer, value, 26n), { ...opts, peers: [{ slot: peer.slot, id: other.id, raw: other.raw }, peerOf(peer)] });
  assert.deepEqual([two.ok, two.from], [true, peer.id], 'two keys on one slot: the one that verifies');
  const noRaw = await outbound(await signed(peer, value, 27n), { ...opts, peers: [{ slot: peer.slot, id: peer.id }] });
  assert.equal(noRaw.ok, true, 'a peer named by id alone');
  const k = await sealInside(J({ q: 1 }), { shape: shapeOf({ q: 1 }), sender: edgeId.slot, counter: 1n }, edgeId.sign);
  assert.deepEqual((await outbound(k.bytes, { ...opts, peers: [peerOf(edgeId)] })).value, { q: 1 }, 'in through the edge and out again: the same value');
});
