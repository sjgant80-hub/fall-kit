import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameOf, createReader, createRelay, MAGIC, KIND, HEAD, MAX_FRAME } from './relay.mjs';

const id = (n) => new Uint8Array(32).fill(n);
const B = (...xs) => Uint8Array.from(xs);
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

test('the constants, and a relay imports no codec, door or vault (it cannot read a body)', () => {
  assert.deepEqual(MAGIC, [0x4c, 0x52, 0x59, 0x31]);
  assert.deepEqual(KIND, { HELLO: 1, SEND: 2, DELIVER: 3 });
  assert.deepEqual([HEAD, MAX_FRAME], [41, 1048576]);
  assert.equal(Object.isFrozen(MAGIC) && Object.isFrozen(KIND), true);
  const src = readFileSync(new URL('./relay.mjs', import.meta.url), 'utf8');
  assert.equal([...src.matchAll(/^import /gm)].length, 0, 'relay.mjs imports nothing at all');
  assert.doesNotMatch(src, /\bimport\s*\(/, 'and loads nothing at run time');
});

test('frameOf: the header, the id, the length, the bytes', () => {
  const f = frameOf(KIND.SEND, id(7), B(1, 2, 3));
  assert.deepEqual([...f.subarray(0, 5)], [...MAGIC, 2]);
  assert.deepEqual([...f.subarray(5, 37)], [...id(7)]);
  assert.equal(new DataView(f.buffer).getUint32(37), 3);
  assert.deepEqual([...f.subarray(HEAD)], [1, 2, 3]);
  assert.equal(frameOf(KIND.HELLO, id(1)).length, HEAD, 'a hello carries no bytes');
  assert.equal(frameOf(KIND.DELIVER, id(1), new Uint8Array(0)).length, HEAD);
  assert.equal(frameOf(KIND.SEND, id(1), new Uint8Array(MAX_FRAME)).length, HEAD + MAX_FRAME, 'exactly the limit');
  for (const bad of [[0, id(1), B()], [4, id(1), B()], ['2', id(1), B()], [2, new Uint8Array(31), B()], [2, 'x', B()], [2, id(1), 'x'], [2, id(1), new Uint8Array(MAX_FRAME + 1)]]) assert.equal(frameOf(...bad), null, String(bad[0]));
});

test('createReader: frames cut from a stream however it arrives, and a stream that is not frames is refused for good', () => {
  const a = frameOf(KIND.SEND, id(2), B(9, 9)), b = frameOf(KIND.HELLO, id(3));
  const whole = new Uint8Array([...a, ...b]);
  const r = createReader();
  const got = [];
  for (let i = 0; i < whole.length; i += 5) { const x = r.push(whole.subarray(i, i + 5)); assert.equal(x.ok, true); got.push(...x.frames); }
  assert.deepEqual(got.map((f) => [f.kind, hex(f.id), [...f.bytes]]), [[2, hex(id(2)), [9, 9]], [1, hex(id(3)), []]]);
  const one = createReader().push(whole);
  assert.equal(one.frames.length, 2, 'two frames in one chunk');
  assert.deepEqual(createReader().push(a.subarray(0, HEAD - 1)), { ok: true, frames: [] }, 'not yet a whole header');
  assert.deepEqual(createReader().push(a.subarray(0, HEAD + 1)), { ok: true, frames: [] }, 'a header, its bytes not all here');
  const bad = createReader();
  assert.deepEqual(bad.push(new Uint8Array(HEAD).fill(7)), { ok: false, why: 'not a relay frame' });
  assert.deepEqual(bad.push(a), { ok: false, why: 'not a relay frame' }, 'once broken, broken');
  const k = new Uint8Array(a); k[4] = 9;
  assert.deepEqual(createReader().push(k), { ok: false, why: 'kind 9 is not a relay frame' });
  const big = new Uint8Array(a); new DataView(big.buffer).setUint32(37, MAX_FRAME + 1);
  assert.deepEqual(createReader().push(big), { ok: false, why: 'a frame of 1048577 bytes is too long' });
  const limit = new Uint8Array(HEAD); limit.set(MAGIC); limit[4] = 2; new DataView(limit.buffer).setUint32(37, MAX_FRAME);
  assert.deepEqual(createReader().push(limit), { ok: true, frames: [] }, 'a frame of exactly the limit waits for its bytes');
  assert.deepEqual(createReader().push('x'), { ok: false, why: 'not bytes' });
  for (const kind of [1, 2, 3]) { const f = new Uint8Array(a); f[4] = kind; assert.equal(createReader().push(f).frames[0].kind, kind); }
  const zero = new Uint8Array(a); zero[4] = 0;
  assert.deepEqual(createReader().push(zero), { ok: false, why: 'kind 0 is not a relay frame' });
});

const take = (relay, conn, kind, who, bytes, now = 1000) => relay.take(conn, { kind, id: id(who), bytes: bytes || new Uint8Array(0) }, now);
const delivered = (outs) => outs.map((x) => ({ conn: x.conn, to: x.bytes[5], kind: x.bytes[4], body: [...x.bytes.subarray(HEAD)] }));

test('a relay: forwards to who is here, holds for who is not, and delivers on return', () => {
  const r = createRelay();
  r.open('a'); r.open('b');
  assert.deepEqual(take(r, 'a', KIND.HELLO, 1), [], 'hello: nothing waits yet');
  assert.deepEqual(delivered(take(r, 'a', KIND.SEND, 2, B(5))), [], 'b has not said hello: held');
  assert.deepEqual(delivered(take(r, 'b', KIND.HELLO, 2)), [{ conn: 'b', to: 2, kind: KIND.DELIVER, body: [5] }], 'held frames go out on hello');
  assert.deepEqual(delivered(take(r, 'b', KIND.SEND, 1, B(6, 7))), [{ conn: 'a', to: 1, kind: KIND.DELIVER, body: [6, 7] }], 'online: straight through');
  assert.deepEqual(take(r, 'b', KIND.HELLO, 2), [], 'a second hello: the queue is already empty');
  assert.deepEqual(r.stats(), { frames: 5, delivered: 1, queued: 1, lateDelivered: 1, expired: 0, dropped: 0, refused: 0, online: 2, waiting: 0 });
  r.close('a');
  assert.deepEqual(take(r, 'b', KIND.SEND, 1, B(8)), [], 'a closed: held again');
  assert.equal(r.stats().waiting, 1);
  r.open('a2');
  assert.deepEqual(delivered(take(r, 'a2', KIND.HELLO, 1)), [{ conn: 'a2', to: 1, kind: KIND.DELIVER, body: [8] }], 'back on another connection');
  assert.equal(r.stats().online, 2);
});

test('a relay: the queue is bounded, old frames expire, a node that moves is followed', () => {
  const r = createRelay({ maxQueue: 2, ttlMs: 100 });
  r.open('a'); r.open('b');
  take(r, 'a', KIND.HELLO, 1);
  for (const x of [1, 2, 3]) take(r, 'a', KIND.SEND, 2, B(x), 1000);
  assert.equal(r.stats().dropped, 1, 'the oldest dropped past the bound');
  assert.deepEqual(delivered(take(r, 'b', KIND.HELLO, 2, undefined, 1100)).map((x) => x.body), [[2], [3]], 'at exactly the ttl: still delivered');
  take(r, 'a', KIND.SEND, 3, B(4), 1000);
  r.open('c');
  assert.deepEqual(take(r, 'c', KIND.HELLO, 3, undefined, 1101), [], 'past the ttl: expired');
  assert.equal(r.stats().expired, 1);
  // a connection that says hello as another node moves: the old id is no longer here
  r.open('d');
  take(r, 'd', KIND.HELLO, 4);
  take(r, 'd', KIND.HELLO, 5);
  assert.deepEqual(take(r, 'a', KIND.SEND, 4, B(9)), [], 'the node it left is held for');
  assert.deepEqual(delivered(take(r, 'a', KIND.SEND, 5, B(9))).map((x) => x.conn), ['d']);
  // closing a connection that another took over leaves the new one alone
  r.open('e');
  take(r, 'e', KIND.HELLO, 5);
  r.close('d');
  assert.deepEqual(delivered(take(r, 'a', KIND.SEND, 5, B(1))).map((x) => x.conn), ['e']);
  r.close('zz');
  assert.equal(r.stats().online, 4);
  // a connection whose node another connection has taken over, saying hello as a new node, leaves the takeover alone
  r.open('f'); r.open('g');
  take(r, 'f', KIND.HELLO, 6);
  take(r, 'g', KIND.HELLO, 6);
  take(r, 'f', KIND.HELLO, 7);
  assert.deepEqual(delivered(take(r, 'a', KIND.SEND, 6, B(3))).map((x) => x.conn), ['g'], 'node 6 is still on g');
  const d = createRelay({ maxQueue: 0, ttlMs: 0 });
  d.open('a'); d.open('b');
  take(d, 'a', KIND.HELLO, 1);
  for (let i = 0; i < 300; i++) take(d, 'a', KIND.SEND, 2, B(i % 256), 1000);
  assert.equal(d.stats().dropped, 44, 'a bad bound is the default of 256');
  assert.equal(delivered(take(d, 'b', KIND.HELLO, 2, undefined, 1000 + 600000)).length, 256, 'a bad ttl is the default of ten minutes');
  assert.equal(take(createRelayWithB(d), 'b', KIND.HELLO, 2, undefined, 1000 + 600001).length, 0);
});
const createRelayWithB = (d) => { d.close('b'); d.open('b'); take(d, 'a', KIND.SEND, 2, B(1), 1000); return d; };

test('a relay told to repeat delivers every held frame twice (the measurement of a faulty relay); junk is refused', () => {
  const r = createRelay({ repeat: 2 });
  r.open('a'); r.open('b');
  take(r, 'a', KIND.HELLO, 1);
  take(r, 'a', KIND.SEND, 2, B(1));
  assert.deepEqual(delivered(take(r, 'b', KIND.HELLO, 2)).map((x) => x.body), [[1], [1]]);
  assert.equal(r.stats().lateDelivered, 2);
  assert.deepEqual(delivered(take(r, 'b', KIND.SEND, 1, B(2))).map((x) => x.body), [[2]], 'a live frame goes once');
  const once = createRelay({ repeat: 3 });
  once.open('a'); once.open('b'); take(once, 'a', KIND.HELLO, 1); take(once, 'a', KIND.SEND, 2, B(1));
  assert.equal(take(once, 'b', KIND.HELLO, 2).length, 1, 'only 2 means twice');
  const j = createRelay(null);
  j.open('a');
  for (const f of [null, 'x', { kind: 1, id: id(1) }, { kind: 1, id: new Uint8Array(3), bytes: B() }, { kind: 1, id: 'x', bytes: B() }, { kind: 1, id: 'x'.repeat(32), bytes: B() }]) assert.deepEqual(j.take('a', f, 1), []);
  assert.deepEqual(j.take('nobody', { kind: 1, id: id(1), bytes: B() }, 1), [], 'an unknown connection');
  assert.deepEqual(j.take('a', { kind: 1, id: id(1), bytes: B() }, 'now'), [], 'a moment that is not a whole number');
  assert.deepEqual(j.take('a', { kind: KIND.DELIVER, id: id(1), bytes: B() }, 1), [], 'a node does not deliver to a relay');
  assert.deepEqual(j.take('a', { kind: 9, id: id(1), bytes: B() }, 1), []);
  assert.deepEqual(j.stats(), { frames: 2, delivered: 0, queued: 0, lateDelivered: 0, expired: 0, dropped: 0, refused: 10, online: 0, waiting: 0 });
  j.open('a');
  assert.equal(j.stats().refused, 10, 'opening twice keeps the connection');
});
