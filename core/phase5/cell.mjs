#!/usr/bin/env node
// core/phase5/cell.mjs — one cell of Phase 5's mesh in its own operating-system process: `node core/phase5/cell.mjs
// <role> <nodesDir>`. It boots its role (sitenode.mjs) and answers one JSON request per line on stdin with one JSON line
// on stdout. It shares no memory with any other cell: everything another node learns from it crosses as bytes.
import { createInterface } from 'node:readline';
import { modsFrom } from '../prove-roles.mjs';
import { bootSite } from './sitenode.mjs';
import { opsOf } from '../cells.mjs';

const [role, nodesDir] = process.argv.slice(2);
const { node, extra } = await bootSite(role, await modsFrom(nodesDir));
const call = opsOf(node, extra);
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
