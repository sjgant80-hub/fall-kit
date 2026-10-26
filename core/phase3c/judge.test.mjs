import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, RULES } from './judge.mjs';
import { RULES as W } from '../phase3b/judge.mjs';

const claims = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const NOT_SIGNED = 'the packet is not signed by the holder it accuses';
const D = (c) => c.repeat(64);
const w4 = () => ({ askers: 4, holder: 'h2', silence: { sent: 4, quiet: 4, answered: 4, quietAfter: 0 }, lied: { sent: 16, refused: 16, already: 0, adopted: 0, why: { 'the answer checks here': 4, [NOT_SIGNED]: 12 } },
  stranger: { sent: 4, refusedAtDoor: 4, stages: { sender: 4 } }, linksCompared: 112, linksChanged: 0, next: { asks: 4, toHonest: 4, answered: 4 } });
const good = () => ({ passes: [1], v1: w4(), v2: { now: { w1: D('a'), w2: D('b'), w3: D('c') }, was: { w1: D('a'), w2: D('b'), w3: D('c') } } });
const v = (f, id) => judge(claims, f).verdicts.find((x) => x.id === id);
const t = (id, mut) => { const f = good(); mut(f); return v(f, id); };

test('both held, said exactly; V1 is W4 judged by Phase 3b\'s own rule', () => {
  const j = judge(claims, good());
  assert.deepEqual([j.held, j.failed, j.open], [2, 0, 0]);
  assert.deepEqual(j.verdicts.map((x) => x.id), ['V1', 'V2']);
  assert.deepEqual(j.verdicts.map((x) => x.predicted), claims.claims.map((c) => c.predicted));
  assert.deepEqual(v(good(), 'V1').measured, W.W4({ w4: w4() })[1], 'the same sentence W4 would give');
  assert.match(v(good(), 'V1').measured, /16 false lied notes: 16 refused \(4 because the answer checks here, 12 because the packet is not signed by the holder it accuses\), 0 answered as already judged, 0 counted;/);
  assert.equal(v(good(), 'V2').measured, 'W1, W2 and W3 re-measured with the change: 3 of 3 identical to Phase 3b\'s receipt; SHA-256 of each: W1 aaaaaaaaaaaa…, W2 bbbbbbbbbbbb…, W3 cccccccccccc…');
  assert.deepEqual(Object.keys(RULES), ['V1', 'V2']);
});

test('V1: W4\'s bar, every count', () => {
  assert.equal(t('V1', (f) => { f.v1.lied.refused = 12; f.v1.lied.already = 4; }).held, false, 'W4 as it failed in Phase 3b fails here too');
  assert.equal(t('V1', (f) => { f.v1.linksChanged = 1; }).held, false);
  assert.equal(t('V1', (f) => { f.v1.silence.quietAfter = 1; }).held, false);
  assert.equal(t('V1', (f) => { f.v1 = null; }).held, false);
  assert.equal(t('V1', (f) => { f.v1 = [w4()]; }).held, false, 'facts in another shape are no facts');
  assert.equal(t('V1', (f) => { delete f.v1; }).held, false);
});

test('V2: all three digests equal, each a real digest', () => {
  assert.equal(t('V2', (f) => { f.v2.now.w2 = D('d'); }).held, false);
  assert.match(t('V2', (f) => { f.v2.now.w2 = D('d'); }).measured, /: 2 of 3 identical to Phase 3b's receipt \(they differ in W2\); SHA-256 of each: W1 a{12}…, W2 d{12}…, W3 c{12}…$/);
  assert.match(t('V2', (f) => { f.v2.now.w1 = D('e'); f.v2.now.w3 = D('f'); }).measured, /\(they differ in W1, W3\)/);
  assert.equal(t('V2', (f) => { f.v2.was.w3 = D('0'); }).held, false);
  for (const junk of ['', 'abc', D('A'), 5, null]) assert.equal(t('V2', (f) => { f.v2.now.w1 = junk; f.v2.was.w1 = junk; }).held, false, 'two equal non-digests prove nothing: ' + String(junk).slice(0, 6));
  assert.equal(t('V2', (f) => { delete f.v2.now.w3; delete f.v2.was.w3; }).held, false, 'a missing part is not equal');
  assert.equal(t('V2', (f) => { f.v2.now = 'x'; }).held, false);
  assert.equal(t('V2', (f) => { f.v2.was = []; }).held, false);
  assert.equal(t('V2', (f) => { f.v2 = null; }).held, false);
  assert.match(t('V2', (f) => { f.v2 = null; }).measured, /0 of 3 identical .*\(they differ in W1, W2, W3\); SHA-256 of each: W1 undefined…/);
});

test('a pass not run is not measured; anything at all is judged without a throw', () => {
  const j = judge(claims, { ...good(), passes: [] });
  assert.deepEqual([j.held, j.failed, j.open], [0, 0, 2]);
  assert.deepEqual([j.verdicts[1].held, j.verdicts[1].measured], [null, 'not measured yet: pass 1']);
  const extra = { ...claims, claims: [...claims.claims, { id: 'V9', pass: 1, predicted: 'HOLD' }, null, 'x'] };
  assert.deepEqual(judge(extra, good()).verdicts.map((x) => [x.id, x.held]), [['V1', true], ['V2', true], ['V9', null]], 'a claim with no rule is never guessed');
  for (const g of [null, undefined, 5, 'x', [], {}, { passes: 'x' }, { passes: [1] }, { passes: [1], v1: 5, v2: { now: 5, was: 'x' } }]) {
    assert.doesNotThrow(() => judge(claims, g));
    assert.doesNotThrow(() => judge(g, good()));
  }
  assert.deepEqual(judge(claims, { passes: [1] }).verdicts.map((x) => x.held), [false, false], 'no facts hold nothing');
  assert.deepEqual(judge(null, good()), { verdicts: [], held: 0, failed: 0, open: 0 });
});
