// core/prove-roles.mjs — Node's way to load the two organs for the proof: their adapter modules and break-it's pinned
// key table, from clones of their repos in <nodesDir>. Everything else is core/cells.mjs, shared with the browser.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { bootRole, opsOf } from './cells.mjs';

export async function modsFrom(nodesDir) {
  return {
    breakit: await import(pathToFileURL(join(nodesDir, 'break-it', 'node', 'breakit-node.mjs')).href),
    konomi: await import(pathToFileURL(join(nodesDir, 'konomi-slm', 'node', 'konomi-node.mjs')).href),
    pins: JSON.parse(readFileSync(join(nodesDir, 'break-it', 'config', 'pubkeys.json'), 'utf8')),
  };
}

export async function boot(role, nodesDir) { return bootRole(role, await modsFrom(nodesDir)); }
export { opsOf };
