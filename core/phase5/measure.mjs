#!/usr/bin/env node
// core/phase5/measure.mjs — Phase 5's measurement (core/phase5/claims.json, sealed before this existed).
//
//   node core/phase5/measure.mjs           measure every claim CI can, read the facts a browser tab or this machine's
//                                          local model left in core/phase5/local/, judge, write core/receipts/phase5.json
//   node core/phase5/measure.mjs --check   do it again; exit 1 unless the receipt is the same, byte for byte
//
// The red team is Phase 2's sealed corpus, built by Phase 2's own code from fresh clones at its sealed commits. Every
// identity comes from a fixed public test seed and the clock is fixed, so a run gives the same facts every time. Glue:
// the verdicts are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { egress } from '../egress.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorpus, rng } from '../phase2/corpus.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { makeIdentity } from '../identity.mjs';
import { createNode } from '../node.mjs';
import { KINDS, makeDoor, door, emptyLibrary, take, MAX_LIBRARY } from '../site.mjs';
import { ROUTES, proposal, decide, keywordsOf, keywordRoute } from '../mind.mjs';
import { judge } from './judge.mjs';
import { meshOf, siteMesh, ROLES as SITE_ROLES } from './sitenode.mjs';
import { brk1CasesFrom, triageRowsFrom } from '../scenario.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase5.json');
const CLOCK = () => new Date('2026-10-27T12:00:00Z');
export const SEEDS = Object.freeze({ site: 51, peer: 52, stranger: 53, other: 54 });
const seedOf = (n) => new Uint8Array(32).fill(n);
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const enc = (s) => new TextEncoder().encode(s);
const tally = (xs) => { const o = {}; for (const x of xs) o[x] = (o[x] || 0) + 1; return Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1))); };
const local = (name) => { const f = join(HERE, 'local', name + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

/** The names the page declares: every id it links to with href="#…". The page's own door harvests the same from its DOM. */
export function pageNames() {
  const html = readFileSync(join(HERE, 'index.html'), 'utf8');
  return [...new Set([...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]))].sort();
}

/** The tab payloads: the corpus's payloads of at most 2,048 bytes, in its order, and their digest (the corpus's rule). */
export function tabPayloads(payloads) {
  const tab = payloads.filter((p) => p.bytes.length <= 2048);
  const digest = hex(sha256(enc(tab.map((p) => p.id + ':' + hex(sha256(p.bytes))).join('\n'))));
  return { tab, digest };
}

// ── the sealed message rule, written a second time, independently of core/site.mjs ──
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/u;
function referenceMessage(bytes) {
  if (bytes.length < 1 || bytes.length > 2000) return 'size';
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return 'utf8'; }
  return FORBIDDEN.test(s) ? 'chars' : 'ok';
}

// ── pass 1: the door at the site's edge ──
async function d1(payloads, corpusDigest) {
  const ids = {};
  for (const [k, n] of Object.entries(SEEDS)) ids[k] = await makeIdentity(seedOf(n));
  const make = (k) => createNode({ name: k, identity: ids[k], clock: CLOCK });
  const site = await make('site'), peer = await make('peer'), stranger = await make('stranger'), other = await make('other');
  await site.pin(peer.card()); await peer.pin(site.card()); await stranger.pin(site.card()); await peer.pin(other.card());
  const heard = [];
  for (const p of payloads) heard.push(await site.hear(p.bytes));
  const corpus = { count: payloads.length, digest: corpusDigest, admitted: heard.filter((r) => r.ok === true).length, decoded: heard.filter((r) => r.decoded === true).length, byStage: tally(heard.filter((r) => r.ok !== true).map((r) => String(r.stage))) };
  const packet = async (from, to, i) => { from.setShared('mesh', 'note', 'from ' + i); return from.shareSync(to.card().id, 'mesh'); };
  const control = await packet(peer, site, 1);
  const unpinned = await packet(stranger, site, 2);
  const changed = (await packet(peer, site, 3)).slice(); changed[changed.length - 70] ^= 1;   // a byte of the body, under the signature
  const misaddressed = await packet(peer, other, 4);
  const said = async (b) => { const r = await site.hear(b); return { ok: r.ok === true, stage: r.ok === true ? null : r.stage, decoded: r.decoded === true }; };
  const shapes = { control: await said(control), replayed: await said(control), unpinned: await said(unpinned), changed: await said(changed), misaddressed: await said(misaddressed) };
  return { corpus, shapes, seeds: SEEDS };
}

function d2(payloads, names) {
  const d = makeDoor(names);
  const ok = names.filter((n) => door({ kind: 'address', bytes: enc('#' + n) }, d).ok === true);
  const corpus = payloads.map((p) => door({ kind: 'address', bytes: p.bytes }, d));
  return { names: names.length, namesAdmitted: ok.length, version: d.version, corpus: { count: payloads.length, admitted: corpus.filter((r) => r.ok).length, admittedEmpty: corpus.filter((r, i) => r.ok && payloads[i].bytes.length === 0).length, admittedAs: tally(corpus.filter((r) => r.ok).map((r) => String(r.value))), byStage: tally(corpus.filter((r) => !r.ok).map((r) => r.stage)) } };
}

function d3(payloads) {
  const d = makeDoor([]);
  let disagree = 0, admitted = 0, exact = 0, unnamed = 0;
  const stages = [], dis = [];
  for (const p of payloads) {
    const r = door({ kind: 'message', bytes: p.bytes }, d), ref = referenceMessage(p.bytes);
    if ((r.ok ? 'ok' : r.stage) !== ref) { disagree++; if (dis.length < 5) dis.push(p.id); }
    if (r.ok) { admitted++; if (hex(enc(r.value)) === hex(p.bytes)) exact++; } else { stages.push(r.stage); if (typeof r.stage !== 'string') unnamed++; }
  }
  const asForm = payloads.map((p) => door({ kind: 'form', bytes: p.bytes }, d));
  const r5 = rng(5), good = [{ account: 1, period: 0, amount: 0 }, { account: 99999999, period: 1199, amount: 100000000 }];
  while (good.length < 10) good.push({ account: 1 + Math.floor(r5() * 99999999), period: Math.floor(r5() * 1200), amount: Math.floor(r5() * 100000001) });
  const goodOk = good.filter((g) => door({ kind: 'form', bytes: enc(JSON.stringify(g)) }, d).ok === true).length;
  return {
    messages: { count: payloads.length, disagree, disagreeing: dis, admitted, exact, refused: payloads.length - admitted, unnamed, byStage: tally(stages) },
    forms: { count: payloads.length, admitted: asForm.filter((r) => r.ok).length, byStage: tally(asForm.filter((r) => !r.ok).map((r) => r.stage)), good: good.length, goodAdmitted: goodOk, records: good },
  };
}

function l1(tab, names) {
  const d = makeDoor(names), lib = emptyLibrary();
  const reqs = tab.flatMap((p) => [{ kind: 'address', bytes: p.bytes }, { kind: 'message', bytes: p.bytes }]);
  const first = reqs.map((q) => take(lib, q, d)), second = reqs.map((q) => take(lib, q, d));
  let refused = 0, onSightFirst = 0, recognisedAgain = 0, admitted = 0, admittedAgain = 0, recognisedWrongly = 0;
  first.forEach((r, i) => {
    if (r.ok) { admitted++; if (second[i].ok === true) admittedAgain++; if (second[i].recognised === true) recognisedWrongly++; }
    else { refused++; if (r.recognised === true) onSightFirst++; if (second[i].recognised === true) recognisedAgain++; }
  });
  return { requests: reqs.length, refused, onSightFirst, recognisedAgain, admitted, admittedAgain, recognisedWrongly, library: lib.exact.size, bound: MAX_LIBRARY, full: lib.full };
}

function f1() {
  const r = rng(11), d = makeDoor(['a', 'b-c']), lib = emptyLibrary();
  const kinds = [...KINDS, 'packet', null, 7, '', 'toString', undefined];
  const doors = [d, null, {}, 7, { set: [], version: 1 }];
  let throws = 0, unnamed = 0, admitted = 0;
  for (let i = 0; i < 20000; i++) {
    const n = Math.floor(r() * (r() < 0.05 ? 5000 : 120)), b = new Uint8Array(n);
    for (let j = 0; j < n; j++) b[j] = r() < 0.3 ? 0x23 + Math.floor(r() * 90) : Math.floor(r() * 256);
    const shape = Math.floor(r() * 10);
    const req = shape === 0 ? [null, 7, 'x', [], undefined][i % 5] : shape === 1 ? { kind: kinds[i % kinds.length] } : { kind: kinds[Math.floor(r() * kinds.length)], bytes: shape === 2 ? [...b] : shape === 3 ? new TextDecoder().decode(b) : b };
    try {
      const out = take(r() < 0.5 ? lib : null, req, doors[Math.floor(r() * doors.length)]);
      if (typeof out.ok !== 'boolean' || (!out.ok && typeof out.stage !== 'string')) unnamed++;
      if (out.ok) admitted++;
    } catch { throws++; }
  }
  return { cases: 20000, throws, unnamed, admitted };
}

// ── pass 2: the mind at the door ──
const NEAR = ['About', 'ABOUT', ' about', 'about ', 'abou', 'aboutt', 'mesh\n', 'dig i', 'start.', 'none!', '', 'route', 'admit', 'toString', 'constructor', '__proto__', 'hasOwnProperty', 'business,mesh', 'défend'];
function fuzzReply(r, i) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const any = (d) => {
    const t = Math.floor(r() * (d > 3 ? 4 : 7));
    if (t === 0) return null; if (t === 1) return Math.floor(r() * 2000) - 1000; if (t === 2) return pick([...NEAR, ...ROUTES]);
    if (t === 3) return r() < 0.5;
    if (t === 4) return Array.from({ length: Math.floor(r() * 4) }, () => any(d + 1));
    const o = {};
    for (let k = Math.floor(r() * 4); k > 0; k--) o[pick(['route', 'Route', 'why', '__proto__', 'constructor', 'x'])] = any(d + 1);
    return o;
  };
  const kind = i % 8;
  if (kind === 0) { const b = new Uint8Array(Math.floor(r() * 700)); for (let j = 0; j < b.length; j++) b[j] = Math.floor(r() * 256); return new TextDecoder().decode(b); }
  if (kind === 1) return JSON.stringify(any(0));
  if (kind === 2) return JSON.stringify({ route: pick(NEAR) });
  if (kind === 3) return JSON.stringify({ route: pick(ROUTES), pad: 'x'.repeat(490 + Math.floor(r() * 400)) });
  if (kind === 4) { let s = '"' + pick(ROUTES) + '"'; for (let d = 1 + Math.floor(r() * 300); d > 0; d--) s = r() < 0.5 ? '[' + s + ']' : '{"route":' + s + '}'; return s; }
  if (kind === 5) return '{"' + pick(['__proto__', 'constructor', 'prototype']) + '":{"route":"' + pick(ROUTES) + '"}}';
  if (kind === 6) return pick(['```', '```json', '``` ```', '~~~']) + pick(['', '\n', ' ']) + JSON.stringify({ route: pick([...NEAR, ...ROUTES]) }) + pick(['', '```', '\n```', '``` ```', '~~~']);
  return pick(['', ' ', 'null', 'undefined', '{', '}', '{"route":}', '{"route":"about"', 'route: about', 'about', '{"route":"about"}{"route":"mesh"}']) + pick(['', ' ', 'x']);
}
const WRAPS = [(j) => j, (j) => ' ' + j, (j) => j + '\n', (j) => '\n\n' + j + '  ', (j) => '```json\n' + j + '\n```', (j) => '```\n' + j + '\n```', (j) => '```json ' + j + ' ```', (j) => '```' + j + '```', (j) => '  ```json\r\n' + j + '\r\n```  ', (j) => '\t' + j + '\t'];
function wellFormed(id, k) {
  const body = [JSON.stringify({ route: id }), '{ "route" : "' + id + '" }', JSON.stringify({ why: 'because ' + k, route: id }), JSON.stringify({ route: id, why: 'w'.repeat(k) }), '{\n  "route": "' + id + '"\n}', JSON.stringify({ route: id, n: k, ok: true }), JSON.stringify({ x: null, route: id }), '{"route":"' + id + '","route2":"admit"}', JSON.stringify({ route: id, __proto__x: 1 }), '{"why":"","route":"' + id + '"}'][k % 10];
  return WRAPS[Math.floor(k / 10) % 10](body);
}
function m1() {
  const r = rng(13), ids = ROUTES, kw = keywordsOf(claims.mind.routes);
  let outside = 0, throws = 0, taken = 0, validTaken = 0;
  for (let i = 0; i < 20000; i++) {
    const reply = fuzzReply(r, i);
    try { const d = decide(reply, String(reply).slice(0, 2000), kw, ids); if (!ids.includes(d.route)) outside++; if (d.by === 'mind') taken++; } catch { throws++; }
  }
  let valid = 0;
  for (const id of ids) for (let k = 0; k < 100; k++) {
    valid++;
    try { const p = proposal(wellFormed(id, k), ids); if (p.ok && p.route === id) validTaken++; } catch { throws++; }
  }
  return { fuzzed: 20000, outside, throws, takenAsRoutes: taken, valid, validTaken };
}

// ── pass 3: the site as a node of the mesh ──
/** break-it and konomi-slm cloned fresh at their sealed commits into .nodes5/ (git-ignored), read from the commit itself. */
export function sealedNodes() {
  const dir = join(ROOT, '.nodes5');
  for (const [repo, commit] of Object.entries(claims.nodes)) {
    const d = join(dir, repo), git = (args) => execFileSync('git', ['-C', d, ...args], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    if (!existsSync(join(d, '.git'))) { mkdirSync(d, { recursive: true }); git(['init', '-q']); }
    let at = '';
    try { at = git(['rev-parse', 'HEAD']).trim(); } catch { at = ''; }
    if (at !== commit) { git(['fetch', '-q', '--depth', '1', 'https://github.com/sjgant80-hub/' + repo + '.git', commit]); git(['checkout', '-q', '--force', commit]); }
    if (git(['status', '--porcelain']).trim() !== '') git(['checkout', '-q', '--force', commit]);
  }
  return dir;
}
function processCell(role, nodesDir) {
  const child = spawn(process.execPath, [join(HERE, 'cell.mjs'), role, nodesDir], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout }), waiting = new Map();
  let next = 0, ready;
  const up = new Promise((r) => { ready = r; });
  rl.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.ready) { ready(m); return; }
    const w = waiting.get(m.i); waiting.delete(m.i);
    if (m.ok) w.res(m.result); else w.rej(new Error(m.error));
  });
  return up.then((m) => ({
    id: m.id, pid: m.pid,
    call: (op, args) => new Promise((res, rej) => { const i = next++; waiting.set(i, { res, rej }); child.stdin.write(JSON.stringify({ i, op, args }) + '\n'); }),
    close: () => new Promise((r) => { child.on('exit', r); child.stdin.end(); }),
  }));
}
async function meshFacts() {
  const nodesDir = sealedNodes();
  const domains = await import(pathToFileURL(join(nodesDir, 'konomi-slm', 'vendor', 'seed-library', 'domains.mjs')).href);
  const wire = await import(pathToFileURL(join(nodesDir, 'break-it', 'src', 'wire.mjs')).href);
  const { ids } = await meshOf();
  const inputs = { brk1: await brk1CasesFrom(wire, ids.stranger, ids.screenSender), rows: triageRowsFrom(domains, 27).slice(7, 27) };
  const cells = {};
  for (const role of SITE_ROLES) cells[role] = await processCell(role, nodesDir);
  try {
    const r = await siteMesh(cells, inputs, ids.stranger);
    const pids = new Set(Object.values(cells).map((c) => c.pid));
    return { n1: { processes: pids.size === 3 && !pids.has(process.pid) ? 3 : pids.size, nodes: claims.nodes, ...r.n1 }, n2: r.n2 };
  } finally { for (const c of Object.values(cells)) await c.close(); }
}

export async function measure() {
  const { payloads, digest } = buildCorpus();
  const names = pageNames(), { tab, digest: tabDigest } = tabPayloads(payloads);
  const facts = {};
  facts.corpus = { count: payloads.length, digest, tab: tab.length, tabDigest };
  facts.d1 = await d1(payloads, digest);
  facts.d2 = d2(payloads, names);
  facts.d3 = d3(payloads);
  facts.l1 = l1(tab, names);
  facts.f1 = f1();
  facts.m1 = m1();
  const kw = keywordsOf(claims.mind.routes), msgs = claims.mind.messages;
  facts.mind = { digest: hex(sha256(enc(JSON.stringify(msgs)))), keywords: kw, t0Right: msgs.filter((m) => keywordRoute(m.text, kw, ROUTES) === m.route).length };
  Object.assign(facts, await meshFacts());
  facts.q1 = q1();
  for (const k of ['d4', 'm2', 'm3', 'n3', 'q2', 'q3', 'v1']) { const l = local(k); if (l) facts[k] = { from: 'core/phase5/local/' + k + '.json', where: l.where || null, ...l.facts }; }
  return { facts, redteam: redteamFile(tab, tabDigest, digest) };
}

// ── pass 4: what the site's own code may call ──
export const Q1_FILES = () => ['core/phase5/index.html', 'core/site.mjs', 'core/mind.mjs', 'core/egress.mjs', ...readdirSync(HERE).filter((f) => f.endsWith('.mjs')).sort().map((f) => 'core/phase5/' + f)];
/** The files the page itself loads: its module script, and every relative import from there (glue, for the notes). */
function pageFiles() {
  const seen = new Set(['core/phase5/index.html']), todo = ['core/phase5/page.mjs'];
  while (todo.length) {
    const p = todo.pop();
    if (seen.has(p) || !existsSync(join(ROOT, p))) continue;
    seen.add(p);
    const text = readFileSync(join(ROOT, p), 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\(\s*)'(\.{1,2}\/[^']+\.m?js)'/g)) todo.push(posix.normalize(posix.join(posix.dirname(p), m[1])));
  }
  return [...seen].sort();
}
function q1() {
  const files = Q1_FILES();
  const f = egress(files.map((p) => ({ path: p, text: readFileSync(join(ROOT, p), 'utf8') })), { selfHost: 'sjgant80-hub.github.io', edges: claims.edges, wake: 'core/phase5/mind-tab.mjs', page: 'core/phase5/index.html' });
  const loads = pageFiles();
  // beyond the sealed set, for the notes: the same walk over every file of this repository the page itself loads
  const all = egress(loads.map((p) => ({ path: p, text: readFileSync(join(ROOT, p), 'utf8') })), { selfHost: 'sjgant80-hub.github.io', edges: claims.edges, wake: 'core/phase5/mind-tab.mjs', page: 'core/phase5/index.html' });
  return { ...f, read: files, pageLoads: loads, pageLoadsOutside: all.loadedOutside, pageLoadsStunMissing: all.stunMissing };
}

/** The tab's copy of the red team: the payloads of at most 2,048 bytes, in the corpus's order, as base64. */
function redteamFile(tab, digest, corpusDigest) {
  return JSON.stringify({ kind: 'fall-kit.core.phase5.redteam', v: 1, of: corpusDigest, count: tab.length, digest, payloads: tab.map((p) => [p.id, Buffer.from(p.bytes).toString('base64')]) }) + '\n';
}

// ── what the receipt says about itself: every failure and every correction, in plain words ──
export const NOTES = Object.freeze([
  'D2 failed as sealed, and is kept. The fifteen corpus payloads let in as the page\'s address are all the empty request (zero bytes: two empty .nojekyll files and an empty LICENSE, and their cuts), which the sealed address rule takes as the top of the page. Two sealed rules disagree on that one input; the claim is not re-sealed. Every non-empty payload was refused.',
  'Q1 failed as sealed, and is kept. The sealed rule reads every module in core/phase5/, and that folder holds the two Node tools that measure the site: measure.mjs fetches break-it and konomi-slm from github.com to run them, and mind-local.mjs calls Ollama on this machine. Neither is ever loaded by the page. Read the same way, the 25 files of this repository the page loads name no other host except esm.run, in the mind\'s wake module, and every FallLink they make has an empty STUN list (q1.pageLoadsOutside). The modules the page loads from break-it, konomi-slm and falllink on this origin are not read here; the page\'s policy holds them, and Q2 measures what the tab actually called.',
  'M3 failed, and is kept. In a real tab, WebLLM\'s 4-bit build of the same model routed 25 of the 70 sealed messages right (bar 49), and only 40 of its 70 replies were a proposal at all: in WebLLM\'s JSON mode it begins the sealed reply, {"route":"…", then keeps writing fields nobody asked for (descriptions, steps, made-up prices and partner names) until the sealed 24-token limit cuts it off, so the reply is not JSON and the mind\'s door refuses it. With it awake the site routed 44 right, two fewer than the keyword rule alone (46): in a browser, as built, the mind made routing worse. Nothing it wrote in those extra fields reached the page. The 8-bit build under Ollama, same prompt, stopped at the route and routed 65 (M2). The fix, constraining the reply to the route itself, is its own sealed claim, not a change to this one.',
  'N1: the first judge counted every value in the site\'s ledger (25) against the twenty triage answers, but the sealed rule is that each triage answer the site used is recorded. The ledger was read before the count was corrected: 20 values for konomi-slm\'s triage answers and 5 for break-it\'s screen answers. The judge now counts the triage values, and says so here.',
]);

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase5/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
/** The whole receipt, measured again, as the text it is written as; and the tab's red-team file. Phase 5b's B5 calls this. */
export async function receiptText() {
  const { facts, redteam } = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase5.receipt', v: 1, sealedIn: sealedIn(), notes: NOTES, facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  return { text: stable(receipt), redteam, j };
}
export const RECEIPT = OUT, REDTEAM = join(HERE, 'redteam.json');

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, redteam, j } = await receiptText();
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  if (process.argv.includes('--check')) {
    const had = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (had !== text) { console.error('the receipt differs from core/receipts/phase5.json'); process.exit(1); }
    if ((existsSync(REDTEAM) ? readFileSync(REDTEAM, 'utf8') : '') !== redteam) { console.error('core/phase5/redteam.json is not the sealed corpus\'s tab payloads'); process.exit(1); }
    console.log('receipt and the tab\'s red team reproduced byte for byte');
  } else { writeFileSync(OUT, text); writeFileSync(REDTEAM, redteam); }
}
