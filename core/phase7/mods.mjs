// core/phase7/mods.mjs — Phase 7's nodes as Node loads them: the three repositories cloned at the commits
// core/phase7/nodes.json names (nodesOf), and their adapter modules, break-it's committed key table, the client's calendar
// and the sealed feeds (modsOf). The browser tab loads the same modules from this site instead (tab.mjs).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { feedSetsOf } from './world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
export const PINS = JSON.parse(readFileSync(join(HERE, 'nodes.json'), 'utf8')).nodes;

/** Clone each repository at its pinned commit (once), as committed: line ends untouched. → the folder that holds them. */
export function nodesOf() {
  const dir = join(ROOT, '.nodes7');
  for (const [repo, commit] of Object.entries(PINS)) {
    const d = join(dir, repo), git = (args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-C', d, ...args], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    if (!existsSync(join(d, '.git'))) { mkdirSync(d, { recursive: true }); git(['init', '-q']); git(['config', 'core.autocrlf', 'false']); }
    let at = '';
    try { at = git(['rev-parse', 'HEAD']).trim(); } catch { at = ''; }
    if (at !== commit) { git(['fetch', '-q', '--depth', '1', 'https://github.com/sjgant80-hub/' + repo + '.git', commit]); git(['checkout', '-q', '--force', commit]); }
    if (git(['status', '--porcelain']).trim() !== '') git(['checkout', '-q', '--force', commit]);
  }
  return dir;
}

export async function modsOf(nodesDir, claims) {
  const at = (...p) => pathToFileURL(join(nodesDir, ...p)).href;
  return {
    breakit: await import(at('break-it', 'node', 'breakit-node.mjs')),
    konomi: await import(at('konomi-slm', 'node', 'konomi-node.mjs')),
    wishwood: await import(at('wishwood', 'node', 'wishwood-node.mjs')),
    pins: JSON.parse(readFileSync(join(nodesDir, 'break-it', 'node', 'pins.json'), 'utf8')).pins,
    bookings: JSON.parse(readFileSync(join(nodesDir, 'wishwood', 'data', 'demo-calendar.json'), 'utf8')).bookings,
    feedSets: feedSetsOf(claims),
  };
}
