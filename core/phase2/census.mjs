// core/phase2/census.mjs — Phase 2, pass 5: how far LIGHT reaches, counted honestly (claims C1–C3).
//
// The first census (konomi-tongue/light/tools/census.mjs) counted a repository as speaking LIGHT when any of its files
// named the codec — a vendored copy included, so a repository that only carries the foundation looked as if it spoke
// it. This census applies the sealed rule (C1): a repository speaks LIGHT only when ITS OWN code, outside any vendored
// copy, reads or writes LIGHT through the codec, the door, the vault, or the foundation's node, edge or mesh. Vendored
// means a file under a vendor/ or node_modules/ folder, the Fall Kit block inlined between its markers, or the kit
// carried as its own fall-kit.js file in any repository but the kit's own. A repository that carries LIGHT only
// through such a copy is counted apart: through the foundation, or through the kit. An import is read where it points:
// './packet.mjs' inside a light/ folder is LIGHT's door, as much as '../light/packet.mjs' from outside it.
//
// Two corrections to this instrument were made before its numbers were taken, both towards the sealed rule: the kit as
// its own file was being counted as a repository's own code (fallgarden), and imports relative to a file inside light/
// were not being read at all (konomi-tongue, LIGHT's own home).
//
//   lightUse(files, repo) → { own: [paths], vendored: bool, kit: bool }   files = [{ path, text }]   (pure, gated)
// The walk over this machine's clones is core/phase2/census-run.mjs (glue).

export const LIGHT = /(?:^|[/'"])(?:vendor\/)?light\/(?:codec|packet|vault)\.mjs['"]/m;
export const FOUNDATION = /(?:fall-kit-core|\/fall-kit\/core)\/(?:node|edge|mesh)\.mjs['"]/;
export const KIT_MESH = /\/fall-kit\/core\/mesh\.mjs/;
const KIT_BLOCK = /<!-- FALL_KIT_BEGIN[\s\S]*?<!-- FALL_KIT_END[^>]*-->/g;
export const vendoredPath = (p) => /(?:^|\/)(?:vendor|node_modules)\//.test(String(p));
/** The kit carried as its own file: a copy, unless this is the kit's own repository. */
export const kitCopy = (path, text, repo) => repo !== 'fall-kit' && /(?:^|\/)fall-kit\.js$/.test(path) && /FALL_KIT_VERSION = '/.test(text);
const LIGHT_AT = /(?:^|\/)light\/(?:codec|packet|vault)\.mjs$/, FOUNDATION_AT = /(?:^|\/)fall-kit-core\/(?:node|edge|mesh)\.mjs$/;
const SPEC = /(?:\bfrom|\bimport)\s*\(?\s*(['"])(\.{1,2}\/[^'"\s]+)\1/g;
/** A relative import resolved against the importing file's path, or null when it climbs out of the repository. */
export function resolveFrom(path, spec) {
  const out = String(path).split('/').slice(0, -1);
  for (const part of String(spec).split('/')) {
    if (part === '..') { if (out.length === 0) return null; out.pop(); } else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}
/** Does this file's code name LIGHT: by a path that says so, or by a relative import that resolves to it? */
export function namesLight(path, text) {
  if (LIGHT.test(text) || FOUNDATION.test(text)) return true;
  for (const m of text.matchAll(SPEC)) { const r = resolveFrom(path, m[2]); if (r !== null && (LIGHT_AT.test(r) || FOUNDATION_AT.test(r))) return true; }
  return false;
}

/** How a repository's files use LIGHT: its own files that do, and whether it carries LIGHT only as a copy. */
export function lightUse(files, repo) {
  const list = Array.isArray(files) ? files.filter((f) => f !== null && typeof f === 'object' && typeof f.path === 'string' && typeof f.text === 'string') : [];
  const own = [];
  let vendored = false, kit = false;
  for (const f of list) {
    const blocks = f.text.match(KIT_BLOCK) || [];
    if (blocks.some((b) => KIT_MESH.test(b))) kit = true;
    if (kitCopy(f.path, f.text, repo)) { if (KIT_MESH.test(f.text)) kit = true; continue; }
    if (vendoredPath(f.path)) { if (namesLight(f.path, f.text)) vendored = true; continue; }
    if (namesLight(f.path, f.text.replace(KIT_BLOCK, ''))) own.push(f.path);
  }
  return { own: own.sort(), vendored, kit };
}
