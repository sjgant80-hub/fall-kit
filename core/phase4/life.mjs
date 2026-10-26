#!/usr/bin/env node
// core/phase4/life.mjs — one life of the organism, as its own process (glue): the measurement starts two at once, the
// growing organism and the planted one, which share nothing and are each deterministic, so the run takes the time of the
// longer, not of both.
//
//   node core/phase4/life.mjs <data dir> <grow|planted> <out.json>
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from './data.mjs';
import { run } from './organism.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const [dir, mode, out] = process.argv.slice(2);
const claims = JSON.parse(readFileSync(join(HERE, 'claims.json'), 'utf8'));
const life = await run({ datasets: loadAll(dir), policy: claims.policy, grow: mode === 'grow' });
writeFileSync(out, JSON.stringify(life));
