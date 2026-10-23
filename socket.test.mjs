// socket.test.mjs — the Lego socket: studs measured from a build's own files, a kard made from them, and every kard
// checked field by field; anything else refused by name, nothing thrown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KARD, STUDS, HOST, REPOS, studsOf, present, kardOf, checkKard, kardText } from './socket.mjs';

const KIT = '<!-- FALL_KIT_BEGIN v1 · DO NOT EDIT THIS BLOCK MANUALLY -->\n<script>/*!\n * Fall Kit · v3.0.0 · the shared cascade\n */</script>\n<!-- FALL_KIT_END v1 -->';
const FULL = { html: '<html>' + KIT + '<script>indexedDB.open("x"); new RTCPeerConnection();</script></html>', files: ['index.html', '.github/workflows/gate.yml', '.github/workflows/ci.yaml', 'test.mjs', 'src/a.test.mjs', 'tools/x.mjs'] };
const BUILD = { name: 'fallnote', title: 'FallNote', retires: 'a notes and database workspace (Notion-style)', category: 'Office, notes and design', license: 'MIT' };
const studsFull = () => studsOf(FULL).studs;
const kard = (over = {}) => ({ ...kardOf(BUILD, studsFull()).kard, ...over });   // a valid kard, then the change under test
const why = (x) => checkKard(x).why;

test('the standard: kard.v1, five studs, one host and one home for the code', () => {
  assert.equal(KARD, 'kard.v1');
  assert.deepEqual(STUDS, ['brain', 'manifest', 'mesh', 'memory', 'proof']); assert.ok(Object.isFrozen(STUDS));
  assert.equal(HOST, 'https://sjgant80-hub.github.io/'); assert.equal(REPOS, 'https://github.com/sjgant80-hub/');
});

test('studs are measured from the files: an inlined brain and its version, mesh, memory, workflows and tests', () => {
  assert.deepEqual(studsOf(FULL), { ok: true, studs: { brain: { how: 'inline', version: '3.0.0' }, mesh: { device: true, peer: true }, memory: { indexeddb: true, localstorage: false }, proof: { workflows: 2, tests: 2 } } });
  assert.deepEqual(studsOf({ html: '<script src="https://sjgant80-hub.github.io/fall-kit/shim.js" defer></script>', files: [] }).studs.brain, { how: 'shim', version: null });
  assert.deepEqual(studsOf({ html: '<script defer src=\'https://sjgant80-hub.github.io/fall-kit/shim.js\'></script>', files: [] }).studs.brain.how, 'shim');
  assert.equal(studsOf({ html: '<p>load https://sjgant80-hub.github.io/fall-kit/shim.js</p>', files: [] }).studs.brain.how, 'none', 'naming the shim is not loading it');
  assert.deepEqual(studsOf({ html: '<script src="fall-kit.js" onerror="x"></script>', files: [] }).studs.brain, { how: 'linked', version: null });
  assert.equal(studsOf({ html: '<script src="https://sjgant80-hub.github.io/fall-kit/fall-kit.js"></script>', files: [] }).studs.brain.how, 'linked');
  assert.equal(studsOf({ html: '<script src="my-fall-kit.json"></script><p>fall-kit.js</p>', files: [] }).studs.brain.how, 'none');
  assert.equal(studsOf({ html: '<script src="fall-kit.js"></script><script src="/fall-kit/shim.js"></script>', files: [] }).studs.brain.how, 'shim', 'a shim beside a linked copy is named a shim');
  assert.equal(studsOf({ html: '<script src="fall-kit.js"></script>', files: [] }).studs.mesh.device, true, 'a linked kit brings the same-device mesh');
  const bare = studsOf({ html: '<p>hi</p>', files: ['README.md', '.github/workflows/sub/x.yml', '.github/x.yml', 'nottest.mjs', 'attest.mjs'] }).studs;
  assert.deepEqual(bare, { brain: { how: 'none', version: null }, mesh: { device: false, peer: false }, memory: { indexeddb: false, localstorage: false }, proof: { workflows: 0, tests: 0 } });
  assert.deepEqual(studsOf({ html: 'new BroadcastChannel("c"); localStorage.x', files: [] }).studs.mesh, { device: true, peer: false });
  assert.equal(studsOf({ html: 'localStorage', files: [] }).studs.memory.localstorage, true);
  const kitOnly = studsOf({ html: '<!-- FALL_KIT_BEGIN v1 -->\n<script>/* Fall Kit · v3.0.0 */ localStorage; indexedDB; new RTCPeerConnection(); new BroadcastChannel("x")</script>\n<!-- FALL_KIT_END v1 --><p>a page</p>', files: [] }).studs;
  assert.deepEqual(kitOnly.memory, { indexeddb: false, localstorage: false }, 'the kit keeping its own settings is not the build keeping your work');
  assert.deepEqual(kitOnly.mesh, { device: true, peer: false }, 'the kit brings the same-device mesh; cross-device is the build’s own');
  assert.equal(kitOnly.brain.version, '3.0.0');
  const both = studsOf({ html: 'indexedDB.open(1)<!-- FALL_KIT_BEGIN v1 -->x<!-- FALL_KIT_END v1 -->new RTCPeerConnection()<!-- FALL_KIT_BEGIN v1 -->y<!-- FALL_KIT_END v1 -->localStorage', files: [] }).studs;
  assert.deepEqual([both.memory, both.mesh.peer], [{ indexeddb: true, localstorage: true }, true], 'code on either side of every kit block is the build’s');
  assert.equal(studsOf({ html: '<!-- FALL_KIT_BEGIN v1 --><!-- FALL_KIT_END v1 --><!-- FALL_KIT_END v1 -->BroadcastChannel', files: [] }).studs.mesh.device, true);
  assert.deepEqual(studsOf({ html: '<!-- FALL_KIT_BEGIN v1 --> no version line', files: [] }).studs.brain, { how: 'inline', version: null });
  assert.equal(studsOf({ html: '', files: ['test.js', 'x/test.cjs', 'y.test.js'] }).studs.proof.tests, 3);
  assert.equal(studsOf({ html: '', files: [5, null, 'test.mjs'] }).studs.proof.tests, 1, 'only paths are read');
  for (const b of [null, 5, 'x', {}, { html: 5, files: [] }, { html: '', files: 'x' }]) assert.equal(studsOf(b).why, 'a build is its index.html and the list of its files');
});

test('present: which studs a build has, in order; the manifest is always there', () => {
  assert.deepEqual(present(studsFull()), STUDS);
  const s = studsOf({ html: '<p>', files: [] }).studs;
  assert.deepEqual(present(s), ['manifest']);
  assert.deepEqual(present({ ...s, memory: { indexeddb: false, localstorage: true } }), ['manifest', 'memory']);
  assert.deepEqual(present({ ...s, mesh: { device: false, peer: true }, proof: { workflows: 1, tests: 0 } }), ['manifest', 'mesh', 'proof']);
  assert.deepEqual(present({ ...s, brain: { how: 'shim', version: null } }), ['brain', 'manifest']);
  for (const junk of [null, 5, 'x', []]) assert.deepEqual(present(junk), []);
  assert.deepEqual(present({ brain: 5, mesh: { device: 'yes' }, memory: null, proof: { workflows: '3' } }), ['manifest']);
});

test('a kard: made from a build and its studs, fits exactly when every stud is there', () => {
  const k = kardOf(BUILD, studsFull());
  assert.equal(k.ok, true);
  assert.deepEqual(Object.keys(k.kard), ['kind', 'name', 'title', 'retires', 'category', 'license', 'live', 'repo', 'studs', 'fits']);
  assert.equal(k.kard.live, 'https://sjgant80-hub.github.io/fallnote/'); assert.equal(k.kard.repo, 'https://github.com/sjgant80-hub/fallnote');
  assert.equal(k.kard.fits, true);
  assert.deepEqual(checkKard(k.kard), { ok: true, kard: k.kard, missing: [] });
  const thin = kardOf(BUILD, studsOf({ html: 'localStorage', files: [] }).studs);
  assert.equal(thin.kard.fits, false); assert.deepEqual(checkKard(thin.kard).missing, ['brain', 'mesh', 'proof']);
  assert.equal(kardOf(null, studsFull()).why, 'a kard is made from a build');
  assert.equal(kardOf({ ...BUILD, name: 'Bad Name' }, studsFull()).why, 'a kard names its repository: lowercase letters, digits, dots, dashes and underscores');
  assert.equal(kardText(k.kard), JSON.stringify(k.kard, null, 2) + '\n');
});

test('a kard that is not exactly a kard is refused, by name', () => {
  assert.equal(why(null), 'a kard has exactly kind, name, title, retires, category, license, live, repo, studs and fits');
  assert.equal(why({ ...kard(), extra: 1 }), 'a kard has exactly kind, name, title, retires, category, license, live, repo, studs and fits');
  const { fits, ...noFits } = kard(); assert.equal(why(noFits), 'a kard has exactly kind, name, title, retires, category, license, live, repo, studs and fits');
  assert.equal(why(kard({ kind: 'kard.v2' })), 'a kard is a kard.v1');
  for (const name of ['', 'A', '-x', 5, 'x'.repeat(101)]) assert.equal(why(kard({ name })), 'a kard names its repository: lowercase letters, digits, dots, dashes and underscores');
  assert.equal(checkKard(kard({ name: 'x'.repeat(100), live: HOST + 'x'.repeat(100) + '/', repo: REPOS + 'x'.repeat(100) })).ok, true);
  for (const title of ['', ' T', 'T ', 'x'.repeat(81), 5]) assert.equal(why(kard({ title })), 'a kard’s title is 1 to 80 characters, no space at either end');
  assert.equal(checkKard(kard({ title: 'x'.repeat(80) })).ok, true);
  assert.equal(checkKard(kard({ title: 'X', retires: 'y', category: 'z', license: 'M' })).ok, true, 'one character is enough');
  for (const retires of ['', 'x'.repeat(161)]) assert.equal(why(kard({ retires })), 'a kard says what rented tool it retires, in 1 to 160 characters');
  assert.equal(checkKard(kard({ retires: 'x'.repeat(160) })).ok, true);
  for (const category of ['', 'x'.repeat(61)]) assert.equal(why(kard({ category })), 'a kard’s category is 1 to 60 characters');
  assert.equal(checkKard(kard({ category: 'x'.repeat(60) })).ok, true);
  for (const license of ['', 'x'.repeat(21)]) assert.equal(why(kard({ license })), 'a kard names its licence in 1 to 20 characters');
  assert.equal(checkKard(kard({ license: 'x'.repeat(20) })).ok, true);
  assert.equal(why(kard({ live: 'https://sjgant80-hub.github.io/fallnote' })), 'a kard’s live page is https://sjgant80-hub.github.io/<name>/');
  assert.equal(why(kard({ repo: 'https://github.com/sjgant80-hub/fallnote/' })), 'a kard’s repository is https://github.com/sjgant80-hub/<name>');
});

test('studs that are not measured studs are refused, by name; fits must agree with them', () => {
  const s = studsFull(), k = (studs, fits = present(studs).length === STUDS.length) => kard({ studs, fits });
  assert.equal(why(k({ ...s, extra: 1 })), 'a kard’s studs are brain, mesh, memory and proof');
  assert.equal(why(kard({ studs: 'x' })), 'a kard’s studs are brain, mesh, memory and proof');
  for (const brain of [{ how: 'other', version: null }, { how: 'inline' }, 5]) assert.equal(why(k({ ...s, brain })), 'the brain is inline, shim, linked or none, with its version');
  assert.equal(checkKard(k({ ...s, brain: { how: 'linked', version: null } })).ok, true);
  assert.equal(why(k({ ...s, brain: { how: 'linked', version: '3.0.0' } })), 'only an inlined brain carries a version (a shim or a linked file holds its own)');
  for (const version of ['3.0', 'v3.0.0', 3, '1234.0.0']) assert.equal(why(k({ ...s, brain: { how: 'inline', version } })), 'the brain’s version is x.y.z, or null');
  assert.equal(checkKard(k({ ...s, brain: { how: 'inline', version: null } })).ok, true);
  assert.equal(why(k({ ...s, brain: { how: 'shim', version: '3.0.0' } })), 'only an inlined brain carries a version (a shim or a linked file holds its own)');
  assert.equal(why(k({ ...s, brain: { how: 'none', version: '3.0.0' } })), 'only an inlined brain carries a version (a shim or a linked file holds its own)');
  for (const mesh of [{ device: true }, { device: 'yes', peer: false }, { device: true, peer: 1 }]) assert.equal(why(k({ ...s, mesh })), 'the mesh says device and peer, each true or false');
  assert.equal(why(k({ ...s, mesh: { device: false, peer: true } })), 'a build with fall-kit has its same-device mesh');
  assert.equal(checkKard(k({ ...s, brain: { how: 'none', version: null }, mesh: { device: false, peer: true } })).ok, true);
  for (const memory of [{ indexeddb: true }, { indexeddb: 1, localstorage: false }, { indexeddb: true, localstorage: 'no' }]) assert.equal(why(k({ ...s, memory })), 'memory says indexeddb and localstorage, each true or false');
  for (const proof of [{ workflows: 1 }, { workflows: -1, tests: 0 }, { workflows: 1, tests: 1.5 }, { workflows: 100001, tests: 0 }, { workflows: 0, tests: 100001 }]) assert.equal(why(k({ ...s, proof })), 'proof counts workflows and tests, whole numbers');
  assert.equal(checkKard(k({ ...s, proof: { workflows: 100000, tests: 100000 } })).ok, true);
  assert.equal(why(kard({ fits: false })), 'fits is true exactly when every stud is there');
  const thin = { ...s, proof: { workflows: 0, tests: 0 } };
  assert.equal(why(k(thin, true)), 'fits is true exactly when every stud is there');
  assert.deepEqual(checkKard(k(thin)).missing, ['proof']);
});

test('the builds that carry the socket: 100 named repositories, each with a category and what it retires', () => {
  const builds = JSON.parse(readFileSync(new URL('./socket-builds.json', import.meta.url), 'utf8'));
  assert.equal(builds.length, 100);
  assert.equal(new Set(builds.map((b) => b.name)).size, 100, 'no build twice');
  for (const b of builds) {
    assert.deepEqual(Object.keys(b), ['name', 'category', 'retires']);
    const k = kardOf({ ...b, title: b.name, license: 'MIT' }, studsFull());
    assert.equal(k.ok, true, b.name + ': ' + k.why);
  }
});

test('fuzz: junk into every function is refused or answered, never thrown', () => {
  const junk = [undefined, null, 0, -1, 1.5, NaN, '', 'x', [], [1], {}, { a: 1 }, () => 1, true, { html: '', files: [] }, { studs: {} }];
  for (const a of junk) for (const b of junk) { studsOf(a); present(a); kardOf(a, b); checkKard(a); }
});
