// core/phase3c/judge.mjs — Phase 3c's verdicts from its facts (core/phase3c/claims.json). Pure and total: it reads the
// facts measure.mjs gathered against each sealed holds_if, so anyone can re-judge a receipt without trusting the run.
// V1 is W4 again, so it is judged by Phase 3b's own rule for W4: the same sealed bar, the same gated code. V2 compares
// the digests of W1, W2 and W3's facts, re-measured, with the same digests of Phase 3b's committed receipt.
import { RULES as W } from '../phase3b/judge.mjs';
const HEX64 = /^[0-9a-f]{64}$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const PARTS = Object.freeze(['w1', 'w2', 'w3']);

const v1 = (f) => W.W4({ w4: isObj(f.v1) ? f.v1 : {} });
function v2(f) {
  const x = isObj(f.v2) ? f.v2 : {}, now = isObj(x.now) ? x.now : {}, was = isObj(x.was) ? x.was : {};
  const same = PARTS.filter((k) => typeof now[k] === 'string' && HEX64.test(now[k]) && now[k] === was[k]);
  const differ = PARTS.filter((k) => !same.includes(k)).map((k) => k.toUpperCase());
  return [differ.length === 0, 'W1, W2 and W3 re-measured with the change: ' + same.length + ' of 3 identical to Phase 3b\'s receipt' + (differ.length > 0 ? ' (they differ in ' + differ.join(', ') + ')' : '') +
    '; SHA-256 of each: ' + PARTS.map((k) => k.toUpperCase() + ' ' + String(now[k]).slice(0, 12) + '…').join(', ')];
}
/** The sealed rules, one per claim, each (facts) → [held, measured]. */
export const RULES = Object.freeze({ V1: v1, V2: v2 });

/** claims = the sealed claims; facts = what measure.mjs measured. → verdicts in the sealed order. */
export function judge(claims, facts) {
  const cs = isObj(claims) && Array.isArray(claims.claims) ? claims.claims : [];
  const f = isObj(facts) ? facts : {};
  const ran = Array.isArray(f.passes) ? f.passes : [];
  const verdicts = cs.filter(isObj).map((c) => {
    if (!ran.includes(c.pass) || !Object.prototype.hasOwnProperty.call(RULES, c.id)) return { id: c.id, pass: c.pass, held: null, measured: 'not measured yet: pass ' + c.pass, predicted: c.predicted };
    const [held, measured] = RULES[c.id](f);
    return { id: c.id, pass: c.pass, held, measured, predicted: c.predicted };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
