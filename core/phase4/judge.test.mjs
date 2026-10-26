import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, TARGET, START, MAE } from './judge.mjs';

const claims = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const cand = (skill, over = {}) => ({ cycle: 1, skill, silo: 's', patternId: 'p', pass: true, why: 'ok', n: 100, ba: 0.8, baLow: 0.75, incBa: 0, diff: 0.8, diffLow: 0.75, incumbent: null, joined: skill + '-1', dropped: null, ...over });
const good = () => ({
  passes: [1, 2, 3, 4],
  o1: { cycles: 8, asks: 12000, mismatches: [] },
  o2: { cycles: 8, gapListsWrong: [], gaps: [], weak: { askers: 2, couplings: [{ weight: 990000, ba: 0.55, flagged: true }, { weight: 980000, ba: 0.56, flagged: true }] } },
  o3: { n: 35, mae: 0.03, naive: 0.2, worst: [] },
  g1: { floor: 0.55, margin: 0.02, candidates: [cand('adult'), cand('credit', { cycle: 2, joined: 'credit-2' }), cand('coupon', { cycle: 3, pass: false, why: 'x', baLow: 0.54, joined: null })] },
  g2: { controls: [cand('adult', { pass: false, ba: 0.5, baLow: 0.47, joined: null }), cand('credit', { pass: false, ba: 0.51, baLow: 0.48, joined: null })] },
  g3: { skills: [{ skill: 'adult', joinedAfter: 1, asks: 2100, grown: 0.78, planted: 0, diff: 0.78, diffLow: 0.76 }], worseRounds: [], rounds: [] },
  g4: { grown: 3, maxJoinsInACycle: 1, triedTwice: [], cycles: 8, stop: { after: 4, why: 'every gap was tried' }, limits: { maxGrown: 4, maxJoinsPerCycle: 1, maxCycles: 8 } },
  a1: { input: 'none: the organism reads nothing', decisions: 9, followed: true, log: [] },
  a2: { planted: ['adult', 'bank', 'coupon', 'credit'], filled: ['adult', 'bank', 'credit'] },
  w1: { from: 'x', where: 'sjgant80-hub.github.io', tab: { domains: ['shop', 'coupon'], grown: { shop: [{ kind: 'planted', patternId: 'a', pass: null }], coupon: [{ kind: 'control', patternId: 'c0', pass: false }, { kind: 'candidate', patternId: 'b', pass: true }] } }, run: { shop: [{ kind: 'planted', patternId: 'a', pass: null }], coupon: [{ kind: 'control', patternId: 'c0', pass: false }, { kind: 'candidate', patternId: 'b', pass: true }] } },
});
const v = (f, id) => judge(claims, f).verdicts.find((x) => x.id === id);
const t = (id, mut) => { const f = good(); mut(f); return v(f, id); };

test('all held, read from the facts; a pass not run is not measured', () => {
  const j = judge(claims, good());
  assert.deepEqual([j.held, j.failed, j.open], [10, 0, 0]);
  assert.deepEqual([TARGET, START, MAE], [0.7, 500000, 0.05]);
  assert.deepEqual(j.verdicts.map((x) => x.id), claims.claims.map((c) => c.id));
  assert.equal(v(good(), 'O1').measured, '8 cycles, 12000 asks: the self-model\'s tallies by skill, by answering node and by coupling (with its link weight) against a count made separately from the same asks and answers: every one equal');
  assert.equal(v(good(), 'O2').measured, 'the gap list was right in all 8 cycles; in the first cycle 2 of the 2 askers\' couplings to the planted weak bank holder were flagged trusted-but-weak (link 990000, balanced accuracy 0.55; link 980000, balanced accuracy 0.56)');
  assert.equal(v(good(), 'O3').measured, 'over 35 predictions (every skill, every round after the first): mean absolute error 0.03 (bar 0.05); assuming nothing changes would have been off by 0.2');
  assert.equal(v(good(), 'G1').measured, '3 candidates grown: adult (joined as adult-1: 0.8, bound 0.75 vs floor 0.55; 0.8 over the organism without it, bound 0.75); credit (joined as credit-2: 0.8, bound 0.75 vs floor 0.55; 0.8 over the organism without it, bound 0.75); coupon (refused: 0.8, bound 0.54 vs floor 0.55; 0.8 over the organism without it, bound 0.75)');
  assert.equal(v(good(), 'G2').measured, '2 shuffled-label controls offered, 2 refused: adult 0.5 (bound 0.47), credit 0.51 (bound 0.48)');
  assert.equal(v(good(), 'G3').measured, 'adult on 2100 TEST asks after the join: 0.78 grown against 0 planted, bound on the gain 0.76; no skill worse in any round');
  assert.equal(v(good(), 'G4').measured, '3 nodes grown (limit 4), at most 1 joined in a cycle (limit 1), 0 gaps tried twice, 8 cycles (limit 8); growth stopped: every gap was tried');
  assert.equal(v(good(), 'A1').measured, '9 decisions, every one the self-model\'s ranking and the gate\'s numbers; input after the start: none; CI re-runs it and compares the receipt byte for byte');
  assert.equal(v(good(), 'A2').measured, '3 of the 4 planted gaps filled by a node the gate admitted (adult, bank, credit; bar 3)');
  assert.equal(v(good(), 'W1').measured, 'a browser tab on sjgant80-hub.github.io grew shop: planted a (the same as the run); coupon: control c0 refused, candidate b joined (the same as the run)');
  const three = judge(claims, { ...good(), passes: [1, 2, 3] });
  assert.deepEqual([three.held, three.open], [9, 1]);
  assert.deepEqual(three.verdicts.find((x) => x.id === 'W1').measured, 'not measured yet: pass 4');
});

test('O1–O3: each condition on its own', () => {
  assert.equal(t('O1', (f) => { f.o1.mismatches = ['cycle 2: skill bank']; }).held, false);
  assert.match(t('O1', (f) => { f.o1.mismatches = ['a', 'b', 'c', 'd']; }).measured, /4 differ \(a; b; c\)$/);
  assert.equal(t('O1', (f) => { f.o1.mismatches = 'x'; }).held, false);
  assert.equal(t('O1', (f) => { f.o1.cycles = 0; }).held, false);
  assert.equal(t('O1', (f) => { f.o1.asks = 0; }).held, false);
  assert.equal(t('O1', (f) => { f.o1 = { cycles: 1, asks: 1, mismatches: [] }; }).held, true);
  assert.equal(t('O2', (f) => { f.o2.gapListsWrong = [3]; }).held, false);
  assert.match(t('O2', (f) => { f.o2.gapListsWrong = [3, 5]; }).measured, /^the gap list was WRONG in cycle 3, 5 in some;/);
  assert.equal(t('O2', (f) => { f.o2.gapListsWrong = null; }).held, false);
  assert.equal(t('O2', (f) => { f.o2.cycles = 0; }).held, false);
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[1].flagged = false; }).held, false, 'every asker\'s coupling');
  assert.equal(t('O2', (f) => { f.o2.weak.couplings.pop(); }).held, false, 'one coupling per asker');
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[0].weight = START; }).held, false, 'a link at the start is not trusted');
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[0].weight = START + 1; }).held, true);
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[0].weight = 1.5; }).held, false);
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[0].ba = TARGET; }).held, false, 'at the target is not weak');
  assert.equal(t('O2', (f) => { f.o2.weak.couplings[0].ba = 'x'; }).held, false);
  assert.equal(t('O2', (f) => { f.o2.weak.askers = 0; f.o2.weak.couplings = []; }).held, false, 'no askers, nothing shown');
  assert.equal(t('O2', (f) => { f.o2.weak = null; }).held, false);
  assert.equal(t('O2', (f) => { f.o2.weak.couplings = [null, ...f.o2.weak.couplings]; }).held, true, 'junk is no coupling');
  assert.equal(t('O3', (f) => { f.o3.mae = 0.051; }).held, false);
  assert.equal(t('O3', (f) => { f.o3.mae = 0.05; f.o3.naive = 0.05; }).held, true, 'at the bar, and equal to assuming nothing changes');
  assert.equal(t('O3', (f) => { f.o3.mae = 0.04; f.o3.naive = 0.039; }).held, false, 'worse than assuming nothing changes');
  assert.equal(t('O3', (f) => { f.o3.n = 0; }).held, false);
  assert.equal(t('O3', (f) => { f.o3.mae = 'x'; }).held, false);
  assert.equal(t('O3', (f) => { f.o3.naive = null; }).held, false);
});

test('G1–G4: each condition on its own', () => {
  assert.equal(t('G1', (f) => { f.g1.candidates[0].joined = null; }).held, false, 'passed but did not join');
  assert.equal(t('G1', (f) => { f.g1.candidates[2].joined = 'coupon-3'; }).held, false, 'refused but joined');
  assert.match(t('G1', (f) => { f.g1.candidates[2].joined = 'coupon-3'; }).measured, /NOT as the gate says$/);
  assert.equal(t('G1', (f) => { f.g1.candidates[0].baLow = 0.55; }).held, false, 'at the floor: the gate says no, the decision said yes');
  assert.equal(t('G1', (f) => { f.g1.candidates[0].diff = 0.019; }).held, false);
  assert.equal(t('G1', (f) => { f.g1.candidates[0].diff = 0.02; }).held, true, 'exactly the margin');
  assert.equal(t('G1', (f) => { f.g1.candidates[0].diffLow = 0; }).held, false);
  assert.equal(t('G1', (f) => { f.g1.candidates[0].diffLow = 'x'; }).held, false);
  assert.equal(t('G1', (f) => { f.g1.candidates[2] = { ...f.g1.candidates[2], baLow: 0.6, diff: 0.01 }; }).held, true, 'refused for its gain, rightly');
  assert.equal(t('G1', (f) => { f.g1.candidates = []; }).held, false, 'nothing grown shows nothing');
  assert.equal(t('G1', (f) => { f.g1.candidates.push(null); }).held, false, 'a junk decision is not passed over');
  assert.equal(t('G1', (f) => { f.g1.floor = null; }).held, false);
  assert.equal(t('G1', (f) => { f.g1.margin = 'x'; }).held, false);
  assert.equal(t('G2', (f) => { f.g2.controls[1].pass = true; }).held, false);
  assert.equal(t('G2', (f) => { f.g2.controls[1].joined = 'credit-1'; }).held, false);
  assert.equal(t('G2', (f) => { f.g2.controls = []; }).held, false);
  assert.equal(t('G2', (f) => { f.g2.controls.push('x'); }).held, false);
  assert.equal(t('G2', (f) => { f.g2 = null; }).held, false);
  assert.equal(t('G3', (f) => { f.g3.skills[0].grown = 0; }).held, false, 'equal is not above');
  assert.equal(t('G3', (f) => { f.g3.skills[0].diffLow = 0; }).held, false);
  assert.equal(t('G3', (f) => { f.g3.skills[0].diffLow = null; }).held, false);
  assert.equal(t('G3', (f) => { f.g3.skills[0].asks = 0; }).held, false);
  assert.equal(t('G3', (f) => { f.g3.skills[0].planted = 'x'; }).held, false);
  assert.match(t('G3', (f) => { f.g3.skills[0].grown = 0; }).measured, /\(NOT\)/);
  assert.equal(t('G3', (f) => { f.g3.worseRounds = ['4 shop']; }).held, false);
  assert.match(t('G3', (f) => { f.g3.worseRounds = ['4 shop', '5 bank']; }).measured, /worse in 4 shop, 5 bank$/);
  assert.equal(t('G3', (f) => { f.g3.worseRounds = null; }).held, false);
  assert.equal(t('G3', (f) => { f.g3.skills = []; }).held, false);
  assert.match(t('G3', (f) => { f.g3.skills = []; }).measured, /^no node joined, so nothing to compare;/);
  assert.equal(t('G3', (f) => { f.g3.skills.push(5); }).held, false);
  assert.equal(t('G4', (f) => { f.g4.grown = 5; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.grown = 4; }).held, true, 'exactly the limit');
  assert.equal(t('G4', (f) => { f.g4.maxJoinsInACycle = 2; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.triedTwice = ['adult']; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.triedTwice = 'x'; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.cycles = 9; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.cycles = 0; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.stop = { why: 'it got bored' }; }).held, false, 'a stop by no rule');
  assert.equal(t('G4', (f) => { f.g4.stop = null; }).held, false);
  for (const why of ['no gap left', 'the last round was worked', 'a limit was reached: 4 nodes grown']) assert.equal(t('G4', (f) => { f.g4.stop = { why }; }).held, true, why);
  assert.equal(t('G4', (f) => { f.g4.stop = { why: 'a limit was reached: x nodes grown' }; }).held, false);
  assert.equal(t('G4', (f) => { f.g4.limits = null; }).held, false);
});

test('A1, A2, W1: each condition on its own', () => {
  assert.equal(t('A1', (f) => { f.a1.followed = false; }).held, false);
  assert.match(t('A1', (f) => { f.a1.followed = false; }).measured, /NOT what the ranking and the gate say/);
  assert.equal(t('A1', (f) => { f.a1.decisions = 0; }).held, false);
  assert.equal(t('A1', (f) => { f.a1.input = 'stdin, twice'; }).held, false);
  assert.equal(t('A1', (f) => { f.a1.input = 5; }).held, false);
  assert.equal(t('A2', (f) => { f.a2.filled = ['adult', 'bank']; }).held, false);
  assert.equal(t('A2', (f) => { f.a2.filled = ['adult', 'bank', 'shop']; }).held, false, 'a gap that was not planted does not count');
  assert.equal(t('A2', (f) => { f.a2.planted = ['adult', 'bank', 'credit']; }).held, false);
  assert.match(t('A2', (f) => { f.a2.filled = []; }).measured, /\(none; bar 3\)$/);
  assert.equal(t('W1', (f) => { f.w1.tab.grown.coupon[1].patternId = 'x'; }).held, false, 'another body');
  assert.match(t('W1', (f) => { f.w1.tab.grown.coupon[1].patternId = 'x'; }).measured, /coupon: control c0 refused, candidate x joined \(NOT the run's control c0 refused, candidate b joined\)$/);
  assert.equal(t('W1', (f) => { f.w1.tab.grown.coupon[1].pass = false; }).held, false, 'the same body, another decision');
  assert.equal(t('W1', (f) => { f.w1.tab.grown.coupon[0].kind = 'candidate'; }).held, false, 'the same steps in another role');
  assert.equal(t('W1', (f) => { f.w1.tab.grown.coupon.pop(); }).held, false, 'a step missing');
  assert.equal(t('W1', (f) => { f.w1.run.coupon = null; }).held, false);
  assert.match(t('W1', (f) => { f.w1.run.coupon = null; }).measured, /\(NOT the run's nothing\)$/);
  assert.equal(t('W1', (f) => { f.w1.tab.grown.shop = null; }).held, false);
  assert.match(t('W1', (f) => { f.w1.tab.grown.shop = []; }).measured, /shop: nothing \(NOT the run's planted a\)/);
  assert.equal(t('W1', (f) => { f.w1.tab.grown.shop = []; f.w1.run.shop = []; }).held, false, 'nothing grown shows nothing');
  assert.equal(t('W1', (f) => { f.w1.tab.grown.shop[0].patternId = 5; f.w1.run.shop[0].patternId = 5; }).held, false, 'a pattern id is text');
  assert.equal(t('W1', (f) => { f.w1.tab.grown.shop.push(null); f.w1.run.shop.push(null); }).held, false, 'a junk step is not passed over');
  assert.equal(t('W1', (f) => { f.w1.tab.grown.coupon[1].pass = 'yes'; f.w1.run.coupon[1].pass = 'yes'; }).held, true, 'a pass that is neither true nor false reads as no decision, alike on both sides');
  assert.equal(t('W1', (f) => { f.w1.tab.domains = []; }).held, false);
  assert.equal(t('W1', (f) => { f.w1.tab = null; }).held, false);
  assert.doesNotMatch(t('W1', (f) => { delete f.w1.where; }).measured, / on /);
});

test('the edges: one of each is enough, none is not, and a count is a whole number', () => {
  assert.equal(t('O1', (f) => { f.o1.cycles = 1.5; }).held, false, 'a count is a whole number');
  assert.equal(t('O2', (f) => { f.o2.cycles = 1; }).held, true, 'one cycle');
  assert.equal(t('O2', (f) => { f.o2.weak = { askers: 1, couplings: [{ weight: 990000, ba: 0.5, flagged: true }] }; }).held, true, 'one asker');
  assert.equal(t('O3', (f) => { f.o3.n = 1; }).held, true, 'one prediction');
  assert.equal(t('G1', (f) => { f.g1.candidates = [cand('adult')]; }).held, true, 'one candidate');
  assert.equal(t('G2', (f) => { f.g2.controls = [f.g2.controls[0]]; }).held, true, 'one control');
  assert.equal(t('G3', (f) => { f.g3.skills[0].asks = 1; }).held, true, 'one ask');
  assert.equal(t('G4', (f) => { f.g4 = { grown: 0, maxJoinsInACycle: 0, triedTwice: [], cycles: 1, stop: { why: 'no gap left' }, limits: { maxGrown: 0, maxJoinsPerCycle: 0, maxCycles: 1 } }; }).held, true, 'nothing grown, inside every limit');
  assert.equal(t('A1', (f) => { f.a1.decisions = 1; }).held, true, 'one decision');
  assert.equal(t('W1', (f) => { f.w1.tab.domains = ['shop']; }).held, true, 'one domain');
  assert.match(t('G2', (f) => { f.g2.controls[1].joined = 'credit-1'; }).measured, /^2 shuffled-label controls offered, 1 refused:/, 'a control that joined is not counted refused');
});

test('junk in, a verdict out', () => {
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.equal(judge(claims, null).open, claims.claims.length);
  assert.equal(judge(claims, { passes: 'x' }).open, claims.claims.length);
  assert.equal(judge({ claims: [{ id: 'toString', pass: 1 }] }, good()).verdicts[0].held, null, 'no inherited rule');
  assert.equal(judge({ claims: [null, { id: 'O1', pass: 1 }] }, good()).verdicts.length, 1);
  const bare = judge(claims, { passes: [1, 2, 3, 4] });
  assert.equal(bare.failed, 10, 'every rule, given no facts, fails rather than throws');
});
