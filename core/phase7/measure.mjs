#!/usr/bin/env node
// core/phase7/measure.mjs — Phase 7's measurement (core/phase7/claims.json, sealed before this existed).
//
//   node core/phase7/measure.mjs           run the three worlds, measure every claim CI can, read the tab's facts, judge,
//                                          write core/receipts/phase7.json
//   node core/phase7/measure.mjs --check   do it again; exit 1 unless the receipt is the same, byte for byte
//
// wishwood, break-it and konomi-slm are cloned at the commits core/phase7/nodes.json names (mods.mjs), and every node runs
// in its own process (cell.mjs). Every identity is a public test seed or the sealed public test phrase, and the clock is
// fixed, so a run gives the same receipt every time. Glue: the verdicts are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { open } from '../vendor/light/packet.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import * as E from '../economy.mjs';
import { hex, unhex } from '../identity.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { assetOf, stableJson } from '../node.mjs';
import { brk1CasesFrom } from '../scenario.mjs';
import { doorChecks } from '../phase6/world.mjs';
import { ESTATE, CHILD, estateOf, childOf, feedSetsOf } from './world.mjs';
import { nodesOf, modsOf, PINS } from './mods.mjs';
import { runEstate, runChild, runCoupled, packetsOf } from './run.mjs';
import { booksOf } from './books.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8')), claims6 = JSON.parse(readFileSync(join(CORE, 'phase6', 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase7.json');
const local = (name) => { const f = join(HERE, 'local', name + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const sha = (b) => hex(sha256(typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function processCell(role, nodesDir, world) {
  const child = spawn(process.execPath, [join(HERE, 'cell.mjs'), role, nodesDir, world], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout }), waiting = new Map();
  let next = 0, ready;
  const up = new Promise((r) => { ready = r; });
  rl.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.ready) { ready(m); return; }
    const w = waiting.get(m.i); waiting.delete(m.i);
    if (m.ok) w.res(m.result); else w.rej(new Error(m.error));
  });
  const gone = new Promise((r) => child.on('exit', r));
  return up.then((m) => ({
    id: m.id, pid: m.pid,
    call: (op, args) => new Promise((res, rej) => { const i = next++; waiting.set(i, { res, rej }); child.stdin.write(JSON.stringify({ i, op, args }) + '\n'); }),
    close: async () => { child.stdin.end(); await gone; },
    kill: async () => { child.kill(); await gone; },
  }));
}
async function cellsOf(roles, nodesDir, world) {
  const cells = {};
  for (const r of roles) cells[r] = await processCell(r, nodesDir, world);
  return cells;
}

/** The sealed privacy list, read from the client's calendar: what to look for, and under what name (never the thing itself). */
export function privacyOf(bookings) {
  const names = [...new Set(bookings.map((b) => String(b.guest)).filter((g) => g.length >= 3))];
  // a booking id as a quoted VALUE (after a colon, an opening bracket or a comma), so a record's key that happens to read
  // the same (the receipt's own claim ids b1, b2, b3) is not taken for one
  const ids = bookings.map((b) => new RegExp('[:,[]\\s*"' + String(b.id).replace(/[^a-z0-9]/gi, '') + '"(?=\\s*[,\\]}])'));
  return [
    ...names.map((n) => ({ kind: 'a guest name', test: (t) => t.toLowerCase().includes(n.toLowerCase()) })),
    ...ids.map((re) => ({ kind: 'a booking id', test: (t) => re.test(t) })),
    { kind: 'a revenue figure', test: (t) => /"revenue"\s*:/.test(t) },
    { kind: 'a guest field', test: (t) => /"guest"\s*:/.test(t) },
    { kind: 'an email address', test: (t) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/.test(t) },
    { kind: 'a phone number', test: (t) => /(?<![0-9A-Za-z])(?:\+44\s?|0)\d{3,4}[\s-]?\d{3}[\s-]?\d{3,4}(?![0-9A-Za-z])/.test(t) },
  ];
}
const hits = (list, text) => list.filter((p) => p.test(text)).map((p) => p.kind);

/** A second count of the clashes in a set of feeds, written apart from the engine: dated events, one booking per uid or per
 *  cabin and dates, and pairs on one cabin whose nights cross. */
export function secondCount(feeds) {
  const evs = [];
  for (const f of feeds) for (const b of String(f.ics).split('BEGIN:VEVENT').slice(1)) {
    const s = /DTSTART(?:;VALUE=DATE)?:(\d{8})/.exec(b), e = /DTEND(?:;VALUE=DATE)?:(\d{8})/.exec(b), u = /UID:([^\r\n]+)/.exec(b);
    if (s && e) evs.push({ cabin: String(f.cabin).toLowerCase() || 'unknown', from: s[1], to: e[1], uid: u ? u[1].trim() : '' });
  }
  const kept = [];
  for (const x of evs) if (!kept.some((k) => (x.uid && k.uid === x.uid) || (k.cabin === x.cabin && k.from === x.from && k.to === x.to))) kept.push(x);
  let n = 0;
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) if (kept[i].cabin === kept[j].cabin && kept[i].from < kept[j].to && kept[j].from < kept[i].to) n++;
  return { bookings: kept.length, clashes: n };
}

const gitIn = (dir, args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
const keysIn = (x, out = new Set()) => { if (typeof x === 'string') { if (/^[0-9a-f]{64}$/.test(x)) out.add(x); } else if (Array.isArray(x)) x.forEach((v) => keysIn(v, out)); else if (x && typeof x === 'object') Object.values(x).forEach((v) => keysIn(v, out)); return out; };

export async function measure() {
  const nodesDir = nodesOf(), mods = await modsOf(nodesDir, claims), W = mods.wishwood;
  const { ids, genesis } = await estateOf(claims);
  const calendar = W.calendarOf(mods.bookings), privacy = privacyOf(mods.bookings), feedSets = feedSetsOf(claims);
  const facts = {};
  const pids = new Set();

  // A1 — the foundation in the client's repository, byte for byte
  const ww = join(nodesDir, 'wishwood'), pinsFile = JSON.parse(gitIn(ww, ['show', PINS.wishwood + ':vendor/fall-kit-core/FALL-KIT-CORE.json']).toString('utf8'));
  const differ = [], missing = [];
  for (const [f, pin] of Object.entries(pinsFile.files)) {
    let theirs = null, ours = null;
    try { theirs = gitIn(ww, ['show', PINS.wishwood + ':vendor/fall-kit-core/' + f]); } catch { missing.push(f); continue; }
    try { ours = gitIn(ROOT, ['show', pinsFile.commit + ':core/' + f]); } catch { missing.push(f); continue; }
    if (sha(theirs) !== pin || sha(ours) !== pin) differ.push(f);
  }
  let ancestor = false;
  try { execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', pinsFile.commit, 'HEAD'], { stdio: 'ignore' }); ancestor = true; } catch { ancestor = false; }
  const nodeSrc = gitIn(ww, ['show', PINS.wishwood + ':node/wishwood-node.mjs']).toString('utf8');
  const imports = [...nodeSrc.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  facts.a1 = { commit: PINS.wishwood, foundationCommit: pinsFile.commit, files: Object.keys(pinsFile.files).length, differ, missing, ancestor, imports,
    kernel: imports.includes('../kernel/reservations.mjs'), foundation: imports.includes('../vendor/fall-kit-core/node.mjs'),
    copies: ['function mergeChannels', 'function parseIcal', 'function isAvailable', 'function createNode', 'function makeIdentity'].filter((s) => nodeSrc.includes(s)) };

  // A2–A6 — the estate's mesh with the client's node
  const estate = await cellsOf(ESTATE, nodesDir, 'estate');
  for (const c of Object.values(estate)) pids.add(c.pid);
  let A, B, C, estatePackets, planted, closed = [];
  try {
    A = await runEstate(estate, claims, ids);
    estatePackets = await packetsOf(estate);
    const roleOf = Object.fromEntries(Object.entries(estate).map(([r, c]) => [c.id, r]));
    facts.a2 = { processes: new Set(Object.values(estate).map((c) => c.pid)).size === 4 && !pids.has(process.pid) ? 4 : 0,
      pinned: Object.fromEntries(Object.entries(A.up.pinned).map(([r, ps]) => [r, ps.map((id) => roleOf[id] || 'not a member').sort()])),
      outsider: Object.fromEntries(Object.entries(A.offered).map(([r, x]) => [r, { refused: x.ok === false, why: x.why || null, pinnedOutsider: x.pinned.includes(ids.stranger.id) }])),
      messages: A.w.messages, nonLight: A.w.nonLight };
    const valuesBy = (role) => A.ledgers[role].log.filter((x) => x.entry.type === 'value' && x.entry.asset === assetOf(ids.wishwood.id) && x.entry.by === ids[role].id).map((x) => x.entry.job);
    const recorded = Object.fromEntries(claims.askers.map((r) => [r, new Set(valuesBy(r))]));
    facts.a3 = {
      calendar: W.occupancyDigest(calendar),
      stays: A.stays.map((s, k) => ({ k, asker: s.asker, cabin: s.input.cabin, checkin: s.input.checkin, checkout: s.input.checkout, to: s.to || null, outcome: s.outcome, available: s.answer ? s.answer.available : null,
        audit: s.answer ? W.auditStay(calendar, s.answer) : false, digest: s.answer && s.answer.receipt ? s.answer.receipt.calendar === W.occupancyDigest(calendar) : false, recorded: !!s.job && recorded[s.asker].has(s.job) })),
      guards: A.guards.map((g, i) => { const second = secondCount(claims.guard.sets[i].feeds); return { id: g.id, to: g.to || null, outcome: g.outcome, bookings: g.answer ? g.answer.bookings : null, clashes: g.answer ? g.answer.clashes : null,
        recheck: g.answer ? W.guardChecksFor(feedSets)(g.answer) : false, second, recorded: !!g.job && recorded.site.has(g.job) }; }),
    };
    const sentByClient = A.w.sent[ids.wishwood.id] || [];
    const found = [];
    for (const h of sentByClient) {
      const b = unhex(h), v = open(b, { keyFor: () => unhex(ids.wishwood.id), verify: () => true, lastCounter: () => 0n });
      for (const k of [...hits(privacy, Buffer.from(b).toString('latin1')), ...(v.admit ? hits(privacy, JSON.stringify(v.value)) : ['a packet that would not decode'])]) found.push(k);
    }
    const shapes = A.stays.filter((s) => s.answer).map((s) => JSON.stringify(Object.keys(s.answer).sort()) === '["available","receipt","verdict"]' && JSON.stringify(Object.keys(s.answer.receipt).sort()) === JSON.stringify(W.STAY_RECEIPT));
    facts.a4 = { packets: sentByClient.length, found: [...new Set(found)].sort(), foundCount: found.length, stayAnswers: shapes.length, stayShaped: shapes.filter(Boolean).length,
      read: 'the answer\'s own fields are verdict (the protocol\'s answer status, VERIFIED or ABSTAIN), available and the receipt; the receipt\'s are the cabin, the dates, available, the calendar\'s occupancy digest and receiptHash (the receipt\'s own hash)' };
    facts.a5 = A.immune.map((x) => ({ first: x.first, refused: x.at.ok === false, stage: x.at.stage || null,
      adopters: Object.fromEntries(Object.entries(x.adopted).map(([o, r]) => [o, { offered: r ? r.offered : 0, adopted: r ? r.adopted : 0, blocked: r ? r.autoimmuneBlocked : 0, again: { recognised: x.again[o].recognised === true, decoded: x.again[o].decoded === true, admitted: x.again[o].ok === true } }])) }));
    const estateCtx = { cards: new Map(Object.values(A.cards).map((c) => [c.id, c])), evidence: A.w.evidence, checks: { stay: W.stayChecks, guard: W.guardChecksFor(feedSets), door: doorChecks } };
    const books = await booksOf(genesis, A.ledgers, estateCtx);
    const onClient = books.ledger.log.filter((x) => x.entry.type === 'value' && x.entry.asset === assetOf(ids.wishwood.id));
    const used = [...A.stays, ...A.guards].filter((s) => s.outcome === 'verified');
    const credits = L.credits(books.ledger), live = L.allocate(books.ledger, {});
    facts.a6 = { merged: books.merged, refused: Object.values(books.merged).reduce((n, m) => n + (m.refused ? m.refused.length : 0) + (m.merged === false || m.replayed === false ? 1 : 0), 0),
      used: used.length, valuesOnClient: onClient.length, everyUsedValued: used.every((s) => onClient.some((x) => x.entry.job === s.job && x.entry.by === ids[s.asker].id)),
      clientCredited: !!credits.ok && BigInt(credits.credits[ids.wishwood.id] || '0') > 0n, live: { ok: live.ok, why: live.ok ? null : live.why }, entries: books.ledger.log.length };

    // B1, B2, W2 — the client's own organism, sovereign
    planted = await childOf(claims);
    const cases = await brk1CasesFrom(await import(pathToFileURL(join(nodesDir, 'break-it', 'src', 'wire.mjs')).href), ids.stranger, planted.ids.desk);
    const child = await cellsOf(CHILD, nodesDir, 'child');
    for (const c of Object.values(child)) pids.add(c.pid);
    try {
      B = await runChild(child, claims, planted, ids, cases, async (role) => { await child[role].kill(); closed.push(role); }, { cells: estate, packets: estatePackets });
    } finally { for (const [r, c] of Object.entries(child)) if (!closed.includes(r)) await c.close(); }
    const croleOf = Object.fromEntries(Object.entries(child).map(([r, c]) => [c.id, r]));
    const killedAt = 6;
    facts.b1 = { processes: new Set(Object.values(child).map((c) => c.pid)).size,
      pinned: Object.fromEntries(Object.entries(B.up.pinned).map(([r, ps]) => [r, ps.map((id) => croleOf[id] || 'not a member').sort()])),
      asks: B.stays.map((s, k) => ({ k, to: s.to || null, outcome: s.outcome, available: s.answer ? s.answer.available : null, audit: s.answer ? W.auditStay(calendar, s.answer) : false, lost: s.lost })),
      killed: B.killed, killedAfter: killedAt,
      forged: { refused: B.immune.first.ok === false, stage: B.immune.first.stage || null, adopters: Object.fromEntries(Object.entries(B.immune.adopted).map(([o, r]) => [o, { adopted: r ? r.adopted : 0, again: { recognised: B.immune.again[o].recognised === true, decoded: B.immune.again[o].decoded === true, admitted: B.immune.again[o].ok === true } }])) } };
    const estateKeys = new Set([...Object.values(ids).flatMap((i) => [i.id]), ...Object.values(A.cards).flatMap((c) => [...keysIn(c)])]);
    const childKeys = new Set([...keysIn(B.up.roster), ...keysIn(planted.genesis), ...Object.values(B.up.pinned).flat()]);
    const childBooks = await booksOf(planted.genesis, B.ledgers, { cards: new Map(B.up.cards.map((c) => [c.id, c])), evidence: B.w.evidence, checks: { stay: W.stayChecks, screen: (a) => a && a.receipt && typeof a.receipt.receiptHash === 'string' } });
    const offeredToEstate = await booksOf(genesis, B.ledgers, { cards: new Map(B.up.cards.map((c) => [c.id, c])), evidence: B.w.evidence, checks: {} });
    facts.b2 = { foreign: [...childKeys].filter((k) => estateKeys.has(k)).length,
      cross: { intoChild: B.cross.intoChild, intoEstate: B.cross.intoEstate },
      replay: { genesis: (await L.idOf(planted.genesis)), ownGenesis: childBooks.ledger.genesis !== null && (await L.idOf(childBooks.ledger.genesis)) === (await L.idOf(planted.genesis)), desk: childBooks.merged.desk },
      estateRefuses: Object.fromEntries(Object.entries(offeredToEstate.merged).map(([r, m]) => [r, m.merged === false ? m.why : 'MERGED'])) };
    facts.w2 = { cases: B.screens.map((s, i) => ({ name: s.name, expect: s.expect, to: s.to || null, outcome: s.outcome, admit: s.answer ? s.answer.admit : null, stage: s.answer ? (s.answer.admit ? 'admitted' : s.answer.stage) : null })),
      direct: [] };
    for (const c of cases) { const v = await mods.breakit.screen({ 1: planted.ids.desk.id }, unhex(c.hex)); facts.w2.direct.push(v.admit ? 'admitted' : v.stage); }

    // B3 — coupled, by the client's choice
    const coupledPlant = await childOf(claims, genesis);
    const coupled = await cellsOf(CHILD, nodesDir, 'coupled');
    for (const c of Object.values(coupled)) pids.add(c.pid);
    try { C = await runCoupled(coupled, claims, coupledPlant, ids, estate.breakit); } finally { for (const c of Object.values(coupled)) await c.close(); }
    const unionCards = new Map([...Object.values(A.cards), ...Object.values(C.cards)].map((c) => [c.id, c]));
    const both = await booksOf(genesis, { ...A.ledgers, ...Object.fromEntries(Object.entries(C.ledgers).map(([r, l]) => ['client ' + r, l])) },
      { cards: unionCards, evidence: { ...A.w.evidence, ...C.w.evidence }, checks: { stay: W.stayChecks, guard: W.guardChecksFor(feedSets), door: doorChecks } });
    const clientMerged = Object.fromEntries(Object.entries(both.merged).filter(([r]) => r.startsWith('client ')));
    facts.b3 = { genesisIsEstate: (await L.idOf(coupledPlant.genesis)) === (await L.idOf(genesis)), merged: clientMerged,
      asks: C.stays.filter((s) => s.outcome === 'verified').length,
      hub: { refused: C.immune.atHub.ok === false, stage: C.immune.atHub.stage || null },
      desk: C.immune.adopted ? { offered: C.immune.adopted.offered, adopted: C.immune.adopted.adopted, again: { recognised: C.immune.again.recognised === true, decoded: C.immune.again.decoded === true, admitted: C.immune.again.ok === true } } : null,
      sharedOn: Object.fromEntries(Object.entries(C.immune.sharedOn).map(([o, x]) => [o, x.shared ? { shared: true, adopted: x.adopted.adopted, recognised: x.again.recognised === true } : { shared: false }])),
      falseAntibody: { offered: C.falseOffer.offered || 0, adopted: C.falseOffer.adopted || 0, blocked: C.falseOffer.autoimmuneBlocked || 0 },
      rosterForeign: [...keysIn(C.up.roster)].filter((k) => estateKeys.has(k)).length };
  } finally { for (const c of Object.values(estate)) await c.close(); }

  // W1 — the pilot, re-run by break-it's own check
  const pc = spawnSync(process.execPath, [join(nodesDir, 'break-it', 'pilot', 'check.mjs')], { cwd: join(nodesDir, 'break-it'), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
  const lines = String(pc.stdout || '').trim().split('\n'), jl = lines.find((l) => l.includes('the judge, re-run on the receipt')) || '';
  const pr = JSON.parse(readFileSync(join(nodesDir, 'break-it', 'receipts', 'pilot.json'), 'utf8'));
  facts.w1 = { commit: PINS['break-it'], exit: pc.status, last: lines[lines.length - 1] || '', judged: /\((\d+) held, (\d+) failed\)/.test(jl) ? jl.match(/\((\d+) held, (\d+) failed\)/).slice(1).map(Number) : null, ticks: lines.filter((l) => l.startsWith('  ✓')).length, crosses: lines.filter((l) => l.startsWith('  ✗')).length,
    sealed: { held: pr.held, failed: pr.failed, failedIds: pr.verdicts.filter((v) => v.held === false).map((v) => v.id) } };

  // P1 — the tab; P2 — the words and the guests, over what this phase publishes
  const tab = local('p1');
  if (tab) facts.p1 = { from: 'core/phase7/local/p1.json', where: tab.where, ...tab.facts, want: { roster: sha(stableJson(B.up.roster)), genesis: await L.idOf(planted.genesis), keys: Object.fromEntries(planted.roles.map((r) => [r, planted.ids[r].id])), verdicts: B.stays.map((s) => (s.answer ? s.answer.available : null)) } };
  const pageFile = join(HERE, 'index.html');
  const text = existsSync(pageFile) ? readFileSync(pageFile, 'utf8').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ') : null;
  const mods7 = ['core/seed.mjs', ...readdirSync(HERE).filter((m) => m.endsWith('.mjs')).sort().map((m) => 'core/phase7/' + m)];
  const published = ['core/phase7/index.html', 'core/phase7/nodes.json', ...(existsSync(join(HERE, 'local')) ? readdirSync(join(HERE, 'local')).map((f) => 'core/phase7/local/' + f) : [])];
  facts.p2 = { page: text === null ? null : E.barredIn(text, claims6.barred, true), modules: Object.fromEntries(mods7.map((p) => [p, E.barredIn(readFileSync(join(ROOT, p), 'utf8'), claims6.barred, false)])),
    privacy: Object.fromEntries(published.filter((p) => existsSync(join(ROOT, p))).map((p) => [p, hits(privacy, readFileSync(join(ROOT, p), 'utf8'))])) };
  return { facts, privacy };
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase7/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
// what the receipt says about itself: every failure, in plain words
export const NOTES = Object.freeze([
  'B3 failed as sealed, and is kept. Coupled, the client\'s desk pins the estate\'s immune hub (break-it\'s node) and nothing else of the estate. The hub\'s antibodies reached the desk, which adopted them only after its own door re-ran them, and then refused the forged packet on sight. But the foundation\'s node shares on only what its own door refused first hand: core/node.mjs keeps a packet to share when it refuses one itself, not when it adopts a peer\'s antibody. So the desk had nothing to pass on to stay-a, stay-b and the gate. Inside one organism every node pins every other and the first to refuse shares with all (A5, B1), so this never showed; across an organism\'s edge, where one node is the bridge, immunity stops at the bridge. Everything else the claim names held: the client\'s books merged into the estate\'s with nothing refused and every entry counted once, the antibody made from a genuine packet of the client\'s own was not adopted, and the client\'s roster holds no estate key.',
  'A4 was read as follows, and the facts say so (a4.read): an answer\'s own fields are verdict (the protocol\'s answer status, VERIFIED or ABSTAIN), available and the receipt; the receipt\'s are the cabin, the dates, available, the calendar\'s occupancy digest and receiptHash (the receipt\'s own hash). Nothing else is in any stay answer.',
  'The privacy list looks for a booking id only as a quoted value, as the claims seal it: in the receipt, the claim ids b1, b2 and b3 are keys of the facts, not values, and the first measure counted them as booking ids until the rule was read as written.',
]);
export async function receiptText() {
  const { facts, privacy } = await measure();
  const j = judge(claims, facts);
  const body = { kind: 'fall-kit.core.phase7.receipt', v: 1, sealedIn: sealedIn(), nodes: PINS, notes: NOTES, facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  // the receipt is a published file too: P2 holds it to the privacy list, as the measure wrote it
  body.facts.p2.privacy['core/receipts/phase7.json'] = hits(privacy, stable(body));
  const j2 = judge(claims, body.facts);
  return { text: stable({ ...body, verdicts: j2.verdicts, held: j2.held, failed: j2.failed, open: j2.open }), j: j2 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, j } = await receiptText();
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || Buffer.compare(readFileSync(OUT), Buffer.from(text)) !== 0) { console.error('the receipt differs from core/receipts/phase7.json'); process.exit(1); }
    console.log('the receipt reproduced byte for byte');
  } else writeFileSync(OUT, text);
}
