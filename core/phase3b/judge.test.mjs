import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, FLOOR } from './judge.mjs';

const claims = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const ASKERS = ['a1', 'a2', 'a3', 'a4'];
const NOT_SIGNED = 'the packet is not signed by the holder it accuses';
const good = () => ({
  passes: [1],
  w1: { killed: 'h2', askers: 4, asks: 40, toDead: 1, lastToDead: 0, answeredAfterLastDead: true, beforeKill: ASKERS.map((asker) => ({ asker, to: 'h2' })),
    control: { killed: 'h2', askers: 4, asks: 40, toDead: 4, lastToDead: 3, answeredAfterLastDead: true, beforeKill: ASKERS.map((asker) => ({ asker, to: 'h2' })) } },
  w2: { links: ['a1', 'a2'].map((asker) => ({ asker, honest: 900000, liar: 31250 })), control: ['a1', 'a2'].map((asker) => ({ asker, honest: 900000, liar: 500000 })) },
  w3: { asks: 100, toHolder: 100, answered: 100, liarAsks: ASKERS.map((asker, i) => ({ asker, asks: 1, firstAt: 10 + i })), triageAfter20: 64, toHonestAfter20: 64, controlLiarAsks: 0 },
  w4: { askers: 4, holder: 'h1', silence: { sent: 4, quiet: 4, answered: 4, quietAfter: 0 }, lied: { sent: 16, refused: 16, already: 0, adopted: 0, why: { 'the answer checks here': 4, [NOT_SIGNED]: 12 } },
    stranger: { sent: 4, refusedAtDoor: 4, stages: { sender: 4 } }, linksCompared: 112, linksChanged: 0, next: { asks: 4, toHonest: 4, answered: 4 } },
});
const v = (f, id) => judge(claims, f).verdicts.find((x) => x.id === id);
const t = (id, mut) => { const f = good(); mut(f); return v(f, id); };

test('all held, said exactly; the sealed order and predictions carried', () => {
  const j = judge(claims, good());
  assert.deepEqual([j.held, j.failed, j.open], [4, 0, 0]);
  assert.equal(FLOOR, 50000);
  assert.deepEqual(j.verdicts.map((x) => x.id), ['W1', 'W2', 'W3', 'W4']);
  assert.deepEqual(j.verdicts.map((x) => x.predicted), claims.claims.map((c) => c.predicted));
  assert.deepEqual(j.verdicts.map((x) => x.pass), [1, 1, 1, 1]);
  assert.equal(v(good(), 'W1').measured, 'h2, the holder the triage asks were going to (the last triage ask of 4 of the 4 askers before the kill went to it), killed. With the routing that shares: 1 of the 40 asks after went to it (bar 2), the last at ask 0; every ask after that went to a live holder and was answered. With Phase 3\'s greedy routing, the same run: 4 asks to it (the scenario can fail)');
  assert.equal(v(good(), 'W2').measured, 'With the routing that shares: a1: honest 900000, dishonest 31250; a2: honest 900000, dishonest 31250. With Phase 3\'s greedy routing: a1: honest 900000, dishonest 500000; a2: honest 900000, dishonest 500000 (parts of a million; the floor is 50000)');
  assert.equal(v(good(), 'W3').measured, '100 of 100 asks went to a holder of their skill, 100 answered; the dishonest holder was asked by a1 1× (first at ask 10), a2 1× (first at ask 11), a3 1× (first at ask 12), a4 1× (first at ask 13); after the first 20, 64 of 64 triage asks (100%) went to an honest holder (bar 90%). With Phase 3\'s greedy routing the dishonest holder was asked 0 times');
  assert.equal(v(good(), 'W4').measured, 'the dishonest member sent each of 4 askers a silence note about a live honest holder: 4 made it quiet and probed it, 4 probes answered, 0 askers still holding it quiet after; 16 false lied notes: 16 refused (4 because the answer checks here, 12 because ' + NOT_SIGNED + '), 0 answered as already judged, 0 counted; the stranger\'s 4 notes: 4 refused at the door; 0 of 112 links changed at any member; each asker\'s next triage ask: 4 of 4 to an honest holder, 4 answered');
});

test('W1: J3\'s bar with the routing that shares, and a control that fails it', () => {
  assert.equal(t('W1', (f) => { f.w1.toDead = 2; f.w1.lastToDead = 1; }).held, true, 'exactly the bar');
  assert.equal(t('W1', (f) => { f.w1.toDead = 3; }).held, false);
  assert.equal(t('W1', (f) => { f.w1.answeredAfterLastDead = false; }).held, false);
  assert.match(t('W1', (f) => { f.w1.answeredAfterLastDead = false; }).measured, /did NOT all go to a live holder/);
  assert.equal(t('W1', (f) => { f.w1.answeredAfterLastDead = 1; }).held, false, 'only a plain true');
  assert.equal(t('W1', (f) => { f.w1.asks = 0; }).held, false, 'no asks after shows nothing');
  assert.equal(t('W1', (f) => { f.w1.asks = 1; }).held, true);
  assert.equal(t('W1', (f) => { f.w1.toDead = -1; }).held, false, 'a junk count is not zero');
  assert.equal(t('W1', (f) => { f.w1.toDead = 1.5; }).held, false, 'nor is a fraction a count');
  assert.equal(t('W1', (f) => { f.w1.toDead = 0; f.w1.lastToDead = -1; }).held, true, 'none to the dead node at all');
  assert.equal(t('W1', (f) => { f.w1.control.toDead = 2; }).held, false, 'a control that keeps the bar: the scenario could not fail');
  assert.match(t('W1', (f) => { f.w1.control.toDead = 2; }).measured, /2 asks to it \(NOT more than 2: the scenario could not fail\)$/);
  assert.equal(t('W1', (f) => { f.w1.control.toDead = 3; }).held, true);
  assert.equal(t('W1', (f) => { f.w1.control = null; }).held, false, 'no control, no verdict that it could fail');
  assert.equal(t('W1', (f) => { f.w1.control = 'x'; }).held, false);
  assert.match(t('W1', (f) => { f.w1.toDead = 0; }).measured, /0 of the 40 asks after went to it \(bar 2\); every/, 'no last ask when none went');
  assert.match(t('W1', (f) => { f.w1.beforeKill[1].to = 'h1'; }).measured, /^h2, .*\(the last triage ask of 3 of the 4 askers before the kill went to it\)/);
  assert.match(t('W1', (f) => { f.w1.beforeKill = 'x'; }).measured, /of 0 of the 0 askers/);
  assert.match(t('W1', (f) => { delete f.w1.killed; }).measured, /^With the routing that shares/);
  assert.equal(t('W1', (f) => { delete f.w1.killed; }).held, true, 'the name is for the reader; the bar is the counts');
});

test('W2: J4\'s bar at every asker, and a control that fails it', () => {
  assert.equal(t('W2', (f) => { f.w2.links[1].liar = FLOOR; }).held, false, 'at the floor is not below it');
  assert.match(t('W2', (f) => { f.w2.links[1].liar = FLOOR; }).measured, /a2: honest 900000, dishonest 50000 \(NOT\)/);
  assert.equal(t('W2', (f) => { f.w2.links[1].liar = FLOOR - 1; }).held, true);
  assert.equal(t('W2', (f) => { f.w2.links[0].honest = 31250; }).held, false, 'equal is not above');
  assert.equal(t('W2', (f) => { f.w2.links[0].honest = 31251; }).held, true);
  assert.equal(t('W2', (f) => { f.w2.links[0].liar = -1; }).held, false);
  assert.equal(t('W2', (f) => { f.w2.links[0].liar = 0; }).held, true, 'a link can fall to nothing');
  assert.equal(t('W2', (f) => { f.w2.links = f.w2.links.slice(0, 1); }).held, true, 'one asker is a measurement');
  assert.equal(t('W2', (f) => { f.w2.links[0].liar = 'x'; }).held, false);
  assert.equal(t('W2', (f) => { f.w2.links = []; }).held, false);
  assert.equal(t('W2', (f) => { f.w2.links = 'x'; }).held, false);
  assert.equal(t('W2', (f) => { f.w2.control.forEach((l) => { l.liar = FLOOR - 1; }); }).held, false, 'a control already below the floor: the scenario could not fail');
  assert.equal(t('W2', (f) => { f.w2.control[0].liar = FLOOR - 1; f.w2.control[1].liar = FLOOR; }).held, true, 'one control asker at the floor is enough');
  assert.equal(t('W2', (f) => { f.w2.control = [{ asker: 'a1' }]; }).held, false, 'a junk control proves nothing');
  assert.equal(t('W2', (f) => { f.w2.control = []; }).held, false);
  assert.equal(t('W2', (f) => { delete f.w2.control; }).held, false);
});

test('W3: every asker asks the liar exactly once, within the first 20, and routing then goes honest', () => {
  assert.equal(t('W3', (f) => { f.w3.toHolder = 99; }).held, false);
  assert.equal(t('W3', (f) => { f.w3.answered = 99; }).held, false);
  assert.equal(t('W3', (f) => { f.w3.asks = 0; f.w3.toHolder = 0; f.w3.answered = 0; }).held, false);
  assert.equal(t('W3', (f) => { f.w3.liarAsks.pop(); }).held, false, 'four askers, all four');
  assert.equal(t('W3', (f) => { f.w3.liarAsks.push({ asker: 'a5', asks: 1, firstAt: 1 }); }).held, false);
  assert.equal(t('W3', (f) => { f.w3.liarAsks[2].asks = 2; }).held, false, 'exactly once');
  assert.match(t('W3', (f) => { f.w3.liarAsks[2].asks = 2; }).measured, /a3 2× \(first at ask 12\) \(NOT once within the first 20\)/);
  assert.equal(t('W3', (f) => { f.w3.liarAsks[2].asks = 0; f.w3.liarAsks[2].firstAt = -1; }).held, false);
  assert.match(t('W3', (f) => { f.w3.liarAsks[2].asks = 0; f.w3.liarAsks[2].firstAt = -1; }).measured, /a3 0× \(NOT once/);
  assert.equal(t('W3', (f) => { f.w3.liarAsks[0].firstAt = 19; }).held, true);
  assert.equal(t('W3', (f) => { f.w3.liarAsks[0].firstAt = 20; }).held, false, 'within the first 20');
  assert.equal(t('W3', (f) => { f.w3.liarAsks[0].firstAt = 0; }).held, true);
  assert.equal(t('W3', (f) => { delete f.w3.liarAsks[0].firstAt; }).held, false, 'a missing ask number is not early');
  assert.equal(t('W3', (f) => { f.w3.toHonestAfter20 = 58; }).held, true, '58 of 64 is 90.6%');
  assert.equal(t('W3', (f) => { f.w3.toHonestAfter20 = 57; }).held, false);
  assert.equal(t('W3', (f) => { f.w3.triageAfter20 = 10; f.w3.toHonestAfter20 = 9; }).held, true, 'exactly 90%');
  assert.match(t('W3', (f) => { f.w3.triageAfter20 = 10; f.w3.toHonestAfter20 = 9; }).measured, /9 of 10 triage asks \(90%\)/);
  assert.equal(t('W3', (f) => { f.w3.triageAfter20 = 0; f.w3.toHonestAfter20 = 0; }).held, false);
  assert.match(t('W3', (f) => { f.w3.triageAfter20 = 0; f.w3.toHonestAfter20 = 0; }).measured, /0 of 0 triage asks \(0%\)/);
  assert.equal(t('W3', (f) => { f.w3.triageAfter20 = 1; f.w3.toHonestAfter20 = 1; }).held, true, 'one ask after the first 20 is a measurement');
  assert.equal(t('W3', (f) => { f.w3.asks = 1; f.w3.toHolder = 1; f.w3.answered = 1; }).held, true, 'so is one ask');
  assert.match(t('W3', (f) => { f.w3.controlLiarAsks = 2; }).measured, /asked 2 times$/);
  assert.equal(t('W3', (f) => { f.w3.liarAsks = null; }).held, false);
});

test('W4: every count on its own', () => {
  const each = [
    (f) => { f.w4.askers = 3; }, (f) => { f.w4.linksCompared = 0; }, (f) => { f.w4.linksChanged = 1; }, (f) => { f.w4.linksChanged = -1; },
    (f) => { f.w4.silence.sent = 3; }, (f) => { f.w4.silence.quiet = 3; }, (f) => { f.w4.silence.answered = 3; }, (f) => { f.w4.silence.quietAfter = 1; },
    (f) => { f.w4.lied.sent = 15; f.w4.lied.refused = 15; }, (f) => { f.w4.lied.refused = 12; f.w4.lied.already = 4; }, (f) => { f.w4.lied.adopted = 1; },
    (f) => { f.w4.stranger.sent = 3; }, (f) => { f.w4.stranger.refusedAtDoor = 3; },
    (f) => { f.w4.next.asks = 3; }, (f) => { f.w4.next.toHonest = 3; }, (f) => { f.w4.next.answered = 3; },
    (f) => { f.w4.silence = null; }, (f) => { f.w4.lied = 'x'; }, (f) => { f.w4.next = []; }, (f) => { f.w4 = null; },
  ];
  for (const [i, mut] of each.entries()) assert.equal(t('W4', mut).held, false, 'change ' + i);
  assert.equal(t('W4', (f) => { f.w4.linksCompared = 1; }).held, true);
  const f = good();
  f.w4.lied.refused = 12; f.w4.lied.already = 4; f.w4.lied.why = { 'the answer checks here': 4, [NOT_SIGNED]: 8, never: 0 };
  assert.match(v(f, 'W4').measured, /16 false lied notes: 12 refused \(4 because the answer checks here, 8 because the packet is not signed by the holder it accuses\), 4 answered as already judged, 0 counted;/);
  assert.match(t('W4', (g) => { g.w4.lied.why = 'x'; }).measured, /16 refused, 0 answered/, 'no reasons, no brackets');
  assert.match(t('W4', (g) => { g.w4.lied.why = {}; }).measured, /16 refused, 0 answered/);
});

test('a pass not run is not measured; anything at all is judged without a throw', () => {
  const j = judge(claims, { ...good(), passes: [] });
  assert.deepEqual([j.held, j.failed, j.open], [0, 0, 4]);
  assert.deepEqual([j.verdicts[0].held, j.verdicts[0].measured], [null, 'not measured yet: pass 1']);
  const extra = { ...claims, claims: [...claims.claims, { id: 'W9', pass: 1, predicted: 'HOLD' }, null, 5] };
  assert.deepEqual(judge(extra, good()).verdicts.map((x) => [x.id, x.held]), [['W1', true], ['W2', true], ['W3', true], ['W4', true], ['W9', null]], 'a claim with no rule is never guessed');
  for (const g of [null, undefined, 5, 'x', [], {}, { passes: 'x' }, { passes: [1] }, { passes: [1], w1: 5, w2: [], w3: 'x', w4: { silence: 5 } }]) {
    assert.doesNotThrow(() => judge(claims, g));
    assert.doesNotThrow(() => judge(g, good()));
  }
  assert.deepEqual(judge(claims, { passes: [1] }).verdicts.map((x) => x.held), [false, false, false, false], 'no facts hold nothing');
  assert.deepEqual(judge(null, good()), { verdicts: [], held: 0, failed: 0, open: 0 });
});
