#!/usr/bin/env node
// core/phase7b/measure.mjs — Phase 7b's measurement (core/phase7b/claims.json, sealed before this existed).
//
//   node core/phase7b/measure.mjs           replay Phase 7's three worlds twice (the desk as Phase 7 booted it, and as a
//                                           bridge), measure every claim CI can, read the local facts, judge, write
//                                           core/receipts/phase7b.json
//   node core/phase7b/measure.mjs --check   do it again; exit 1 unless the receipt is the same, byte for byte
//
// Each replay runs the estate's mesh, the client's sovereign organism, then the coupled one, in the order and on the seeds
// Phase 7 sealed, every node in its own process (cell.mjs), and gathers the coupled step's facts the way Phase 7's measure
// gathers b3. Glue: the verdicts are judge.mjs's (pure, gated), which judges R1 and R2 with Phase 7's own judge.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as L from '../vendor/ledger/contrib.mjs';
import * as E from '../economy.mjs';
import { hex } from '../identity.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { brk1CasesFrom } from '../scenario.mjs';
import { doorChecks } from '../phase6/world.mjs';
import { ESTATE, CHILD, estateOf, childOf, feedSetsOf } from './world.mjs';
import { nodesOf, modsOf, PINS } from '../phase7/mods.mjs';
import { runEstate, runChild, runCoupled, packetsOf, signedAs, bundleAs } from '../phase7/run.mjs';
import { booksOf } from '../phase7/books.mjs';
import { privacyOf } from '../phase7/measure.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const claims = readJson(HERE, 'claims.json'), claims7 = readJson(CORE, 'phase7', 'claims.json'), claims6 = readJson(CORE, 'phase6', 'claims.json');
const OUT = join(CORE, 'receipts', 'phase7b.json');
const local = (name) => { const f = join(HERE, 'local', name + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const keysIn = (x, out = new Set()) => { if (typeof x === 'string') { if (/^[0-9a-f]{64}$/.test(x)) out.add(x); } else if (Array.isArray(x)) x.forEach((v) => keysIn(v, out)); else if (x && typeof x === 'object') Object.values(x).forEach((v) => keysIn(v, out)); return out; };

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

/** Phase 7's three worlds, in Phase 7's order; the coupled desk booted in deskWorld ('coupled', or 'bridge'). `after` runs
 *  with the estate and the coupled organism still alive. → { b3, after } */
async function replay(nodesDir, mods, deskWorld, after) {
  const W = mods.wishwood, feedSets = feedSetsOf(claims7);
  const { ids, genesis } = await estateOf(claims7);
  const estate = await cellsOf(ESTATE, nodesDir, 'estate');
  let A, C, out = null, closed = [];
  try {
    A = await runEstate(estate, claims7, ids);
    const estatePackets = await packetsOf(estate);
    const planted = await childOf(claims7);
    const cases = await brk1CasesFrom(await import(pathToFileURL(join(nodesDir, 'break-it', 'src', 'wire.mjs')).href), ids.stranger, planted.ids.desk);
    const child = await cellsOf(CHILD, nodesDir, 'child');
    try { await runChild(child, claims7, planted, ids, cases, async (role) => { await child[role].kill(); closed.push(role); }, { cells: estate, packets: estatePackets }); }
    finally { for (const [r, c] of Object.entries(child)) if (!closed.includes(r)) await c.close(); }
    const coupledPlant = await childOf(claims7, genesis);
    const coupled = await cellsOf(CHILD, nodesDir, deskWorld);
    try {
      C = await runCoupled(coupled, claims7, coupledPlant, ids, estate.breakit);
      if (after) out = await after({ coupled, estate, ids, coupledPlant });
    } finally { for (const c of Object.values(coupled)) await c.close(); }
    // the coupled step's facts, gathered exactly as Phase 7's measure gathers b3
    const estateKeys = new Set([...Object.values(ids).flatMap((i) => [i.id]), ...Object.values(A.cards).flatMap((c) => [...keysIn(c)])]);
    const unionCards = new Map([...Object.values(A.cards), ...Object.values(C.cards)].map((c) => [c.id, c]));
    const both = await booksOf(genesis, { ...A.ledgers, ...Object.fromEntries(Object.entries(C.ledgers).map(([r, l]) => ['client ' + r, l])) },
      { cards: unionCards, evidence: { ...A.w.evidence, ...C.w.evidence }, checks: { stay: W.stayChecks, guard: W.guardChecksFor(feedSets), door: doorChecks } });
    const clientMerged = Object.fromEntries(Object.entries(both.merged).filter(([r]) => r.startsWith('client ')));
    const b3 = { genesisIsEstate: (await L.idOf(coupledPlant.genesis)) === (await L.idOf(genesis)), merged: clientMerged,
      asks: C.stays.filter((s) => s.outcome === 'verified').length,
      hub: { refused: C.immune.atHub.ok === false, stage: C.immune.atHub.stage || null },
      desk: C.immune.adopted ? { offered: C.immune.adopted.offered, adopted: C.immune.adopted.adopted, again: { recognised: C.immune.again.recognised === true, decoded: C.immune.again.decoded === true, admitted: C.immune.again.ok === true } } : null,
      sharedOn: Object.fromEntries(Object.entries(C.immune.sharedOn).map(([o, x]) => [o, x.shared ? { shared: true, adopted: x.adopted.adopted, recognised: x.again.recognised === true } : { shared: false }])),
      falseAntibody: { offered: C.falseOffer.offered || 0, adopted: C.falseOffer.adopted || 0, blocked: C.falseOffer.autoimmuneBlocked || 0 },
      rosterForeign: [...keysIn(C.up.roster)].filter((k) => estateKeys.has(k)).length };
    return { b3, after: out, relayed: C.immune.adopted ? C.immune.adopted.relayed === undefined ? null : C.immune.adopted.relayed : null };
  } finally { for (const c of Object.values(estate)) await c.close(); }
}

/** R3: a bridge cannot pass on a refusal a member's own door would not make. */
async function bridgeSafety({ coupled, estate, ids }) {
  await coupled['stay-a'].call('pin', { card: await estate.site.call('card') });
  const genuine = await signedAs(ids.site, coupled['stay-a'].id, { t: 'ledger', log: [] }, 900101);
  const atDesk = await coupled.desk.call('hear', { bytes: await bundleAs(ids.breakit, coupled.desk.id, [genuine], 900102) });
  const on = {};
  for (const m of ['stay-a', 'stay-b']) {
    const s = await coupled.desk.call('shareAntibodies', { to: coupled[m].id });
    const r = s ? await coupled[m].call('hear', { bytes: s.bytes }) : null;
    on[m] = { shared: !!s, adopted: r ? r.adopted : 0, blocked: r ? r.autoimmuneBlocked : 0 };
  }
  // the rule names one antibody and a door: what each member's door now does with the genuine packet itself. A member
  // that adopted its antibody refuses it on sight; one that did not lets it through the door (whatever the message then
  // says to it). The counts above are of the whole bundle the desk shares, which also carries what it relayed before.
  const doorOf = (r) => (r.recognised === true ? 'recognised' : typeof r.stage === 'string' && r.stage !== 'message' ? r.stage : 'passed');
  const heardA = await coupled['stay-a'].call('hear', { bytes: genuine }), heardB = await coupled['stay-b'].call('hear', { bytes: genuine });
  return { desk: { adopted: atDesk.adopted, relayed: atDesk.relayed === undefined ? null : atDesk.relayed }, stayA: on['stay-a'], stayB: on['stay-b'],
    stayADoor: doorOf(heardA), stayBDoor: doorOf(heardB) };
}

export async function measure() {
  const nodesDir = nodesOf(), mods = await modsOf(nodesDir, claims7), facts = {};
  const receipt7 = readJson(CORE, 'receipts', 'phase7.json');
  const bridge = await replay(nodesDir, mods, 'bridge', bridgeSafety);
  facts.r1 = { b3: bridge.b3, relayed: bridge.relayed };
  facts.r3 = bridge.after;
  const control = await replay(nodesDir, mods, 'coupled', null);
  facts.r2 = { b3: control.b3, relayed: control.relayed, sealed: receipt7.facts.b3 };
  const r4 = local('r4');
  if (r4) facts.r4 = { from: 'core/phase7b/local/r4.json', ...r4, nodeShaNow: hex(sha256(new Uint8Array(execFileSync('git', ['show', 'HEAD:core/node.mjs'], { cwd: ROOT })))) };
  const r5 = local('r5');
  if (r5) facts.r5 = { from: 'core/phase7b/local/r5.json', where: r5.where, ...r5.facts };
  const html = readFileSync(join(CORE, 'phase7', 'index.html'), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const mods7b = readdirSync(HERE).filter((m) => m.endsWith('.mjs')).sort().map((m) => 'core/phase7b/' + m);
  const privacy = privacyOf(mods.bookings), hits = (t) => privacy.filter((p) => p.test(t)).map((p) => p.kind);
  const published = ['core/phase7/index.html', ...(existsSync(join(HERE, 'local')) ? readdirSync(join(HERE, 'local')).map((f) => 'core/phase7b/local/' + f) : [])];
  facts.r6 = { page: E.barredIn(text, claims6.barred, true), modules: Object.fromEntries(mods7b.map((p) => [p, E.barredIn(readFileSync(join(ROOT, p), 'utf8'), claims6.barred, false)])),
    privacy: Object.fromEntries(published.map((p) => [p, hits(readFileSync(join(ROOT, p), 'utf8'))])) };
  return { facts, hits };
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase7b/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
// what the receipt says about itself: every failure, in plain words
export const NOTES = Object.freeze([
  "R3 was first measured wrongly, and the reading is kept here. The first measure counted what each member adopted from the whole bundle the desk shares (which also carries the five antibodies it had relayed before), and took \"admits the genuine packet\" as the member's answer to the whole message: stay-a adopted 4 of that bundle (2 blocked), and its answer to the genuine packet was a refusal by its ledger handler, after its door, of the empty ledger inside. The sealed rule names one antibody and the door: so the measure was corrected to ask each member's door what it now does with the genuine packet itself (refused on sight, if the member adopted its antibody; through the door, if not).",
]);
export async function receiptText() {
  const { facts, hits } = await measure();
  const body = { kind: 'fall-kit.core.phase7b.receipt', v: 1, sealedIn: sealedIn(), nodes: PINS, notes: NOTES, facts };
  // the receipt is a published file too: R6 holds it to the privacy list, as the measure wrote it
  body.facts.r6.privacy['core/receipts/phase7b.json'] = hits(stable(body));
  const j = judge(claims, body.facts);
  return { text: stable({ ...body, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open }), j };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, j } = await receiptText();
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || Buffer.compare(readFileSync(OUT), Buffer.from(text)) !== 0) { console.error('the receipt differs from core/receipts/phase7b.json'); process.exit(1); }
    console.log('the receipt reproduced byte for byte');
  } else writeFileSync(OUT, text);
}
