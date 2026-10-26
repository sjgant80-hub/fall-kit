// core/phase2/page.mjs — Phase 2's live page engine. It reads the committed receipt and the sealed claims, and runs the
// real door (vendor/light/packet.mjs, through edge.outbound) and the real edge (edge.mjs) in this tab, with public test
// keys. The cost case is break-it's gated kernel on break-it's dated list prices, as on the foundation's page. Nothing
// here talks to anything but this origin; the page's policy allows nothing else.
import { inbound, sealInside, outbound, shapeOf } from '../edge.mjs';
import { makeIdentity, verifyBytes, hex } from '../identity.mjs';
import { prepare, finish, KINDS } from '../vendor/light/packet.mjs';
import { judge } from './judge.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (x) => Number(x).toLocaleString('en-GB');
const tag = (held) => (held === true ? '<span class="tag held">HELD</span>' : held === false ? '<span class="tag failed">FAILED</span>' : '<span class="tag na">OPEN</span>');
const enc = (s) => new TextEncoder().encode(s);
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const EXPLAIN = {
  size: 'Nothing else is read until the size is right.', magic: 'It does not begin with LGT1, so it is not LIGHT at all.',
  version: 'It begins like LIGHT, but its version byte is not one this door speaks.', length: 'The packet is not the size its own header says.',
  dictionary: 'It names a dictionary this node does not hold.', sender: 'No key is pinned here for the sender it names.',
  signature: 'The bytes are not what the pinned key signed.', counter: 'This node has already heard that counter from that sender.',
  body: 'The body does not decode.', kind: 'Only a JSON packet leaves as JSON.', error: 'The door failed closed.',
  utf8: 'The bytes are not valid text.', json: 'The text does not parse as JSON.', shape: 'It is not what this edge declared it would take.', packet: 'The edge could not build the packet.',
};
const refused = (stage, why) => '<span class="no">Refused</span> at the <b>' + esc(stage) + '</b> stage: ' + esc(why) + '. <span class="dim">' + esc(EXPLAIN[stage] || '') + '</span>';

// ── the receipt ──
async function loadReceipt() {
  let receipt, claims;
  try { [receipt, claims] = await Promise.all([getJson('../receipts/phase2.json'), getJson('./claims.json')]); }
  catch { $('r-sum').textContent = 'The receipt (core/receipts/phase2.json) could not be read.'; return; }
  const f = receipt.facts.pass1;
  const j = judge(claims, { passes: receipt.facts.passes, ...f });   // re-judged here from the receipt's facts
  const same = JSON.stringify(j.verdicts) === JSON.stringify(receipt.verdicts);
  $('t-g1').textContent = n0(f.g1.heard);
  $('t-g2').textContent = n0(Object.values(f.g2.kinds).reduce((a, k) => a + k.n, 0));
  $('t-g3').textContent = n0(f.g3.admitted) + ' / ' + n0(f.g3.n);
  $('t-held').textContent = j.held + ' / ' + (j.held + j.failed);
  $('r-sum').innerHTML = '<b>' + j.held + ' held, ' + j.failed + ' failed</b> of the ' + (j.held + j.failed) + ' claims measured so far; ' + j.open + ' are sealed for later passes. '
    + (same ? 'Re-judged in your tab from the receipt\'s own facts: the same verdicts.' : '<span class="no">Re-judged in your tab, the verdicts DIFFER from the receipt.</span>')
    + ' Sealed in <code>' + esc(receipt.sealedIn.slice(0, 7)) + '</code>; the corpus is ' + n0(f.corpus.payloads) + ' payloads from ' + n0(f.corpus.files) + ' files (digest <code>' + esc(f.corpus.digest.slice(0, 12)) + '</code>).';
  $('r-rows').innerHTML = j.verdicts.map((v) => '<tr><td><b>' + esc(v.id) + '</b> <span class="dim">pass ' + v.pass + '</span><br>' + esc(claims.claims.find((c) => c.id === v.id).claim) + '</td><td>' + tag(v.held) + '</td><td>' + esc(v.measured) + '</td></tr>').join('');
  $('k-rows').innerHTML = Object.entries(f.corpus.byKind).sort((a, b) => b[1] - a[1]).map(([k, c]) => '<tr><td>' + esc(k) + '</td><td>' + n0(c) + '</td></tr>').join('');
  $('s-rows').innerHTML = Object.entries(f.g1.stages).sort((a, b) => b[1] - a[1]).map(([s, c]) => '<tr><td>' + esc(s) + '</td><td>' + n0(c) + '</td><td>' + esc(EXPLAIN[s] || '') + '</td></tr>').join('');
  $('g2-rows').innerHTML = Object.entries(f.g2.kinds).map(([k, x]) => '<tr><td>' + esc(k) + '</td><td>' + n0(x.n) + '</td><td>' + esc(Object.entries(x.stages).map(([s, c]) => s + ' ' + n0(c)).join(', ')) + '</td><td>' + n0(x.admitted) + '</td><td>' + n0(x.decoded) + '</td></tr>').join('');
  const p2 = receipt.facts.pass2;
  if (p2) {
    $('j-rows').innerHTML = p2.journals.map((x) => '<tr><td>' + esc(x.name) + '</td><td>' + n0(x.events) + '</td><td>' + n0(x.bytes.json) + '</td><td><b>' + n0(x.bytes.light) + '</b></td><td>' + n0(x.bytes.gzip) + '</td><td>' + n0(x.bytes.envelope) + '</td><td>'
      + (x.sameEvents && x.sameSnapshot && x.migrated && x.asideKept ? '<span class="ok">yes</span>' : '<span class="no">no</span>') + '</td></tr>').join('');
    const night = p2.m3.nights[p2.m3.nights.length - 1];
    $('m3-line').innerHTML = '<b>Kar\'s whole memory</b>, vaulted by the nightly loop: ' + n0(night.files) + ' files, ' + n0(night.bytes) + ' bytes, into one LIGHT vault of ' + n0(night.vaultBytes) + ' bytes (' + esc(String(night.ratio)) + '×), '
      + (night.identical ? 'byte-identical when unpacked into a fresh folder' : '<span class="no">NOT identical</span>') + ' (' + esc(night.at.slice(0, 10)) + '). The memory itself never leaves the machine; only these totals are published, so CI re-judges them and cannot re-measure them.';
  } else { $('j-rows').innerHTML = '<tr><td colspan="7" class="dim">Pass 2 is not measured yet.</td></tr>'; $('m3-line').textContent = ''; }
  $('pass-rows').innerHTML = claims.passes.map((p) => {
    const vs = j.verdicts.filter((v) => v.pass === p.pass);
    const st = vs.every((v) => v.held === null) ? '<span class="tag na">SEALED</span>' : vs.every((v) => v.held === true) ? '<span class="tag held">HELD</span>' : '<span class="tag failed">SEE RECEIPT</span>';
    return '<tr><td>' + p.pass + '</td><td>' + esc(p.organ) + '</td><td>' + esc(p.claims.join(', ')) + '</td><td>' + st + '</td></tr>';
  }).join('');
}

// ── the door and the edge, live, with public test keys ──
let peer = null, edgeKey = null, counter = 0n, last = null;
const seen = new Map();
const lastCounter = (slot, id) => seen.get(id) || 0n;
async function keys() {
  if (peer === null) [peer, edgeKey] = await Promise.all([makeIdentity(new Uint8Array(32).fill(51)), makeIdentity(new Uint8Array(32).fill(52))]);
  return { peers: [peer, edgeKey].map((x) => ({ slot: x.slot, id: x.id, raw: x.raw })), verifyBytes, lastCounter };
}
function say(el, r, bytes) {
  const node = $(el);
  if (r.ok) {
    node.innerHTML = '<span class="ok">Admitted.</span> Signed by the pinned test key, counter ' + esc(String(r.counter)) + '. It leaves the edge as: <code>' + esc(r.json.slice(0, 300)) + (r.json.length > 300 ? '…' : '') + '</code>';
  } else {
    node.innerHTML = refused(r.stage, r.why) + ' The body was ' + (r.decoded ? '<b>decoded</b>' : '<b>never decoded</b>') + '.'
      + (bytes ? ' <span class="dim">(' + n0(bytes.length) + ' bytes; the first four: ' + esc(hex(bytes.subarray(0, 4)) || 'none') + ')</span>' : '');
  }
}
async function hearText() {
  const opts = await keys();
  const bytes = enc($('d-in').value);
  const r = await outbound(bytes, opts);
  if (r.ok) seen.set(r.from, r.counter);
  say('d-out', r, bytes);
}
async function makePacket() {
  const opts = await keys();
  let value;
  try { value = JSON.parse($('d-in').value); } catch { value = $('d-in').value; }
  counter += 1n;
  const p = prepare({ sender: peer.slot, counter, kind: KINDS.JSON, value, dictId: 0 });
  if (!p.ok) { $('d-out').textContent = 'Not a packet: ' + p.why; return; }
  last = finish(p.unsigned, await peer.sign(p.signed)).bytes;
  const r = await outbound(last, opts);
  if (r.ok) seen.set(r.from, r.counter);
  $('d-pkt').textContent = 'A LIGHT packet, ' + n0(last.length) + ' bytes: ' + hex(last).slice(0, 96) + '…';
  say('d-out', r, last);
}
async function flipByte() {
  if (!last) { $('d-out').textContent = 'Make a signed packet first.'; return; }
  const opts = await keys();
  const t = last.slice(); t[23] ^= 1;
  say('d-out', await outbound(t, opts), t);
}
async function replay() {
  if (!last) { $('d-out').textContent = 'Make a signed packet first.'; return; }
  say('d-out', await outbound(last, await keys()), last);
}
async function throughEdge() {
  const opts = await keys();
  let example;
  try { example = JSON.parse($('e-shape').value); } catch { $('e-out').innerHTML = '<span class="no">The example is not JSON</span>, so the edge has no shape to declare.'; return; }
  const shape = shapeOf(example);
  if (shape === null) { $('e-out').textContent = 'The example is deeper than the edge reads.'; return; }
  counter += 1n;
  const s = await sealInside(enc($('e-in').value), { shape, sender: edgeKey.slot, counter }, edgeKey.sign);
  if (!s.ok) { $('e-out').innerHTML = refused(s.stage, s.why) + ' No packet was built.'; return; }
  const o = await outbound(s.bytes, opts);
  if (o.ok) seen.set(o.from, o.counter);
  $('e-out').innerHTML = '<span class="ok">In:</span> checked, then said inside as a LIGHT packet of ' + n0(s.bytes.length) + ' bytes, signed by the edge\'s key. <span class="ok">Out:</span> through the door, then back to JSON: <code>' + esc(o.ok ? o.json.slice(0, 300) : o.why) + '</code>';
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
  $('c-out').innerHTML = '<p class="bottom">Through the managed path that traffic costs <b>' + esc(usd(r.managed.totalCents)) + '</b> a month (' + esc(gbp(r.managed.totalPence)) + '). ' +
    (r.node.nodes === 1 ? 'One node carries it' : esc(n0(r.node.nodes)) + ' nodes carry it') + ' for <b>' + esc(gbp(r.node.totalPence)) + '</b> a month. ' +
    (save >= 0 ? 'You keep <b>' + esc(gbp(save)) + '</b> a month, <b>' + esc(gbp(r.yearlyPence)) + '</b> a year.' : 'At these figures the node path costs <b>' + esc(gbp(-save)) + '</b> a month more.') + '</p>' +
    [['AWS WAF (web ACLs, rules, requests)', usd(r.managed.wafCents)], ['API Gateway (' + inputs.api + ')', usd(r.managed.gatewayCents)], ['Managed path in pounds, at the rate you set', gbp(r.managed.totalPence)],
      ['Nodes the rate needs for this volume', n0(r.node.nodes)], ['Their electricity at the Ofgem cap', gbp(r.node.electricityPence)], ['New machines, spread over their life', gbp(r.node.machinePence)], ['Licence', 'MIT, no licence fee']]
      .map(([k, v]) => '<div class="line"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>').join('');
}
for (const id of ['c-req', 'c-acl', 'c-rules', 'c-api', 'c-rate', 'c-watts', 'c-hours', 'c-fx', 'c-machine', 'c-life']) $(id).addEventListener('input', cost);

$('d-hear').addEventListener('click', () => hearText());
$('d-make').addEventListener('click', () => makePacket());
$('d-flip').addEventListener('click', () => flipByte());
$('d-again').addEventListener('click', () => replay());
$('e-go').addEventListener('click', () => throughEdge());
for (const b of document.querySelectorAll('[data-try]')) b.addEventListener('click', () => { $('d-in').value = b.dataset.try; hearText(); });
loadReceipt();
loadCost();
