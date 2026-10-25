#!/usr/bin/env node
// socket-snapshot.mjs — a dated record of every build on socket-builds.json, for anything that makes cards from the socket
// (Kardlings vendors it byte for byte). Per build: the branch and commit its site serves, every workflow run GitHub holds
// for that commit (deploy runs left out) and the verdict verdictOf gives them, its kard.json as the site serves it and
// what checkKard says of it, and what its live page answered. Runs, not just verdicts, are kept: a reader re-derives
// the verdict, and each run id is a receipt anyone can open on GitHub.
//   node socket-snapshot.mjs            (needs the gh CLI, signed in; reads public data only) → socket-kards.json
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { HOST, REPOS, checkKard, verdictOf } from './socket.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)), OWNER = 'sjgant80-hub';
const builds = JSON.parse(readFileSync(join(HERE, 'socket-builds.json'), 'utf8'));
const gh = (path) => new Promise((ok) => execFile('gh', ['api', path], { maxBuffer: 32 << 20 }, (e, out) => { try { ok(e ? null : JSON.parse(out)); } catch { ok(null); } }));
const DEPLOY = /^pages build and deployment$/i;

async function one(b) {
  const repo = await gh('repos/' + OWNER + '/' + b.name);
  const branch = b.branch || (repo && repo.default_branch) || null;
  const head = branch ? await gh('repos/' + OWNER + '/' + b.name + '/commits/' + encodeURIComponent(branch)) : null;
  const sha = head && typeof head.sha === 'string' ? head.sha : null;
  const listed = sha ? await gh('repos/' + OWNER + '/' + b.name + '/actions/runs?head_sha=' + sha + '&per_page=100') : null;
  const runs = (listed && Array.isArray(listed.workflow_runs) ? listed.workflow_runs : [])
    .filter((r) => !DEPLOY.test(r.name))
    .map((r) => ({ workflow: r.name, id: r.id, status: r.status, conclusion: r.conclusion }))
    .sort((a, c) => (a.workflow === c.workflow ? a.id - c.id : a.workflow < c.workflow ? -1 : 1));
  let kard = null, kardWhy = null, status = 0;
  try {
    const r = await fetch(HOST + b.name + '/kard.json', { cache: 'no-store' });
    if (r.ok) { const c = checkKard(await r.json()); if (c.ok) kard = c.kard; else kardWhy = c.why; } else kardWhy = 'no kard.json at its live page (' + r.status + ')';
  } catch (e) { kardWhy = 'no kard.json at its live page (' + e.message + ')'; }
  try { status = (await fetch(HOST + b.name + '/', { cache: 'no-store' })).status; } catch { status = 0; }
  return { name: b.name, category: b.category, retires: b.retires, live: HOST + b.name + '/', status, repo: REPOS + b.name, branch, sha, runs, verdict: verdictOf(runs), kard, kardWhy };
}

const rows = new Array(builds.length);
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (next < builds.length) { const i = next++; rows[i] = await one(builds[i]); } }));
const at = new Date().toISOString().slice(0, 19) + 'Z';
writeFileSync(join(HERE, 'socket-kards.json'), JSON.stringify({ kind: 'socket-kards.v1', at, builds: rows }, null, 1) + '\n');
const count = (k) => rows.filter((r) => r.verdict === k).length;
console.log('socket-kards.json · ' + at + ' · ' + rows.length + ' builds · kards ' + rows.filter((r) => r.kard).length
  + ' · tests green ' + count('green') + ', red ' + count('red') + ', running ' + count('running') + ', none ' + count('none')
  + ' · live 200: ' + rows.filter((r) => r.status === 200).length + (rows.some((r) => !r.sha) ? ' · NO COMMIT: ' + rows.filter((r) => !r.sha).map((r) => r.name).join(' ') : ''));
