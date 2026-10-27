// core/phase7/page.test.mjs — the gate on Phase 7's live page: it explains itself and carries the business case, it is
// wired, it writes no markup, it carries the credits and none of the barred words, every number it states is the claims'
// or a receipt's, its links land, and the receipt re-judges to its own verdicts (what the page does in a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './judge.mjs';
import { barredIn } from '../economy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const claims6 = JSON.parse(readFileSync(join(CORE, 'phase6', 'claims.json'), 'utf8'));
const receipt = JSON.parse(readFileSync(join(CORE, 'receipts', 'phase7.json'), 'utf8'));
const costs = JSON.parse(readFileSync(join(HERE, 'costs.json'), 'utf8'));
const code = Object.fromEntries(['page.mjs', 'tab.mjs', 'run.mjs', 'world.mjs', 'books.mjs'].map((f) => [f, readFileSync(join(HERE, f), 'utf8')]));
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);

test('every link to a section lands on one', () => {
  const names = [...new Set([...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]))];
  assert.ok(names.length >= 14);
  for (const n of names) assert.match(html, new RegExp('id="' + n + '"'), '#' + n);
});

test('it explains itself and carries the business case', () => {
  for (const id of ['what-it-is', 'start-here', 'check-it', 'how-it-works', 'model-a', 'model-b', 'the-wedge', 'by-role', 'blueprint', 'receipt', 'for-a-business', 'security', 'roll-out', 'risks', 'paper', 'faq']) assert.match(html, new RegExp('id="' + id + '"'), id);
  for (const role of ['CEO', 'CFO', 'COO', 'CTO', 'CISO', 'Legal and compliance']) assert.match(html, new RegExp('<td>' + role + '</td>'), role);
  for (const s of ['The case for the board', 'Support and ownership', 'The cost case', 'Against what you have now', 'Honest limits', 'What coupling showed', 'Words used here', 'Plant a phrase of your own']) says(s);
  assert.match(html, /<div class="diagram" role="img" aria-label="[^"]{60,}">/);
});

test('every button and output the engine drives is on the page', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const used = [...code['page.mjs'].matchAll(/(?:\$|put|text|say)\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 30);
  for (const id of used) assert.ok(ids.has(id), '#' + id);
  for (const m of html.matchAll(/<button\b[^>]*>/g)) { const id = (/id="([^"]+)"/.exec(m[0]) || [])[1]; assert.ok(id && code['page.mjs'].includes("$('" + id + "').addEventListener"), m[0]); }
  for (const id of ['c-hours', 'c-share', 'own-phrase']) assert.ok(code['page.mjs'].includes("'" + id + "'"), id);
  assert.match(html, /<script type="module" src="\.\/page\.mjs"><\/script>/);
});

test('no markup from code, no barred word, no other origin, the credits', () => {
  for (const [file, src] of Object.entries(code)) {
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!src.includes(bad), file + ' uses ' + bad);
    assert.deepEqual(barredIn(src, claims6.barred, false), [], file);
  }
  assert.ok(!/fetch\(['"]https?:/.test(code['page.mjs'] + code['tab.mjs']), 'nothing is fetched from another origin');
  assert.deepEqual(barredIn(text, claims6.barred, true), []);
  for (const s of ['not money', 'MIT, no licence fee', 'the switch is off']) assert.ok(text.includes(s), s);
  says('Powered by the Konomi architecture, created by Thomas Frumkin.');
  assert.match(html, /href="https:\/\/www\.ai-nativesolutions\.com">AI Native Solutions<\/a>/);
  assert.ok(!/si-didy/i.test(html));
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self';/);
});

test('the questions are the same in the page and in its JSON-LD', () => {
  const ld = JSON.parse(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(html)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
  assert.ok(shown.length >= 5);
  assert.deepEqual(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), shown);
});

test('every number the page states is the claims\' or a receipt\'s', () => {
  says('thirteen claims sealed before the code');
  assert.equal(claims.claims.length, 13);
  says('Twenty-four questions from three nodes');
  assert.equal(claims.stay.cabins.length * claims.stay.ranges.length, 24);
  assert.equal(claims.askers.length, 3);
  says('four nodes, their founder\'s roster, a forged packet refused and learned, and twelve questions');
  assert.equal(claims.child.organs.length, 4);
  assert.match(claims.child.asks, /^the first 12 stay asks/);
  says('One claim of thirteen');
  assert.equal(receipt.failed, 1);
  assert.deepEqual(receipt.verdicts.filter((v) => v.held === false).map((v) => v.id), ['B3']);
  says('immunity reached the client\'s desk and stopped there');
  assert.equal(receipt.facts.b3.sharedOn['stay-a'].shared, false);
  says('none was found');
  assert.equal(receipt.facts.a4.foundCount, 0);
  says('180,000 real payment records');
  const pilot = join(ROOT, '.nodes7', 'break-it', 'receipts', 'pilot.json');
  if (existsSync(pilot)) assert.equal(JSON.parse(readFileSync(pilot, 'utf8')).feed.records, 180000);
  assert.equal(costs.nlwPence, 1271);
  assert.match(costs.source.url, /^https:\/\/www\.gov\.uk\//);
});

test('the section\'s links land, and the client\'s node is pinned', () => {
  for (const href of ['claims.json', 'nodes.json', '../receipts/phase7.json']) { assert.ok(html.includes('href="' + href + '"'), href); assert.ok(existsSync(join(HERE, href)), href); }
  const nodes = JSON.parse(readFileSync(join(HERE, 'nodes.json'), 'utf8')).nodes;
  assert.match(nodes.wishwood, /^[0-9a-f]{40}$/);
  assert.deepEqual(receipt.nodes, nodes);
});

test('the receipt re-judges to its own verdicts', () => {
  const j = judge(claims, receipt.facts);
  assert.deepEqual(j.verdicts, receipt.verdicts);
  assert.deepEqual([j.held, j.failed, j.open], [receipt.held, receipt.failed, receipt.open]);
});
