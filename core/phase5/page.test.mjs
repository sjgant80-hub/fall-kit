// core/phase5/page.test.mjs — the gate on Phase 5's live page: it explains itself, it is wired, its handlers never write
// markup, it carries the credits and no price, every number it states is the receipt's, and the receipt re-judges to its
// own verdicts (what the page does in a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase5.json'), 'utf8'));
const code = Object.fromEntries(['page.mjs', 'mind-tab.mjs', 'mesh-tab.mjs', 'sitenode.mjs'].map((f) => [f, readFileSync(join(HERE, f), 'utf8')]));
const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const f = receipt.facts;

test('every link to a section lands on one, and the page declares enough names for its door', () => {
  const names = [...new Set([...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]))];
  assert.ok(names.length >= 10, names.length + ' names');
  for (const n of names) assert.match(html, new RegExp('id="' + n + '"'), '#' + n + ' has no element');
  assert.equal([...html.matchAll(/href="#"/g)].length, 0, 'no bare # link');
});

test('it explains itself: what it is, start here, how it works, the blueprint, the business case, the paper, questions', () => {
  for (const id of ['what-it-is', 'start-here', 'talk-to-it', 'the-door', 'how-it-works', 'the-mind', 'the-mesh', 'local-first', 'your-digi', 'blueprint', 'receipt', 'for-a-business', 'security', 'roll-out', 'risks', 'paper', 'faq']) assert.match(html, new RegExp('id="' + id + '"'), id);
  for (const role of ['CEO', 'CFO', 'COO', 'CTO', 'CISO', 'The teams']) assert.match(html, new RegExp('<td>' + role + '</td>'), role);
  for (const s of ['The case for the board', 'Support and ownership', 'The cost case', 'One message, traced from the measured run']) assert.ok(text.includes(s), s);
  assert.match(html, /<div class="diagram" role="img" aria-label="[^"]{40,}">/);
});

test('every button and output the engine drives is on the page, and every id the engine reads exists', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const [file, src] of Object.entries(code)) for (const m of src.matchAll(/\$\('([a-z0-9-]+)'\)/g)) assert.ok(ids.has(m[1]), file + ' reads #' + m[1] + ', which is not on the page');
  for (const m of html.matchAll(/<button\b[^>]*>/g)) {
    const id = (/id="([^"]+)"/.exec(m[0]) || [])[1], say = /data-say="/.test(m[0]);
    assert.ok(say || (id && code['page.mjs'].includes("$('" + id + "').addEventListener")), 'a button with nothing behind it: ' + m[0]);
  }
});

test('the handlers never write markup: every word they put on the page is text', () => {
  for (const [file, src] of Object.entries(code)) for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!src.includes(bad), file + ' uses ' + bad);
  assert.match(code['page.mjs'], /said\.textContent = r\.value;/);
});

test('the funnel is the sealed one, everywhere it appears', () => {
  assert.match(code['page.mjs'], new RegExp("export const FUNNEL = '" + claims.funnel.replace(/[.#/]/g, (c) => '\\' + c) + "';"));
  assert.ok(html.split('href="' + claims.funnel + '"').length - 1 >= 2, 'the page links the funnel');
  assert.match(code['page.mjs'], /digi: \['Your own DIGI', '[^']+', FUNNEL\]/);
});

test('the mind is woken only by the wake module, the only file naming another host, and FallLink gets no STUN server', () => {
  assert.match(code['mind-tab.mjs'], /export const LIBRARY = 'https:\/\/esm\.run\/@mlc-ai\/web-llm@0\.2\.79';/);
  assert.match(code['mind-tab.mjs'], new RegExp("export const MODEL = '" + claims.mind.models.tab.model + "';"));
  assert.match(code['page.mjs'], /MIND = await import\('\.\/mind-tab\.mjs'\);/);
  assert.ok(!/^import .*mind-tab/m.test(code['page.mjs']), 'the wake module is not loaded with the page');
  for (const file of ['page.mjs', 'mesh-tab.mjs', 'sitenode.mjs']) assert.ok(!/https?:\/\/(?!sjgant80-hub\.github\.io)/.test(code[file].replace(/\/\/[^\n]*/g, '')), file + ' names another host');
  assert.match(code['mesh-tab.mjs'], /new FallLink\(\{ [^}]*stunServers: \[\] \}\)/);
});

test('credits, supplier, and no price', () => {
  assert.ok(text.includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.ok(text.includes('Gary W. Floyd, Lumiea Systems Research Division, ThunderStruck Service, LLC, "GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps" (2025)'));
  assert.match(html, /href="https:\/\/www\.ai-nativesolutions\.com">AI Native Solutions<\/a>/);
  for (const bad of [/£\s?\d/, /\$\s?\d/, /\/mo\b/i, /pricing/i, /priceCurrency/, /"@type":"Offer"/, /per seat/i, /si-didy/i, /\bKCC\b/]) assert.ok(!bad.test(html), 'the page carries ' + bad);
});

test('the questions are the same in the page and in its JSON-LD', () => {
  const ld = JSON.parse(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(html)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);
  assert.deepEqual(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), shown);
});

test('the receipt re-judges to its own verdicts, word for word (what the page does in a tab)', () => {
  const j = judge(claims, f);
  assert.deepEqual(j.verdicts, receipt.verdicts);
  assert.deepEqual([j.held, j.failed, j.open], [receipt.held, receipt.failed, receipt.open]);
  assert.equal(receipt.verdicts.length, claims.claims.length);
});

test('every number the page states is the receipt\'s', () => {
  const says = (s) => assert.ok(text.includes(s), 'the page does not say: ' + s);
  says('5,532 red-team payloads heard as packets, none let in and none decoded');
  assert.deepEqual([f.d1.corpus.count, f.d1.corpus.admitted, f.d1.corpus.decoded], [5532, 0, 0]);
  assert.ok(code['page.mjs'].includes("if (f.d4) tile('s-d4', "), 'the tab\'s replay is said from the receipt, not written into the page');
  assert.ok(text.includes('in a real tab, the replay of the red team through the page\'s own handlers is on the receipt'));
  says('65 of 70 sealed messages routed right on a laptop');
  says('it was right 65 times in 70 on a laptop');
  assert.equal(f.m2.mindRight, 65);
  says('20,000 hostile and malformed replies tried, none left the list');
  says('Twenty thousand malformed and hostile replies were put through that door: every one ended on one of the seven routes');
  assert.deepEqual([f.m1.fuzzed, f.m1.outside, f.m1.throws], [20000, 0, 0]);
  says('the red team holds fifteen copies of the empty request');
  assert.equal(f.d2.corpus.admittedEmpty, 15);
  says('3,496 real hostile and malformed payloads');
  says('46 of the 70 sealed messages routed right');
  says('did better (65 of 70 on a laptop)');
  assert.equal(f.mind.t0Right, 46);
  says('routed 25 of 70 sealed messages right against a bar of 49');
  says('With it awake the site routed 44, two fewer than the keyword rule alone');
  assert.deepEqual([f.m3.mindRight, f.m3.valid, f.m3.siteRight, f.m3.t0Right], [25, 40, 44, 46]);
  const b = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase5b.json'), 'utf8')).facts;
  says('it lifts the site from 46 to 48 of Phase 5\'s 70 and from 41 to 43 of 70 fresh messages');
  says('but was right for only 42');
  assert.deepEqual([b.sealed.keywordRight, b.sealed.keywordsFirstRight, b.fresh.keywordRight, b.fresh.keywordsFirstRight, b.sealed.mindRight, b.sealed.valid], [46, 48, 41, 43, 42, 70]);
  assert.equal(f.corpus.tab, 3496);
});

test('the local and tab facts the receipt carries are committed files', () => {
  for (const k of ['d4', 'm2', 'm3', 'n3', 'q2', 'q3', 'v1']) if (f[k]) assert.ok(existsSync(join(HERE, 'local', k + '.json')), k);
  assert.ok(existsSync(join(HERE, 'redteam.json')));
});
