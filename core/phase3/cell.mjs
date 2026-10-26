#!/usr/bin/env node
// core/phase3/cell.mjs — one foundation node as its own operating-system process, on the mesh's relays (glue).
//
//   node core/phase3/cell.mjs <seed> <role> <relays, comma-separated: a port on this machine, or host:port> [routing]
//
// role: honest | liar | scribe | asker — honest and liar both offer triage (the liar's receipts do not check), the
// scribe offers echo, an asker offers nothing. The node connects to every relay it is given and says hello on each, so
// what is sent to it arrives through whichever relay the sender used; it sends through the first relay that is up, so a
// relay that dies costs nothing but a reconnect. Driven by one JSON line per command on stdin ({ n, op, ... }); it
// answers each with one JSON line ({ n, ... }) on stdout. Every identity is a fixed public test seed and the clock is
// fixed, so two runs of a scenario build the same bytes. routing is 'greedy' unless it is given as 'shared': Phase 3
// measured the greedy routing, so its cells keep it by name; Phase 3b's measurement asks for the routing that shares.
import { connect } from 'node:net';
import { createNode, stableJson } from '../node.mjs';
import { makeIdentity, hex, unhex } from '../identity.mjs';
import { readRoster, onRoster, rosterChanges } from '../roster.mjs';
import { frameOf, createReader, KIND } from '../relay.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { prepare, finish, KINDS } from '../vendor/light/packet.mjs';

const [seedArg, role, portsArg, routingArg] = process.argv.slice(2);
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const rehash = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));
const honest = (domain) => async (input) => {
  const core = { model: 'phase3/1', domain, label: input && typeof input === 'object' && input.spO2 < 92 ? 1 : 0, verdict: 'VERIFIED' };
  return { verdict: 'VERIFIED', label: core.label, receipt: { ...core, receiptHash: rehash(core) } };
};
const liar = async () => ({ verdict: 'VERIFIED', label: 1, receipt: { model: 'phase3/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) } });
const skills = role === 'honest' ? { triage: honest('triage') } : role === 'liar' ? { triage: liar } : role === 'scribe' ? { echo: honest('echo') } : {};

const me = await makeIdentity(new Uint8Array(32).fill(Number(seedArg)));
const node = await createNode({ name: role + '-' + seedArg, identity: me, skills, clock: CLOCK, docs: ['mesh', 's1', 's2', 's3'], budget: 5000, routing: routingArg === 'shared' ? 'shared' : 'greedy' });
// a relay on this machine by its port, or on another device by host:port (the owner's door to a second device)
const relays = String(portsArg || '').split(',').filter(Boolean).map((x) => (x.includes(':') ? { host: x.slice(0, x.lastIndexOf(':')), port: Number(x.slice(x.lastIndexOf(':') + 1)) } : { host: '127.0.0.1', port: Number(x) }));
const ports = relays.map((x) => x.port), hostOf = new Map(relays.map((x) => [x.port, x.host]));
let roster = null;
const heard = [], waiting = new Map(), socks = new Map(), sentLog = [], inLog = [];
const out = (x) => process.stdout.write(JSON.stringify(x) + '\n');

function link(port) {
  const sock = connect(port, hostOf.get(port) || '127.0.0.1');
  const reader = createReader();
  sock.on('connect', () => { socks.set(port, sock); sock.write(frameOf(KIND.HELLO, me.raw)); });
  sock.on('data', async (chunk) => {
    const r = reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    if (!r.ok) return;
    for (const f of r.frames) if (f.kind === KIND.DELIVER) await onBytes(f.bytes);
  });
  sock.on('close', () => { if (socks.get(port) === sock) socks.delete(port); });
  sock.on('error', () => {});
}
function send(to, bytes) {
  sentLog.push({ to, hex: hex(bytes) });
  if (sentLog.length > 64) sentLog.shift();
  for (const p of ports) { const s = socks.get(p); if (s && !s.destroyed) { s.write(frameOf(KIND.SEND, unhex(to), bytes)); return true; } }
  return false;
}
// a seeded generator, for junk that is the same bytes on every run
let rs = Number(seedArg) * 7919 + 1;
const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
async function onBytes(bytes) {
  const r = await node.hear(bytes);
  heard.push({ ok: r.ok === true, t: r.t || null, stage: r.stage || null, decoded: r.decoded === true || r.ok === true, recognised: r.recognised === true, variant: r.variantOf || null, from: r.from || null, adopted: Number.isInteger(r.adopted) ? r.adopted : null,
    ...(r.t === 'notes' ? { notes: { quiet: r.quiet, already: r.already, refused: r.refused } } : {}) });
  inLog.push({ hex: hex(bytes), t: r.t || null, id: r.id || null, from: r.from || null, ok: r.ok === true });   // what this node received, for a hostile node to reuse
  if (inLog.length > 64) inLog.shift();
  for (const rep of r.replies || []) send(rep.to, rep.bytes);
  if (r.t === 'answer' && waiting.has(r.id)) { waiting.get(r.id)(r); waiting.delete(r.id); }
}
const allSkills = ['triage', 'echo'];

async function run(c) {
  if (c.op === 'card') return { card: node.card() };
  if (c.op === 'roster') {
    const read = await readRoster(c.roster, c.founder);
    if (!read.ok) return { ok: false, why: read.why };
    roster = read;
    const ch = rosterChanges(read, node.pinned(), me.id);
    let pinned = 0;
    for (const card of ch.pin) if ((await node.pin(card)).ok) pinned++;
    for (const id of ch.unpin) node.unpin(id);
    return { ok: true, pinned, unpinned: ch.unpin.length };
  }
  if (c.op === 'offer') {
    if (!onRoster(roster, c.card)) return { pinned: false, why: 'not on the roster' };
    return { pinned: (await node.pin(c.card)).ok };
  }
  if (c.op === 'ask') {
    const a = await node.ask(c.skill, c.input);
    if (!a.ok) return { ok: false, why: a.why };
    const done = new Promise((res) => { waiting.set(a.id, res); setTimeout(() => { if (waiting.has(a.id)) { waiting.delete(a.id); res(null); } }, c.wait || 3000); });
    const sent = send(a.to, a.bytes);
    const r = await done;
    return { ok: true, id: a.id, to: a.to, sent, answered: r !== null, outcome: r ? r.outcome : null, recorded: r ? r.recorded === true : false };
  }
  if (c.op === 'expire') return node.expire(c.id);
  if (c.op === 'set') return node.setShared(c.doc, c.key, c.value);
  if (c.op === 'sync') { const b = await node.shareSync(c.to, c.doc); return { sent: b !== null && send(c.to, b) }; }
  if (c.op === 'shareAntibodies') { const b = await node.shareAntibodies(c.to); return { sent: b !== null && send(c.to, b) }; }
  if (c.op === 'state') {
    const weights = {};
    for (const skill of allSkills) for (const id of c.peers || []) weights[skill + ':' + id] = node.weight(id, skill);
    const docs = {}, sizes = {};
    for (const d of ['mesh', 's1', 's2', 's3']) { docs[d] = hex(sha256(new TextEncoder().encode(stableJson(node.sharedDoc(d).entries)))); sizes[d] = Object.keys(node.shared(d)).length; }
    return { stats: node.stats(), credits: node.credits(), weights, docs, sizes, pending: node.pending(), antigens: node.antigens().length };
  }
  // ── what Phase 3b's routing adds: notes shared, probes given up, and who is quiet or tried here ──
  if (c.op === 'notes') { const ns = node.notes(); return { count: ns.length, last: ns.length > 0 ? ns[ns.length - 1].job : null }; }
  if (c.op === 'shareNotes') { const b = await node.shareNotes(c.to); return { sent: b !== null && send(c.to, b) }; }
  if (c.op === 'expireProbes') return { expired: node.probing().map((id) => node.expire(id)) };
  if (c.op === 'routing') {
    const quiet = {}, tried = {};
    for (const skill of allSkills) for (const id of c.peers || []) { quiet[skill + ':' + id] = node.quiet(id, skill); tried[skill + ':' + id] = node.tried(id, skill); }
    return { routing: node.routing, quiet, tried, probing: node.probing().length, weights: Object.fromEntries((c.peers || []).map((id) => [id, node.weight(id, 'triage')])) };
  }
  if (c.op === 'captureIn') return { got: inLog.filter((x) => !c.t || x.t === c.t) };
  if (c.op === 'heard') return { heard: heard.splice(0) };
  if (c.op === 'heardSince') return { heard: heard.slice(c.from || 0) };
  if (c.op === 'heardCount') { const until = Date.now() + (c.wait || 0); while (heard.length < (c.atLeast || 0) && Date.now() < until) await new Promise((r) => setTimeout(r, 5)); return { count: heard.length }; }
  // ── what a hostile node does (pass 4): send what no pinned key signed, and copies of what one did ──
  if (c.op === 'capture') return { sent: sentLog.slice(-(c.k || 8)) };
  if (c.op === 'raw') return { sent: send(c.to, unhex(c.hex)) };
  if (c.op === 'forge') {
    // a packet that names another node's slot, signed by this node's own key: the door finds no pinned key it fits
    const p = prepare({ sender: c.slot, counter: BigInt(c.counter || 1), kind: KINDS.JSON, value: { t: 'sync', to: c.to, doc: { docId: 'mesh', lamport: 1, entries: { ['forged-' + (c.k || 0)]: { value: c.value === undefined ? 'forged' : c.value, ts: 1, nodeId: me.id, deleted: false } } } }, dictId: 0 });
    return { sent: send(c.to, finish(p.unsigned, await me.sign(p.signed)).bytes) };
  }
  if (c.op === 'junk') { const b = new Uint8Array(c.size || 200); for (let i = 0; i < b.length; i++) b[i] = Math.floor(rnd() * 256); return { sent: send(c.to, b) }; }
  if (c.op === 'antigens') return { antigens: node.antigens() };
  if (c.op === 'drop') { for (const s of socks.values()) s.destroy(); socks.clear(); return { dropped: true }; }
  if (c.op === 'reconnect') { for (const p of ports) link(p); await new Promise((r) => setTimeout(r, 300)); return { up: socks.size }; }
  if (c.op === 'links') return { up: [...socks.keys()] };
  if (c.op === 'quit') { setTimeout(() => process.exit(0), 10); return { bye: true }; }
  return { ok: false, why: 'unknown op ' + c.op };
}

for (const p of ports) link(p);
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    run(c).then((r) => out({ n: c.n, ...r }), (e) => out({ n: c.n, ok: false, why: 'the cell failed: ' + String(e && e.message || e) }));
  }
});
setTimeout(() => out({ ready: true, id: me.id, slot: me.slot, role }), 300);
