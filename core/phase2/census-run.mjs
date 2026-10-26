#!/usr/bin/env node
// core/phase2/census-run.mjs — the census's walk (glue): every clone of an estate repository on this machine, read from
// git's own list of tracked files, through census.mjs's lightUse (the rule, pure and gated). Writes
// core/phase2/local/census.json: counts, and for public repositories their names and one own file each. It reads
// clones that only exist here, so CI re-judges what it wrote and cannot re-measure it.
//
//   node core/phase2/census-run.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lightUse } from './census.mjs';

const HOME = 'C:/Users/sjgan', INDEX = HOME + '/.claude/projects/C--Users-sjgan--claude/memory/estate-index.json';
const BASES = [HOME, HOME + '/Downloads', HOME + '/Downloads/repos', HOME + '/socket-rollout'];
const OTHERS = ['kardlings', 'digi-card', 'pixelwhisperer'];   // led by other sessions: theirs to move, counted all the same

function census() {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8')), byName = new Map(idx.nodes.map((n) => [n.name, n]));
  const git = (d, a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  const clones = new Map();   // repo name → the clone with the newest commit
  for (const base of BASES) {
    let names = [];
    try { names = readdirSync(base); } catch { continue; }
    for (const n of names) {
      const d = join(base, n);
      try { if (!statSync(join(d, '.git')).isDirectory()) continue; } catch { continue; }
      let url = '', when = 0;
      try { url = git(d, ['remote', 'get-url', 'origin']).trim(); when = Number(git(d, ['log', '-1', '--format=%ct']).trim()) || 0; } catch { continue; }
      const m = /github\.com[/:]sjgant80-hub\/([^/.]+(?:\.[^/.]+)*?)(?:\.git)?$/.exec(url);
      if (!m || !byName.has(m[1])) continue;
      const had = clones.get(m[1]);
      if (!had || when > had.when) clones.set(m[1], { dir: d, when });
    }
  }
  const out = { speaks: [], privateSpeaks: 0, vendoredOnly: 0, kitOnly: 0, kitCarrying: 0 };
  for (const [name, c] of [...clones.entries()].sort()) {
    let tracked = [];
    try { tracked = git(c.dir, ['ls-files']).split('\n').filter((p) => /\.(?:m?js|cjs|html)$/.test(p)); } catch { continue; }
    const files = [];
    for (const p of tracked) { try { const full = join(c.dir, p); if (statSync(full).size < (4 << 20)) files.push({ path: p, text: readFileSync(full, 'utf8') }); } catch { /* gone from the working copy */ } }
    const u = lightUse(files, name), priv = byName.get(name).private === true;
    if (u.kit) out.kitCarrying++;
    if (u.own.length > 0) { if (priv) out.privateSpeaks++; else out.speaks.push({ name, file: u.own.find((p) => !/\.test\.m?js$/.test(p)) || u.own[0], files: u.own.length }); }
    else if (u.kit) out.kitOnly++;
    else if (u.vendored) out.vendoredOnly++;
  }
  return { kind: 'fall-kit.core.phase2.local', v: 1, claim: 'C1-C3', at: new Date().toISOString(), rule: 'core/phase2/census.mjs lightUse: own code only; vendor/, node_modules/, the inlined Fall Kit block and the kit carried as its own fall-kit.js are copies; relative imports are read where they point',
    repos: idx.nodes.length, read: clones.size, notRead: idx.nodes.length - clones.size, others: OTHERS.filter((o) => clones.has(o)),
    publicSpeaking: out.speaks.length, privateSpeaking: out.privateSpeaks, throughFoundationOnly: out.vendoredOnly, throughKitOnly: out.kitOnly, carryingTheKitMesh: out.kitCarrying, speaks: out.speaks };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = census();
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'local', 'census.json'), JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ ...r, speaks: r.speaks.map((s) => s.name + ' (' + s.file + ')') }, null, 1));
}
