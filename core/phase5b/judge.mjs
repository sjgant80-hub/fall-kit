// core/phase5b/judge.mjs — Phase 5b's verdicts from its facts (core/phase5b/claims.json). Pure and total: the facts are
// measure.mjs's (in CI) and the tab's (committed in core/phase5b/local/tab.json), whose every count CI has re-derived from
// the tab's raw replies; a count the recount does not reproduce fails its claim. A claim with no facts is "not measured".
export const BAR = 49, MARGIN = 7;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

/** A set the tab measured, against its sealed digest, with the recount's verdict. */
function setOk(t, digest) {
  return n(t.messages) === 70 && typeof t.digest === 'string' && t.digest === digest && Array.isArray(t.recountDiffers) && t.recountDiffers.length === 0 && n(t.outside) === 0;
}
const recountText = (t) => (Array.isArray(t.recountDiffers) && t.recountDiffers.length === 0 ? 'every count re-derived from the raw replies' : 'the recount from the raw replies DIFFERS (' + list(t.recountDiffers).join(', ') + ')');

function b1(f) {
  const t = of(f, 'sealed'), want = of(f, 'digests');
  const ok = setOk(t, want.sealed) && n(t.valid) === 70;
  return [ok, n(t.valid) + ' of ' + n(t.messages) + ' replies a proposal' + (t.digest === want.sealed ? '' : ' (NOT Phase 5\'s sealed messages)') + ', ' + n(t.outside) + ' routes outside the seven; ' + recountText(t)];
}
function b2(f) {
  const t = of(f, 'sealed'), want = of(f, 'digests');
  return [setOk(t, want.sealed) && n(t.mindRight) >= BAR, 'the mind\'s own proposal right for ' + n(t.mindRight) + ' of ' + n(t.messages) + ' (bar ' + BAR + '); ' + recountText(t)];
}
function b3(f) {
  const t = of(f, 'fresh'), want = of(f, 'digests');
  const ok = setOk(t, want.fresh) && n(t.keywordRight) >= 0 && n(t.keywordRight) === n(want.freshKeywordRight) && n(t.keywordsFirstRight) >= t.keywordRight + MARGIN;
  return [ok, 'on the 70 fresh messages' + (t.digest === want.fresh ? '' : ' (NOT the sealed fresh set)') + ': keyword-first right ' + n(t.keywordsFirstRight) + ', the keyword rule alone ' + n(t.keywordRight) + ' (CI ' + n(want.freshKeywordRight) + '); bar: at least ' + MARGIN + ' more; the mind asked about ' + n(t.askedOfMind) + '; ' + recountText(t)];
}
function b4(f) {
  const t = of(f, 'fresh'), want = of(f, 'digests');
  return [setOk(t, want.fresh) && n(t.keywordsFirstRight) >= 0 && n(t.keywordsFirstRight) >= n(t.mindFirstRight), 'keyword-first right ' + n(t.keywordsFirstRight) + ', mind-first (Phase 5\'s policy) ' + n(t.mindFirstRight) + ', on the same fresh messages and replies'];
}
function b5(f) {
  const x = of(f, 'b5');
  return [x.reproduced === true, 'Phase 5\'s receipt, measured again at this commit: ' + (x.reproduced === true ? 'byte for byte the same' : 'DIFFERENT' + (str(x.why) ? ' (' + x.why + ')' : ''))];
}
function b6(f) {
  const x = of(f, 'b6');
  return [n(x.cases) === 20000 && n(x.outside) === 0 && n(x.throws) === 0, n(x.cases) + ' fuzzed replies and messages through keyword-first: ' + n(x.outside) + ' routes outside the seven, ' + n(x.throws) + ' throws'];
}
const RULES = Object.freeze({ B1: b1, B2: b2, B3: b3, B4: b4, B5: b5, B6: b6 });
const NEEDS = Object.freeze({ B1: ['sealed', 'digests'], B2: ['sealed', 'digests'], B3: ['fresh', 'digests'], B4: ['fresh', 'digests'], B5: ['b5'], B6: ['b6'] });

/** claims = the sealed claims; facts = what measure.mjs gathered. → verdicts in the sealed order. */
export function judge(claims, facts) {
  const cs = isObj(claims) ? list(claims.claims) : [], f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((c) => {
    const id = str(c.id);
    if (!has(RULES, id) || !NEEDS[id].every((k) => isObj(f[k]))) return { id, held: null, measured: 'not measured yet', predicted: c.predicted };
    const [held, measured] = RULES[id](f);
    return { id, held, measured, predicted: c.predicted };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
