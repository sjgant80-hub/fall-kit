#!/usr/bin/env node
// core/phase4/vendor-dex.mjs — Phase 4 reads its five real datasets through dex-frontier's gated loaders, copied here
// VERBATIM under core/phase4/dex/ at the same paths they have in dex-frontier (so their own imports resolve unchanged),
// with the repo, the commit and the SHA-256 of every file pinned in core/phase4/dex/SOURCES.json. The data files are not
// copied: they are read from dex-frontier at the same commit, and each must match the SHA-256 pinned here.
//
//   node core/phase4/vendor-dex.mjs --from <dex-frontier clone>   copy the loaders from its committed blobs, pin it all
//   node core/phase4/vendor-dex.mjs --check                       fetch dex-frontier at the pinned commit: every loader
//                                                                 and every data file byte-identical to its pin
//   fetchData(dir)                                                 the data files at the pinned commit, checked, into dir
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)), DEX = join(HERE, 'dex'), SOURCES = join(DEX, 'SOURCES.json');
const REPO = 'dex-frontier', URL = 'https://github.com/sjgant80-hub/dex-frontier.git';
export const LOADERS = Object.freeze(['src/fresh.mjs', 'src/fresh2.mjs', 'src/fresh3.mjs', 'src/silos.mjs', 'vendor/living-seed/vendor/seed-library/seedlib.mjs', 'vendor/living-seed/vendor/seed-library/sha256.mjs']);
export const DATA = Object.freeze(['data/online_shoppers_intention.csv', 'data/bank-additional-full.csv', 'data/adult.data', 'data/adult.test', 'data/credit-default.csv', 'data/in-vehicle-coupon-recommendation.csv']);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });

function fetchAt(dir, commit) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', URL, commit);
  return (path) => git(dir, 'show', 'FETCH_HEAD:' + path);
}

function writeFrom(clone) {
  const commit = git(clone, 'rev-parse', 'HEAD').toString().trim();
  const show = (p) => git(clone, 'show', 'HEAD:' + p);
  const out = { kind: 'fall-kit.core.phase4.dex', v: 1, repo: REPO, commit, note: 'dex-frontier’s loaders, copied verbatim from its committed blobs; the data is read from dex-frontier at this commit and checked against these SHA-256.', loaders: [], data: [] };
  for (const p of LOADERS) { const b = show(p); mkdirSync(dirname(join(DEX, p)), { recursive: true }); writeFileSync(join(DEX, p), b); out.loaders.push({ path: p, sha256: sha(b) }); }
  for (const p of DATA) out.data.push({ path: p, sha256: sha(show(p)) });
  writeFileSync(SOURCES, JSON.stringify(out, null, 1) + '\n');
  return out;
}

/** The pinned data files, fetched at the pinned commit and checked, written into dir. → { ok, files } | { ok: false, bad } */
export function fetchData(dir) {
  const s = JSON.parse(readFileSync(SOURCES, 'utf8')), show = fetchAt(join(dir, '.git-fetch'), s.commit), bad = [];
  for (const f of s.data) {
    const b = show(f.path);
    if (sha(b) !== f.sha256) { bad.push(f.path + ' does not match its pin'); continue; }
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), b);
  }
  rmSync(join(dir, '.git-fetch'), { recursive: true, force: true });
  return bad.length ? { ok: false, bad } : { ok: true, files: s.data.length };
}

function check() {
  const s = JSON.parse(readFileSync(SOURCES, 'utf8')), tmp = join(tmpdir(), 'fall-kit-phase4-dex-check'), show = fetchAt(tmp, s.commit), bad = [];
  for (const f of s.loaders) {
    if (!existsSync(join(DEX, f.path)) || sha(readFileSync(join(DEX, f.path))) !== f.sha256) bad.push(f.path + ': not its pinned bytes here');
    if (sha(show(f.path)) !== f.sha256) bad.push(f.path + ': differs from dex-frontier at ' + s.commit.slice(0, 7));
  }
  for (const f of s.data) if (sha(show(f.path)) !== f.sha256) bad.push(f.path + ': differs from dex-frontier at ' + s.commit.slice(0, 7));
  rmSync(tmp, { recursive: true, force: true });
  return { loaders: s.loaders.length, data: s.data.length, bad };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  if (a[0] === '--from') { const o = writeFrom(a[1]); console.log('vendored ' + o.loaders.length + ' loaders and pinned ' + o.data.length + ' data files of dex-frontier@' + o.commit.slice(0, 7)); }
  else {
    const r = check();
    for (const b of r.bad) console.log('  ✗ ' + b);
    console.log(r.bad.length ? 'DEX CHECK FAILED' : 'dex: ' + r.loaders + ' loaders and ' + r.data + ' data files, each byte-identical to dex-frontier at its pinned commit');
    process.exit(r.bad.length ? 1 : 0);
  }
}
