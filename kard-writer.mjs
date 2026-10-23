#!/usr/bin/env node
// kard-writer.mjs — write a build's kard.json from what its own files show (socket.mjs measures; nothing is claimed).
//   node kard-writer.mjs <build-dir> --name <repo> --title "<title>" --retires "<what rented tool it retires>"
//                        --category "<category>" [--license MIT] [--check]
// The build's studs are read from its index.html and the files git tracks there. --check writes nothing and exits 1
// unless the kard.json already in the build is exactly what its files show now (a build's CI can run this).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { studsOf, kardOf, checkKard, kardText } from './socket.mjs';

const VALUED = new Set(['--name', '--title', '--retires', '--category', '--license']);
const args = process.argv.slice(2), o = { license: 'MIT' };
let dir = null, check = false;
for (let i = 0; i < args.length; i++) {
  if (VALUED.has(args[i])) o[args[i].slice(2)] = args[++i];
  else if (args[i] === '--check') check = true;
  else if (dir === null) dir = args[i];
}
if (!dir || !existsSync(join(dir, 'index.html'))) { console.error('usage: node kard-writer.mjs <build-dir> --name <repo> --title "<title>" --retires "<text>" --category "<text>" [--license MIT] [--check]'); process.exit(1); }
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const files = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean);
const s = studsOf({ html, files });
if (!s.ok) { console.error('KARD REFUSED · ' + s.why); process.exit(1); }
const k = kardOf({ name: o.name, title: o.title, retires: o.retires, category: o.category, license: o.license }, s.studs);
if (!k.ok) { console.error('KARD REFUSED · ' + k.why); process.exit(1); }
const text = kardText(k.kard), at = join(dir, 'kard.json'), missing = checkKard(k.kard).missing;
const said = k.kard.name + (missing.length ? ' lacks ' + missing.join(', ') : ' fits: every stud');
if (check) {
  const now = existsSync(at) ? readFileSync(at, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== text) { console.error('KARD DRIFT · ' + k.kard.name + ': kard.json is not what its files show now (rewrite it with kard-writer.mjs)'); process.exit(1); }
  console.log('KARD OK · ' + said);
  process.exit(0);
}
writeFileSync(at, text);
console.log('KARD WRITTEN · ' + said);
