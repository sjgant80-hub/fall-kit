#!/usr/bin/env node
// core/tools/vendor-into.mjs — put the shared foundation into a node's repo, byte for byte, from this repo's COMMITTED
// blobs (never the working copy), and pin it: <repo>/vendor/fall-kit-core/ plus FALL-KIT-CORE.json naming the fall-kit
// commit and every file's SHA-256. A node's own tests check the pins; core/prove.mjs checks that every node carries
// exactly the foundation this repo has (the one-foundation rule).
//
//   node core/tools/vendor-into.mjs <repoDir>
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });

export function foundationFiles() {
  const s = JSON.parse(git('show', 'HEAD:core/vendor/SOURCES.json').toString('utf8'));
  // edge.mjs joined in Phase 2, relay.mjs and roster.mjs in Phase 3 (a node frames for a relay, and matches the founder's
  // roster with rosterChanges); Phase 1's receipt (core/prove.mjs) names the foundation as Phase 1 pinned it
  return ['antibody.mjs', 'edge.mjs', 'identity.mjs', 'node.mjs', 'relay.mjs', 'roster.mjs', 'vendor/SOURCES.json', ...s.files.map((f) => 'vendor/' + f.path)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = process.argv[2];
  if (!target) { console.error('usage: node core/tools/vendor-into.mjs <repoDir>'); process.exit(2); }
  if (git('status', '--porcelain', '--', 'core').toString().trim()) { console.error('core/ has uncommitted changes: commit them first, so the pin names what is copied'); process.exit(1); }
  const commit = git('rev-parse', 'HEAD').toString().trim();
  const out = join(target, 'vendor', 'fall-kit-core'), files = {};
  for (const f of foundationFiles()) {
    const bytes = git('show', 'HEAD:core/' + f);
    mkdirSync(dirname(join(out, f)), { recursive: true });
    writeFileSync(join(out, f), bytes);
    files[f] = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(join(out, 'FALL-KIT-CORE.json'), JSON.stringify({ kind: 'fall-kit.core.vendored', from: 'https://github.com/sjgant80-hub/fall-kit/tree/' + commit + '/core', commit, note: 'The estate’s shared foundation, copied verbatim. Never edit; re-vendor with fall-kit’s core/tools/vendor-into.mjs.', files }, null, 1) + '\n');
  writeFileSync(join(out, 'NOTICE'), 'The shared foundation of the estate (fall-kit/core), MIT. Vendored verbatim from\n' + 'https://github.com/sjgant80-hub/fall-kit at ' + commit + '.\nPowered by the Konomi architecture, created by Thomas Frumkin.\n');
  console.log('vendored ' + Object.keys(files).length + ' files of fall-kit/core @' + commit.slice(0, 7) + ' into ' + out);
}
