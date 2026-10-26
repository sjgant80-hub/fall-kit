#!/usr/bin/env node
// core/phase4/measure.mjs — Phase 4's measurement (core/phase4/claims.json, sealed before this existed).
//
//   node core/phase4/measure.mjs           live the organism twice (growing, and planted only), judge, write core/receipts/phase4.json
//   node core/phase4/measure.mjs --check   do it again from the data at its pinned commit; exit 1 unless the receipt is the same, byte for byte
//
// The data is fetched from dex-frontier at the commit pinned in core/phase4/dex/SOURCES.json, every file checked against
// its SHA-256, and read through dex-frontier's own loaders (vendored, byte for byte). The organism is lived twice on the
// same TEST rows: once growing, once planted only (growth switched off), so every ask can be paired. Every tally the
// self-model makes is checked against a count made here, separately, from the same asks and answers. Glue: the verdicts
// are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchData } from './vendor-dex.mjs';
import { SKILLS, SEEDS } from './organism.mjs';
import { loadAll } from './data.mjs';
import { gate, baOf } from '../growth.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8')), P = claims.policy;
const OUT = join(CORE, 'receipts', 'phase4.json'), DATA = join(ROOT, '.dex');
const W1F = join(HERE, 'local', 'w1.json'), W1 = existsSync(W1F) ? JSON.parse(readFileSync(W1F, 'utf8')) : null;
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 0);

/** one life as its own process; the two lives share nothing, so they run at once */
function life(mode) {
  const out = join(DATA, 'life-' + mode + '.json');
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(HERE, 'life.mjs'), DATA, mode, out], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (code) => { if (code !== 0) return reject(new Error('the ' + mode + ' life failed')); const l = JSON.parse(readFileSync(out, 'utf8')); rmSync(out, { force: true }); resolve(l); });
  });
}

// ── the count made here, separately: the same tallies the self-model makes, from the same asks and answers ──
function directCount(round) {
  const ans = new Map();
  for (const a of round.answers) if (a.label !== null && !ans.has(a.id)) ans.set(a.id, a);
  const blank = () => ({ asks: 0, answered: 0, correct: 0, pos: 0, neg: 0, tp: 0, tn: 0 });
  const skills = {}, nodes = {}, couplings = {};
  const bump = (t, truth, label) => {
    t.asks += 1; t[truth ? 'pos' : 'neg'] += 1;
    if (label !== null) { t.answered += 1; if (label === truth) { t.correct += 1; t[truth ? 'tp' : 'tn'] += 1; } }
  };
  for (const a of round.asks) {
    const got = a.to !== null ? ans.get(a.id) : undefined, label = got && got.from === a.to ? got.label : null, truth = round.truth[a.id];
    bump(skills[a.skill] = skills[a.skill] || blank(), truth, label);
    if (a.to === null) continue;
    bump(nodes[a.to] = nodes[a.to] || blank(), truth, label);
    const k = a.asker + '|' + a.to + '|' + a.skill;
    bump(couplings[k] = couplings[k] || blank(), truth, label);
  }
  const weights = Object.fromEntries(round.links.map((l) => [l.asker + '|' + l.holder + '|' + l.skill, l.weight]));
  return { skills, nodes, couplings, weights };
}
const strip = ({ ba, ...t }) => t;
function sameTallies(round) {
  const d = directCount(round), m = round.model, bad = [];
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const s of new Set([...Object.keys(d.skills), ...Object.keys(m.skills)])) if (!m.skills[s] || !same(strip(m.skills[s]), d.skills[s])) bad.push('skill ' + s);
  for (const n of new Set([...Object.keys(d.nodes), ...Object.keys(m.nodes)])) if (!m.nodes[n] || !same(strip(m.nodes[n]), d.nodes[n])) bad.push('node ' + n.slice(0, 8));
  const mc = Object.fromEntries(m.couplings.map((c) => [c.asker + '|' + c.holder + '|' + c.skill, c]));
  for (const k of new Set([...Object.keys(d.couplings), ...Object.keys(mc)])) {
    const c = mc[k];
    if (!c || !same({ asks: c.asks, answered: c.answered, correct: c.correct, pos: c.pos, neg: c.neg, tp: c.tp, tn: c.tn }, d.couplings[k]) || c.weight !== (k in d.weights ? d.weights[k] : null)) bad.push('coupling ' + k.split('|').map((x) => x.slice(0, 6)).join('>'));
  }
  return bad;
}
const balanced = (t) => { const r = []; if (t.pos) r.push(t.tp / t.pos); if (t.neg) r.push(t.tn / t.neg); return r.length ? r6(r.reduce((a, b) => a + b, 0) / r.length) : 0; };
function expectedGaps(round) {
  const d = directCount(round);
  return Object.entries(d.skills).map(([skill, t]) => ({ skill, ba: balanced(t), lost: r6(t.asks * (1 - balanced(t))) }))
    .filter((g) => g.ba < P.target).sort((a, b) => b.lost - a.lost || (a.skill < b.skill ? -1 : 1)).map((g) => g.skill);
}
/** the labels a run gave, by (cycle, skill, row): what pairs the growing organism with the planted one */
function labelsBy(life) {
  const out = new Map();
  for (const r of life.rounds) {
    const ans = new Map(r.answers.filter((a) => a.label !== null).map((a) => [a.id, a]));
    for (const a of r.asks) { const g = a.to !== null ? ans.get(a.id) : undefined; out.set(r.cycle + '|' + a.skill + '|' + a.row, { truth: r.truth[a.id], label: g && g.from === a.to ? g.label : null }); }
  }
  return out;
}

export async function measure() {
  mkdirSync(DATA, { recursive: true });
  const fetched = fetchData(DATA);
  if (!fetched.ok) throw new Error('the pinned data did not check: ' + fetched.bad.join('; '));
  const datasets = loadAll(DATA);
  const [grown, frozen] = await Promise.all([life('grow'), life('planted')]);
  const facts = { passes: W1 ? [1, 2, 3, 4] : [1, 2, 3] };
  facts.data = Object.fromEntries(SKILLS.map((s) => [s, { fit: datasets[s].fitRows.length, gate: datasets[s].gateRows.length, test: datasets[s].testRows.length, silos: Object.keys(datasets[s].silos).length }]));
  facts.planted = grown.planted;

  // O1 — every tally against the count made here
  facts.o1 = { cycles: grown.rounds.length, asks: grown.rounds.reduce((a, r) => a + r.asks.length, 0), mismatches: grown.rounds.flatMap((r) => sameTallies(r).map((b) => 'cycle ' + r.cycle + ': ' + b)) };
  // O2 — the gap lists, and the first cycle's flags on the planted weak holder
  const bank0 = grown.rounds[0].model.couplings.filter((c) => c.skill === 'bank');
  facts.o2 = {
    cycles: grown.rounds.length,
    gapListsWrong: grown.rounds.filter((r) => JSON.stringify(r.gaps.map((g) => g.skill)) !== JSON.stringify(expectedGaps(r))).map((r) => r.cycle),
    gaps: grown.rounds.map((r) => r.gaps.map((g) => g.skill + ' ' + g.ba)),
    weak: { askers: SEEDS.askers.length, couplings: bank0.map((c) => ({ weight: c.weight, ba: c.ba, flagged: grown.rounds[0].flags.some((f) => f.asker === c.asker && f.holder === c.holder && f.skill === 'bank') })) },
  };
  // O3 — the self-model's prediction of each round, against what happened and against assuming nothing changes
  const pairs = grown.rounds.filter((r) => r.predicted).flatMap((r) => SKILLS.map((s) => ({ cycle: r.cycle, skill: s, predicted: r.predicted[s], measured: r.measured[s], last: grown.rounds[r.cycle - 2].measured[s] })));
  facts.o3 = { n: pairs.length, mae: r6(pairs.reduce((a, p) => a + Math.abs(p.predicted - p.measured), 0) / (pairs.length || 1)), naive: r6(pairs.reduce((a, p) => a + Math.abs(p.last - p.measured), 0) / (pairs.length || 1)), worst: pairs.map((p) => ({ ...p, off: r6(Math.abs(p.predicted - p.measured)) })).sort((a, b) => b.off - a.off).slice(0, 3) };
  // G1, G2 — every candidate and every control, with the gate's numbers
  const pick = (d) => ({ cycle: d.cycle, skill: d.skill, silo: d.silo, patternId: d.patternId, pass: d.pass, why: d.why, n: d.n, ba: d.ba, baLow: d.baLow, incBa: d.incBa, diff: d.diff, diffLow: d.diffLow, incumbent: d.incumbent, joined: d.joined || null, dropped: d.dropped || null });
  facts.g1 = { floor: P.chanceFloor, margin: 0.02, candidates: grown.decisions.filter((d) => d.kind === 'candidate').map(pick) };
  facts.g2 = { controls: grown.decisions.filter((d) => d.kind === 'control').map(pick) };
  // G3 — the growing organism against the planted one, ask by ask on the same TEST rows
  const G = labelsBy(grown), F = labelsBy(frozen), joins = grown.decisions.filter((d) => d.joined);
  facts.g3 = {
    skills: joins.map((d) => {
      const keys = [...G.keys()].filter((k) => { const [c, s] = k.split('|'); return s === d.skill && Number(c) > d.cycle; });
      const truth = keys.map((k) => G.get(k).truth), gl = keys.map((k) => G.get(k).label), fl = keys.map((k) => F.get(k).label);
      const v = gl.every((x) => x === 0 || x === 1) ? gate(truth, gl, fl, P) : { diffLow: null };
      return { skill: d.skill, joinedAfter: d.cycle, asks: keys.length, grown: r6(baOf(truth, gl)), planted: r6(baOf(truth, fl)), diff: v.diff, diffLow: v.diffLow };
    }),
    worseRounds: grown.rounds.flatMap((r, k) => SKILLS.filter((s) => r.measured[s] < frozen.rounds[k].measured[s]).map((s) => r.cycle + ' ' + s)),
    rounds: grown.rounds.map((r, k) => ({ cycle: r.cycle, grown: r.measured, planted: frozen.rounds[k].measured })),
  };
  // G4 — the bounds, from the log
  const perCycle = {};
  for (const d of joins) perCycle[d.cycle] = (perCycle[d.cycle] || 0) + 1;
  const triedSkills = grown.decisions.filter((d) => d.kind === 'candidate' || (d.kind === 'control' && d.joined)).map((d) => d.skill);
  facts.g4 = { grown: grown.grown, maxJoinsInACycle: Math.max(0, ...Object.values(perCycle)), triedTwice: triedSkills.filter((s, i) => triedSkills.indexOf(s) !== i), cycles: grown.rounds.length, stop: grown.stop, limits: { maxGrown: P.maxGrown, maxJoinsPerCycle: P.maxJoinsPerCycle, maxCycles: P.maxCycles } };
  // A1 — every decision follows the self-model's ranking and the gate's numbers; no input after the start
  const followed = grown.decisions.filter((d) => d.kind !== 'stop').every((d) => {
    const r = grown.rounds[d.cycle - 1], triedBefore = grown.decisions.filter((x) => x.cycle < d.cycle && (x.kind === 'candidate' || x.joined)).map((x) => x.skill);
    const first = r.gaps.find((g) => !triedBefore.includes(g.skill));
    return first && first.skill === d.skill && (d.pass === (d.baLow > P.chanceFloor && d.diff >= 0.02 && d.diffLow > 0));
  });
  facts.a1 = { input: 'none: the organism reads no stdin, no file and no network once it starts; it is handed the data and the sealed policy', decisions: grown.decisions.length, followed, log: grown.decisions.map((d) => d.kind === 'stop' ? 'after cycle ' + d.cycle + ': stop, ' + d.why : 'after cycle ' + d.cycle + ': ' + d.kind + ' for ' + d.skill + (d.joined ? ', joined as ' + d.joined + (d.dropped ? ', ' + d.dropped + ' dropped' : '') : ', refused')) };
  // A2 — the planted gaps filled
  const plantedGaps = ['adult', 'bank', 'coupon', 'credit'];
  facts.a2 = { planted: plantedGaps, filled: plantedGaps.filter((s) => joins.some((d) => d.skill === s)), by: Object.fromEntries(joins.map((d) => [d.skill, d.kind])) };
  // W1 — the run's own growth, domain by domain, for the tab to match: what was planted, then every decision in order
  if (W1) facts.w1 = { from: 'core/phase4/local/w1.json', where: W1.where, tab: W1.tab, run: Object.fromEntries(W1.tab.domains.map((s) => [s, [...(grown.planted[s] ? [{ kind: 'planted', patternId: grown.planted[s].patternId, pass: null }] : []), ...grown.decisions.filter((d) => d.skill === s && d.kind !== 'stop').map((d) => ({ kind: d.kind, patternId: d.patternId, pass: d.pass }))]])) };
  return facts;
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=AM', '-1', '--', 'core/phase4/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const facts = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase4.receipt', v: 1, sealedIn: sealedIn(), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  const text = stable(receipt);
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* none yet */ }
    console.log(committed === text ? 'PHASE 4 RECEIPT REPRODUCED byte for byte' : 'PHASE 4 RECEIPT DIFFERS from the committed one');
    process.exit(committed === text ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log('wrote core/receipts/phase4.json');
}
