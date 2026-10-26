import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, EXPECT, EDGE_STAGES } from './judge.mjs';

const claims = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const kind = (stage, n = 1000) => ({ n, admitted: 0, decoded: 0, stages: { [stage]: n } });
const good = () => ({
  passes: [1],
  g1: { heard: 5000, admitted: 0, decoded: 0, stages: { size: 3000, magic: 2000 } },
  g2: { kinds: Object.fromEntries(Object.entries(EXPECT).map(([k, s]) => [k, kind(s)])) },
  g3: { n: 1000, admitted: 1000, equal: 1000 },
  e1: { good: { n: 10, admitted: 10, equal: 10 }, bad: { n: 40, refused: 40, packets: 0, stages: { json: 10, utf8: 10, shape: 10, size: 10 } } },
  e2: { n: 20000, inbound: 10000, outbound: 10000, throws: 0, malformed: 0 },
  e3: { g3: { n: 1000, roundTrip: 1000 }, g2: { n: 6000, output: 0 } },
});
const v = (facts, id) => judge(claims, facts).verdicts.find((x) => x.id === id);

test('the expected stages and the edge stages', () => {
  assert.deepEqual(EXPECT, { unsigned: 'signature', unpinned: 'sender', tampered: 'signature', replayed: 'counter', dictionary: 'dictionary', length: 'length' });
  assert.deepEqual(EDGE_STAGES, ['size', 'utf8', 'json', 'shape']);
  assert.equal(Object.isFrozen(EXPECT) && Object.isFrozen(EDGE_STAGES), true);
});

test('pass 1 all held; the later passes are not measured, never guessed', () => {
  const j = judge(claims, good());
  assert.deepEqual([j.held, j.failed, j.open], [6, 0, 9]);
  assert.deepEqual(j.verdicts.map((x) => x.id), claims.claims.map((c) => c.id));
  for (const x of j.verdicts.filter((y) => y.pass !== 1)) assert.deepEqual([x.held, x.measured], [null, 'not measured yet: pass ' + x.pass]);
  assert.equal(v(good(), 'G1').measured, '5000 standard-format payloads heard: 0 admitted, 0 decoded; refused at size 3000, magic 2000');
  assert.equal(v(good(), 'G2').measured, Object.entries(EXPECT).map(([k, s]) => k + ' 1000 (' + s + ' 1000)').join('; '));
  assert.equal(v(good(), 'G3').measured, '1000 packets a pinned peer signed: 1000 admitted, 1000 equal to what was sent, after the node had learned from every refusal above');
  assert.equal(v(good(), 'E1').measured, '10 well-formed requests: 10 admitted, 10 equal; 40 malformed: 40 refused (json 10, utf8 10, shape 10, size 10), 0 packets built');
  assert.equal(v(good(), 'E2').measured, '20000 garbage inputs (10000 in, 10000 out): 0 throws, 0 results that were neither a refusal with a stage nor a well-formed result');
  assert.equal(v(good(), 'E3').measured, '1000 trusted packets out through the edge: 1000 parsed back exactly; 6000 untrusted packets: 0 produced output');
  assert.equal(v(good(), 'G1').predicted, claims.claims[0].predicted);
  assert.equal(v(good(), 'G1').pass, 1);
});

test('G1: the count, nothing admitted, nothing decoded', () => {
  const f = good(); f.g1.heard = 4999;
  assert.equal(v(f, 'G1').held, false);
  for (const k of ['admitted', 'decoded']) { const g = good(); g.g1[k] = 1; assert.equal(v(g, 'G1').held, false, k); }
  const z = good(); z.g1.stages = {};
  assert.match(v(z, 'G1').measured, /refused at none$/);
  const q = good(); q.g1.stages = { size: 0, magic: 5 };
  assert.match(v(q, 'G1').measured, /refused at magic 5$/, 'a stage counted zero is not listed');
  assert.equal(v({ passes: [1] }, 'G1').held, false);
  assert.match(v({ passes: [1] }, 'G1').measured, /^-1 standard-format payloads heard: -1 admitted, -1 decoded/, 'junk counts read as none, and fail');
  for (const junk of [-5, 1.5, '7', NaN]) {
    const g = good(); g.g1.heard = junk;
    assert.match(v(g, 'G1').measured, /^-1 standard-format payloads heard/, 'a count is a whole number from 0: ' + junk);
  }
});

test('G2: every kind at least 1,000, refused only at its own stage, none admitted or decoded', () => {
  for (const k of Object.keys(EXPECT)) {
    const f = good(); f.g2.kinds[k].n = 999; f.g2.kinds[k].stages = { [EXPECT[k]]: 999 };
    assert.equal(v(f, 'G2').held, false, k + ' short');
    const w = good(); w.g2.kinds[k].stages = { [EXPECT[k]]: 999, magic: 1 };
    assert.equal(v(w, 'G2').held, false, k + ' one at another stage');
    const o = good(); o.g2.kinds[k].stages = { error: 1000 };
    assert.equal(v(o, 'G2').held, false, k + ' all at the wrong stage');
    const a = good(); a.g2.kinds[k].admitted = 1;
    assert.equal(v(a, 'G2').held, false);
    assert.match(v(a, 'G2').measured, new RegExp(k + ' 1000 \\(' + EXPECT[k] + ' 1000, 1 ADMITTED\\)'));
    const d = good(); d.g2.kinds[k].decoded = 2;
    assert.equal(v(d, 'G2').held, false);
    assert.match(v(d, 'G2').measured, new RegExp(k + ' 1000 \\(' + EXPECT[k] + ' 1000, 2 DECODED\\)'));
    const m = good(); delete m.g2.kinds[k];
    assert.equal(v(m, 'G2').held, false, k + ' missing');
    const s = good(); s.g2.kinds[k].stages = { [EXPECT[k]]: 999 };
    assert.equal(v(s, 'G2').held, false, k + ' stage count short of n');
  }
  const more = good(); more.g2.kinds.length = kind('length', 1500);
  assert.equal(v(more, 'G2').held, true, 'more than 1,000 is fine');
  assert.equal(v({ passes: [1], g2: { kinds: 'x' } }, 'G2').held, false);
  assert.equal(v({ passes: [1], g2: 'x' }, 'G2').held, false);
});

test('G3, E1, E2, E3: each edge of each rule', () => {
  const t = (mut, id) => { const f = good(); mut(f); return v(f, id).held; };
  assert.equal(t((f) => { f.g3 = { n: 999, admitted: 999, equal: 999 }; }, 'G3'), false);
  assert.equal(t((f) => { f.g3.admitted = 999; }, 'G3'), false);
  assert.equal(t((f) => { f.g3.equal = 999; }, 'G3'), false);
  assert.equal(t((f) => { f.g3 = { n: 1500, admitted: 1500, equal: 1500 }; }, 'G3'), true);
  assert.equal(t((f) => { f.g3 = null; }, 'G3'), false);
  assert.equal(t((f) => { f.e1.good = { n: 0, admitted: 0, equal: 0 }; }, 'E1'), false, 'no good request: nothing shown');
  assert.equal(t((f) => { f.e1.good.admitted = 9; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.good.equal = 9; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.bad = { n: 0, refused: 0, packets: 0, stages: {} }; }, 'E1'), false, 'no bad request: nothing shown');
  assert.equal(t((f) => { f.e1.bad.refused = 39; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.bad.packets = 1; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.bad.stages = { json: 10, utf8: 10, shape: 10, packet: 10 }; }, 'E1'), false, 'packet is not an edge refusal of a malformed request');
  assert.equal(t((f) => { f.e1.bad.stages = { json: 39 }; }, 'E1'), false, 'the stages must account for every bad request');
  assert.equal(t((f) => { f.e1.bad.stages = { json: 40 }; }, 'E1'), true);
  assert.equal(t((f) => { f.e1.good = { n: 1, admitted: 1, equal: 1 }; }, 'E1'), true, 'one good request is enough to show it');
  assert.equal(t((f) => { f.e1.bad = { n: 1, refused: 1, packets: 0, stages: { json: 1 } }; }, 'E1'), true, 'one bad request is enough to show it');
  assert.equal(t((f) => { f.e1 = 'x'; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.good = 'x'; }, 'E1'), false);
  assert.equal(t((f) => { f.e1.bad = 'x'; }, 'E1'), false);
  assert.equal(t((f) => { f.e2.n = 19999; }, 'E2'), false);
  assert.equal(t((f) => { f.e2.n = 20001; }, 'E2'), false, 'exactly the sealed 20,000');
  assert.equal(t((f) => { f.e2.throws = 1; }, 'E2'), false);
  assert.equal(t((f) => { f.e2.malformed = 1; }, 'E2'), false);
  assert.equal(t((f) => { f.e2 = 5; }, 'E2'), false);
  assert.equal(t((f) => { f.e3.g3 = { n: 999, roundTrip: 999 }; }, 'E3'), false);
  assert.equal(t((f) => { f.e3.g3.roundTrip = 999; }, 'E3'), false);
  assert.equal(t((f) => { f.e3.g2 = { n: 5999, output: 0 }; }, 'E3'), false);
  assert.equal(t((f) => { f.e3.g2.output = 1; }, 'E3'), false);
  assert.equal(t((f) => { f.e3.g2 = { n: 7000, output: 0 }; }, 'E3'), true);
  assert.equal(t((f) => { f.e3 = null; }, 'E3'), false);
  assert.equal(t((f) => { f.e3.g3 = 1; f.e3.g2 = 1; }, 'E3'), false);
});

test('junk in, a verdict out: never a throw', () => {
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.deepEqual(judge({ claims: 'x' }, good()).verdicts, []);
  const j = judge(claims, null);
  assert.equal(j.open, claims.claims.length, 'no facts: nothing measured');
  assert.equal(judge(claims, { passes: 'x' }).open, claims.claims.length);
  assert.equal(judge({ claims: [null, 5, { id: 'Z9', pass: 1 }] }, good()).verdicts.length, 1, 'only records are claims');
  assert.equal(judge({ claims: [{ id: 'Z9', pass: 1, predicted: 'p' }] }, good()).verdicts[0].held, null, 'a claim with no rule is not measured');
  assert.equal(judge({ claims: [{ id: 'toString', pass: 1 }] }, good()).verdicts[0].held, null, 'no inherited rule');
});
