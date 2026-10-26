// core/phase3/page.mjs — Phase 3's live page engine. It reads the committed receipt and the sealed claims and re-judges
// them in this tab, and it runs a small mesh here on the real organs: two relays (core/relay.mjs, the same law the relay
// processes run), the founder's roster (core/roster.mjs), and six foundation nodes (core/node.mjs) with public test
// keys. In the measured run every node and relay is its own process on local TCP; here the relays' frames are handed
// over in memory, and everything a node hears still goes through its own door. The cost case is break-it's gated kernel
// on break-it's dated list prices, as on the Phase 2 page. Nothing here talks to anything but this origin.
import { createRelay, KIND, HEAD } from '../relay.mjs';
import { createNode, stableJson } from '../node.mjs';
import { makeIdentity, hex, unhex } from '../identity.mjs';
import { makeRoster, readRoster, onRoster } from '../roster.mjs';
import { prepare, finish, KINDS } from '../vendor/light/packet.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { judge } from './judge.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (x) => Number(x).toLocaleString('en-GB');
const tag = (held) => (held === true ? '<span class="tag held">HELD</span>' : held === false ? '<span class="tag failed">FAILED</span>' : '<span class="tag na">OPEN</span>');
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const STAGE = {
  size: 'too short or too long to be a packet', magic: 'not LIGHT at all', version: 'a version this door does not speak', length: 'not the size its header says',
  dictionary: 'a dictionary this node does not hold', sender: 'no pinned key for the sender it names', signature: 'not what the pinned key signed',
  counter: 'a counter already heard from that sender', body: 'a body that does not decode', message: 'signed, but not a message for this node',
};

// ── the receipt, re-judged here ──
async function loadReceipt() {
  try {
    const [claims, receipt] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase3.json')]);
    const j = judge(claims, receipt.facts);
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    const f = receipt.facts;
    $('r-sum').innerHTML = '<b>' + j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet</b>, of ' + j.verdicts.length + ' claims sealed at <code>' + esc(String(receipt.sealedIn || '').slice(0, 7)) + '</code>. ' +
      (same ? '<span class="ok">Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.</span>' : '<span class="no">Re-judged in this tab, the verdicts differ from the committed ones.</span>');
    $('r-rows').innerHTML = j.verdicts.map((v) => { const c = claims.claims.find((x) => x.id === v.id) || {}; return '<tr><td><b>' + esc(v.id) + '</b><br><span class="dim small">pass ' + esc(v.pass) + '</span></td><td>' + tag(v.held) + '</td><td>' + esc(c.claim || '') + '<br><span class="small dim">' + esc(v.measured) + '</span></td></tr>'; }).join('');
    $('pass-rows').innerHTML = claims.passes.map((p) => { const vs = j.verdicts.filter((v) => v.pass === p.pass); const h = vs.filter((v) => v.held === true).length, fl = vs.filter((v) => v.held === false).length, op = vs.filter((v) => v.held === null).length;
      return '<tr><td>' + p.pass + '</td><td>' + esc(p.organ) + '</td><td>' + esc(p.claims.join(', ')) + '</td><td>' + (op === vs.length ? '<span class="tag na">OPEN</span>' : h + ' held' + (fl ? ', <span class="no">' + fl + ' failed</span>' : '') + (op ? ', ' + op + ' open' : '')) + '</td></tr>'; }).join('');
    const kinds = (k) => Object.entries(k || {}).map(([name, t]) => '<tr><td>' + esc(name) + '</td><td>' + n0(t.sent) + '</td><td>' + n0(t.admitted) + '</td><td>' + n0(t.decoded) + '</td><td>' + n0(t.variantNamed) + '</td><td class="small">' + esc(Object.entries(t.stages || {}).map(([s, c]) => (s === 'recognised' ? 'recognised on sight' : s) + ' ' + c).join(', ')) + '</td></tr>').join('');
    if (f.h2) $('h2-rows').innerHTML = kinds(f.h2.kinds);
    if (f.s2) $('s2-rows').innerHTML = kinds(f.s2.kinds);
    const hostile = Object.values((f.h2 || {}).kinds || {}).concat(Object.values((f.s2 || {}).kinds || {}));
    const sent = hostile.reduce((a, t) => a + t.sent, 0), admitted = hostile.reduce((a, t) => a + t.admitted, 0);
    $('t-hostile').textContent = n0(admitted) + ' of ' + n0(sent);
    $('t-sync').textContent = f.s1 ? f.s1.nodes + ' of ' + f.s1.nodes : '…';
    $('t-relay').textContent = f.r2 ? f.r2.answeredAfterKill + ' of ' + f.r2.asksAfterKill : '…';
    $('t-held').textContent = j.held + ' of ' + j.verdicts.length;
    const j4 = (f.j4 && f.j4.links) || [];
    if (j4.length) $('j4-line').textContent = 'Measured: at every asker the live honest holder\'s link is ' + n0(j4[0].honest) + ' parts in a million and the dishonest one\'s ' + n0(j4[0].liar) + ', exactly where every link starts. It was never asked.';
    if (f.j3) $('j3-line').textContent = 'Measured: ' + f.j3.killed + ', the holder the triage asks were going to, was killed. ' + f.j3.toDead + ' of the next ' + f.j3.asks + ' asks went to it, one from each of the ' + f.j3.askers + ' askers, against a sealed bar of 2. Every ask after that went to a live holder and was answered.';
    $('t-held-label').textContent = 'sealed claims holding; ' + (j.failed ? j.failed + ' failed and kept' : 'none failed') + (j.open ? ', ' + j.open + ' not measured yet' : '');
    if (f.x1 && f.x1.tabs) $('x1-line').innerHTML = 'Measured on ' + esc(f.x1.where || 'the live page') + ': tab A sent ' + esc(f.x1.tabs.a.sent) + ' packets over the data channel; tab B\'s door admitted ' + esc(f.x1.tabs.b.admitted) + ' and refused ' + esc(Object.entries(f.x1.tabs.b.refused || {}).map(([s, c]) => c + ' at the ' + s).join(' and ')) + '. What the tabs gathered: <a href="local/x1.json">local/x1.json</a>.';
    else $('x1-line').textContent = 'Not measured yet: run it yourself with the two links above.';
  } catch (e) {
    $('r-sum').innerHTML = '<span class="no">The receipt could not be loaded.</span>';
  }
}

// ── a small mesh, in this tab ──
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const seed = (k) => new Uint8Array(32).fill(k);
const rehash = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));
const honest = (domain) => async (input) => {
  const core = { model: 'phase3/1', domain, label: input && typeof input === 'object' && input.spO2 < 92 ? 1 : 0, verdict: 'VERIFIED' };
  return { verdict: 'VERIFIED', label: core.label, receipt: { ...core, receiptHash: rehash(core) } };
};
const liar = async () => ({ verdict: 'VERIFIED', label: 1, receipt: { model: 'phase3/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) } });
const ROLES = [['h1', 81, 'honest', 'triage, honest'], ['h2', 82, 'honest', 'triage, honest'], ['liar', 83, 'liar', 'triage, its receipts do not check'], ['scribe', 84, 'scribe', 'echo'], ['a1', 85, 'asker', 'asks'], ['a2', 86, 'asker', 'asks']];
const M = { ready: false, nodes: {}, relays: {}, byConn: new Map(), answers: new Map(), asks: 0, x: null, forged: null, read: null, busy: false, fresh: 0 };
const now = () => 1767000000000 + (M.fresh += 1000);

function log(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  $('m-log').prepend(li);
  while ($('m-log').children.length > 60) $('m-log').lastChild.remove();
}
const who = (id) => { for (const n of Object.values(M.nodes)) if (n.id === id) return n.name; return M.x && M.x.id === id ? 'the stranger' : id.slice(0, 8) + '…'; };

function newRelay(k) {
  const R = { name: k, r: createRelay({ maxQueue: 64, ttlMs: 600000 }), alive: true };
  M.relays[k] = R;
  for (const n of [...Object.values(M.nodes), ...(M.x ? [M.x] : [])]) if (n.alive) hello(n, R);
  return R;
}
function hello(n, R) {
  const conn = { node: n.name, relay: R.name };
  n.conns[R.name] = conn;
  M.byConn.set(conn, n);
  R.r.open(conn);
  const late = R.r.take(conn, { kind: KIND.HELLO, id: n.raw, bytes: new Uint8Array(0) }, now());
  return late;
}
/** Say bytes to a node through the first relay that is up; what the relay delivers goes to that node's own door. */
async function send(from, toId, bytes) {
  for (const k of ['A', 'B']) {
    const R = M.relays[k];
    if (!R || !R.alive || !from.alive) continue;
    flash(from.name, k);
    const outs = R.r.take(from.conns[k], { kind: KIND.SEND, id: unhex(toId), bytes }, now());
    if (outs.length === 0) log('<span class="dim">relay ' + k + ' holds a packet for ' + esc(who(toId)) + ', who is away</span>');
    for (const o of outs) await deliver(o.conn, o.bytes.slice(HEAD), k);
    return k;
  }
  log('<span class="no">no relay is up</span>: ' + esc(from.name) + ' cannot say anything');
  return null;
}
async function deliver(conn, bytes, k) {
  const n = M.byConn.get(conn);
  if (!n || !n.alive || n === M.x) return;
  flash(n.name, k);
  const r = await n.node.hear(bytes);
  n.last = r;
  if (!r.ok) {
    const why = r.recognised ? 'recognised on sight, without decoding: a known ' + (r.family || '') + ' packet' : 'refused at the <b>' + esc(r.stage) + '</b> stage (' + esc(r.stage === 'message' ? r.reason || STAGE.message : STAGE[r.stage] || r.reason || '') + ')' + (r.variantOf ? ', named a variant of a family it already knows' : '');
    log('<b>' + esc(n.name) + '</b>\'s door: <span class="no">' + why + '</span>');
  } else if (r.t === 'antibody') log('<b>' + esc(n.name) + '</b> re-ran ' + r.offered + ' shared antibod' + (r.offered === 1 ? 'y' : 'ies') + ' on its own door and <span class="ok">adopted ' + r.adopted + '</span>');
  else if (r.t === 'sync') log('<b>' + esc(n.name) + '</b> merged a signed sync from ' + esc(who(r.from)));
  for (const rep of r.replies || []) await send(n, rep.to, rep.bytes);
  if (r.t === 'answer') M.answers.set(r.id, r);
  draw();
}

async function start() {
  if (M.ready || M.busy) return;
  M.busy = true;
  $('m-start').textContent = 'Starting…';
  try {
    const founder = await makeIdentity(seed(80));
    for (const [name, s, role, does] of ROLES) {
      const id = await makeIdentity(seed(s));
      const skills = role === 'honest' ? { triage: honest('triage') } : role === 'liar' ? { triage: liar } : role === 'scribe' ? { echo: honest('echo') } : {};
      const node = await createNode({ name, identity: id, skills, clock: CLOCK, docs: ['mesh'], budget: 5000 });
      M.nodes[name] = { name, role, does, id: id.id, raw: id.raw, node, alive: true, conns: {}, last: null };
    }
    const roster = (await makeRoster(founder, Object.values(M.nodes).map((n) => n.node.card()))).roster;
    M.read = await readRoster(roster, founder.id);
    let pins = 0;
    for (const n of Object.values(M.nodes)) for (const c of M.read.cards) if (c.id !== n.id && (await n.node.pin(c)).ok) pins++;
    const xi = await makeIdentity(seed(99));
    M.x = { name: 'stranger', id: xi.id, raw: xi.raw, slot: xi.slot, sign: xi.sign, node: await createNode({ name: 'stranger', identity: xi, clock: CLOCK }), alive: true, conns: {} };
    newRelay('A'); newRelay('B');
    M.ready = true;
    log('<span class="ok">The mesh is up.</span> The founder signed a roster of ' + M.read.cards.length + ' cards; each node read it, checked every card, and pinned the other ' + (M.read.cards.length - 1) + ' (' + pins + ' pins). Every node said hello to both relays.');
    for (const b of document.querySelectorAll('[data-m]')) b.disabled = false;
    $('m-start').textContent = 'The mesh is up';
    $('m-start').disabled = true;
    draw();
  } catch (e) {
    log('<span class="no">The mesh could not start in this browser:</span> ' + esc(e && e.message || e));
    $('m-start').textContent = 'Start the mesh';
  }
  M.busy = false;
}

async function ask(asker, skill) {
  const a = M.nodes[asker];
  if (!a.alive) { log(esc(asker) + ' is down'); return; }
  const i = M.asks++;
  const q = await a.node.ask(skill, { spO2: 85 + (i % 15) });
  if (!q.ok) { log('<b>' + esc(asker) + '</b> could not ask for ' + esc(skill) + ': ' + esc(q.why)); return; }
  const to = who(q.to), w = a.node.weight(q.to, skill);
  const via = await send(a, q.to, q.bytes);
  const ans = M.answers.get(q.id);
  if (ans) {
    const after = a.node.weight(q.to, skill);
    log('<b>' + esc(asker) + '</b> asked for ' + esc(skill) + ' → routed to <b>' + esc(to) + '</b> (its link ' + pct(w) + ') via relay ' + esc(via) + ' → answered; the receipt ' + (ans.outcome === 'verified' ? '<span class="ok">checks</span>' : '<span class="no">does not check</span>') + ', link now ' + pct(after));
  } else {
    const e = a.node.expire(q.id);
    log('<b>' + esc(asker) + '</b> asked <b>' + esc(to) + '</b> for ' + esc(skill) + ': <span class="no">no answer</span>. The ask expired and counts as a failed answer: link ' + pct(w) + ' → ' + pct(e.weight || 0) + ', so the next ask goes elsewhere.');
  }
  draw();
}
const pct = (ppm) => (Number(ppm) / 10000).toFixed(1) + '%';

async function killNode(name) {
  const n = M.nodes[name];
  if (n.alive) {
    n.alive = false;
    for (const k of Object.keys(n.conns)) if (M.relays[k]) M.relays[k].r.close(n.conns[k]);
    log('<b>' + esc(name) + '</b> is <span class="no">down</span>. The others do not know yet: they find out when it does not answer.');
  } else {
    n.alive = true;
    const held = [];
    for (const k of ['A', 'B']) {
      const R = M.relays[k];
      if (R && R.alive) for (const o of hello(n, R)) held.push([o, k]);
    }
    log('<b>' + esc(name) + '</b> is <span class="ok">back</span>' + (held.length ? ' and says hello: the relays held ' + held.length + ' frame' + (held.length === 1 ? '' : 's') + ' for it, delivered now. It answers them, but the askers gave up on those asks, so their doors refuse the late answers.' : '.'));
    for (const [o, k] of held) await deliver(o.conn, o.bytes.slice(HEAD), k);
  }
  draw();
}
async function killRelay(k) {
  const R = M.relays[k], other = M.relays[k === 'A' ? 'B' : 'A'];
  if (R.alive) { R.alive = false; log('Relay <b>' + k + '</b> is <span class="no">dead</span>. ' + (other && other.alive ? 'Every node goes on through relay ' + other.name + '; nothing a node keeps lived on the relay.' : 'With both relays dead, nothing can be carried until one is back.')); }
  else { newRelay(k); log('Relay <b>' + k + '</b> is <span class="ok">back</span>, fresh: a relay keeps no state worth losing. Every node said hello again.'); }
  draw();
}
async function write() {
  const key = $('m-key').value.trim().slice(0, 40) || 'note', value = $('m-val').value.slice(0, 120);
  const n = M.nodes[$('m-at').value];
  if (!n.alive) { log(esc(n.name) + ' is down'); return; }
  const r = n.node.setShared('mesh', key, value);
  log(r.ok ? '<b>' + esc(n.name) + '</b> wrote <code>' + esc(key) + '</code> = "' + esc(value) + '" to its copy of the shared map, stamped with its Lamport time ' + r.entry.ts + '.' : esc(r.why));
  draw();
}
async function syncAll() {
  const live = Object.values(M.nodes).filter((n) => n.alive);
  let k = 0;
  for (const a of live) for (const b of live) if (a !== b) { const bytes = await a.node.shareSync(b.id, 'mesh'); if (bytes) { await send(a, b.id, bytes); k++; } }
  log('Every live node sent its map to every other, ' + k + ' signed syncs. ' + (converged() ? '<span class="ok">Every live node now holds the same map.</span>' : 'The maps differ: a node that was down has not caught up yet.'));
  draw();
}
const digest = (n) => hex(sha256(new TextEncoder().encode(stableJson(n.node.sharedDoc('mesh').entries)))).slice(0, 10);
const converged = () => { const ds = Object.values(M.nodes).filter((n) => n.alive).map(digest); return ds.every((d) => d === ds[0]); };

/** The stranger forges a packet in h1's name, signed with its own key: the door finds no pinned key it fits. */
async function forge(k) {
  const target = M.nodes.a1;
  const p = prepare({ sender: M.nodes.h1.node.slot, counter: 1n, kind: KINDS.JSON, value: { t: 'sync', to: target.id, doc: { docId: 'mesh', lamport: 1, entries: { ['forged-' + k]: { value: 'taken over', ts: 1, nodeId: M.x.id, deleted: false } } } }, dictId: 0 });
  return finish(p.unsigned, await M.x.sign(p.signed)).bytes;
}
async function forgeAt() {
  if (!M.nodes.a1.alive) { log('a1 is down'); return; }
  M.forged = await forge(0);
  log('The stranger sends a1 a sync in <b>h1</b>\'s name, signed with its own key, saying a key of the map is "taken over".');
  await send(M.x, M.nodes.a1.id, M.forged);
}
async function shareImmunity() {
  const a1 = M.nodes.a1;
  if (a1.node.antigens().length === 0) { log('a1 has refused nothing yet, so it has nothing to share. Forge a packet at a1 first.'); return; }
  for (const n of Object.values(M.nodes)) if (n !== a1 && n.alive) { const b = await a1.node.shareAntibodies(n.id); if (b) await send(a1, n.id, b); }
}
async function sameToAll() {
  if (!M.forged) { log('Forge a packet at a1 first.'); return; }
  log('The stranger now sends the very same bytes to every node.');
  for (const n of Object.values(M.nodes)) if (n.alive) await send(M.x, n.id, M.forged);
}
async function variant() {
  log('The stranger tries a variant: the same forgery with another key and another value.');
  const v = await forge(1 + (M.asks % 50));
  for (const n of Object.values(M.nodes)) if (n.alive) await send(M.x, n.id, v);
}
async function strangerJoins() {
  const card = M.x.node.card();
  const results = [];
  for (const n of Object.values(M.nodes)) results.push(onRoster(M.read, card) ? (await n.node.pin(card)).ok : false);
  log('The stranger offers its card, properly signed by its own key. It is not on the founder\'s roster, so <span class="no">' + results.filter((x) => !x).length + ' of ' + results.length + ' nodes refuse to pin it</span>. Everything it sends will stop at the sender or the signature.');
}

// the picture: two relays in the middle, the nodes around them
const POS = { h1: [90, 50], h2: [90, 170], liar: [90, 290], scribe: [610, 50], a1: [610, 170], a2: [610, 290], A: [270, 170], B: [430, 170], stranger: [350, 330] };
let flashes = [];
function flash(node, relay) { flashes.push(node + '-' + relay); }
function draw() {
  if (!M.ready) return;
  const s = [];
  for (const n of Object.values(M.nodes)) for (const k of ['A', 'B']) {
    const R = M.relays[k], on = n.alive && R && R.alive, hot = flashes.includes(n.name + '-' + k);
    s.push('<line x1="' + POS[n.name][0] + '" y1="' + POS[n.name][1] + '" x2="' + POS[k][0] + '" y2="' + POS[k][1] + '" class="' + (hot ? 'hotln' : on ? 'ln' : 'deadln') + '"/>');
  }
  for (const k of ['A', 'B']) {
    const R = M.relays[k], st = R.r.stats();
    s.push('<rect x="' + (POS[k][0] - 50) + '" y="' + (POS[k][1] - 30) + '" width="100" height="60" rx="6" class="' + (R.alive ? 'b hot' : 'b dead') + '"/><text class="t" x="' + POS[k][0] + '" y="' + (POS[k][1] - 4) + '" text-anchor="middle">relay ' + k + '</text><text class="s" x="' + POS[k][0] + '" y="' + (POS[k][1] + 16) + '" text-anchor="middle">' + (R.alive ? st.frames + ' frames · ' + st.waiting + ' held' : 'dead') + '</text>');
  }
  for (const n of Object.values(M.nodes)) {
    const [x, y] = POS[n.name], cls = n.alive ? 'b' : 'b dead';
    s.push('<rect x="' + (x - 70) + '" y="' + (y - 30) + '" width="140" height="60" rx="6" class="' + cls + '"/><text class="t" x="' + x + '" y="' + (y - 6) + '" text-anchor="middle">' + esc(n.name) + (n.alive ? '' : ' · down') + '</text><text class="s" x="' + x + '" y="' + (y + 13) + '" text-anchor="middle">' + esc(n.does) + '</text><text class="s mono" x="' + x + '" y="' + (y + 26) + '" text-anchor="middle">map ' + digest(n) + '</text>');
  }
  s.push('<text class="s" x="' + POS.stranger[0] + '" y="' + POS.stranger[1] + '" text-anchor="middle">the stranger: not on the roster, its own key</text>');
  $('m-svg').innerHTML = s.join('');
  flashes = [];
  const holders = ['h1', 'h2', 'liar'];
  $('m-links').innerHTML = ['a1', 'a2'].map((a) => '<tr><td><b>' + a + '</b></td>' + holders.map((h) => { const w = M.nodes[a].node.weight(M.nodes[h].id, 'triage'); return '<td><span class="bar"><span style="width:' + (w / 10000).toFixed(1) + '%"></span></span> ' + pct(w) + '</td>'; }).join('') + '</tr>').join('');
  $('m-state').textContent = Object.values(M.nodes).filter((n) => n.alive).length + ' of 6 nodes up · relays ' + ['A', 'B'].filter((k) => M.relays[k].alive).join(' and ') + ' up · ' + (converged() ? 'every live node holds the same shared map' : 'the shared maps differ until the next sync') + ' · immunity at a1: ' + M.nodes.a1.node.antigens().length + ' antigen' + (M.nodes.a1.node.antigens().length === 1 ? '' : 's');
}

async function run(fn) {
  if (!M.ready) await start();
  if (M.busy) return;
  M.busy = true;
  try { await fn(); } catch (e) { log('<span class="no">That failed in this browser:</span> ' + esc(e && e.message || e)); }
  M.busy = false;
}

// ── the cost case: break-it's kernel on break-it's prices ──
let costKernel = null, prices = null;
const usd = (c) => '$' + (c / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function loadCost() {
  try {
    const [k, src] = await Promise.all([import('/break-it/src/cost.mjs'), getJson('/break-it/costs/sources.json')]);
    const p = k.pricesFrom(src);
    if (!p.ok) throw new Error(p.why);
    costKernel = k; prices = p.prices;
    $('c-sources').innerHTML = src.sources.map((s) => '<li><a href="' + esc(s.url) + '">' + esc(s.what) + '</a> <span class="dim">(read ' + esc(s.read) + ')</span></li>').join('');
    cost();
  } catch (e) { $('c-out').innerHTML = '<p class="no">The cost kernel or its prices could not be loaded from break-it.</p>'; }
}
const int = (id) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.round(v) : NaN; };
function cost() {
  if (!costKernel) return;
  const inputs = { requests: int('c-req'), acls: int('c-acl'), rules: int('c-rules'), api: $('c-api').value, rate: int('c-rate'), watts: int('c-watts'), hours: int('c-hours'),
    fx10k: Math.round(Number($('c-fx').value) * 10000), machinePence: Math.round(Number($('c-machine').value) * 100), lifeMonths: int('c-life'), staffHours: 0, staffRatePence: 0, staffShare: 0 };
  const r = costKernel.costCase(inputs, prices);
  if (!r.ok) { $('c-out').innerHTML = '<p class="no">' + esc(r.why) + '</p>'; return; }
  const save = r.monthlyPence;
  $('c-out').innerHTML = '<p class="bottom">Through the managed path those messages cost <b>' + esc(usd(r.managed.totalCents)) + '</b> a month (' + esc(gbp(r.managed.totalPence)) + '). ' +
    (r.node.nodes === 1 ? 'One node carries them' : esc(n0(r.node.nodes)) + ' nodes carry them') + ' for <b>' + esc(gbp(r.node.totalPence)) + '</b> a month. ' +
    (save >= 0 ? 'You keep <b>' + esc(gbp(save)) + '</b> a month, <b>' + esc(gbp(r.yearlyPence)) + '</b> a year.' : 'At these figures the node path costs <b>' + esc(gbp(-save)) + '</b> a month more.') + '</p>' +
    [['AWS WAF (web ACLs, rules, requests)', usd(r.managed.wafCents)], ['API Gateway (' + inputs.api + ')', usd(r.managed.gatewayCents)], ['Managed path in pounds, at the rate you set', gbp(r.managed.totalPence)],
      ['Nodes the rate needs for this volume', n0(r.node.nodes)], ['Their electricity at the Ofgem cap', gbp(r.node.electricityPence)], ['New machines, spread over their life', gbp(r.node.machinePence)], ['Relays', 'a few hundred lines each, on the same machines'], ['Licence', 'MIT, no licence fee']]
      .map(([k, v]) => '<div class="line"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>').join('');
}
for (const id of ['c-req', 'c-acl', 'c-rules', 'c-api', 'c-rate', 'c-watts', 'c-hours', 'c-fx', 'c-machine', 'c-life']) $(id).addEventListener('input', cost);

$('m-start').addEventListener('click', () => start());
const ACT = {
  ask: () => ask(M.asks % 2 === 0 ? 'a1' : 'a2', 'triage'),
  ask10: async () => { for (let i = 0; i < 10; i++) await ask(i % 2 === 0 ? 'a1' : 'a2', i % 5 === 4 ? 'echo' : 'triage'); },
  echo: () => ask('a1', 'echo'),
  killA: () => killRelay('A'), killB: () => killRelay('B'), h1: () => killNode('h1'), h2: () => killNode('h2'), scribe: () => killNode('scribe'),
  write: () => write(), sync: () => syncAll(), forge: () => forgeAt(), share: () => shareImmunity(), same: () => sameToAll(), variant: () => variant(), join: () => strangerJoins(),
};
for (const b of document.querySelectorAll('[data-m]')) b.addEventListener('click', () => run(ACT[b.dataset.m]));
loadReceipt();
loadCost();
