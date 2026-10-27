import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, BAR, MARGIN } from './judge.mjs';

const C = { claims: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((id) => ({ id, predicted: 'p-' + id })) };
const set = (over) => ({ messages: 70, digest: 'd', valid: 70, outside: 0, mindRight: 49, keywordRight: 40, keywordsFirstRight: 47, mindFirstRight: 47, askedOfMind: 20, recountDiffers: [], ...over });
function good() {
  return { digests: { sealed: 'd', fresh: 'e', freshKeywordRight: 40 }, sealed: set({}), fresh: set({ digest: 'e' }), b5: { reproduced: true, why: null }, b6: { cases: 20000, outside: 0, throws: 0 } };
}
const v = (f, id) => judge(C, f).verdicts.find((x) => x.id === id);
function put(f, path, value) { const ks = path.split('.'); let o = f; for (const k of ks.slice(0, -1)) o = o[k]; if (value === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = value; return f; }
function eachFails(id, flips) {
  assert.equal(v(good(), id).held, true, id + ' holds on the good facts');
  for (const [p, val] of flips) assert.equal(v(put(good(), p, val), id).held, false, id + ': ' + p + ' = ' + JSON.stringify(val));
}

test('the constants', () => { assert.equal(BAR, 49); assert.equal(MARGIN, 7); });

test('judge: the sealed order, the predictions carried, nothing guessed', () => {
  const j = judge(C, good());
  assert.deepEqual(j.verdicts.map((x) => [x.id, x.held, x.predicted]), [['B1', true, 'p-B1'], ['B2', true, 'p-B2'], ['B3', true, 'p-B3'], ['B4', true, 'p-B4'], ['B5', true, 'p-B5'], ['B6', true, 'p-B6']]);
  assert.deepEqual([j.held, j.failed, j.open], [6, 0, 0]);
  const none = judge(C, {});
  assert.deepEqual([none.held, none.failed, none.open], [0, 0, 6]);
  assert.deepEqual(none.verdicts[0], { id: 'B1', held: null, measured: 'not measured yet', predicted: 'p-B1' });
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.equal(judge({ claims: [{ id: 'X' }, null, { id: 'toString' }] }, good()).verdicts.every((x) => x.held === null), true);
  const g = good(); delete g.digests;
  assert.equal(v(g, 'B1').held, null, 'B1 needs CI\'s digests');
  assert.equal(v(g, 'B5').held, true);
});

test('B1 and B2: the sealed set', () => {
  eachFails('B1', [['sealed.messages', 69], ['sealed.digest', 'x'], ['sealed.digest', 5], ['digests.sealed', 'y'], ['sealed.valid', 69], ['sealed.outside', 1], ['sealed.recountDiffers', ['valid']], ['sealed.recountDiffers', undefined], ['sealed.valid', 70.5]]);
  eachFails('B2', [['sealed.mindRight', 48], ['sealed.recountDiffers', ['mindRight']], ['sealed.digest', 'x'], ['sealed.outside', 1]]);
  assert.equal(v(put(good(), 'sealed.valid', 40), 'B2').held, true, 'B2 is the mind\'s count, not the format');
  assert.equal(v(good(), 'B1').measured, '70 of 70 replies a proposal, 0 routes outside the seven; every count re-derived from the raw replies');
  assert.match(v(put(put(good(), 'sealed.digest', 'x'), 'sealed.recountDiffers', ['valid', 'rows 2']), 'B1').measured, /NOT Phase 5's sealed messages.*DIFFERS \(valid, rows 2\)$/);
  assert.equal(v(good(), 'B2').measured, 'the mind\'s own proposal right for 49 of 70 (bar 49); every count re-derived from the raw replies');
});

test('B3 and B4: the fresh set', () => {
  eachFails('B3', [['fresh.digest', 'd'], ['fresh.messages', 71], ['fresh.keywordsFirstRight', 46], ['fresh.keywordRight', 41], ['digests.freshKeywordRight', 39], ['fresh.recountDiffers', ['keywordRight']], ['fresh.outside', 1], ['fresh.keywordRight', -1]]);
  assert.equal(v(put(put(good(), 'fresh.keywordRight', 0), 'digests.freshKeywordRight', 0), 'B3').held, true, 'a keyword count of 0 is a count');
  const tied = put(put(put(good(), 'fresh.keywordRight', 0), 'digests.freshKeywordRight', 0), 'fresh.keywordsFirstRight', 6);
  assert.equal(v(tied, 'B3').held, false);
  eachFails('B4', [['fresh.mindFirstRight', 48], ['fresh.digest', 'x'], ['fresh.recountDiffers', ['mindFirstRight']], ['fresh.keywordsFirstRight', -1]]);
  assert.equal(v(put(good(), 'fresh.mindFirstRight', 46), 'B4').held, true);
  assert.equal(v(put(put(good(), 'fresh.keywordsFirstRight', 0), 'fresh.mindFirstRight', 0), 'B4').held, true, 'two counts of 0 tie');
  assert.equal(v(put(good(), 'sealed.mindRight', 49.5), 'B2').held, false, 'a count is a whole number');
  assert.equal(v(good(), 'B3').measured, 'on the 70 fresh messages: keyword-first right 47, the keyword rule alone 40 (CI 40); bar: at least 7 more; the mind asked about 20; every count re-derived from the raw replies');
  assert.match(v(put(good(), 'fresh.digest', 'q'), 'B3').measured, /\(NOT the sealed fresh set\)/);
  assert.equal(v(good(), 'B4').measured, 'keyword-first right 47, mind-first (Phase 5\'s policy) 47, on the same fresh messages and replies');
});

test('B5 and B6', () => {
  eachFails('B5', [['b5.reproduced', false], ['b5.reproduced', 'yes']]);
  assert.equal(v(good(), 'B5').measured, 'Phase 5\'s receipt, measured again at this commit: byte for byte the same');
  assert.equal(v(put(put(good(), 'b5.reproduced', false), 'b5.why', 'drift'), 'B5').measured, 'Phase 5\'s receipt, measured again at this commit: DIFFERENT (drift)');
  assert.equal(v(put(good(), 'b5.reproduced', false), 'B5').measured, 'Phase 5\'s receipt, measured again at this commit: DIFFERENT');
  eachFails('B6', [['b6.cases', 19999], ['b6.outside', 1], ['b6.throws', 1]]);
  assert.equal(v(good(), 'B6').measured, '20000 fuzzed replies and messages through keyword-first: 0 routes outside the seven, 0 throws');
});
