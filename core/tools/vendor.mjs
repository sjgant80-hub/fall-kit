#!/usr/bin/env node
// core/tools/vendor.mjs — the shared foundation is made of kernels the estate already gated, copied VERBATIM, never
// edited here. This tool writes them into core/vendor/ from clones of their source repos and records, for every file,
// the repo, the full commit and the SHA-256 in core/vendor/SOURCES.json.
//
//   node core/tools/vendor.mjs --from <dir>   copy from <dir>/<repo> clones (each must be clean, at the commit it has)
//   node core/tools/vendor.mjs --check        fetch each source repo at its pinned commit and demand every vendored
//                                             file is byte-identical to the file there (what CI runs)
//   node core/tools/vendor.mjs --pins         only re-hash core/vendor/ against SOURCES.json (no network)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(CORE, 'vendor'), SOURCES = join(VENDOR, 'SOURCES.json');
const OWNER = 'sjgant80-hub';

// what the foundation is made of: [vendored path, source repo, path in that repo, what it is]
export const PARTS = [
  ['light/codec.mjs', 'konomi-tongue', 'light/codec.mjs', 'LIGHT: the lossless context-mixing codec'],
  ['light/packet.mjs', 'konomi-tongue', 'light/packet.mjs', 'LIGHT: the signed packet and its verify-before-decode door'],
  ['light/vault.mjs', 'konomi-tongue', 'light/vault.mjs', 'LIGHT: many files as one solid stream, every hash checked'],
  ['light/sha256.mjs', 'konomi-tongue', 'light/sha256.mjs', 'SHA-256, pure'],
  ['immune/exchange.mjs', 'immune-exchange', 'src/exchange.mjs', 'the antibody bus: a signed bundle of refused attacks'],
  ['immune/subscribe.mjs', 'immune-exchange', 'src/subscribe.mjs', 'negative selection: adopt only what your own gate refuses'],
  ['wallet/wallet.mjs', 'the-wallet', 'wallet.mjs', 'identity as a capability and a budget it cannot cross'],
  ['ledger/contrib.mjs', 'kcc-mesh', 'contrib.mjs', 'the contribution ledger: signed, hash-chained, no money verb'],
  ['memory/fall-remember.mjs', 'fall-remember', 'fall-remember.mjs', 'geometric memory: twelve chambers, recall by resemblance of words'],
  ['memory/cam.mjs', 'fall-remember', 'cam.mjs', 'the balance metric fall-remember reports'],
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function writeFrom(from) {
  const sources = { kind: 'fall-kit.core.vendor', v: 1, note: 'Copied verbatim from each repo at the commit named. Never edit a vendored file; re-vendor.', files: [] };
  for (const [path, repo, src, what] of PARTS) {
    const dir = join(from, repo);
    if (git(dir, 'status', '--porcelain')) throw new Error(repo + ' has uncommitted changes — vendor from a clean clone');
    const commit = git(dir, 'rev-parse', 'HEAD');
    const bytes = execFileSync('git', ['show', 'HEAD:' + src], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });   // the committed blob, never the working copy (line endings)
    mkdirSync(dirname(join(VENDOR, path)), { recursive: true });
    writeFileSync(join(VENDOR, path), bytes);
    sources.files.push({ path, repo, commit, src, sha256: sha(bytes), what });
  }
  writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + '\n');
  return sources.files.length;
}

export function pins() {
  const s = JSON.parse(readFileSync(SOURCES, 'utf8')), bad = [];
  for (const f of s.files) {
    const p = join(VENDOR, f.path);
    if (!existsSync(p)) { bad.push(f.path + ': missing'); continue; }
    if (sha(readFileSync(p)) !== f.sha256) bad.push(f.path + ': does not match its pinned SHA-256');
  }
  return { files: s.files.length, bad };
}

function check() {
  const s = JSON.parse(readFileSync(SOURCES, 'utf8')), bad = [], tmp = join(tmpdir(), 'fall-kit-vendor-check');
  rmSync(tmp, { recursive: true, force: true });
  const fetched = new Map();
  for (const f of s.files) {
    const key = f.repo + '@' + f.commit;
    if (!fetched.has(key)) {
      const dir = join(tmp, f.repo + '-' + f.commit.slice(0, 7));
      mkdirSync(dir, { recursive: true });
      git(dir, 'init', '-q');
      git(dir, 'fetch', '-q', '--depth', '1', 'https://github.com/' + OWNER + '/' + f.repo + '.git', f.commit);
      fetched.set(key, dir);
    }
    let there;
    try { there = execFileSync('git', ['show', 'FETCH_HEAD:' + f.src], { cwd: fetched.get(key), stdio: ['ignore', 'pipe', 'ignore'] }); } catch { bad.push(f.path + ': not found at ' + key); continue; }
    if (sha(there) !== f.sha256) bad.push(f.path + ': differs from ' + f.repo + '/' + f.src + ' at ' + f.commit.slice(0, 7));
    if (sha(readFileSync(join(VENDOR, f.path))) !== f.sha256) bad.push(f.path + ': edited since it was vendored');
  }
  rmSync(tmp, { recursive: true, force: true });
  return { files: s.files.length, bad };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  if (a[0] === '--from') { console.log('vendored ' + writeFrom(a[1]) + ' files'); }
  else {
    const r = a[0] === '--check' ? check() : pins();
    for (const b of r.bad) console.log('  ✗ ' + b);
    console.log(r.bad.length ? 'VENDOR CHECK FAILED' : 'vendor: ' + r.files + ' files, each byte-identical to its source' + (a[0] === '--check' ? ' commit' : ' pin'));
    process.exit(r.bad.length ? 1 : 0);
  }
}
