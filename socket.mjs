// socket.mjs — THE LEGO SOCKET: what every estate build carries, so anything built now or later fits any other.
//
// Five studs, each MEASURED from the build's own files, never claimed:
//   brain    — fall-kit, inlined between its markers (and which version), loaded by its shim, or linked as a file
//   manifest — this file's kard.json, saying all of this in one shape anyone can read
//   mesh     — same-device (fall-kit's BroadcastChannel, or the build's own) and cross-device (WebRTC)
//   memory   — on the device: IndexedDB or localStorage
//   proof    — CI workflows that run on GitHub's machines, and test files
// A build FITS when every stud is there. Kardlings reads kard.json to make a gear card; a build that does not fit is
// still a card, it just says which stud it lacks. Pure and total: junk in → { ok: false, why }, never a throw.

export const KARD = 'kard.v1';
export const STUDS = Object.freeze(['brain', 'manifest', 'mesh', 'memory', 'proof']);
export const HOST = 'https://sjgant80-hub.github.io/';
export const REPOS = 'https://github.com/sjgant80-hub/';
const NAME = /^[a-z0-9][a-z0-9._-]{0,99}$/, VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const KIT_BLOCK = /<!-- FALL_KIT_BEGIN[\s\S]*?<!-- FALL_KIT_END[^>]*-->/g;   // the kit's own code is not the build's
const no = (why) => ({ ok: false, why });
const isObj = (x) => Object.prototype.toString.call(x) === '[object Object]';
const exactly = (x, keys) => isObj(x) && Object.keys(x).sort().join() === keys.slice().sort().join();
const line = (s, n) => typeof s === 'string' && s.trim() === s && s.length >= 1 && s.length <= n;
const count = (x) => Number.isInteger(x) && x >= 0 && x <= 100000;

/**
 * The studs a build has, read from its index.html and the list of its files (paths as git lists them).
 * → { ok, studs: { brain: { how: 'inline' | 'shim' | 'linked' | 'none', version }, mesh: { device, peer }, memory: { indexeddb,
 *   localstorage }, proof: { workflows, tests } } }
 */
export function studsOf(build) {
  if (!isObj(build) || typeof build.html !== 'string' || !Array.isArray(build.files)) return no('a build is its index.html and the list of its files');
  const html = build.html, files = build.files.filter((f) => typeof f === 'string');
  const inline = html.indexOf('<!-- FALL_KIT_BEGIN') >= 0;
  const shim = /<script[^>]+src=["'][^"']*fall-kit\/shim\.js["']/.test(html);
  const linked = /<script[^>]+src=["'][^"']*fall-kit\.js["']/.test(html);   // a copy of the kit loaded from its own file
  const v = inline ? /Fall Kit · v(\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(html) : null;
  const brain = { how: inline ? 'inline' : shim ? 'shim' : linked ? 'linked' : 'none', version: v ? v[1] : null };
  const own = html.replace(KIT_BLOCK, '');   // memory and cross-device mesh are the build's own, not the kit's settings
  const mesh = { device: brain.how !== 'none' || /BroadcastChannel/.test(own), peer: /RTCPeerConnection/.test(own) };
  const memory = { indexeddb: /indexedDB/.test(own), localstorage: /localStorage/.test(own) };
  const proof = { workflows: files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)).length, tests: files.filter((f) => /(^|\/)(test|[^/]+\.test)\.(m?js|cjs)$/.test(f)).length };
  return { ok: true, studs: { brain, mesh, memory, proof } };
}

/** which studs a build has, in STUDS order (the manifest stud is the kard itself, so it is always there) */
export function present(studs) {
  if (!isObj(studs)) return [];
  const { brain, mesh, memory, proof } = studs;
  const has = {
    brain: isObj(brain) && brain.how !== 'none',
    manifest: true,
    mesh: isObj(mesh) && (mesh.device === true || mesh.peer === true),
    memory: isObj(memory) && (memory.indexeddb === true || memory.localstorage === true),
    proof: isObj(proof) && Number.isInteger(proof.workflows) && proof.workflows > 0,
  };
  return STUDS.filter((s) => has[s]);
}

/**
 * A build's kard: who it is, what rented tool it retires, where it lives, and its studs as measured.
 * build: { name, title, retires, category, license }, studs as studsOf gives them. → { ok, kard } | a refusal
 */
export function kardOf(build, studs) {
  if (!isObj(build)) return no('a kard is made from a build');
  const kard = { kind: KARD, name: build.name, title: build.title, retires: build.retires, category: build.category, license: build.license,
    live: HOST + build.name + '/', repo: REPOS + build.name, studs, fits: present(studs).length === STUDS.length };
  const c = checkKard(kard);
  return c.ok ? { ok: true, kard } : c;
}

/** check a kard.json, every field and every stud's shape. → { ok, kard, missing } | a refusal */
export function checkKard(x) {
  if (!exactly(x, ['kind', 'name', 'title', 'retires', 'category', 'license', 'live', 'repo', 'studs', 'fits'])) return no('a kard has exactly kind, name, title, retires, category, license, live, repo, studs and fits');
  if (x.kind !== KARD) return no('a kard is a ' + KARD);
  if (typeof x.name !== 'string' || !NAME.test(x.name)) return no('a kard names its repository: lowercase letters, digits, dots, dashes and underscores');
  if (!line(x.title, 80)) return no('a kard’s title is 1 to 80 characters, no space at either end');
  if (!line(x.retires, 160)) return no('a kard says what rented tool it retires, in 1 to 160 characters');
  if (!line(x.category, 60)) return no('a kard’s category is 1 to 60 characters');
  if (!line(x.license, 20)) return no('a kard names its licence in 1 to 20 characters');
  if (x.live !== HOST + x.name + '/') return no('a kard’s live page is ' + HOST + '<name>/');
  if (x.repo !== REPOS + x.name) return no('a kard’s repository is ' + REPOS + '<name>');
  const s = x.studs;
  if (!exactly(s, ['brain', 'mesh', 'memory', 'proof'])) return no('a kard’s studs are brain, mesh, memory and proof');
  if (!exactly(s.brain, ['how', 'version']) || ['inline', 'shim', 'linked', 'none'].indexOf(s.brain.how) < 0) return no('the brain is inline, shim, linked or none, with its version');
  if (s.brain.version !== null && !(typeof s.brain.version === 'string' && VERSION.test(s.brain.version))) return no('the brain’s version is x.y.z, or null');
  if (s.brain.how !== 'inline' && s.brain.version !== null) return no('only an inlined brain carries a version (a shim or a linked file holds its own)');
  if (!exactly(s.mesh, ['device', 'peer']) || typeof s.mesh.device !== 'boolean' || typeof s.mesh.peer !== 'boolean') return no('the mesh says device and peer, each true or false');
  if (s.brain.how !== 'none' && !s.mesh.device) return no('a build with fall-kit has its same-device mesh');
  if (!exactly(s.memory, ['indexeddb', 'localstorage']) || typeof s.memory.indexeddb !== 'boolean' || typeof s.memory.localstorage !== 'boolean') return no('memory says indexeddb and localstorage, each true or false');
  if (!exactly(s.proof, ['workflows', 'tests']) || !count(s.proof.workflows) || !count(s.proof.tests)) return no('proof counts workflows and tests, whole numbers');
  const have = present(s);
  if (x.fits !== (have.length === STUDS.length)) return no('fits is true exactly when every stud is there');
  return { ok: true, kard: x, missing: STUDS.filter((t) => have.indexOf(t) < 0) };
}

/** a kard as the file holds it: two-space JSON in the field order kardOf writes, and a final newline */
export const kardText = (kard) => JSON.stringify(kard, null, 2) + '\n';

const PASS = ['success', 'skipped', 'neutral'];
/**
 * Did a build's tests pass on GitHub? runs: every workflow run on the commit its site serves (deploy runs left out), as
 * GitHub lists them: { workflow, id, status, conclusion }; anything else in the list is not a run. → 'green' (one
 * succeeded and every other passed or was skipped) | 'red' (a finished run did not pass) | 'running' (one is still going,
 * none failed) | 'none' (no run, or none that succeeded).
 */
export function verdictOf(runs) {
  const rows = Array.isArray(runs) ? runs.filter(isObj) : [];
  if (rows.some((r) => r.status === 'completed' && PASS.indexOf(r.conclusion) < 0)) return 'red';
  if (rows.some((r) => r.status !== 'completed')) return 'running';
  return rows.some((r) => r.conclusion === 'success') ? 'green' : 'none';
}
