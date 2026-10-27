import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, LIMITS, MAX_LIBRARY, MAX_ANTIGENS, MAX_ANTIGEN_BYTES, NAME, RECORD, isBidi, isControl, perceive, makeDoor, door, emptyLibrary, take, adopt } from './site.mjs';
import { sha256 } from './vendor/light/sha256.mjs';

const enc = (s) => new TextEncoder().encode(s);
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const msg = (s) => ({ kind: 'message', bytes: enc(s) });
const addr = (s) => ({ kind: 'address', bytes: enc(s) });
const form = (v) => ({ kind: 'form', bytes: enc(typeof v === 'string' ? v : JSON.stringify(v)) });
const D = makeDoor(['top-of-it', 'start', 'mesh']);

test('the constants', () => {
  assert.deepEqual(KINDS, ['address', 'message', 'form']);
  assert.equal(Object.isFrozen(KINDS), true);
  assert.deepEqual(LIMITS, { address: 64, message: 2000, form: 4096 });
  assert.equal(Object.isFrozen(LIMITS), true);
  assert.equal(MAX_LIBRARY, 8192);
  assert.equal(MAX_ANTIGENS, 64);
  assert.equal(MAX_ANTIGEN_BYTES, 2048);
  assert.equal(Object.isFrozen(RECORD), true);
  assert.deepEqual(RECORD.required, ['account', 'period', 'amount']);
  assert.equal(RECORD.extra, false);
  assert.equal(NAME.test('a'), true);
  assert.equal(NAME.test('a'.repeat(40)), true);
  assert.equal(NAME.test('a'.repeat(41)), false);
  assert.equal(NAME.test(''), false);
  assert.equal(NAME.test('A'), false);
  assert.equal(NAME.test('a_b'), false);
  assert.equal(NAME.test('a-9'), true);
  assert.equal(NAME.test('xa\n'), false);
});

test('isControl and isBidi: every edge of every range', () => {
  for (const cp of [0x00, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0x7f, 0x80, 0x9f]) assert.equal(isControl(cp), true, cp.toString(16));
  for (const cp of [0x09, 0x0a, 0x0d, 0x20, 0x7e, 0xa0, 0x41, 0x202a]) assert.equal(isControl(cp), false, cp.toString(16));
  for (const cp of [0x202a, 0x202b, 0x202e, 0x2066, 0x2069]) assert.equal(isBidi(cp), true, cp.toString(16));
  for (const cp of [0x2029, 0x202f, 0x2065, 0x206a, 0x200f, 0x41]) assert.equal(isBidi(cp), false, cp.toString(16));
});

test('perceive: what the site sees, in integers', () => {
  assert.deepEqual(perceive(enc('hi <b>there</b>\nsee https://x.y and http://z')), { bytes: 44, utf8: true, chars: 44, lines: 2, controls: 0, bidi: 0, markup: 4, links: 2 });
  assert.deepEqual(perceive(enc('')), { bytes: 0, utf8: true, chars: 0, lines: 0, controls: 0, bidi: 0, markup: 0, links: 0 });
  assert.deepEqual(perceive(new Uint8Array([0xff, 0x41])), { bytes: 2, utf8: false, chars: 0, lines: 0, controls: 0, bidi: 0, markup: 0, links: 0 });
  assert.deepEqual(perceive('not bytes'), { bytes: 0, utf8: true, chars: 0, lines: 0, controls: 0, bidi: 0, markup: 0, links: 0 });
  assert.deepEqual(perceive(enc('a\u0007b\u202ec\u2066')), { bytes: 10, utf8: true, chars: 6, lines: 1, controls: 1, bidi: 2, markup: 0, links: 0 });
  assert.equal(perceive(enc('😀x')).chars, 2, 'a character outside the BMP is one character');
  assert.equal(perceive(enc('\n\n')).lines, 3);
  assert.equal(perceive(enc('>')).markup, 1);
  assert.equal(perceive(enc('a:/b')).links, 0);
});

test('makeDoor: the declared names, sorted and unique, and a version that names them', () => {
  const d = makeDoor(['mesh', 'start', 'mesh', 'Bad', 'a_b', 7, '', 'top-of-it']);
  assert.deepEqual(d.names, ['mesh', 'start', 'top-of-it']);
  assert.equal(Object.isFrozen(d), true);
  assert.equal(Object.isFrozen(d.names), true);
  assert.equal(d.version, D.version, 'the same names make the same door');
  assert.match(d.version, /^[0-9a-f]{64}$/);
  assert.notEqual(makeDoor(['mesh']).version, D.version);
  assert.equal(makeDoor(['start', 'mesh']).version, makeDoor(['mesh', 'start']).version, 'order does not matter');
  assert.deepEqual(makeDoor('mesh').names, []);
  assert.equal(makeDoor().version, makeDoor([]).version);
  assert.equal(makeDoor([]).version, hex(sha256(enc('fall-kit.site.door.v1\n'))));
  assert.equal(makeDoor(['a', 'b']).version, hex(sha256(enc('fall-kit.site.door.v1\na\nb'))));
});

test('door: an address is the top, or a name the page declares', () => {
  assert.deepEqual(door(addr(''), D), { ok: true, kind: 'address', value: null });
  assert.deepEqual(door(addr('#'), D), { ok: true, kind: 'address', value: null });
  assert.deepEqual(door(addr('#start'), D), { ok: true, kind: 'address', value: 'start' });
  assert.deepEqual(door(addr('#top-of-it'), D), { ok: true, kind: 'address', value: 'top-of-it' });
  assert.deepEqual(door(addr('#nope'), D), { ok: false, kind: 'address', stage: 'name', why: 'not a name this page declares' });
  assert.deepEqual(door(addr('start'), D), { ok: false, kind: 'address', stage: 'grammar', why: 'not #name' });
  assert.deepEqual(door(addr('#Start'), D).stage, 'grammar');
  assert.deepEqual(door(addr('#start '), D).stage, 'grammar');
  assert.deepEqual(door(addr('##start'), D).stage, 'grammar');
  assert.deepEqual(door(addr('#' + 'a'.repeat(41)), D).stage, 'grammar');
  assert.deepEqual(door(addr('#' + 'a'.repeat(40)), D).stage, 'name');
  assert.deepEqual(door(addr('#' + 'a'.repeat(63)), D).stage, 'grammar');
  assert.deepEqual(door(addr('#' + 'a'.repeat(64)), D), { ok: false, kind: 'address', stage: 'size', why: 'longer than 64 bytes' });
  assert.deepEqual(door({ kind: 'address', bytes: new Uint8Array([0x23, 0xff]) }, D), { ok: false, kind: 'address', stage: 'utf8', why: 'not valid UTF-8' });
  assert.deepEqual(door(addr('#start'), null), { ok: false, kind: 'address', stage: 'name', why: 'not a name this page declares' }, 'no door, no names');
  assert.deepEqual(door(addr('#start'), { set: ['start'], version: 'x' }).stage, 'name', 'a door must be one makeDoor made');
  assert.deepEqual(door(addr('#start'), { set: new Set(['start']), version: 7 }).stage, 'name');
  assert.deepEqual(door(addr('#start'), { set: new Set(['start']), version: 'x' }), { ok: true, kind: 'address', value: 'start' });
});

test('door: a message is text with no control or bidirectional character, at most 2,000 bytes', () => {
  assert.deepEqual(door(msg('hello <script>x</script>'), D), { ok: true, kind: 'message', value: 'hello <script>x</script>' });
  assert.deepEqual(door(msg('tab\tline\nreturn\r'), D), { ok: true, kind: 'message', value: 'tab\tline\nreturn\r' });
  assert.deepEqual(door(msg(''), D), { ok: false, kind: 'message', stage: 'size', why: 'an empty message' });
  assert.deepEqual(door(msg('a'.repeat(2000)), D).ok, true);
  assert.deepEqual(door(msg('a'.repeat(2001)), D), { ok: false, kind: 'message', stage: 'size', why: 'longer than 2000 bytes' });
  assert.deepEqual(door(msg('é'.repeat(1000)), D).ok, true, '2,000 bytes');
  assert.deepEqual(door(msg('é'.repeat(1000) + 'a'), D).stage, 'size', '2,001 bytes');
  assert.deepEqual(door({ kind: 'message', bytes: new Uint8Array([0x61, 0xc3]) }, D), { ok: false, kind: 'message', stage: 'utf8', why: 'not valid UTF-8' });
  assert.deepEqual(door(msg('a\u0000b'), D), { ok: false, kind: 'message', stage: 'chars', why: 'a control character' });
  assert.deepEqual(door(msg('a\u0085'), D), { ok: false, kind: 'message', stage: 'chars', why: 'a control character' });
  assert.deepEqual(door(msg('a\u202eb'), D), { ok: false, kind: 'message', stage: 'chars', why: 'a bidirectional control' });
  assert.deepEqual(door(msg('a\u2069'), D), { ok: false, kind: 'message', stage: 'chars', why: 'a bidirectional control' });
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
  const r = door({ kind: 'message', bytes: bom }, D);
  assert.equal(r.ok, true);
  assert.deepEqual(enc(r.value), bom, 'a byte-order mark is kept: the text says back the same bytes');
});

test('door: a form is a record of the declared shape, through the edge', () => {
  assert.deepEqual(door(form({ account: 1, period: 0, amount: 0 }), D), { ok: true, kind: 'form', value: { account: 1, period: 0, amount: 0 } });
  assert.deepEqual(door(form({ account: 99999999, period: 1199, amount: 100000000 }), D).ok, true);
  assert.equal(door(form({ account: 0, period: 0, amount: 0 }), D).stage, 'shape');
  assert.equal(door(form({ account: 1, period: 1200, amount: 0 }), D).stage, 'shape');
  assert.equal(door(form({ account: 1, period: 0, amount: 100000001 }), D).stage, 'shape');
  assert.equal(door(form({ account: 1, period: 0 }), D).stage, 'shape');
  assert.equal(door(form({ account: 1, period: 0, amount: 0, x: 1 }), D).stage, 'shape');
  assert.equal(door(form('{"account":1'), D).stage, 'json');
  assert.equal(door({ kind: 'form', bytes: new Uint8Array([0x7b, 0xff]) }, D).stage, 'utf8');
  assert.equal(door(form('1'.repeat(4096)), D).stage, 'shape', '4,096 bytes is let through to the shape');
  assert.equal(door(form('1'.repeat(4097)), D).stage, 'size');
  assert.equal(door({ kind: 'form', bytes: new Uint8Array(0) }, D).stage, 'size');
});

test('door: anything else is a refusal naming its stage, never a throw', () => {
  assert.deepEqual(door({ kind: 'packet', bytes: enc('x') }, D), { ok: false, kind: null, stage: 'kind', why: 'not a kind of request this site takes' });
  assert.deepEqual(door(null, D).stage, 'kind');
  assert.deepEqual(door([], D).stage, 'kind');
  assert.deepEqual(door({ kind: 'message', bytes: 'text' }, D), { ok: false, kind: 'message', stage: 'size', why: 'not bytes' });
  assert.deepEqual(door({ kind: 'address' }, D).stage, 'size');
  assert.deepEqual(door({ kind: 'form', bytes: [1, 2] }, D).stage, 'size');
  assert.deepEqual(door({ kind: 'toString', bytes: enc('x') }, D).stage, 'kind');
});

test('take: what was refused once is refused on sight; what was let in is never kept', () => {
  const lib = emptyLibrary();
  const a = take(lib, msg('a\u0000'), D);
  assert.deepEqual(a, { ok: false, kind: 'message', stage: 'chars', why: 'a control character', recognised: false });
  assert.equal(lib.exact.size, 1);
  assert.deepEqual(lib.antigens, [{ kind: 'message', hex: '6100' }]);
  const b = take(lib, msg('a\u0000'), D);
  assert.deepEqual(b, { ok: false, kind: 'message', stage: 'chars', why: 'recognised on sight: refused here before', recognised: true });
  assert.equal(lib.exact.size, 1, 'nothing new kept');
  const ok1 = take(lib, msg('fine'), D), ok2 = take(lib, msg('fine'), D);
  assert.deepEqual(ok1, { ok: true, kind: 'message', value: 'fine', recognised: false });
  assert.deepEqual(ok2, ok1, 'let in again, not recognised');
  assert.equal(lib.exact.size, 1, 'what was let in is not kept');
  assert.equal(take(lib, addr('a\u0000'), D).recognised, false, 'the same bytes as another kind are decided again');
  assert.equal(take(lib, addr('a\u0000'), D).recognised, true);
  assert.equal(take(lib, msg('a\u0000'), makeDoor(['x'])).recognised, false, 'a changed door decides again');
  assert.equal(lib.full, false);
});

test('take: without a valid library the door still decides, and nothing is remembered', () => {
  assert.deepEqual(take(null, msg('a\u0000'), D), { ok: false, kind: 'message', stage: 'chars', why: 'a control character', recognised: false });
  assert.deepEqual(take({ exact: {}, antigens: [] }, msg('fine'), D), { ok: true, kind: 'message', value: 'fine', recognised: false });
  assert.deepEqual(take({ exact: new Map() }, msg('fine'), D).recognised, false);
  const lib = emptyLibrary();
  assert.deepEqual(take(lib, { kind: 'nope', bytes: enc('x') }, D), { ok: false, kind: null, stage: 'kind', why: 'not a kind of request this site takes', recognised: false });
  assert.deepEqual(take(lib, { kind: 'message', bytes: 'x' }, D).stage, 'size');
  assert.deepEqual(take(lib, null, D).stage, 'kind');
  assert.equal(lib.exact.size, 0);
});

test('take: the library is bounded, and says when it is full', () => {
  const lib = emptyLibrary();
  for (let i = 0; i < MAX_LIBRARY; i++) take(lib, addr('#x' + i + '!'), D);
  assert.equal(lib.exact.size, MAX_LIBRARY);
  assert.equal(lib.full, false, 'exactly full is not yet over');
  assert.equal(lib.antigens.length, MAX_ANTIGENS);
  const r = take(lib, addr('#one-more!'), D);
  assert.equal(r.stage, 'grammar');
  assert.equal(lib.exact.size, MAX_LIBRARY);
  assert.equal(lib.full, true);
  assert.equal(take(lib, addr('#one-more!'), D).recognised, false, 'not kept, so decided again');
});

test('take: an antigen is kept only up to its size, and only so many', () => {
  const lib = emptyLibrary();
  take(lib, msg('a'.repeat(2001)), D);
  assert.equal(lib.antigens.length, 1);
  assert.equal(lib.antigens[0].hex.length, 2 * 2001, '2,001 bytes is within MAX_ANTIGEN_BYTES');
  const big = { kind: 'form', bytes: enc('x'.repeat(2049)) };
  take(lib, big, D);
  assert.equal(lib.antigens.length, 1, '2,049 bytes is not kept as an antigen');
  assert.equal(lib.exact.size, 2, 'but its hash is');
  const edge = { kind: 'form', bytes: enc('y'.repeat(2048)) };
  take(lib, edge, D);
  assert.equal(lib.antigens.length, 2, '2,048 bytes is');
});

test('adopt: a peer\'s refusal is taken only if this door refuses it too', () => {
  const peer = emptyLibrary();
  take(peer, msg('a\u0000'), D);
  take(peer, addr('#nope'), D);
  const strict = makeDoor(['start']), loose = makeDoor(['start', 'nope']);
  const mine = emptyLibrary();
  assert.deepEqual(adopt(mine, peer.antigens, loose), { adopted: 1, blocked: 1, skipped: 0 }, '#nope is a name here: blocked');
  assert.equal(take(mine, msg('a\u0000'), loose).recognised, true);
  assert.deepEqual(take(mine, addr('#nope'), loose), { ok: true, kind: 'address', value: 'nope', recognised: false });
  assert.deepEqual(adopt(mine, peer.antigens, loose), { adopted: 0, blocked: 1, skipped: 1 }, 'known already: skipped');
  const other = emptyLibrary();
  assert.deepEqual(adopt(other, peer.antigens, strict), { adopted: 2, blocked: 0, skipped: 0 });
  assert.equal(other.exact.get('address|' + hex(sha256(enc('#nope'))) + '|' + strict.version).stage, 'name', 'kept under this door, at this door\'s stage');
});

test('adopt: junk is skipped, never a throw, and at most MAX_ANTIGENS are read', () => {
  const lib = emptyLibrary();
  const junk = [null, 7, {}, { kind: 'message' }, { kind: 'message', hex: 5 }, { kind: 'message', hex: 'abc' }, { kind: 'message', hex: 'zz' }, { kind: 'packet', hex: '00' }, { kind: 'message', hex: '00'.repeat(2049) }, { kind: 'toString', hex: '00' }];
  assert.deepEqual(adopt(lib, junk, D), { adopted: 0, blocked: 0, skipped: 10 });
  assert.deepEqual(adopt(lib, { kind: 'message', hex: '00' }, D), { adopted: 0, blocked: 0, skipped: 0 });
  assert.deepEqual(adopt(null, [{ kind: 'message', hex: '00' }], D), { adopted: 0, blocked: 0, skipped: 0 });
  assert.deepEqual(adopt(lib, [{ kind: 'message', hex: '00'.repeat(2048) }], D), { adopted: 1, blocked: 0, skipped: 0 }, '2,048 bytes is read');
  assert.deepEqual(adopt(lib, [{ kind: 'message', hex: '' }], D), { adopted: 1, blocked: 0, skipped: 0 }, 'an empty message is refused here too');
  const many = Array.from({ length: 70 }, (_, i) => ({ kind: 'address', hex: hex(enc('#bad' + i + '!')) }));
  assert.deepEqual(adopt(emptyLibrary(), many, D), { adopted: 64, blocked: 0, skipped: 0 });
});

test('fuzz: 5,000 garbage requests, never a throw', () => {
  let s = 7;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const lib = emptyLibrary();
  const kinds = [...KINDS, 'packet', null, 7, '', 'toString'];
  for (let i = 0; i < 5000; i++) {
    const n = Math.floor(r() * 80), b = new Uint8Array(n);
    for (let j = 0; j < n; j++) b[j] = Math.floor(r() * 256);
    const req = r() < 0.1 ? [null, 7, 'x', [], { kind: 'message' }][i % 5] : { kind: kinds[Math.floor(r() * kinds.length)], bytes: r() < 0.1 ? [...b] : b };
    const out = take(lib, req, r() < 0.5 ? D : [null, {}, 7][i % 3]);
    assert.equal(typeof out.ok, 'boolean');
    if (!out.ok) assert.equal(typeof out.stage, 'string');
    perceive(r() < 0.5 ? b : req);
  }
});
