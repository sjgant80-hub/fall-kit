import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, balanced, gaps, flags, predict, grade, round6 } from './selfmodel.mjs';

// a small organism: two askers, a holder for each of two skills, one skill nobody holds
const round = () => ({
  asks: [
    { id: 'j1', skill: 'shop', asker: 'a1', to: 'hs' },   // truth 1, answered 1: tp
    { id: 'j2', skill: 'shop', asker: 'a2', to: 'hs' },   // truth 0, answered 0: tn
    { id: 'j3', skill: 'shop', asker: 'a1', to: 'hs' },   // truth 0, answered 1: wrong
    { id: 'j4', skill: 'bank', asker: 'a1', to: 'hb' },   // truth 1, answered 0: wrong
    { id: 'j5', skill: 'bank', asker: 'a2', to: 'hb' },   // truth 0, answered 0: tn
    { id: 'j6', skill: 'bank', asker: 'a2', to: 'hb' },   // truth 0, no answer: wrong
    { id: 'j7', skill: 'adult', asker: 'a1', to: null },  // truth 1, nobody holds it
    { id: 'j8', skill: 'adult', asker: 'a2', to: null },  // truth 0, nobody holds it
  ],
  answers: [{ id: 'j1', from: 'hs', label: 1 }, { id: 'j2', from: 'hs', label: 0 }, { id: 'j3', from: 'hs', label: 1 }, { id: 'j4', from: 'hb', label: 0 }, { id: 'j5', from: 'hb', label: 0 }],
  truth: { j1: 1, j2: 0, j3: 0, j4: 1, j5: 0, j6: 0, j7: 1, j8: 0 },
  links: [{ asker: 'a1', holder: 'hs', skill: 'shop', weight: 700000 }, { asker: 'a2', holder: 'hs', skill: 'shop', weight: 600000 }, { asker: 'a1', holder: 'hb', skill: 'bank', weight: 900000 }, { asker: 'a2', holder: 'hb', skill: 'bank', weight: 500000 }],
});

test('balanced accuracy: the mean over the classes present, an unanswered ask counted wrong', () => {
  assert.equal(balanced({ pos: 2, neg: 2, tp: 2, tn: 1 }), 0.75);
  assert.equal(balanced({ pos: 1, neg: 0, tp: 1, tn: 0 }), 1, 'one class present: its rate alone');
  assert.equal(balanced({ pos: 0, neg: 3, tp: 0, tn: 2 }), 0.666667);
  assert.equal(balanced({ pos: 0, neg: 0, tp: 0, tn: 0 }), 0, 'nothing asked');
  assert.equal(balanced({ pos: 3, neg: 1, tp: 0, tn: 0 }), 0, 'nobody answered: 0');
  assert.equal(balanced(null), 0);
  assert.equal(balanced([1]), 0);
  assert.equal(round6(1 / 3), 0.333333);
  assert.equal(round6(NaN), 0);
  assert.equal(round6(Infinity), 0);
});

test('observe: every skill, node and coupling counted as it happened', () => {
  const m = observe(round());
  assert.deepEqual(m.skills.shop, { asks: 3, answered: 3, correct: 2, pos: 1, neg: 2, tp: 1, tn: 1, ba: 0.75 });
  assert.deepEqual(m.skills.bank, { asks: 3, answered: 2, correct: 1, pos: 1, neg: 2, tp: 0, tn: 1, ba: 0.25 });
  assert.deepEqual(m.skills.adult, { asks: 2, answered: 0, correct: 0, pos: 1, neg: 1, tp: 0, tn: 0, ba: 0 }, 'a skill nobody holds scores 0');
  assert.deepEqual(Object.keys(m.skills), ['adult', 'bank', 'shop'], 'in one order');
  assert.deepEqual(m.nodes, { hb: { asks: 3, answered: 2, correct: 1, pos: 1, neg: 2, tp: 0, tn: 1, ba: 0.25 }, hs: { asks: 3, answered: 3, correct: 2, pos: 1, neg: 2, tp: 1, tn: 1, ba: 0.75 } }, 'no node for asks nobody held');
  assert.deepEqual(m.couplings.map((c) => [c.asker, c.holder, c.skill, c.asks, c.correct, c.ba, c.weight]), [
    ['a1', 'hb', 'bank', 1, 0, 0, 900000],
    ['a1', 'hs', 'shop', 2, 1, 0.5, 700000],
    ['a2', 'hb', 'bank', 2, 1, 0.5, 500000],
    ['a2', 'hs', 'shop', 1, 1, 1, 600000],
  ]);
  assert.equal(m.skipped, 0);
});

test('observe: an answer counts only from the node the ask went to, once, and junk is skipped and counted', () => {
  const r = round();
  r.answers.push({ id: 'j6', from: 'someone else', label: 0 });      // the right label, from a node it was not asked of
  r.answers.unshift({ id: 'j1', from: 'hs', label: 0 });             // a second answer to j1 comes first: the first one counts
  r.answers.push(null, { id: 5, from: 'hs', label: 1 }, { id: 'x', from: '', label: 1 }, { id: 'y', from: 'hs', label: 2 });
  r.asks.push(null, { id: 'j1', skill: 'shop', asker: 'a1', to: 'hs' }, { id: 'n1', skill: 'shop', asker: 'a1', to: 'hs' });
  // each of these has its truth, so each is skipped for its own one fault alone
  r.asks.push({ id: 'b1', skill: 'shop', to: 'hs' }, { id: 'b2', skill: '', asker: 'a1', to: 'hs' }, { id: 'b3', skill: 'shop', asker: 'a1', to: 5 }, { id: 'b4', skill: 'shop', asker: '', to: 'hs' }, { id: '', skill: 'shop', asker: 'a1', to: 'hs' }, ['b5']);
  Object.assign(r.truth, { b1: 1, b2: 1, b3: 1, b4: 1, '': 1 });
  r.links.push({ asker: 'a1', holder: 'hs', skill: 'shop', weight: 1.5 }, 'x');
  const m = observe(r);
  assert.equal(m.skills.bank.answered, 2, 'an answer from another node is not this ask\'s answer');
  assert.equal(m.skills.shop.tp, 0, 'j1 took the first answer it heard');
  assert.equal(m.skills.shop.asks, 3, 'a repeated ask id, an ask with no truth, and junk asks are skipped');
  assert.equal(m.skipped, 5 + 9 + 2, 'answers: four junk and one repeat; asks: null, one repeat, one with no truth and six with one fault each; two junk links');
  assert.deepEqual(Object.keys(m.skills), ['adult', 'bank', 'shop'], 'no junk ask made a skill of its own');
  assert.equal(m.couplings.find((c) => c.holder === 'hs' && c.asker === 'a1').weight, 700000, 'a junk link does not overwrite a good one');
  for (const junk of [null, 'x', [], { asks: 'x', answers: 5, truth: [], links: null }]) assert.deepEqual(observe(junk), { skills: {}, nodes: {}, couplings: [], skipped: 0 });
  const noLink = observe({ asks: [{ id: 'k', skill: 's', asker: 'a', to: 'h' }], answers: [], truth: { k: 1 } });
  assert.equal(noLink.couplings[0].weight, null, 'a coupling with no link known says so');
  assert.equal(observe({ asks: [{ id: 'k', skill: 's', asker: 'a', to: 'h' }], truth: { k: 2 } }).skipped, 1, 'a truth that is not 0 or 1');
});

test('gaps: below the target, the costliest first, ties by name', () => {
  const m = observe(round());
  assert.deepEqual(gaps(m, { target: 0.7 }), [{ skill: 'bank', asks: 3, ba: 0.25, lost: 2.25 }, { skill: 'adult', asks: 2, ba: 0, lost: 2 }]);
  assert.deepEqual(gaps(m, { target: 0.8 }).map((g) => g.skill), ['bank', 'adult', 'shop']);
  assert.deepEqual(gaps(m, { target: 0.75 }).map((g) => g.skill), ['bank', 'adult'], 'at the target is not below it');
  assert.deepEqual(gaps(m, { target: 0.2 }), [{ skill: 'adult', asks: 2, ba: 0, lost: 2 }]);
  const tie = { skills: { b: { asks: 2, ba: 0 }, a: { asks: 2, ba: 0 }, c: { asks: 0, ba: 0 }, d: 'x' } };
  assert.deepEqual(gaps(tie, { target: 0.7 }).map((g) => g.skill), ['a', 'b'], 'a tie goes by name; a skill nobody asked is no gap');
  assert.deepEqual(gaps(tie, {}).map((g) => g.skill), ['a', 'b'], 'the target defaults to 0.70');
  assert.deepEqual(gaps({ skills: { z: { asks: 1, ba: 0.69 } } }).map((g) => g.skill), ['z'], 'and with no policy at all');
  assert.deepEqual(gaps({ skills: { z: { asks: 1, ba: 0.7 } } }), []);
  for (const junk of [null, {}, { skills: 'x' }]) assert.deepEqual(gaps(junk, { target: 0.7 }), []);
});

test('flags: a coupling trusted above where links start, whose answers are below the target', () => {
  const m = observe(round());
  assert.deepEqual(flags(m, { target: 0.7, start: 500000 }), [{ asker: 'a1', holder: 'hb', skill: 'bank', weight: 900000, ba: 0 }, { asker: 'a1', holder: 'hs', skill: 'shop', weight: 700000, ba: 0.5 }]);
  assert.deepEqual(flags(m, { target: 0.7, start: 700000 }).map((f) => f.holder), ['hb'], 'at the start is not above it');
  assert.deepEqual(flags(m, { target: 0.5, start: 500000 }).map((f) => f.holder), ['hb'], 'at the target is not below it');
  assert.deepEqual(flags(m, {}).map((f) => f.holder), ['hb', 'hs'], 'the defaults: target 0.70, links start at 500,000');
  assert.deepEqual(flags(m).length, 2);
  assert.deepEqual(flags({ couplings: [{ weight: null, asks: 1, ba: 0 }, { weight: 900000, asks: 0, ba: 0 }, null, { weight: 1.5, asks: 1, ba: 0 }] }, {}), [], 'no link known, nothing asked, junk');
  for (const junk of [null, {}, { couplings: 'x' }]) assert.deepEqual(flags(junk, {}), []);
});

test('predict and grade: last measured, or a joined node\'s gate score; the mean absolute error', () => {
  const m = observe(round());
  assert.deepEqual(predict(m, {}), { adult: 0, bank: 0.25, shop: 0.75 });
  assert.deepEqual(predict(m, { adult: 0.7123456, bank: 'x' }), { adult: 0.712346, bank: 0.25, shop: 0.75 }, 'a joined node brings its gate score');
  assert.deepEqual(predict(m, { toString: 0.9 }), { adult: 0, bank: 0.25, shop: 0.75 }, 'no inherited name');
  assert.deepEqual(predict(m), { adult: 0, bank: 0.25, shop: 0.75 });
  assert.deepEqual(predict(null, { a: 1 }), {});
  assert.deepEqual(grade({ a: 0.5, b: 0.7, c: 1 }, { a: 0.6, b: 0.6, d: 0 }), { n: 2, mae: 0.1 });
  assert.deepEqual(grade({ a: 0.5 }, { a: 0.5 }), { n: 1, mae: 0 });
  assert.deepEqual(grade({ a: 'x' }, { a: 0.5 }), { n: 0, mae: 0 });
  assert.deepEqual(grade({ a: 0.5 }, { a: NaN }), { n: 0, mae: 0 });
  assert.deepEqual(grade({ toString: 1 }, {}), { n: 0, mae: 0 });
  assert.deepEqual(grade(null, null), { n: 0, mae: 0 });
  assert.deepEqual(grade({ a: 0.9, b: 0.2 }, { b: 0.5, a: 0.4 }), { n: 2, mae: 0.4 }, 'whatever the order');
});
