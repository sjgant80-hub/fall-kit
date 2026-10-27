// core/phase6/page.test.mjs — the gate on Phase 6's live page: it explains itself, it is wired, it writes no markup, it
// carries the credits and none of the sealed barred words, every number it states is the receipt's, and the receipt
// re-judges to its own verdicts (what the page does in a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './judge.mjs';
import { barredIn } from '../economy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase6.json'), 'utf8'));
const code = Object.fromEntries(['page.mjs', 'tab.mjs', 'books.mjs', 'paths.mjs', 'world.mjs'].map((f) => [f, readFileSync(join(HERE, f), 'utf8')]));
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const f = receipt.facts;

test('every link to a section lands on one', () => {
  const names = [...new Set([...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]))];
  assert.ok(names.length >= 10);
  for (const n of names) assert.match(html, new RegExp('id="' + n + '"'), '#' + n);
});

test('it explains itself and carries the business case', () => {
  for (const id of ['what-it-is', 'start-here', 'check-it', 'how-it-works', 'the-books', 'the-switch', 'blueprint', 'receipt', 'for-a-business', 'security', 'roll-out', 'risks', 'paper', 'faq']) assert.match(html, new RegExp('id="' + id + '"'), id);
  for (const role of ['CEO', 'CFO', 'COO', 'CTO', 'CISO', 'Legal and compliance']) assert.match(html, new RegExp('<td>' + role + '</td>'), role);
  for (const s of ['The case for the board', 'Support and ownership', 'The cost case', 'Honest limits', 'What the network path found']) assert.ok(text.includes(s), s);
  assert.match(html, /<div class="diagram" role="img" aria-label="[^"]{40,}">/);
});

test('every button and output the engine drives is on the page', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of code['page.mjs'].matchAll(/\$\('([a-z0-9-]+)'\)/g)) assert.ok(ids.has(m[1]), '#' + m[1]);
  for (const m of html.matchAll(/<button\b[^>]*>/g)) { const id = (/id="([^"]+)"/.exec(m[0]) || [])[1]; assert.ok(id && code['page.mjs'].includes("$('" + id + "').addEventListener"), m[0]); }
  for (const id of ['c-hours', 'c-share']) assert.ok(code['page.mjs'].includes("'" + id + "'"), id);
});

test('no markup from code, no barred word, the credits', () => {
  for (const [file, src] of Object.entries(code)) for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!src.includes(bad), file + ' uses ' + bad);
  assert.deepEqual(barredIn(text, claims.barred, true), [], 'the page itself says none of the barred words');
  // the code is held to the same list by claim C10, and what it finds is the receipt's: page.mjs names break-it's
  // pricesFrom and its price list (C10 failed as sealed, kept); every other module finds nothing
  for (const [file, src] of Object.entries(code)) assert.deepEqual(barredIn(src, claims.barred, false), f.c10.modules['core/phase6/' + file] || [], file);
  for (const s of ['not money', 'the switch is off', 'contribution unit']) assert.ok(text.toLowerCase().includes(s), s);
  assert.ok(text.includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.match(html, /href="https:\/\/www\.ai-nativesolutions\.com">AI Native Solutions<\/a>/);
  assert.ok(!/si-didy/i.test(html));
});

test('the questions are the same in the page and in its JSON-LD', () => {
  const ld = JSON.parse(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(html)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
  assert.deepEqual(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), shown);
});

test('the receipt re-judges to its own verdicts', () => {
  const j = judge(claims, f);
  assert.deepEqual(j.verdicts, receipt.verdicts);
  assert.deepEqual([j.held, j.failed, j.open], [receipt.held, receipt.failed, receipt.open]);
});

test('every number the page states is the receipt\'s', () => {
  const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);
  says('eleven entries in all');
  says('eleven in all, and so the living site had no part in the network\'s allocation');
  assert.equal(f.c8.refused.length, 11);
  assert.equal(f.c8.booksContributorsCovered, f.c8.booksContributors - 1);
  says('eleven claims sealed before the code');
  assert.equal(claims.claims.length, 11);
  says('the first forty entries weigh one and a half');
  assert.deepEqual([claims.policy.earlyUntil, claims.policy.earlyNum, claims.policy.earlyDen], [40, 3, 2]);
  says('The makers of each asset take a tenth of every value on it');
  assert.equal(claims.policy.makerPpm, 100000);
});

test('the published books and evidence are the receipt\'s', () => {
  for (const name of ['books.json', 'books.light', 'evidence.json']) assert.ok(existsSync(join(HERE, name)), name);
  const log = JSON.parse(readFileSync(join(HERE, 'books.json'), 'utf8'));
  assert.equal(log.length, f.c3.entries);
});
