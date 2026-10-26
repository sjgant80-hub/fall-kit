import { test } from 'node:test';
import assert from 'node:assert/strict';
import { features, distance, mint, adopt, recognise, emptyLibrary, familyOf, hashOf, PERMANENT, KEYED, FAMILY, STAGE_INDEX, WEIGHTS, RADIUS, MAX_LIBRARY, DIMS } from './antibody.mjs';
import { prepare, finish, open, HEADER, SIG, KINDS } from './vendor/light/packet.mjs';

const K1 = 'a'.repeat(64), K2 = 'b'.repeat(64);
// a well-formed, signed-looking LIGHT packet (signature bytes chosen, not computed: these tests are about shape)
const packet = (sigByte = 7) => { const p = prepare({ sender: 3, counter: 5n, kind: KINDS.JSON, value: { t: 'ask', q: 'triage' }, dictId: 0 }); return finish(p.unsigned, new Uint8Array(SIG).fill(sigByte)).bytes; };

test('features: ten small integers, exact for a known packet', () => {
  const b = packet();
  const f = features(b, 'signature');
  assert.equal(f.length, DIMS);
  assert.equal(f[0], STAGE_INDEX.signature);
  assert.equal(f[1], Math.min(b.length, 1600) >> 4);
  assert.equal(f[2], 4, 'all four magic bytes');
  assert.equal(f[3], 1, 'version byte');
  assert.equal(f[4], KINDS.JSON, 'kind byte');
  assert.equal(f[5], 64, 'declared length matches the packet');
  assert.equal(f[6], 0, 'no dictionary');
  assert.equal(f[7], 0, 'signature not all zero');
  assert.equal(f[8], 0, 'signature s low');
  for (const x of f) assert.ok(Number.isInteger(x) && x >= 0 && x <= 256);
  const zero = finish(prepare({ sender: 3, counter: 5n, kind: KINDS.BYTES, bytes: new Uint8Array(4), dictId: 0 }).unsigned, new Uint8Array(SIG)).bytes;
  assert.equal(features(zero, 'signature')[7], 1, 'an all-zero signature is a feature');
  const high = packet(0x10);
  assert.equal(features(high, 'signature')[8], 1, 's at or above 0x10 is a malleability probe');
  assert.equal(features(packet(0x0f), 'signature')[8], 0, 'just under 0x10 is not');
});

test('features: the edges of a short or foreign packet', () => {
  assert.deepEqual(features(new Uint8Array(0), 'size'), [0, 0, 0, 256, 256, 129, 2, 0, 0, 0]);
  const text = new TextEncoder().encode("' OR 1=1 --");
  const f = features(text, 'magic');
  assert.equal(f[0], STAGE_INDEX.magic);
  assert.equal(f[2], 0, 'no LIGHT magic');
  assert.equal(f[9], 16, 'all printable');
  const lgt = Uint8Array.of(0x4c, 0x47, 0x54, 0x30);
  assert.equal(features(lgt, 'magic')[2], 3, 'three of four magic bytes');
  assert.equal(features(lgt, 'magic')[3], 256, 'no version byte at length 4');
  const five = Uint8Array.of(0x4c, 0x47, 0x54, 0x31, 9);
  assert.equal(features(five, 'version')[3], 9);
  assert.equal(features(five, 'version')[6], 2, 'no dictionary field yet');
  const nine = new Uint8Array(9); nine[8] = 1;
  assert.equal(features(nine, 'size')[6], 1, 'a dictionary id is set');
  const eight = new Uint8Array(8);
  assert.equal(features(eight, 'size')[6], 2, 'at length 8 the dictionary field is not all there');
  const nineteen = new Uint8Array(19); nineteen[18] = 1;
  assert.equal(features(nineteen, 'size')[4], 1, 'the kind byte at length 19');
  assert.equal(features(new Uint8Array(18), 'size')[4], 256, 'no kind byte at length 18');
  // the length field: declared longer, and declared shorter, than the bytes hold — clamped to ±64 around 64
  const b = packet(); const long = b.slice(); long[22] = 255;
  assert.equal(features(long, 'length')[5], Math.max(-64, Math.min(64, 255 - (b.length - HEADER - SIG))) + 64);
  const short = b.slice(); short[22] = 0;
  assert.equal(features(short, 'length')[5], Math.max(-64, Math.min(64, 0 - (b.length - HEADER - SIG))) + 64);
  const h = new Uint8Array(HEADER); h[22] = 200;
  assert.equal(features(h, 'length')[5], 128, 'clamped at +64');
  const h1 = new Uint8Array(HEADER - 1);
  assert.equal(features(h1, 'length')[5], 129, 'no length field below the header');
  assert.equal(features(new Uint8Array(HEADER + SIG - 1), 'size')[7], 0, 'no signature below the minimum');
  assert.deepEqual(features(new Uint8Array(HEADER + SIG), 'size').slice(7, 9), [1, 0], 'exactly the minimum has a signature');
  const big = new Uint8Array(4000);
  assert.equal(features(big, 'size')[1], 100, 'length capped at 1600 bytes');
  assert.equal(features(new Uint8Array(1599), 'size')[1], 99);
  // printable band edges
  assert.equal(features(Uint8Array.of(0x1f, 0x20, 0x7e, 0x7f), 'magic')[9], 8);
  assert.equal(features('nope', 'nope')[0], STAGE_INDEX.error, 'junk is an empty packet at an unknown stage');
});

test('distance: weighted L1; the stage alone puts families out of reach', () => {
  const a = features(packet(), 'signature'), b = features(packet(), 'counter');
  assert.equal(distance(a, a), 0);
  assert.equal(distance(a, b), WEIGHTS[0] * Math.abs(STAGE_INDEX.signature - STAGE_INDEX.counter));
  assert.ok(distance(a, b) > RADIUS);
  const c = a.slice(); c[9] = a[9] + 3;
  assert.equal(distance(a, c), WEIGHTS[9] * 3);
  for (let i = 0; i < DIMS; i++) { const d = a.slice(); d[i] = a[i] + 1 <= 256 ? a[i] + 1 : a[i] - 1; assert.equal(distance(a, d), WEIGHTS[i], 'dimension ' + i); }
  assert.equal(distance(a, [1, 2]), Infinity);
  assert.equal(distance('x', a), Infinity);
  assert.equal(distance(a.map(() => 257), a), Infinity, 'out of range is not a point');
  assert.equal(distance(a.map(() => -1), a), Infinity);
  assert.equal(distance(a.map(() => 1.5), a), Infinity);
  assert.equal(distance(a.map(() => 256), a.map(() => 0)), WEIGHTS.reduce((s, w) => s + w * 256, 0), 'exactly 256 is in range');
});

test('mint: an exact antibody only for a permanent stage, keyed where the key set decides', () => {
  const b = packet(), h = hashOf(b);
  for (const stage of PERMANENT) {
    const m = mint(b, { stage, keyset: K1 });
    assert.equal(m.exact.hash, h);
    assert.equal(m.exact.stage, stage);
    assert.equal(m.exact.family, FAMILY[stage]);
    assert.equal(m.exact.keyset, KEYED.includes(stage) ? K1 : null);
    assert.equal(m.shape.of, h);
    assert.deepEqual(m.shape.point, features(b, stage));
  }
  assert.deepEqual(mint(b, { stage: 'dictionary', keyset: K1 }).exact, null, 'a dictionary may be installed later');
  assert.ok(mint(b, { stage: 'dictionary', keyset: K1 }).shape, 'but it is still named');
  assert.deepEqual(mint(b, { stage: 'error', keyset: K1 }), { exact: null, shape: null }, 'an error is never minted');
  assert.deepEqual(mint(b, { stage: 'admitted', keyset: K1 }), { exact: null, shape: null });
  assert.deepEqual(mint(b, { stage: 'signature' }), { exact: null, shape: null }, 'a keyed stage needs the key set');
  assert.deepEqual(mint(b, { stage: 'signature', keyset: 'nothex' }), { exact: null, shape: null });
  assert.equal(mint(b, { stage: 'magic' }).exact.keyset, null, 'a structural stage needs no key set');
  assert.equal(mint(b, { stage: 'magic', hash: 'c'.repeat(64) }).exact.hash, 'c'.repeat(64), 'a supplied hash is used');
  assert.equal(mint(b, { stage: 'magic', hash: 'C'.repeat(64) }).exact.hash, h, 'a bad hash is recomputed');
  assert.equal(mint(b, { stage: 'magic', hash: Symbol('h') }).exact.hash, h, 'a symbol is not a hash');
  assert.deepEqual(mint(b, { stage: 'counter', keyset: Symbol('k') }), { exact: null, shape: null });
  assert.deepEqual(mint(b, null), { exact: null, shape: null });
  assert.deepEqual(mint(b, 'x'), { exact: null, shape: null });
  assert.equal(familyOf('counter'), 'replay');
  assert.equal(familyOf('nope'), 'fault');
  assert.equal(familyOf('toString'), 'fault', 'no inherited names');
});

test('adopt: valid antibodies in, junk and duplicates out, bounded, the old library untouched', () => {
  const b = packet(), m = mint(b, { stage: 'signature', keyset: K1 });
  const lib0 = emptyLibrary();
  const r = adopt(lib0, [m.exact, m.shape]);
  assert.equal(r.added, 2);
  assert.deepEqual(lib0, emptyLibrary(), 'immutable');
  assert.equal(adopt(r.library, [m.exact, m.shape]).added, 0, 'duplicates skipped');
  const other = mint(b, { stage: 'signature', keyset: K2 });
  assert.equal(adopt(r.library, [other.exact]).added, 1, 'the same bytes under another key set is another antibody');
  const shifted = { ...m.shape, point: m.shape.point.map((x, i) => (i === 9 ? x + 1 : x)) };
  assert.equal(adopt(r.library, [shifted]).added, 1, 'a different point of the same origin is kept');
  assert.equal(adopt(r.library, [{ ...m.shape, of: 'd'.repeat(64) }]).added, 1, 'the same point from another origin is kept');
  const junk = [null, 5, 'x', {}, { kind: 'exact' },
    { ...m.exact, hash: 'xyz' }, { ...m.exact, keyset: 'zz' }, { ...m.exact, keyset: Symbol('k') }, { ...m.exact, hash: Symbol('h') }, { ...m.shape, of: Symbol('o') }, { ...m.exact, stage: 'dictionary' }, { ...m.exact, family: 'malformed' }, { ...m.exact, keyset: null },
    { ...mint(b, { stage: 'magic' }).exact, keyset: K1 }, { ...m.exact, kind: 'shape' },
    { ...m.shape, point: [1] }, { ...m.shape, stage: 'error', family: 'fault' }, { ...m.shape, family: 'replay' },
    { ...m.shape, point: m.shape.point.map((x, i) => (i === 0 ? STAGE_INDEX.counter : x)) }, { ...m.shape, of: 'q' }, { ...m.shape, kind: 'exact' }];
  assert.equal(adopt(lib0, junk).added, 0, 'every junk antibody is refused');
  assert.equal(adopt('nope', [m.exact]).added, 1, 'a junk library starts empty');
  assert.equal(adopt({ exact: [], shapes: [] }, [m.exact]).added, 1, 'an array is not an exact table');
  assert.equal(adopt({ exact: null, shapes: [] }, [m.exact]).added, 1);
  assert.equal(adopt({ exact: {}, shapes: 'x' }, [m.exact]).added, 1);
  assert.equal(adopt(lib0, 'x').added, 0);
  // the bound: a library at MAX_LIBRARY adds nothing, one under adds exactly one
  const full = { exact: {}, shapes: [] };
  for (let i = 0; i < MAX_LIBRARY; i++) full.exact[i.toString(16).padStart(64, '0') + '|*'] = mint(b, { stage: 'magic' }).exact;
  assert.equal(adopt(full, [m.exact]).added, 0);
  delete full.exact[(0).toString(16).padStart(64, '0') + '|*'];
  assert.equal(adopt(full, [m.exact, other.exact]).added, 1, 'stops at the bound');
});

test('recognise: exact under the key set it was minted for; variants within reach; never across stages', () => {
  const b = packet(), m = mint(b, { stage: 'signature', keyset: K1 }), s = mint(b, { stage: 'magic' });
  const lib = adopt(emptyLibrary(), [m.exact, m.shape, s.exact]).library;
  assert.equal(recognise(lib, b, { keyset: K1 }).exact.stage, 'signature', 'with both, the keyed one is named first');
  assert.equal(recognise(lib, b, { keyset: K2 }).exact.stage, 'magic', 'the structural antibody matches under any key set');
  const only = adopt(emptyLibrary(), [m.exact, m.shape]).library;
  assert.equal(recognise(only, b, { keyset: K1 }).exact.stage, 'signature');
  assert.equal(recognise(only, b, { keyset: K2 }).exact, null, 'a keyed antibody stops matching when the key set changes');
  assert.equal(recognise(only, b, {}).exact, null);
  const v = b.slice(); v[17] ^= 1;                                      // the same forgery, another counter
  const r = recognise(only, v, { keyset: K1, stage: 'signature' });
  assert.equal(r.exact, null, 'other bytes are not the exact antibody');
  assert.equal(r.variant.of, hashOf(b), 'but they are named as its variant');
  assert.equal(r.variant.family, 'forged');
  assert.equal(r.variant.distance, 0);
  assert.equal(recognise(only, v, { keyset: K1, stage: 'counter' }).variant, null, 'never across stages');
  assert.equal(recognise(only, v, { keyset: K1 }).variant, null, 'no stage, no variant');
  // the nearest of two shapes wins, and the radius is inclusive
  const far = { ...m.shape, point: m.shape.point.map((x, i) => (i === 9 ? x + RADIUS : x)), of: 'e'.repeat(64) };
  const near = { ...m.shape, point: m.shape.point.map((x, i) => (i === 9 ? x + 1 : x)), of: 'f'.repeat(64) };
  const two = adopt(emptyLibrary(), [far, near]).library;
  assert.equal(recognise(two, b, { stage: 'signature' }).variant.of, 'f'.repeat(64));
  assert.equal(recognise(two, b, { stage: 'signature' }).variant.distance, 1);
  const rev = adopt(emptyLibrary(), [near, far]).library;
  assert.equal(recognise(rev, b, { stage: 'signature' }).variant.of, 'f'.repeat(64), 'order does not matter');
  const edge = adopt(emptyLibrary(), [far]).library;
  assert.equal(recognise(edge, b, { stage: 'signature' }).variant.distance, RADIUS, 'exactly the radius is in reach');
  const out = { ...far, point: far.point.map((x, i) => (i === 9 ? x + 1 : x)) };
  assert.equal(recognise(adopt(emptyLibrary(), [out]).library, b, { stage: 'signature' }).variant, null, 'one past it is not');
  assert.equal(recognise(lib, b, { keyset: K1, hash: 'c'.repeat(64) }).exact, null, 'a supplied hash is what is looked up');
  assert.equal(recognise(lib, b, { keyset: K1, hash: 'not-a-hash' }).exact.stage, 'signature', 'a bad supplied hash is recomputed');
  assert.equal(recognise(lib, b, { keyset: Symbol('k'), hash: Symbol('h') }).exact.stage, 'magic', 'symbols read as nothing');
  const handMade = { exact: { [hashOf(b) + '|NOT']: { ...m.exact, keyset: 'NOT' } }, shapes: [] };
  assert.equal(recognise(handMade, b, { keyset: 'NOT' }).exact, null, 'a key set that is not a SHA-256 is never looked up');
  // a tie between two variants: the one adopted first is named
  const up = { ...m.shape, point: m.shape.point.map((x, i) => (i === 9 ? x + 1 : x)), of: '1'.repeat(64) };
  const down = { ...m.shape, point: m.shape.point.map((x, i) => (i === 9 ? x - 1 : x)), of: '2'.repeat(64) };
  assert.equal(recognise(adopt(emptyLibrary(), [up, down]).library, b, { stage: 'signature' }).variant.of, '1'.repeat(64));
  assert.equal(recognise(adopt(emptyLibrary(), [down, up]).library, b, { stage: 'signature' }).variant.of, '2'.repeat(64));
  assert.deepEqual(recognise('x', b, null), { exact: null, variant: null });
  assert.equal(recognise(lib, b, { keyset: 'NOT' }).exact.stage, 'magic', 'a bad key set reads as none');
});

test('with the real door: every permanent refusal mints an antibody for exactly the stage the door named', () => {
  const ctx = { keyFor: () => null, verify: () => false, lastCounter: () => 0n };
  const b = packet();
  const cases = [new Uint8Array(3), new TextEncoder().encode('<script>x</script>' + ' '.repeat(80)), b.slice(0, b.length - 1), b];
  const tampered = b.slice(); tampered[4] = 9; cases.push(tampered);
  for (const bytes of cases) {
    const v = open(bytes, ctx);
    assert.equal(v.admit, false);
    const m = mint(bytes, { stage: v.stage, keyset: K1 });
    if (PERMANENT.includes(v.stage)) assert.equal(m.exact.stage, v.stage);
    else assert.equal(m.exact, null);
  }
});

test('total: junk into every function never throws', () => {
  const junk = [undefined, null, 0, -1, NaN, '', 'x', [], {}, new Uint8Array(0), new Uint8Array(500).fill(255), Symbol.iterator, () => 1, { stage: 'magic' }];
  for (const a of junk) for (const c of junk) {
    assert.doesNotThrow(() => features(a, c));
    assert.doesNotThrow(() => distance(a, c));
    assert.doesNotThrow(() => mint(a, c));
    assert.doesNotThrow(() => adopt(a, c));
    assert.doesNotThrow(() => recognise(a, c, c));
    assert.doesNotThrow(() => familyOf(a));
  }
});
