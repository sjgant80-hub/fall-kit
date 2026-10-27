// ════════════════════════════════════════════════════════════════
// core/site.mjs — the door of a living website. Organ 10 of the shared foundation (Phase 5: claims D1–D4, L1 and F1
// in core/phase5/claims.json).
//
// A static website meets the world in a few ways only: the address it was opened at, the words a visitor types, a
// record a visitor fills in, and the packets other nodes send it. Packets are heard by the site's own node
// (node.mjs: the LIGHT door and the immune exchange). Everything else crosses this door first, on raw bytes, before
// any code uses it:
//
//   perceive(bytes)          → what the site sees before it trusts anything: size, whether it is UTF-8, characters,
//                              lines, control and bidirectional characters, markup brackets and links. Integers only.
//   makeDoor(names)          → the door for one page: the names it declares (the ids it links to) and a version that
//                              changes when they do.
//   door(request, door)      → { ok, kind, value } | { ok: false, kind, stage, why }, request = { kind, bytes }:
//       address  size (≤ 64 bytes) → utf8 → grammar (#name) → name (one the page declares); empty or '#' is the top
//       message  size (1–2,000 bytes) → utf8 → chars (no control character but tab and line breaks, no bidi control)
//       form     the edge's own inbound (edge.mjs): size → utf8 → json → the record's declared shape
//   take(library, request, door)
//                            → the door with a memory: what was refused once is refused on sight by the SHA-256 of
//                              its bytes, its kind and the door's version, before the door does any work. Nothing that
//                              was let in is ever kept. The library is bounded (MAX_LIBRARY) and changed in place.
//   adopt(library, antigens, door)
//                            → a peer's refused requests, taken only after this door refuses the same bytes itself:
//                              no peer can make this site refuse what its own door would let in.
//
// A message is never parsed: it is text, and stays text. Pure and total apart from the library it is handed: garbage
// in is a refusal naming its stage, never a throw.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { sha256 } from './vendor/light/sha256.mjs';
import { inbound } from './edge.mjs';

export const KINDS = Object.freeze(['address', 'message', 'form']);
export const LIMITS = Object.freeze({ address: 64, message: 2000, form: 4096 });
export const MAX_LIBRARY = 8192, MAX_ANTIGENS = 64, MAX_ANTIGEN_BYTES = 2048;
export const NAME = /^[a-z0-9-]{1,40}$/;
export const RECORD = Object.freeze({
  type: 'object',
  fields: { account: { type: 'int', min: 1, max: 99999999 }, period: { type: 'int', min: 0, max: 1199 }, amount: { type: 'int', min: 0, max: 100000000 } },
  required: ['account', 'period', 'amount'],
  extra: false,
});
const VERSION = 'fall-kit.site.door.v1';
const HEX = /^(?:[0-9a-f]{2})*$/;
const enc = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isBytes = (b) => b instanceof Uint8Array;
const no = (kind, stage, why) => ({ ok: false, kind, stage, why });

/** Text from bytes, or null when they are not UTF-8. A byte-order mark is kept, so the text says back the same bytes. */
function utf8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return null; }
}

/** A bidirectional embedding, override or isolate: text that can make what is shown differ from what is there. */
export const isBidi = (cp) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);

/** A control character a message may not carry: every C0 control but tab, line feed and carriage return; DEL and C1. */
export const isControl = (cp) => (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f);

/** What the site sees in some bytes before it trusts them. Total: anything that is not bytes is no bytes. */
export function perceive(bytes) {
  const b = isBytes(bytes) ? bytes : new Uint8Array(0);
  const text = utf8(b);
  const seen = { bytes: b.length, utf8: text !== null, chars: 0, lines: 0, controls: 0, bidi: 0, markup: 0, links: 0 };
  if (text === null || text.length === 0) return seen;
  seen.lines = 1;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    seen.chars++;
    if (cp === 0x0a) seen.lines++;
    if (isBidi(cp)) seen.bidi++;
    if (isControl(cp)) seen.controls++;
    if (cp === 0x3c || cp === 0x3e) seen.markup++;
  }
  seen.links = text.split('://').length - 1;
  return seen;
}

/** The door for one page: the names it declares, sorted and without repeats, and the version that names them. */
export function makeDoor(names) {
  const list = [...new Set((Array.isArray(names) ? names : []).filter((n) => typeof n === 'string' && NAME.test(n)))].sort();
  return Object.freeze({ names: Object.freeze(list), set: new Set(list), version: hex(sha256(enc.encode(VERSION + '\n' + list.join('\n')))) });
}
const NO_NAMES = makeDoor([]);
const doorOf = (d) => (isObj(d) && d.set instanceof Set && typeof d.version === 'string' ? d : NO_NAMES);

/** One request through the door. request = { kind, bytes }. → { ok: true, kind, value } | { ok: false, kind, stage, why } */
export function door(request, d) {
  const r = isObj(request) ? request : {};
  const kind = KINDS.includes(r.kind) ? r.kind : null;
  if (kind === null) return no(null, 'kind', 'not a kind of request this site takes');
  const b = r.bytes;
  if (!isBytes(b)) return no(kind, 'size', 'not bytes');
  if (kind === 'form') {
    const v = inbound(b, { shape: RECORD, maxBytes: LIMITS.form });
    return v.ok ? { ok: true, kind, value: v.value } : no(kind, v.stage, v.why);
  }
  if (b.length > LIMITS[kind]) return no(kind, 'size', 'longer than ' + LIMITS[kind] + ' bytes');
  if (kind === 'message' && b.length === 0) return no(kind, 'size', 'an empty message');
  const text = utf8(b);
  if (text === null) return no(kind, 'utf8', 'not valid UTF-8');
  if (kind === 'message') {
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (isControl(cp)) return no(kind, 'chars', 'a control character');
      if (isBidi(cp)) return no(kind, 'chars', 'a bidirectional control');
    }
    return { ok: true, kind, value: text };
  }
  if (text === '' || text === '#') return { ok: true, kind, value: null };   // the top of the page
  if (text[0] !== '#' || !NAME.test(text.slice(1))) return no(kind, 'grammar', 'not #name');
  const name = text.slice(1);
  return doorOf(d).set.has(name) ? { ok: true, kind, value: name } : no(kind, 'name', 'not a name this page declares');
}

// ── the memory ──
export const emptyLibrary = () => ({ exact: new Map(), antigens: [], full: false });
const validLibrary = (lib) => isObj(lib) && lib.exact instanceof Map && Array.isArray(lib.antigens);
const keyOf = (kind, hash, version) => kind + '|' + hash + '|' + version;

function keep(lib, kind, bytes, stage, key) {
  if (lib.exact.size >= MAX_LIBRARY) { lib.full = true; return; }
  lib.exact.set(key, { kind, stage });
  if (bytes.length <= MAX_ANTIGEN_BYTES && lib.antigens.length < MAX_ANTIGENS) lib.antigens.push({ kind, hex: hex(bytes) });
}

/** The door with a memory. Changes the library in place; without a valid one, nothing is remembered. */
export function take(library, request, d) {
  const dd = doorOf(d), r = isObj(request) ? request : {};
  const lib = validLibrary(library) ? library : null, kind = KINDS.includes(r.kind) ? r.kind : null;
  if (lib === null || kind === null || !isBytes(r.bytes)) return { ...door(r, dd), recognised: false };
  const key = keyOf(kind, hex(sha256(r.bytes)), dd.version);
  const known = lib.exact.get(key);
  if (known !== undefined) return { ok: false, kind, stage: known.stage, why: 'recognised on sight: refused here before', recognised: true };
  const out = door(r, dd);
  if (!out.ok) keep(lib, kind, r.bytes, out.stage, key);
  return { ...out, recognised: false };
}

/** A peer's refused requests ([{ kind, hex }]), each taken only if this door refuses the same bytes. Changes the library in place. */
export function adopt(library, antigens, d) {
  const dd = doorOf(d);
  if (!validLibrary(library)) return { adopted: 0, blocked: 0, skipped: 0 };
  let adopted = 0, blocked = 0, skipped = 0;
  for (const a of Array.isArray(antigens) ? antigens.slice(0, MAX_ANTIGENS) : []) {
    if (!isObj(a) || !KINDS.includes(a.kind) || typeof a.hex !== 'string' || a.hex.length > 2 * MAX_ANTIGEN_BYTES || !HEX.test(a.hex)) { skipped++; continue; }
    const bytes = unhex(a.hex), key = keyOf(a.kind, hex(sha256(bytes)), dd.version);
    if (library.exact.has(key)) { skipped++; continue; }
    const out = door({ kind: a.kind, bytes }, dd);
    if (out.ok) { blocked++; continue; }   // this door would let it in: a peer cannot make it refuse what it admits
    keep(library, a.kind, bytes, out.stage, key);
    adopted++;
  }
  return { adopted, blocked, skipped };
}
