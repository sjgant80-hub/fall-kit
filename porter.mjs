#!/usr/bin/env node
/**
 * fall-kit porter · inlines fall-kit.js into target seed's index.html
 * Idempotent — skip if marker present. Run from anywhere with: node porter.mjs <seed-dir> [...more]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const MARKER_OPEN  = '<!-- FALL_KIT_BEGIN v1 · DO NOT EDIT THIS BLOCK MANUALLY -->';
const MARKER_CLOSE = '<!-- FALL_KIT_END v1 -->';

const KIT_PATH = new URL('./fall-kit.js', import.meta.url).pathname.replace(/^\//, '');
const kitSrc = readFileSync(KIT_PATH, 'utf8');

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const targets = args.filter(a => !a.startsWith('--'));
if (!targets.length) {
  console.error('usage: node porter.mjs [--update] <seed-dir> [...more]');
  console.error('example: node porter.mjs /c/Users/sjgan/Downloads/fallnote');
  console.error('--update: strip any existing FALL_KIT_BEGIN block and reinject the current kit');
  process.exit(1);
}

let okCount = 0, skipCount = 0, errCount = 0, updateCount = 0;
for (const dir of targets) {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) { console.log(`✗ ${basename(dir)} · no index.html`); errCount++; continue; }
  let html = readFileSync(indexPath, 'utf8');
  if (html.includes(MARKER_OPEN)) {
    if (!UPDATE) { console.log(`◌ ${basename(dir)} · already ported, skipping (use --update to refresh)`); skipCount++; continue; }
    // Strip old block(s) — handle multi-line marker block
    const re = new RegExp(MARKER_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + MARKER_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'g');
    html = html.replace(re, '');
    updateCount++;
  }
  // Pick insertion point: just before </head>, else just before </body>, else end
  const seedName = basename(dir);
  const installBlock = `${MARKER_OPEN}
<script>
${kitSrc}
</script>
<script>
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: ${JSON.stringify(seedName)} }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  })();
</script>
${MARKER_CLOSE}`;
  let injected;
  if (html.includes('</head>')) {
    injected = html.replace('</head>', `${installBlock}\n</head>`);
  } else if (html.includes('</body>')) {
    injected = html.replace('</body>', `${installBlock}\n</body>`);
  } else {
    injected = html + '\n' + installBlock + '\n';
  }
  writeFileSync(indexPath, injected, 'utf8');
  console.log(`✓ ${seedName} · ${UPDATE && updateCount > 0 ? 'refreshed' : 'ported'} · ${Math.round(installBlock.length / 1024)} KB`);
  okCount++;
}
console.log(`\nfall-kit porter done · ${okCount} ${UPDATE ? 'refreshed/ported' : 'ported'} · ${skipCount} skipped · ${errCount} errors`);
