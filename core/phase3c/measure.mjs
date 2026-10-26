#!/usr/bin/env node
// core/phase3c/measure.mjs — Phase 3c's measurement (core/phase3c/claims.json, sealed before this existed).
//
//   node core/phase3c/measure.mjs           re-run Phase 3b's measurement with the change, judge, write core/receipts/phase3c.json
//   node core/phase3c/measure.mjs --check   run it again and exit 1 unless the receipt is the same, byte for byte
//
// Phase 3b's measurement exactly as it is (core/phase3b/measure.mjs: Phase 3's harness, both routings, W4's false
// notes), run on the changed node. V1 takes its W4 facts; V2 reduces its W1, W2 and W3 facts to the SHA-256 of their
// canonical JSON and sets them beside the same digests of Phase 3b's committed receipt, which this never writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hex } from '../identity.mjs';
import { stableJson } from '../node.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { measure as measure3b } from '../phase3b/measure.mjs';
import { judge } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), CORE = join(HERE, '..'), ROOT = join(CORE, '..');
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const OUT = join(CORE, 'receipts', 'phase3c.json');
const digest = (x) => hex(sha256(new TextEncoder().encode(stableJson(x))));
const PARTS = ['w1', 'w2', 'w3'];

export async function measure() {
  const was = JSON.parse(readFileSync(join(CORE, 'receipts', 'phase3b.json'), 'utf8')).facts;
  const now = await measure3b();
  return { passes: [1], v1: now.w4, v2: { now: Object.fromEntries(PARTS.map((k) => [k, digest(now[k])])), was: Object.fromEntries(PARTS.map((k) => [k, digest(was[k])])) } };
}

const sealedIn = () => execFileSync('git', ['-C', ROOT, 'log', '--diff-filter=A', '--format=%H', '--', 'core/phase3c/claims.json'], { encoding: 'utf8' }).trim().split('\n').pop();
const stable = (x) => JSON.stringify(x, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const facts = await measure();
  const j = judge(claims, facts);
  const receipt = { kind: 'fall-kit.core.phase3c.receipt', v: 1, sealedIn: sealedIn(), facts, verdicts: j.verdicts, held: j.held, failed: j.failed, open: j.open };
  for (const v of j.verdicts) console.log((v.held === true ? '  HELD    ' : v.held === false ? '  FAILED  ' : '  open    ') + v.id + ' — ' + v.measured);
  console.log(j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet');
  const text = stable(receipt);
  if (process.argv.includes('--check')) {
    let committed = '';
    try { committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n'); } catch { /* none yet */ }
    console.log(committed === text ? 'PHASE 3c RECEIPT REPRODUCED byte for byte' : 'PHASE 3c RECEIPT DIFFERS from the committed one');
    process.exit(committed === text ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log('wrote core/receipts/phase3c.json');
}
