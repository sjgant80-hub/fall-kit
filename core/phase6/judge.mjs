// core/phase6/judge.mjs — Phase 6's verdicts from its facts (core/phase6/claims.json). Pure and total: it reads the facts
// measure.mjs gathered (in CI, or committed from a browser tab) against each sealed rule, so anyone can re-judge a receipt
// without trusting the run. A claim with no facts yet is "not measured", never guessed.
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
export const HONEST = Object.freeze(['site', 'breakit', 'konomi']);

function c1(f) {
  const x = of(f, 'c1'), ns = of(x, 'nodes');
  const own = HONEST.filter((r) => isObj(ns[r]) && ns[r].release === true && n(ns[r].valuesBy) >= 1);
  const onLiar = Object.values(ns).filter(isObj).reduce((s, v) => s + Math.max(0, n(v.onLiar)), 0) + Object.values(ns).filter((v) => isObj(v) && n(v.onLiar) < 0).length;
  const ok = n(x.processes) === 4 && own.length === 3 && Object.keys(ns).length === 4 && onLiar === 0 && n(x.messages) >= 1 && n(x.nonLight) === 0;
  return [ok, n(x.processes) + ' processes; ' + HONEST.map((r) => r + ' ' + (isObj(ns[r]) ? (ns[r].release === true ? 'its release' : 'NO release') + ' and ' + n(ns[r].valuesBy) + ' values it measured' : 'no ledger')).join('; ') + '; values on the dishonest peer anywhere: ' + onLiar + '; ' + n(x.messages) + ' messages, ' + n(x.nonLight) + ' not LIGHT'];
}
function c2(f) {
  const x = of(f, 'c2'), m = of(x, 'merged');
  const each = HONEST.map((r) => (isObj(m[r]) ? m[r] : {}));
  const all = each.every((e) => e.admitted === true && e.replayed === true && e.from === true && n(e.sent) >= 1 && n(e.added) + n(e.skipped) === e.sent && Array.isArray(e.refused) && e.refused.length === 0);
  const ok = all && n(x.routing) >= 1 && n(x.checked) === x.routing && x.valuesJobs === true;
  return [ok, HONEST.map((r, i) => r + ': ' + n(each[i].sent) + ' sent, ' + n(each[i].added) + ' added, ' + n(each[i].skipped) + ' already held, ' + list(each[i].refused).length + ' refused' + (each[i].admitted === true ? '' : ' (NOT admitted: ' + str(each[i].why) + ')')).join('; ') + '; ' + n(x.routing) + ' routing values in the books, ' + n(x.checked) + ' re-checked against their answer packets'];
}
function c3(f) {
  const x = of(f, 'c3');
  const ok = x.replayed === true && x.sameHead === true && x.sameCredits === true && x.vault === true && n(x.entries) >= 1 && typeof x.booksSha === 'string';
  return [ok, n(x.entries) + ' entries replayed from nothing: ' + (x.sameHead === true ? 'the same head' : 'a DIFFERENT head') + ', ' + (x.sameCredits === true ? 'the same credits' : 'DIFFERENT credits') + '; the LIGHT vault (' + n(x.lightBytes) + ' bytes for ' + n(x.jsonBytes) + ') ' + (x.vault === true ? 'reads back the log byte for byte' : 'does NOT read back the log') + '; CI rebuilds both files byte for byte'];
}
function c4(f) {
  const x = of(f, 'c4'), ss = list(x.specialists).filter(isObj), p = of(x, 'planted');
  const good = ss.filter((s) => s.released === true && s.valued === true && Number.isFinite(s.gain) && s.units === Math.round(Math.min(Math.max(s.gain, 0), 1) * 1000));
  const ok = n(x.expected) === 4 && ss.length === 4 && good.length === 4 && p.ok === false && n(p.units) >= 1;
  return [ok, ss.map((s) => s.skill + ' (' + s.kind + ') ' + s.units + ' units for a gain of ' + s.gain + (s.valued === true ? '' : ' NOT valued')).join('; ') + '; the planted value of ' + n(p.units) + ' units ' + (p.ok === false ? 'refused: ' + str(p.why) : 'RECORDED')];
}
function c5(f) {
  const x = of(f, 'c5');
  const ok = n(x.pool) >= 1 && n(x.total) === x.pool && x.sandbox === true && x.sameParts === true && x.sameCredits === true && n(x.contributors) >= 1 && n(x.linesSum) === x.contributors && n(x.values) >= 1 && n(x.valuesWeighed) === x.values;
  return [ok, 'a pool of ' + n(x.pool) + ' shared among ' + n(x.contributors) + ' contributors: ' + n(x.total) + ' given' + (x.sameParts === true ? ', every part equal to the second computation' : ', parts NOT equal to the second computation') + (x.sameCredits === true ? ', the same credits' : ', DIFFERENT credits') + '; ' + n(x.linesSum) + ' contributors\' lines sum to their credit; ' + n(x.valuesWeighed) + ' of ' + n(x.values) + ' values weighed as sealed (' + n(x.early) + ' early)'];
}
function c6(f) {
  const x = of(f, 'c6'), lv = of(x, 'live');
  const ok = n(x.switchEntries) === 0 && x.switchOff === true && lv.ok === false && str(lv.why).startsWith('the switch is off') && Array.isArray(x.moneyNames) && x.moneyNames.length === 0 && list(x.names).length >= 1 && list(x.words).length === 16;
  return [ok, n(x.switchEntries) + ' switch entries; a live allocation: ' + (lv.ok === false ? 'refused (' + str(lv.why) + ')' : 'GIVEN') + '; exported names that are a money verb or make a switch: ' + (list(x.moneyNames).join(', ') || 'none') + ' (of ' + list(x.names).length + ', against ' + list(x.words).length + ' sealed words)'];
}
function c7(f) {
  const x = of(f, 'c7'), ns = of(x, 'nodeSwitch'), s2 = of(x, 'second');
  const ok = x.recorded === true && x.liveEqualsSandbox === true && ns.ok === false && s2.ok === false && x.booksStillOff === true;
  return [ok, 'the activator\'s fork switch ' + (x.recorded === true ? 'recorded' : 'NOT recorded') + '; the live allocation ' + (x.liveEqualsSandbox === true ? 'equals the sandbox one' : 'does NOT equal the sandbox one') + '; a node\'s switch ' + (ns.ok === false ? 'refused (' + str(ns.why) + ')' : 'RECORDED') + '; a second switch ' + (s2.ok === false ? 'refused' : 'RECORDED') + '; the books ' + (x.booksStillOff === true ? 'still off' : 'SWITCHED')];
}
function c8(f) {
  const x = of(f, 'c8'), rf = list(x.refused).filter(isObj);
  const one = rf.length === 1 && rf[0].type === 'release' && typeof rf[0].why === 'string' && rf[0].why.length > 0;
  const ok = x.squatted === true && n(x.booksEntries) >= 1 && n(x.added) + n(x.skipped) + rf.length === x.booksEntries && rf.length === list(x.refused).length && one
    && x.switched === true && n(x.pool) >= 1 && n(x.total) === x.pool && n(x.booksContributors) >= 1 && n(x.booksContributorsCovered) === x.booksContributors && n(x.networkContributors) >= 1 && n(x.networkContributorsCovered) === x.networkContributors && x.replaySame === true;
  return [ok, n(x.booksEntries) + ' entries of the books: ' + n(x.added) + ' added, ' + n(x.skipped) + ' already held, ' + rf.length + ' refused (' + (rf.map((r) => r.type + ' ' + str(r.asset) + ': ' + str(r.why)).slice(0, 3).join('; ') || 'none') + (rf.length > 3 ? '; …' : '') + '); the network switch ' + (x.switched === true ? 'recorded' : 'NOT recorded') + ', ' + n(x.total) + ' of ' + n(x.pool) + ' given, covering ' + n(x.booksContributorsCovered) + ' of the books\' ' + n(x.booksContributors) + ' contributors and ' + n(x.networkContributorsCovered) + ' of the network\'s ' + n(x.networkContributors) + '; the merged log replayed: ' + (x.replaySame === true ? 'the same allocation' : 'NOT the same')];
}
function c9(f) {
  const x = of(f, 'c9');
  return [n(x.cases) === 20000 && n(x.throws) === 0, n(x.cases) + ' garbage inputs through every function core/economy.mjs exports: ' + n(x.throws) + ' throws'];
}
function c10(f) {
  const x = of(f, 'c10'), mods = of(x, 'modules');
  const found = Object.entries(mods).filter(([, v]) => list(v).length > 0 || !Array.isArray(v));
  const says = list(x.says);
  const ok = Array.isArray(x.page) && x.page.length === 0 && Object.keys(mods).length >= 1 && found.length === 0 && ['not money', 'the switch is off', 'contribution unit'].every((s) => says.includes(s));
  return [ok, 'barred words on the page: ' + (list(x.page).join(', ') || 'none') + '; in ' + Object.keys(mods).length + ' modules: ' + (found.map(([k, v]) => k + ' (' + list(v).join(', ') + ')').join('; ') || 'none') + '; the page says ' + (says.map((s) => '"' + s + '"').join(', ') || 'none of the three')];
}
function c11(f) {
  const x = of(f, 'c11'), r = of(f, 'c3'), a = of(f, 'c5');
  const ok = typeof x.head === 'string' && x.head === r.head && x.sameCredits === true && isObj(x.parts) && isObj(a.parts) && JSON.stringify(x.parts) === JSON.stringify(a.parts);
  return [ok, 'in a real tab' + (str(x.where) ? ' of ' + x.where : '') + ': the books replayed to ' + (x.head === r.head ? 'the receipt\'s head' : 'a DIFFERENT head') + ', ' + (x.sameCredits === true ? 'the same credits' : 'DIFFERENT credits') + ', ' + (isObj(x.parts) && JSON.stringify(x.parts) === JSON.stringify(a.parts) ? 'the same sandbox parts' : 'DIFFERENT parts')];
}
const RULES = Object.freeze({ C1: c1, C2: c2, C3: c3, C4: c4, C5: c5, C6: c6, C7: c7, C8: c8, C9: c9, C10: c10, C11: c11 });
const NEEDS = Object.freeze({ C11: ['c11', 'c3', 'c5'] });

/** claims = the sealed claims; facts = what measure.mjs gathered. → verdicts in the sealed order. */
export function judge(claims, facts) {
  const cs = isObj(claims) ? list(claims.claims) : [], f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((c) => {
    const id = str(c.id), needs = has(NEEDS, id) ? NEEDS[id] : [id.toLowerCase()];
    if (!has(RULES, id) || !needs.every((k) => isObj(f[k]))) return { id, pass: c.pass, held: null, measured: 'not measured yet' };
    const [held, measured] = RULES[id](f);
    return { id, pass: c.pass, held, measured };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
