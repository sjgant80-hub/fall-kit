// core/phase7b/page.test.mjs — the gate on the fix's section of the Phase 7 page: its engine writes no markup and talks to
// no other origin, its modules carry none of the barred words, every number the section states is the claims', its links
// land, and the receipt re-judges to its own verdicts (what the page does in a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './judge.mjs';
import { barredIn } from '../economy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..');
const html = readFileSync(join(CORE, 'phase7', 'index.html'), 'utf8');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const claims6 = JSON.parse(readFileSync(join(CORE, 'phase6', 'claims.json'), 'utf8'));
const code = Object.fromEntries(['page.mjs', 'tab.mjs', 'world.mjs', 'measure.mjs', 'compat.mjs', 'cell.mjs', 'judge.mjs'].map((f) => [f, readFileSync(join(HERE, f), 'utf8')]));
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);

test('the page loads the fix\'s engine, which writes no markup and talks to no other origin', () => {
  assert.match(html, /<script type="module" src="\.\.\/phase7b\/page\.mjs"><\/script>/);
  assert.match(html, /<h3 id="the-bridge">/);
  assert.match(html, /<a href="#the-bridge">The fix<\/a>/);
  for (const [file, src] of Object.entries(code)) {
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!src.includes(bad), file + ' uses ' + bad);
    assert.deepEqual(barredIn(src, claims6.barred, false), [], file);
  }
  assert.ok(!/fetch\(['"]https?:/.test(code['page.mjs'] + code['tab.mjs']));
  assert.ok(code['page.mjs'].includes("$('bridge-go').addEventListener('click'"));
  assert.deepEqual(barredIn(text, claims6.barred, true), []);
});

test('every number the section states is the claims\'', () => {
  says('six more claims, sealed before a line of it was written. It is called Phase 7b.');
  assert.equal(claims.claims.length, 6);
  says('every earlier phase was checked again on the new node');
  assert.ok(claims.claims.some((c) => c.id === 'R4' && /Phases 2, 3, 3c, 4, 5, 5b, 6, 6b and 7/.test(c.measure)));
});

test('the section\'s links land', () => {
  for (const href of ['../phase7b/claims.json', '../receipts/phase7b.json']) {
    assert.ok(html.includes('href="' + href + '"'), href);
    assert.ok(existsSync(join(CORE, 'phase7', href)), href);
  }
});

test('the receipt re-judges to its own verdicts', () => {
  const receipt = JSON.parse(readFileSync(join(CORE, 'receipts', 'phase7b.json'), 'utf8'));
  const j = judge(claims, receipt.facts);
  assert.deepEqual(j.verdicts, receipt.verdicts);
  assert.deepEqual([j.held, j.failed, j.open], [receipt.held, receipt.failed, receipt.open]);
});
