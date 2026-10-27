// core/phase6b/page.mjs — the fix's part of the Phase 6 page. It re-judges Phase 6b's committed receipt in this tab, shows
// the nine attacks and what refused each, the merge into a network that holds the rule, who that network's pool now
// covers, and the refusal of a network that does not; and it re-runs the fix in this tab on request (tab.mjs, claim N8).
// Every word it puts on the page is textContent. Nothing here talks to anything but this origin.
import { judge } from './judge.mjs';
import { rebind } from './tab.mjs';

const $ = (id) => document.getElementById(id);
const getJson = async (path) => { const r = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const put = (id, ...kids) => { const t = $(id); if (t) t.replaceChildren(...kids); };
const say = (id, text, cls) => put(id, el('p', cls || 'small', text));
const text = (id, t) => { const x = $(id); if (x) x.textContent = t; };
const n0 = (x) => Number(x).toLocaleString('en-GB');
const row = (...cells) => { const tr = el('tr'); for (const c of cells) tr.append(typeof c === 'string' ? el('td', null, c) : c); return tr; };
const tagOf = (held) => el('span', 'tag ' + (held === true ? 'held' : held === false ? 'failed' : 'na'), held === true ? 'HELD' : held === false ? 'FAILED' : 'OPEN');
const p6b = (window.p6b = window.p6b || {});
const WHO = { 'network[0]': 'a node of the larger network', founder: 'the activator the genesis names', networkMeasurer: 'a measurer the genesis names', liar: 'the dishonest peer' };
let RECEIPT = null;

async function load() {
  try {
    const [claims, receipt, ev] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase6b.json'), getJson('../phase6/evidence.json')]);
    RECEIPT = receipt;
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    p6b.rejudged = { held: j.held, failed: j.failed, open: j.open, same };
    put('fix-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + '. '), el('span', same ? 'ok' : 'no', same ? 'Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.' : 'Re-judged in this tab, the verdicts differ from the committed ones.'));
    const byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('fix-rows', ...j.verdicts.map((v) => { const td = el('td'), tg = el('td'); td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', v.measured)); tg.append(tagOf(v.held)); return row(el('td', 'mono', v.id), tg, td); }));
    const door = Object.fromEntries(f.n2.atDoor.map((a) => [a.id, a]));
    put('attack-rows', ...f.n1.attacks.map((a) => {
      const why = el('td'); why.append(el('span', a.ok ? 'no' : 'ok', a.ok ? 'PASSED' : 'refused'), el('br'), el('span', 'small dim', a.why || ''));
      return row(el('td', 'mono', a.id), WHO[a.by] || a.by, 'a ' + a.form + ' release of ' + a.asset, why, door[a.id] && door[a.id].ok === false ? 'refused' : 'RECORDED');
    }));
    const names = {};
    for (const c of ev.cards) names[c.id] = c.name === 'living-site' ? 'the living site' : c.name;
    names[ev.growth] = 'the growth engine (Phase 4\'s specialists)';
    const site = (ev.cards.find((c) => c.name === 'living-site') || {}).id;
    const own = f.n2.own.map((o) => o.asset), nameOf = (k) => names[k] || (own.includes('node:' + k.slice(0, 16)) ? 'node ' + (own.indexOf('node:' + k.slice(0, 16)) + 1) + ' of the larger network' : k.slice(0, 12) + '…');
    const m = f.n3, a = f.n4, r = f.n5;
    text('fix-merge-line', n0(m.booksEntries) + ' entries of the books offered: ' + n0(m.added) + ' added, ' + n0(m.skipped) + ' already held (the genesis both began from), ' + n0(m.refused.length) + ' refused. The living site\'s own release went in under its own key, with all ' + n0(m.siteValues.merged) + ' values on its asset.');
    put('fix-part-rows', ...Object.keys(a.parts).map((k) => row(nameOf(k), n0(a.parts[k]) + ' (' + ((100 * a.parts[k]) / a.pool).toFixed(2) + '%)')));
    text('fix-site-line', 'Without the rule, the living site had no part of the network\'s pool. With it, the living site has ' + n0(a.parts[site] || 0) + ' units of ' + n0(a.pool) + ', and all ' + a.booksContributorsCovered + ' of the books\' contributors and all ' + a.networkContributorsCovered + ' of the network\'s are covered. Replayed from nothing through the rule, the merged log gives ' + (a.replaySame ? 'the same allocation.' : 'a DIFFERENT allocation.'));
    text('fix-refuse-line', 'Offered to Phase 6\'s own mock network, which holds the squat, the books were ' + (r.refused ? 'refused before anything was written' : 'NOT refused') + '. The refusal named ' + r.unbound.length + ' releases that break the rule: ' + r.unbound.map((u) => u.asset).join(', ') + '. The mock was left ' + (r.unchanged ? 'exactly as it was.' : 'CHANGED.'));
    text('d-door', f.n2.atDoor.filter((x) => !x.ok).length + ' of ' + f.n2.atDoor.length + ' refused');
    text('d-merge', n0(m.added) + ' added · ' + n0(m.skipped) + ' already held · ' + n0(m.refused.length) + ' refused');
    text('d-cover', 'covers ' + a.booksContributorsCovered + ' of ' + a.booksContributors + ' + ' + a.networkContributorsCovered + ' of ' + a.networkContributors);
    text('d-refuse', r.refused ? 'refused, nothing written' : 'NOT refused');
  } catch (e) { say('fix-sum', 'The fix\'s receipt could not be loaded: ' + e.message, 'no'); }
}

// ── N8: the fix, re-run in this tab ──
$('fix-go').addEventListener('click', async () => {
  const btn = $('fix-go'); btn.disabled = true;
  put('fix-log'); put('fix-out');
  try {
    const r = await rebind((t) => $('fix-log').append(el('li', null, t)));
    const want = RECEIPT ? RECEIPT.facts.n4.parts : null, same = JSON.stringify(r.facts.parts) === JSON.stringify(want);
    p6b.n8 = { where: location.host + location.pathname, facts: r.facts };
    put('fix-out',
      el('p', same && r.facts.refused === 0 ? 'ok' : 'no', 'Your tab merged the books with ' + r.facts.refused + ' refused and shared the network\'s pool ' + (same ? 'exactly as the receipt does, part for part' : 'DIFFERENTLY from the receipt') + ', in ' + r.seconds + ' s.'),
      el('p', 'small', 'The network that does not bind names was ' + (r.facts.unboundRefused ? 'refused' : 'NOT refused') + (r.facts.siteNamed ? ', and the refusal named the living site\'s name under another key.' : '.')));
  } catch (e) { say('fix-out', 'The re-run stopped: ' + e.message, 'no'); }
  btn.disabled = false;
});

load();
