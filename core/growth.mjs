// ════════════════════════════════════════════════════════════════
// core/growth.mjs — whether a grown node may join the organism, and what growth does next. Organ 9 of the shared
// foundation (Phase 4, pass 2: claims G1–G4 in core/phase4/claims.json).
//
// A node grown for a gap is judged on rows it never saw, against the organism without it. It joins only if it is
// better than chance there and better than the organism was: on its own balanced accuracy, the one-sided 95% lower
// bound of a paired bootstrap must clear the chance floor, and the gain over the organism without it must be at least
// the margin with a lower bound above zero. The bootstrap is seeded, so the same rows give the same verdict anywhere.
// Growth itself is bounded: one gap at a time, the costliest untried one, never past the sealed number of nodes.
//
//   gate(truth, candidate, incumbent, policy) → { pass, why, n, ba, baLow, incBa, diff, diffLow }
//        truth: [0|1], candidate: [0|1], incumbent: [0|1|null] (null: nobody answered), one per GATE row
//   nextStep(gaps, state, policy)             → { gap } | { stop }   state = { tried: [skills], grown }
//   baOf(truth, labels, rows?)                → balanced accuracy, an unanswered row counted wrong
//
// Pure and total: what cannot be judged is refused with its reason, never thrown.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════

export const MARGIN = 0.02, RESAMPLES = 2000, SEED = 2026, LOWER = 0.05;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isBit = (x) => x === 0 || x === 1;
const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 0);

/** mulberry32: one seeded stream, the same on every machine */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Balanced accuracy of labels against the truth over the given rows (all rows if none given). */
export function baOf(truth, labels, rows) {
  let pos = 0, neg = 0, tp = 0, tn = 0;
  const each = Array.isArray(rows) ? rows : truth.map((_, i) => i);
  for (const i of each) {
    if (truth[i] === 1) { pos++; if (labels[i] === 1) tp++; } else { neg++; if (labels[i] === 0) tn++; }
  }
  const rates = [];
  if (pos > 0) rates.push(tp / pos);
  if (neg > 0) rates.push(tn / neg);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
}

/** The gate: may this candidate join? */
export function gate(truth, candidate, incumbent, policy) {
  const floor = isObj(policy) && Number.isFinite(policy.chanceFloor) ? policy.chanceFloor : 0.55;
  if (!Array.isArray(truth) || !Array.isArray(candidate) || !Array.isArray(incumbent)) return { pass: false, why: 'the gate needs the truth and both sets of labels' };
  const n = truth.length;
  if (n === 0 || candidate.length !== n || incumbent.length !== n) return { pass: false, why: 'the labels do not line up with the rows', n };
  if (!truth.every(isBit) || !candidate.every(isBit) || !incumbent.every((x) => x === null || isBit(x))) return { pass: false, why: 'a label is not 0, 1 (or, for the organism without it, nobody)', n };
  const ba = baOf(truth, candidate), incBa = baOf(truth, incumbent);
  const r = rng(SEED), bas = new Float64Array(RESAMPLES), diffs = new Float64Array(RESAMPLES), pick = new Array(n);
  for (let k = 0; k < RESAMPLES; k++) {
    for (let j = 0; j < n; j++) pick[j] = Math.floor(r() * n);
    const b = baOf(truth, candidate, pick);
    bas[k] = b;
    diffs[k] = b - baOf(truth, incumbent, pick);
  }
  bas.sort(); diffs.sort();
  const at = Math.floor(LOWER * RESAMPLES);
  const out = { n, ba: round6(ba), baLow: round6(bas[at]), incBa: round6(incBa), diff: round6(ba - incBa), diffLow: round6(diffs[at]) };
  if (!(out.baLow > floor)) return { pass: false, why: 'not better than chance: the lower bound on its balanced accuracy is not above ' + floor, ...out };
  if (!(out.diff >= MARGIN)) return { pass: false, why: 'not better than the organism without it by ' + MARGIN, ...out };
  if (!(out.diffLow > 0)) return { pass: false, why: 'its gain is not sure: the lower bound on the gain is not above 0', ...out };
  return { pass: true, why: 'better than chance and better than the organism without it', ...out };
}

/** What growth does next: the costliest gap not yet tried, or the rule it stops by. */
export function nextStep(gaps, state, policy) {
  const max = isObj(policy) && Number.isSafeInteger(policy.maxGrown) ? policy.maxGrown : 0;
  const s = isObj(state) ? state : {}, grown = Number.isSafeInteger(s.grown) ? s.grown : 0, tried = new Set(Array.isArray(s.tried) ? s.tried : []);
  const list = Array.isArray(gaps) ? gaps.filter((g) => isObj(g) && typeof g.skill === 'string') : [];
  if (grown >= max) return { stop: 'a limit was reached: ' + max + ' nodes grown' };
  if (list.length === 0) return { stop: 'no gap left' };
  const open = list.filter((g) => !tried.has(g.skill));
  if (open.length === 0) return { stop: 'every gap was tried' };
  return { gap: open[0] };
}
