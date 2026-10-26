// core/phase3/page.test.mjs — Phase 3's live page, gated like Phase 2's: the policy allows only this origin, every
// control is wired, every element the engine writes exists, the visible FAQ is the schema's FAQ, relative links resolve,
// the engine fetches nothing off this origin, the page explains itself (what it is, start here, how it works, the
// receipt with its failures read plainly, blueprint, the business case, the paper) and names its credits, its supplier
// and its honest scope.
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
  const withId = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const b of withId) assert.match(js, new RegExp("\\$\\('" + b + "'\\)\\.addEventListener"), 'button #' + b + ' is not wired');
  const acts = [...html.matchAll(/<button[^>]*\bdata-m="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(acts.length >= 12, 'the mesh has its controls');
  const table = js.match(/const ACT = \{([\s\S]*?)\n\};/)[1];
  for (const a of acts) assert.match(table, new RegExp('(^|[\\s,{])' + a + ':'), 'button data-m="' + a + '" has no action');
  assert.match(js, /querySelectorAll\('\[data-m\]'\)/, 'the mesh buttons are wired');
  assert.equal([...html.matchAll(/<button(?![^>]*\bid=)(?![^>]*data-m=)/g)].length, 0, 'a button with neither an id nor an action cannot be wired');
  for (const input of [...html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1])) assert.ok(js.includes("'" + input + "'"), 'input #' + input + ' is read by nothing');
  for (const opt of [...(html.match(/<select id="m-at">([\s\S]*?)<\/select>/) || ['', ''])[1].matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1])) assert.match(js, new RegExp("\\['" + opt + "', \\d+"), 'the shared map can be written at ' + opt + ', which is not a node');
});

test('the visible FAQ is the schema’s FAQ', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2]]);
  assert.equal(shown.length, ld.mainEntity.length);
  assert.ok(shown.length >= 5);
  ld.mainEntity.forEach((q, i) => { assert.equal(shown[i][0], q.name); assert.equal(shown[i][1].replace(/&#39;/g, "'"), q.acceptedAnswer.text); });
});

test('relative links resolve, and the engine fetches nothing off this origin', () => {
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"?#]+)/g)) {
    const t = m[1];
    const p = join(HERE, t);
    assert.ok(existsSync(t.endsWith('/') ? join(p, 'index.html') : p), 'the page links to ' + t + ', which is not here');
  }
  const fetched = [...js.matchAll(/(?:getJson|fetch|import)\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 4);
  for (const u of fetched) assert.ok(u.startsWith('./') || u.startsWith('../') || u.startsWith('/'), u + ' is not on this origin');
  assert.doesNotMatch(js, /https?:\/\//, 'the engine names no other host');
  const imports = [...js.matchAll(/^import [^;]+ from '([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 6);
  for (const i of imports) assert.ok(existsSync(join(HERE, i)), 'page.mjs imports ' + i + ', which is not here');
});

test('the tab re-judges the receipt exactly as CI judged it', async () => {
  const { judge } = await import('./judge.mjs');
  const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase3.json'), 'utf8')), claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
  assert.match(js, /judge\(claims, receipt\.facts\)/, 'the page judges the receipt\'s facts as they are, as measure.mjs does');
  assert.deepEqual(judge(claims, receipt.facts).verdicts, receipt.verdicts);
});

test('the page explains itself, reads its failures plainly, and carries the business case', () => {
  for (const id of ['what', 'start', 'try', 'how', 'receipt', 'blueprint', 'business', 'paper', 'j3-line', 'j4-line', 'x1-line']) assert.ok(ids.has(id), 'no #' + id);
  for (const h of ['If you want to see it work', 'If you run the estate', 'The passes', 'The two that failed, J3 and J4, read plainly', 'The cost case', 'Security and data protection, answered straight', 'Rolling it out', 'Support and ownership', 'Risks, answered', 'The case for the board']) assert.ok(html.includes('<h3>' + h + '</h3>'), 'no "' + h + '"');
  for (const role of ['CEO', 'CISO', 'CTO', 'CFO', 'COO', 'The teams']) assert.ok(html.includes('<td>' + role + '</td>'), 'no case for ' + role);
  assert.ok((html.match(/<svg viewBox/g) || []).length >= 2, 'the mesh, and a diagram of how it works');
  assert.match(html, /Corrected before it was kept/, 'the measurement that was corrected says so');
});

test('credits, supplier, honest scope, and no price of our own', () => {
  assert.match(html, /Powered by the Konomi architecture, created by Thomas Frumkin/);
  assert.match(html, /AI Native Solutions/);
  assert.match(html, /MIT/);
  assert.match(html, /does not stop/, 'what it does not stop is said');
  assert.match(html, /A second device is a door you open/, 'what is not measured, said');
  assert.match(html, /outside red team/, 'who wrote the hostile nodes, said');
  assert.ok((html.match(/signed, not encrypted/g) || []).length >= 4, 'that a body is signed and not encrypted, so a compromised relay could read it, is said wherever the page talks about what a relay sees');
  assert.doesNotMatch(html, /never what is in it|holds no app data/, 'never the old sentences that read as confidentiality');
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /[£$€]\s?\d/, 'no prices on the page itself — the cost case prints only AWS list prices, at run time');
  assert.doesNotMatch(html + js, /si-didy|KCC|kcc-/i, 'no private names');
});

test('Phase 3b on this page: the fix explains itself, its receipt is re-judged in the tab as CI judged it, and its failure is read plainly', async () => {
  for (const id of ['fix', 'w-sum', 'w-rows', 'w-compare', 'w4-line', 't-dead']) assert.ok(ids.has(id), 'no #' + id);
  for (const h of ['What changed, in plain words', 'The receipt', 'Phase 3\'s routing against the routing that shares, on the same run', 'W4, the one that failed, read plainly', 'What it costs, and how close it came']) assert.ok(html.includes('<h3>' + h + '</h3>'), 'no "' + h + '"');
  assert.ok((html.match(/<svg viewBox/g) || []).length >= 3, 'the fix has its diagram');
  assert.match(html, /<a href="#fix">The fix<\/a>/, 'the nav reaches it');
  const { judge: judge3b } = await import('../phase3b/judge.mjs');
  const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase3b.json'), 'utf8')), claims = JSON.parse(readFileSync(join(HERE, '..', 'phase3b', 'claims.json'), 'utf8'));
  assert.match(js, /judge3b\(claims, receipt\.facts\)/, 'the page judges the Phase 3b receipt\'s facts as they are');
  assert.match(js, /getJson\('\.\.\/phase3b\/claims\.json'\), getJson\('\.\.\/receipts\/phase3b\.json'\)/);
  assert.deepEqual(judge3b(claims, receipt.facts).verdicts, receipt.verdicts);
  for (const v of receipt.verdicts.filter((x) => x.held === false)) assert.match(html, new RegExp('<h3>' + v.id + ', the one that failed, read plainly</h3>'), v.id + ' failed and the page must say why');
});

test('Phase 3c on this page: W4\'s fix, sealed as its own claims, re-judged in the tab as CI judged it; Phase 3b re-derived where it was measured', async () => {
  for (const id of ['v-sum', 'v-rows']) assert.ok(ids.has(id), 'no #' + id);
  assert.ok(html.includes('<h3>W4\'s fix, measured: Phase 3c</h3>'));
  const { judge: judge3c } = await import('../phase3c/judge.mjs');
  const receipt = JSON.parse(readFileSync(join(HERE, '..', 'receipts', 'phase3c.json'), 'utf8')), claims = JSON.parse(readFileSync(join(HERE, '..', 'phase3c', 'claims.json'), 'utf8'));
  assert.match(js, /judge3c\(claims, receipt\.facts\)/);
  assert.match(js, /getJson\('\.\.\/phase3c\/claims\.json'\), getJson\('\.\.\/receipts\/phase3c\.json'\)/);
  assert.deepEqual(judge3c(claims, receipt.facts).verdicts, receipt.verdicts);
  assert.match(html, /git worktree add \.phase3b 2960fae && node \.phase3b\/core\/phase3b\/measure\.mjs --check/, 'the page tells a stranger where Phase 3b\'s receipt is re-derived');
  assert.doesNotMatch(html, /<code>node core\/phase3b\/measure\.mjs --check<\/code>/, 'and never to re-derive it at HEAD, where W4 now holds');
});
