#!/usr/bin/env node
// core/phase3b/measure.mjs — Phase 3b's measurement (core/phase3b/claims.json, sealed before this existed).
//
//   node core/phase3b/measure.mjs           run Phase 3's mesh scenario with both routings, judge, write core/receipts/phase3b.json
//   node core/phase3b/measure.mjs --check   run it again and exit 1 unless the receipt is the same, byte for byte
//
// The harness is Phase 3's (core/phase3/measure.mjs and cell.mjs): every node and relay its own operating-system
// process on local TCP, the driver telling each node what to do next and waiting for it, one step at a time, on fixed
// public test seeds and a fixed clock. The mesh scenario runs twice, the same in every step but for the routing the
// cells start with: 'shared' (this pass) and 'greedy' (Phase 3's, the control). With the routing that shares, an asker
// with a new note shares its notes with every other member before the next ask, and the probes those notes set off are
// given a moment to be answered and then given up; a deployed cell does both on a timer.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIdentity, hex } from '../identity.mjs';
import { makeRoster } from '../roster.mjs';
import { prepare, finish, KINDS, HEADER } from '../vendor/light/packet.mjs';
import { Proc, relay, carry, PORT, ROLES } from '../phase3/measure.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase3b.json');
const seed = (k) => new Uint8Array(32).fill(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ASKERS = Object.freeze(['a1', 'a2', 'a3', 'a4']), MEMBERS = Object.freeze(ROLES.map(([name]) => name));
const PROBE_MS = 300;
const badReceipt = { model: 'phase3/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) };

const cellOf = async (s, role, routing) => {
  const c = new Proc([join(CORE, 'phase3', 'cell.mjs'), String(s), role, PORT.A + ',' + PORT.B, routing]);
  const m = await c.ready;
  c.id = m.id; c.slot = m.slot; c.role = role;
  return c;
};
/** Two relays, the eight members (and any extra cells), the founder's roster read by every cell. */
async function mesh(routing, extra = []) {
  const relays = { A: await relay(PORT.A), B: await relay(PORT.B) };
  const cells = {};
  for (const [name, s, role] of [...ROLES, ...extra]) cells[name] = await cellOf(s, role, routing);
  await sleep(400);
  const founder = await makeIdentity(seed(80));
  const cards = [];
  for (const name of MEMBERS) cards.push((await cells[name].cmd('card')).card);
  const roster = (await makeRoster(founder, cards)).roster;
  for (const name of Object.keys(cells)) await cells[name].cmd('roster', { roster, founder: founder.id });   // an extra cell pins the members; no member pins it
  const nameOf = Object.fromEntries(Object.entries(cells).map(([name, c]) => [c.id, name]));
  return { cells, nameOf, stop: async () => { for (const p of [...Object.values(cells), ...Object.values(relays)]) if (p.alive) await p.kill(); } };
}
/** With the routing that shares: when an asker has a new note, it shares its notes with every live member, one at a time. */
async function spread(m, who, told) {
  const c = m.cells[who], last = (await c.cmd('notes')).last;
  if (last === (who in told ? told[who] : null)) return;
  told[who] = last;
  for (const name of MEMBERS) if (name !== who && m.cells[name].alive) await carry(c, m.cells[name], 'shareNotes', {});
  await sleep(PROBE_MS);   // a live holder answers its probe at once; what is still unanswered is given up
  for (const name of MEMBERS) if (m.cells[name].alive) await m.cells[name].cmd('expireProbes');
}

/** Phase 3's mesh scenario: 100 asks, the triage holder the asks go to killed, 40 triage asks more. */
export async function routeRun(routing) {
  const shared = routing === 'shared';
  const m = await mesh(routing), { cells, nameOf } = m, told = {};
  const asks = [];
  for (let i = 0; i < 100; i++) {
    const who = ASKERS[i % 4], skill = i % 5 === 4 ? 'echo' : 'triage';
    const r = await cells[who].cmd('ask', { skill, input: { spO2: 85 + (i % 15) }, wait: 4000 });
    asks.push({ i, who, skill, to: nameOf[r.to] || null, answered: r.answered === true, outcome: r.outcome });
    if (shared) await spread(m, who, told);
  }
  const count = (name) => asks.filter((a) => a.skill === 'triage' && a.to === name).length;
  const dead = ['h1', 'h2'].reduce((a, b) => (count(b) > count(a) ? b : a)), alive = dead === 'h1' ? 'h2' : 'h1';
  // the asks really are going to the node that dies: each asker's last triage ask before the kill, kept
  const beforeKill = ASKERS.map((a) => ({ asker: a, to: asks.filter((x) => x.who === a && x.skill === 'triage').pop().to }));
  await cells[dead].kill();
  const after = [];
  for (let i = 0; i < 40; i++) {
    const who = ASKERS[i % 4];
    const r = await cells[who].cmd('ask', { skill: 'triage', input: { spO2: 88 }, wait: 800 });
    if (!r.answered) await cells[who].cmd('expire', { id: r.id });
    after.push({ i, who, to: nameOf[r.to] || null, answered: r.answered === true });
    if (shared) await spread(m, who, told);
  }
  const ids = MEMBERS.map((name) => cells[name].id), links = [];
  for (const a of ASKERS) { const w = (await cells[a].cmd('routing', { peers: ids })).weights; links.push({ asker: a, honest: w[cells[alive].id], liar: w[cells.liar.id] }); }
  await m.stop();
  return { asks, after, dead, alive, beforeKill, links };
}

/** W4: false notes from a pinned member, and notes from a stranger, then the mesh at work. */
export async function noteRun() {
  const m = await mesh('shared', [['stranger', 99, 'asker']]), { cells, nameOf } = m, told = {};
  for (let i = 0; i < 12; i++) {   // every asker tries every holder: three triage asks each
    const who = ASKERS[i % 4];
    await cells[who].cmd('ask', { skill: 'triage', input: { spO2: 85 + i }, wait: 4000 });
    await spread(m, who, told);
  }
  // the dishonest member asks an honest holder itself, so it holds a real signed answer of that holder's, to itself
  const own = await cells.liar.cmd('ask', { skill: 'triage', input: { spO2: 90 }, wait: 4000 });
  const H = nameOf[own.to], other = H === 'h1' ? 'h2' : 'h1';
  const got = (await cells.liar.cmd('captureIn', { t: 'answer' })).got.filter((x) => x.id === own.id && x.ok);
  const answerHex = got[0].hex;
  const links = async () => {
    const all = {};
    for (const name of MEMBERS) {
      const ids = MEMBERS.filter((x) => x !== name).map((x) => cells[x].id), s = await cells[name].cmd('state', { peers: ids });
      for (const id of ids) for (const skill of ['triage', 'echo']) all[name + '>' + skill + ':' + id] = s.weights[skill + ':' + id];
    }
    return all;
  };
  const before = await links();
  // the false notes, as the dishonest member's own software can write them (its key, a counter of its choosing)
  const liar = await makeIdentity(seed(83)), stranger = await makeIdentity(seed(99));
  const signed = async (who, value, counter, sender = who.slot) => {
    const p = prepare({ sender, counter: BigInt(counter), kind: KINDS.JSON, value, dictId: 0 });
    return hex(finish(p.unsigned, await who.sign(p.signed)).bytes);
  };
  const at = (HEADER + 6) * 2, changed = answerHex.slice(0, at) + (answerHex[at] === '0' ? '1' : '0') + answerHex.slice(at + 1);
  const forged = await signed(liar, { t: 'answer', id: own.id, skill: 'triage', answer: { verdict: 'VERIFIED', label: 1, receipt: badReceipt }, to: liar.id }, 7, cells[H].slot);
  const lied = (holder, packet) => ({ kind: 'lied', holder: cells[holder].id, skill: 'triage', job: own.id, packet });
  const silence = { sent: 0, quiet: 0, answered: 0, quietAfter: 0 }, falseLied = { sent: 0, refused: 0, already: 0, adopted: 0, why: {} }, strangers = { sent: 0, refusedAtDoor: 0, stages: {} };
  for (const [k, a] of ASKERS.entries()) {
    const target = cells[a];
    const notes = [{ kind: 'silent', holder: cells[H].id, skill: 'triage', job: 'ask:' + liar.id.slice(0, 8) + ':' + (900 + k) }, lied(H, answerHex), lied(H, changed), lied(H, forged), lied(other, answerHex)];
    const bytes = await signed(liar, { t: 'notes', notes, to: target.id }, 1000000 + k);
    const was = (await target.cmd('heardCount')).count;
    await cells.liar.cmd('raw', { to: target.id, hex: bytes });
    await target.cmd('heardCount', { atLeast: was + 2, wait: 3000 });   // the notes, then the holder's answer to the probe they set off
    const heard = (await target.cmd('heardSince', { from: was })).heard;
    const took = heard.find((h) => h.t === 'notes');
    silence.sent++; falseLied.sent += notes.length - 1;
    silence.quiet += took ? took.notes.quiet : 0;
    silence.answered += heard.filter((h) => h.t === 'pong' && h.ok && h.from === cells[H].id).length;
    const adopted = took ? took.adopted : 0, refused = took ? took.notes.refused : [];
    falseLied.adopted += adopted;
    for (const why of refused) { falseLied.refused++; falseLied.why[why] = (falseLied.why[why] || 0) + 1; }
    falseLied.already += took ? notes.length - 1 - refused.length - adopted : 0;   // a lied note is counted, refused, or answered "already judged"
    const from = await signed(stranger, { t: 'notes', notes: [notes[0]], to: target.id }, 1 + k);
    const r = await carry(cells.stranger, target, 'raw', { hex: from });
    strangers.sent++;
    for (const h of r.heard) if (!h.ok && h.stage !== 'message') { strangers.refusedAtDoor++; strangers.stages[h.stage] = (strangers.stages[h.stage] || 0) + 1; }
  }
  await sleep(PROBE_MS);
  for (const a of ASKERS) { const q = await cells[a].cmd('routing', { peers: [cells[H].id] }); if (q.quiet['triage:' + cells[H].id] || q.probing > 0) silence.quietAfter++; }
  const afterLinks = await links();
  const keys = Object.keys(before);
  const next = { asks: 0, toHonest: 0, answered: 0 };
  for (const a of ASKERS) {
    const r = await cells[a].cmd('ask', { skill: 'triage', input: { spO2: 88 }, wait: 4000 });
    next.asks++;
    if (nameOf[r.to] === 'h1' || nameOf[r.to] === 'h2') next.toHonest++;
    if (r.answered) next.answered++;
  }
  await m.stop();
  return { askers: ASKERS.length, holder: H, silence, lied: falseLied, stranger: strangers, linksCompared: keys.length, linksChanged: keys.filter((k) => before[k] !== afterLinks[k]).length, next };
}

/** J3's facts, from one run. */
export function routedAround(run) {
  const toDead = run.after.filter((a) => a.to === run.dead), last = Math.max(-1, ...toDead.map((a) => a.i));
  return { killed: run.dead, askers: ASKERS.length, asks: run.after.length, toDead: toDead.length, lastToDead: last,
    answeredAfterLastDead: run.after.filter((a) => a.i > last).every((a) => a.answered && a.to !== run.dead), beforeKill: run.beforeKill };
}

export async function measure() {
  const s = await routeRun('shared'), g = await routeRun('greedy'), w4 = await noteRun();
  const holds = { triage: ['h1', 'h2', 'liar'], echo: ['scribe'] };
  const after20 = s.asks.filter((a) => a.skill === 'triage' && a.i >= 20);
  return {
    passes: [1],
    w1: { ...routedAround(s), control: routedAround(g) },
    w2: { links: s.links, control: g.links },
    w3: {
      asks: s.asks.length, toHolder: s.asks.filter((a) => holds[a.skill].includes(a.to)).length, answered: s.asks.filter((a) => a.answered).length,
      liarAsks: ASKERS.map((who) => { const xs = s.asks.filter((a) => a.who === who && a.to === 'liar'); return { asker: who, asks: xs.length, firstAt: xs.length > 0 ? xs[0].i : -1 }; }),
      triageAfter20: after20.length, toHonestAfter20: after20.filter((a) => a.to === 'h1' || a.to === 'h2').length,
      controlLiarAsks: g.asks.filter((a) => a.to === 'liar').length,
    },
    w4,
  };
}

const sealedIn = () => execFileSync('git', ['-C', ROOT, 'log', '--diff-filter=A', '--format=%H', '--', 'core/phase3b/claims.json'], { encoding: 'utf8' }).trim().split('\n').pop();
const stable = (x) => JSON.stringify(x, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const facts = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase3b.receipt', v: 1, sealedIn: sealedIn(), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  const text = stable(receipt);
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* none yet */ }
    console.log(committed === text ? 'PHASE 3b RECEIPT REPRODUCED byte for byte' : 'PHASE 3b RECEIPT DIFFERS from the committed one');
    process.exit(committed === text ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log('wrote core/receipts/phase3b.json');
}
