import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, ESTATE, CHILD, STAYS, GUARDS, CHILD_ASKS, KILLED_AFTER, CASES } from './judge.mjs';

const CLAIMS = JSON.parse(readFileSync(new URL('./claims.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const others = (all, me) => all.filter((r) => r !== me);
const again = { recognised: true, decoded: false, admitted: false };
function good() {
  return {
    a1: { commit: 'aaaaaaa1', foundationCommit: 'bbbbbbb2', files: 18, differ: [], missing: [], ancestor: true, imports: [], kernel: true, foundation: true, copies: [] },
    a2: { processes: 4, pinned: Object.fromEntries(ESTATE.map((r) => [r, others(ESTATE, r)])), outsider: Object.fromEntries(ESTATE.map((r) => [r, { refused: true, why: 'no', pinnedOutsider: false }])), messages: 60, nonLight: 0 },
    a3: {
      stays: Array.from({ length: STAYS }, (_, k) => ({ k, outcome: 'verified', audit: true, digest: true, recorded: true, available: k % 3 === 0 ? false : true })),
      guards: [
        { id: 'g1', outcome: 'verified', recheck: true, recorded: true, bookings: 3, clashes: [{ cabin: 'yurt', a: { channel: 'airbnb' }, b: { channel: 'booking' } }], second: { bookings: 3, clashes: 1 } },
        { id: 'g2', outcome: 'verified', recheck: true, recorded: true, bookings: 2, clashes: [], second: { bookings: 2, clashes: 0 } },
        { id: 'g3', outcome: 'verified', recheck: true, recorded: true, bookings: 0, clashes: [], second: { bookings: 0, clashes: 0 } },
        { id: 'g4', outcome: 'verified', recheck: true, recorded: true, bookings: 1, clashes: [], second: { bookings: 1, clashes: 0 } },
      ],
    },
    a4: { packets: 31, found: [], foundCount: 0, stayAnswers: 24, stayShaped: 24 },
    a5: [
      { first: 'breakit', refused: true, stage: 'signature', adopters: { wishwood: { adopted: 1, again } } },
      { first: 'wishwood', refused: true, stage: 'signature', adopters: { site: { adopted: 1, again }, breakit: { adopted: 2, again }, konomi: { adopted: 1, again } } },
    ],
    a6: { refused: 0, used: 28, everyUsedValued: true, valuesOnClient: 28, clientCredited: true, live: { ok: false, why: 'the switch is off' } },
    b1: { processes: 4, pinned: Object.fromEntries(CHILD.map((r) => [r, others(CHILD, r)])), asks: Array.from({ length: CHILD_ASKS }, (_, k) => ({ k, to: k < KILLED_AFTER ? 'stay-a' : 'stay-b', outcome: 'verified', audit: true, lost: k === KILLED_AFTER ? ['stay-a'] : [] })), killed: ['stay-a'],
      forged: { refused: true, adopters: { desk: { adopted: 1, again }, 'stay-b': { adopted: 1, again }, gate: { adopted: 1, again } } } },
    b2: { foreign: 0, cross: { intoChild: Object.fromEntries(ESTATE.map((e) => [e, Object.fromEntries(CHILD.map((c) => [c, 'sender']))])), intoEstate: Object.fromEntries(CHILD.map((c) => [c, Object.fromEntries(ESTATE.map((e) => [e, 'sender']))])) },
      replay: { ownGenesis: true, desk: { merged: true, refused: [] } }, estateRefuses: { desk: 'they began from different geneses: x', gate: 'they began from different geneses: x' } },
    b3: { genesisIsEstate: true, merged: Object.fromEntries(CHILD.map((c) => ['client ' + c, { merged: true, sent: 10, added: 6, skipped: 4, refused: [] }])), asks: 12, hub: { refused: true },
      desk: { offered: 3, adopted: 1, again }, sharedOn: { 'stay-a': { shared: true, adopted: 1, recognised: true }, 'stay-b': { shared: true, adopted: 1, recognised: true }, gate: { shared: true, adopted: 1, recognised: true } },
      falseAntibody: { offered: 1, adopted: 0, blocked: 1 }, rosterForeign: 0 },
    w1: { commit: 'ccccccc3', exit: 0, last: 'PILOT CHECK CLEAN — the receipt stands', judged: [9, 1], ticks: 11, crosses: 0, sealed: { held: 9, failed: 1, failedIds: ['ciso-1'] } },
    w2: { cases: ['admitted', 'size', 'signature', 'sender', 'signature'].map((s) => ({ outcome: 'verified', stage: s, expect: s })), direct: ['admitted', 'size', 'signature', 'sender', 'signature'] },
    p1: { where: 'a tab', roster: 'r1', genesis: 'g1', keys: { founder: 'k0', desk: 'k1', 'stay-a': 'k2', 'stay-b': 'k3', gate: 'k4' }, verdicts: Array(12).fill(true), forged: { adopters: 3, recognised: 3 }, seconds: 2.5,
      want: { roster: 'r1', genesis: 'g1', keys: { founder: 'k0', desk: 'k1', 'stay-a': 'k2', 'stay-b': 'k3', gate: 'k4' }, verdicts: Array(12).fill(true) } },
    p2: { page: [], modules: { 'core/seed.mjs': [], 'core/phase7/run.mjs': [] }, privacy: { 'core/phase7/index.html': [], 'core/receipts/phase7.json': [], 'core/phase7/nodes.json': [] } },
  };
}
const verdict = (facts, id) => judge(CLAIMS, facts).verdicts.find((v) => v.id === id);
const held = (facts, id) => verdict(facts, id).held;
function set(facts, path, value) { const f = clone(facts), ks = path.split('.'); let o = f; for (const k of ks.slice(0, -1)) o = o[k]; if (value === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = value; return f; }
const breaks = (id, path, value) => assert.equal(held(set(good(), path, value), id), false, id + ' should fail when ' + path + ' = ' + JSON.stringify(value));
const holds = (id, path, value) => assert.equal(held(set(good(), path, value), id), true, id + ' should hold when ' + path + ' = ' + JSON.stringify(value));

test('the sealed numbers', () => {
  assert.deepEqual(ESTATE, ['breakit', 'konomi', 'site', 'wishwood']);
  assert.deepEqual(CHILD, ['desk', 'gate', 'stay-a', 'stay-b']);
  assert.deepEqual([STAYS, GUARDS, CHILD_ASKS, KILLED_AFTER, CASES], [24, 4, 12, 6, 5]);
  assert.equal(CLAIMS.claims.length, 13);
});

test('every claim holds on good facts, and says what it measured', () => {
  const j = judge(CLAIMS, good());
  assert.deepEqual(j.verdicts.map((v) => [v.id, v.pass, v.held]), [['A1', 1, true], ['A2', 1, true], ['A3', 1, true], ['A4', 1, true], ['A5', 1, true], ['A6', 1, true], ['B1', 2, true], ['B2', 2, true], ['B3', 2, true], ['W1', 3, true], ['W2', 3, true], ['P1', 4, true], ['P2', 4, true]]);
  assert.deepEqual([j.held, j.failed, j.open], [13, 0, 0]);
  const m = Object.fromEntries(j.verdicts.map((v) => [v.id, v.measured]));
  assert.equal(m.A1, 'wishwood aaaaaaa carries 18 pinned files of fall-kit bbbbbbb: 0 differ, 0 missing; that commit an ancestor of this phase\'s: yes; the node imports the engine\'s kernel: yes, the vendored foundation: yes; copies of either in it: 0');
  assert.equal(m.A2, '4 processes; 4 of 4 pinned exactly the other three from the founder\'s roster; the card not on it refused by 4 of 4; 60 messages, 0 not LIGHT');
  assert.equal(m.A3, '24 of 24 stay asks answered, recorded and equal to the client\'s audit on a calendar of the same digest (8 not free); 4 of 4 guard asks answered, recorded and re-run by the asker to the same answer, every one matching the second count; g1: the yurt sold by Airbnb and Booking.com; g2, g3, g4: 0 clashes, 2 bookings; 0 clashes, 0 bookings; 0 clashes, 1 bookings');
  assert.equal(m.A4, '31 packets sent by the client\'s node, read raw and decoded: none of the privacy list; 24 of 24 stay answers carry the cabin, the dates, the verdict and the calendar\'s digest, and nothing else');
  assert.equal(m.A5, 'first at break-it (refused at signature): the client\'s node adopted after its own re-run and refused it on sight; first at the client\'s node (refused at signature): all three estate nodes adopted after their own re-run and refused it on sight');
  assert.equal(m.A6, '28 answers used, 28 routing values on the client\'s node\'s name in the books, every used answer valued by its asker: yes; refused in the merge: 0; the client\'s key credited: yes; a live allocation refused (the switch is off)');
  assert.equal(m.B1, '4 processes; 4 of 4 pinned exactly the other three from the client\'s roster; 12 of 12 asks answered and equal to the client\'s audit; stay-a killed after ask 6, every later ask answered by the holder still standing, 1 ask lost and asked again; the forged packet refused on sight by desk, stay-b and the gate after their own re-run');
  assert.equal(m.B2, '0 estate keys in the client\'s roster, genesis or pins; 32 of 32 cross packets refused at the sender stage; the desk\'s ledger replayed under the client\'s own genesis: yes; the estate\'s books refused all 2 of the client\'s ledgers: they began from different geneses');
  assert.equal(m.B3, 'planted on the estate\'s genesis: yes; the client\'s 4 ledgers merged into the estate\'s books with nothing refused, every entry once; the desk adopted the hub\'s antibodies after its own re-run and refused the forged packet on sight; shared on to 3 of 3 (stay-a: shared, stay-b: shared, gate: shared); the antibody made from a genuine packet not adopted (1 blocked); estate keys in the client\'s roster: 0');
  assert.equal(m.W1, 'break-it ccccccc\'s pilot/check.mjs exited 0: PILOT CHECK CLEAN — the receipt stands; 11 checks held, 0 not; the judge re-run gives 9 held, 1 failed (sealed: 9 held, ciso-1 failed)');
  assert.equal(m.W2, '5 of 5 cases decided by the client\'s gate at the stage the case names and as break-it\'s own gate decides it (admitted, size, signature, sender, signature)');
  assert.equal(m.P1, 'in a tab at a tab: the roster the measure\'s, the genesis the measure\'s, the keys the measure\'s; 12 asks, the verdicts the measure\'s; the forged packet refused on sight by 3 of 3 adopters, in 2.5 s');
  assert.equal(m.P2, '2 modules and the page read: no barred word; 3 published files read for the client\'s guests: none');
});

test('the other branch of every measured line', () => {
  const f = good();
  f.a1 = { ...f.a1, ancestor: false, kernel: false, foundation: 'yes', differ: ['x'], copies: ['y'] };
  f.a3.guards[0].clashes = [];
  f.a5 = [{ ...f.a5[0], refused: false }, { ...f.a5[1], adopters: {} }];
  f.a6 = { ...f.a6, everyUsedValued: false, clientCredited: false, live: { ok: true } };
  f.b1 = { ...f.b1, killed: [], forged: { refused: false } };
  f.b2 = { ...f.b2, replay: { ownGenesis: false }, estateRefuses: { desk: 'MERGED' } };
  f.b3 = { ...f.b3, genesisIsEstate: false, merged: {}, desk: {}, sharedOn: { gate: { shared: false } }, falseAntibody: { adopted: 1, blocked: 0 } };
  f.w1 = { ...f.w1, exit: null, judged: null };
  f.w2 = { cases: [], direct: [] };
  f.p1 = { ...f.p1, roster: 'r2', genesis: 'g2', keys: {}, verdicts: [false], seconds: 'x', where: 7 };
  f.p2 = { page: ['wordx'], modules: { 'core/seed.mjs': ['wordy'], 'core/phase7/a.mjs': 'z' }, privacy: { 'core/phase7/index.html': ['a guest name'], 'core/receipts/phase7.json': 5 } };
  const m = Object.fromEntries(judge(CLAIMS, f).verdicts.map((v) => [v.id, v.measured]));
  assert.equal(m.A1, 'wishwood aaaaaaa carries 18 pinned files of fall-kit bbbbbbb: 1 differ, 0 missing; that commit an ancestor of this phase\'s: NO; the node imports the engine\'s kernel: NO, the vendored foundation: NO; copies of either in it: 1');
  assert.match(m.A3, /; g1: NOT the yurt sold twice \(0 clashes\); /);
  assert.equal(m.A5, 'first at break-it (refused at signature): the client\'s node did NOT adopt and refuse it on sight; first at the client\'s node (refused at signature): NOT every estate node adopted and refused it on sight');
  assert.equal(m.A6, '28 answers used, 28 routing values on the client\'s node\'s name in the books, every used answer valued by its asker: NO; refused in the merge: 0; the client\'s key credited: NO; a live allocation GIVEN');
  assert.equal(m.B1, '4 processes; 4 of 4 pinned exactly the other three from the client\'s roster; 12 of 12 asks answered and equal to the client\'s audit; NO holder killed, 1 ask lost and asked again; the forged packet NOT refused on sight by every adopter');
  assert.equal(m.B2, '0 estate keys in the client\'s roster, genesis or pins; 32 of 32 cross packets refused at the sender stage; the desk\'s ledger replayed under the client\'s own genesis: NO; the estate\'s books did NOT refuse every ledger of the client\'s');
  assert.equal(m.B3, 'planted on the estate\'s genesis: NO; the client\'s 0 ledgers merged into the estate\'s books NOT cleanly; the desk did NOT adopt the hub\'s antibodies and refuse it on sight; shared on to 0 of 3 (stay-a: nothing to share, stay-b: nothing to share, gate: nothing to share); the antibody made from a genuine packet ADOPTED; estate keys in the client\'s roster: 0');
  assert.equal(m.W1, 'break-it ccccccc\'s pilot/check.mjs exited without a code: PILOT CHECK CLEAN — the receipt stands; 11 checks held, 0 not; the judge re-run gives nothing (sealed: 9 held, ciso-1 failed)');
  assert.equal(m.W2, '0 of 0 cases decided by the client\'s gate at the stage the case names and as break-it\'s own gate decides it ()');
  assert.equal(m.P1, 'in a tab at : the roster DIFFERENT, the genesis DIFFERENT, the keys DIFFERENT; 1 asks, the verdicts DIFFERENT; the forged packet refused on sight by 3 of 3 adopters');
  assert.equal(m.P2, '2 modules and the page read: barred words in core/seed.mjs, core/phase7/a.mjs, the page; 2 published files read for the client\'s guests: FOUND in core/phase7/index.html (a guest name); core/receipts/phase7.json ()');
  const g = good(); g.p2 = { ...g.p2, page: null };
  assert.equal(verdict(g, 'P2').measured, '2 modules and the page read: no barred word (the page was NOT read); 3 published files read for the client\'s guests: none');
  assert.equal(held(g, 'P2'), false);
});

test('A1, A2 fail on each thing their rules name', () => {
  for (const [p, v] of [['a1.files', 9], ['a1.differ', ['x']], ['a1.differ', 'none'], ['a1.missing', ['x']], ['a1.missing', undefined], ['a1.ancestor', 1], ['a1.kernel', 1], ['a1.foundation', 1], ['a1.copies', ['x']], ['a1.copies', undefined]]) breaks('A1', p, v);
  holds('A1', 'a1.files', 10);
  for (const [p, v] of [['a2.processes', 3], ['a2.pinned.site', ['breakit', 'konomi']], ['a2.pinned.site', ['breakit', 'konomi', 'wishwood', 'site']], ['a2.pinned.extra', ['x']], ['a2.outsider.site.refused', false], ['a2.outsider.konomi.pinnedOutsider', true], ['a2.outsider.wishwood', undefined], ['a2.messages', 0], ['a2.nonLight', 1], ['a2.nonLight', undefined]]) breaks('A2', p, v);
  holds('A2', 'a2.messages', 1);
});

test('A3 fails on each thing its rule names', () => {
  const g = good();
  for (const [p, v] of [['a3.stays', g.a3.stays.slice(1)], ['a3.stays.3.outcome', 'failed'], ['a3.stays.3.audit', false], ['a3.stays.3.digest', false], ['a3.stays.3.recorded', false], ['a3.stays.3.available', null], ['a3.guards', g.a3.guards.slice(0, 3)],
    ['a3.guards.0.outcome', 'abstain'], ['a3.guards.1.recheck', false], ['a3.guards.2.recorded', 1], ['a3.guards.0.second.clashes', 2], ['a3.guards.1.bookings', 3], ['a3.guards.1.second', undefined], ['a3.guards.3.clashes', 'none'],
    ['a3.guards.0.clashes.0.cabin', 'fern'], ['a3.guards.0.clashes.0.b.channel', 'airbnb'], ['a3.guards.0.clashes.0.a', undefined], ['a3.guards.1.clashes', [{}]], ['a3.guards.2.bookings', 1], ['a3.guards.3.bookings', 2], ['a3.guards.2.id', 'g9']]) breaks('A3', p, v);
  const two = set(set(g, 'a3.guards.0.clashes', [...g.a3.guards[0].clashes, { cabin: 'yurt' }]), 'a3.guards.0.second.clashes', 2);
  assert.equal(held(two, 'A3'), false);
  const nog1 = set(g, 'a3.guards.0.id', 'g0');
  assert.equal(held(nog1, 'A3'), false);
  const swapped = set(g, 'a3.guards.0.clashes.0.a.channel', 'booking');
  assert.equal(held(set(swapped, 'a3.guards.0.clashes.0.b.channel', 'airbnb'), 'A3'), true);
  assert.equal(held(set(g, 'a3.stays', [...g.a3.stays.slice(1), 5]), 'A3'), false);
});

test('A4, A5, A6 fail on each thing their rules name', () => {
  for (const [p, v] of [['a4.packets', 0], ['a4.found', ['a guest name']], ['a4.found', 'none'], ['a4.foundCount', 1], ['a4.stayAnswers', 23], ['a4.stayShaped', 23], ['a4.stayShaped', undefined]]) breaks('A4', p, v);
  holds('A4', 'a4.packets', 1);
  const g = good();
  for (const [p, v] of [['a5', g.a5.slice(0, 1)], ['a5', [...g.a5, g.a5[0]]], ['a5.0.first', 'site'], ['a5.0.refused', 'yes'], ['a5.0.adopters', { wishwood: g.a5[0].adopters.wishwood, site: g.a5[0].adopters.wishwood }], ['a5.0.adopters.wishwood.adopted', 0], ['a5.0.adopters.wishwood.again.recognised', false],
    ['a5.0.adopters.wishwood.again.decoded', true], ['a5.0.adopters.wishwood.again.admitted', true], ['a5.0.adopters.wishwood.again', undefined], ['a5.1.first', 'breakit'], ['a5.1.adopters.konomi', undefined], ['a5.1.adopters.site.adopted', undefined], ['a5.1.adopters.breakit', 5]]) breaks('A5', p, v);
  assert.equal(held({ ...g, a5: [g.a5[0], 5] }, 'A5'), false);
  for (const [p, v] of [['a6.refused', 1], ['a6.refused', undefined], ['a6.used', 27], ['a6.everyUsedValued', 1], ['a6.valuesOnClient', 27], ['a6.clientCredited', 1], ['a6.live.ok', true], ['a6.live', undefined]]) breaks('A6', p, v);
  holds('A6', 'a6.valuesOnClient', 29);
});

test('B1 fails on each thing its rule names', () => {
  const g = good();
  for (const [p, v] of [['b1.processes', 3], ['b1.pinned.desk', ['gate', 'stay-a']], ['b1.pinned.x', []], ['b1.asks', g.b1.asks.slice(1)], ['b1.asks.0.outcome', 'failed'], ['b1.asks.0.audit', false], ['b1.asks.7.to', 'stay-a'], ['b1.asks.9.outcome', 'abstain'],
    ['b1.killed', ['stay-a', 'stay-b']], ['b1.killed', []], ['b1.asks.3.lost', ['stay-a']], ['b1.forged.refused', 1], ['b1.forged.adopters.desk.adopted', 0], ['b1.forged.adopters.gate', undefined], ['b1.forged.adopters.stay-b.again.recognised', false],
    ['b1.forged.adopters.stay-b.again.decoded', true], ['b1.forged.adopters.desk.again.admitted', true], ['b1.forged.adopters.desk.again', undefined]]) breaks('B1', p, v);
  holds('B1', 'b1.asks.6.lost', []);
  assert.equal(held(set(set(g, 'b1.asks.5.k', 6), 'b1.asks.4.k', 6), 'B1'), false);
  assert.equal(held(set(g, 'b1.asks.11.k', 'x'), 'B1'), false);
  assert.equal(held(set(g, 'b1.asks', [...g.b1.asks.slice(1), 5]), 'B1'), false);
});

test('B2 and B3 fail on each thing their rules name', () => {
  for (const [p, v] of [['b2.foreign', 1], ['b2.foreign', undefined], ['b2.cross.intoChild.site.desk', 'signature'], ['b2.cross.intoEstate.gate.konomi', 'admitted'], ['b2.cross.intoChild.wishwood', undefined], ['b2.replay.ownGenesis', 1], ['b2.replay.desk.merged', false], ['b2.replay.desk.refused', [{}]], ['b2.replay.desk.refused', undefined],
    ['b2.estateRefuses', {}], ['b2.estateRefuses.gate', 'MERGED'], ['b2.estateRefuses.gate', 5]]) breaks('B2', p, v);
  for (const [p, v] of [['b3.genesisIsEstate', 1], ['b3.merged.client desk', undefined], ['b3.merged.client gate.merged', false], ['b3.merged.client gate.refused', [{}]], ['b3.merged.client gate.refused', undefined], ['b3.merged.client stay-a.added', 5], ['b3.asks', 0], ['b3.hub.refused', false],
    ['b3.desk.adopted', 0], ['b3.desk.again.recognised', false], ['b3.desk.again.decoded', true], ['b3.desk.again.admitted', true], ['b3.desk.again', undefined], ['b3.sharedOn.gate.shared', false], ['b3.sharedOn.stay-a.adopted', 0], ['b3.sharedOn.stay-b.recognised', false], ['b3.sharedOn.gate', undefined],
    ['b3.falseAntibody.adopted', 1], ['b3.falseAntibody.blocked', 0], ['b3.rosterForeign', 1], ['b3.rosterForeign', undefined]]) breaks('B3', p, v);
  holds('B3', 'b3.asks', 1);
  const g = good();
  assert.equal(held(set(g, 'b3.merged', { ...g.b3.merged, 'client x': { merged: true, sent: 1, added: 1, skipped: 0, refused: [] } }), 'B3'), false);
  assert.equal(held(set(g, 'b3.merged', { ...g.b3.merged, junk: 5 }), 'B3'), true);
});

test('W1, W2, P1, P2 fail on each thing their rules name', () => {
  for (const [p, v] of [['w1.exit', 1], ['w1.exit', '0'], ['w1.last', 'PILOT CHECK FAILED'], ['w1.judged', [9, 2]], ['w1.sealed.held', 8], ['w1.sealed.failed', 2], ['w1.sealed.failedIds', ['ciso-2']], ['w1.crosses', 1], ['w1.crosses', undefined], ['w1.ticks', 0]]) breaks('W1', p, v);
  holds('W1', 'w1.ticks', 1);
  const g = good();
  for (const [p, v] of [['w2.cases', g.w2.cases.slice(1)], ['w2.direct', g.w2.direct.slice(1)], ['w2.cases.2.outcome', 'failed'], ['w2.cases.2.stage', 'sender'], ['w2.cases.3.expect', 'size'], ['w2.direct.4', 'sender'], ['w2.cases.1.stage', ''], ['w2.cases.1.stage', undefined]]) breaks('W2', p, v);
  const two = set(set(set(g, 'w2.cases.1.stage', 'admitted'), 'w2.cases.1.expect', 'admitted'), 'w2.direct.1', 'admitted');
  assert.equal(held(two, 'W2'), false);
  const none = { cases: g.w2.cases.map((c, i) => (i === 0 ? { ...c, stage: 'size', expect: 'size' } : c)), direct: ['size', ...g.w2.direct.slice(1)] };
  assert.equal(held({ ...g, w2: none }, 'W2'), false);
  for (const [p, v] of [['p1.roster', 'r2'], ['p1.roster', ''], ['p1.genesis', 'g2'], ['p1.keys.desk', 'kx'], ['p1.keys', 5], ['p1.verdicts', Array(11).fill(true)], ['p1.verdicts.3', false], ['p1.forged.adopters', 2], ['p1.forged.recognised', 2]]) breaks('P1', p, v);
  assert.equal(held(set(set(g, 'p1.roster', ''), 'p1.want.roster', ''), 'P1'), false);
  assert.equal(held(set(set(g, 'p1.genesis', ''), 'p1.want.genesis', ''), 'P1'), false);
  const four = set(set(g, 'p1.keys', { a: 1, b: 2, c: 3, d: 4 }), 'p1.want.keys', { a: 1, b: 2, c: 3, d: 4 });
  assert.equal(held(four, 'P1'), false);
  const short = set(set(g, 'p1.verdicts', [true]), 'p1.want.verdicts', [true]);
  assert.equal(held(short, 'P1'), false);
  for (const [p, v] of [['p2.page', ['wordx']], ['p2.page', null], ['p2.modules', { 'core/seed.mjs': [] }], ['p2.modules', { 'core/phase7/a.mjs': [], 'core/phase7/b.mjs': [] }], ['p2.modules.core/seed.mjs', ['wordx']]]) breaks('P2', p.replace('core/seed.mjs', 'x'), v === undefined ? v : v) || null;
  assert.equal(held(set(g, 'p2.modules', { 'core/seed.mjs': ['wordx'], 'core/phase7/run.mjs': [] }), 'P2'), false);
  assert.equal(held(set(g, 'p2.modules', { 'core/seed.mjs': [], 'core/phase7/run.mjs': 'none' }), 'P2'), false);
  for (const drop of ['core/phase7/index.html', 'core/receipts/phase7.json', 'core/phase7/nodes.json']) { const pv = { ...g.p2.privacy }; delete pv[drop]; assert.equal(held(set(g, 'p2.privacy', pv), 'P2'), false, drop); }
  assert.equal(held(set(g, 'p2.privacy', { ...g.p2.privacy, 'core/phase7/local/p1.json': ['a phone number'] }), 'P2'), false);
  assert.equal(held(set(g, 'p2.privacy', { ...g.p2.privacy, 'core/phase7/local/p1.json': null }), 'P2'), false);
});

test('a claim with no facts is not measured; junk is never a verdict', () => {
  const j = judge(CLAIMS, {});
  assert.deepEqual([j.held, j.failed, j.open], [0, 0, 13]);
  assert.ok(j.verdicts.every((v) => v.held === null && v.measured === 'not measured yet'));
  for (const x of [null, 5, 'facts', []]) assert.equal(judge(CLAIMS, x).open, 13);
  for (const x of [null, 5, {}, { claims: 'x' }]) assert.deepEqual(judge(x, good()), { verdicts: [], held: 0, failed: 0, open: 0 });
  const odd = judge({ claims: [{ id: 'X9', pass: 9 }, 5, { id: 7 }, { id: 'toString', pass: 1 }, { id: 'a1', pass: 1 }] }, good());
  assert.deepEqual(odd.verdicts.map((v) => [v.id, v.held]), [['X9', null], ['', null], ['toString', null], ['a1', null]]);
  for (const k of ['a1', 'a2', 'a3', 'a4', 'a6', 'b1', 'b2', 'b3', 'w1', 'w2', 'p1', 'p2']) assert.equal(held({ ...good(), [k]: [] }, k.toUpperCase()), null, k);
  assert.equal(held({ ...good(), a5: {} }, 'A5'), null);
  assert.equal(held({ ...good(), a5: [] }, 'A5'), false);
  for (const k of ['a1', 'a2', 'a3', 'a4', 'a6', 'b1', 'b2', 'b3', 'w1', 'w2', 'p1', 'p2']) assert.equal(held({ ...good(), [k]: {} }, k.toUpperCase()), false, k);
});

test('the boundaries and branches the gate found untested', () => {
  holds('B2', 'b2.estateRefuses', { desk: 'they began from different geneses: x' });
  breaks('A6', 'a6.valuesOnClient', 28.5);
  breaks('A2', 'a2.messages', 1.5);
  const g = good();
  assert.match(verdict(set(g, 'b2.replay.desk.merged', false), 'B2').measured, /under the client's own genesis: NO;/);
  assert.match(verdict(set(g, 'b2.replay.desk.refused', [{}]), 'B2').measured, /under the client's own genesis: NO;/);
  assert.equal(verdict(set(g, 'p2.modules', { 'core/seed.mjs': ['wordx'], 'core/phase7/run.mjs': [] }), 'P2').measured, '2 modules and the page read: barred words in core/seed.mjs; 3 published files read for the client\'s guests: none');
});
