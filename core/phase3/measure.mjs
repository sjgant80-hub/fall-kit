#!/usr/bin/env node
// core/phase3/measure.mjs — Phase 3's measurement (core/phase3/claims.json, sealed before this existed).
//
//   node core/phase3/measure.mjs           run the mesh, judge the passes that are built, write core/receipts/phase3.json
//   node core/phase3/measure.mjs --check   run it again and exit 1 unless the receipt is the same, byte for byte
//
// Every node and every relay is its own operating-system process (cell.mjs, relay-server.mjs) and they exchange only
// bytes over local TCP. The driver here only tells each node what to do next and waits for it to finish, one step at a
// time, so the run is the same on every machine: fixed public test seeds, a fixed clock, and no step racing another.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIdentity } from '../identity.mjs';
import { createNode } from '../node.mjs';
import { makeRoster } from '../roster.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase3.json');
// pass 5 runs in two browser tabs, not here: what they measured is committed in local/x1.json and judged like the rest
const X1F = join(HERE, 'local', 'x1.json'), X1 = existsSync(X1F) ? JSON.parse(readFileSync(X1F, 'utf8')) : null;
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const seed = (n) => new Uint8Array(32).fill(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ROLES = Object.freeze([['h1', 81, 'honest'], ['h2', 82, 'honest'], ['liar', 83, 'liar'], ['scribe', 84, 'scribe'], ['a1', 85, 'asker'], ['a2', 86, 'asker'], ['a3', 87, 'asker'], ['a4', 88, 'asker']]);
const PORT = Object.freeze({ A: 47301, B: 47302, F: 47303 });

class Proc {
  constructor(args) {
    this.p = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    this.n = 0; this.wait = new Map(); this.buf = ''; this.alive = true;
    this.ready = new Promise((res) => { this.onReady = res; });
    this.p.stdout.on('data', (d) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.ready) this.onReady(m);
        else if (m.stats && this.wait.has('stats')) { this.wait.get('stats')(m.stats); this.wait.delete('stats'); }
        else if (this.wait.has(m.n)) { this.wait.get(m.n)(m); this.wait.delete(m.n); }
      }
    });
    this.p.on('exit', () => { this.alive = false; });
  }
  cmd(op, args = {}) { const n = ++this.n; return new Promise((res) => { this.wait.set(n, ({ n: _, ...m }) => res(m)); this.p.stdin.write(JSON.stringify({ n, op, ...args }) + '\n'); }); }
  stats() { return new Promise((res) => { this.wait.set('stats', res); this.p.stdin.write('stats\n'); }); }
  async kill() { this.p.kill('SIGKILL'); while (this.alive) await sleep(20); }
}
/** After a relay dies, wait until no node still thinks it is up, so no step writes to a dead socket. */
async function awaitDown(cells, port) {
  for (const c of cells) for (let i = 0; i < 100; i++) { const l = await c.cmd('links'); if (!l.up.includes(port)) break; await sleep(20); }
}
const relay = async (port, repeat) => { const r = new Proc([join(CORE, 'relay-server.mjs'), String(port), ...(repeat ? ['--repeat', String(repeat)] : [])]); await r.ready; return r; };
const cell = async (s, role, ports) => { const c = new Proc([join(HERE, 'cell.mjs'), String(s), role, ports.join(',')]); const m = await c.ready; c.id = m.id; c.role = role; return c; };

/** The mesh scenario: roster, 100 asks (relay A killed halfway when told), a holder killed, 40 asks more. */
export async function meshRun(killRelay) {
  const relays = { A: await relay(PORT.A), B: await relay(PORT.B) };
  const cells = {};
  for (const [name, s, role] of ROLES) cells[name] = await cell(s, role, [PORT.A, PORT.B]);
  await sleep(400);
  const founder = await makeIdentity(seed(80)), forger = await makeIdentity(seed(90));
  const cards = [];
  for (const [name] of ROLES) cards.push((await cells[name].cmd('card')).card);
  const roster = (await makeRoster(founder, cards)).roster;
  const strangerNode = await createNode({ name: 'stranger', identity: await makeIdentity(seed(89)), clock: CLOCK });
  const badRoster = (await makeRoster(forger, cards)).roster;
  const j1 = { pinned: [], strangerRefused: 0, badRosterRefused: 0 };
  for (const [name] of ROLES) {
    const bad = await cells[name].cmd('roster', { roster: { ...badRoster, founder: founder.id }, founder: founder.id });
    if (bad.ok === false) j1.badRosterRefused++;
    j1.pinned.push((await cells[name].cmd('roster', { roster, founder: founder.id })).pinned);
    const off = await cells[name].cmd('offer', { card: strangerNode.card() });
    if (off.pinned === false) j1.strangerRefused++;
  }
  const holders = { triage: ['h1', 'h2', 'liar'], echo: ['scribe'] };
  const nameOf = Object.fromEntries(ROLES.map(([name]) => [cells[name].id, name]));
  const askers = ['a1', 'a2', 'a3', 'a4'];
  const asks = [];
  for (let i = 0; i < 100; i++) {
    if (killRelay && i === 50) { await relays.A.kill(); await awaitDown(Object.values(cells), PORT.A); }
    const who = askers[i % 4], skill = i % 5 === 4 ? 'echo' : 'triage';
    const r = await cells[who].cmd('ask', { skill, input: { spO2: 85 + (i % 15) }, wait: 4000 });
    asks.push({ i, who, skill, to: nameOf[r.to] || null, answered: r.answered === true, outcome: r.outcome });
  }
  await sleep(200);
  const relayStats = { B: await relays.B.stats(), A: relays.A.alive ? await relays.A.stats() : null };
  let heardRound1 = 0;
  for (const [name] of ROLES) heardRound1 += (await cells[name].cmd('heard')).heard.length;
  // J3: the holder the triage asks are going to dies; the askers carry on, giving up on what is not answered. (The first
  // build of this run killed h1, which no ask was going to, so J3 could not fail: corrected before the receipt was kept.)
  const count = (n) => asks.filter((a) => a.skill === 'triage' && a.to === n).length;
  const dead = ['h1', 'h2'].reduce((a, b) => (count(b) > count(a) ? b : a));
  const alive = dead === 'h1' ? 'h2' : 'h1';
  await cells[dead].kill();
  const after = [];
  for (let i = 0; i < 40; i++) {
    const who = askers[i % 4];
    const r = await cells[who].cmd('ask', { skill: 'triage', input: { spO2: 88 }, wait: 800 });
    if (!r.answered) await cells[who].cmd('expire', { id: r.id });
    after.push({ i, who, to: nameOf[r.to] || null, answered: r.answered === true });
  }
  const peerIds = ROLES.map(([name]) => cells[name].id);
  const states = {};
  for (const [name] of ROLES) if (name !== dead) states[name] = await cells[name].cmd('state', { peers: peerIds });
  for (const [name] of ROLES) if (cells[name].alive) await cells[name].kill();
  for (const r of Object.values(relays)) if (r.alive) await r.kill();
  const weightsAt = (name, peer) => states[name].weights['triage:' + cells[peer].id];
  return { j1, asks, after, relayStats, states, heardRound1, dead, honestVsLiar: askers.map((a) => ({ asker: a, honest: weightsAt(a, alive), liar: weightsAt(a, 'liar') })) };
}

/** R3: a node away behind a relay that delivers what it held twice. */
async function awayRun() {
  const F = await relay(PORT.F, 2);
  const s = await cell(91, 'asker', [PORT.F]), r = await cell(92, 'honest', [PORT.F]);
  await sleep(300);
  const founder = await makeIdentity(seed(80));
  const roster = (await makeRoster(founder, [(await s.cmd('card')).card, (await r.cmd('card')).card])).roster;
  await s.cmd('roster', { roster, founder: founder.id }); await r.cmd('roster', { roster, founder: founder.id });
  await r.cmd('drop');
  await sleep(100);
  const sent = [];
  for (let i = 0; i < 5; i++) sent.push(await s.cmd('ask', { skill: 'triage', input: { spO2: 80 + i }, wait: 150 }));
  await r.cmd('reconnect');
  await sleep(800);
  const heard = (await r.cmd('heard')).heard;
  const answeredLate = (await s.cmd('heard')).heard.filter((h) => h.t === 'answer' && h.ok).length;
  const st = await F.stats();
  for (const p of [s, r, F]) await p.kill();
  return { sentWhileAway: sent.length, queuedAtRelay: st.queued, lateDelivered: st.lateDelivered, admitted: heard.filter((h) => h.t === 'ask' && h.ok).length,
    refusedAtCounter: heard.filter((h) => h.stage === 'counter').length, other: heard.filter((h) => !(h.t === 'ask' && h.ok) && h.stage !== 'counter').length, answeredLate };
}

const rng = (seed0) => { let x = seed0; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
async function startMesh(extra = []) {
  const relays = { A: await relay(PORT.A), B: await relay(PORT.B) };
  const cells = {};
  for (const [name, s, role] of [...ROLES, ...extra]) cells[name] = await cell(s, role, [PORT.A, PORT.B]);
  await sleep(400);
  const founder = await makeIdentity(seed(80));
  const cards = [];
  for (const [name] of ROLES) cards.push((await cells[name].cmd('card')).card);
  const roster = (await makeRoster(founder, cards)).roster;
  for (const name of Object.keys(cells)) await cells[name].cmd('roster', { roster, founder: founder.id });   // the hostile ones pin the members too; no member pins them
  return { relays, cells, stop: async () => { for (const p of [...Object.values(cells), ...Object.values(relays)]) if (p.alive) await p.kill(); } };
}
/** Send, then wait until the node it was for has heard it: one step at a time. → what was sent, and what it heard. */
async function carry(from, toCell, op, args) {
  const before = (await toCell.cmd('heardCount')).count;
  const r = await from.cmd(op, { to: toCell.id, ...args });
  if (r.sent) await toCell.cmd('heardCount', { atLeast: before + 1, wait: 3000 });
  return { ...r, heard: r.sent ? (await toCell.cmd('heardSince', { from: before })).heard : [] };
}
/** A tally of what the doors heard, by kind of packet sent. */
const tally = () => ({ sent: 0, heard: 0, admitted: 0, decoded: 0, recognised: 0, variantNamed: 0, stages: {} });
function count(t, r) {
  t.sent++;
  for (const h of r.heard) {
    t.heard++;
    if (h.ok) t.admitted++;
    if (h.decoded) t.decoded++;
    if (h.recognised) t.recognised++;
    if (h.variant !== null) t.variantNamed++;
    const k = h.recognised ? 'recognised' : h.stage || 'admitted';
    t.stages[k] = (t.stages[k] || 0) + 1;
  }
}

/** S1–S2: every member writes; the documents synced in three shuffled orders, a relay killed in one. */
async function syncRun() {
  const m = await startMesh([['stranger', 99, 'asker']]);
  const names = ROLES.map(([n]) => n);
  for (const [i, name] of names.entries()) for (const doc of ['s1', 's2', 's3']) {
    await m.cells[name].cmd('set', { doc, key: 'own-' + name, value: name });
    await m.cells[name].cmd('set', { doc, key: 'shared', value: name });
    await m.cells[name].cmd('set', { doc, key: 'count', value: i });
  }
  const pairs = [];
  for (const a of names) for (const b of names) if (a !== b) pairs.push([a, b]);
  for (const [k, doc] of ['s1', 's2', 's3'].entries()) {
    const r = rng(k + 1), order = pairs.map((p) => [r(), p]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    for (const [j, [a, b]] of order.entries()) {
      if (doc === 's2' && j === Math.floor(order.length / 2)) { await m.relays.A.kill(); await awaitDown(Object.values(m.cells), PORT.A); }
      await carry(m.cells[a], m.cells[b], 'sync', { doc });
    }
  }
  const states = {};
  for (const name of names) states[name] = await m.cells[name].cmd('state', { peers: [] });
  const digests = Object.fromEntries(['s1', 's2', 's3'].map((d) => [d, names.map((n) => states[n].docs[d])]));
  const sizes = Object.fromEntries(['s1', 's2', 's3'].map((d) => [d, names.map((n) => states[n].sizes[d])]));
  // S2: a stranger's syncs, a forged one in a member's name, and changed copies of real ones change nothing
  const beforeMesh = names.map((n) => states[n].docs.mesh);
  for (const name of names) await m.cells[name].cmd('heard');
  const real = (await m.cells.a1.cmd('capture', { k: 8 })).sent;
  const kinds = { stranger: tally(), forged: tally(), changed: tally() };
  for (const [i, name] of names.entries()) {
    const target = m.cells[name];
    count(kinds.stranger, await carry(m.cells.stranger, target, 'sync', { doc: 'mesh' }));
    count(kinds.forged, await carry(m.cells.stranger, target, 'forge', { slot: target === m.cells.a2 ? (await m.cells.a1.ready).slot : (await m.cells.a2.ready).slot, k: 1 }));
    const x = real[i % real.length], at = 60 + 2 * i, b = x.hex.slice(0, at) + (x.hex[at] === '0' ? '1' : '0') + x.hex.slice(at + 1);
    count(kinds.changed, await carry(m.cells.stranger, target, 'raw', { hex: b }));
  }
  for (const name of names) await m.cells[name].cmd('heard');
  const after = [];
  for (const name of names) after.push((await m.cells[name].cmd('state', { peers: [] })).docs.mesh);
  await m.stop();
  return {
    s1: { nodes: names.length, writesEach: 3, digests, sizes, relayKilledIn: 's2', syncsPerOrder: pairs.length },
    s2: { kinds, mapsChanged: after.filter((d, i) => d !== beforeMesh[i]).length },
  };
}

/** H1–H3: herd immunity, a crowd of sixteen hostile nodes, and then the mesh at work as before. */
async function immuneRun() {
  const hostileRoles = Array.from({ length: 16 }, (_, i) => ['x' + i, 100 + i, 'asker']);
  const m = await startMesh(hostileRoles);
  const names = ROLES.map(([n]) => n), members = names.map((n) => m.cells[n]);
  const slotOf = {};
  for (const n of names) slotOf[n] = (await m.cells[n].cmd('card')).card.slot;
  for (const c of members) await c.cmd('heard');
  // H1: one forged packet refused at a1; a1 shares what it learned with the other seven; the same bytes then at all eight
  const first = (await carry(m.cells.x0, m.cells.a1, 'forge', { slot: slotOf.h1, k: 0 })).heard[0] || null;
  const bytes = (await m.cells.x0.cmd('capture', { k: 1 })).sent[0].hex;
  let adopted = 0;
  for (const n of names) if (n !== 'a1') {
    const r = await carry(m.cells.a1, m.cells[n], 'shareAntibodies', {});
    if (r.heard.some((x) => x.t === 'antibody' && x.ok && x.adopted > 0)) adopted++;
  }
  const onSight = tally();
  for (const c of members) count(onSight, await carry(m.cells.x0, c, 'raw', { hex: bytes }));
  for (const c of members) await c.cmd('heard');
  // H2: sixteen hostile nodes, each sending every kind of packet the door refuses, and variants of a forged one
  const real = [];
  for (const n of ['a2', 'a3']) { await carry(m.cells[n], m.cells.h2, 'sync', { doc: 'mesh' }); real.push(...(await m.cells[n].cmd('capture', { k: 1 })).sent.map((x) => ({ ...x, by: n }))); }
  for (const c of members) await c.cmd('heard');
  const crowd = { unpinned: tally(), forged: tally(), junk: tally(), replayed: tally(), changed: tally() };
  for (const [hi, [hn]] of hostileRoles.entries()) {
    const x = m.cells[hn];
    for (const n of names) {
      const t = m.cells[n];
      count(crowd.unpinned, await carry(x, t, 'sync', { doc: 'mesh' }));                                         // signed by a key nobody pinned
      count(crowd.forged, await carry(x, t, 'forge', { slot: slotOf[n === 'h1' ? 'h2' : 'h1'], k: hi + 1, value: 'v' + hi }));   // a variant of the forged family H1 taught
      count(crowd.junk, await carry(x, t, 'junk', { size: 120 + hi }));
      const r = real[(hi + n.length) % real.length];
      if (r.to === t.id) count(crowd.replayed, await carry(x, t, 'raw', { hex: r.hex }));                         // a real packet again, to the node it was for
      const at = 2 * (8 + ((hi * 8 + n.length) % 40)), flip = r.hex.slice(0, at) + (r.hex[at] === 'a' ? 'b' : 'a') + r.hex.slice(at + 1);
      count(crowd.changed, await carry(x, t, 'raw', { hex: flip }));                                              // a real packet with one byte changed
    }
  }
  for (const c of members) await c.cmd('heard');
  // H3: the mesh at work, after all the learning
  const asks = [];
  for (let i = 0; i < 100; i++) {
    const who = ['a1', 'a2', 'a3', 'a4'][i % 4], skill = i % 5 === 4 ? 'echo' : 'triage';
    asks.push(await m.cells[who].cmd('ask', { skill, input: { spO2: 85 + (i % 15) }, wait: 4000 }));
  }
  const work = [];
  for (const c of members) work.push(...(await c.cmd('heard')).heard);
  await m.stop();
  return {
    h1: { members: names.length, firstRefusedAt: first ? first.stage : null, sharedTo: names.length - 1, adopted, onSight },
    h2: { hostile: hostileRoles.length, members: names.length, kinds: crowd },
    h3: { asks: asks.length, answered: asks.filter((a) => a.answered).length, heard: work.length, admitted: work.filter((h) => h.ok).length, recognised: work.filter((h) => h.recognised).length },
  };
}

function relayImports() {
  const src = readFileSync(join(CORE, 'relay.mjs'), 'utf8');
  return { imports: [...src.matchAll(/^import /gm)].length, dynamic: /\bimport\s*\(/.test(src) };
}

export async function measure() {
  const plain = await meshRun(false), killed = await meshRun(true), away = await awayRun(), sync = await syncRun(), immune = await immuneRun();
  // R2: the run with relay A killed halfway against the run where nothing was killed — every node's state, the same
  const sameStates = Object.keys(plain.states).every((k) => JSON.stringify(plain.states[k]) === JSON.stringify(killed.states[k]));
  const triageAfter20 = plain.asks.filter((a) => a.skill === 'triage' && a.i >= 20);
  const facts = {
    passes: X1 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4],
    r1: { relay: relayImports(), heard: plain.heardRound1, delivered: (plain.relayStats.A ? plain.relayStats.A.delivered : 0) + plain.relayStats.B.delivered,
      waiting: (plain.relayStats.A ? plain.relayStats.A.waiting : 0) + plain.relayStats.B.waiting, dropped: (plain.relayStats.A ? plain.relayStats.A.dropped : 0) + plain.relayStats.B.dropped },
    r2: { asksAfterKill: killed.asks.filter((a) => a.i >= 50).length, answeredAfterKill: killed.asks.filter((a) => a.i >= 50 && a.answered).length, sameStates, relayAKilled: killed.relayStats.A === null },
    r3: away,
    j1: plain.j1,
    j2: { asks: plain.asks.length, toHolder: plain.asks.filter((a) => ({ triage: ['h1', 'h2', 'liar'], echo: ['scribe'] })[a.skill].includes(a.to)).length, answered: plain.asks.filter((a) => a.answered).length,
      triageAfter20: triageAfter20.length, toHonestAfter20: triageAfter20.filter((a) => a.to === 'h1' || a.to === 'h2').length },
    j3: { killed: plain.dead, askers: 4, asks: plain.after.length, toDead: plain.after.filter((a) => a.to === plain.dead).length, lastToDead: Math.max(-1, ...plain.after.filter((a) => a.to === plain.dead).map((a) => a.i)),
      answeredAfterLastDead: plain.after.filter((a) => a.i > Math.max(-1, ...plain.after.filter((x) => x.to === plain.dead).map((x) => x.i))).every((a) => a.answered && a.to !== plain.dead) },
    j4: { links: plain.honestVsLiar },
    s1: sync.s1, s2: sync.s2, h1: immune.h1, h2: immune.h2, h3: immune.h3,
    x1: X1 ? { from: 'core/phase3/local/x1.json', where: X1.where, tabs: X1.tabs } : { from: 'core/phase3/local/x1.json', missing: true },
  };
  return facts;
}

const sealedIn = () => execFileSync('git', ['-C', ROOT, 'log', '--diff-filter=A', '--format=%H', '--', 'core/phase3/claims.json'], { encoding: 'utf8' }).trim().split('\n').pop();
const stable = (x) => JSON.stringify(x, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const facts = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase3.receipt', v: 1, sealedIn: sealedIn(), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  const text = stable(receipt);
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* none yet */ }
    console.log(committed === text ? 'PHASE 3 RECEIPT REPRODUCED byte for byte' : 'PHASE 3 RECEIPT DIFFERS from the committed one');
    process.exit(committed === text ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log('wrote core/receipts/phase3.json');
}
