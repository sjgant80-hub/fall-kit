// core/phase5/judge.mjs — Phase 5's verdicts from its facts (core/phase5/claims.json). Pure and total: it reads the facts
// measure.mjs gathered (in CI, or committed from a browser tab or this machine's local model) against each sealed rule,
// so anyone can re-judge a receipt without trusting the run. A claim with no facts yet is "not measured", never guessed.
export const BAR = 49, MARGIN = 7;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, the claims, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

/** Does a host match one of the sealed edges ('*.x' is any host under x, not x itself)? */
export function isEdge(host, edges) {
  const h = str(host).toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  return list(edges).some((e) => typeof e === 'string' && (e.startsWith('*.') ? h.endsWith(e.slice(1)) && h.length > e.length - 1 : h === e));
}

const stage = (x) => (isObj(x) ? (x.ok === true ? 'admitted' : str(x.stage) || '?') : '?');
function d1(f, c) {
  const x = of(f, 'd1'), k = of(x, 'corpus'), s = of(x, 'shapes'), cc = of(c, 'corpus');
  const corpusOk = n(k.count) === cc.count && k.digest === cc.digest && n(k.admitted) === 0 && n(k.decoded) === 0;
  const shapesOk = stage(s.unpinned) === 'sender' && stage(s.changed) === 'signature' && stage(s.replayed) === 'counter' && stage(s.misaddressed) === 'message' && stage(s.control) === 'admitted';
  return [corpusOk && shapesOk, n(k.count) + ' corpus payloads heard by the site\'s node' + (k.digest === cc.digest ? '' : ' (NOT the sealed corpus)') + ': ' + n(k.admitted) + ' admitted, ' + n(k.decoded) + ' decoded; a packet from a key nobody pinned refused at ' + stage(s.unpinned) + ', one byte changed at ' + stage(s.changed) + ', heard twice at ' + stage(s.replayed) + ', addressed to another node at ' + stage(s.misaddressed) + '; the untouched control ' + stage(s.control)];
}
function d2(f, c) {
  const x = of(f, 'd2'), k = of(x, 'corpus');
  const ok = n(x.names) >= 10 && n(x.namesAdmitted) === x.names && n(k.count) === of(c, 'corpus').count && n(k.admitted) === 0;
  return [ok, n(x.namesAdmitted) + ' of the ' + n(x.names) + ' names the page declares let in; ' + n(k.admitted) + ' of ' + n(k.count) + ' corpus payloads let in as the page\'s address' + (n(k.admitted) > 0 ? ' (' + n(k.admittedEmpty) + ' of them the empty request, which the door takes as the top of the page)' : '')];
}
function d3(f, c) {
  const x = of(f, 'd3'), m = of(x, 'messages'), fm = of(x, 'forms'), count = of(c, 'corpus').count;
  const ok = n(m.count) === count && n(m.disagree) === 0 && n(m.admitted) >= 1000 && n(m.exact) === m.admitted && n(m.refused) >= 1000 && n(m.admitted) + n(m.refused) === count && n(m.unnamed) === 0
    && n(fm.count) === count && n(fm.admitted) === 0 && n(fm.good) === 10 && n(fm.goodAdmitted) === 10;
  return [ok, n(m.count) + ' payloads as messages: ' + n(m.disagree) + ' disagree with the rule written a second time; ' + n(m.admitted) + ' let in (' + n(m.exact) + ' read back byte for byte), ' + n(m.refused) + ' refused at a named stage; as a record form ' + n(fm.admitted) + ' let in; ' + n(fm.goodAdmitted) + ' of ' + n(fm.good) + ' good records let in'];
}
function d4(f) {
  const x = of(f, 'd4'), a = of(x, 'addresses'), m = of(x, 'messages'), want = of(f, 'corpus');
  const perIn = list(m.perAdmitted), perOut = list(m.perRefused);
  const ok = n(x.payloads) === want.tab && x.digest === want.tabDigest && n(a.count) === want.tab && n(a.elementsAdded) === 0
    && n(m.count) === want.tab && n(m.admitted) >= 1000 && n(m.admitted) + n(m.refused) === m.count && perIn.length === 1 && (n(m.refused) === 0 || perOut.length === 1) && n(m.textOnly) === m.admitted;
  return [ok, 'in a real tab' + (str(x.where) ? ' of ' + x.where : '') + ', ' + n(x.payloads) + ' payloads' + (x.digest === want.tabDigest ? '' : ' (NOT the sealed set)') + ': ' + n(a.elementsAdded) + ' elements added by ' + n(a.count) + ' addresses; ' + n(m.admitted) + ' messages let in, each adding ' + perIn.join(' or ') + ' template elements and ' + n(m.textOnly) + ' shown as exactly one text node; ' + n(m.refused) + ' refused, each adding ' + perOut.join(' or ')];
}
function l1(f) {
  const x = of(f, 'l1');
  const ok = n(x.refused) >= 1000 && n(x.recognisedAgain) === x.refused && n(x.admitted) >= 0 && n(x.admittedAgain) === x.admitted && n(x.recognisedWrongly) === 0 && x.full === false;
  return [ok, n(x.refused) + ' refused the first time (' + n(x.onSightFirst) + ' of them on sight, repeats in the corpus), ' + n(x.recognisedAgain) + ' recognised on sight the second time; ' + n(x.admitted) + ' let in, ' + n(x.admittedAgain) + ' let in again, ' + n(x.recognisedWrongly) + ' wrongly recognised; library ' + n(x.library) + ' of ' + n(x.bound) + (x.full === false ? ', never full' : ', FULL')];
}
function f1(f) {
  const x = of(f, 'f1');
  return [n(x.cases) === 20000 && n(x.throws) === 0 && n(x.unnamed) === 0, n(x.cases) + ' garbage requests: ' + n(x.throws) + ' throws, ' + n(x.unnamed) + ' results that were neither let in nor a refusal naming its stage'];
}
function m1(f) {
  const x = of(f, 'm1');
  const ok = n(x.fuzzed) === 20000 && n(x.outside) === 0 && n(x.throws) === 0 && n(x.valid) === 700 && n(x.validTaken) === 700;
  return [ok, n(x.fuzzed) + ' fuzzed replies: ' + n(x.outside) + ' routes outside the seven, ' + n(x.throws) + ' throws; ' + n(x.validTaken) + ' of ' + n(x.valid) + ' well-formed replies taken as their route'];
}
function mind(f, k) {
  const x = of(f, k), sealed = of(f, 'mind');
  const ok = n(x.messages) === 70 && typeof x.digest === 'string' && x.digest === sealed.digest && n(x.outside) === 0 && n(x.mindRight) >= BAR;
  return [ok, str(x.model) + ' (' + str(x.runtime) + '): ' + n(x.mindRight) + ' of ' + n(x.messages) + ' routed right by the mind\'s own proposal (bar ' + BAR + '), ' + n(x.valid) + ' replies a valid proposal, ' + n(x.outside) + ' outside the seven' + (x.digest === sealed.digest ? '' : ' — NOT the sealed messages')];
}
function m4(f) {
  const x = of(f, 'm2'), sealed = of(f, 'mind');
  const ok = n(sealed.t0Right) >= 0 && n(x.t0Right) === sealed.t0Right && n(x.mindRight) >= sealed.t0Right + MARGIN;
  return [ok, 'the mind ' + n(x.mindRight) + ' of 70, the keyword rule ' + n(sealed.t0Right) + ' (CI) / ' + n(x.t0Right) + ' (the run); bar: the mind at least ' + MARGIN + ' more'];
}
function n1(f) {
  const x = of(f, 'n1'), sc = list(x.screens).filter(isObj), tr = of(x, 'triage');
  const screensOk = sc.length === 5 && sc.length === list(x.screens).length && sc.every((s) => s.outcome === 'verified' && typeof s.expect === 'string' && s.stage === s.expect);
  const ok = n(x.processes) === 3 && screensOk && n(tr.asks) === 20 && n(tr.verified) === 20 && n(tr.receiptsHold) === 20 && n(x.messages) >= 1 && n(x.nonLight) === 0 && n(x.ledgerTriage) === tr.verified;
  return [ok, n(x.processes) + ' processes; screen: ' + sc.map((s) => s.stage + (s.stage === s.expect ? '' : ' (expected ' + s.expect + ')') + (s.outcome === 'verified' ? '' : ' [' + s.outcome + ']')).join(', ') + '; triage: ' + n(tr.verified) + ' of ' + n(tr.asks) + ' verified, ' + n(tr.receiptsHold) + ' receipts checked at the site; ' + n(x.messages) + ' messages, ' + n(x.nonLight) + ' not LIGHT; ' + n(x.ledgerTriage) + ' triage answers in the site\'s ledger (and ' + n(x.ledgerScreen) + ' screen answers)'];
}
function shared(x) {
  return stage(x.refused) === 'sender' && n(x.adopted) >= 1 && n(x.autoimmuneBlocked) === 0 && isObj(x.again) && x.again.recognised === true && x.again.ok === false && isObj(x.honest) && x.honest.ok === true;
}
const sharedText = (x) => 'the site refused it at ' + stage(x.refused) + '; the other node adopted ' + n(x.adopted) + ' antibodies after its own re-run (' + n(x.autoimmuneBlocked) + ' blocked as autoimmune); heard again there: ' + (isObj(x.again) ? (x.again.recognised === true ? 'refused on sight' : 'NOT recognised (' + stage(x.again) + ')') : '?') + '; the honest packet ' + stage(x.honest);
function n2(f) { const x = of(f, 'n2'); return [shared(x), sharedText(x)]; }
function n3(f) {
  const x = of(f, 'n3');
  return [x.channel === true && n(x.tabs) === 2 && shared(x), (x.channel === true ? 'a WebRTC channel opened between ' + n(x.tabs) + ' tabs' : 'NO channel') + '; ' + sharedText(x)];
}
function q1(f) {
  const x = of(f, 'q1');
  const ok = Array.isArray(x.unknownSources) && x.unknownSources.length === 0 && x.unsafeEval === false && n(x.inlineScripts) === 0 && Array.isArray(x.loadedOutside) && x.loadedOutside.length === 0 && Array.isArray(x.stunMissing) && x.stunMissing.length === 0 && n(x.files) >= 5;
  return [ok, n(x.files) + ' files read; policy sources outside the sealed list: ' + (list(x.unknownSources).join(', ') || 'none') + '; unsafe-eval: ' + (x.unsafeEval === false ? 'no' : 'YES') + '; inline scripts: ' + n(x.inlineScripts) + '; URLs to another host that are loaded or called: ' + n(x.loaded) + ', outside the edges or the mind\'s wake: ' + (list(x.loadedOutside).join(', ') || 'none') + '; FallLinks without an empty STUN list: ' + (list(x.stunMissing).join(', ') || 'none')];
}
function q2(f, c) {
  const x = of(f, 'q2'), a = of(x, 'asleep'), w = of(x, 'awake'), edges = list(c.edges);
  const awakeOther = list(w.other), off = awakeOther.filter((h) => !isEdge(h, edges));
  const ok = n(a.requests) >= 20 && Array.isArray(a.other) && a.other.length === 0 && n(w.requests) >= 1 && awakeOther.length >= 1 && off.length === 0;
  return [ok, 'mind asleep: ' + n(a.requests) + ' requests, to another origin: ' + (list(a.other).join(', ') || 'none') + '; mind awake: ' + n(w.requests) + ' requests, other hosts ' + (awakeOther.join(', ') || 'none') + (off.length ? ' — NOT sealed edges: ' + off.join(', ') : ', every one a sealed edge')];
}
function q3(f) {
  const x = of(f, 'q3');
  return [x.violation === true && str(x.directive).startsWith('connect-src') && x.completed === false, 'a fetch to ' + str(x.tried) + ': ' + (x.violation === true ? 'refused by the policy (' + str(x.directive) + ')' : 'NOT refused') + ', ' + (x.completed === false ? 'never completed' : 'COMPLETED')];
}
function v1(f, c) {
  const x = of(f, 'v1'), card = of(x, 'card');
  const ok = x.routed === 'digi' && typeof c.funnel === 'string' && x.followed === c.funnel && card.mine === true && card.verified === true && n(card.serial) >= 1 && Array.isArray(x.other) && x.other.length === 0;
  return [ok, 'routed to ' + str(x.routed) + ' (by ' + str(x.decidedBy) + '); followed ' + str(x.followed) + (x.followed === c.funnel ? '' : ' (NOT the sealed funnel)') + '; card #' + n(card.serial) + (card.mine === true ? ', owned by the visitor\'s own key' : ', NOT the visitor\'s') + (card.verified === true ? ', checked by kardlings\' own reader' : ', NOT checked') + '; requests to another origin: ' + (list(x.other).join(', ') || 'none')];
}
const RULES = Object.freeze({ D1: d1, D2: d2, D3: d3, D4: d4, L1: l1, F1: f1, M1: m1, M2: (f) => mind(f, 'm2'), M3: (f) => mind(f, 'm3'), M4: m4, N1: n1, N2: n2, N3: n3, Q1: q1, Q2: q2, Q3: q3, V1: v1 });
const NEEDS = Object.freeze({ M4: ['m2', 'mind'], M2: ['m2', 'mind'], M3: ['m3', 'mind'] });

/** claims = the sealed claims; facts = what measure.mjs gathered. → verdicts in the sealed order. */
export function judge(claims, facts) {
  const c = isObj(claims) ? claims : {}, cs = list(c.claims), f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((cl) => {
    const id = str(cl.id), needs = has(NEEDS, id) ? NEEDS[id] : [id.toLowerCase()];
    if (!has(RULES, id) || !needs.every((k) => isObj(f[k]))) return { id, pass: cl.pass, held: null, measured: 'not measured yet' };
    const [held, measured] = RULES[id](f, c);
    return { id, pass: cl.pass, held, measured };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
