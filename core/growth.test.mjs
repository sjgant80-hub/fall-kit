import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, nextStep, baOf, rng, MARGIN, RESAMPLES, SEED, LOWER } from './growth.mjs';

// gate rows: 200 positives then 200 negatives
const truth = [...Array(200).fill(1), ...Array(200).fill(0)];
const labels = (tp, tn) => [...Array(200).fill(0).map((_, i) => (i < tp ? 1 : 0)), ...Array(200).fill(0).map((_, i) => (i < tn ? 0 : 1))];
const none = Array(400).fill(null);
const P = { chanceFloor: 0.55 };

test('the constants', () => {
  assert.deepEqual([MARGIN, RESAMPLES, SEED, LOWER], [0.02, 2000, 2026, 0.05]);
  const a = rng(7), b = rng(7);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()), 'one seed, one stream');
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, rng(8)), 'another seed, another stream');
  assert.equal(rng(1)(), rng(1 + 2 ** 32)(), 'the seed is read as 32 bits');
});

test('baOf: balanced accuracy, an unanswered row counted wrong, over the rows given', () => {
  assert.equal(baOf(truth, labels(150, 100)), 0.625);
  assert.equal(baOf(truth, none), 0, 'nobody answers: 0');
  assert.equal(baOf([1, 1, 0], [1, null, 0]), 0.75);
  assert.equal(baOf([1, 0, 1], [1, 1, 1], [0, 2]), 1, 'only the rows given; one class present');
  assert.equal(baOf([1, 0], [1, 0], [0, 0, 1]), 1, 'a row given twice counts twice');
  assert.equal(baOf([0, 0], [1, 0], [0, 1]), 0.5);
  assert.equal(baOf([], []), 0);
});

test('gate: a candidate better than chance and better than the organism without it joins', () => {
  const g = gate(truth, labels(160, 150), none, P);
  assert.equal(g.pass, true);
  assert.equal(g.why, 'better than chance and better than the organism without it');
  assert.deepEqual([g.n, g.ba, g.incBa, g.diff], [400, 0.775, 0, 0.775]);
  assert.ok(g.baLow > 0.55 && g.baLow < g.ba, 'a lower bound below the score');
  assert.equal(g.diffLow, g.baLow, 'against nobody, the gain is the score');
  assert.deepEqual(gate(truth, labels(160, 150), none, P), g, 'the same rows, the same verdict');
  assert.deepEqual([g.baLow, g.diffLow], [0.742425, 0.742425], 'the bound itself, to six places: 2,000 resamples of 400 rows from the fixed seed');
  const beat = gate(truth, labels(170, 170), labels(150, 150), P);
  assert.equal(beat.pass, true, 'it beats a weaker holder');
  assert.deepEqual([beat.ba, beat.incBa, beat.diff], [0.85, 0.75, 0.1]);
  assert.ok(beat.diffLow > 0 && beat.diffLow < 0.1);
  assert.deepEqual([beat.baLow, beat.diffLow], [0.821802, 0.075442]);
});

test('gate: each of its conditions refuses on its own', () => {
  const chance = gate(truth, labels(110, 110), none, P);
  assert.deepEqual([chance.pass, chance.ba], [false, 0.55]);
  assert.match(chance.why, /^not better than chance: the lower bound on its balanced accuracy is not above 0\.55$/, 'a random answerer beats nobody, and is still refused');
  assert.equal(gate(truth, labels(110, 110), none, { chanceFloor: 0.4 }).pass, true, 'the floor is the policy\'s');
  assert.equal(gate(truth, labels(110, 110), none, { chanceFloor: 0.510301 }).pass, false, 'a bound exactly at the floor is not above it');
  assert.equal(gate(truth, labels(110, 110), none, { chanceFloor: 0.5103 }).pass, true, 'just under it is');
  assert.equal(gate(truth, labels(110, 110), none, {}).why.endsWith('above 0.55'), true, 'and 0.55 if the policy names none');
  assert.equal(gate(truth, labels(110, 110), none, null).pass, false);
  const same = gate(truth, labels(170, 170), labels(166, 170), P);
  assert.equal(same.pass, false);
  assert.equal(same.diff, 0.01);
  assert.equal(same.why, 'not better than the organism without it by 0.02', 'a gain under the margin');
  const margin = gate(truth, labels(170, 170), labels(162, 170), P);
  assert.equal(margin.diff, 0.02, 'exactly the margin');
  assert.equal(margin.pass, true, 'at the margin, with a sure gain, it joins');
  // a gain over the margin that is not sure: on few rows, a small gain could be luck
  const noisy = [...Array(20).fill(1), ...Array(20).fill(0)];
  const cand = [...Array(20).fill(0).map((_, i) => (i < 15 ? 1 : 0)), ...Array(20).fill(0).map((_, i) => (i < 15 ? 0 : 1))];
  const inc = [...Array(20).fill(0).map((_, i) => (i < 14 ? 1 : 0)), ...Array(20).fill(0).map((_, i) => (i < 15 ? 0 : 1))];
  const thin = gate(noisy, cand, inc, P);
  assert.deepEqual([thin.pass, thin.diff >= MARGIN, thin.diffLow > 0], [false, true, false], 'on few rows a small gain is not sure');
  assert.equal(thin.why, 'its gain is not sure: the lower bound on the gain is not above 0');
});

test('gate: what cannot be judged is refused with its reason', () => {
  assert.deepEqual(gate(null, [], [], P), { pass: false, why: 'the gate needs the truth and both sets of labels' });
  assert.deepEqual(gate([1], 'x', [null], P), { pass: false, why: 'the gate needs the truth and both sets of labels' });
  assert.deepEqual(gate([1], [1], 5, P), { pass: false, why: 'the gate needs the truth and both sets of labels' });
  assert.deepEqual(gate([], [], [], P), { pass: false, why: 'the labels do not line up with the rows', n: 0 });
  assert.deepEqual(gate([1, 0], [1], [null, null], P), { pass: false, why: 'the labels do not line up with the rows', n: 2 });
  assert.deepEqual(gate([1, 0], [1, 0], [null], P), { pass: false, why: 'the labels do not line up with the rows', n: 2 });
  const bad = 'a label is not 0, 1 (or, for the organism without it, nobody)';
  assert.equal(gate([1, 2], [1, 0], [null, null], P).why, bad);
  assert.equal(gate([1, 0], [1, null], [null, null], P).why, bad, 'a candidate always answers');
  assert.equal(gate([1, 0], [1, 0], [null, 3], P).why, bad);
  assert.equal(gate([1, 0], [1, 0], [1, 0], P).pass, false, 'no gain over a perfect holder');
});

test('nextStep: the costliest untried gap, or the rule growth stops by', () => {
  const gaps = [{ skill: 'adult', ba: 0 }, { skill: 'credit', ba: 0 }, { skill: 'bank', ba: 0.5 }];
  const policy = { maxGrown: 4 };
  assert.deepEqual(nextStep(gaps, { tried: [], grown: 0 }, policy), { gap: gaps[0] });
  assert.deepEqual(nextStep(gaps, { tried: ['adult'], grown: 1 }, policy), { gap: gaps[1] });
  assert.deepEqual(nextStep(gaps, { tried: ['adult', 'credit'], grown: 3 }, policy), { gap: gaps[2] });
  assert.deepEqual(nextStep(gaps, { tried: ['adult', 'credit', 'bank'], grown: 2 }, policy), { stop: 'every gap was tried' });
  assert.deepEqual(nextStep([], { tried: [], grown: 0 }, policy), { stop: 'no gap left' });
  assert.deepEqual(nextStep(gaps, { tried: [], grown: 4 }, policy), { stop: 'a limit was reached: 4 nodes grown' });
  assert.deepEqual(nextStep(gaps, { tried: [], grown: 3 }, policy), { gap: gaps[0] }, 'one under the limit');
  assert.deepEqual(nextStep(gaps, { tried: [], grown: 0 }, {}), { stop: 'a limit was reached: 0 nodes grown' }, 'no limit named: nothing grows');
  assert.deepEqual(nextStep(gaps, { tried: [], grown: 0 }, null), { stop: 'a limit was reached: 0 nodes grown' });
  assert.deepEqual(nextStep(gaps, null, policy), { gap: gaps[0] }, 'no state: nothing tried, nothing grown');
  assert.deepEqual(nextStep(gaps, { tried: 'adult', grown: 'x' }, policy), { gap: gaps[0] });
  assert.deepEqual(nextStep([null, { skill: 5 }, { skill: 'x' }], {}, policy), { gap: { skill: 'x' } }, 'junk gaps are skipped');
  assert.deepEqual(nextStep('x', {}, policy), { stop: 'no gap left' });
  assert.deepEqual(nextStep([null], {}, policy), { stop: 'no gap left' });
});
