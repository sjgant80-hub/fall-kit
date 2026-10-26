#!/usr/bin/env node
// core/phase2/measure.mjs — Phase 2's measurement, pass by pass (core/phase2/claims.json, sealed before this existed).
//
//   node core/phase2/measure.mjs           measure the passes that are built, judge them, write core/receipts/phase2.json
//   node core/phase2/measure.mjs --check   measure again from fresh clones and exit 1 unless the receipt is the same, byte for byte
//
// Pass 1 is the door measured as a barrier and the edge (edge.mjs). Pass 2 is Kar's mind journal kept in LIGHT
// (kar-mind's persist.mjs, run from clones at the pinned commits) and Kar's memory vault, whose totals the nightly loop
// records on Simon's machine (core/phase2/local/m3.json: the memory is private, so CI re-judges those, never re-measures). Every identity is a fixed public test seed and the
// clock is fixed, so a run gives the same bytes on any machine: the receipt is re-derived, not trusted. Glue: the
// measuring is here; the verdicts are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildCorpus, jsonValues, rng, ROOT } from './corpus.mjs';
import { judge } from './judge.mjs';
import { createNode } from '../node.mjs';
import { makeIdentity, verifyBytes } from '../identity.mjs';
import { prepare, finish, signedBytes, KINDS, HEADER } from '../vendor/light/packet.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { inbound, sealInside, outbound, shapeOf, IN_STAGES } from '../edge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAIMS_PATH = 'core/phase2/claims.json', OUT = join(ROOT, 'core', 'receipts', 'phase2.json');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
export const SEEDS = Object.freeze({ barrier: 50, friend: 51, edge: 52, stranger: 30 });
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const seedOf = (k) => new Uint8Array(32).fill(k);
const enc = (s) => new TextEncoder().encode(s);
const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
const stable = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1) + '\n';
const SMALL = 16384;

export async function pass1() {
  const { files, payloads, digest } = buildCorpus();
  const ids = {};
  for (const [k, s] of Object.entries(SEEDS)) ids[k] = await makeIdentity(seedOf(s));
  const slots = new Set(Object.values(ids).map((x) => x.slot));
  if (slots.size !== 4) throw new Error('the four test identities must hold four different slots');
  const barrier = await createNode({ name: 'barrier', identity: ids.barrier, clock: CLOCK });
  const friendNode = await createNode({ name: 'friend', identity: ids.friend, clock: CLOCK });
  const edgeNode = await createNode({ name: 'edge', identity: ids.edge, clock: CLOCK });
  for (const n of [friendNode, edgeNode]) if (!(await barrier.pin(n.card())).ok) throw new Error('could not pin ' + n.name);

  // an observer outside, reading through the edge: it pins the same two keys and keeps its own counters
  const seen = new Map();
  const observer = { peers: [ids.friend, ids.edge].map((x) => ({ slot: x.slot, id: x.id, raw: x.raw })), verifyBytes, lastCounter: (slot, id) => seen.get(id) || 0n };
  const out = async (bytes) => { const r = await outbound(bytes, observer); if (r.ok) seen.set(r.from, r.counter); return r; };

  let fc = 0n, sc = 0n, ec = 0n;
  const signBy = async (who, value, counter) => { const p = prepare({ sender: who.slot, counter, kind: KINDS.JSON, value, dictId: 0 }); return p.ok ? finish(p.unsigned, await who.sign(p.signed)).bytes : null; };
  const passed = (r) => r.decoded === true && r.recognised !== true;

  // G1 — every payload of the sealed corpus, heard by the node
  const byKind = {}, g1 = { heard: 0, admitted: 0, decoded: 0, recognised: 0, stages: {} };
  for (const p of payloads) {
    bump(byKind, p.kind);
    const r = await barrier.hear(p.bytes);
    g1.heard++;
    if (r.ok === true || r.decoded === true) g1.admitted++;
    if (r.decoded === true) g1.decoded++;
    if (r.recognised === true) g1.recognised++;
    bump(g1.stages, r.stage);
  }

  // G2 — LIGHT's own format, from no pinned signer; each refused copy also goes out through the edge (E3)
  const values = jsonValues(files).filter((v) => JSON.stringify(v.value).length <= SMALL);
  const pick = (i) => values[i % values.length].value;
  const kinds = {}, e3g2 = { n: 0, output: 0 }, first = { n: 0, admitted: 0 };
  const record = async (kind, bytes) => {
    const k = kinds[kind] || (kinds[kind] = { n: 0, admitted: 0, decoded: 0, stages: {} });
    const r = await barrier.hear(bytes);
    k.n++;
    if (r.ok === true || r.decoded === true) k.admitted++;
    if (r.decoded === true) k.decoded++;
    bump(k.stages, r.stage);
    const o = await out(bytes);
    e3g2.n++;
    if (o.ok) e3g2.output++;
  };
  for (let i = 0; i < 1000; i++) {
    const p = prepare({ sender: ids.friend.slot, counter: ++fc, kind: KINDS.JSON, value: pick(i), dictId: 0 });
    await record('unsigned', finish(p.unsigned, new Uint8Array(64)).bytes);
  }
  for (let i = 0; i < 1000; i++) await record('unpinned', await signBy(ids.stranger, pick(i), ++sc));
  for (let i = 0; i < 1000; i++) {
    const b = await signBy(ids.friend, pick(i), ++fc), body = b.length - HEADER - 64;
    b[HEADER + (i % body)] ^= 1;
    await record('tampered', b);
  }
  for (let i = 0; i < 1000; i++) {
    const b = await signBy(ids.friend, pick(i), ++fc);
    const r = await barrier.hear(b);   // the first time it is a real message from a pinned peer
    first.n++;
    if (passed(r)) first.admitted++;
    await out(b);
    await record('replayed', b);
  }
  for (let i = 0; i < 1000; i++) {
    const p = prepare({ sender: ids.friend.slot, counter: ++fc, kind: KINDS.JSON, value: pick(i), dictId: 0 });
    const u = p.unsigned;
    new DataView(u.buffer, u.byteOffset, u.byteLength).setUint32(5, 0x0a000000 + i);
    const n = u.length - HEADER - 64;
    await record('dictionary', finish(u, await ids.friend.sign(signedBytes(u, n))).bytes);
  }
  for (let i = 0; i < 1000; i++) {
    const b = await signBy(ids.friend, pick(i), ++fc), extra = new Uint8Array(b.length + 1 + (i % 7));
    extra.set(b);
    await record('length', extra);
  }

  // G3 — the language still gets through, to the node that has now learned from every refusal above; E3, out again
  const g3 = { n: 0, admitted: 0, equal: 0 }, e3g3 = { n: 0, roundTrip: 0 };
  for (let i = 0; i < Math.max(1000, values.length); i++) {
    const v = pick(i), b = await signBy(ids.friend, v, ++fc);
    const r = await barrier.hear(b);
    g3.n++;
    if (passed(r)) g3.admitted++;
    const o = await out(b);
    e3g3.n++;
    if (o.ok && isDeepStrictEqual(o.value, v)) g3.equal++;
    if (o.ok && isDeepStrictEqual(JSON.parse(o.json), v)) e3g3.roundTrip++;
  }

  // E1 — the corpus's JSON files as outside requests through the edge
  const good = { n: 0, admitted: 0, equal: 0, skipped: 0 }, badR = { n: 0, refused: 0, packets: 0, stages: {} };
  const edgeSign = ids.edge.sign;
  for (const f of jsonValues(files).filter((x) => x.bytes !== null)) {
    const shape = shapeOf(f.value);
    if (shape === null) { good.skipped++; continue; }
    const s = await sealInside(f.bytes, { shape, sender: ids.edge.slot, counter: ++ec }, edgeSign);
    good.n++;
    if (s.ok) {
      const r = await barrier.hear(s.bytes);
      if (passed(r)) good.admitted++;
      const o = await out(s.bytes);
      if (o.ok && isDeepStrictEqual(o.value, f.value)) good.equal++;
    }
    const L = f.bytes.length, h = Math.floor(L / 2);
    const mis = new Uint8Array(L + 1);
    mis.set(f.bytes.subarray(0, h)); mis[h] = 0xff; mis.set(f.bytes.subarray(h), h + 1);
    const bads = [[f.bytes.slice(0, h), {}], [mis, {}], [enc(JSON.stringify({ off: f.value })), {}]];
    if (L >= 2) bads.push([f.bytes, { maxBytes: L - 1 }]);
    for (const [bytes, extra] of bads) {
      const x = await sealInside(bytes, { shape, sender: ids.edge.slot, counter: ec + 1n, ...extra }, edgeSign);
      badR.n++;
      if (x.ok) badR.packets++; else { badR.refused++; bump(badR.stages, x.stage); }
    }
  }

  // E2 — garbage, both ways; never a throw
  const r5 = rng(5), e2 = { n: 0, inbound: 0, outbound: 0, throws: 0, malformed: 0 };
  const rint = (k) => Math.floor(r5() * k);
  const rbytes = (k) => { const b = new Uint8Array(k); for (let i = 0; i < k; i++) b[i] = rint(256); return b; };
  const rjson = (d) => {
    const t = d <= 0 ? rint(4) : rint(6);
    if (t === 0) return null;
    if (t === 1) return r5() < 0.5;
    if (t === 2) return r5() < 0.5 ? rint(1e9) - 5e8 : (r5() - 0.5) * 1e6;
    if (t === 3) return String.fromCharCode(...Array.from({ length: rint(12) }, () => rint(0xffff)));
    if (t === 4) return Array.from({ length: rint(4) }, () => rjson(d - 1));
    const o = {};
    for (let i = rint(4); i > 0; i--) o['k' + rint(100)] = rjson(d - 1);
    return o;
  };
  const deep = () => { let v = rint(9); for (let i = 0; i < 64; i++) v = r5() < 0.5 ? [v] : { a: v }; return v; };
  const odd = () => [null, undefined, 7, 'text', {}, [], 3n, () => 1, new Date(0), Symbol('s')][rint(10)];
  const shapes = [{ type: 'any' }, shapeOf({ a: 1 }), { type: 'list', of: { type: 'int' }, max: 3 }, null, { type: 'nope' }];
  const g2opts = { peers: observer.peers, verifyBytes, lastCounter: () => 0n };
  const wellIn = (r) => r !== null && typeof r === 'object' && ((r.ok === true && 'value' in r) || (r.ok === false && IN_STAGES.includes(r.stage) && typeof r.why === 'string'));
  const wellOut = (r) => r !== null && typeof r === 'object' && ((r.ok === true && typeof r.json === 'string') || (r.ok === false && typeof r.stage === 'string' && typeof r.why === 'string' && typeof r.decoded === 'boolean'));
  for (let i = 0; i < 10000; i++) {
    const t = i % 5;
    const x = t === 0 ? rbytes(rint(2048)) : t === 1 ? enc(String.fromCharCode(...Array.from({ length: rint(200) }, () => rint(0xffff))))
      : t === 2 ? enc(JSON.stringify(rjson(6))) : t === 3 ? enc(JSON.stringify(deep())) : odd();
    e2.n++; e2.inbound++;
    try { if (!wellIn(inbound(x, { shape: shapes[rint(shapes.length)] }))) e2.malformed++; } catch { e2.throws++; }
  }
  const base = await signBy(ids.friend, { probe: true }, 1n);
  for (let i = 0; i < 10000; i++) {
    const t = i % 4;
    let x;
    if (t === 0) x = rbytes(rint(256));
    else if (t === 1) { x = base.slice(); for (let j = 1 + rint(4); j > 0; j--) x[rint(x.length)] ^= 1 + rint(255); }
    else if (t === 2) x = r5() < 0.5 ? base.slice(0, rint(base.length)) : Uint8Array.from([...base, ...rbytes(1 + rint(9))]);
    else x = odd();
    e2.n++; e2.outbound++;
    try { if (!wellOut(await outbound(x, g2opts))) e2.malformed++; } catch { e2.throws++; }
  }

  const perRepo = {};
  for (const f of files) bump(perRepo, f.repo);
  return {
    corpus: { files: files.length, perRepo, payloads: payloads.length, byKind, digest, jsonValues: values.length },
    slots: Object.fromEntries(Object.entries(ids).map(([k, x]) => [k, x.slot])),
    g1, g2: { kinds, firstHearings: first }, g3, e1: { good, bad: badR }, e2, e3: { g3: e3g3, g2: e3g2 },
  };
}

// ── pass 2: Kar's mind journal in LIGHT, and his memory vault ──
export const PASS2 = Object.freeze({
  'kar-mind': '33b5dc767ffd5bc225b9d06a17456c46574e77de',
  'fall-remember': 'd6be032c03855aac6aa0fd1a8b4c6a06cd6e93e3',
  'the-dreamer': '58c1fbd5cf8e14f274ed732a26001215b11f0d5e',
  'fallforgecell': '3873719b25ae86662bc768755985469a33c8ef03',
});
const hexOf = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
function checkout(repo, commit, base = '.pass2') {
  const dir = join(ROOT, base, repo);
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!existsSync(join(dir, '.git'))) { mkdirSync(dir, { recursive: true }); g('init', '-q'); }
  let head = '';
  try { head = g('rev-parse', 'HEAD'); } catch { head = ''; }
  if (head !== commit) { g('fetch', '-q', '--depth', '1', 'https://github.com/sjgant80-hub/' + repo + '.git', commit); g('checkout', '-q', '--force', 'FETCH_HEAD'); }
  return dir;
}
const birds = (d) => [{ s: 'robin', p: 'isa', o: 'bird' }, { s: 'sparrow', p: 'isa', o: 'bird' }, { s: 'robin', p: 'can', o: 'fly' }, { s: 'sparrow', p: 'can', o: 'fly' }].map((e) => ({ ...e, s: e.s + (d > 1 ? '-' + (d % 9) : '') }));

export async function pass2() {
  for (const [repo, commit] of Object.entries(PASS2)) checkout(repo, commit);
  const K = join(ROOT, '.pass2', 'kar-mind'), url = (p) => pathToFileURL(p).href;
  const { createJournal } = await import(url(join(K, 'persist.mjs')));
  const { bootMind } = await import(url(join(K, 'mind-persistent.mjs')));
  const { createMind } = await import(url(join(K, 'mind.mjs')));
  const { createRunLoop, queueSource } = await import(url(join(K, 'run-loop.mjs')));
  const { makeSnapshot } = await import(url(join(ROOT, '.pass2', 'fall-remember', 'disk.mjs')));
  const opts = { tetraConfig: { noveltyThreshold: 2 } };
  // the loop on a counting clock, and every fact with its own time, so a journal is the same bytes on every machine
  const loopEvents = (items) => {
    let t = 1761480000000;
    const mind = createMind({ journal: true, ...opts });
    createRunLoop({ mind, source: queueSource(items), now: () => (t += 1000) }).run({ maxTicks: items.length + 1 });
    return mind.events();
  };
  const demo = [
    { kind: 'fact', fact: { key: 'lesson', value: 'seven nights converged', source: 'kar', ts: 1761480000000 }, recall: { ageMs: 0, halfLifeMs: 100000, accessCount: 3 } },
    { kind: 'fact', fact: { key: 'release', value: 'v2.4', source: 'git-tag', ts: 1761480001000 } },
    { kind: 'episodes', episodes: birds(1), day: 1, source: 'dream' },
    { kind: 'signal', signal: 'quantum-metrology' },
    { kind: 'signal', signal: 'quantum-metrology' },
  ];
  const many = [];
  for (let i = 0; many.length < 16000; i++) {
    if (i % 40 === 39) many.push({ kind: 'episodes', episodes: birds(i), day: 1 + Math.floor(i / 40), source: 'dream' });
    else if (i % 25 === 24) many.push({ kind: 'signal', signal: 'domain-' + (i % 11) });
    else many.push({ kind: 'fact', fact: { key: 'k' + (i % 700), value: 'v' + (i % 37), source: ['kar', 'git-tag', 'peer-audit'][i % 3], ts: 1761480000000 + i * 1000 }, recall: { ageMs: (i % 9) * 1000, halfLifeMs: 100000, accessCount: i % 5 } });
  }
  const tenK = loopEvents(many);
  if (tenK.length < 10000) throw new Error('the long run made only ' + tenK.length + ' events');
  const journals = [
    ['the journal test’s sample', [{ t: 'perceive', fact: { key: 'k', value: 'v', source: 's', ts: 1 } }, { t: 'route', sig: 'x', opts: { existingDomains: [], now: 5 } }]],
    ['the autonomous demo’s run', loopEvents(demo)],
    ['10,000 events from the autonomous loop', tenK.slice(0, 10000)],
  ];
  const tmp = join(ROOT, '.pass2', 'tmp');
  mkdirSync(tmp, { recursive: true });
  const out = [];
  for (const [name, events] of journals) {
    const dir = mkdtempSync(join(tmp, 'j-'));
    try {
      const snap = await makeSnapshot(events);
      const envText = JSON.stringify(snap.envelope);
      writeFileSync(join(dir, 'mind-journal.json'), envText);
      const b0 = await bootMind({ dir, ...opts });
      const j = createJournal({ dir });
      const l0 = await j.load();
      const fl = await j.flush(l0.events);
      const l1 = await createJournal({ dir }).load();
      const b1 = await bootMind({ dir, ...opts });
      const want = JSON.stringify(events);
      out.push({
        name, events: events.length,
        legacy: l0.format, light: l1.format, migrated: fl.migrated === true, asideKept: existsSync(j.asidePath),
        sameEvents: JSON.stringify(l0.events) === want && JSON.stringify(l1.events) === want,
        sameSnapshot: b0.ok === true && b1.ok === true && JSON.stringify(b0.snapshot) === JSON.stringify(b1.snapshot),
        snapshot: b1.ok ? b1.snapshot : null,
        receipt: hexOf(sha256(new TextEncoder().encode(JSON.stringify(l1.events)))),
        bytes: { json: new TextEncoder().encode(want).length, light: fl.bytes, gzip: Buffer.from(snap.envelope.compressed, 'base64').length, envelope: envText.length },
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const m3 = JSON.parse(readFileSync(join(HERE, 'local', 'm3.json'), 'utf8'));
  return { pins: PASS2, journals: out, m3: { from: 'core/phase2/local/m3.json', nights: m3.nights } };
}

// ── pass 3: every model call the controller makes, kept as a LIGHT call book ──
export const PASS3 = Object.freeze({ 'kar-mind': 'a8ca2922b7bba2a6951c0fe0b9b7102f3c911b35' });
export async function pass3() {
  const K = checkout('kar-mind', PASS3['kar-mind'], '.pass3');
  const url = (p) => pathToFileURL(p).href;
  const { readBook } = await import(url(join(K, 'callbook.mjs')));
  const { callsOf, bookMatches } = await import(url(join(K, 'tools', 'callbook-build.mjs')));
  const run = JSON.parse(readFileSync(join(K, 'data', 'controller-run.json'), 'utf8'));
  const bytes = new Uint8Array(readFileSync(join(K, 'data', 'controller-calls.lcb')));
  const r = readBook(bytes), calls = callsOf(run);
  const m = r.ok ? bookMatches(r.records, calls) : { ok: false, why: r.why };
  const local = JSON.parse(readFileSync(join(HERE, 'local', 'i1.json'), 'utf8'));
  return {
    pins: PASS3,
    run: { calls: calls.length, records: r.ok ? r.records.length : 0, readBack: r.ok, matches: m.ok, why: m.ok ? null : m.why, bytes: bytes.length, jsonBytes: r.ok ? new TextEncoder().encode(JSON.stringify(r.records)).length : 0 },
    nightly: { from: 'core/phase2/local/i1.json', records: local.nightly.records, readBack: local.nightly.readBack, bytes: local.nightly.bytes },
  };
}

const sealedIn = () => execFileSync('git', ['-C', ROOT, 'log', '--diff-filter=A', '--format=%H', '--', CLAIMS_PATH], { encoding: 'utf8' }).trim().split('\n').pop();

async function receipt() {
  const facts = { passes: [1, 2, 3], pass1: await pass1(), pass2: await pass2(), pass3: await pass3() };
  const flat = { passes: facts.passes, ...facts.pass1, m1: { journals: facts.pass2.journals }, m2: { journals: facts.pass2.journals }, m3: facts.pass2.m3, i1: facts.pass3 };
  const j = judge(claims, flat);
  return { kind: 'fall-kit.core.phase2.receipt', v: 1, sealedIn: sealedIn(), corpus: claims.corpus.repos, facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await receipt();
  const text = stable(r);
  for (const v of r.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(r.held + ' held, ' + r.failed + ' failed, ' + r.open + ' not measured yet · corpus ' + r.facts.pass1.corpus.payloads + ' payloads, digest ' + r.facts.pass1.corpus.digest.slice(0, 12));
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* none yet */ }
    const same = committed === text;
    console.log(same ? 'PHASE 2 RECEIPT REPRODUCED byte for byte' : 'PHASE 2 RECEIPT DIFFERS from the committed one');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log('wrote core/receipts/phase2.json');
}
