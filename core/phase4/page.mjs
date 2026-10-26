// core/phase4/page.mjs — Phase 4's live page engine. It reads the committed receipt and the sealed claims and re-judges
// them in this tab; it shows the organism's life from the receipt (every round, every decision); and it plants the
// organism in this tab on the same real data (fetched from dex-frontier's own site, every file checked against the
// SHA-256 pinned in ./dex/SOURCES.json) and grows it with the same code, to show the same nodes come out (claim W1).
// The cost case is break-it's gated kernel on break-it's dated sources. Nothing here talks to anything but this origin.
import { judge } from './judge.mjs';
import { replay } from './tab.mjs';
import { loadBank, loadAdult } from './dex/src/fresh.mjs';
import { loadCredit } from './dex/src/fresh2.mjs';
import { loadCoupon } from './dex/src/fresh3.mjs';
import { loadShop } from './dex/src/silos.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (x) => Number(x).toLocaleString('en-GB');
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '–');
const tag = (held) => (held === true ? '<span class="tag held">HELD</span>' : held === false ? '<span class="tag failed">FAILED</span>' : '<span class="tag na">OPEN</span>');
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const SKILL = { shop: 'Shop sessions: will they buy?', bank: 'Bank calls: will they subscribe?', adult: 'Census people: income over $50K?', credit: 'Credit clients: default next month?', coupon: 'Coupon offers: accepted?' };
let RECEIPT = null, CLAIMS = null;

// ── the receipt, re-judged here, and the organism's life ──
async function loadReceipt() {
  try {
    const [claims, receipt] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase4.json')]);
    CLAIMS = claims; RECEIPT = receipt;
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    $('r-sum').innerHTML = '<b>' + j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet</b>, of ' + j.verdicts.length + ' claims sealed at <code>' + esc(String(receipt.sealedIn || '').slice(0, 7)) + '</code>. '
      + (same ? '<span class="ok">Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.</span>' : '<span class="no">Re-judged in this tab, the verdicts differ from the committed ones.</span>');
    $('r-rows').innerHTML = j.verdicts.map((v) => { const c = claims.claims.find((x) => x.id === v.id) || {}; return '<tr><td><b>' + esc(v.id) + '</b><br><span class="dim small">pass ' + esc(v.pass) + '</span></td><td>' + tag(v.held) + '</td><td>' + esc(c.claim || '') + '<br><span class="small dim">' + esc(v.measured) + '</span></td></tr>'; }).join('');
    $('pass-rows').innerHTML = claims.passes.map((p) => { const vs = j.verdicts.filter((v) => v.pass === p.pass), h = vs.filter((v) => v.held === true).length, fl = vs.filter((v) => v.held === false).length;
      return '<tr><td>' + p.pass + '</td><td>' + esc(p.organ) + '</td><td>' + esc(p.claims.join(', ')) + '</td><td>' + (vs.every((v) => v.held === null) ? '<span class="tag na">OPEN</span>' : h + ' held' + (fl ? ', <span class="no">' + fl + ' failed</span>' : '')) + '</td></tr>'; }).join('');
    // the tiles
    $('t-filled').textContent = f.a2 ? f.a2.filled.length + ' of ' + f.a2.planted.length : '…';
    $('t-grown').textContent = f.g4 ? f.g4.grown + ' (limit ' + f.g4.limits.maxGrown + ')' : '…';
    $('t-asks').textContent = f.o1 ? n0(f.o1.asks) : '…';
    $('t-held').textContent = j.held + ' of ' + j.verdicts.length;
    $('t-held-label').textContent = 'sealed claims holding; ' + (j.failed ? j.failed + ' failed and kept' : 'none failed') + (j.open ? ', ' + j.open + ' not measured yet' : '');
    // the life, round by round
    if (f.g3 && f.g3.rounds) {
      const skills = Object.keys(f.g3.rounds[0].grown).sort();
      $('life-head').innerHTML = '<tr><th>Round</th>' + skills.map((s) => '<th>' + esc(s) + '</th>').join('') + '</tr>';
      $('life-rows').innerHTML = f.g3.rounds.map((r) => '<tr><td>' + r.cycle + '</td>' + skills.map((s) => { const g = r.grown[s], p = r.planted[s]; return '<td><b>' + pc(g) + '</b>' + (g !== p ? '<br><span class="small dim">planted only: ' + pc(p) + '</span>' : '') + '</td>'; }).join('') + '</tr>').join('');
    }
    if (f.a1) $('log-rows').innerHTML = f.a1.log.map((l) => '<li>' + esc(l) + '</li>').join('');
    const dec = (d) => '<tr><td>' + d.cycle + '</td><td>' + esc(d.skill) + '</td><td>' + esc(d.silo || '') + '</td><td>' + pc(d.ba) + '<br><span class="small dim">bound ' + pc(d.baLow) + '</span></td><td>' + pc(d.incBa) + '</td><td>' + (Number.isFinite(d.diff) ? (d.diff >= 0 ? '+' : '') + (d.diff * 100).toFixed(1) + ' pts' : '–') + '<br><span class="small dim">bound ' + (Number.isFinite(d.diffLow) ? (d.diffLow * 100).toFixed(1) + ' pts' : '–') + '</span></td><td>' + (d.joined ? '<span class="ok">joined as ' + esc(d.joined) + '</span>' + (d.dropped ? '<br><span class="small dim">' + esc(d.dropped) + ' dropped</span>' : '') : '<span class="no">refused</span><br><span class="small dim">' + esc(d.why) + '</span>') + '</td></tr>';
    if (f.g1) $('cand-rows').innerHTML = f.g1.candidates.map(dec).join('');
    if (f.g2) $('ctrl-rows').innerHTML = f.g2.controls.map(dec).join('');
    if (f.g3) $('g3-rows').innerHTML = f.g3.skills.map((s) => '<tr><td>' + esc(s.skill) + '</td><td>' + s.joinedAfter + '</td><td>' + n0(s.asks) + '</td><td><b>' + pc(s.grown) + '</b></td><td>' + pc(s.planted) + '</td><td>' + (Number.isFinite(s.diffLow) ? (s.diffLow * 100).toFixed(1) + ' pts' : '–') + '</td></tr>').join('');
    if (f.o3) $('o3-line').textContent = 'Before each round the self-model said what every question would score. It was off by ' + (f.o3.mae * 100).toFixed(1) + ' points of balanced accuracy on average (' + f.o3.n + ' predictions); assuming nothing changes would have been off by ' + (f.o3.naive * 100).toFixed(1) + ' points.';
    if (f.w1) $('w1-line').innerHTML = 'Measured in a real tab on ' + esc(f.w1.where) + ': ' + esc(Object.entries(f.w1.tab.grown).map(([s, st]) => s + ': ' + st.map((x) => x.kind + ' ' + x.patternId + (x.pass === true ? ' joined' : x.pass === false ? ' refused' : '')).join(', ')).join('; ')) + '. What the tab gathered: <a href="local/w1.json">local/w1.json</a>.';
  } catch (e) {
    $('r-sum').innerHTML = '<span class="no">The receipt could not be loaded.</span>';
  }
}

// ── plant it in this tab ──
const FILES = { shop: ['data/online_shoppers_intention.csv'], coupon: ['data/in-vehicle-coupon-recommendation.csv'], bank: ['data/bank-additional-full.csv'], adult: ['data/adult.data', 'data/adult.test'], credit: ['data/credit-default.csv'] };
const LOAD = { shop: (t) => loadShop(t[0]), coupon: (t) => loadCoupon(t[0]), bank: (t) => loadBank(t[0]), adult: (t) => loadAdult(t[0], t[1]), credit: (t) => loadCredit(t[0]) };
const hexOf = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
function say(html) { const li = document.createElement('li'); li.innerHTML = html; $('tab-log').appendChild(li); }
async function plant() {
  const btn = $('tab-go');
  btn.disabled = true; btn.textContent = 'Growing…';
  $('tab-log').innerHTML = '';
  try {
    const pins = await getJson('./dex/SOURCES.json'), claims = CLAIMS || await getJson('./claims.json');
    const want = ['shop', 'coupon', ...($('tab-all').checked ? ['bank', 'adult', 'credit'] : [])];
    const datasets = {};
    for (const s of want) {
      const texts = [];
      for (const path of FILES[s]) {
        const pin = pins.data.find((d) => d.path === path);
        const r = await fetch('/dex-frontier/' + path, { cache: 'force-cache' });
        if (!r.ok) throw new Error(path + ' could not be fetched (' + r.status + ')');
        const buf = await r.arrayBuffer(), h = hexOf(await crypto.subtle.digest('SHA-256', buf));
        if (!pin || h !== pin.sha256) throw new Error(path + ' is not the pinned file (SHA-256 ' + h.slice(0, 12) + '…)');
        texts.push(new TextDecoder().decode(buf));
      }
      const ds = LOAD[s](texts);
      if (!ds.ok) throw new Error(s + ': ' + ds.error);
      datasets[s] = ds;
      say('<b>' + esc(s) + '</b>: ' + n0(ds.n) + ' real rows, the pinned file (SHA-256 checked): ' + n0(ds.fitRows.length) + ' to grow on, ' + n0(ds.gateRows.length) + ' to judge on, ' + n0(ds.testRows.length) + ' of work.');
    }
    const t0 = performance.now();
    const out = await replay(datasets, claims.policy, (st) => {
      const t = ((performance.now() - t0) / 1000).toFixed(0) + ' s';
      if (st.kind === 'planted') say('<span class="dim">' + t + '</span> <b>' + esc(st.skill) + '</b>: planted, pattern <code>' + esc(st.patternId) + '</code>');
      else if (st.kind === 'look') say('<span class="dim">' + t + '</span> <b>' + esc(st.skill) + '</b>: on the first round\'s work it scores ' + pc(st.ba) + (st.ba < claims.policy.target ? ', below the target of ' + pc(claims.policy.target) + ': a gap.' : ': not a gap.'));
      else say('<span class="dim">' + t + '</span> <b>' + esc(st.skill) + '</b>: ' + (st.kind === 'control' ? 'the control, grown on shuffled answers' : 'the candidate') + ', pattern <code>' + esc(st.patternId) + '</code> on the ' + esc(st.silo) + ' columns: ' + pc(st.ba) + ' on rows it never saw (bound ' + pc(st.baLow) + ') → ' + (st.pass ? '<span class="ok">joins</span>' : '<span class="no">refused</span>: ' + esc(st.why)));
    });
    window.w1 = { where: location.host + location.pathname, tab: { domains: out.domains, grown: out.grown } };
    if (RECEIPT && RECEIPT.facts && RECEIPT.facts.a1) {
      const life = RECEIPT.facts, ok = [];
      for (const s of out.domains) {
        // the run's nodes for this domain: what it planted, and every control and candidate it grew
        const run = [...(life.planted && life.planted[s] ? [life.planted[s].patternId] : []), ...[...life.g2.controls, ...life.g1.candidates].filter((d) => d.skill === s).map((d) => d.patternId)].sort();
        ok.push([s, JSON.stringify(run) === JSON.stringify(out.grown[s].map((d) => d.patternId).sort())]);
      }
      $('tab-out').innerHTML = ok.map(([s, same]) => '<b>' + esc(s) + '</b>: ' + (same ? '<span class="ok">the same nodes as the measured run</span>' : '<span class="no">not the run\'s nodes</span>')).join(' · ');
    }
  } catch (e) {
    say('<span class="no">Stopped:</span> ' + esc(e && e.message || e));
  }
  btn.disabled = false; btn.textContent = 'Plant it again';
}

// ── the cost case: break-it's kernel on break-it's dated sources ──
let costKernel = null, prices = null;
const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function loadCost() {
  try {
    const [k, src] = await Promise.all([import('/break-it/src/cost.mjs'), getJson('/break-it/costs/sources.json')]);
    const p = k.pricesFrom(src);
    if (!p.ok) throw new Error(p.why);
    costKernel = k; prices = p.prices;
    $('c-sources').innerHTML = src.sources.filter((s) => ['uk-nlw', 'ofgem-cap', 'intel-i7-1255u'].includes(s.key)).map((s) => '<li><a href="' + esc(s.url) + '">' + esc(s.what) + '</a> <span class="dim">(read ' + esc(s.read) + ')</span></li>').join('');
    $('c-rate').value = (prices.nlwPence / 100).toFixed(2);
    cost();
  } catch (e) { $('c-out').innerHTML = '<p class="no">The cost kernel or its sources could not be loaded from break-it.</p>'; }
}
const num = (id) => { const v = Number($(id).value); return Number.isFinite(v) ? v : NaN; };
function cost() {
  if (!costKernel) return;
  const hours = Math.round(num('c-models') * num('c-hours'));
  const inputs = { requests: 0, acls: 0, rules: 0, api: 'none', rate: 50, watts: Math.round(num('c-watts')), hours: Math.round(num('c-run')), fx10k: prices.fx10k, machinePence: 0, lifeMonths: 48, staffHours: hours, staffRatePence: Math.round(num('c-rate') * 100), staffShare: 100 };
  const r = costKernel.costCase(inputs, prices);
  if (!r.ok) { $('c-out').innerHTML = '<p class="no">' + esc(r.why) + '</p>'; return; }
  $('c-out').innerHTML = '<p class="bottom">A person building, checking and watching those models: <b>' + esc(gbp(r.staffPence)) + '</b> a month at the rate you set. The organism doing it on a machine you own: <b>' + esc(gbp(r.node.totalPence)) + '</b> a month in electricity. '
    + (r.monthlyPence >= 0 ? 'You keep <b>' + esc(gbp(r.monthlyPence)) + '</b> a month, <b>' + esc(gbp(r.yearlyPence)) + '</b> a year.' : 'At these figures the organism costs <b>' + esc(gbp(-r.monthlyPence)) + '</b> a month more.') + '</p>'
    + [['Staff hours a month', n0(hours)], ['At', '£' + num('c-rate').toFixed(2) + ' an hour'], ['The organism\'s electricity at the Ofgem cap', gbp(r.node.electricityPence)], ['New machines', '£0.00 (one you own)'], ['Licence', 'MIT, no licence fee']]
      .map(([k, v]) => '<div class="line"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>').join('');
}
for (const id of ['c-models', 'c-hours', 'c-rate', 'c-watts', 'c-run']) $(id).addEventListener('input', cost);
$('tab-go').addEventListener('click', () => plant());
loadReceipt();
loadCost();
