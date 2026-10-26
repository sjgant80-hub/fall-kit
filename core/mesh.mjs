// ════════════════════════════════════════════════════════════════
// core/mesh.mjs — Fall Kit's same-device mesh, in LIGHT. Organ 5 of the shared foundation (Phase 2, pass 4: claims B1
// and B2 in core/phase2/claims.json).
//
// Every estate page is served from one origin, so the pages open on one device share one browser storage and one
// BroadcastChannel. The mesh's messages were JSON objects any page could post; now each is a LIGHT packet signed by the
// device's own key (core/mesh-device.mjs keeps it, unextractable, in the origin's IndexedDB), and a page reads one only
// after the door (vendor/light/packet.mjs) has checked it: the sender is the device's slot, the signature verifies for
// the device's key, and the counter is after the last one heard from that tab. The counter carries the tab in its high
// 32 bits and the tab's own sequence in its low 32, so tabs that share the one key never trip each other's replay check.
// An old JSON message (a page still on an earlier kit) still arrives, marked as legacy, so nothing that worked stops.
//
//   counterOf(tab, seq) · tabOf(counter)       → the 64-bit counter, and the tab it names
//   speak(value, { slot, tab, seq, sign })     → { ok, bytes } | { ok: false, why }      sign(bytes) → 64 bytes
//   hearMesh(data, { slot, id, raw, verifyBytes, last })
//                                              → { ok, light: true, value, tab } | { ok, legacy: true, value }
//                                                | { ok: false, stage, why, decoded }
//      `last` is a Map of tab → the last counter heard; an admitted packet moves it on.
//
// Pure apart from the signer and verifier handed in: junk is a refusal naming its stage, never a throw.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { prepare, finish, frame, open, KINDS } from './vendor/light/packet.mjs';

export const MAX_TAB = 0xffffffff, MAX_SEQ = 0xffffffff;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const refuse = (stage, why, decoded = false) => ({ ok: false, stage, why, decoded });

/** The counter a tab's seq-th message carries: tab in the high 32 bits, seq (from 1) in the low 32. → bigint | null */
export function counterOf(tab, seq) {
  if (!Number.isSafeInteger(tab) || tab < 0 || tab > MAX_TAB) return null;
  if (!Number.isSafeInteger(seq) || seq < 1 || seq > MAX_SEQ) return null;
  return (BigInt(tab) << 32n) | BigInt(seq);
}
/** The tab a counter names. */
export const tabOf = (counter) => Number(BigInt.asUintN(64, counter) >> 32n);

/** One message, said as a LIGHT packet the device's key signs. */
export async function speak(value, ctx) {
  const c = isObj(ctx) ? ctx : {};
  const counter = counterOf(c.tab, c.seq);
  if (counter === null) return { ok: false, why: 'a tab and a sequence number, each a whole number up to 2^32 − 1 (the sequence from 1)' };
  const p = prepare({ sender: c.slot, counter, kind: KINDS.JSON, value, dictId: 0 });
  if (!p.ok) return { ok: false, why: p.why };
  let sig = null;
  try { sig = typeof c.sign === 'function' ? await c.sign(p.signed) : null; } catch { sig = null; }
  const f = finish(p.unsigned, sig instanceof Uint8Array ? sig : null);
  return f.ok ? { ok: true, bytes: f.bytes } : { ok: false, why: 'the device could not sign: ' + f.why };
}

/** One thing off the channel: a LIGHT packet through the door, an old JSON message marked legacy, or a refusal. */
export async function hearMesh(data, ctx) {
  const c = isObj(ctx) ? ctx : {};
  if (isObj(data) && !(data instanceof Uint8Array)) {
    return typeof data.kind === 'string' ? { ok: true, legacy: true, value: data } : refuse('junk', 'neither a LIGHT packet nor a mesh message');
  }
  const f = frame(data, {});
  if (!f.ok) return refuse(f.stage, f.reason);
  if (f.sender !== c.slot) return refuse('sender', 'sender ' + f.sender + ' is not this device');
  let good = false;
  try { good = typeof c.verifyBytes === 'function' && (await c.verifyBytes(c.id, f.signed, f.sig)) === true; } catch { good = false; }
  const tab = tabOf(f.counter), last = c.last instanceof Map ? c.last : new Map();
  const v = open(data, { keyFor: () => c.raw || c.id || null, verify: () => good, lastCounter: () => (last.has(tab) ? last.get(tab) : 0n) });
  if (!v.admit) return refuse(v.stage, v.reason, v.decoded === true);
  last.set(tab, v.counter);
  return { ok: true, light: true, value: v.value, tab };
}
