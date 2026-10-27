#!/usr/bin/env node
// core/phase6b/measure.mjs — Phase 6b's measurement (core/phase6b/claims.json, sealed before this existed).
//
//   node core/phase6b/measure.mjs           measure every claim CI can, read the tab's facts, judge, write core/receipts/phase6b.json
//   node core/phase6b/measure.mjs --check   do it again; exit 1 unless the receipt is the same, byte for byte
//
// The world is Phase 6's: its sealed seeds and policy, its genesis, and its books and evidence as published, replayed here
// from nothing under the auditor's gate to the head Phase 6's receipt names. N7 runs Phase 6's own --check as a separate
// process, so the books this measures are the books Phase 6 makes. Glue: the verdicts are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../vendor/ledger/contrib.mjs';
import * as E from '../economy.mjs';
import { assetOf } from '../node.mjs';
import { bound } from '../names.mjs';
import { rng } from '../phase2/corpus.mjs';
import { worldOf } from '../phase6/world.mjs';
import { auditGate } from '../phase6/books.mjs';
import { network as unboundNetwork, mockNetwork } from '../phase6/paths.mjs';
import { ctxOf, keysOf, attacksOf, fixPath, refusePath } from './net.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const claims = readJson(HERE, 'claims.json'), claims6 = readJson(CORE, 'phase6', 'claims.json');
const OUT = join(CORE, 'receipts', 'phase6b.json');
const local = (name) => { const f = join(HERE, 'local', name + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

/** 10,000 values at the rule: garbage, and entries of the books with one field changed. */
function fuzz(log, world) {
  const r = rng(23), pick = (xs) => xs[Math.floor(r() * xs.length)];
  const site = assetOf(world.ids.site.id), other = assetOf(world.ids.network[0].id);
  const junk = () => pick([null, 7, 'x', [], {}, NaN, -1, 'node:', site, { type: 'release' }, [log[1].entry], true, undefined, { type: 'release', asset: site, form: 'node' }]);
  const field = {
    asset: () => pick([site, other, site + '-2', 'card:x', 'node:', 'network:node-1', 5, null, undefined, {}]),
    form: () => pick([...L.FORMS, 'Node', '', 5, null, undefined]),
    by: () => pick([world.ids.site.id, world.ids.network[0].id, world.ids.founder.id, world.ids.site.id.toUpperCase(), 'x', 5, null, undefined]),
    type: () => pick(['release', 'value', 'give', 'switch', 'genesis', '', 5, null]),
  };
  let throws = 0, shaped = 0;
  for (let i = 0; i < 10000; i++) {
    try {
      let v;
      if (i % 2 === 0) v = junk();
      else { const k = pick(Object.keys(field)); v = { ...pick(log).entry, [k]: field[k]() }; }
      const b = bound(v);
      if (b !== null && typeof b === 'object' && typeof b.ok === 'boolean' && (b.ok || (typeof b.why === 'string' && b.why.length > 0))) shaped++;
    } catch { throws++; }
  }
  return { cases: 10000, throws, shaped };
}

/** A second count of the releases in a ledger that break the rule, written apart from core/names.mjs. */
function secondCount(ledger) {
  return Object.entries(ledger.assets).filter(([asset, a]) => (a.form === 'node' || asset.slice(0, 5) === 'node:') && !(a.form === 'node' && asset === 'node:' + String(a.maker).slice(0, 16))).map(([asset]) => asset);
}

export async function measure() {
  const receipt6 = readJson(CORE, 'receipts', 'phase6.json'), log = readJson(CORE, 'phase6', 'books.json'), ev = readJson(CORE, 'phase6', 'evidence.json');
  const world = await worldOf(claims6.seeds, claims6.policy), keys = keysOf(world);
  const r = await L.replay(log, { gate: auditGate(ctxOf(ev)) });
  if (!r.ok || r.ledger.head !== receipt6.facts.c3.head) throw new Error('the published books do not replay to the head Phase 6\'s receipt names: ' + (r.ok ? r.ledger.head : r.why));
  const books = r.ledger, facts = {};
  const signed = await attacksOf(claims.attacks, world);
  const fix = await fixPath(books, world, auditGate(ctxOf(ev)), claims6.pool, claims6.counsel, signed);
  if (!fix.merged) throw new Error('the bound merge was refused: ' + fix.why);

  // N1 — the rule
  const people = [world.ids.founder, world.ids.site, world.ids.breakit, world.ids.konomi, world.ids.liar, world.ids.growth, world.ids.networkMeasurer, ...world.ids.network].map((i) => i.id);
  let total = 0, right = 0;
  for (const s of people) for (const o of people) { total++; if (bound({ type: 'release', asset: assetOf(o), form: 'node', by: s }).ok === (s === o)) right++; }
  facts.n1 = {
    attacks: signed.map((a) => { const b = bound(a.entry); return { id: a.id, by: a.by, form: a.form, asset: a.asset, ok: b.ok, why: b.ok ? null : b.why }; }),
    books: { entries: log.length, bound: log.filter((x) => bound(x.entry).ok).length },
    network: { entries: fix.network.entries, bound: fix.network.entriesBound },
    pairs: { keys: people.length, total, right }, fuzz: fuzz(log, world),
  };
  // N2–N4 — the bound network, the merge, the allocation
  facts.n2 = { atDoor: fix.network.atDoor, own: fix.network.own, unbound: fix.network.unbound.ok ? fix.network.unbound.unbound.length : -1 };
  facts.n3 = { merged: fix.merged, booksEntries: fix.booksEntries, added: fix.added, skipped: fix.skipped, heldAlready: fix.heldAlready, genesisOnly: fix.genesisOnly, refused: fix.refused, siteRelease: fix.siteRelease, siteValues: fix.siteValues };
  facts.n4 = { switched: fix.switched, pool: fix.pool, total: fix.total, parts: fix.parts, booksContributors: fix.booksContributors, booksContributorsCovered: fix.booksContributorsCovered, siteCovered: fix.siteCovered, networkContributors: fix.networkContributors, networkContributorsCovered: fix.networkContributorsCovered, replayed: fix.replayed, replayWhy: fix.replayWhy, replaySame: fix.replaySame };
  // N5 — a network that does not bind names, refused
  facts.n5 = { ...(await refusePath(books, world, auditGate(ctxOf(ev)))), expected: secondCount((await mockNetwork(world, keys)).ledger) };
  // N6 — the control: Phase 6's path, unchanged
  facts.n6 = { control: await unboundNetwork(books, world, keys, auditGate(ctxOf(ev)), claims6.pool, claims6.counsel), sealed: receipt6.facts.c8 };
  // N7 — Phase 6, re-derived by its own measure in its own process
  const p6 = spawnSync(process.execPath, [join(CORE, 'phase6', 'measure.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  facts.n7 = { exit: p6.status, last: String(p6.stdout || '').trim().split('\n').pop() || String(p6.stderr || '').trim().split('\n').pop() || '' };
  // N8 — the tab
  const tab = local('n8');
  if (tab) facts.n8 = { from: 'core/phase6b/local/n8.json', where: tab.where, ...tab.facts };
  // N9 — the words
  const html = readFileSync(join(CORE, 'phase6', 'index.html'), 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const mods = ['core/names.mjs', ...readdirSync(HERE).filter((m) => m.endsWith('.mjs')).sort().map((m) => 'core/phase6b/' + m)];
  facts.n9 = { files: Object.fromEntries(mods.map((p) => [p, E.barredIn(readFileSync(join(ROOT, p), 'utf8'), claims6.barred, false)])), page: E.barredIn(text, claims6.barred, true) };
  return facts;
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase6b/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
// what the receipt says about itself: every failure, in plain words
export const NOTES = Object.freeze([]);
export async function receiptText() {
  const facts = await measure();
  const j = judge(claims, facts);
  return { text: stable({ kind: 'fall-kit.core.phase6b.receipt', v: 1, sealedIn: sealedIn(), notes: NOTES, facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open }), j };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { text, j } = await receiptText();
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || Buffer.compare(readFileSync(OUT), Buffer.from(text)) !== 0) { console.error('the receipt differs from core/receipts/phase6b.json'); process.exit(1); }
    console.log('the receipt reproduced byte for byte');
  } else writeFileSync(OUT, text);
}
