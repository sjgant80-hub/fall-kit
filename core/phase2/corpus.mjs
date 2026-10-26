// core/phase2/corpus.mjs — the sealed corpus of Phase 2's first pass (core/phase2/claims.json, "corpus"), built the
// same way every time: the five public repositories cloned fresh at their sealed commits into .corpus/ (git-ignored),
// every tracked file under 1 MB read from git's own objects (never a working copy), then the cuts, the requests, the
// form bodies and the random bytes from fixed seeds. Glue: it reads and clones; what it builds is deterministic.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../vendor/light/sha256.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
const CLAIMS = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const PAGES = JSON.parse(readFileSync(join(HERE, 'pages.json'), 'utf8'));
const git = (dir, args, opts = {}) => execFileSync('git', ['-C', dir, ...args], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export const MAX_FILE = 1 << 20;

/** A seeded generator (mulberry32): the same seed, the same numbers, on every machine. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clone each sealed repository at its commit (once), and read its tracked files from the commit itself. */
export function sealedFiles() {
  const out = [];
  for (const [repo, commit] of Object.entries(CLAIMS.corpus.repos)) {
    const dir = join(ROOT, '.corpus', repo);
    if (!existsSync(join(dir, '.git'))) {
      mkdirSync(dir, { recursive: true });
      git(dir, ['init', '-q']);
    }
    let have = false;
    try { have = git(dir, ['cat-file', '-t', commit], { encoding: 'utf8' }).trim() === 'commit'; } catch { have = false; }
    if (!have) git(dir, ['fetch', '-q', '--depth', '1', 'https://github.com/sjgant80-hub/' + repo + '.git', commit]);
    const list = git(dir, ['ls-tree', '-r', '-l', commit], { encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const line of list) {
      const m = /^\d+ blob ([0-9a-f]{40})\s+(\d+)\t(.+)$/.exec(line);
      if (!m || Number(m[2]) >= MAX_FILE) continue;
      out.push({ repo, path: m[3], bytes: new Uint8Array(git(dir, ['cat-file', 'blob', m[1]])) });
    }
  }
  out.sort((a, b) => (a.repo + '/' + a.path < b.repo + '/' + b.path ? -1 : a.repo + '/' + a.path > b.repo + '/' + b.path ? 1 : 0));
  return out;
}

/** What format a file is in, by its name. */
export function kindOf(path) {
  const p = path.toLowerCase();
  if (p.endsWith('.json')) return 'JSON';
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'HTML';
  if (p.endsWith('.md')) return 'Markdown';
  if (/\.(m|c)?js$/.test(p)) return 'JavaScript';
  if (p.endsWith('.csv')) return 'CSV';
  return 'other';
}

const enc = (s) => new TextEncoder().encode(s);

/** The four sealed cuts of one file. */
export function cutsOf(bytes) {
  const n = bytes.length, h = Math.floor(n / 2), w = Math.max(0, h - 256);
  const flipped = bytes.slice();
  for (let i = 9; i < n; i += 10) flipped[i] ^= 0xff;
  return [['first-half', bytes.slice(0, h)], ['second-half', bytes.slice(h)], ['middle-512', bytes.slice(w, w + 512)], ['every-tenth-flipped', flipped]];
}

/** The whole sealed corpus: [{ id, kind, bytes }], in one fixed order, and the files it came from. */
export function buildCorpus() {
  const files = sealedFiles();
  const payloads = [];
  for (const f of files) {
    const kind = kindOf(f.path), id = f.repo + '/' + f.path;
    payloads.push({ id, kind, bytes: f.bytes });
    for (const [cut, b] of cutsOf(f.bytes)) payloads.push({ id: id + '#' + cut, kind, bytes: b });
  }
  for (const page of PAGES.pages) {
    const body = 'q=hello&from=' + encodeURIComponent(page) + '&n=1';
    payloads.push({ id: 'GET /' + page + '/', kind: 'HTTP', bytes: enc('GET /' + page + '/ HTTP/1.1\r\nHost: ' + PAGES.host + '\r\nUser-Agent: fall-kit-phase2-corpus\r\nAccept: */*\r\n\r\n') });
    payloads.push({ id: 'POST /' + page + '/', kind: 'HTTP', bytes: enc('POST /' + page + '/ HTTP/1.1\r\nHost: ' + PAGES.host + '\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ' + enc(body).length + '\r\n\r\n' + body) });
  }
  const r2 = rng(2), word = (r, n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(r() * 36)]).join('');
  for (let i = 0; i < 500; i++) {
    const pairs = Array.from({ length: 1 + Math.floor(r2() * 8) }, () => word(r2, 1 + Math.floor(r2() * 8)) + '=' + encodeURIComponent(word(r2, Math.floor(r2() * 24))));
    payloads.push({ id: 'form#' + i, kind: 'form', bytes: enc(pairs.join('&')) });
  }
  const r3 = rng(3);
  for (let i = 0; i < 1000; i++) {
    const b = new Uint8Array(1 + Math.floor(r3() * 4096));
    for (let j = 0; j < b.length; j++) b[j] = Math.floor(r3() * 256);
    payloads.push({ id: 'random#' + i, kind: 'random', bytes: b });
  }
  const digest = hex(sha256(enc(payloads.map((p) => p.id + ':' + hex(sha256(p.bytes))).join('\n'))));
  return { files, payloads, digest };
}

/** Every JSON value in the corpus's JSON files, each file's value then its direct children, in the fixed order. */
export function jsonValues(files) {
  const out = [];
  for (const f of files) {
    if (kindOf(f.path) !== 'JSON') continue;
    let v;
    try { v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(f.bytes)); } catch { continue; }
    out.push({ id: f.repo + '/' + f.path, value: v, bytes: f.bytes });
    const kids = Array.isArray(v) ? v.map((x, i) => [i, x]) : v !== null && typeof v === 'object' ? Object.entries(v) : [];
    for (const [k, x] of kids) out.push({ id: f.repo + '/' + f.path + '#' + k, value: x, bytes: null });
  }
  return out;
}
