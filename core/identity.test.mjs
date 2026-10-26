import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeIdentity, verifyBytes, slotOf, keysetOf, walletCrypto, hex, unhex, b64u, unb64u } from './identity.mjs';
import { sha256 } from './vendor/light/sha256.mjs';
import { keysFromSeed } from './vendor/ledger/contrib.mjs';

const seed = (n) => new Uint8Array(32).fill(n);
const enc = (s) => new TextEncoder().encode(s);

test('one seed, one key — the same key the ledger kernel derives', async () => {
  const a = await makeIdentity(seed(1)), b = await makeIdentity(seed(1)), c = await makeIdentity(seed(2));
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(a.raw.length, 32);
  assert.equal(hex(a.raw), a.id);
  assert.equal(a.ledgerKeys.pub, a.id);
  assert.equal((await keysFromSeed(seed(1))).pub, a.id);
  assert.equal(a.slot, sha256(a.raw)[0]);
  assert.equal(a.wallet.pk, b64u(a.raw));
  assert.ok(a.wallet.sk.endsWith('.' + a.wallet.pk));
  assert.ok(Object.isFrozen(a));
  const r1 = await makeIdentity(), r2 = await makeIdentity();
  assert.notEqual(r1.id, r2.id, 'without a seed the key is random');
  assert.notEqual((await makeIdentity(new Uint8Array(31).fill(1))).id, a.id, 'a seed of the wrong length is not used');
});

test('sign and verify: exactly the bytes, exactly the key', async () => {
  const a = await makeIdentity(seed(1)), b = await makeIdentity(seed(2));
  const m = enc('the bytes'), s = await a.sign(m);
  assert.equal(s.length, 64);
  assert.equal(await verifyBytes(a.id, m, s), true);
  assert.equal(await verifyBytes(b.id, m, s), false, 'another key');
  assert.equal(await verifyBytes(a.id, enc('the bytez'), s), false, 'other bytes');
  const bad = s.slice(); bad[0] ^= 1;
  assert.equal(await verifyBytes(a.id, m, bad), false, 'a changed signature');
  assert.equal(await verifyBytes(a.id, m, s.subarray(0, 63)), false, 'a short signature');
  assert.equal(await verifyBytes(a.id.slice(1), m, s), false, 'a short key');
  assert.equal(await verifyBytes(a.id.toUpperCase(), m, s), false, 'upper-case is not the form');
  assert.equal(await verifyBytes(5, m, s), false);
  assert.equal(await verifyBytes(a.id, 'the bytes', s), false, 'a string is not bytes');
  assert.equal(await verifyBytes(a.id, m, Array.from(s)), false, 'an array is not a signature');
  assert.equal(await verifyBytes('0'.repeat(64), m, s), false, 'a key that is no point on the curve fails closed');
  assert.equal(await verifyBytes(['a'.repeat(64)], m, s), false, 'a key that is not text, even if its text form looks like one');
  assert.equal(await verifyBytes(a.id, m, { length: 64 }), false, 'what WebCrypto throws on is a refusal (fail closed)');
});

test('slots and key sets', () => {
  assert.equal(slotOf(new Uint8Array(0)), sha256(new Uint8Array(0))[0]);
  assert.equal(slotOf('x'), sha256(new Uint8Array(0))[0], 'junk is the empty key');
  const k1 = 'a'.repeat(64), k2 = 'b'.repeat(64);
  assert.equal(keysetOf([k1, k2]), keysetOf([k2, k1]), 'order does not matter');
  assert.notEqual(keysetOf([k1]), keysetOf([k1, k2]));
  assert.equal(keysetOf([k1, 'junk', 7, 'A'.repeat(64)]), keysetOf([k1]), 'only keys count');
  assert.equal(keysetOf('x'), keysetOf([]));
  assert.equal(keysetOf([k1, k2]), hex(sha256(enc(k1 + '|' + k2))));
  assert.match(keysetOf([]), /^[0-9a-f]{64}$/);
});

test('the encodings round-trip', () => {
  const u = Uint8Array.from({ length: 33 }, (_, i) => (i * 37) & 255);
  assert.deepEqual(unhex(hex(u)), u);
  assert.deepEqual(unb64u(b64u(u)), u);
  assert.equal(b64u(Uint8Array.of(0xfb, 0xff)), '-_8', 'url-safe, unpadded');
  assert.deepEqual(unb64u('-_8'), Uint8Array.of(0xfb, 0xff));
  assert.deepEqual(unhex(''), new Uint8Array(0));
  assert.equal(hex(Uint8Array.of(0, 15, 255)), '000fff');
  for (const len of [1, 2, 3, 4]) assert.deepEqual(unb64u(b64u(new Uint8Array(len).fill(9))), new Uint8Array(len).fill(9));
});

test('the wallet crypto is bound to this key', async () => {
  const a = await makeIdentity(seed(1)), b = await makeIdentity(seed(2));
  const wc = walletCrypto(a);
  assert.deepEqual(await wc.generate(), { pk: a.wallet.pk, sk: a.wallet.sk });
  const s = await wc.sign('a budget token', a.wallet.sk);
  assert.match(s, /^[0-9a-f]{128}$/);
  assert.equal(await wc.verify('a budget token', s, a.wallet.pk), true);
  assert.equal(await wc.verify('a budget tokeN', s, a.wallet.pk), false);
  assert.equal(await wc.verify('a budget token', s, b.wallet.pk), false);
  assert.equal(await wc.verify('a budget token', 'zz', a.wallet.pk), false);
  assert.equal(await wc.verify('a budget token', s, 'not-a-key'), false, 'never throws');
  assert.equal(await walletCrypto(b).verify('a budget token', s, a.wallet.pk), true, 'verifying needs no secret');
  await assert.rejects(wc.sign('x', 'not.a.key'), 'a malformed secret is refused by the platform');
});
