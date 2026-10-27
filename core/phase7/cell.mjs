#!/usr/bin/env node
// core/phase7/cell.mjs — one of Phase 7's nodes in its own operating-system process: `node core/phase7/cell.mjs <role>
// <nodesDir> <world>` (world: estate, child or coupled). It boots its role (world.mjs) and answers one JSON request per
// line on stdin with one JSON line on stdout. It shares no memory with any other node: everything crosses as bytes.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modsOf } from './mods.mjs';
import { bootRole, extraOf } from './world.mjs';
import { opsOf } from '../cells.mjs';

const claims = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'claims.json'), 'utf8'));
const [role, nodesDir, world] = process.argv.slice(2);
const { node } = await bootRole(role, await modsOf(nodesDir, claims), claims, world);
const call = opsOf(node, extraOf(node));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
out({ ready: role, id: node.id, pid: process.pid });
const rl = createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on('line', (line) => {
  chain = chain.then(async () => {
    let req;
    try { req = JSON.parse(line); } catch { return; }
    try { out({ i: req.i, ok: true, result: await call(req.op, req.args) }); } catch (e) { out({ i: req.i, ok: false, error: String(e && e.message || e) }); }
  });
});
rl.on('close', () => { chain.then(() => process.exit(0)); });
