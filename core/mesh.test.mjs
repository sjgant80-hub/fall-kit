import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counterOf, tabOf, speak, hearMesh, MAX_TAB, MAX_SEQ } from './mesh.mjs';
import { makeIdentity, verifyBytes } from './identity.mjs';
import { signedBytes, HEADER } from './vendor/light/packet.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const dev = await makeIdentity(seed(60)), other = await makeIdentity(seed(61));
const ctxOf = (last = new Map()) => ({ slot: dev.slot, id: dev.id, raw: dev.raw, verifyBytes, last });
const say = (value, tab, seq, who = dev) => speak(value, { slot: who.slot, tab, seq, sign: who.sign });

test('the constants, and the counter: tab high, sequence low', () => {
  assert.deepEqual([MAX_TAB, MAX_SEQ], [4294967295, 4294967295]);
  assert.equal(counterOf(0, 1), 1n);
  assert.equal(counterOf(1, 1), 4294967297n);
  assert.equal(counterOf(MAX_TAB, MAX_SEQ), 2n ** 64n - 1n);
  assert.equal(counterOf(7, 3), (7n << 32n) | 3n);
  for (const [t, s] of [[-1, 1], [MAX_TAB + 1, 1], [1.5, 1], ['1', 1], [0, 0], [0, MAX_SEQ + 1], [0, 2.5], [0, '1'], [null, 1]]) assert.equal(counterOf(t, s), null, t + ',' + s);
  assert.equal(tabOf(counterOf(123456, 9)), 123456);
  assert.equal(tabOf(counterOf(MAX_TAB, 1)), MAX_TAB);
  assert.equal(tabOf(5n), 0);
  assert.equal(tabOf(-1n), MAX_TAB, 'a counter is read as 64 unsigned bits');
});

test('speak: a packet the device key signs; junk is a reason, never a throw', async () => {
  const s = await say({ kind: 'ping', n: 1 }, 9, 1);
  assert.equal(s.ok, true);
  assert.deepEqual([...s.bytes.subarray(0, 4)], [0x4c, 0x47, 0x54, 0x31]);
  assert.equal(await verifyBytes(dev.id, signedBytes(s.bytes, s.bytes.length - HEADER - 64), s.bytes.subarray(s.bytes.length - 64)), true);
  for (const [t, q] of [[-1, 1], [0, 0]]) assert.deepEqual(await say({ kind: 'x' }, t, q), { ok: false, why: 'a tab and a sequence number, each a whole number up to 2^32 − 1 (the sequence from 1)' });
  assert.deepEqual(await speak({ kind: 'x' }, { slot: 300, tab: 1, seq: 1, sign: dev.sign }), { ok: false, why: 'sender is a whole number 0–255' });
  assert.deepEqual(await speak(undefined, { slot: dev.slot, tab: 1, seq: 1, sign: dev.sign }), { ok: false, why: 'the value is not JSON' });
  for (const sign of [undefined, async () => new Uint8Array(3), async () => { throw new Error('x'); }, async () => 'x'.repeat(64)]) assert.deepEqual(await speak({ kind: 'x' }, { slot: dev.slot, tab: 1, seq: 1, sign }), { ok: false, why: 'the device could not sign: a signature is 64 bytes' });
  assert.equal((await speak({ kind: 'x' }, null)).ok, false);
});

test('hearMesh: the device’s packets admitted, each tab’s counter checked on its own', async () => {
  const last = new Map();
  const a1 = await say({ kind: 'hello', from: 'a' }, 1, 1), b1 = await say({ kind: 'hello', from: 'b' }, 2, 1), a2 = await say({ kind: 'x', n: 2 }, 1, 2);
  assert.deepEqual(await hearMesh(a1.bytes, ctxOf(last)), { ok: true, light: true, value: { kind: 'hello', from: 'a' }, tab: 1 });
  assert.deepEqual(await hearMesh(b1.bytes, ctxOf(last)), { ok: true, light: true, value: { kind: 'hello', from: 'b' }, tab: 2 }, 'another tab, its own counter from 1');
  assert.equal((await hearMesh(a2.bytes, ctxOf(last))).ok, true);
  assert.deepEqual([...last.entries()], [[1, counterOf(1, 2)], [2, counterOf(2, 1)]]);
  assert.deepEqual(await hearMesh(a1.bytes, ctxOf(last)), { ok: false, stage: 'counter', why: 'counter 4294967297 is not after 4294967298: a replay, or out of order', decoded: false }, 'a replay');
  assert.equal((await hearMesh(a2.bytes, ctxOf(last))).stage, 'counter', 'the same counter twice');
  const fresh = await hearMesh(a1.bytes, { slot: dev.slot, id: dev.id, raw: dev.raw, verifyBytes });
  assert.equal(fresh.ok, true, 'no map given: nothing heard yet');
  assert.equal((await hearMesh(a1.bytes, { ...ctxOf(), last: 'x' })).ok, true, 'a map that is not a map: nothing heard yet');
});

test('hearMesh: another key, a change, the wrong slot, junk — each refused at its stage, never decoded', async () => {
  const last = new Map();
  const forged = await say({ kind: 'x' }, 1, 1, { slot: dev.slot, sign: other.sign });
  assert.deepEqual(await hearMesh(forged.bytes, ctxOf(last)), { ok: false, stage: 'signature', why: 'the signature does not verify for sender ' + dev.slot, decoded: false }, 'the device slot, another key');
  const stranger = await say({ kind: 'x' }, 1, 1, other);
  assert.notEqual(other.slot, dev.slot);
  assert.deepEqual(await hearMesh(stranger.bytes, ctxOf(last)), { ok: false, stage: 'sender', why: 'sender ' + other.slot + ' is not this device', decoded: false });
  const good = await say({ kind: 'x', n: 1 }, 3, 1);
  const t = good.bytes.slice(); t[HEADER + 1] ^= 1;
  assert.equal((await hearMesh(t, ctxOf(last))).stage, 'signature', 'one byte changed');
  assert.deepEqual(await hearMesh(new TextEncoder().encode('{"kind":"x"}'.repeat(10)), ctxOf(last)), { ok: false, stage: 'magic', why: 'not a LIGHT packet: it does not begin with LGT1', decoded: false });
  assert.equal((await hearMesh(new Uint8Array(3), ctxOf(last))).stage, 'size');
  for (const junk of [null, undefined, 5, 'text', [1, 2]]) assert.equal((await hearMesh(junk, ctxOf(last))).stage, 'size', String(junk));
  assert.deepEqual(await hearMesh({ nope: 1 }, ctxOf(last)), { ok: false, stage: 'junk', why: 'neither a LIGHT packet nor a mesh message', decoded: false });
  assert.deepEqual(await hearMesh({ kind: 5 }, ctxOf(last)), { ok: false, stage: 'junk', why: 'neither a LIGHT packet nor a mesh message', decoded: false });
  assert.equal(last.size, 0, 'nothing refused moves a counter');
  for (const v of [async () => { throw new Error('x'); }, async () => 'yes', undefined]) assert.equal((await hearMesh(good.bytes, { ...ctxOf(new Map()), verifyBytes: v })).stage, 'signature');
  assert.equal((await hearMesh(good.bytes, { ...ctxOf(new Map()), raw: null })).ok, true, 'the key named by id alone');
  assert.equal((await hearMesh(good.bytes, { ...ctxOf(new Map()), raw: null, id: null, verifyBytes: async () => true })).stage, 'sender', 'no key named at all: nobody is pinned');
  assert.equal((await hearMesh(good.bytes, null)).stage, 'sender');
});

test('hearMesh: an old JSON message still arrives, marked legacy', async () => {
  const m = { kind: 'fall-kit:hello', peerId: '/x#1', ts: 5, seedName: 'old' };
  assert.deepEqual(await hearMesh(m, ctxOf()), { ok: true, legacy: true, value: m });
});
