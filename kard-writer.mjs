#!/usr/bin/env node
// kard-writer.mjs — write a build's kard.json from what its own files show (socket.mjs measures; nothing is claimed).
//   node kard-writer.mjs <build-dir> --name <repo> --title "<title>" --retires "<what rented tool it retires>"
//                        --category "<category>" [--license MIT] [--page docs/index.html] [--check]
// The build's studs are read from the page its site serves (index.html, or --page when the site is served from a
// folder such as docs/) and the files git tracks in the repository. kard.json is written beside that page, so the site
// serves it at <live>/kard.json. --check writes nothing and exits 1 unless the kard.json already there is exactly what
// the files show now (a build's CI can run this); with no --name, who the build is comes from that kard.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { studsOf, kardOf, checkKard, kardText } from './socket.mjs';

const VALUED = new Set(['--name', '--title', '--retires', '--category', '--license', '--page']);
const args = process.argv.slice(2), o = { license: 'MIT', page: 'index.html' };
let dir = null, check = false;
for (let i = 0; i < args.length; i++) {
  if (VALUED.has(args[i])) o[args[i].slice(2)] = args[++i];
  else if (args[i] === '--check') check = true;
  else if (dir === null) dir = args[i];
}
const page = join(dir || '.', o.page), at = join(dirname(page), 'kard.json');
if (!dir || !existsSync(page)) { console.error('usage: node kard-writer.mjs <build-dir> --name <repo> --title "<title>" --retires "<text>" --category "<text>" [--license MIT] [--page docs/index.html] [--check]'); process.exit(1); }
if (check && !o.name) {   // re-measure a build against its own kard.json: who it is comes from the file, the studs from its files
  let had = null;
  try { had = JSON.parse(readFileSync(at, 'utf8')); } catch { /* missing or not JSON */ }
  const c = checkKard(had);
  if (!c.ok) { console.error('KARD MISSING · ' + basename(resolve(dir)) + ': ' + (had === null ? 'no readable kard.json beside ' + o.page : c.why)); process.exit(1); }
  for (const k of ['name', 'title', 'retires', 'category', 'license']) o[k] = had[k];
}
const html = readFileSync(page, 'utf8');
const files = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean);
const s = studsOf({ html, files });
if (!s.ok) { console.error('KARD REFUSED · ' + s.why); process.exit(1); }
const k = kardOf({ name: o.name, title: o.title, retires: o.retires, category: o.category, license: o.license }, s.studs);
if (!k.ok) { console.error('KARD REFUSED · ' + k.why); process.exit(1); }
const text = kardText(k.kard), missing = checkKard(k.kard).missing;
const said = k.kard.name + (missing.length ? ' lacks ' + missing.join(', ') : ' fits: every stud');
if (check) {
  const now = existsSync(at) ? readFileSync(at, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== text) { console.error('KARD DRIFT · ' + k.kard.name + ': kard.json is not what its files show now (rewrite it with kard-writer.mjs)'); process.exit(1); }
  console.log('KARD OK · ' + said);
  process.exit(0);
}
writeFileSync(at, text);
console.log('KARD WRITTEN · ' + said);
