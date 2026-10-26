// core/page.mjs — the live page's engine. It reads the committed receipt, and on request re-runs Phase 1's scenario in
// this tab with the real organs: break-it and konomi-slm loaded from their own sites on this origin, each carrying its
// own copy of the foundation. The cost case is break-it's gated kernel on break-it's dated list prices. Nothing here
// talks to anything but this origin; the page's policy allows nothing else.
import { localCell, ROLES, meshSetup } from './cells.mjs';
import { scenario, triageRowsFrom, brk1CasesFrom } from './scenario.mjs';
import { judge } from './judge.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (x) => Number(x).toLocaleString('en-GB');
const tag = (held) => (held === true ? '<span class="tag held">HELD</span>' : held === false ? '<span class="tag failed">FAILED</span>' : '<span class="tag na">n/a</span>');
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };

let receipt = null, claims = null, measuredRate = null;

// ── the committed receipt ──
async function loadReceipt() {
  try { [receipt, claims] = await Promise.all([getJson('./receipts/foundation.json'), getJson('./claims.json')]); }
  catch { $('r-sum').textContent = 'The receipt (core/receipts/foundation.json) could not be read.'; return; }
  const f = receipt.facts;
  $('t-held').textContent = receipt.held + ' / ' + receipt.verdicts.length;
  $('t-msgs').textContent = n0(f.wire.messages);
  $('tr-msgs').textContent = n0(f.wire.messages);
  $('tr-avg').textContent = n0(Math.round(f.wire.bytes / Math.max(1, f.wire.messages)));
  $('tr-budget').textContent = String(f.budget.allowed);
  $('tr-sixth').textContent = f.budget.sixthPackets === 0 ? 'no' : String(f.budget.sixthPackets);
  $('tr-honest').textContent = n0(f.couplings.honest);
  $('tr-dishonest').textContent = n0(f.couplings.dishonest);
  $('tr-credits').textContent = f.ledger.creditsEqual ? 'the same' : 'different';
  $('im-adopted').textContent = String(f.immunity.adopted);
  $('im-sight').textContent = f.immunity.recognisedAfter ? 'recognised on sight' : 'not recognised';
  $('im-blocked').textContent = f.immunity.autoimmuneBlocked >= 1 ? 'blocked' : 'not blocked';
  $('r-sum').textContent = receipt.held + ' of ' + receipt.verdicts.length + ' claims held, ' + receipt.failed + ' failed, ' + receipt.unmeasured + ' not measured. Claims sealed at commit ' + String(receipt.sealed.commit).slice(0, 7) + (receipt.sealed.matchesCommit ? '' : ' (the file no longer matches it)') +
    '; the foundation inside break-it and konomi-slm is ' + (receipt.nodes['break-it'].sameFoundation && receipt.nodes['konomi-slm'].sameFoundation ? 'byte-identical to this one.' : 'NOT the same as this one.');
  $('r-rows').innerHTML = receipt.verdicts.map((v) => '<tr><td><b>' + esc(v.id) + '</b> ' + esc(v.claim) + '</td><td>' + tag(v.held) + '</td><td class="mono small">' + esc(v.measured) + '</td></tr>').join('');
  await loadBlueprint();
}

async function loadBlueprint() {
  let sources = null, gate = null;
  try { sources = await getJson('./vendor/SOURCES.json'); } catch { sources = null; }
  try { gate = await getJson('./receipts/witness.json'); } catch { gate = null; }
  const score = (name) => { const k = gate && (gate.kernels || []).find((x) => x.name === name); return k ? n0(k.killed) + ' / ' + n0(k.total) + (k.ignored ? ' · ' + k.ignored + ' reviewed' : '') : '—'; };
  const own = [
    ['antibody.mjs', 'every refusal at the LIGHT door becomes an exact antibody (by hash, keyed to the pinned keys where they decide) and a shape that names variants', 'this repo', score('antibody')],
    ['node.mjs', 'the cell: the door, immunity, budget, memory, ledger and couplings around one identity; what a node says and what it will hear', 'this repo', score('node')],
    ['identity.mjs', 'one Ed25519 key in every form the kernels take it (adapter: decides nothing)', 'this repo', score('identity')],
    ['judge.mjs', 'the receipt’s verdicts from its facts, one rule per sealed claim', 'this repo', score('judge')],
  ];
  const vend = sources ? sources.files.map((f) => [f.path, f.what, '<a href="https://github.com/sjgant80-hub/' + esc(f.repo) + '/blob/' + esc(f.commit) + '/' + esc(f.src) + '">' + esc(f.repo) + '@' + esc(f.commit.slice(0, 7)) + '</a>', 'gated at its source']) : [];
  $('bp-rows').innerHTML = [...own.map((r) => [esc(r[0]), esc(r[1]), esc(r[2]), esc(r[3])]), ...vend.map((r) => [esc(r[0]), esc(r[1]), r[2], esc(r[3])])]
    .map((r) => '<tr><td class="mono">' + r[0] + '</td><td>' + r[1] + '</td><td class="mono small">' + r[2] + '</td><td class="mono small">' + r[3] + '</td></tr>').join('');
  $('t-organs').textContent = String((sources ? sources.files.length : 0) + 3);
  if (gate) { $('t-gate').textContent = n0(gate.killed) + ' / ' + n0(gate.total); $('bp-foot').textContent = (gate.clean ? 'CLEAN: ' : 'NOT CLEAN: ') + n0(gate.killed) + ' of ' + n0(gate.total) + ' mutants killed across the foundation’s own organs; ' + (gate.ignored || 0) + ' reviewed as equivalent, each with a written reason in core/witness.baseline.json.'; }
}

// ── the run, in this tab ──
const say = (line) => { const l = $('log'); l.textContent = (l.textContent === 'The log appears here.' ? '' : l.textContent + '\n') + line; l.scrollTop = l.scrollHeight; };
const words = (name, r) => {
  if (!r) return name + ': (no answer)';
  if (name === 'pin') return 'pinned a peer' + (r.released ? ', and recorded its release on the ledger' : '');
  if (name === 'train' || name === 'ask') return 'triage answer: ' + (r.outcome || r.verdict);
  if (name === 'screen') return 'break-it screened a BRK1 packet: ' + (r.answer ? (r.answer.admit ? 'admitted' : 'refused at ' + r.answer.stage) : r.outcome);
  if (name === 'genuine') return 'a genuine packet: ' + (r.ok ? 'admitted' : 'refused');
  if (name === 'hostile') return 'a hostile packet: refused at ' + r.stage + (r.decoded ? '' : ', body never read');
  if (name === 'attack') return 'an attack at break-it: refused at ' + r.stage;
  if (name === 'antibodies') return 'konomi-slm re-ran ' + r.offered + ' antigens on its own door and adopted ' + r.adopted;
  if (name === 'attack-again') return 'the same attack at konomi-slm: ' + (r.recognised ? 'recognised on sight' : 'refused at ' + r.stage);
  if (name === 'autoimmunity') return 'a valid packet slipped into a bundle: ' + r.autoimmuneBlocked + ' blocked, ' + r.adopted + ' adopted';
  if (name === 'ledger') return 'a ledger received: ' + r.added + ' entries recorded, ' + r.refused + ' it could not re-check';
  if (name === 'budget') return 'the sixth ask on a budget of five: ' + (r.ok ? 'allowed' : r.why);
  return name;
};

async function run() {
  for (const b of [$('run'), $('run-top')]) b.disabled = true;
  $('log').textContent = '';
  $('run-stat').textContent = 'loading the organs…';
  try {
    if (!(globalThis.crypto && crypto.subtle)) throw new Error('this browser has no WebCrypto');
    const [breakit, konomi, pins, domains, wire] = await Promise.all([
      import('/break-it/node/breakit-node.mjs'), import('/konomi-slm/node/konomi-node.mjs'), getJson('/break-it/config/pubkeys.json'),
      import('/konomi-slm/vendor/seed-library/domains.mjs'), import('/break-it/src/wire.mjs'),
    ]);
    say('loaded break-it and konomi-slm from their own sites');
    $('run-stat').textContent = 'starting the cells (konomi-slm grows its library)…';
    const mods = { breakit, konomi, pins };
    const cells = {};
    for (const role of ROLES) { cells[role] = await localCell(role, mods); say('cell ready: ' + cells[role].name); }
    const { ids } = await meshSetup();
    const inputs = { rows: triageRowsFrom(domains, 40), brk1: await brk1CasesFrom(wire, ids.stranger) };
    $('run-stat').textContent = 'running…';
    const t0 = performance.now();
    const out = await scenario(cells, inputs, (name, r) => say(words(name, r)));
    const secs = (performance.now() - t0) / 1000;
    measuredRate = Math.max(1, Math.floor(out.facts.wire.messages / Math.max(0.001, secs)));
    say('done: ' + out.facts.wire.messages + ' packets in ' + secs.toFixed(1) + ' s');
    const mine = judge(claims, out.facts);
    const theirs = receipt ? receipt.verdicts : [];
    const same = receipt ? JSON.stringify(Object.fromEntries(Object.entries(out.facts).filter(([k]) => k !== 'processes'))) === JSON.stringify(Object.fromEntries(Object.entries(receipt.facts).filter(([k]) => k !== 'processes'))) : false;
    $('run-rows').innerHTML = mine.verdicts.map((v) => {
      const r = theirs.find((x) => x.id === v.id);
      const note = v.id === 'F9' ? 'separate processes: measured by CI, not in a tab' : v.measured;
      return '<tr><td><b>' + esc(v.id) + '</b></td><td>' + tag(v.held) + '</td><td>' + tag(r ? r.held : null) + '</td><td class="mono small">' + esc(note) + '</td></tr>';
    }).join('');
    $('run-note').innerHTML = (same ? '<span class="ok">Your tab reached exactly the receipt’s facts.</span>' : '<span class="no">Your tab’s facts differ from the receipt’s.</span> konomi-slm’s synthetic data is generated with floating-point maths, which can differ in the last digit between browser engines. Compare the verdicts.') +
      ' It handled ' + n0(out.facts.wire.messages) + ' packets in ' + secs.toFixed(1) + ' seconds, about <b>' + n0(measuredRate) + '</b> a second over the whole run, including growing the library again. The cost case now uses that rate.';
    $('kstat').textContent = 'run in this tab: ' + mine.held + ' held';
    $('c-rate').value = String(measuredRate);
    cost();
    $('run-stat').textContent = 'done';
  } catch (e) {
    $('run-stat').textContent = 'stopped';
    say('the run stopped: ' + (e && e.message ? e.message : e));
  } finally { for (const b of [$('run'), $('run-top')]) b.disabled = false; }
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

$('run').addEventListener('click', run);
$('run-top').addEventListener('click', () => { $('run').scrollIntoView({ behavior: 'smooth', block: 'center' }); run(); });
loadReceipt();
loadCost();
