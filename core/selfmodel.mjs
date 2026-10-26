// ════════════════════════════════════════════════════════════════
// core/selfmodel.mjs — the organism's model of itself. Organ 8 of the shared foundation (Phase 4, pass 1: claims O1–O3
// in core/phase4/claims.json).
//
// A mesh's links say whom an asker trusts: they grow when an answer's receipt checks. They cannot say whether the answer
// was right, because a receipt proves who answered and what, not that it was true. The self-model is the observer that
// can: it joins what every asker asked, what came back through its own door, and what the world later revealed to be
// true, and from that it sees the whole organism — every skill, every answering node, every asker-to-holder coupling —
// finds the gaps, flags the couplings the mesh trusts but should not, and says what each skill will score next round.
//
//   observe(round)            → model           round = { asks, answers, truth, links } (see below)
//   balanced(t)               → balanced accuracy of a tally { pos, neg, tp, tn }; an ask nobody answers counts wrong
//   gaps(model, policy)       → [{ skill, asks, ba, lost }]   below target, by lost value (asks × (1 − ba)), then name
//   flags(model, policy)      → [{ asker, holder, skill, weight, ba }]   trusted (link above start) but below target
//   predict(model, joined)    → { skill: ba }   last measured, or a newly joined node's gate score
//   grade(predicted, measured)→ { n, mae }      mean absolute error over the skills both name
//
//   asks:    [{ id, skill, asker, to }]    to = the holder the ask went to, or null when no node holds the skill
//   answers: [{ id, from, label }]          what came back through the asker's door, label 0 or 1
//   truth:   { id: 0 | 1 }                  what the world revealed afterwards
//   links:   [{ asker, holder, skill, weight }]   the askers' link weights, in parts of a million
//
// Pure and total: junk is skipped and counted, never thrown. Every score is rounded to six places so a model is the
// same bytes on every machine.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isBit = (x) => x === 0 || x === 1;
export const round6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 0);
const tally = () => ({ asks: 0, answered: 0, correct: 0, pos: 0, neg: 0, tp: 0, tn: 0 });

/** Balanced accuracy: the mean, over the classes present, of the share of each class answered as itself. */
export function balanced(t) {
  if (!isObj(t)) return 0;
  const rates = [];
  if (t.pos > 0) rates.push(t.tp / t.pos);
  if (t.neg > 0) rates.push(t.tn / t.neg);
  return rates.length ? round6(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
}

function add(t, truth, label) {
  t.asks++;
  if (truth === 1) t.pos++; else t.neg++;
  if (label === null) return;
  t.answered++;
  if (label === truth) { t.correct++; if (truth === 1) t.tp++; else t.tn++; }
}
const done = (t) => ({ ...t, ba: balanced(t) });

/** The organism as it was in one round. */
export function observe(round) {
  const r = isObj(round) ? round : {};
  const asks = Array.isArray(r.asks) ? r.asks : [], answers = Array.isArray(r.answers) ? r.answers : [];
  const truth = isObj(r.truth) ? r.truth : {}, links = Array.isArray(r.links) ? r.links : [];
  const got = new Map();
  let skipped = 0;
  for (const a of answers) {
    if (isObj(a) && isStr(a.id) && isStr(a.from) && isBit(a.label) && !got.has(a.id)) got.set(a.id, a);
    else skipped++;
  }
  const weight = new Map();
  for (const l of links) {
    if (isObj(l) && isStr(l.asker) && isStr(l.holder) && isStr(l.skill) && Number.isSafeInteger(l.weight)) weight.set(l.asker + '|' + l.holder + '|' + l.skill, l.weight);
    else skipped++;
  }
  const skills = {}, nodes = {}, couplings = {}, seen = new Set();
  for (const a of asks) {
    if (!isObj(a) || !isStr(a.id) || !isStr(a.skill) || !isStr(a.asker) || !(a.to === null || isStr(a.to)) || !isBit(truth[a.id]) || seen.has(a.id)) { skipped++; continue; }
    seen.add(a.id);
    const ans = got.get(a.id);
    // an answer counts only if it came from the node the ask went to
    const label = a.to !== null && ans && ans.from === a.to ? ans.label : null;
    add(skills[a.skill] || (skills[a.skill] = tally()), truth[a.id], label);
    if (a.to === null) continue;
    add(nodes[a.to] || (nodes[a.to] = tally()), truth[a.id], label);
    const k = a.asker + '|' + a.to + '|' + a.skill;
    add(couplings[k] || (couplings[k] = { asker: a.asker, holder: a.to, skill: a.skill, ...tally() }), truth[a.id], label);
  }
  const out = { skills: {}, nodes: {}, couplings: [], skipped };
  for (const s of Object.keys(skills).sort()) out.skills[s] = done(skills[s]);
  for (const n of Object.keys(nodes).sort()) out.nodes[n] = done(nodes[n]);
  for (const k of Object.keys(couplings).sort()) out.couplings.push({ ...done(couplings[k]), weight: weight.has(k) ? weight.get(k) : null });
  return out;
}

const policyOf = (p) => ({ target: isObj(p) && Number.isFinite(p.target) ? p.target : 0.7, start: isObj(p) && Number.isSafeInteger(p.start) ? p.start : 500000 });

/** The gaps: every skill below the target, the costliest first (asks × (1 − ba)), ties by name. */
export function gaps(model, policy) {
  const { target } = policyOf(policy);
  const skills = isObj(model) && isObj(model.skills) ? model.skills : {};
  return Object.keys(skills)
    .filter((s) => isObj(skills[s]) && skills[s].asks > 0 && skills[s].ba < target)
    .map((s) => ({ skill: s, asks: skills[s].asks, ba: skills[s].ba, lost: round6(skills[s].asks * (1 - skills[s].ba)) }))
    .sort((a, b) => b.lost - a.lost || (a.skill < b.skill ? -1 : 1));
}

/** The couplings the mesh trusts but should not: a link above where links start, answers below the target. */
export function flags(model, policy) {
  const { target, start } = policyOf(policy);
  const cs = isObj(model) && Array.isArray(model.couplings) ? model.couplings : [];
  return cs.filter((c) => isObj(c) && Number.isSafeInteger(c.weight) && c.weight > start && c.asks > 0 && c.ba < target)
    .map((c) => ({ asker: c.asker, holder: c.holder, skill: c.skill, weight: c.weight, ba: c.ba }));
}

/** What every skill will score next round: what it scored, unless a node joined for it, which brings its gate score. */
export function predict(model, joined) {
  const skills = isObj(model) && isObj(model.skills) ? model.skills : {}, j = isObj(joined) ? joined : {};
  const out = {};
  for (const s of Object.keys(skills).sort()) out[s] = Object.prototype.hasOwnProperty.call(j, s) && Number.isFinite(j[s]) ? round6(j[s]) : skills[s].ba;
  return out;
}

/** How close a prediction was: the mean absolute error over the skills both name. */
export function grade(predicted, measured) {
  const p = isObj(predicted) ? predicted : {}, m = isObj(measured) ? measured : {};
  const both = Object.keys(p).filter((s) => Object.prototype.hasOwnProperty.call(m, s) && Number.isFinite(p[s]) && Number.isFinite(m[s])).sort();
  return { n: both.length, mae: both.length ? round6(both.reduce((a, s) => a + Math.abs(p[s] - m[s]), 0) / both.length) : 0 };
}
