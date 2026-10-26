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
  assert.deepEqual(judge(claims, { ...good2(), passes: [1, 2] }).held, 9, 'with pass 2: nine held');
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

const J = (name, events, bytes, over = {}) => ({ name, events, legacy: 'gzip', light: 'light', migrated: true, asideKept: true, sameEvents: true, sameSnapshot: true, bytes, ...over });
const journals = () => [J('a', 2, { light: 100, gzip: 120, envelope: 200 }), J('b', 30, { light: 300, gzip: 330, envelope: 700 }), J('c', 10000, { light: 34000, gzip: 68000, envelope: 91000 })];
const good2 = () => ({ ...good(), passes: [1, 2], m1: { journals: journals() }, m2: { journals: journals() }, m3: { nights: [{ files: 358, bytes: 3000000, vaultBytes: 700000, identical: true, mismatched: 0, extra: 0 }] } });
const v2 = (facts, id) => judge(claims, facts).verdicts.find((x) => x.id === id);

test('M1: at least three journals, one of 10,000 events, each whole', () => {
  assert.equal(v2(good2(), 'M1').held, true);
  assert.equal(v2(good2(), 'M1').measured, '3 journals (2, 30, 10000 events): each loaded from gzip, migrated to LIGHT with the old file kept aside, and reloaded to the same events, the same organ counts and the same event hash');
  for (const k of ['legacy', 'light', 'migrated', 'asideKept', 'sameEvents', 'sameSnapshot']) {
    const f = good2(); f.m1.journals[1] = { ...f.m1.journals[1], [k]: k === 'legacy' ? 'light' : k === 'light' ? 'gzip' : false };
    assert.equal(v2(f, 'M1').held, false, k);
    assert.match(v2(f, 'M1').measured, /NOT whole: b$/);
  }
  const two = good2(); two.m1.journals = two.m1.journals.slice(1);
  assert.equal(v2(two, 'M1').held, false, 'fewer than three');
  const no10k = good2(); no10k.m1.journals[2].events = 9999;
  assert.equal(v2(no10k, 'M1').held, false, 'no 10,000-event journal');
  const extra = good2(); extra.m1.journals.push(J('d', 5, {}));
  assert.equal(v2(extra, 'M1').held, true, 'more than three is fine');
  assert.equal(v2({ ...good2(), m1: { journals: [null, 5, ...journals()] } }, 'M1').held, true, 'junk entries are not journals');
  assert.equal(v2({ ...good2(), m1: 'x' }, 'M1').held, false);
  assert.equal(v2({ ...good2(), m1: { journals: 'x' } }, 'M1').held, false);
});

test('M2: LIGHT at most the raw gzip stream on every journal, the envelope reported beside it', () => {
  assert.equal(v2(good2(), 'M2').held, true);
  assert.equal(v2(good2(), 'M2').measured, 'LIGHT against the raw gzip stream: a 100 vs 120; b 300 vs 330; c 34000 vs 68000. Against the gzip envelope as it sat on disk: 100 vs 200, 300 vs 700, 34000 vs 91000');
  const over = good2(); over.m2.journals[1].bytes = { light: 342, gzip: 331, envelope: 701 };
  assert.equal(v2(over, 'M2').held, false);
  assert.ok(v2(over, 'M2').measured.includes('b 342 vs 331 (LARGER)'));
  const tie = good2(); tie.m2.journals[0].bytes = { light: 120, gzip: 120, envelope: 1 };
  assert.equal(v2(tie, 'M2').held, true, 'equal is no larger');
  const junk = good2(); junk.m2.journals[0].bytes = { light: -1, gzip: 5 };
  assert.equal(v2(junk, 'M2').held, false, 'a junk count fails');
  const junk2 = good2(); junk2.m2.journals[0].bytes = { light: 1, gzip: 'x' };
  assert.equal(v2(junk2, 'M2').held, false);
  const nob = good2(); nob.m2.journals[0].bytes = null;
  assert.equal(v2(nob, 'M2').held, false);
  assert.equal(v2({ ...good2(), m2: { journals: [] } }, 'M2').held, false, 'no journal shows nothing');
  const zero = good2(); zero.m2.journals[0].bytes = { light: 0, gzip: 0, envelope: 0 };
  assert.equal(v2(zero, 'M2').held, true, 'zero is a count');
  const one = good2(); one.m2.journals = [one.m2.journals[2]];
  assert.equal(v2(one, 'M2').held, true, 'one journal is enough to show it');
});

test('M3: every night byte-identical and smaller than the files', () => {
  assert.equal(v2(good2(), 'M3').held, true);
  assert.equal(v2(good2(), 'M3').measured, '1 night(s): 358 files, 3000000 bytes into 700000, byte-identical');
  const t = (mut) => { const f = good2(); mut(f.m3.nights[0]); return v2(f, 'M3'); };
  assert.equal(t((x) => { x.identical = false; }).held, false);
  assert.match(t((x) => { x.identical = false; }).measured, /NOT identical or not smaller$/);
  assert.equal(t((x) => { x.mismatched = 1; }).held, false);
  assert.equal(t((x) => { x.extra = 2; }).held, false);
  assert.equal(t((x) => { x.vaultBytes = 3000000; }).held, false, 'not smaller');
  assert.equal(t((x) => { x.vaultBytes = 2999999; }).held, true);
  assert.equal(t((x) => { x.bytes = 0; x.vaultBytes = 0; }).held, false, 'an empty memory shows nothing');
  assert.equal(t((x) => { x.vaultBytes = -1; }).held, false);
  assert.equal(t((x) => { x.vaultBytes = 0; }).held, true, 'an empty vault of a non-empty memory is smaller');
  assert.equal(t((x) => { x.bytes = '5000000'; }).held, false, 'a count is a whole number, not text');
  const two = good2(); two.m3.nights.push({ files: 1, bytes: 10, vaultBytes: 20, identical: true, mismatched: 0, extra: 0 });
  assert.equal(v2(two, 'M3').held, false, 'every night, not some');
  assert.equal(v2({ ...good2(), m3: { nights: [] } }, 'M3').held, false);
  assert.equal(v2({ ...good2(), m3: null }, 'M3').held, false);
  assert.equal(v2({ ...good2(), m3: { nights: [null] } }, 'M3').held, false, 'junk is no night');
});

const good3 = () => ({ ...good2(), passes: [1, 2, 3], i1: { run: { calls: 13, records: 13, readBack: true, matches: true, bytes: 10905, jsonBytes: 21157 }, nightly: { records: 1, readBack: true, bytes: 1300 } } });
test('I1: every call of the run in the book and read back, and the nightly loop’s calls read back', () => {
  assert.equal(v2(good3(), 'I1').held, true);
  assert.equal(v2(good3(), 'I1').measured, 'the measured run: 13 of 13 calls in the book, every one read back as its call (10905 bytes; 21157 as JSON); the nightly loop: 1 call(s), read back');
  const t3 = (mut) => { const f = good3(); mut(f.i1); return v2(f, 'I1'); };
  assert.equal(t3((x) => { x.run.records = 12; }).held, false, 'one missing');
  assert.equal(t3((x) => { x.run.readBack = false; }).held, false);
  assert.match(t3((x) => { x.run.readBack = false; }).measured, /NOT read back whole/);
  assert.equal(t3((x) => { x.run.matches = false; }).held, false);
  assert.match(t3((x) => { x.run.matches = false; }).measured, /NOT read back whole/);
  assert.equal(t3((x) => { x.run.calls = 0; x.run.records = 0; }).held, false, 'an empty run shows nothing');
  assert.equal(t3((x) => { x.run.calls = 1; x.run.records = 1; }).held, true, 'one call is enough to show it');
  assert.equal(t3((x) => { x.nightly.records = 0; }).held, false, 'no nightly call');
  assert.equal(t3((x) => { x.nightly.records = 2; }).held, true);
  assert.equal(t3((x) => { x.nightly.readBack = false; }).held, false);
  assert.match(t3((x) => { x.nightly.readBack = false; }).measured, /NOT read back$/);
  assert.equal(t3((x) => { x.run = null; }).held, false);
  assert.equal(t3((x) => { x.nightly = 'x'; }).held, false);
  assert.equal(v2({ ...good3(), i1: null }, 'I1').held, false);
  assert.deepEqual([judge(claims, good3()).held, judge(claims, good3()).open], [10, 5], 'with pass 3: ten held, five still open');
});

const b1facts = () => ({ a: { light: true, admitted: 31, legacy: 10, legacyMarked: 10, wronglyAdmitted: 0, refused: { signature: 20, sender: 10, counter: 10 } }, b: { light: true, sent: 21, posted: { forged: 10, stranger: 10, tampered: 10, replayed: 10, legacy: 10 } } });
const B = (name, how, ported, ci, live) => ({ name, how, ported, ci, live });
const b2facts = () => ({ builds: [B('a', 'inline', true, 'success', true), B('b', 'inline', true, 'none', true), B('c', 'shim', false, 'none', true), B('d', 'inline', false, 'none', false)] });
const census = () => ({ rule: 'own code only', privateSpeaking: 1, throughFoundationOnly: 2, throughKitOnly: 90, carryingTheKitMesh: 95, speaks: ['break-it', 'fall-kit', 'kar-mind', 'konomi-slm', 'konomi-tongue'].map((name) => ({ name, file: 'src/' + name + '.mjs', files: 1 })) });
const good5 = () => ({ ...good3(), passes: [1, 2, 3, 4, 5], b1: b1facts(), b2: b2facts(), census: census() });

test('B1: two pages: every signed message in, each refused kind at its stage, legacy marked', () => {
  assert.equal(v2(good5(), 'B1').held, true);
  assert.equal(v2(good5(), 'B1').measured, 'two pages on one device: 31 of 31 signed messages admitted; refused at the signature 20 of 20, at the sender 10 of 10, at the counter 10 of 10; 10 of 10 old JSON messages marked legacy; 0 wrongly admitted');
  const t = (mut) => { const f = good5(); mut(f.b1); return v2(f, 'B1').held; };
  assert.equal(t((x) => { x.a.admitted = 30; }), false);
  assert.equal(t((x) => { x.a.admitted = 32; }), false, 'more admitted than were signed');
  assert.equal(t((x) => { x.a.refused.signature = 19; }), false);
  assert.equal(t((x) => { x.a.refused.sender = 9; }), false);
  assert.equal(t((x) => { x.a.refused.counter = 11; }), false);
  assert.equal(t((x) => { x.a.refused.magic = 1; }), false, 'a refusal at a stage nothing was sent for');
  assert.equal(t((x) => { x.a.refused.magic = 0; }), false, 'any other stage named, even at zero');
  assert.equal(t((x) => { x.a.legacy = 9; }), false);
  assert.equal(t((x) => { x.a.legacyMarked = 9; }), false);
  assert.equal(t((x) => { x.a.wronglyAdmitted = 1; }), false);
  assert.equal(t((x) => { x.a.light = false; }), false, 'a page on the JSON mesh measures nothing');
  assert.equal(t((x) => { x.b.light = false; }), false);
  for (const k of ['forged', 'stranger', 'tampered', 'replayed', 'legacy']) assert.equal(t((x) => { x.b.posted[k] = 0; }), false, 'nothing ' + k + ' sent');
  assert.equal(t((x) => { x.b.sent = 0; x.a.admitted = 10; }), false, 'no message spoken through the kit');
  assert.equal(t((x) => { x.b.sent = 1; x.a.admitted = 11; }), true, 'one message is enough');
  assert.equal(t((x) => { x.b.posted.legacy = 1; x.a.legacy = 1; x.a.legacyMarked = 1; }), true);
  assert.equal(t((x) => { x.b.posted.forged = 1; x.a.refused.signature = 11; }), true, 'one forged packet is enough');
  assert.equal(t((x) => { x.b.posted.tampered = 1; x.a.refused.signature = 11; }), true, 'one changed packet is enough');
  assert.equal(t((x) => { x.b.posted.stranger = 1; x.a.refused.sender = 1; }), true, 'one stranger is enough');
  assert.equal(t((x) => { x.b.posted.replayed = 1; x.a.refused.counter = 1; x.a.admitted = 22; }), true, 'one replay is enough');
  assert.equal(t((x) => { x.a.refused = null; }), false);
  assert.equal(t((x) => { delete x.a; }), false);
  assert.equal(v2({ ...good5(), b1: null }, 'B1').held, false);
});

test('B2: every re-ported build live with the mesh, and green where it has CI', () => {
  assert.equal(v2(good5(), 'B2').held, true);
  assert.equal(v2(good5(), 'B2').measured, '2 builds re-ported: 1 of the 1 with CI green, 1 have no CI; 2 live pages carry the LIGHT mesh; 1 load the newest kit through the shim; 1 not ported');
  const t = (mut) => { const f = good5(); mut(f.b2.builds); return v2(f, 'B2'); };
  assert.equal(t((bs) => { bs[0].ci = 'failure'; }).held, false);
  assert.match(t((bs) => { bs[0].ci = 'failure'; }).measured, /NOT green: a\)/);
  assert.equal(t((bs) => { bs[0].ci = 'in_progress'; }).held, false, 'not yet green is not green');
  assert.equal(t((bs) => { bs[1].live = false; }).held, false);
  assert.match(t((bs) => { bs[1].live = false; }).measured, /NOT: b\)/);
  assert.equal(t((bs) => { bs[2].live = false; bs[3].ci = 'failure'; }).held, true, 'what was not ported is reported apart, not judged');
  assert.equal(t((bs) => { for (const b of bs) b.ported = false; }).held, false, 'nothing ported shows nothing');
  assert.equal(t((bs) => { bs[1].ported = false; }).held, true, 'one ported build is enough to show it');
  assert.match(t((bs) => { bs.push(B('e', 'none', false, 'none', false)); }).measured, /; 1 load the newest kit through the shim; 2 not ported$/, 'the shim builds are not counted as not ported');
  assert.equal(v2({ ...good5(), b2: { builds: [null, ...b2facts().builds] } }, 'B2').held, true, 'junk is no build');
  assert.equal(v2({ ...good5(), b2: { builds: 'x' } }, 'B2').held, false);
  assert.equal(v2({ ...good5(), b2: null }, 'B2').held, false);
});

test('C1–C3: the census, by its own rule', () => {
  assert.equal(v2(good5(), 'C1').held, true);
  assert.match(v2(good5(), 'C1').measured, /^5 public repositories speak LIGHT in their own code, each named with one own file \(break-it: src\/break-it\.mjs; /);
  assert.match(v2(good5(), 'C1').measured, /\); 1 private; 2 only through a vendored foundation; 90 only through a copy of the kit$/);
  const t = (id, mut) => { const f = good5(); mut(f.census); return v2(f, id).held; };
  assert.equal(t('C1', (c) => { c.speaks[0].file = 'vendor/light/codec.mjs'; }), false, 'a vendored file is not own code');
  assert.equal(t('C1', (c) => { c.speaks[0].file = 'x/node_modules/y.js'; }), false);
  assert.equal(t('C1', (c) => { c.speaks[0].file = 'myvendor/a.mjs'; }), true, 'a folder merely named like vendor is own code');
  assert.equal(t('C1', (c) => { c.speaks[0].file = ''; }), false, 'a repository counted must name its file');
  assert.equal(t('C1', (c) => { delete c.speaks[0].file; }), false);
  assert.equal(t('C1', (c) => { c.speaks[0].name = 5; }), false);
  assert.equal(t('C1', (c) => { c.rule = ''; }), false, 'the rule applied is said');
  assert.equal(t('C1', (c) => { delete c.rule; }), false);
  assert.equal(t('C1', (c) => { c.speaks = []; }), false, 'no repository shows nothing');
  assert.equal(t('C1', (c) => { c.speaks = c.speaks.slice(0, 1); }), true, 'one repository, named, is the rule applied');
  assert.equal(t('C2', () => {}), true);
  assert.equal(v2(good5(), 'C2').measured, '5 public repositories speak LIGHT in their own code (bar 5); the organs this phase moved live in fall-kit, kar-mind, konomi-tongue, all counted');
  assert.equal(t('C2', (c) => { c.speaks = c.speaks.slice(1); }), false, 'four is under the bar');
  for (const m of ['fall-kit', 'kar-mind', 'konomi-tongue']) {
    const f = good5(); f.census.speaks = f.census.speaks.filter((s) => s.name !== m); f.census.speaks.push({ name: 'other', file: 'a.mjs' });
    assert.equal(v2(f, 'C2').held, false, m + ' missing');
    assert.match(v2(f, 'C2').measured, new RegExp('NOT counted: ' + m + '$'));
  }
  assert.equal(t('C3', () => {}), false, 'five is under fifty');
  assert.equal(v2(good5(), 'C3').measured, '5 public repositories speak LIGHT in their own code, counting the gear builds (bar 50); 90 carry the LIGHT mesh only through a copy of the kit (inlined in a page, or as its own file), which the census\'s own rule (C1) does not count');
  assert.equal(t('C3', (c) => { c.speaks = Array.from({ length: 50 }, (_, i) => ({ name: 'r' + i, file: 'a.mjs' })); }), true, 'fifty is the bar');
  assert.equal(t('C3', (c) => { c.speaks = Array.from({ length: 49 }, (_, i) => ({ name: 'r' + i, file: 'a.mjs' })); }), false);
  assert.equal(v2({ ...good5(), census: null }, 'C1').held, false);
  assert.equal(v2({ ...good5(), census: { speaks: 'x', rule: 'r' } }, 'C1').held, false);
  assert.deepEqual([judge(claims, good5()).held, judge(claims, good5()).failed, judge(claims, good5()).open], [14, 1, 0], 'all fifteen measured: C3 fails at five');
});
