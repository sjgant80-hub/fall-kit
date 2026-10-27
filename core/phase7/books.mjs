// ════════════════════════════════════════════════════════════════
// core/phase7/books.mjs — Phase 7's books (claims A6, B2, B3): every node's ledger merged into one set of books from a
// genesis, through core/names.mjs (a node's name bound to its key) and a gate that re-checks every entry:
//   a release      against the node's own card (its key, its name, the digest of its card)
//   a routing value against the holder's own signed answer packet for that job: the holder is the asset's maker, the
//                  asker is the value's signer, the packet is signed by the holder and is that answer, the value names
//                  exactly it, and the answer checks by its skill (a guard answer by running the engine again on the
//                  feeds the asker sent; a stay answer by what any asker can check; a screen by its receipt)
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { frame, open } from '../vendor/light/packet.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import { unhex, verifyBytes } from '../identity.mjs';
import { digestOf, assetOf, receiptHolds } from '../node.mjs';
import { boundGate, mergeBound } from '../names.mjs';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** ctx = { cards: Map(id → card), evidence: { job: { packet, holder, asker } }, checks: { skill: answer → boolean } } */
export function booksGate(ctx) {
  return async (entry, ledger) => {
    const p = entry.proofs && entry.proofs[0];
    if (entry.type === 'release') {
      const c = ctx.cards.get(entry.by);
      if (!c) return { ok: false, why: 'these books hold no card for that key' };
      const { sig, release, ...body } = c;
      return entry.form === 'node' && entry.asset === assetOf(c.id) && entry.proofs.length === 1 && p.digest === digestOf(body) ? { ok: true } : { ok: false, why: 'the release does not match the card' };
    }
    if (entry.type === 'value' && entry.basis === 'routing') {
      const ev = ctx.evidence[entry.job], held = ledger && ledger.assets ? ledger.assets[entry.asset] : null;
      if (!ev || !held || held.maker !== ev.holder || ev.asker !== entry.by) return { ok: false, why: 'no answer packet for that job from the asset\'s own key to that asker' };
      const b = unhex(ev.packet), f = frame(b, {});
      if (!f.ok || !(await verifyBytes(ev.holder, f.signed, f.sig))) return { ok: false, why: 'the answer packet is not signed by the holder' };
      const v = open(b, { keyFor: () => unhex(ev.holder), verify: () => true, lastCounter: () => 0n });
      const m = v.admit && isObj(v.value) ? v.value : null;
      if (!m || m.t !== 'answer' || m.id !== entry.job || m.to !== entry.by) return { ok: false, why: 'the packet is not that answer' };
      if (digestOf(m.answer) !== p.digest) return { ok: false, why: 'the answer is not the one valued' };
      const check = typeof ctx.checks[m.skill] === 'function' ? ctx.checks[m.skill] : receiptHolds;
      return m.answer.verdict === 'VERIFIED' && check(m.answer) === true ? { ok: true } : { ok: false, why: 'its ' + m.skill + ' answer does not check' };
    }
    return { ok: false, why: 'not an entry these books gate' };
  };
}

/** Every ledger in, one at a time, onto books begun from `genesis`. → { ok, ledger, merged: { role: { sent, added, skipped, refused } } } */
export async function booksOf(genesis, ledgers, ctx) {
  const gate = booksGate(ctx);
  let l = (await L.record(L.empty(), genesis, {})).ledger;
  const merged = {};
  for (const [role, lg] of Object.entries(ledgers)) {
    const theirs = await L.replay(lg.log, { gate: boundGate(gate) });
    if (!theirs.ok) { merged[role] = { replayed: false, why: theirs.why }; continue; }
    const m = await mergeBound(l, theirs.ledger, { gate });
    if (!m.ok) { merged[role] = { replayed: true, merged: false, why: m.why }; continue; }
    l = m.ledger;
    merged[role] = { replayed: true, merged: true, sent: lg.log.length, added: m.added, skipped: m.skipped, refused: m.refused.map((x) => ({ n: x.n, why: x.why })) };
  }
  return { ok: true, ledger: l, merged };
}
