// core/page.test.mjs — the live page's own gate: the policy allows only this origin, every control is wired, every
// element the engine writes exists, the visible FAQ is the schema's FAQ, relative links resolve, the engine fetches
// nothing off this origin, and the page names its credits and its supplier and prices nothing of its own.
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
  assert.ok(buttons.length >= 2);
  for (const b of buttons) assert.match(js, new RegExp("\\$\\('" + b + "'\\)\\.addEventListener"), 'button #' + b + ' is not wired');
  for (const input of [...html.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1])) assert.ok(js.includes("'" + input + "'"), 'input #' + input + ' is read by nothing');
  assert.equal([...html.matchAll(/<button(?![^>]*\bid=)/g)].length, 0, 'a button with no id cannot be wired');
});

test('the visible FAQ is the schema’s FAQ', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/)[1]);
  const shown = [...html.matchAll(/<details><summary>([^<]+)<\/summary><p>([^<]+)<\/p><\/details>/g)].map((m) => [m[1], m[2]]);
  assert.equal(shown.length, ld.mainEntity.length);
  ld.mainEntity.forEach((q, i) => { assert.equal(shown[i][0], q.name); assert.equal(shown[i][1].replace(/&#39;/g, "'"), q.acceptedAnswer.text); });
});

test('relative links resolve, and the engine fetches nothing off this origin', () => {
  for (const m of html.matchAll(/(?:href|src)="(?!https?:|#|mailto:)([^"?#]+)/g)) {
    const t = m[1];
    if (t.startsWith('/')) continue;
    const p = join(HERE, t);
    assert.ok(existsSync(t.endsWith('/') ? join(p, 'index.html') : p) || t === 'receipts/foundation.json', 'the page links to ' + t + ', which is not here');
  }
  const fetched = [...js.matchAll(/(?:getJson|fetch|import)\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 8);
  for (const u of fetched) assert.ok(u.startsWith('./') || u.startsWith('/'), u + ' is not on this origin');
  assert.doesNotMatch(js, /https?:\/\/(?!github\.com)/, 'the engine names no other host');
});

test('credits, supplier, and no price of our own', () => {
  assert.match(html, /Powered by the Konomi architecture, created by Thomas Frumkin/);
  assert.match(html, /AI Native Solutions/);
  assert.match(html, /MIT/);
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /[£$€]\s?\d/, 'no prices on the page itself — the cost case prints only AWS list prices, at run time');
  assert.match(js, /const esc = /);
  assert.ok((js.match(/esc\(/g) || []).length >= 30, 'the engine escapes what it writes');
});
