import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightUse, vendoredPath, kitCopy, resolveFrom, namesLight, LIGHT, FOUNDATION, KIT_MESH } from './census.mjs';

const F = (path, text) => ({ path, text });
const KIT = (inside) => '<!-- FALL_KIT_BEGIN v1 · DO NOT EDIT THIS BLOCK MANUALLY -->\n<script>' + inside + '</script>\n<!-- FALL_KIT_END v1 -->';

test('what counts as naming LIGHT, and what is a copy', () => {
  for (const s of ["import { encode } from './light/codec.mjs';", 'import x from "../vendor/light/packet.mjs"', "from './vendor/fall-kit-core/vendor/light/vault.mjs'", "'light/codec.mjs'"]) assert.match(s, LIGHT, s);
  for (const s of ["'./lighthouse/codec.mjs'", "'./light/codec.js'", "'./light/other.mjs'", 'light/codec.mjs', "'./xlight/codec.mjs'"]) assert.doesNotMatch(s, LIGHT, s);
  for (const s of ["from '../vendor/fall-kit-core/node.mjs'", "import('/fall-kit/core/mesh.mjs')", "'/fall-kit/core/edge.mjs'"]) assert.match(s, FOUNDATION, s);
  for (const s of ["'./node.mjs'", "'../node.mjs'", "'/fall-kit/core/cells.mjs'", "'fall-kit-core/node.js'", '/fall-kit/core/node.mjs']) assert.doesNotMatch(s, FOUNDATION, s);
  assert.match('const M = "/fall-kit/core/mesh.mjs"', KIT_MESH);
  for (const p of ['vendor/light/codec.mjs', 'a/vendor/x.mjs', 'node_modules/y.js', 'x/node_modules/z.mjs']) assert.equal(vendoredPath(p), true, p);
  for (const p of ['src/vendors.mjs', 'vendorx/a.mjs', 'light/codec.mjs', 'myvendor/a.mjs', 5]) assert.equal(vendoredPath(p), false, String(p));
});

test('lightUse: own code counts; a vendored copy, or the inlined kit, is counted apart', () => {
  assert.deepEqual(lightUse([F('src/share.mjs', "import { seal } from '../vendor/light/packet.mjs';"), F('vendor/light/packet.mjs', "import { encode } from './codec.mjs';")]), { own: ['src/share.mjs'], vendored: true, kit: false }, 'the vendored door imports its codec where it points');
  assert.deepEqual(lightUse([F('vendor/fall-kit-core/node.mjs', "import { open } from './vendor/light/packet.mjs';")]), { own: [], vendored: true, kit: false }, 'only a copy of the foundation');
  assert.deepEqual(lightUse([F('node/konomi-node.mjs', "import { createNode } from '../vendor/fall-kit-core/node.mjs';")]), { own: ['node/konomi-node.mjs'], vendored: false, kit: false }, 'its own code runs the foundation node');
  assert.deepEqual(lightUse([F('index.html', '<html>' + KIT("const MESH = '/fall-kit/core/mesh.mjs'; import(MESH);") + '</html>')]), { own: [], vendored: false, kit: true }, 'the kit block is a copy');
  assert.deepEqual(lightUse([F('index.html', '<html>' + KIT('no mesh here') + '</html>')]), { own: [], vendored: false, kit: false }, 'an older kit without the LIGHT mesh');
  assert.deepEqual(lightUse([F('index.html', KIT("'/fall-kit/core/mesh.mjs'") + "<script type=module>import x from './light/codec.mjs'</script>")]), { own: ['index.html'], vendored: false, kit: true }, 'own code beside the kit block');
  assert.deepEqual(lightUse([F('fall-kit.js', "const MESH_MODULE = '/fall-kit/core/mesh.mjs';")]), { own: ['fall-kit.js'], vendored: false, kit: false }, 'the kit itself, in its own repo, is own code');
  assert.deepEqual(lightUse([F('b.mjs', "'./light/codec.mjs'"), F('a.mjs', "'./light/vault.mjs'"), F('c.mjs', 'nothing')]), { own: ['a.mjs', 'b.mjs'], vendored: false, kit: false }, 'sorted');
  assert.deepEqual(lightUse([F('vendor/x.mjs', 'nothing at all')]), { own: [], vendored: false, kit: false }, 'a copy that names no LIGHT');
  assert.deepEqual(lightUse([F('vendor/x.mjs', "'/fall-kit/core/node.mjs'")]).vendored, true);
  assert.deepEqual(lightUse([F('vendor/x.html', KIT("'/fall-kit/core/mesh.mjs'"))]), { own: [], vendored: true, kit: true }, 'a kit block in a vendored file: a copy, and it carries the mesh');
  assert.deepEqual(lightUse([F('two.html', KIT('one') + ' between ' + KIT("'/fall-kit/core/mesh.mjs'"))]), { own: [], vendored: false, kit: true }, 'two blocks, each its own');
  assert.deepEqual(lightUse([F('two.html', KIT('a') + " './light/codec.mjs' " + KIT('b'))]).own, ['two.html'], 'what sits between two blocks is own code');
  for (const junk of [null, 'x', [null, 5, { path: 1, text: '' }, { path: 'a', text: 5 }]]) assert.deepEqual(lightUse(junk), { own: [], vendored: false, kit: false });
});

test('the kit as its own file is a copy, except in the kit\'s own repository', () => {
  const kitJs = "const FALL_KIT_VERSION = '3.2.0'; const MESH_MODULE = '/fall-kit/core/mesh.mjs';";
  assert.deepEqual(lightUse([F('fall-kit.js', kitJs)], 'fallgarden'), { own: [], vendored: false, kit: true }, 'a linked build carries the kit, and with it the mesh');
  assert.deepEqual(lightUse([F('app/fall-kit.js', kitJs)], 'x'), { own: [], vendored: false, kit: true }, 'in a folder too');
  assert.deepEqual(lightUse([F('fall-kit.js', kitJs)], 'fall-kit'), { own: ['fall-kit.js'], vendored: false, kit: false }, 'the kit in its own repository is its own code');
  assert.deepEqual(lightUse([F('fall-kit.js', "const FALL_KIT_VERSION = '3.0.0';")], 'x'), { own: [], vendored: false, kit: false }, 'an older kit, no mesh');
  assert.deepEqual(lightUse([F('fall-kit.js', "const MESH_MODULE = '/fall-kit/core/mesh.mjs';")], 'x'), { own: ['fall-kit.js'], vendored: false, kit: false }, 'a file of that name that is not the kit is read as code');
  assert.deepEqual(lightUse([F('my-fall-kit.js', kitJs)], 'x').own, ['my-fall-kit.js'], 'only the kit\'s own file name');
  assert.deepEqual(lightUse([F('fall-kit.jsx', kitJs)], 'x').own, ['fall-kit.jsx']);
  assert.equal(kitCopy('fall-kit.js', kitJs, undefined), true, 'no repository named: a copy');
  assert.equal(kitCopy('fall-kit.js', "FALL_KIT_VERSION = 3", 'x'), false, 'the version is declared as text');
});

test('relative imports are read where they point', () => {
  assert.equal(resolveFrom('light/tools/memory.mjs', '../vault.mjs'), 'light/vault.mjs');
  assert.equal(resolveFrom('light/packet.mjs', './codec.mjs'), 'light/codec.mjs');
  assert.equal(resolveFrom('a/b/c.mjs', '../../d.mjs'), 'd.mjs');
  assert.equal(resolveFrom('a/b.mjs', '../../d.mjs'), null, 'out of the repository');
  assert.equal(resolveFrom('top.mjs', './x//y/./z.mjs'), 'x/y/z.mjs');
  assert.equal(resolveFrom('top.mjs', '..'), null);
  assert.deepEqual(lightUse([F('light/packet.mjs', "import { encode } from './codec.mjs';")]).own, ['light/packet.mjs'], 'LIGHT\'s own door imports its codec');
  assert.deepEqual(lightUse([F('light/tools/memory.mjs', "import { pack } from '../vault.mjs';")]).own, ['light/tools/memory.mjs']);
  assert.deepEqual(lightUse([F('light/page.mjs', "const m = await import('./packet.mjs');")]).own, ['light/page.mjs'], 'a dynamic import');
  assert.deepEqual(lightUse([F('light/x.mjs', "import './vault.mjs';")]).own, ['light/x.mjs'], 'an import for its effect');
  assert.deepEqual(lightUse([F('node/n.mjs', "import { createNode } from '../vendor/x/fall-kit-core/node.mjs';")]).own, ['node/n.mjs'], 'the foundation node, by where it points');
  assert.deepEqual(lightUse([F('src/a.mjs', "import { open } from './packet.mjs';")]).own, [], 'a packet.mjs that is not in a light/ folder is not LIGHT');
  assert.deepEqual(lightUse([F('src/a.mjs', "import { x } from './core/node.mjs';")]).own, [], 'nor is any core/node.mjs');
  assert.deepEqual(lightUse([F('light/a.mjs', "import { x } from './codec.js';")]).own, [], 'the codec is a module, .mjs');
  assert.deepEqual(lightUse([F('light/a.mjs', "import { x } from 'codec.mjs';")]).own, [], 'a bare name is a package, not a path');
  assert.deepEqual(lightUse([F('light/a.mjs', "import { x } from '../../../codec.mjs';")]).own, [], 'climbing out of the repository names nothing');
  assert.deepEqual(lightUse([F('light/a.mjs', "transform('./codec.mjs')")]).own, [], 'a path in a string is not an import');
  assert.deepEqual(lightUse([F('light/a.mjs', "import{x}from'./codec.mjs'")]).own, ['light/a.mjs'], 'however it is spaced');
  assert.deepEqual(lightUse([F('light/a.mjs', "import { a } from './a.mjs';\nimport { x } from './codec.mjs';")]).own, ['light/a.mjs'], 'any of its imports');
  assert.equal(namesLight('vendor/light/a.mjs', "from './codec.mjs'"), true);
  assert.equal(namesLight('x.mjs', 'nothing'), false);
});
