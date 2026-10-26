// core/phase3b/judge.mjs — Phase 3b's verdicts from its facts (core/phase3b/claims.json). Pure and total: it reads the
// facts measure.mjs gathered against each sealed holds_if, so anyone can re-judge a receipt without trusting the run.
// Every run has a control: the same scenario with Phase 3's greedy routing. W1 and W2 hold only if the control fails
// the same bar, so a scenario that could not fail cannot hold. A claim whose pass has not run is "not measured".
export const FLOOR = 50000;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0);
const of = (f, k) => (isObj(f[k]) ? f[k] : {});
const list = (x) => (Array.isArray(x) ? x.filter(isObj) : []);

/** J3's sealed bar, on one run's facts: at most 2 asks to the dead node, and every later ask to a live holder, answered. */
const routedAround = (x) => n(x.asks) >= 1 && n(x.toDead) >= 0 && x.toDead <= 2 && x.answeredAfterLastDead === true;
/** J4's sealed bar, at one asker: the honest link above the dishonest one, and the dishonest one below the floor. */
const caught = (l) => n(l.liar) >= 0 && n(l.honest) > l.liar && l.liar < FLOOR;

function w1(f) {
  const x = of(f, 'w1'), c = isObj(x.control) ? x.control : {}, before = list(x.beforeKill);
  const ok = routedAround(x) && isObj(x.control) && n(c.toDead) > 2;
  const toIt = before.filter((b) => b.to === x.killed).length;
  return [ok, (typeof x.killed === 'string' ? x.killed + ', the holder the triage asks were going to (the last triage ask of ' + toIt + ' of the ' + before.length + ' askers before the kill went to it), killed. ' : '') +
    'With the routing that shares: ' + n(x.toDead) + ' of the ' + n(x.asks) + ' asks after went to it (bar 2)' + (n(x.toDead) > 0 ? ', the last at ask ' + x.lastToDead : '') + '; every ask after that ' + (x.answeredAfterLastDead === true ? 'went to a live holder and was answered' : 'did NOT all go to a live holder and get answered') +
    '. With Phase 3\'s greedy routing, the same run: ' + n(c.toDead) + ' asks to it' + (n(c.toDead) > 2 ? ' (the scenario can fail)' : ' (NOT more than 2: the scenario could not fail)')];
}
function w2(f) {
  const x = of(f, 'w2'), ls = list(x.links), cs = list(x.control);
  const ok = ls.length >= 1 && ls.every(caught) && cs.some((l) => n(l.liar) >= FLOOR);   // the control: a measured dishonest link not below the floor
  const line = (l) => String(l.asker) + ': honest ' + n(l.honest) + ', dishonest ' + n(l.liar);
  return [ok, 'With the routing that shares: ' + ls.map((l) => line(l) + (caught(l) ? '' : ' (NOT)')).join('; ') + '. With Phase 3\'s greedy routing: ' + cs.map(line).join('; ') + ' (parts of a million; the floor is ' + FLOOR + ')'];
}
function w3(f) {
  const x = of(f, 'w3'), ls = list(x.liarAsks);
  const once = (a) => n(a.asks) === 1 && n(a.firstAt) >= 0 && a.firstAt < 20;
  const ok = n(x.asks) >= 1 && n(x.toHolder) === x.asks && n(x.answered) === x.asks && ls.length === 4 && ls.every(once) && n(x.triageAfter20) >= 1 && n(x.toHonestAfter20) * 10 >= x.triageAfter20 * 9;
  return [ok, n(x.toHolder) + ' of ' + n(x.asks) + ' asks went to a holder of their skill, ' + n(x.answered) + ' answered; the dishonest holder was asked by ' + ls.map((a) => String(a.asker) + ' ' + n(a.asks) + '×' + (n(a.asks) > 0 ? ' (first at ask ' + n(a.firstAt) + ')' : '') + (once(a) ? '' : ' (NOT once within the first 20)')).join(', ') +
    '; after the first 20, ' + n(x.toHonestAfter20) + ' of ' + n(x.triageAfter20) + ' triage asks (' + pct(n(x.toHonestAfter20), n(x.triageAfter20)) + '%) went to an honest holder (bar 90%). With Phase 3\'s greedy routing the dishonest holder was asked ' + n(x.controlLiarAsks) + ' times'];
}
function w4(f) {
  const x = of(f, 'w4'), s = of(x, 'silence'), l = of(x, 'lied'), g = of(x, 'stranger'), nx = of(x, 'next');
  const k = n(x.askers);
  const ok = k === 4 && n(x.linksCompared) >= 1 && n(x.linksChanged) === 0 && n(s.sent) === k && n(s.quiet) === k && n(s.answered) === k && n(s.quietAfter) === 0 &&
    n(l.sent) === 4 * k && n(l.refused) === l.sent && n(l.adopted) === 0 && n(g.sent) === k && n(g.refusedAtDoor) === k && n(nx.asks) === k && n(nx.toHonest) === k && n(nx.answered) === k;
  const whys = isObj(l.why) ? Object.entries(l.why).filter(([, c]) => n(c) > 0).map(([w, c]) => c + ' because ' + w).join(', ') : '';
  return [ok, 'the dishonest member sent each of ' + k + ' askers a silence note about a live honest holder: ' + n(s.quiet) + ' made it quiet and probed it, ' + n(s.answered) + ' probes answered, ' + n(s.quietAfter) + ' askers still holding it quiet after; ' +
    n(l.sent) + ' false lied notes: ' + n(l.refused) + ' refused' + (whys ? ' (' + whys + ')' : '') + ', ' + n(l.already) + ' answered as already judged, ' + n(l.adopted) + ' counted; the stranger\'s ' + n(g.sent) + ' notes: ' + n(g.refusedAtDoor) + ' refused at the door; ' +
    n(x.linksChanged) + ' of ' + n(x.linksCompared) + ' links changed at any member; each asker\'s next triage ask: ' + n(nx.toHonest) + ' of ' + n(nx.asks) + ' to an honest holder, ' + n(nx.answered) + ' answered'];
}
/** The sealed rules, one per claim, each (facts) → [held, measured]: Phase 3c judges W4 again by the same rule. */
export const RULES = Object.freeze({ W1: w1, W2: w2, W3: w3, W4: w4 });

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
