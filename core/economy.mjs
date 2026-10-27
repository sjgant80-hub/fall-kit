// ════════════════════════════════════════════════════════════════
// core/economy.mjs — the books, checked a second way. Organ 13 of the shared foundation (Phase 6: claims C4–C6, C9 and
// C10 in core/phase6/claims.json).
//
// The contribution ledger (vendor/ledger/contrib.mjs) records signed, gated values and turns them into credits and a
// sandbox allocation. This organ is the second hand that checks it, written apart from it, and the rules the phase
// is measured by:
//
//   creditsOf(log, policy)   → { ok, credits: { key: 'digits' }, lines } | refusal: every value's units, weighed by the
//                              early weight for entries up to policy.earlyUntil, split into the maker's part, the
//                              parents' parts and the owner of that moment's rest — computed again from the log alone
//   partsOf(credits, pool)   → { ok, parts: { key: whole }, total } | refusal: a pool shared in proportion to credits,
//                              floors first, the units left one each to the largest remainders, a tie to the smaller key
//   looUnits(gain)           → the leave-one-out units of a gain in balanced accuracy: round(1,000 × gain); 0 for none
//   barredIn(text, barred, signs) → every barred word or phrase in the text (case-insensitive, a whole word or with s, es,
//                              ed, ing or er after it); with signs, the two currency signs anywhere
//   moneyNames(names, words) → every name holding one of the words: the sealed money verbs and switch makers
//
// Pure and total: junk in is a refusal or an empty list, never a throw.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
export const PPM = 1000000n;
const SIGNS = Object.freeze(['£', '$']);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const no = (why) => ({ ok: false, why });
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const isKey = (k) => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

function policyOf(p) {
  if (!isObj(p)) return null;
  const { makerPpm, lineagePpm, earlyUntil, earlyNum, earlyDen } = p;
  if (![makerPpm, lineagePpm, earlyUntil, earlyNum, earlyDen].every(whole) || earlyDen < 1 || makerPpm + lineagePpm > 1000000) return null;
  return { maker: BigInt(makerPpm), lineage: BigInt(lineagePpm), until: earlyUntil, num: BigInt(earlyNum), den: BigInt(earlyDen) };
}

/** Credits from a ledger's log, the second way. log = [{ n, entry }], as the ledger keeps it. */
export function creditsOf(log, policy) {
  const p = policyOf(policy);
  if (p === null) return no('not a policy');
  if (!Array.isArray(log)) return no('not a log');
  const assets = new Map(), out = new Map(), lines = [];
  const give = (key, amount, n, e, role) => { if (amount > 0n) { out.set(key, (out.get(key) || 0n) + amount); lines.push({ n, asset: e.asset, key, role, credit: String(amount) }); } };
  for (const link of log) {
    const e = isObj(link) && isObj(link.entry) ? link.entry : null, n = isObj(link) ? link.n : null;
    if (e === null || !whole(n)) return no('a log of linked entries');
    if (e.type === 'release') { assets.set(e.asset, { maker: e.by, owner: e.by, lineage: Array.isArray(e.lineage) ? e.lineage.slice() : [] }); continue; }
    if (e.type === 'give') { const a = assets.get(e.asset); if (a) a.owner = e.to; continue; }
    if (e.type !== 'value') continue;
    const a = assets.get(e.asset);
    if (!a || !whole(e.units)) return no('a value on an asset the log does not release');
    const units = BigInt(e.units) * (n <= p.until ? p.num : p.den);
    const maker = (units * p.maker) / PPM, k = BigInt(a.lineage.length), each = k > 0n ? (units * p.lineage) / PPM / k : 0n;
    give(a.maker, maker, n, e, 'maker');
    for (const parent of a.lineage) { const pa = assets.get(parent); if (pa) give(pa.maker, each, n, e, 'parent'); }
    give(a.owner, units - maker - each * k, n, e, 'owner');
  }
  return { ok: true, credits: Object.fromEntries([...out].map(([key, v]) => [key, String(v)])), lines, scale: Number(p.den) };
}

/** A pool shared in proportion to credits, the second way: largest remainders, a tie to the smaller key. */
export function partsOf(credits, pool) {
  if (!isObj(credits)) return no('credits are a record of keys');
  if (!whole(pool) || pool < 1) return no('a pool is a whole number of units, at least one');
  const rows = [];
  for (const key of Object.keys(credits).sort()) {   // in key order, so a tie below goes to the smaller key
    const digits = credits[key];
    if (!isKey(key) || typeof digits !== 'string' || !/^[1-9][0-9]*$/.test(digits)) return no('a credit is a key and a whole number above zero');
    rows.push({ key, c: BigInt(digits) });
  }
  const P = BigInt(pool), T = rows.reduce((s, r) => s + r.c, 0n);
  if (T === 0n) return { ok: true, parts: {}, total: 0 };
  for (const r of rows) { r.q = (r.c * P) / T; r.r = (r.c * P) % T; }
  const left = P - rows.reduce((s, r) => s + r.q, 0n), given = new Set();
  for (let u = 0n; u < left; u++) {   // fewer than the rows: each takes at most one
    let best = null;
    for (const r of rows) if (!given.has(r) && (best === null || r.r > best.r)) best = r;
    given.add(best); best.q += 1n;
  }
  const parts = Object.fromEntries(rows.map((r) => [r.key, Number(r.q)]));
  return { ok: true, parts, total: Number(rows.reduce((s, r) => s + r.q, 0n)) };
}

/** Leave-one-out units from a gain in balanced accuracy, held to 0 to 1: one unit a thousandth; none for no gain. */
export function looUnits(gain) {
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return 0;
  return Math.round(Math.min(Math.max(gain, 0), 1) * 1000);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Every barred word or phrase in a text, in the order of the list; with signs, the two currency signs too. */
export function barredIn(text, barred, signs) {
  if (typeof text !== 'string' || !Array.isArray(barred)) return [];
  const found = [];
  for (const b of barred) {
    if (typeof b !== 'string' || b.length === 0) continue;
    if (SIGNS.includes(b)) { if (signs === true && text.includes(b)) found.push(b); continue; }
    if (new RegExp('(?:^|[^a-z0-9])' + escape(b) + '(?:s|es|ed|ing|er)?(?![a-z0-9])', 'i').test(text)) found.push(b);
  }
  return found;
}

/** Every name that holds one of the words (as a part of the name, any case): the sealed money verbs and switch makers. */
export function moneyNames(names, words) {
  if (!Array.isArray(names) || !Array.isArray(words)) return [];
  const ws = words.filter((w) => typeof w === 'string' && w.length > 0).map((w) => w.toLowerCase());
  return names.filter((n) => typeof n === 'string' && ws.some((w) => n.toLowerCase().includes(w)));
}
