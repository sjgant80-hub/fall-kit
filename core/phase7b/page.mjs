// core/phase7b/page.mjs — the fix's part of the Phase 7 page. It re-judges Phase 7b's committed receipt in this tab, says
// what each claim measured, and shows a bridge pass immunity on in this tab on request (tab.mjs, claim R5). Every word it
// puts on the page is textContent. Nothing here talks to anything but this origin.
import { judge } from './judge.mjs';
import { bridgeTab } from './tab.mjs';

const $ = (id) => document.getElementById(id);
const getJson = async (path) => { const r = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const put = (id, ...kids) => { const t = $(id); if (t) t.replaceChildren(...kids); };
const say = (id, text, cls) => put(id, el('p', cls || 'small', text));
const text = (id, t) => { const x = $(id); if (x) x.textContent = t; };
const row = (...cells) => { const tr = el('tr'); for (const c of cells) tr.append(typeof c === 'string' ? el('td', null, c) : c); return tr; };
const tagOf = (held) => el('span', 'tag ' + (held === true ? 'held' : held === false ? 'failed' : 'na'), held === true ? 'HELD' : held === false ? 'FAILED' : 'OPEN');
const p7b = (window.p7b = window.p7b || {});

async function load() {
  try {
    const [claims, receipt] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase7b.json')]);
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    p7b.rejudged = { held: j.held, failed: j.failed, open: j.open, same };
    put('b7-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + '. '), el('span', same ? 'ok' : 'no', same ? 'Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.' : 'Re-judged in this tab, the verdicts differ from the committed ones.'));
    const byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('b7-rows', ...j.verdicts.map((v) => { const td = el('td'), tg = el('td'); td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', v.measured)); tg.append(tagOf(v.held)); return row(el('td', 'mono', v.id), tg, td); }));
    const on = Object.values(f.r1.b3.sharedOn).filter((x) => x.shared && x.recognised).length;
    text('b7-b3', 'Phase 7 replayed in full, the client\'s desk a bridge: it passed the hub\'s antibodies on to ' + on + ' of the client\'s 3 other nodes, each of which took them only after its own door re-ran them and then refused the forged packet on sight. The same replay with the desk as Phase 7 booted it gave Phase 7\'s B3 facts back ' + (JSON.stringify(f.r2.b3) === JSON.stringify(f.r2.sealed) ? 'field for field' : 'DIFFERENTLY') + ': the failure, reproduced, and the fix, measured against it.');
    const r3 = f.r3;
    text('b7-safety', 'And a bridge cannot hand on a refusal a member would not make: offered an antibody made from a genuine packet the living site signed to stay-a, the desk, which does not know the site, refused it and passed it on; stay-a, which does, ' + (r3.stayA.adopted === 0 ? 'did not take it' : 'TOOK it') + ' and ' + (r3.stayAHears.ok ? 'still let the genuine packet in' : 'did NOT let the genuine packet in') + '; stay-b, which does not, took it.');
    if (f.r4) { const ok = f.r4.results.filter((r) => r.exit === 0).length; text('b7-compat', 'Nothing that worked broke: ' + ok + ' of the ' + f.r4.results.length + ' phases that run on the node as it is now (' + f.r4.results.map((r) => r.phase.replace('phase', 'Phase ')).join(', ') + ') reproduced their receipts byte for byte on the new node.'); }
    else text('b7-compat', 'The re-run of every earlier phase on the new node is not recorded yet.');
  } catch (e) { say('b7-sum', 'The fix\'s receipt could not be loaded: ' + e.message, 'no'); }
}

$('bridge-go').addEventListener('click', async () => {
  const btn = $('bridge-go'); btn.disabled = true;
  put('bridge-log'); put('bridge-out');
  try {
    const r = await bridgeTab((t) => $('bridge-log').append(el('li', null, t)));
    p7b.r5 = { where: location.host + location.pathname, facts: r.facts };
    const ok = r.facts.relayOn.recognised && !r.facts.relayOff.recognised;
    put('bridge-out', el('p', ok ? 'ok' : 'no', ok ? 'In your tab, the bridge carried the immunity across, and without it the member did not know the packet, in ' + r.facts.seconds + ' s.' : 'In your tab the bridge did not behave as the receipt says.'));
  } catch (e) { say('bridge-out', 'It did not run: ' + e.message, 'no'); }
  btn.disabled = false;
});

load();
