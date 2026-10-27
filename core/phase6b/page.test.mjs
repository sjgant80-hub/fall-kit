// core/phase6b/page.test.mjs — the gate on the fix's section of the Phase 6 page: every element its engine writes to is on
// the page, it writes no markup, its modules carry none of the barred words, every number the section states is the
// sealed claims' or the receipt's, its links land, and the receipt re-judges to its own verdicts (what the page does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './judge.mjs';
import { barredIn } from '../economy.mjs';
import { assetOf } from '../node.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..');
const html = readFileSync(join(CORE, 'phase6', 'index.html'), 'utf8');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const claims6 = JSON.parse(readFileSync(join(CORE, 'phase6', 'claims.json'), 'utf8'));
const receipt = JSON.parse(readFileSync(join(CORE, 'receipts', 'phase6b.json'), 'utf8'));
const code = Object.fromEntries(['page.mjs', 'tab.mjs', 'net.mjs'].map((f) => [f, readFileSync(join(HERE, f), 'utf8')]));
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const f = receipt.facts;

test('the page loads the fix\'s engine, and every element it writes to is there', () => {
  assert.match(html, /<script type="module" src="\.\.\/phase6b\/page\.mjs"><\/script>/);
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...code['page.mjs'].matchAll(/(?:\$|put|text|say)\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 12);
  for (const id of used) assert.ok(ids.has(id), '#' + id);
  for (const id of ['fix-sum', 'fix-rows', 'attack-rows', 'fix-merge-line', 'fix-part-rows', 'fix-site-line', 'fix-refuse-line', 'fix-go', 'fix-log', 'fix-out', 'd-door', 'd-merge', 'd-cover', 'd-refuse']) assert.ok(used.includes(id), id + ' is written by the engine');
  assert.ok(code['page.mjs'].includes("$('fix-go').addEventListener('click'"));
  assert.match(html, /<a href="#the-fix">The fix<\/a>/);
  assert.match(html, /<h2 id="the-fix">/);
});

test('no markup from code, no barred word, no other origin', () => {
  for (const [file, src] of Object.entries(code)) {
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!src.includes(bad), file + ' uses ' + bad);
    assert.deepEqual(barredIn(src, claims6.barred, false), [], file);
    assert.ok(!/https?:\/\//.test(src.replace(/^\/\/.*$/gm, '')), file + ' names another origin');
  }
  assert.deepEqual(barredIn(text, claims6.barred, true), []);
  assert.ok(!/si-didy/i.test(html));
});

test('every number the fix\'s section states is the sealed claims\' or the receipt\'s', () => {
  const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);
  says('nine more for the fix');
  says('nine more claims and nine attacks');
  assert.equal(claims.claims.length, 9);
  assert.equal(claims.attacks.length, 9);
  says('The nine attacks');
  says('the first 16 hex digits of its own key');
  assert.equal(assetOf('ab'.repeat(32)), 'node:' + 'ab'.repeat(8));
  says('a search of about 2 to the 64 keys');
  assert.equal(16 * 4, 64);
  says('three nodes, each under');
  assert.equal(f.n2.own.length, 3);
  says('Every one is refused by the rule on its own, and again at the larger network\'s door.');
  assert.ok(f.n1.attacks.every((a) => a.ok === false) && f.n2.atDoor.every((a) => a.ok === false));
  assert.equal(f.n3.refused.length, 0);
  assert.equal(f.n4.booksContributorsCovered, f.n4.booksContributors);
  assert.ok(f.n4.siteCovered);
  assert.ok(f.n5.refused && f.n5.unchanged);
});

test('the section\'s links land', () => {
  for (const href of ['../phase6b/claims.json', '../receipts/phase6b.json']) {
    assert.ok(html.includes('href="' + href + '"'), href);
    assert.ok(existsSync(join(CORE, 'phase6', href)), href);
  }
});

test('the receipt re-judges to its own verdicts', () => {
  const j = judge(claims, f);
  assert.deepEqual(j.verdicts, receipt.verdicts);
  assert.deepEqual([j.held, j.failed, j.open], [receipt.held, receipt.failed, receipt.open]);
});

test('the steps for a larger network do what the page says, on Phase 6\'s own mock', async () => {
  const L = await import('../vendor/ledger/contrib.mjs');
  const { boundGate, unboundIn, mergeBound } = await import('../names.mjs');
  const { worldOf, AT } = await import('../phase6/world.mjs');
  const { mockNetwork, counselDigest } = await import('../phase6/paths.mjs');
  const { auditGate } = await import('../phase6/books.mjs');
  const { keysOf, ctxOf } = await import('./net.mjs');
  const world = await worldOf(claims6.seeds, claims6.policy), k = keysOf(world), open = async () => ({ ok: true });
  const proof = [{ kind: 'mock-network', ref: 'network', digest: counselDigest('a mock of a larger network') }];
  const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);
  // Phase 6's mock, plus one entry that keeps the rule
  let old = (await mockNetwork(world, k)).ledger;
  old = (await L.record(old, (await L.sign(k.network[1], { type: 'release', asset: 'card:partner-tool', at: AT, form: 'card', lineage: [], proofs: proof })).entry, { gate: open })).ledger;
  says('lists every release you hold that breaks the rule, with the entry it was recorded at and the key that signed it');
  assert.deepEqual(unboundIn(old).unbound.map((u) => [u.asset, u.at, u.maker]), old.log.filter((x) => x.entry.type === 'release' && x.entry.asset !== 'card:partner-tool').map((x) => [x.entry.asset, x.n, x.entry.by]));
  says('reconcile(fresh, old, { gate: boundGate(yourGate) })');
  const fresh = (await L.record(L.empty(), old.genesis, {})).ledger;
  const rc = await L.reconcile(fresh, old, { gate: boundGate(open) });
  says('Every release that breaks the rule is refused and named, so is every value resting on one, and every other entry is kept');
  const refused = rc.refused.map((x) => old.log[x.n].entry);
  assert.equal(refused.filter((e) => e.type === 'release').length, 4);
  assert.equal(refused.filter((e) => e.type === 'value').length, 3);
  assert.ok(rc.refused.every((x) => x.why.includes(old.log[x.n].entry.asset)));
  assert.deepEqual([rc.added, rc.skipped], [1, 1]);
  assert.ok(rc.ledger.assets['card:partner-tool']);
  assert.deepEqual(unboundIn(rc.ledger).unbound, []);
  says('The books then merge into yours with nothing refused');
  let l = rc.ledger;
  for (let i = 0; i < 3; i++) {
    const r = await L.record(l, (await L.sign(k.network[i], { type: 'release', asset: assetOf(k.network[i].pub), at: AT, form: 'node', lineage: [], proofs: proof })).entry, { gate: boundGate(open) });
    assert.ok(r.ok, r.why);
    l = r.ledger;
  }
  const ids = new Set();
  for (const x of l.log) ids.add(await L.idOf(x.entry));
  const ev = JSON.parse(readFileSync(join(CORE, 'phase6', 'evidence.json'), 'utf8')), log = JSON.parse(readFileSync(join(CORE, 'phase6', 'books.json'), 'utf8'));
  const books = (await L.replay(log, { gate: auditGate(ctxOf(ev)) })).ledger;
  const m = await mergeBound(l, books, { gate: async (e, led) => (ids.has(await L.idOf(e)) ? { ok: true } : auditGate(ctxOf(ev))(e, led)) });
  assert.equal(m.ok, true);
  assert.deepEqual([m.added, m.skipped, m.refused.length], [51, 1, 0]);
});
