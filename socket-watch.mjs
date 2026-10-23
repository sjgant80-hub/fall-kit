#!/usr/bin/env node
// socket-watch.mjs — re-measure every build on socket-builds.json against its own kard.json.
//   node socket-watch.mjs [name...]
// Each build is cloned fresh (shallow) and checked with kard-writer --check, which re-measures the studs from the
// build's own files and compares them with what its kard.json says. A missing, malformed or drifted kard.json is a
// failure, named; exit 1 if any build fails. CI runs this daily, so a kard that stops telling the truth turns red.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const all = JSON.parse(readFileSync(join(HERE, 'socket-builds.json'), 'utf8')).map((b) => b.name);
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;
const work = mkdtempSync(join(tmpdir(), 'socket-watch-'));
const sh = (cmd, args, cwd) => new Promise((ok) => execFile(cmd, args, { cwd, maxBuffer: 16 << 20 }, (e, out, err) => ok({ code: e ? (e.code || 1) : 0, out: (out + err).trim() })));

async function one(name) {
  const dir = join(work, name);
  const c = await sh('git', ['clone', '-q', '--depth', '1', 'https://github.com/sjgant80-hub/' + name + '.git', dir], work);
  if (c.code) return { name, ok: false, said: 'clone failed: ' + c.out.split('\n')[0] };
  const k = await sh(process.execPath, [join(HERE, 'kard-writer.mjs'), dir, '--check'], HERE);
  return { name, ok: k.code === 0, said: k.out.split('\n').pop() };
}

const results = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (next < names.length) { const n = names[next++]; results.push(await one(n)); } }));
rmSync(work, { recursive: true, force: true });
results.sort((a, b) => a.name.localeCompare(b.name));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.said);
const bad = results.filter((r) => !r.ok);
console.log('\n' + (results.length - bad.length) + '/' + results.length + ' builds: kard.json is what their files show');
process.exit(bad.length ? 1 : 0);
