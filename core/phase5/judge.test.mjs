import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, isEdge, BAR, MARGIN } from './judge.mjs';

const EDGES = ['esm.run', 'cdn.jsdelivr.net', '*.hf.co'];
const IDS = ['D1', 'D2', 'D3', 'D4', 'L1', 'F1', 'M1', 'M2', 'M3', 'M4', 'N1', 'N2', 'N3', 'Q1', 'Q2', 'Q3', 'V1'];
const C = { corpus: { count: 5532, digest: 'd' }, edges: EDGES, funnel: 'F', claims: IDS.map((id, i) => ({ id, pass: 1 + Math.floor(i / 4) })) };
const screen = (stage) => ({ expect: stage, stage, outcome: 'verified' });
const shared = () => ({ refused: { ok: false, stage: 'sender' }, adopted: 1, autoimmuneBlocked: 0, again: { ok: false, stage: 'sender', recognised: true }, honest: { ok: true } });
function good() {
  return {
    corpus: { count: 5532, digest: 'd', tab: 3496, tabDigest: 't' },
    d1: { corpus: { count: 5532, digest: 'd', admitted: 0, decoded: 0 }, shapes: { control: { ok: true }, replayed: { ok: false, stage: 'counter' }, unpinned: { ok: false, stage: 'sender' }, changed: { ok: false, stage: 'signature' }, misaddressed: { ok: false, stage: 'message' } } },
    d2: { names: 10, namesAdmitted: 10, corpus: { count: 5532, admitted: 0, admittedEmpty: 0 } },
    d3: { messages: { count: 5532, disagree: 0, admitted: 1000, exact: 1000, refused: 4532, unnamed: 0 }, forms: { count: 5532, admitted: 0, good: 10, goodAdmitted: 10 } },
    d4: { payloads: 3496, digest: 't', addresses: { count: 3496, elementsAdded: 0 }, messages: { count: 3496, admitted: 1000, refused: 2496, perAdmitted: [6], perRefused: [4], textOnly: 1000 } },
    l1: { refused: 1000, onSightFirst: 5, recognisedAgain: 1000, admitted: 0, admittedAgain: 0, recognisedWrongly: 0, library: 995, bound: 8192, full: false },
    f1: { cases: 20000, throws: 0, unnamed: 0 },
    m1: { fuzzed: 20000, outside: 0, throws: 0, valid: 700, validTaken: 700 },
    mind: { digest: 'm', t0Right: 42 },
    m2: { model: 'llama', runtime: 'ollama', messages: 70, digest: 'm', mindRight: 49, valid: 70, outside: 0, t0Right: 42 },
    m3: { model: 'llama', runtime: 'webllm', messages: 70, digest: 'm', mindRight: 49, valid: 70, outside: 0, t0Right: 42 },
    n1: { processes: 3, screens: [screen('admitted'), screen('size'), screen('signature'), screen('sender'), screen('signature')], triage: { asks: 20, verified: 20, receiptsHold: 20 }, messages: 1, nonLight: 0, ledgerTriage: 20, ledgerScreen: 5 },
    n2: shared(),
    n3: { tabs: 2, channel: true, ...shared() },
    q1: { files: 5, unknownSources: [], unsafeEval: false, inlineScripts: 0, loaded: 1, loadedOutside: [], stunMissing: [] },
    q2: { asleep: { requests: 20, other: [] }, awake: { requests: 1, other: ['esm.run'] } },
    q3: { tried: 'the probe', violation: true, directive: 'connect-src', completed: false },
    v1: { routed: 'digi', decidedBy: 'keywords', followed: 'F', card: { serial: 1, mine: true, verified: true }, other: [] },
  };
}
const verdict = (facts, id, claims = C) => judge(claims, facts).verdicts.find((v) => v.id === id);
const held = (facts, id, claims) => verdict(facts, id, claims).held;
function set(facts, path, value) {
  const keys = path.split('.');
  let o = facts;
  for (const k of keys.slice(0, -1)) o = o[k];
  if (value === undefined) delete o[keys.at(-1)]; else o[keys.at(-1)] = value;
  return facts;
}
/** each [path, value] alone turns the claim from held to failed */
function eachFails(id, flips) {
  assert.equal(held(good(), id), true, id + ' holds on the good facts');
  for (const [path, value] of flips) assert.equal(held(set(good(), path, value), id), false, id + ': ' + path + ' = ' + JSON.stringify(value));
}

test('the constants', () => {
  assert.equal(BAR, 49);
  assert.equal(MARGIN, 7);
});

test('isEdge: exact, or under a wildcard but not the wildcard\'s own host', () => {
  assert.equal(isEdge('esm.run', EDGES), true);
  assert.equal(isEdge('ESM.run', EDGES), true);
  assert.equal(isEdge('x.esm.run', EDGES), false);
  assert.equal(isEdge('a.hf.co', EDGES), true);
  assert.equal(isEdge('hf.co', EDGES), false);
  assert.equal(isEdge('.hf.co', EDGES), false);
  assert.equal(isEdge('xhf.co', EDGES), false);
  assert.equal(isEdge('a b', EDGES), false);
  assert.equal(isEdge(7, EDGES), false);
  assert.equal(isEdge('esm.run', null), false);
  assert.equal(isEdge('esm.run', [7, 'esm.run']), true);
});

test('judge: every claim held on the good facts, in the sealed order; nothing guessed without facts', () => {
  const j = judge(C, good());
  assert.deepEqual(j.verdicts.map((v) => v.id), IDS);
  assert.deepEqual([j.held, j.failed, j.open], [17, 0, 0]);
  assert.deepEqual(j.verdicts.map((v) => v.pass), C.claims.map((c) => c.pass));
  const none = judge(C, {});
  assert.deepEqual([none.held, none.failed, none.open], [0, 0, 17]);
  assert.deepEqual(none.verdicts[0], { id: 'D1', pass: 1, held: null, measured: 'not measured yet' });
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.equal(judge({ claims: [null, { id: 'X9', pass: 1 }, { id: 7 }] }, good()).verdicts.length, 2);
  assert.equal(judge({ claims: [{ id: 'X9', pass: 1 }] }, good()).verdicts[0].held, null, 'a claim with no rule is not measured');
  assert.equal(judge({ claims: [{ id: 'toString', pass: 1 }] }, { tostring: {} }).verdicts[0].held, null, 'an inherited name is no rule');
  const f = good(); delete f.mind;
  assert.equal(verdict(f, 'M2').held, null, 'M2 needs the sealed digest');
  assert.equal(verdict(f, 'M4').held, null);
  const g = good(); delete g.m2;
  assert.equal(verdict(g, 'M4').held, null, 'M4 needs M2');
  assert.equal(verdict(g, 'M3').held, true, 'M3 does not');
  const h = good(); h.d1 = 'x';
  assert.equal(verdict(h, 'D1').held, null, 'facts that are not a record are not facts');
});

test('D1: the corpus and the four shapes', () => {
  eachFails('D1', [['d1.corpus.count', 5531], ['d1.corpus.digest', 'x'], ['d1.corpus.admitted', 1], ['d1.corpus.decoded', 1], ['d1.corpus.admitted', -1],
    ['d1.shapes.unpinned', { ok: false, stage: 'signature' }], ['d1.shapes.changed', { ok: false, stage: 'sender' }], ['d1.shapes.replayed', { ok: true }], ['d1.shapes.misaddressed', { ok: false }],
    ['d1.shapes.control', { ok: false, stage: 'sender' }], ['d1.shapes.unpinned', undefined], ['d1.shapes.unpinned', { ok: true, stage: 'sender' }]]);
  assert.equal(held(good(), 'D1', { ...C, corpus: { count: 5532, digest: 'other' } }), false, 'the sealed digest is the claims\'');
  assert.match(verdict(good(), 'D1').measured, /^5532 corpus payloads heard by the site's node: 0 admitted, 0 decoded; a packet from a key nobody pinned refused at sender, one byte changed at signature, heard twice at counter, addressed to another node at message; the untouched control admitted$/);
  assert.match(verdict(set(good(), 'd1.corpus.digest', 'x'), 'D1').measured, /NOT the sealed corpus/);
  assert.match(verdict(set(good(), 'd1.shapes.control', 'x'), 'D1').measured, /control \?$/);
});

test('D2: every name in, no corpus payload in', () => {
  eachFails('D2', [['d2.names', 9], ['d2.namesAdmitted', 9], ['d2.corpus.count', 5531], ['d2.corpus.admitted', 1], ['d2.names', -1]]);
  assert.equal(held(set(set(good(), 'd2.names', 11), 'd2.namesAdmitted', 11), 'D2'), true);
  assert.equal(held(set(set(good(), 'd2.names', 10.5), 'd2.namesAdmitted', 10.5), 'D2'), false, 'a count is a whole number');
  assert.equal(held(set(set(good(), 'd2.names', '12'), 'd2.namesAdmitted', '12'), 'D2'), false, 'a count is a number');
  assert.equal(verdict(good(), 'D2').measured, '10 of the 10 names the page declares let in; 0 of 5532 corpus payloads let in as the page\'s address');
  assert.equal(verdict(set(set(good(), 'd2.corpus.admitted', 15), 'd2.corpus.admittedEmpty', 15), 'D2').measured, '10 of the 10 names the page declares let in; 15 of 5532 corpus payloads let in as the page\'s address (15 of them the empty request, which the door takes as the top of the page)');
});

test('D3: the rule twice, the bytes unchanged, the forms', () => {
  eachFails('D3', [['d3.messages.count', 5531], ['d3.messages.disagree', 1], ['d3.messages.admitted', 999], ['d3.messages.exact', 999], ['d3.messages.refused', 999], ['d3.messages.unnamed', 1],
    ['d3.messages.refused', 4531], ['d3.forms.count', 1], ['d3.forms.admitted', 1], ['d3.forms.good', 9], ['d3.forms.goodAdmitted', 9]]);
  assert.equal(held(set(set(good(), 'd3.messages.refused', 1000), 'd3.messages.admitted', 4532), 'D3'), false, 'admitted must equal exact');
  const g = set(set(set(good(), 'd3.messages.refused', 1000), 'd3.messages.admitted', 4532), 'd3.messages.exact', 4532);
  assert.equal(held(g, 'D3'), true);
  assert.match(verdict(good(), 'D3').measured, /^5532 payloads as messages: 0 disagree with the rule written a second time; 1000 let in \(1000 read back byte for byte\), 4532 refused at a named stage; as a record form 0 let in; 10 of 10 good records let in$/);
});

test('D4: nothing a visitor sends becomes part of the page', () => {
  eachFails('D4', [['d4.payloads', 3495], ['d4.digest', 'x'], ['d4.addresses.count', 3495], ['d4.addresses.elementsAdded', 1], ['d4.messages.count', 3495], ['d4.messages.admitted', 999],
    ['d4.messages.refused', 2495], ['d4.messages.perAdmitted', [6, 7]], ['d4.messages.perAdmitted', []], ['d4.messages.perRefused', [4, 5]], ['d4.messages.textOnly', 999], ['d4.addresses.elementsAdded', -1]]);
  const none = set(set(set(good(), 'd4.messages.admitted', 3496), 'd4.messages.refused', 0), 'd4.messages.textOnly', 3496);
  set(none, 'd4.messages.perRefused', []);
  assert.equal(held(none, 'D4'), true, 'with nothing refused there is no refusal template');
  assert.equal(held(set(good(), 'corpus.tab', 3495), 'D4'), false, 'the tab set is CI\'s');
  assert.equal(held(set(good(), 'corpus.tabDigest', 'y'), 'D4'), false);
  assert.match(verdict(good(), 'D4').measured, /^in a real tab, 3496 payloads: 0 elements added by 3496 addresses; 1000 messages let in, each adding 6 template elements and 1000 shown as exactly one text node; 2496 refused, each adding 4$/);
  assert.match(verdict(set(set(good(), 'd4.where', 'the live page'), 'd4.digest', 'q'), 'D4').measured, /^in a real tab of the live page, 3496 payloads \(NOT the sealed set\)/);
});

test('L1: refused again on sight, never what was let in', () => {
  eachFails('L1', [['l1.refused', 999], ['l1.recognisedAgain', 999], ['l1.admittedAgain', 1], ['l1.recognisedWrongly', 1], ['l1.full', true], ['l1.full', undefined], ['l1.admitted', -1]]);
  assert.match(verdict(good(), 'L1').measured, /^1000 refused the first time \(5 of them on sight, repeats in the corpus\), 1000 recognised on sight the second time; 0 let in, 0 let in again, 0 wrongly recognised; library 995 of 8192, never full$/);
  assert.match(verdict(set(good(), 'l1.full', true), 'L1').measured, /, FULL$/);
});

test('F1 and M1: the fuzz', () => {
  eachFails('F1', [['f1.cases', 19999], ['f1.throws', 1], ['f1.unnamed', 1]]);
  eachFails('M1', [['m1.fuzzed', 19999], ['m1.outside', 1], ['m1.throws', 1], ['m1.valid', 699], ['m1.validTaken', 699]]);
  assert.equal(verdict(good(), 'F1').measured, '20000 garbage requests: 0 throws, 0 results that were neither let in nor a refusal naming its stage');
  assert.equal(verdict(good(), 'M1').measured, '20000 fuzzed replies: 0 routes outside the seven, 0 throws; 700 of 700 well-formed replies taken as their route');
});

test('M2, M3, M4: the mind at its bar, and above the keywords', () => {
  for (const k of ['m2', 'm3']) eachFails(k.toUpperCase(), [[k + '.messages', 69], [k + '.digest', 'x'], [k + '.digest', 5], [k + '.outside', 1], [k + '.mindRight', 48]]);
  assert.equal(held(set(good(), 'mind.digest', 'x'), 'M2'), false);
  assert.equal(verdict(good(), 'M2').measured, 'llama (ollama): 49 of 70 routed right by the mind\'s own proposal (bar 49), 70 replies a valid proposal, 0 outside the seven');
  assert.match(verdict(set(good(), 'm3.digest', 'q'), 'M3').measured, / — NOT the sealed messages$/);
  eachFails('M4', [['m2.t0Right', 43], ['mind.t0Right', 43], ['mind.t0Right', -1], ['m2.mindRight', 48]]);
  assert.equal(held(set(set(good(), 'm2.mindRight', 48), 'mind.t0Right', 41), 'M4'), false, 'the run and CI must agree');
  assert.equal(held(set(set(set(good(), 'm2.mindRight', 48), 'mind.t0Right', 41), 'm2.t0Right', 41), 'M4'), true, 'exactly 7 more is enough');
  assert.equal(verdict(good(), 'M4').measured, 'the mind 49 of 70, the keyword rule 42 (CI) / 42 (the run); bar: the mind at least 7 more');
  assert.equal(held(set(set(set(good(), 'mind.t0Right', 0), 'm2.t0Right', 0), 'm2.mindRight', 7), 'M4'), true, 'a keyword rule that gets none right is a count, not junk');
  assert.equal(held(set(set(set(good(), 'mind.t0Right', 0), 'm2.t0Right', 0), 'm2.mindRight', 6), 'M4'), false);
});

test('N1: three processes, the screens, the triage, LIGHT, the ledger', () => {
  eachFails('N1', [['n1.processes', 2], ['n1.screens', [screen('size')]], ['n1.screens.0', { expect: 'admitted', stage: 'size', outcome: 'verified' }], ['n1.screens.1', { expect: 'size', stage: 'size', outcome: 'failed' }],
    ['n1.screens.2', { expect: 7, stage: 7, outcome: 'verified' }], ['n1.screens.3', 'x'], ['n1.triage.asks', 19], ['n1.triage.verified', 19], ['n1.triage.receiptsHold', 19], ['n1.messages', 0], ['n1.nonLight', 1], ['n1.ledgerTriage', 19], ['n1.ledgerTriage', 25]]);
  assert.equal(verdict(good(), 'N1').measured, '3 processes; screen: admitted, size, signature, sender, signature; triage: 20 of 20 verified, 20 receipts checked at the site; 1 messages, 0 not LIGHT; 20 triage answers in the site\'s ledger (and 5 screen answers)');
  assert.match(verdict(set(good(), 'n1.screens.0', { expect: 'admitted', stage: 'size', outcome: 'failed' }), 'N1').measured, /screen: size \(expected admitted\) \[failed\]/);
});

test('N2 and N3: an antibody shared', () => {
  const flips = (k) => [[k + '.refused', { ok: false, stage: 'signature' }], [k + '.adopted', 0], [k + '.autoimmuneBlocked', 1], [k + '.again', { ok: false, stage: 'sender', recognised: false }], [k + '.again', { ok: true, recognised: true }],
    [k + '.again', undefined], [k + '.honest', { ok: false, stage: 'sender' }], [k + '.honest', undefined]];
  eachFails('N2', flips('n2'));
  eachFails('N3', [...flips('n3'), ['n3.channel', false], ['n3.tabs', 1]]);
  assert.equal(verdict(good(), 'N2').measured, 'the site refused it at sender; the other node adopted 1 antibodies after its own re-run (0 blocked as autoimmune); heard again there: refused on sight; the honest packet admitted');
  assert.match(verdict(set(good(), 'n2.again', { ok: false, stage: 'sender' }), 'N2').measured, /NOT recognised \(sender\)/);
  assert.match(verdict(set(good(), 'n2.again', 7), 'N2').measured, /heard again there: \?/);
  assert.match(verdict(good(), 'N3').measured, /^a WebRTC channel opened between 2 tabs; the site refused/);
  assert.match(verdict(set(good(), 'n3.channel', false), 'N3').measured, /^NO channel; /);
});

test('Q1, Q2, Q3: local-first', () => {
  eachFails('Q1', [['q1.unknownSources', ['x']], ['q1.unknownSources', 'x'], ['q1.unsafeEval', true], ['q1.unsafeEval', undefined], ['q1.inlineScripts', 1], ['q1.loadedOutside', ['a b']], ['q1.loadedOutside', 'x'], ['q1.stunMissing', ['m']], ['q1.stunMissing', null], ['q1.files', 4]]);
  assert.equal(verdict(good(), 'Q1').measured, '5 files read; policy sources outside the sealed list: none; unsafe-eval: no; inline scripts: 0; URLs to another host that are loaded or called: 1, outside the edges or the mind\'s wake: none; FallLinks without an empty STUN list: none');
  assert.match(verdict(set(set(set(good(), 'q1.unsafeEval', true), 'q1.loadedOutside', ['f u']), 'q1.stunMissing', ['m']), 'Q1').measured, /unsafe-eval: YES; .* wake: f u; FallLinks without an empty STUN list: m$/);
  eachFails('Q2', [['q2.asleep.requests', 19], ['q2.asleep.other', ['esm.run']], ['q2.asleep.other', 'x'], ['q2.awake.requests', 0], ['q2.awake.other', []], ['q2.awake.other', ['esm.run', 'evil.io']], ['q2.awake.other', ['hf.co']]]);
  assert.equal(held(good(), 'Q2', { ...C, edges: ['x'] }), false, 'the edges are the claims\'');
  assert.equal(verdict(good(), 'Q2').measured, 'mind asleep: 20 requests, to another origin: none; mind awake: 1 requests, other hosts esm.run, every one a sealed edge');
  assert.match(verdict(set(good(), 'q2.awake.other', ['evil.io']), 'Q2').measured, / — NOT sealed edges: evil.io$/);
  eachFails('Q3', [['q3.violation', false], ['q3.directive', 'script-src'], ['q3.directive', 7], ['q3.completed', true], ['q3.completed', undefined]]);
  assert.equal(held(set(good(), 'q3.directive', 'connect-src-elem'), 'Q3'), true);
  assert.equal(verdict(good(), 'Q3').measured, 'a fetch to the probe: refused by the policy (connect-src), never completed');
  assert.equal(verdict(set(set(good(), 'q3.violation', false), 'q3.completed', true), 'Q3').measured, 'a fetch to the probe: NOT refused, COMPLETED');
});

test('V1: the visitor\'s own DIGI', () => {
  eachFails('V1', [['v1.routed', 'about'], ['v1.followed', 'G'], ['v1.card.mine', false], ['v1.card.verified', false], ['v1.card.serial', 0], ['v1.card.serial', -1], ['v1.other', ['x.io']], ['v1.other', 'x']]);
  assert.equal(held(good(), 'V1', { ...C, funnel: 7 }), false, 'the funnel is the claims\'');
  assert.equal(held(set(good(), 'v1.followed', 7), 'V1', { ...C, funnel: 7 }), false);
  assert.equal(verdict(good(), 'V1').measured, 'routed to digi (by keywords); followed F; card #1, owned by the visitor\'s own key, checked by kardlings\' own reader; requests to another origin: none');
  assert.match(verdict(set(set(set(set(good(), 'v1.followed', 'G'), 'v1.card.mine', false), 'v1.card.verified', false), 'v1.other', ['x']), 'V1').measured, /G \(NOT the sealed funnel\); card #1, NOT the visitor's, NOT checked; requests to another origin: x$/);
});
