// core/phase6b/judge.mjs — Phase 6b's verdicts from its facts (core/phase6b/claims.json). Pure and total: it reads the facts
// measure.mjs gathered (in CI, or committed from a browser tab) against each sealed rule, so anyone can re-judge the receipt
// without trusting the run. A claim with no facts yet is "not measured", never guessed.
export const BOOKS = 52, BOOKS_CONTRIBUTORS = 4, NETWORK_CONTRIBUTORS = 3, FUZZ = 10000, C8_REFUSED = 11;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : NaN);   // a count that is not one equals nothing, and sums to nothing
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idsOf = (claims) => list(isObj(claims) ? claims.attacks : null).filter(isObj).map((a) => str(a.id));

function n1(f, claims) {
  const x = of(f, 'n1'), as = list(x.attacks).filter(isObj), b = of(x, 'books'), w = of(x, 'network'), p = of(x, 'pairs'), z = of(x, 'fuzz');
  const named = as.filter((a) => a.ok === false && str(a.asset) !== '' && str(a.why).includes(a.asset));
  const sealed = idsOf(claims);
  const ok = sealed.length >= 1 && same(as.map((a) => a.id), sealed) && named.length === sealed.length
    && n(b.entries) >= 1 && n(b.bound) === b.entries && n(w.entries) >= 1 && n(w.bound) === w.entries
    && n(p.total) >= 1 && n(p.right) === p.total && n(z.cases) === FUZZ && n(z.throws) === 0 && n(z.shaped) === z.cases;
  return [ok, named.length + ' of ' + sealed.length + ' sealed attacks refused, each naming its asset; ' + n(b.bound) + ' of the books\' ' + n(b.entries) + ' entries and ' + n(w.bound) + ' of the bound network\'s ' + n(w.entries) + ' pass the rule; ' + n(p.right) + ' of ' + n(p.total) + ' key and name pairs judged right (a name passes for its own key only); ' + n(z.cases) + ' fuzzed values, ' + n(z.throws) + ' throws, ' + n(z.shaped) + ' answered ok true, or false with a reason'];
}
function n2(f, claims) {
  const x = of(f, 'n2'), d = list(x.atDoor).filter(isObj), own = list(x.own).filter(isObj);
  const sealed = idsOf(claims), refused = d.filter((a) => a.ok === false);
  const ok = sealed.length >= 1 && same(d.map((a) => a.id), sealed) && refused.length === sealed.length && own.length === NETWORK_CONTRIBUTORS && own.every((o) => o.released === true && o.valued === true) && n(x.unbound) === 0;
  return [ok, refused.length + ' of ' + sealed.length + ' attacks refused at the network\'s own door; ' + own.filter((o) => o.released === true).length + ' of its ' + own.length + ' contributors released under their own names, ' + own.filter((o) => o.valued === true).length + ' valued; releases in it that break the rule: ' + n(x.unbound)];
}
function n3(f) {
  const x = of(f, 'n3'), sv = of(x, 'siteValues'), r = list(x.refused);
  const ok = x.merged === true && n(x.booksEntries) === BOOKS && n(x.added) + n(x.skipped) === x.booksEntries && r.length === 0 && x.genesisOnly === true && x.siteRelease === true && n(sv.books) >= 1 && n(sv.merged) === sv.books;
  return [ok, x.merged === true ? n(x.booksEntries) + ' entries of the books: ' + n(x.added) + ' added, ' + n(x.skipped) + ' already held' + (x.genesisOnly === true ? ' (the genesis)' : ' (NOT only the genesis)') + ', ' + r.length + ' refused; the living site\'s release ' + (x.siteRelease === true ? 'recorded under its own key' : 'NOT recorded') + ', ' + n(sv.merged) + ' of the ' + n(sv.books) + ' values on its asset recorded' : 'the merge was refused: ' + str(x.why)];
}
function n4(f) {
  const x = of(f, 'n4');
  const ok = x.switched === true && n(x.pool) >= 1 && n(x.total) === x.pool && n(x.booksContributors) === BOOKS_CONTRIBUTORS && n(x.booksContributorsCovered) === x.booksContributors && x.siteCovered === true
    && n(x.networkContributors) === NETWORK_CONTRIBUTORS && n(x.networkContributorsCovered) === x.networkContributors && x.replayed === true && x.replaySame === true;
  return [ok, 'the network switch ' + (x.switched === true ? 'recorded' : 'NOT recorded') + ', ' + n(x.total) + ' of ' + n(x.pool) + ' given, covering ' + n(x.booksContributorsCovered) + ' of the books\' ' + n(x.booksContributors) + ' contributors (the living site ' + (x.siteCovered === true ? 'among them' : 'NOT among them') + ') and ' + n(x.networkContributorsCovered) + ' of the network\'s ' + n(x.networkContributors) + '; the merged log replayed through the rule: ' + (x.replayed === true ? (x.replaySame === true ? 'the same allocation' : 'a DIFFERENT allocation') : 'REFUSED, ' + str(x.replayWhy))];
}
function n5(f) {
  const x = of(f, 'n5'), u = list(x.unbound).filter(isObj), want = list(x.expected);
  const ok = x.squatted === true && x.refused === true && n(x.recorded) === 0 && want.length >= 1 && same(u.map((a) => a.asset), want) && x.siteNamed === true && x.unchanged === true;
  return [ok, 'Phase 6\'s mock network ' + (x.squatted === true ? 'holding the squat' : 'NOT holding the squat') + ': the merge ' + (x.refused === true ? 'refused' : 'NOT refused') + ', ' + n(x.recorded) + ' entries recorded; it named ' + u.length + ' releases that break the rule (' + u.map((a) => str(a.asset)).join(', ') + ')' + (same(u.map((a) => a.asset), want) ? ', every one a second count finds' : ', NOT the ' + want.length + ' a second count finds') + '; the site\'s name under another key ' + (x.siteNamed === true ? 'named' : 'NOT named') + '; the target ' + (x.unchanged === true ? 'unchanged' : 'CHANGED')];
}
function n6(f) {
  const x = of(f, 'n6'), c = of(x, 'control'), s = of(x, 'sealed');
  const ok = same(c, s) && list(s.refused).length === C8_REFUSED && n(s.booksContributorsCovered) < n(s.booksContributors);
  return [ok, 'Phase 6\'s network path without the rule: ' + list(c.refused).length + ' refused, the books\' contributors covered ' + n(c.booksContributorsCovered) + ' of ' + n(c.booksContributors) + '; ' + (same(c, s) ? 'field for field the c8 facts of Phase 6\'s receipt' : 'NOT the c8 facts of Phase 6\'s receipt')];
}
function n7(f) {
  const x = of(f, 'n7');
  return [x.exit === 0, 'node core/phase6/measure.mjs --check exited ' + (Number.isSafeInteger(x.exit) ? x.exit : 'without a code') + ': ' + str(x.last)];
}
function n8(f) {
  const x = of(f, 'n8'), want = of(f, 'n4');
  const ok = n(x.refused) === 0 && n(x.booksEntries) === BOOKS && n(x.added) + n(x.skipped) === x.booksEntries && isObj(x.parts) && Object.keys(x.parts).length >= 1 && same(x.parts, want.parts) && x.unboundRefused === true && x.siteNamed === true;
  return [ok, 'in a tab at ' + str(x.where) + ': ' + n(x.booksEntries) + ' entries, ' + n(x.added) + ' added, ' + n(x.skipped) + ' already held, ' + n(x.refused) + ' refused; the allocation ' + (same(x.parts, want.parts) ? 'part for part this receipt\'s' : 'NOT this receipt\'s') + '; Phase 6\'s mock ' + (x.unboundRefused === true ? 'refused' : 'NOT refused') + (x.siteNamed === true ? ', naming the site\'s name' : ', NOT naming the site\'s name') + (Number.isFinite(x.seconds) ? ', in ' + x.seconds + ' s' : '')];
}
function n9(f) {
  const x = of(f, 'n9'), files = of(x, 'files'), page = list(x.page);
  const found = Object.entries(files).filter(([, w]) => !Array.isArray(w) || w.length > 0);
  const ok = has(files, 'core/names.mjs') && Object.keys(files).length >= 2 && found.length === 0 && Array.isArray(x.page) && page.length === 0;
  return [ok, Object.keys(files).length + ' modules read, ' + found.length + ' with a barred word' + (found.length ? ' (' + found.map(([p, w]) => p + ': ' + list(w).join(' ')).join('; ') + ')' : '') + '; the page text: ' + (page.length ? page.join(' ') : 'none')];
}

const RULES = Object.freeze({ N1: n1, N2: n2, N3: n3, N4: n4, N5: n5, N6: n6, N7: n7, N8: n8, N9: n9 });
const NEEDS = Object.freeze({ N8: ['n8', 'n4'] });

export function judge(claims, facts) {
  const cs = isObj(claims) ? list(claims.claims) : [], f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((c) => {
    const id = str(c.id), needs = has(NEEDS, id) ? NEEDS[id] : [id.toLowerCase()];
    if (!has(RULES, id) || !needs.every((k) => isObj(f[k]))) return { id, pass: c.pass, held: null, measured: 'not measured yet' };
    const [held, measured] = RULES[id](f, claims);
    return { id, pass: c.pass, held, measured };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
