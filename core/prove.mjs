#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// core/prove.mjs — Phase 1's measurement: the shared foundation, with break-it and konomi-slm running on it as nodes.
//
//   node core/prove.mjs --nodes <dir>           run, write core/receipts/foundation.json
//   node core/prove.mjs --nodes <dir> --check   run again; demand the committed receipt byte for byte (CI runs this)
//
// <dir> holds clones of break-it and konomi-slm (CI clones them at the commits core/nodes.json pins). The same scenario
// runs twice: every cell in this process, and every cell in its own operating-system process with this one as the only
// relay — it carries bytes from one cell to another and reads nothing in them but whether they frame as LIGHT (F1).
// The judge (core/judge.mjs) turns the facts into verdicts against core/claims.json, sealed before any of this existed.
// ════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boot, opsOf, modsFrom } from './prove-roles.mjs';
import { ROLES, meshSetup } from './cells.mjs';
import { scenario, triageRowsFrom, brk1CasesFrom } from './scenario.mjs';
import { judge } from './judge.mjs';

const CORE = dirname(fileURLToPath(import.meta.url)), REPO = join(CORE, '..');
const RECEIPT = join(CORE, 'receipts', 'foundation.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** The files a node carries as the foundation: the organs and the vendored kernels — never the tests or the tools. */
export function foundationFiles() {
  const s = JSON.parse(readFileSync(join(CORE, 'vendor', 'SOURCES.json'), 'utf8'));
  return ['antibody.mjs', 'identity.mjs', 'node.mjs', 'vendor/SOURCES.json', ...s.files.map((f) => 'vendor/' + f.path)];
}

// ── cells ──
async function inProcess(role, nodesDir) {
  const { node, extra } = await boot(role, nodesDir);
  return { id: node.id, call: opsOf(node, extra), close: async () => {} };
}
async function inCell(role, nodesDir) {
  const child = spawn(process.execPath, [join(CORE, 'prove-cell.mjs'), role, nodesDir], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout });
  const waiting = new Map();
  let next = 0, ready;
  const up = new Promise((r) => { ready = r; });
  rl.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.ready) { ready(m.id); return; }
    const w = waiting.get(m.i); waiting.delete(m.i);
    if (m.ok) w.res(m.result); else w.rej(new Error(m.error));
  });
  const id = await up;
  const call = (op, args) => new Promise((res, rej) => { const i = next++; waiting.set(i, { res, rej }); child.stdin.write(JSON.stringify({ i, op, args }) + '\n'); });
  return { id, call, close: () => new Promise((r) => { child.on('exit', r); child.stdin.end(); }), pid: child.pid };
}

async function inputsFrom(nodesDir) {
  const domains = await import(pathToFileURL(join(nodesDir, 'konomi-slm', 'vendor', 'seed-library', 'domains.mjs')).href);
  const wire = await import(pathToFileURL(join(nodesDir, 'break-it', 'src', 'wire.mjs')).href);
  const { ids } = await meshSetup();
  return { rows: triageRowsFrom(domains, 40), brk1: await brk1CasesFrom(wire, ids.stranger, ids.screenSender) };
}

async function runAll(nodesDir, make) {
  const inputs = await inputsFrom(nodesDir);
  const cells = {};
  for (const role of ROLES) cells[role] = await make(role, nodesDir);
  try { return await scenario(cells, inputs); } finally { for (const c of Object.values(cells)) await c.close(); }
}

function sealedInfo() {
  const path = 'core/claims.json', text = readFileSync(join(REPO, path), 'utf8').replace(/\r\n/g, '\n');
  let commit = null, atCommit = null;
  try {
    commit = git(REPO, 'log', '--diff-filter=A', '--format=%H', '--', path).split('\n').pop();
    // the whole file as committed — not through git(), which trims, and would drop its last newline
    atCommit = execFileSync('git', ['show', commit + ':' + path], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n');
  } catch { commit = null; }
  return { path, sha256: sha(text), commit, matchesCommit: atCommit !== null && atCommit === text };
}

// what changed in the measurement after a run, said on the receipt itself
const NOTES = Object.freeze([
  'F5 was first measured by comparing the two ledgers’ credit reports whole, line items and their log positions included. Those positions depend on the order each ledger received its entries, so that comparison said FAILED while both ledgers held the same 35 entries and credited the same contributors the same totals. The measurement was corrected after that first run to compare what F5 claims — the credit totals and the set of entries; the in-order comparison is still reported, as facts.ledger.lineItemsSameOrder.',
]);

function nodeInfo(nodesDir) {
  const mine = Object.fromEntries(foundationFiles().map((f) => [f, sha(readFileSync(join(CORE, f)))]));
  const out = {};
  for (const repo of ['break-it', 'konomi-slm']) {
    const dir = join(nodesDir, repo);
    let commit = null;
    try { commit = git(dir, 'rev-parse', 'HEAD'); } catch { commit = null; }
    const differs = [];
    for (const f of Object.keys(mine)) { const p = join(dir, 'vendor', 'fall-kit-core', f); if (!existsSync(p) || sha(readFileSync(p)) !== mine[f]) differs.push(f); }
    out[repo] = { commit, sameFoundation: differs.length === 0, differs };
  }
  return { foundation: mine, nodes: out };
}

export async function measure(nodesDir) {
  const one = await runAll(nodesDir, inProcess);
  const many = await runAll(nodesDir, inCell);
  const facts = { ...one.facts, processes: { ran: many.steps.length > 0, steps: many.steps.length, identical: JSON.stringify(one.steps) === JSON.stringify(many.steps), cells: ROLES.length } };
  const claims = JSON.parse(readFileSync(join(CORE, 'claims.json'), 'utf8'));
  const j = judge(claims, facts);
  return { kind: 'fall-kit.core.receipt', v: 1, sealed: sealedInfo(), notes: NOTES, ...nodeInfo(nodesDir), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, unmeasured: j.unmeasured, steps: one.steps };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = process.argv.slice(2), at = a.indexOf('--nodes');
  const nodesDir = resolve(at >= 0 ? a[at + 1] : join(REPO, '..'));
  const r = await measure(nodesDir);
  const text = JSON.stringify(r, null, 1) + '\n';
  for (const v of r.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  (unmeasured) ') + v.id + ' — ' + v.measured);
  console.log(r.held + ' held, ' + r.failed + ' failed, ' + r.unmeasured + ' unmeasured · foundation the same in break-it: ' + r.nodes['break-it'].sameFoundation + ', in konomi-slm: ' + r.nodes['konomi-slm'].sameFoundation + ' · claims sealed at ' + String(r.sealed.commit).slice(0, 7) + (r.sealed.matchesCommit ? '' : ' (DOES NOT MATCH)'));
  if (a.includes('--check')) {
    const was = existsSync(RECEIPT) ? readFileSync(RECEIPT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (was !== text) { console.error('RECEIPT CHECK FAILED: the run does not reproduce core/receipts/foundation.json byte for byte'); process.exit(1); }
    const bad = r.failed > 0 || r.unmeasured > 0 || !r.sealed.matchesCommit || !r.nodes['break-it'].sameFoundation || !r.nodes['konomi-slm'].sameFoundation;
    if (bad) { console.error('RECEIPT CHECK FAILED: the receipt reproduces, but not every claim holds on the same foundation'); process.exit(1); }
    console.log('RECEIPT CHECK CLEAN — reproduced byte for byte');
  } else {
    mkdirSync(dirname(RECEIPT), { recursive: true });
    writeFileSync(RECEIPT, text);
    console.log('wrote core/receipts/foundation.json');
  }
}
