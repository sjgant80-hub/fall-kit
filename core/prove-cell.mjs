#!/usr/bin/env node
// core/prove-cell.mjs — one cell in its own operating-system process: `node core/prove-cell.mjs <role> <nodesDir>`.
// It boots its role (prove-roles.mjs) and answers one JSON request per line on stdin with one JSON line on stdout.
// It shares no memory with any other cell: everything another node learns from it crosses as bytes.
import { createInterface } from 'node:readline';
import { boot, opsOf } from './prove-roles.mjs';

const [role, nodesDir] = process.argv.slice(2);
const { node, extra } = await boot(role, nodesDir);
const call = opsOf(node, extra);
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
out({ ready: role, id: node.id });
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
