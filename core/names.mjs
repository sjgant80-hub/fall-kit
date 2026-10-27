// ════════════════════════════════════════════════════════════════
// core/names.mjs — a node's name, bound to its key. Organ 14 of the shared foundation (Phase 6b: claims N1–N5 in
// core/phase6b/claims.json, the fix for Phase 6's C8).
//
// A node's name is node: and the first 16 hex digits of its key (core/node.mjs assetOf). The ledger records the first
// release of a name, whoever signs it, so a name derived from a key is not yet bound to it: another key can release it
// first and hold it. This organ is the rule that binds it, held at every door:
//
//   bound(entry)              → { ok } | refusal: a release whose form is node, or whose asset is in the node: space,
//                               passes only when its form is node and its asset is the name of the key that signed it;
//                               every other entry passes, left to the gates it already meets
//   boundGate(gate)           → a gate that refuses what bound refuses and asks `gate` about the rest: it can add a
//                               refusal and never an admission
//   unboundIn(ledger)         → { ok, unbound: [{ asset, maker, at, why }] } | refusal: every release a ledger holds that
//                               breaks the rule, in the order it was recorded
//   mergeBound(into, from, opts) → a merge that refuses a target holding any release that breaks the rule before it
//                               records anything, then reconciles `from` into it through boundGate(opts.gate)
//
// Pure and total: junk in is a refusal, never a throw. mergeBound is the ledger's own reconcile, behind the rule.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import * as L from './vendor/ledger/contrib.mjs';
import { assetOf } from './node.mjs';

export const SPACE = 'node:';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const no = (why) => ({ ok: false, why });
const isKey = (k) => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

/** why a release of this asset, in this form, by this key, breaks the rule; '' when it does not */
function breaks(asset, form, by) {
  const named = typeof asset === 'string' && asset.startsWith(SPACE);
  if (form !== 'node' && !named) return '';
  if (!isKey(by)) return 'a release of ' + String(asset) + ' names no key to bind it to';
  if (form !== 'node') return asset + ' is in the node: space, a node\'s name: only the node\'s own release carries it, and this is a ' + String(form) + ' release';
  const mine = assetOf(by);
  if (asset !== mine) return 'a node is released under its own key\'s name: ' + String(asset) + ' is not the name of the key that signed it (' + mine + ' is)';
  return '';
}

export function bound(entry) {
  if (!isObj(entry)) return no('not an entry');
  if (entry.type !== 'release') return { ok: true };
  const why = breaks(entry.asset, entry.form, entry.by);
  return why ? no(why) : { ok: true };
}

export function boundGate(gate) {
  return async (entry, ledger) => {
    const b = bound(entry);
    if (!b.ok) return b;
    if (typeof gate !== 'function') return no('no gate was given behind the rule');
    return gate(entry, ledger);
  };
}

export function unboundIn(ledger) {
  if (!isObj(ledger) || !isObj(ledger.assets)) return no('not a contribution ledger');
  const unbound = [];
  for (const [asset, a] of Object.entries(ledger.assets)) {
    if (!isObj(a)) return no('not a contribution ledger');
    const why = breaks(asset, a.form, a.maker);
    if (why) unbound.push({ asset, maker: a.maker, at: a.at, why });   // a ledger's assets are kept in the order recorded
  }
  return { ok: true, unbound };
}

export async function mergeBound(into, from, opts = {}) {
  const u = unboundIn(into);
  if (!u.ok) return u;
  if (u.unbound.length) {
    const names = u.unbound.map((x) => x.asset + ' (entry ' + x.at + ', by ' + String(x.maker).slice(0, 16) + '…)');
    return { ok: false, why: 'the target does not bind names to keys, so nothing is merged into it: it holds ' + names.join(', '), unbound: u.unbound };
  }
  try { return await L.reconcile(into, from, { gate: boundGate(isObj(opts) ? opts.gate : undefined) }); } catch { return no('not a ledger that can be merged'); }
}
