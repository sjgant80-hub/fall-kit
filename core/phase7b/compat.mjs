#!/usr/bin/env node
// core/phase7b/compat.mjs — claim R4: nothing that worked broke. Runs the --check of every phase that runs on core/node.mjs
// as it is now (Phases 2, 3, 3c, 4, 5, 5b, 6, 6b and 7), each as its own process, at HEAD, and writes
// core/phase7b/local/r4.json with the commit, the hash of core/node.mjs at it, and each check's exit and last line. Phases 1
// and 3b run from their own pinned commits (git worktrees in CI) and are not touched by a change here. It refuses to run
// on a working copy whose core/node.mjs is not the committed one, so the record names exactly the node it ran.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hex } from '../identity.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { PHASES } from './judge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT });
const committed = new Uint8Array(git('show', 'HEAD:core/node.mjs')), working = new Uint8Array(readFileSync(join(ROOT, 'core', 'node.mjs')));
if (hex(sha256(committed)) !== hex(sha256(working))) { console.error('core/node.mjs differs from HEAD: commit it first, so the record names the node it ran'); process.exit(1); }
const results = [];
for (const phase of PHASES) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, 'core', phase, 'measure.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1800000 });
  const last = (String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '').slice(0, 300);
  results.push({ phase, exit: r.status, last, seconds: Math.round((Date.now() - t0) / 1000) });
  console.log((r.status === 0 ? '  ok  ' : '  FAIL') + ' ' + phase + ' — ' + last);
}
mkdirSync(join(HERE, 'local'), { recursive: true });
const out = { kind: 'fall-kit.core.phase7b.local', v: 1, claim: 'R4', at: new Date().toISOString().slice(0, 19) + 'Z', commit: git('rev-parse', 'HEAD').toString().trim(), nodeSha: hex(sha256(committed)), results };
writeFileSync(join(HERE, 'local', 'r4.json'), JSON.stringify(out, null, 1) + '\n');
console.log(results.filter((r) => r.exit === 0).length + ' of ' + results.length + ' phase checks exited 0');
