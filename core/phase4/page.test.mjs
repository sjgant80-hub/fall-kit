// core/phase4/page.test.mjs — Phase 4's live page, gated like Phase 3's: the policy allows only this origin, every
// control is wired, every element the engine writes exists, the visible FAQ is the schema's FAQ, relative links resolve,
// the engine fetches nothing off this origin, the tab re-judges the receipt as CI judged it, the page explains itself and
// carries the business case, and it names its credits (the data's authors too: CC BY 4.0), its supplier and its scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const js = readFileSync(join(HERE, 'page.mjs'), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test('the policy allows this origin only, and no inline script', () => {
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline/);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1]);
  assert.ok(inline.every((attrs) => /type="application\/ld\+json"/.test(attrs)), 'the only inline scripts are data (JSON-LD)');
});

test('every element the engine touches exists, and every control is wired', () => {
  const touched = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  for (const id of touched) assert.ok(ids.has(id), 'page.mjs writes #' + id + ' but the page has no such element');
  const buttons = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(buttons.length >= 1);
  for (const b of buttons) assert.match(js, new RegExp("\\$\\('" + b + "'\\)\\.addEventListener"), 'button #' + b + ' is not wired');
  assert.equal([...html.matchAll(/<button(?![^>]*\bid=)/g)].length, 0, 'a button with no id cannot be wired');
  for (const input of [...html.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((m) => m[1])) assert.ok(js.includes("'" + input + "'"), 'input #' + input + ' is read by nothing');
});

test('the visible FAQ is the schema’s FAQ', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2]]);
  assert.equal(shown.length, ld.mainEntity.length);
  assert.ok(shown.length >= 5);
  ld.mainEntity.forEach((q, i) => { assert.equal(shown[i][0], q.name); assert.equal(shown[i][1].replace(/&#39;/g, "'"), q.acceptedAnswer.text); });
});

test('relative links resolve, the data comes from this origin, and the engine names no other host', () => {
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"?#]+)/g)) {
    const t = m[1], p = join(HERE, t);
    assert.ok(existsSync(t.endsWith('/') ? join(p, 'index.html') : p), 'the page links to ' + t + ', which is not here');
  }
  const fetched = [...js.matchAll(/(?:getJson|fetch|import)\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 4);
  for (const u of fetched) assert.ok(u.startsWith('./') || u.startsWith('../') || u.startsWith('/'), u + ' is not on this origin');
  assert.match(js, /fetch\('\/dex-frontier\/' \+ path/, 'the data from dex-frontier on this same site');
  assert.match(js, /crypto\.subtle\.digest\('SHA-256'/, 'and every file checked against its pin before it is read');
  assert.doesNotMatch(js, /https?:\/\//, 'the engine names no other host');
  const imports = [...js.matchAll(/^import [^;]+ from '([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 6);
  for (const i of imports) assert.ok(existsSync(join(HERE, i)), 'page.mjs imports ' + i + ', which is not here');
});

test('the tab re-judges the receipt exactly as CI judged it', async () => {
  const { judge } = await import('./judge.mjs');
  const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase4.json'), 'utf8')), claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
  assert.match(js, /judge\(claims, receipt\.facts\)/, 'the page judges the receipt\'s facts as they are, as measure.mjs does');
  assert.deepEqual(judge(claims, receipt.facts).verdicts, receipt.verdicts);
});

test('the page explains itself, reads its failures plainly, and carries the business case', () => {
  for (const id of ['what', 'start', 'plant', 'how', 'life', 'receipt', 'blueprint', 'business', 'paper']) assert.ok(ids.has(id), 'no #' + id);
  for (const h of ['If you want to see it work', 'If you run the estate', 'The passes', 'Every decision, in order', 'The failures, read plainly', 'The cost case', 'Security and data protection, answered straight', 'Rolling it out', 'Support and ownership', 'Risks, answered', 'The case for the board', 'The data, credited (CC BY 4.0)']) assert.ok(html.includes('<h3>' + h + '</h3>'), 'no "' + h + '"');
  for (const role of ['CEO', 'CISO', 'CTO', 'CFO', 'COO', 'The teams']) assert.ok(html.includes('<td>' + role + '</td>'), 'no case for ' + role);
  assert.ok((html.match(/<svg viewBox/g) || []).length >= 1, 'a diagram of how it works');
  assert.match(html, /re-sealed/, 'the re-seal is said');
  assert.match(html, /an assumption, not a measurement/, 'the cost case says which figure is assumed');
});

test('credits, supplier, honest scope, and no price of our own', () => {
  assert.match(html, /Powered by the Konomi architecture, created by Thomas Frumkin/);
  assert.match(html, /AI Native Solutions/);
  assert.match(html, /MIT/);
  for (const who of ['Sakar', 'Moro', 'Becker', 'Yeh', 'Wang']) assert.match(html, new RegExp(who), 'the ' + who + ' dataset credited');
  assert.match(html, /not open-ended self-improvement/, 'the bound on the claim, said');
  assert.match(html, /not awareness/);
  assert.match(html, /does not stop/, 'what it does not stop is said');
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/value="[^"]*"/g, ''), /[£$€]\s?\d/, 'no prices on the page itself; the cost case prints its sums at run time');
  assert.doesNotMatch(html + js, /si-didy|KCC|kcc-/i, 'no private names');
});
