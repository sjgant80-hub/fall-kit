// core/phase4/judge.mjs — Phase 4's verdicts from its facts (core/phase4/claims.json). Pure and total: it reads the facts
// measure.mjs gathered against each sealed holds_if, so anyone can re-judge a receipt without trusting the run. A claim
// whose pass has not run is "not measured", never guessed.
export const TARGET = 0.70, START = 500000, MAE = 0.05;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const num = (x) => (Number.isFinite(x) ? x : null);
const of = (f, k) => (isObj(f[k]) ? f[k] : {});
const STOPS = ['no gap left', 'every gap was tried', 'the last round was worked'];
const stopOk = (why) => typeof why === 'string' && (STOPS.includes(why) || /^a limit was reached: \d+ nodes grown$/.test(why));

function o1(f) {
  const x = of(f, 'o1'), bad = list(x.mismatches);
  return [n(x.cycles) >= 1 && n(x.asks) >= 1 && Array.isArray(x.mismatches) && bad.length === 0, n(x.cycles) + ' cycles, ' + n(x.asks) + ' asks: the self-model\'s tallies by skill, by answering node and by coupling (with its link weight) against a count made separately from the same asks and answers: ' + (bad.length === 0 ? 'every one equal' : bad.length + ' differ (' + bad.slice(0, 3).join('; ') + ')')];
}
function o2(f) {
  const x = of(f, 'o2'), w = isObj(x.weak) ? x.weak : {}, cs = list(w.couplings).filter(isObj), wrong = list(x.gapListsWrong);
  const flagged = cs.filter((c) => c.flagged === true && Number.isSafeInteger(c.weight) && c.weight > START && num(c.ba) !== null && c.ba < TARGET);
  const ok = n(x.cycles) >= 1 && Array.isArray(x.gapListsWrong) && wrong.length === 0 && n(w.askers) >= 1 && cs.length === w.askers && flagged.length === cs.length;
  return [ok, 'the gap list was ' + (wrong.length === 0 ? 'right' : 'WRONG in cycle ' + wrong.join(', ')) + ' in ' + (wrong.length === 0 ? 'all ' + n(x.cycles) + ' cycles' : 'some') + '; in the first cycle ' + flagged.length + ' of the ' + n(w.askers) + ' askers\' couplings to the planted weak bank holder were flagged trusted-but-weak (' + cs.map((c) => 'link ' + c.weight + ', balanced accuracy ' + c.ba).join('; ') + ')'];
}
function o3(f) {
  const x = of(f, 'o3'), mae = num(x.mae), naive = num(x.naive);
  const ok = n(x.n) >= 1 && mae !== null && naive !== null && mae <= MAE && mae <= naive;
  return [ok, 'over ' + n(x.n) + ' predictions (every skill, every round after the first): mean absolute error ' + mae + ' (bar ' + MAE + '); assuming nothing changes would have been off by ' + naive];
}
const gateHolds = (d, floor, margin) => num(d.baLow) !== null && num(d.diff) !== null && num(d.diffLow) !== null && d.baLow > floor && d.diff >= margin && d.diffLow > 0;
function g1(f) {
  const x = of(f, 'g1'), cs = list(x.candidates).filter(isObj), floor = num(x.floor), margin = num(x.margin);
  const consistent = (d) => d.pass === gateHolds(d, floor, margin) && (d.pass ? typeof d.joined === 'string' : d.joined === null);
  const ok = floor !== null && margin !== null && cs.length >= 1 && cs.length === list(x.candidates).length && cs.every(consistent);
  return [ok, cs.length + ' candidates grown: ' + cs.map((d) => d.skill + ' (' + (d.pass ? 'joined as ' + d.joined : 'refused') + ': ' + d.ba + ', bound ' + d.baLow + ' vs floor ' + floor + '; ' + d.diff + ' over the organism without it, bound ' + d.diffLow + ')' + (consistent(d) ? '' : ' NOT as the gate says')).join('; ')];
}
function g2(f) {
  const cs = list(of(f, 'g2').controls).filter(isObj);
  const ok = cs.length >= 1 && cs.length === list(of(f, 'g2').controls).length && cs.every((d) => d.pass === false && d.joined === null);
  return [ok, cs.length + ' shuffled-label controls offered, ' + cs.filter((d) => d.pass === false && d.joined === null).length + ' refused: ' + cs.map((d) => d.skill + ' ' + d.ba + ' (bound ' + d.baLow + ')').join(', ')];
}
function g3(f) {
  const x = of(f, 'g3'), ss = list(x.skills).filter(isObj), worse = list(x.worseRounds);
  const helps = (s) => num(s.grown) !== null && num(s.planted) !== null && num(s.diffLow) !== null && s.grown > s.planted && s.diffLow > 0 && n(s.asks) >= 1;
  const ok = ss.length >= 1 && ss.length === list(x.skills).length && ss.every(helps) && Array.isArray(x.worseRounds) && worse.length === 0;
  return [ok, (ss.length ? ss.map((s) => s.skill + ' on ' + n(s.asks) + ' TEST asks after the join: ' + s.grown + ' grown against ' + s.planted + ' planted, bound on the gain ' + s.diffLow + (helps(s) ? '' : ' (NOT)')).join('; ') : 'no node joined, so nothing to compare') + '; ' + (worse.length === 0 ? 'no skill worse in any round' : 'worse in ' + worse.join(', '))];
}
function g4(f) {
  const x = of(f, 'g4'), l = isObj(x.limits) ? x.limits : {}, why = isObj(x.stop) ? x.stop.why : null;
  const ok = n(l.maxGrown) >= 0 && n(x.grown) >= 0 && x.grown <= l.maxGrown && n(x.maxJoinsInACycle) >= 0 && x.maxJoinsInACycle <= n(l.maxJoinsPerCycle) && Array.isArray(x.triedTwice) && x.triedTwice.length === 0 && n(x.cycles) >= 1 && x.cycles <= n(l.maxCycles) && stopOk(why);
  return [ok, n(x.grown) + ' nodes grown (limit ' + n(l.maxGrown) + '), at most ' + n(x.maxJoinsInACycle) + ' joined in a cycle (limit ' + n(l.maxJoinsPerCycle) + '), ' + list(x.triedTwice).length + ' gaps tried twice, ' + n(x.cycles) + ' cycles (limit ' + n(l.maxCycles) + '); growth stopped: ' + String(why)];
}
function a1(f) {
  const x = of(f, 'a1');
  const ok = x.followed === true && n(x.decisions) >= 1 && typeof x.input === 'string' && x.input.startsWith('none');
  return [ok, n(x.decisions) + ' decisions, every one ' + (x.followed === true ? 'the self-model\'s ranking and the gate\'s numbers' : 'NOT what the ranking and the gate say') + '; input after the start: ' + String(x.input).split(':')[0] + '; CI re-runs it and compares the receipt byte for byte'];
}
function a2(f) {
  const x = of(f, 'a2'), planted = list(x.planted), filled = list(x.filled).filter((s) => planted.includes(s));
  return [planted.length === 4 && filled.length >= 3, filled.length + ' of the ' + planted.length + ' planted gaps filled by a node the gate admitted (' + (filled.join(', ') || 'none') + '; bar 3)'];
}
const steps = (xs) => list(xs).filter(isObj).map((d) => (String(d.kind) + ' ' + (typeof d.patternId === 'string' ? d.patternId : '?') + ' ' + (d.pass === true ? 'joined' : d.pass === false ? 'refused' : '')).trim());
function w1(f) {
  const x = of(f, 'w1'), tab = isObj(x.tab) ? x.tab : {}, ds = list(tab.domains), grown = isObj(tab.grown) ? tab.grown : {}, run = isObj(x.run) ? x.run : {};
  const same = (s) => list(grown[s]).length >= 1 && list(grown[s]).every((d) => isObj(d) && typeof d.patternId === 'string') && JSON.stringify(steps(grown[s])) === JSON.stringify(steps(run[s]));
  return [ds.length >= 1 && ds.every(same), 'a browser tab' + (typeof x.where === 'string' ? ' on ' + x.where : '') + ' grew ' + ds.map((s) => s + ': ' + (steps(grown[s]).join(', ').trim() || 'nothing') + (same(s) ? ' (the same as the run)' : ' (NOT the run\'s ' + (steps(run[s]).join(', ').trim() || 'nothing') + ')')).join('; ')];
}
const RULES = Object.freeze({ O1: o1, O2: o2, O3: o3, G1: g1, G2: g2, G3: g3, G4: g4, A1: a1, A2: a2, W1: w1 });

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
