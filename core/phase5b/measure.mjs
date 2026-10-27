#!/usr/bin/env node
// core/phase5b/measure.mjs — Phase 5b's measurement (core/phase5b/claims.json, sealed before this existed).
//
//   node core/phase5b/measure.mjs           judge, write core/receipts/phase5b.json
//   node core/phase5b/measure.mjs --check   do it again; exit 1 unless the receipt is the same, byte for byte
//
// B1–B4 are a browser tab's facts (core/phase5b/local/tab.json: the live page's window.p5.m5b, copied as it was). CI
// cannot run the model, so it re-derives every count from the tab's own raw replies, through the mind's door and both
// policies (core/mind.mjs), and a count that does not come out the same fails its claim. B5 measures Phase 5 again at
// this commit; B6 fuzzes the new policy. Glue: the verdicts are judge.mjs's (pure, gated).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../vendor/light/sha256.mjs';
import { rng } from '../phase2/corpus.mjs';
import { ROUTES, proposal, decide, decideKeywordsFirst, keywordRoute, keywordScore, keywordsOf } from '../mind.mjs';
import { receiptText, RECEIPT } from '../phase5/measure.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const phase5 = JSON.parse(readFileSync(join(CORE, 'phase5', 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase5b.json');
const enc = (s) => new TextEncoder().encode(s);
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const digestOf = (msgs) => hex(sha256(enc(JSON.stringify(msgs))));
const KW = keywordsOf(phase5.mind.routes);

/** Every count of one set, from the raw replies alone. */
export function recount(msgs, rows) {
  const t = { messages: msgs.length, digest: digestOf(msgs), valid: 0, outside: 0, mindRight: 0, keywordRight: 0, keywordsFirstRight: 0, mindFirstRight: 0, askedOfMind: 0, rowsDiffer: 0 };
  msgs.forEach((m, i) => {
    const r = rows[i] || {}, reply = typeof r.reply === 'string' ? r.reply : null;
    const pr = proposal(reply, ROUTES), kf = decideKeywordsFirst(reply, m.text, KW, ROUTES), mf = decide(reply, m.text, KW, ROUTES), kr = keywordRoute(m.text, KW, ROUTES);
    if (pr.ok) t.valid++;
    if (!ROUTES.includes(kf.route) || !ROUTES.includes(mf.route)) t.outside++;
    if (pr.ok && pr.route === m.route) t.mindRight++;
    if (kr === m.route) t.keywordRight++;
    if (kf.route === m.route) t.keywordsFirstRight++;
    if (mf.route === m.route) t.mindFirstRight++;
    if (keywordScore(m.text, KW, ROUTES) === 0) t.askedOfMind++;
    if (r.text !== m.text || r.want !== m.route || r.keywordsFirst !== kf.route || r.mindFirst !== mf.route || r.proposal !== (pr.ok ? pr.route : null)) t.rowsDiffer++;
  });
  return t;
}
const COUNTS = ['messages', 'digest', 'valid', 'outside', 'mindRight', 'keywordRight', 'keywordsFirstRight', 'mindFirstRight', 'askedOfMind'];

function b6() {
  const r = rng(17), parts = ['{', '}', '"route"', ':', '"about"', '"mesh"', '"admit"', '```', 'json', ' ', '\n', '[', ']', ',', '"', '__proto__', 'null', '1'];
  const words = ['what', 'step', 'digi', 'card', 'security', 'network', 'company', 'talk', 'hello', 'the', '', 'é', '<b>', 'DOES'];
  let outside = 0, throws = 0;
  for (let i = 0; i < 20000; i++) {
    let reply = '';
    for (let j = Math.floor(r() * 14); j > 0; j--) reply += parts[Math.floor(r() * parts.length)];
    let text = '';
    for (let j = Math.floor(r() * 8); j > 0; j--) text += words[Math.floor(r() * words.length)] + ' ';
    const a = i % 7 === 0 ? [reply] : i % 11 === 0 ? null : reply, b = i % 13 === 0 ? 42 : text;
    try { const d = decideKeywordsFirst(a, b, KW, ROUTES); if (!ROUTES.includes(d.route)) outside++; } catch { throws++; }
  }
  return { cases: 20000, outside, throws };
}

export async function measure() {
  const facts = {};
  const fresh = claims.fresh.messages;
  facts.digests = { sealed: digestOf(phase5.mind.messages), fresh: digestOf(fresh), freshKeywordRight: fresh.filter((m) => keywordRoute(m.text, KW, ROUTES) === m.route).length };
  const tabFile = join(HERE, 'local', 'tab.json');
  if (existsSync(tabFile)) {
    const tab = JSON.parse(readFileSync(tabFile, 'utf8'));
    for (const [name, msgs] of [['sealed', phase5.mind.messages], ['fresh', fresh]]) {
      const said = tab.facts[name], again = recount(msgs, tab.rows[name]);
      facts[name] = { ...said, recountDiffers: [...COUNTS.filter((k) => said[k] !== again[k]), ...(again.rowsDiffer ? ['rows ' + again.rowsDiffer] : [])] };
    }
    facts.tab = { from: 'core/phase5b/local/tab.json', where: tab.where, commit: tab.commit, model: tab.facts.model, runtime: tab.facts.runtime };
  }
  const p5 = await receiptText();
  const had = existsSync(RECEIPT) ? readFileSync(RECEIPT, 'utf8') : '';
  facts.b5 = { reproduced: had === p5.text, why: had === p5.text ? null : 'the committed core/receipts/phase5.json is not what Phase 5 measures now' };
  facts.b6 = b6();
  return facts;
}

function sealedIn() {
  try { return execFileSync('git', ['log', '--format=%H', '--diff-filter=A', '-1', '--', 'core/phase5b/claims.json'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
const stable = (x) => JSON.stringify(x, null, 1) + '\n';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const facts = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase5b.receipt', v: 1, sealedIn: sealedIn(), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  const text = stable(receipt);
  if (process.argv.includes('--check')) {
    if ((existsSync(OUT) ? readFileSync(OUT, 'utf8') : '') !== text) { console.error('the receipt differs from core/receipts/phase5b.json'); process.exit(1); }
    console.log('receipt reproduced byte for byte');
  } else writeFileSync(OUT, text);
}
