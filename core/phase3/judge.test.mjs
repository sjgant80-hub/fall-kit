import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, FLOOR } from './judge.mjs';

const claims = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const good = () => ({
  passes: [1, 2],
  r1: { relay: { imports: 0, dynamic: false }, heard: 500, delivered: 500, waiting: 0, dropped: 0 },
  r2: { relayAKilled: true, asksAfterKill: 50, answeredAfterKill: 50, sameStates: true },
  r3: { sentWhileAway: 5, queuedAtRelay: 5, lateDelivered: 10, admitted: 5, refusedAtCounter: 5, other: 0, answeredLate: 5 },
  j1: { pinned: [7, 7, 7, 7, 7, 7, 7, 7], strangerRefused: 8, badRosterRefused: 8 },
  j2: { asks: 100, toHolder: 100, answered: 100, triageAfter20: 64, toHonestAfter20: 60 },
  j3: { asks: 40, toDead: 2, lastToDead: 1, answeredAfterLastDead: true },
  j4: { links: ['a1', 'a2'].map((asker) => ({ asker, honest: 900000, liar: 30000 })) },
  ...later(),
});
const D = 'ab'.repeat(32);
const shutT = (sent, stages) => ({ sent, heard: sent, admitted: 0, decoded: 0, recognised: 0, variantNamed: 0, stages });
const later = () => ({
  s1: { nodes: 8, writesEach: 3, digests: { s1: Array(8).fill(D), s2: Array(8).fill(D), s3: Array(8).fill(D) }, sizes: { s1: Array(8).fill(10), s2: Array(8).fill(10), s3: Array(8).fill(10) }, relayKilledIn: 's2', syncsPerOrder: 56 },
  s2: { kinds: { stranger: shutT(8, { sender: 8 }), forged: shutT(8, { signature: 8 }), changed: shutT(8, { signature: 7, sender: 1 }) }, mapsChanged: 0 },
  h1: { members: 8, firstRefusedAt: 'signature', sharedTo: 7, adopted: 7, onSight: { ...shutT(8, { recognised: 8 }), recognised: 8 } },
  h2: { hostile: 16, members: 8, kinds: { unpinned: shutT(128, { sender: 128 }), forged: { ...shutT(128, { signature: 128 }), variantNamed: 100 }, junk: shutT(128, { magic: 128 }), replayed: shutT(16, { counter: 16 }), changed: shutT(128, { signature: 128 }) } },
  h3: { asks: 100, answered: 100, heard: 200, admitted: 200, recognised: 0 },
  x1: { from: 'core/phase3/local/x1.json', where: 'sjgant80-hub.github.io', tabs: { a: { role: 'a', pinned: true, channel: true, sent: 12, admitted: 0, refused: {} }, b: { role: 'b', pinned: true, channel: true, sent: 0, admitted: 10, refused: { signature: 1, counter: 1 }, shared: 10 } } },
});
const all = () => ({ ...good(), passes: [1, 2, 3, 4, 5] });
const ta = (id, mut) => { const f = all(); mut(f); return v(f, id); };
const v = (f, id) => judge(claims, f).verdicts.find((x) => x.id === id);
const t = (id, mut) => { const f = good(); mut(f); return v(f, id); };

test('all held; the later passes not measured, never guessed', () => {
  const j = judge(claims, good());
  assert.deepEqual([j.held, j.failed, j.open], [7, 0, 6]);
  assert.equal(FLOOR, 50000);
  assert.deepEqual(j.verdicts.map((x) => x.id), claims.claims.map((c) => c.id));
  for (const x of j.verdicts.filter((y) => y.pass > 2)) assert.deepEqual([x.held, x.measured], [null, 'not measured yet: pass ' + x.pass]);
  assert.equal(v(good(), 'R1').measured, '500 frames delivered by the relays, 500 heard by the nodes they named; 0 left waiting, 0 dropped; relay.mjs imports 0 modules and loads none (it cannot decode a body)');
  assert.equal(v(good(), 'R2').measured, 'relay A killed after 50 asks: 50 of the 50 later asks answered through relay B; every node\'s state the same as the run where nothing was killed');
  assert.equal(v(good(), 'R3').measured, '5 asks sent while the node was away; on its return 5 admitted, 5 second copies (the relay delivered 10) refused at the counter, 0 other');
  assert.equal(v(good(), 'J1').measured, 'eight nodes pinned 7, 7, 7, 7, 7, 7, 7, 7 members each from the founder\'s roster; the ninth card refused by 8 of 8; a roster signed by another key refused by 8 of 8');
  assert.equal(v(good(), 'J2').measured, '100 of 100 asks went to a holder of their skill (100 answered); after the first 20, 60 of 64 triage asks (93.8%) went to an honest holder (bar 90%)');
  assert.equal(v(good(), 'J3').measured, '2 of the 40 asks after the holder died went to it (bar 2), the last at ask 1; every ask after that went to a live holder and was answered');
  assert.equal(v(good(), 'J4').measured, 'a1: honest 900000, dishonest 30000; a2: honest 900000, dishonest 30000 (parts of a million; the floor is 50000)');
  assert.equal(v(good(), 'R1').predicted, claims.claims[0].predicted);
});

test('R1–R3: each condition on its own', () => {
  assert.equal(t('R1', (f) => { f.r1.relay.imports = 1; }).held, false);
  assert.equal(t('R1', (f) => { f.r1.relay.dynamic = true; }).held, false);
  assert.match(t('R1', (f) => { f.r1.relay.dynamic = true; }).measured, /LOADS SOME/);
  assert.equal(t('R1', (f) => { f.r1.heard = 499; }).held, false);
  assert.equal(t('R1', (f) => { f.r1.waiting = 1; }).held, false);
  assert.equal(t('R1', (f) => { f.r1.dropped = 1; }).held, false);
  assert.equal(t('R1', (f) => { f.r1.delivered = 0; f.r1.heard = 0; }).held, false, 'nothing carried shows nothing');
  assert.equal(t('R1', (f) => { f.r1.delivered = 1; f.r1.heard = 1; }).held, true);
  assert.equal(t('R1', (f) => { f.r1.relay = null; }).held, false);
  assert.equal(t('R2', (f) => { f.r2.relayAKilled = false; }).held, false);
  assert.match(t('R2', (f) => { f.r2.relayAKilled = false; }).measured, /NOT killed/);
  assert.equal(t('R2', (f) => { f.r2.answeredAfterKill = 49; }).held, false);
  assert.equal(t('R2', (f) => { f.r2.sameStates = false; }).held, false);
  assert.match(t('R2', (f) => { f.r2.sameStates = false; }).measured, /NOT the same as/);
  assert.equal(t('R2', (f) => { f.r2.asksAfterKill = 0; f.r2.answeredAfterKill = 0; }).held, false);
  assert.equal(t('R2', (f) => { f.r2.asksAfterKill = 1; f.r2.answeredAfterKill = 1; }).held, true);
  assert.equal(t('R3', (f) => { f.r3.admitted = 4; }).held, false);
  assert.equal(t('R3', (f) => { f.r3.refusedAtCounter = 4; }).held, false);
  assert.equal(t('R3', (f) => { f.r3.other = 1; }).held, false);
  assert.equal(t('R3', (f) => { f.r3.sentWhileAway = 0; f.r3.admitted = 0; f.r3.refusedAtCounter = 0; }).held, false);
  assert.equal(t('R3', (f) => { f.r3 = { sentWhileAway: 1, admitted: 1, refusedAtCounter: 1, other: 0 }; }).held, true);
  assert.equal(t('R3', (f) => { f.r3 = 'x'; }).held, false);
});

test('J1–J4: each condition on its own', () => {
  assert.equal(t('J1', (f) => { f.j1.pinned[3] = 6; }).held, false);
  assert.equal(t('J1', (f) => { f.j1.pinned = f.j1.pinned.slice(1); }).held, false, 'every one of the eight');
  assert.equal(t('J1', (f) => { f.j1.pinned = 'x'; }).held, false);
  assert.equal(t('J1', (f) => { f.j1.strangerRefused = 7; }).held, false);
  assert.equal(t('J1', (f) => { f.j1.badRosterRefused = 7; }).held, false);
  assert.equal(t('J2', (f) => { f.j2.toHolder = 99; }).held, false);
  assert.equal(t('J2', (f) => { f.j2.toHonestAfter20 = 57; }).held, false, '57 of 64 is under 90%');
  assert.equal(t('J2', (f) => { f.j2.triageAfter20 = 60; f.j2.toHonestAfter20 = 54; }).held, true, 'exactly 90%');
  assert.equal(t('J2', (f) => { f.j2.triageAfter20 = 60; f.j2.toHonestAfter20 = 53; }).held, false);
  assert.equal(t('J2', (f) => { f.j2.asks = 0; f.j2.toHolder = 0; }).held, false);
  assert.equal(t('J2', (f) => { f.j2.triageAfter20 = 0; f.j2.toHonestAfter20 = 0; }).held, false, 'no triage asks to judge');
  assert.equal(t('J2', (f) => { f.j2.asks = 1; f.j2.toHolder = 1; f.j2.triageAfter20 = 1; f.j2.toHonestAfter20 = 1; }).held, true);
  assert.equal(t('J2', (f) => { f.j2.triageAfter20 = 0; }).measured.includes('(0%)'), true, 'no division by nothing');
  assert.equal(t('J3', (f) => { f.j3.toDead = 3; }).held, false, 'three is past the bar of two');
  assert.equal(t('J3', (f) => { f.j3.toDead = 0; }).held, true);
  assert.doesNotMatch(t('J3', (f) => { f.j3.toDead = 0; }).measured, /the last at ask/);
  assert.equal(t('J3', (f) => { f.j3.answeredAfterLastDead = false; }).held, false);
  assert.match(t('J3', (f) => { f.j3.answeredAfterLastDead = false; }).measured, /did NOT all go/);
  assert.equal(t('J3', (f) => { f.j3.asks = 0; }).held, false);
  assert.equal(t('J3', (f) => { f.j3.asks = 1; }).held, true);
  assert.equal(t('J3', (f) => { f.j3.killed = 'h2'; f.j3.askers = 4; }).measured, 'h2, the holder the triage asks were going to, killed; each of the 4 askers finds out on its own; 2 of the 40 asks after the holder died went to it (bar 2), the last at ask 1; every ask after that went to a live holder and was answered');
  assert.equal(t('J3', (f) => { f.j3.killed = 'h2'; }).measured.startsWith('h2, the holder the triage asks were going to, killed; 2 of the 40'), true, 'no askers named, none said');
  assert.equal(t('J3', (f) => { f.j3.killed = 'h2'; f.j3.askers = 0; }).measured.startsWith('h2, the holder the triage asks were going to, killed; 2 of the 40'), true);
  assert.equal(t('J3', (f) => { f.j3.killed = 'h2'; f.j3.askers = 1; }).measured.startsWith('h2, the holder the triage asks were going to, killed; 2 of the 40'), true, 'one asker: nothing to say about each');
  assert.equal(t('J3', (f) => { f.j3.killed = 'h2'; f.j3.askers = 2; }).measured.includes('each of the 2 askers finds out on its own'), true);
  assert.equal(t('J3', (f) => { f.j3.killed = 5; }).measured.startsWith('2 of the 40'), true, 'a name is text');
  assert.equal(t('J4', (f) => { f.j4.links[1].honest = 30000; }).held, false, 'equal is not above');
  assert.equal(t('J4', (f) => { f.j4.links[1].liar = FLOOR; }).held, false, 'at the floor is not below it');
  assert.equal(t('J4', (f) => { f.j4.links[1].liar = FLOOR - 1; }).held, true);
  assert.match(t('J4', (f) => { f.j4.links[0].liar = 999999; }).measured, /dishonest 999999 \(NOT\)/);
  assert.equal(t('J4', (f) => { f.j4.links = []; }).held, false);
  assert.equal(t('J4', (f) => { f.j4.links = [null, ...f.j4.links]; }).held, true, 'junk is no link');
  assert.equal(t('J4', (f) => { f.j4.links[0].honest = 'x'; }).held, false);
  assert.equal(t('J4', (f) => { f.j4.links[0].liar = -1; }).held, false);
  assert.equal(t('J4', (f) => { f.j4 = null; }).held, false);
  assert.equal(t('J4', (f) => { f.j4.links[0].liar = 0; }).held, true, 'a dishonest link at nothing');
  assert.equal(t('J4', (f) => { f.j4.links = f.j4.links.slice(0, 1); }).held, true, 'one asker is enough to show it');
  assert.equal(t('J4', (f) => { f.j4.links[0].honest = '900000'; }).held, false, 'a count is a number, not text');
  assert.match(t('R1', (f) => { f.r1.delivered = -3; }).measured, /^-1 frames delivered/, 'a negative count reads as none');
});

test('passes 3–5 all held, each line read from the facts', () => {
  const j = judge(claims, all());
  assert.deepEqual([j.held, j.failed, j.open], [13, 0, 0]);
  assert.equal(v(all(), 'S1').measured, '8 nodes each wrote 3 keys, then synced pair by pair (56 signed syncs through the relays) in three shuffled orders, relay A killed halfway through the s2 order: in s1 1 digest across the 8 nodes, in s2 1 digest across the 8 nodes, in s3 1 digest across the 8 nodes, all abababababab…, every map holding 10 keys');
  assert.equal(v(all(), 'S2').measured, '8 stranger (0 admitted, 0 decoded; sender 8); 8 forged (0 admitted, 0 decoded; signature 8); 8 changed (0 admitted, 0 decoded; signature 7, sender 1); 0 of the nodes\' maps changed');
  assert.equal(v(all(), 'H1').measured, 'one forged packet refused at one node (at the signature stage); its antibodies shared with 7, adopted by 7 after each re-ran it on its own door; the same bytes then sent to all 8: 8 refused them as recognised on sight, 0 decoded, 0 admitted');
  assert.equal(v(all(), 'H2').measured, '16 hostile nodes sent 528 packets to the 8 members: 128 unpinned (0 admitted, 0 decoded), 128 forged (0 admitted, 0 decoded), 128 junk (0 admitted, 0 decoded), 16 replayed (0 admitted, 0 decoded), 128 changed (0 admitted, 0 decoded); of the 128 forged variants, 100 (78.1%) named as a variant of a family already learned (bar 50%)');
  assert.equal(v(all(), 'H3').measured, 'after all the learning, 100 of 100 ordinary asks answered; the doors heard 200 packets of that work, admitted 200, refused 0 as recognised');
  assert.equal(v(all(), 'X1').measured, 'two tabs on sjgant80-hub.github.io: the WebRTC data channel opened in both; tab A sent 12 signed packets, tab B\'s door admitted 10 and refused 2 (signature 1, counter 1), and holds 10 shared notes');
  assert.equal(judge(claims, { ...all(), passes: [1, 2, 3, 4] }).verdicts.find((x) => x.id === 'X1').held, null, 'pass 5 not run: not measured');
});

test('S1–S2: each condition on its own', () => {
  assert.equal(ta('S1', (f) => { f.s1.digests.s2[5] = 'cd'.repeat(32); }).held, false, 'one node in one order apart');
  assert.match(ta('S1', (f) => { f.s1.digests.s2[5] = 'cd'.repeat(32); }).measured, /in s2 2 digests across the 8 nodes.*\(NOT one map\)/);
  assert.equal(ta('S1', (f) => { f.s1.digests.s3 = Array(8).fill('cd'.repeat(32)); }).held, false, 'each order one map, but not the same map');
  assert.equal(ta('S1', (f) => { f.s1.digests.s1 = Array(8).fill('X'.repeat(64)); f.s1.digests.s2 = f.s1.digests.s1; f.s1.digests.s3 = f.s1.digests.s1; }).held, false, 'a digest is a digest');
  assert.equal(ta('S1', (f) => { f.s1.digests.s1.pop(); }).held, false, 'every node');
  assert.equal(ta('S1', (f) => { f.s1.sizes.s1[0] = 9; }).held, false, 'one key short');
  assert.equal(ta('S1', (f) => { f.s1.sizes = { s1: Array(8).fill(0), s2: Array(8).fill(0), s3: Array(8).fill(0) }; }).held, false, 'an empty map agreed on is no convergence');
  assert.equal(ta('S1', (f) => { f.s1.sizes.s3.pop(); }).held, false);
  assert.equal(ta('S1', (f) => { f.s1.relayKilledIn = 'none'; }).held, false, 'the order with a relay killed is part of the claim');
  assert.equal(ta('S1', (f) => { f.s1.nodes = 1; }).held, false);
  assert.equal(ta('S1', (f) => { f.s1 = { nodes: 2, digests: { s1: [D, D], s2: [D, D], s3: [D, D] }, sizes: { s1: [4, 4], s2: [4, 4], s3: [4, 4] }, relayKilledIn: 's1' }; }).held, true, 'two nodes are enough');
  assert.equal(ta('S1', (f) => { f.s1.digests = null; }).held, false);
  assert.equal(ta('S1', (f) => { f.s1.sizes = 'x'; }).held, false);
  assert.equal(ta('S1', (f) => { f.s1.digests.s1 = 'x'; }).held, false);
  for (const k of ['stranger', 'forged', 'changed']) {
    assert.equal(ta('S2', (f) => { f.s2.kinds[k].admitted = 1; }).held, false, k + ' admitted');
    assert.equal(ta('S2', (f) => { f.s2.kinds[k].decoded = 1; }).held, false, k + ' decoded');
    assert.equal(ta('S2', (f) => { f.s2.kinds[k].heard = 7; }).held, false, k + ' not all heard');
    assert.equal(ta('S2', (f) => { f.s2.kinds[k] = shutT(0, {}); }).held, false, k + ' none sent');
    assert.equal(ta('S2', (f) => { delete f.s2.kinds[k]; }).held, false, k + ' missing');
  }
  assert.equal(ta('S2', (f) => { f.s2.mapsChanged = 1; }).held, false);
  assert.equal(ta('S2', (f) => { f.s2.kinds.forged = shutT(1, { signature: 1 }); }).held, true, 'one is enough');
  assert.equal(ta('S2', (f) => { f.s2.kinds = null; }).held, false);
  assert.match(ta('S2', (f) => { f.s2.kinds.forged.stages = { signature: 7, counter: 0, x: 'y' }; }).measured, /forged \(0 admitted, 0 decoded; signature 7\)/, 'a stage counted none is not shown');
  assert.match(ta('S2', (f) => { f.s2.kinds.forged.stages = null; }).measured, /forged \(0 admitted, 0 decoded; \)/);
});

test('H1–H3: each condition on its own', () => {
  assert.equal(ta('H1', (f) => { f.h1.adopted = 6; }).held, false, 'one node did not adopt');
  assert.equal(ta('H1', (f) => { f.h1.sharedTo = 6; f.h1.adopted = 6; }).held, false, 'shared with fewer than the rest of the mesh');
  assert.equal(ta('H1', (f) => { f.h1.onSight.recognised = 7; }).held, false, 'one node did not know it on sight');
  assert.equal(ta('H1', (f) => { f.h1.onSight.decoded = 1; }).held, false, 'recognised, but decoded');
  assert.equal(ta('H1', (f) => { f.h1.onSight.admitted = 1; }).held, false);
  assert.equal(ta('H1', (f) => { f.h1.onSight.sent = 7; f.h1.onSight.heard = 7; f.h1.onSight.recognised = 7; }).held, false, 'sent to all of them');
  assert.equal(ta('H1', (f) => { f.h1.firstRefusedAt = null; }).held, false);
  assert.equal(ta('H1', (f) => { f.h1.members = 1; f.h1.sharedTo = 0; f.h1.adopted = 0; }).held, false);
  assert.equal(ta('H1', (f) => { f.h1 = { members: 2, firstRefusedAt: 'sender', sharedTo: 1, adopted: 1, onSight: { ...shutT(2, {}), recognised: 2 } }; }).held, true);
  assert.equal(ta('H1', (f) => { f.h1.onSight = null; }).held, false);
  for (const k of ['unpinned', 'forged', 'junk', 'replayed', 'changed']) {
    assert.equal(ta('H2', (f) => { f.h2.kinds[k].admitted = 1; }).held, false, k + ' admitted');
    assert.equal(ta('H2', (f) => { f.h2.kinds[k].decoded = 1; }).held, false, k + ' decoded');
    assert.equal(ta('H2', (f) => { f.h2.kinds[k].heard -= 1; }).held, false, k + ' not all heard');
    assert.equal(ta('H2', (f) => { delete f.h2.kinds[k]; }).held, false, k + ' missing');
  }
  assert.equal(ta('H2', (f) => { f.h2.kinds.forged.variantNamed = 64; }).held, true, 'exactly half');
  assert.equal(ta('H2', (f) => { f.h2.kinds.forged.variantNamed = 63; }).held, false, 'under half');
  assert.match(ta('H2', (f) => { f.h2.kinds.forged.variantNamed = 63; }).measured, /63 \(49\.2%\)/);
  assert.equal(ta('H2', (f) => { f.h2.kinds.forged.variantNamed = -2; }).held, false);
  assert.equal(ta('H2', (f) => { f.h2.hostile = 0; }).held, false);
  assert.equal(ta('H2', (f) => { f.h2.hostile = 1; }).held, true, 'one hostile node is a crowd of one');
  assert.equal(ta('H2', (f) => { f.h2.kinds = 'x'; }).held, false);
  assert.match(ta('H2', (f) => { f.h2.kinds.junk = null; }).measured, /sent 400 packets/, 'a missing kind adds nothing to the count');
  assert.match(ta('H2', (f) => { f.h2.kinds.junk.sent = -5; }).measured, /sent 400 packets/, 'nor does a negative one');
  assert.equal(ta('H3', (f) => { f.h3.answered = 99; }).held, false);
  assert.equal(ta('H3', (f) => { f.h3.recognised = 1; }).held, false, 'one ordinary packet refused as recognised: autoimmune');
  assert.equal(ta('H3', (f) => { f.h3.admitted = 199; }).held, false, 'one ordinary packet refused');
  assert.equal(ta('H3', (f) => { f.h3.heard = 199; f.h3.admitted = 199; }).held, false, 'not every ask and answer heard');
  assert.equal(ta('H3', (f) => { f.h3.heard = 201; f.h3.admitted = 201; }).held, true, 'more heard is fine, if all admitted');
  assert.equal(ta('H3', (f) => { f.h3.asks = 0; f.h3.answered = 0; f.h3.heard = 0; f.h3.admitted = 0; }).held, false);
  assert.equal(ta('H3', (f) => { f.h3 = { asks: 1, answered: 1, heard: 2, admitted: 2, recognised: 0 }; }).held, true);
});

test('X1: each condition on its own', () => {
  assert.equal(ta('X1', (f) => { f.x1.tabs.a.channel = false; }).held, false);
  assert.match(ta('X1', (f) => { f.x1.tabs.b.channel = false; }).measured, /did NOT open in both/);
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.channel = false; }).held, false);
  assert.equal(ta('X1', (f) => { f.x1.tabs.a.pinned = false; }).held, false);
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.pinned = false; }).held, false);
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.admitted = 9; }).held, false, 'one signed packet not admitted');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.admitted = 11; }).held, false, 'a changed or replayed one admitted');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = { signature: 2 }; }).held, false, 'the replay not refused at the counter');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = { counter: 2 }; }).held, false, 'the changed one at no stage of its own');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = { signature: 1, magic: 1 }; }).held, false, 'two refused, but neither at the counter');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = { signature: 1, counter: 1, size: 1 }; }).held, false, 'three refused');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = { magic: 1, counter: 1, other: 0 }; }).held, true, 'the changed byte can fall at any stage before the counter');
  assert.equal(ta('X1', (f) => { f.x1.tabs.b.refused = null; }).held, false);
  assert.equal(ta('X1', (f) => { f.x1.tabs.a.sent = 2; f.x1.tabs.b.admitted = 0; }).held, false, 'nothing signed to admit');
  assert.equal(ta('X1', (f) => { f.x1.tabs.a.sent = 3; f.x1.tabs.b.admitted = 1; }).held, true);
  assert.equal(ta('X1', (f) => { f.x1.tabs = null; }).held, false);
  assert.equal(ta('X1', (f) => { f.x1.tabs.b = 'x'; }).held, false);
  assert.doesNotMatch(ta('X1', (f) => { delete f.x1.where; }).measured, / on /);
  assert.match(ta('X1', (f) => { f.x1.tabs.b.refused = {}; }).measured, /refused 0, and/, 'nothing refused, no list');
  assert.match(ta('X1', (f) => { f.x1.tabs.b.refused = { signature: 1, none: 0, counter: 1, junk: 'x' }; }).measured, /refused 2 \(signature 1, counter 1\), and/, 'a stage that refused none is not listed');
});

test('junk in, a verdict out', () => {
  assert.deepEqual(judge(null, null), { verdicts: [], held: 0, failed: 0, open: 0 });
  assert.equal(judge(claims, null).open, claims.claims.length);
  assert.equal(judge(claims, { passes: 'x' }).open, claims.claims.length);
  assert.equal(judge({ claims: [{ id: 'toString', pass: 1 }] }, good()).verdicts[0].held, null, 'no inherited rule');
  assert.equal(judge({ claims: [null, { id: 'R1', pass: 1 }] }, good()).verdicts.length, 1);
  assert.equal(v({ passes: [1, 2] }, 'R1').held, false);
});
