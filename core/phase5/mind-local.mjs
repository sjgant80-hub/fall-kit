#!/usr/bin/env node
// core/phase5/mind-local.mjs — claim M2: the mind run by a small model on this machine (Ollama), once, on the 70 sealed
// messages, with the sealed prompt and options; every reply through the mind's own door (core/mind.mjs). Writes
// core/phase5/local/m2.json, which CI re-judges (it cannot run the model). Talks to Ollama on localhost only.
//
//   node core/phase5/mind-local.mjs [http://localhost:11434]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chatOf, decide, proposal, keywordsOf, keywordRoute, ROUTES, OPTIONS } from '../mind.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const HOST = process.argv[2] || 'http://localhost:11434';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(HOST)) throw new Error('the local mind runs on this machine only');
const { model } = claims.mind.models.local;
const routes = claims.mind.routes, messages = claims.mind.messages, kw = keywordsOf(routes);
const digest = createHash('sha256').update(JSON.stringify(messages)).digest('hex');

const get = async (path, body) => { const r = await fetch(HOST + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
const version = (await get('/api/version')).version;
const tag = (await get('/api/tags')).models.find((m) => m.name === model || m.name === model + ':latest');
if (!tag) throw new Error(model + ' is not on this machine');

const rows = [];
let mindRight = 0, valid = 0, outside = 0, t0Right = 0, siteRight = 0;
const t0 = Date.now();
for (const m of messages) {
  const r = await get('/api/chat', { model, messages: chatOf(routes, m.text), stream: false, format: OPTIONS.json ? 'json' : undefined, options: { temperature: OPTIONS.temperature, seed: OPTIONS.seed, num_predict: OPTIONS.maxTokens } });
  const reply = r.message && typeof r.message.content === 'string' ? r.message.content : null;
  const p = proposal(reply, ROUTES), d = decide(reply, m.text, kw, ROUTES), k = keywordRoute(m.text, kw, ROUTES);
  if (p.ok) valid++;
  if (!ROUTES.includes(d.route)) outside++;
  if (p.ok && p.route === m.route) mindRight++;
  if (k === m.route) t0Right++;
  if (d.route === m.route) siteRight++;
  rows.push({ text: m.text, want: m.route, reply, proposal: p.ok ? p.route : null, why: p.ok ? null : p.why, decided: d.route, by: d.by, keywords: k });
  process.stdout.write(p.ok && p.route === m.route ? '.' : 'x');
}
const seconds = Math.round((Date.now() - t0) / 100) / 10;
console.log('\n' + model + ': mind right ' + mindRight + '/70, valid ' + valid + ', keywords ' + t0Right + ', the site ' + siteRight + ', ' + seconds + ' s');
mkdirSync(join(HERE, 'local'), { recursive: true });
writeFileSync(join(HERE, 'local', 'm2.json'), JSON.stringify({
  kind: 'fall-kit.core.phase5.local', v: 1, claim: 'M2',
  what: 'The 70 sealed messages, each sent once to a small model on this machine (Ollama, localhost only) with the sealed prompt and options; every reply read through the mind\'s door, core/mind.mjs. Written by core/phase5/mind-local.mjs.',
  at: new Date().toISOString().slice(0, 10), runtime: 'Ollama ' + version + ' on this machine', model, modelDigest: tag.digest, quantization: tag.details ? tag.details.quantization_level : null, seconds,
  facts: { model, runtime: 'Ollama ' + version, messages: messages.length, digest, mindRight, valid, outside, t0Right, siteRight },
  rows,
}, null, 1) + '\n');
