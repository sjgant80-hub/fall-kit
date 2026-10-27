#!/usr/bin/env node
// core/phase6/measure.mjs — Phase 6's measurement (core/phase6/claims.json, sealed before this existed).
//
//   node core/phase6/measure.mjs           run the nodes, keep the books, measure every claim CI can, read the tab's facts,
//                                          judge, write core/receipts/phase6.json and the books (books.json, books.light)
//   node core/phase6/measure.mjs --check   do it again; exit 1 unless the receipt and both book files are the same, byte for byte
//
// break-it and konomi-slm are cloned at their sealed commits (the same as Phase 5's) and every node runs in its own
// process. Every identity is a public test seed and the clock is fixed, so a run gives the same books every time. Glue:
// the verdicts are judge.mjs's (pure, gated); the second hand on the books is core/economy.mjs.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../vendor/light/sha256.mjs';
import { hex, unhex } from '../identity.mjs';
import { createNode, assetOf } from '../node.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import * as E from '../economy.mjs';
import { rng } from '../phase2/corpus.mjs';
import { meshSetup } from '../cells.mjs';
import { brk1CasesFrom, triageRowsFrom } from '../scenario.mjs';
import { sealedNodes } from '../phase5/measure.mjs';
import { worldOf, ROLES, CLOCK } from './world.mjs';
import { run, ownWork, specialistsOf, auditGate, books, bookFiles, vaultHolds } from './books.mjs';
import { fork, network } from './paths.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const phase5 = JSON.parse(readFileSync(join(CORE, 'phase5', 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase6.json'), BOOKS = join(HERE, 'books.json'), LIGHT = join(HERE, 'books.light'), EVIDENCE = join(HERE, 'evidence.json');
const local = (name) => { const f = join(HERE, 'local', name + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

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

/** The words the sealed C6 rule names, read from its own text: the money verbs and the switch makers. */
export function sealedWords() {
  const rule = claims.claims.find((c) => c.id === 'C6').rule;
  return [...rule.matchAll(/\(([^)]+)\)/g)].flatMap((m) => m[1].split(',').map((w) => w.trim()));
}

function fuzz() {
  const r = rng(19), K = (c) => c.repeat(64);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const junk = () => pick([null, 7, 'x', [], {}, NaN, -1, 1e30, { [K('a')]: '3' }, [{ n: 0, entry: { type: 'release', asset: 'a', by: K('a') } }, { n: 1, entry: { type: 'value', asset: 'a', units: 2 } }], claims.policy, ['x'], 'x y z']);
  let throws = 0;
  for (let i = 0; i < 20000; i++) {
    try {
      const f = i % 5;
      if (f === 0) E.creditsOf(junk(), r() < 0.5 ? claims.policy : junk());
      else if (f === 1) E.partsOf(junk(), r() < 0.5 ? Math.floor(r() * 1e6) : junk());
      else if (f === 2) E.looUnits(r() < 0.5 ? r() * 3 - 1 : junk());
      else if (f === 3) E.barredIn(r() < 0.5 ? 'text ' + i : junk(), r() < 0.5 ? claims.barred : junk(), r() < 0.5);
      else E.moneyNames(junk(), r() < 0.5 ? sealedWords() : junk());
    } catch { throws++; }
  }
  return { cases: 20000, throws };
}

export async function measure() {
  const nodesDir = sealedNodes();
  const domains = await import(pathToFileURL(join(nodesDir, 'konomi-slm', 'vendor', 'seed-library', 'domains.mjs')).href);
  const wire = await import(pathToFileURL(join(nodesDir, 'break-it', 'src', 'wire.mjs')).href);
  const { ids: p1 } = await meshSetup();
  const inputs = { brk1: await brk1CasesFrom(wire, p1.stranger, p1.screenSender), rows: triageRowsFrom(domains, 27).slice(7, 27), messages: phase5.mind.messages.slice(0, 5).map((m) => m.text) };
  const world = await worldOf(claims.seeds, claims.policy);
  const auditor = await createNode({ name: 'auditor', identity: world.ids.founder, genesis: world.genesis, clock: CLOCK });
  const cells = {};
  for (const role of ROLES) cells[role] = await processCell(role, nodesDir);
  let out, cards;
  try {
    out = await run(cells, inputs, auditor.card());
    cards = new Map();
    for (const role of ROLES) { const c = await cells[role].call('card'); cards.set(c.id, c); }
    cards.set(auditor.card().id, auditor.card());
  } finally { for (const c of Object.values(cells)) await c.close(); }
  const pids = new Set(Object.values(cells).map((c) => c.pid));
  const facts = {};

  // C1 — every node's own ledger
  const liarAsset = assetOf(world.ids.liar.id);
  facts.c1 = { processes: pids.size === 4 && !pids.has(process.pid) ? 4 : pids.size, messages: out.wire.messages, nonLight: out.wire.nonLight,
    nodes: Object.fromEntries(ROLES.map((r) => [r, ownWork(out.ledgers[r].log, world.ids[r].id, liarAsset)])),
    asks: out.asks.reduce((o, a) => { const k = a.asker + ' ' + a.skill + ' → ' + a.to + ': ' + a.outcome; o[k] = (o[k] || 0) + 1; return o; }, {}) };

  // C2–C4 — the auditor's books
  const p4bytes = readFileSync(join(CORE, 'receipts', 'phase4.json')), p4 = JSON.parse(p4bytes.toString('utf8'));
  const ctx = { cards, evidence: out.evidence, phase4: { sha: hex(sha256(new Uint8Array(p4bytes))), specialists: specialistsOf(p4) }, growth: world.ids.growth.id, founder: world.ids.founder.id, auditor: auditor.card().id, checked: new Set() };
  const b = await books(world, out, ctx, world.ids.founder.ledgerKeys, world.ids.growth.ledgerKeys);
  const values = b.ledger.log.filter((x) => x.entry.type === 'value');
  facts.c2 = { merged: b.merged, values: values.length, routing: values.filter((x) => x.entry.basis === 'routing').length, checked: ctx.checked.size, valuesJobs: values.filter((x) => x.entry.basis === 'routing').every((x) => ctx.checked.has(x.entry.job)) };
  const files = bookFiles(b.ledger), again = await L.replay(b.ledger.log, { gate: auditGate({ ...ctx, checked: new Set() }) });
  const creditsNow = L.credits(b.ledger), creditsAgain = again.ok ? L.credits(again.ledger) : null;
  facts.c3 = { entries: b.ledger.log.length, head: b.ledger.head, replayed: again.ok, sameHead: again.ok && again.ledger.head === b.ledger.head, sameCredits: !!creditsAgain && JSON.stringify(creditsAgain.credits) === JSON.stringify(creditsNow.credits), vault: files.light ? vaultHolds(files.light, files.json) : false, booksSha: files.sha, lightBytes: files.light ? files.light.length : 0, jsonBytes: new TextEncoder().encode(files.json).length };
  facts.c4 = { specialists: b.specialists.map((s) => ({ skill: s.skill, kind: s.kind, patternId: s.patternId, gain: s.gain, units: s.units, released: s.released, valued: s.valued })), expected: ctx.phase4.specialists.length, planted: b.planted, receiptSha: ctx.phase4.sha };

  // C5 — the sandbox allocation, against the second hand
  const pool = claims.pool, al = L.allocate(b.ledger, { sandbox: true, pool }), mine = E.creditsOf(b.ledger.log, claims.policy), parts2 = mine.ok ? E.partsOf(mine.credits, pool) : { ok: false };
  const keys = Object.keys(creditsNow.credits).sort();
  const linesSum = keys.filter((k) => { const s = L.shareOf(b.ledger, k, { sandbox: true, pool }); return s.ok && s.lines.reduce((t, x) => t + BigInt(x.credit), 0n) === BigInt(s.credit); }).length;
  const weights = values.map((x) => { const sum = creditsNow.lines.filter((ln) => ln.n === x.n).reduce((t, ln) => t + BigInt(ln.credit), 0n); return sum === BigInt(x.entry.units) * BigInt(x.n <= claims.policy.earlyUntil ? claims.policy.earlyNum : claims.policy.earlyDen); });
  facts.c5 = { pool, total: al.ok ? al.total : null, sandbox: al.ok ? al.sandbox : null, contributors: keys.length, sameParts: al.ok && parts2.ok && JSON.stringify(al.parts) === JSON.stringify(parts2.parts), sameCredits: mine.ok && JSON.stringify(mine.credits) === JSON.stringify(creditsNow.credits),
    linesSum, valuesWeighed: weights.filter(Boolean).length, values: values.length, early: values.filter((x) => x.n <= claims.policy.earlyUntil).length, parts: al.ok ? al.parts : null, credits: creditsNow.credits };

  // C6–C8 — the switch, and its two paths
  const liveNow = L.allocate(b.ledger, {}), names = [...Object.keys(L), ...Object.keys(E)].sort();
  facts.c6 = { switchEntries: b.ledger.log.filter((x) => x.entry.type === 'switch').length, switchOff: b.ledger.switch === null, live: { ok: liveNow.ok, why: liveNow.ok ? null : liveNow.why }, names, moneyNames: E.moneyNames(names, sealedWords()), words: sealedWords() };
  const keysOf = { founder: world.ids.founder.ledgerKeys, site: world.ids.site.ledgerKeys, network: world.ids.network.map((i) => i.ledgerKeys), networkMeasurer: world.ids.networkMeasurer.ledgerKeys };
  facts.c7 = await fork(b.ledger, keysOf, pool, claims.counsel);
  facts.c8 = await network(b.ledger, world, keysOf, auditGate({ ...ctx, checked: new Set() }), pool, claims.counsel);
  facts.c9 = fuzz();

  // C10, C11 — the page (pass 4)
  const pageFile = join(HERE, 'index.html');
  if (existsSync(pageFile)) {
    const html = readFileSync(pageFile, 'utf8');
    const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const mods = ['core/economy.mjs', ...readdirSync(HERE).filter((m) => m.endsWith('.mjs')).sort().map((m) => 'core/phase6/' + m)];   // as sealed: every module of core/phase6/
    facts.c10 = { page: E.barredIn(text, claims.barred, true), modules: Object.fromEntries(mods.map((p) => [p, E.barredIn(readFileSync(join(ROOT, p), 'utf8'), claims.barred, false)])), says: ['not money', 'the switch is off', 'contribution unit'].filter((s) => text.toLowerCase().includes(s)) };
  }
  const tab = local('c11');
  if (tab) facts.c11 = { from: 'core/phase6/local/c11.json', where: tab.where, ...tab.facts };
  // the evidence the auditor's gate re-checks, published so anyone can run the same gate: the cards and the answer packets
  const evidenceJson = JSON.stringify({ kind: 'fall-kit.core.phase6.evidence', v: 1, cards: [...cards.values()], evidence: out.evidence, phase4: { sha: ctx.phase4.sha, specialists: ctx.phase4.specialists }, growth: ctx.growth, founder: ctx.founder, auditor: ctx.auditor }, null, 1) + '\n';
  return { facts, files: { ...files, evidence: evidenceJson } };
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase6/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
// what the receipt says about itself: every failure, in plain words
export const NOTES = Object.freeze([
  'C8 failed as sealed, and is kept. The mock network already held a release of the living site\'s name by another key: names here are derived from a node\'s key but not bound to it, so the first to record a name holds it. The merge refused the living site\'s own release, as predicted, and, because the auditor\'s gate credits a value only to the key that gave the answer (written before the first run, as part of the gate), it also refused the ten values that would otherwise have been credited to the key that took the name: eleven refusals, not the one the claim expected, and the living site has no part in the network\'s allocation. The books are right to refuse; the lesson is to bind a node\'s name to its key before any merge.',
  'C10 failed as sealed, and is kept. The page\'s own text carries none of the barred words. The sealed rule also holds the source of every module of core/phase6/ to the list, names in the code and test data included: page.mjs calls break-it\'s gated cost kernel by the name break-it gave its reader of a dated list of what services cost, and keeps that list in a variable named after it; the two test files use barred words as the data they test the barred-word check and the judge with. Nothing was renamed away after the measurement; each module\'s findings are in the facts (c10.modules).',
]);
export async function receiptText() {
  const { facts, files } = await measure();
  const j = judge(claims, facts);
  return { text: stable({ kind: 'fall-kit.core.phase6.receipt', v: 1, sealedIn: sealedIn(), notes: NOTES, facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open }), files, j };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, files, j } = await receiptText();
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  if (process.argv.includes('--check')) {
    const same = (f, x) => existsSync(f) && Buffer.compare(readFileSync(f), Buffer.from(x)) === 0;
    if (!same(OUT, text)) { console.error('the receipt differs from core/receipts/phase6.json'); process.exit(1); }
    if (!same(BOOKS, files.json) || !same(LIGHT, files.light) || !same(EVIDENCE, files.evidence)) { console.error('the books differ from core/phase6/books.json, books.light or evidence.json'); process.exit(1); }
    console.log('the receipt and the books reproduced byte for byte');
  } else { writeFileSync(OUT, text); writeFileSync(BOOKS, files.json); writeFileSync(LIGHT, files.light); writeFileSync(EVIDENCE, files.evidence); }
}
