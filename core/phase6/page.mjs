// core/phase6/page.mjs — Phase 6's live page engine. It re-judges the committed receipt in this tab, shows the books from
// it (every node's own record, the specialists, the sandbox allocation, the switch and its two paths), replays the books
// from nothing on request (tab.mjs, claim C11), and works out the cost case with break-it's gated kernel on its dated
// sources. Every word it puts on the page is textContent. Nothing here talks to anything but this origin.
import { judge } from './judge.mjs';
import { rederive } from './tab.mjs';

const $ = (id) => document.getElementById(id);
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const put = (id, ...kids) => { const t = $(id); if (t) t.replaceChildren(...kids); };
const say = (id, text, cls) => put(id, el('p', cls || 'small', text));
const n0 = (x) => Number(x).toLocaleString('en-GB');
const row = (...cells) => { const tr = el('tr'); for (const c of cells) tr.append(typeof c === 'string' ? el('td', null, c) : c); return tr; };
const tagOf = (held) => el('span', 'tag ' + (held === true ? 'held' : held === false ? 'failed' : 'na'), held === true ? 'HELD' : held === false ? 'FAILED' : 'OPEN');
const p6 = (window.p6 = window.p6 || {});
const ROLE = { site: 'the living site', breakit: 'break-it', konomi: 'konomi-slm' };
let RECEIPT = null, NAMES = {};

async function load() {
  try {
    const [claims, receipt, ev] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase6.json'), getJson('./evidence.json')]);
    RECEIPT = receipt;
    for (const c of ev.cards) NAMES[c.id] = c.name === 'living-site' ? 'the living site' : c.name;
    NAMES[ev.growth] = 'the growth engine (Phase 4\'s specialists)';
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    p6.rejudged = { held: j.held, failed: j.failed, open: j.open, same };
    put('r-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + '. '), el('span', same ? 'ok' : 'no', same ? 'Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.' : 'Re-judged in this tab, the verdicts differ from the committed ones.'));
    const byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('r-rows', ...j.verdicts.map((v) => { const td = el('td'), tg = el('td'); td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', v.measured)); tg.append(tagOf(v.held)); return row(el('td', 'mono', v.id), tg, td); }));
    put('r-notes', ...(Array.isArray(receipt.notes) && receipt.notes.length ? receipt.notes.map((t) => el('p', null, t)) : [el('p', 'dim', 'No failures.')]));
    const vOf = Object.fromEntries(j.verdicts.map((v) => [v.id, v]));
    const passes = [[1, 'core/economy.mjs: the second hand', ['C5', 'C9']], [2, 'core/phase6/books.mjs: the nodes and the auditor\'s books', ['C1', 'C2', 'C3', 'C4']], [3, 'core/phase6/paths.mjs: the switch and its two paths', ['C6', 'C7', 'C8']], [4, 'this page', ['C10', 'C11']]];
    put('pass-rows', ...passes.map(([p, organ, ids]) => { const held = ids.filter((i) => vOf[i].held === true).length, failed = ids.filter((i) => vOf[i].held === false).length, open = ids.length - held - failed; return row(el('td', 'mono', String(p)), organ, el('td', 'mono', ids.join(' ')), held + ' held' + (failed ? ', ' + failed + ' failed' : '') + (open ? ', ' + open + ' open' : '')); }));
    const tile = (id, t) => { const x = $(id); if (x) x.textContent = t; };
    tile('t-values', n0(f.c2.values));
    tile('t-nodes', String(['site', 'breakit', 'konomi'].filter((r) => f.c1.nodes[r] && f.c1.nodes[r].release && f.c1.nodes[r].valuesBy > 0).length) + ' of 3');
    tile('t-pool', n0(f.c5.total) + ' of ' + n0(f.c5.pool));
    tile('t-held', j.held + ' of ' + j.verdicts.length);
    put('node-rows', ...['site', 'breakit', 'konomi', 'liar'].map((r) => {
      const nd = f.c1.nodes[r] || {}, m = f.c2.merged[r] || null;
      return row(r === 'liar' ? 'the dishonest peer (its receipts do not check)' : ROLE[r], nd.release ? 'recorded' : 'none', n0(nd.valuesBy || 0), m ? n0(m.sent) + ' entries' : 'not sent', m ? n0(m.added) : '–', m ? n0(m.skipped) : '–', m ? n0(m.refused.length) : '–');
    }));
    put('spec-rows', ...f.c4.specialists.map((s) => row(s.skill, s.kind === 'control' ? 'a control (scrambled answers), which the gate let in' : 'a grown candidate', (s.gain * 100).toFixed(1) + ' points of balanced accuracy', n0(s.units))));
    say('planted-line', 'A value planted one unit over what Phase 4 measured (' + n0(f.c4.planted.units) + ' units) was ' + (f.c4.planted.ok ? 'RECORDED' : 'refused: ' + f.c4.planted.why) + '.', f.c4.planted.ok ? 'no' : 'ok');
    const credits = f.c5.credits || {}, parts = f.c5.parts || {};
    put('part-rows', ...Object.keys(parts).map((k) => row(NAMES[k] || k.slice(0, 12) + '…', n0(credits[k] || 0), n0(parts[k]) + ' (' + ((100 * parts[k]) / f.c5.pool).toFixed(2) + '%)')));
    const growth = Object.keys(parts).find((k) => k === ev.growth);
    $('spec-share').textContent = growth ? ((100 * parts[growth]) / f.c5.pool).toFixed(1) + '% of it' : 'none of it';
    $('live-line').textContent = f.c6.live.ok ? 'it gave one: something is wrong.' : '“' + f.c6.live.why + '”.';
    const k7 = f.c7, k8 = f.c8;
    $('fork-line').textContent = (k7.recorded ? 'The activator\'s switch was recorded; ' : 'The activator\'s switch was NOT recorded; ') + (k7.liveEqualsSandbox ? 'the live allocation was exactly the sandbox one. ' : 'the live allocation differed. ') + 'A node\'s own switch was ' + (k7.nodeSwitch.ok ? 'RECORDED' : 'refused') + ', a second switch ' + (k7.second.ok ? 'RECORDED' : 'refused') + '. The books stayed ' + (k7.booksStillOff ? 'off.' : 'SWITCHED.');
    $('network-line').textContent = n0(k8.booksEntries) + ' entries merged: ' + n0(k8.added) + ' added, ' + n0(k8.skipped) + ' already held, ' + n0(k8.refused.length) + ' refused. The network\'s allocation gave ' + n0(k8.total) + ' of ' + n0(k8.pool) + ', to ' + k8.booksContributorsCovered + ' of the books\' ' + k8.booksContributors + ' contributors and all ' + k8.networkContributors + ' of the network\'s; the merged log replayed to ' + (k8.replaySame ? 'the same allocation.' : 'a DIFFERENT allocation.');
  } catch (e) { say('r-sum', 'The receipt could not be loaded: ' + e.message, 'no'); }
}

// ── C11: the books, replayed from nothing in this tab ──
$('tab-go').addEventListener('click', async () => {
  const btn = $('tab-go'); btn.disabled = true;
  put('tab-log'); put('tab-out');
  try {
    const r = await rederive((t) => $('tab-log').append(el('li', null, t)));
    const f = RECEIPT ? RECEIPT.facts : {}, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    p6.c11 = { facts: r.facts, seconds: r.seconds };
    const ok = r.facts.head === (f.c3 && f.c3.head) && r.facts.sameCredits && same(r.facts.parts, f.c5 && f.c5.parts);
    put('tab-out',
      el('p', ok ? 'ok' : 'no', 'Your tab reached ' + (r.facts.head === (f.c3 && f.c3.head) ? 'the receipt\'s final hash' : 'a DIFFERENT final hash') + ' (' + String(r.facts.head).slice(0, 16) + '…), ' + (r.facts.sameCredits ? 'the same credits' : 'DIFFERENT credits') + ' and ' + (same(r.facts.parts, f.c5 && f.c5.parts) ? 'the same sandbox parts' : 'DIFFERENT parts') + ', in ' + r.seconds + ' s.'),
      el('p', 'small', 'The second hand agrees on the parts: ' + (r.facts.secondHandAgrees ? 'yes' : 'NO') + '. A live allocation, asked of the books you just rebuilt: ' + (r.live.ok ? 'GIVEN' : 'refused (' + r.live.why + ')') + '.'));
  } catch (e) { say('tab-out', 'The replay stopped: ' + e.message, 'no'); }
  btn.disabled = false;
});

// ── the cost case: break-it's kernel on break-it's dated sources, staff time only ──
let kernel = null, prices = null;
async function loadCost() {
  try {
    const [k, src] = await Promise.all([import('/break-it/src/cost.mjs'), getJson('/break-it/costs/sources.json')]);
    const p = k.pricesFrom(src);
    if (!p.ok) throw new Error(p.why);
    kernel = k; prices = p.prices; cost();
  } catch (e) { say('c-out', 'The cost kernel or its sources could not be loaded from break-it: ' + e.message, 'no'); }
}
function cost() {
  if (!kernel) return;
  const int = (id) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.round(v) : NaN; };
  const hours = int('c-hours'), share = int('c-share');
  const r = kernel.costCase({ requests: 0, acls: 0, rules: 0, api: 'none', rate: 1, watts: 1, hours: 1, fx10k: prices.fx10k, machinePence: 0, lifeMonths: 1, staffHours: hours, staffRatePence: prices.nlwPence, staffShare: share }, prices);
  if (!r.ok) { say('c-out', r.why, 'no'); return; }
  const off = Math.round((hours * share) / 10) / 10;
  put('c-out', el('p', 'bottom', off + ' staff hours a month come off your people. At the UK\'s legal minimum wage that is ' + (r.staffPence / 100).toFixed(2) + ' pounds a month, ' + ((r.staffPence * 12) / 100).toFixed(2) + ' a year, a floor: your own people cost more.'), el('p', 'small dim', 'The sum is break-it\'s gated cost kernel with its dated National Living Wage source (' + (prices.nlwPence / 100).toFixed(2) + ' pounds an hour from April 2026). The books themselves run on the machines your nodes already use. MIT, no licence fee.'));
}
for (const id of ['c-hours', 'c-share']) $(id).addEventListener('input', cost);

load();
loadCost();
