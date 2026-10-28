// core/phase7/page.mjs — Phase 7's live page engine. It re-judges the committed receipt in this tab and shows, from it,
// what the client's node did in the estate's mesh (Model A), what the client's own organism did (Model B), the wedge and
// the receipts by role; it grows the client's organism in this tab on request (tab.mjs, claim P1), from the sealed phrase
// or from a visitor's own; and it works out the cost case from its one sourced figure. Every word it puts on the page is
// textContent. Nothing here talks to anything but this origin.
import { judge } from './judge.mjs';
import { grow } from './tab.mjs';

const $ = (id) => document.getElementById(id);
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const put = (id, ...kids) => { const t = $(id); if (t) t.replaceChildren(...kids); };
const say = (id, text, cls) => put(id, el('p', cls || 'small', text));
const text = (id, t) => { const x = $(id); if (x) x.textContent = t; };
const row = (...cells) => { const tr = el('tr'); for (const c of cells) tr.append(typeof c === 'string' ? el('td', null, c) : c); return tr; };
const tagOf = (held) => el('span', 'tag ' + (held === true ? 'held' : held === false ? 'failed' : 'na'), held === true ? 'HELD' : held === false ? 'FAILED' : 'OPEN');
const p7 = (window.p7 = window.p7 || {});
const WHO = { site: 'the living site', breakit: 'break-it', konomi: 'konomi-slm' };
const ROLES = [
  ['Security (CISO)', 'Can it be reached through the mesh? Is anything outside trusted? What happens when it is attacked?', ['A2', 'A5', 'B2', 'B3', 'W2']],
  ['Operations (COO)', 'Does it answer, catch double bookings, and keep going when a part stops?', ['A3', 'B1', 'W1']],
  ['Finance (CFO)', 'What does it cost, and what does it commit us to?', ['A6']],
  ['Regulator, data protection', 'Do customers\' details leave? Can you show what was done?', ['A4', 'P2', 'A6', 'B2']],
  ['Technology (CTO)', 'Is it really the shared foundation, and does it re-run anywhere?', ['A1', 'P1', 'W1']],
];
let RECEIPT = null;

async function load() {
  try {
    const [claims, receipt] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase7.json')]);
    RECEIPT = receipt;
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    p7.rejudged = { held: j.held, failed: j.failed, open: j.open, same };
    const vOf = Object.fromEntries(j.verdicts.map((v) => [v.id, v])), byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('r-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + '. '), el('span', same ? 'ok' : 'no', same ? 'Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.' : 'Re-judged in this tab, the verdicts differ from the committed ones.'));
    put('r-rows', ...j.verdicts.map((v) => { const td = el('td'), tg = el('td'); td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', v.measured)); tg.append(tagOf(v.held)); return row(el('td', 'mono', v.id), tg, td); }));
    put('r-notes', ...(Array.isArray(receipt.notes) && receipt.notes.length ? receipt.notes.map((t) => el('p', null, t)) : [el('p', 'dim', 'No failures.')]));
    const passes = [[1, 'the client\'s node, in the client\'s own repository', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']], [2, 'core/seed.mjs: the seed', ['B1', 'B2', 'B3']], [3, 'no new organ: the pilot as the wedge', ['W1', 'W2']], [4, 'this page', ['P1', 'P2']]];
    put('pass-rows', ...passes.map(([p, organ, ids]) => { const held = ids.filter((i) => vOf[i].held === true).length, failed = ids.filter((i) => vOf[i].held === false).length, open = ids.length - held - failed; return row(el('td', 'mono', String(p)), organ, el('td', 'mono', ids.join(' ')), held + ' held' + (failed ? ', ' + failed + ' failed' : '') + (open ? ', ' + open + ' open' : '')); }));
    put('role-rows', ...ROLES.map(([role, ask, ids]) => { const td = el('td'); for (const i of ids) { td.append(el('span', 'mono', i + ' '), tagOf(vOf[i] ? vOf[i].held : null), document.createTextNode(' ' + (byId[i] ? byId[i].claim : '')), el('br')); } return row(el('td', null, role), ask, td); }));
    // Model A
    const a3 = f.a3, a4 = f.a4, a6 = f.a6, a2 = f.a2;
    const checked = a3.stays.filter((s) => s.outcome === 'verified' && s.audit).length + a3.guards.filter((g) => g.outcome === 'verified' && g.recheck).length;
    text('t-asks', checked + ' of ' + (a3.stays.length + a3.guards.length));
    text('t-guests', String(a4.foundCount));
    const cross = Object.values(f.b2.cross.intoChild).concat(Object.values(f.b2.cross.intoEstate)).flatMap((x) => Object.values(x));
    text('t-cross', cross.filter((s) => s === 'sender').length + ' of ' + cross.length);
    text('t-held', j.held + ' of ' + j.verdicts.length);
    text('a-sum', 'The client\'s node ran in its own process with the living site, break-it and konomi-slm, each in its own. ' + Object.values(a2.pinned).filter((p) => p.length === 3).length + ' of 4 pinned exactly the other three from the founder\'s signed roster, and every one refused a roster signed by someone else. ' + a2.messages + ' messages crossed, ' + a2.nonLight + ' of them not LIGHT. The client\'s node sent ' + a4.packets + ' packets; read raw and decoded, ' + (a4.foundCount === 0 ? 'none held a guest\'s name, a booking\'s id or figure, or anything shaped like an email address or a phone number.' : a4.foundCount + ' held something of the privacy list.'));
    put('a-stay-rows', ...a3.stays.map((s) => row(WHO[s.asker] || s.asker, s.cabin, s.checkin + ' to ' + s.checkout, el('td', s.available === false ? 'no' : 'ok', s.available === true ? 'free' : s.available === false ? 'not free' : 'no answer'), el('td', s.audit ? 'ok' : 'no', s.audit ? 'the same' : 'DIFFERENT'))));
    put('a-guard-rows', ...a3.guards.map((g) => row(el('td', 'mono', g.id), String(g.bookings), (g.clashes || []).length ? g.clashes.map((c) => c.cabin + ': ' + c.a.channel + ' ' + c.a.checkin + ' to ' + c.a.checkout + ' against ' + c.b.channel + ' ' + c.b.checkin + ' to ' + c.b.checkout).join('; ') : 'none', el('td', g.recheck ? 'ok' : 'no', g.recheck ? 'the same answer' : 'DIFFERENT'))));
    const im = f.a5;
    text('a-immune', 'Immunity, both ways: a packet in the living site\'s name signed by a stranger, refused first at break-it (at its ' + im[0].stage + ' check), was adopted by the client\'s node after its own door re-ran it, and then refused on sight. A second, refused first at the client\'s node, was adopted by all three estate nodes the same way, and refused on sight by each.');
    text('a-books', 'In the books: ' + a6.used + ' answers used, ' + a6.valuesOnClient + ' recorded on the client\'s node\'s own name, each by the node that asked; the merge of every ledger refused ' + a6.refused + '; the client\'s key is credited; and a live allocation is refused, because the switch is off.');
    text('d-a-asks', checked + ' answers, each checked by its asker');
    text('d-a-guests', a4.foundCount + ' guest details in anything it sent');
    // Model B
    const b1 = f.b1, b2 = f.b2, b3 = f.b3;
    const lost = b1.asks.reduce((t, a) => t + a.lost.length, 0);
    text('b-grow', 'Grown from the sealed phrase: a founder and four nodes, each in its own process, each pinning exactly the other three from the client\'s own roster. The desk asked its booking engine ' + b1.asks.length + ' times and every answer equalled the client\'s audit. After ask 6, ' + b1.killed.join(', ') + ' was killed; every later ask was answered by the copy still standing (' + lost + ' ask lost and asked again). A forged packet, refused first at stay-a, was refused on sight by the other three after their own re-run.');
    text('b-sovereign', 'Sovereign: ' + b2.foreign + ' keys of the estate in the client\'s roster, genesis or pins; ' + cross.filter((s) => s === 'sender').length + ' of ' + cross.length + ' packets between the estate and the client\'s organism refused at the door, because neither pins the other; the client\'s records replay under its own genesis, and the estate\'s books refuse them, because they began from different geneses.');
    const on = Object.values(b3.sharedOn).filter((x) => x.shared).length;
    text('b-coupled', 'Coupled, by choice: planted on the genesis the estate and the client name together, the client\'s ' + Object.keys(b3.merged).length + ' ledgers merged into the estate\'s books ' + (Object.values(b3.merged).every((m) => m.merged && m.refused.length === 0) ? 'with nothing refused and every entry counted once' : 'NOT cleanly') + '. The desk took the estate hub\'s antibodies after its own re-run and refused the forged packet on sight; an antibody made from a genuine packet of the client\'s own was not taken (' + b3.falseAntibody.blocked + ' blocked). It passed them on to ' + on + ' of the client\'s other 3 nodes.');
    text('d-b-asks', b1.asks.length + ' asks answered, through the loss of a node');
    text('d-b-cross', cross.filter((s) => s === 'sender').length + ' of ' + cross.length + ' cross packets refused');
    // the wedge
    const w1 = f.w1, w2 = f.w2;
    text('w-pilot', 'break-it\'s own pilot check, at the commit sealed for it, ' + (w1.exit === 0 ? 'ran clean' : 'did NOT run clean') + ': ' + w1.ticks + ' checks held and ' + w1.crosses + ' not; the ledger and the books re-derived from the feed alone; a real node took the first records again; and the judge, re-run on the receipt, gives ' + (w1.judged ? w1.judged[0] + ' held and ' + w1.judged[1] + ' failed' : 'nothing') + ', as sealed (' + w1.sealed.failedIds.join(', ') + ' failed and kept).');
    put('w-case-rows', ...w2.cases.map((c, i) => row(c.name, el('td', c.stage === c.expect ? 'ok' : 'no', c.stage), w2.direct[i])));
    text('d-w-pilot', 'the pilot re-runs: ' + (w1.exit === 0 ? 'clean' : 'NOT clean') + ', ' + (w1.judged ? w1.judged.join(' held, ') + ' failed' : ''));
    text('d-w-gate', w2.cases.filter((c, i) => c.stage === c.expect && c.stage === w2.direct[i]).length + ' of ' + w2.cases.length + ' cases at the client\'s own front door');
  } catch (e) { say('r-sum', 'The receipt could not be loaded: ' + e.message, 'no'); }
}

// ── P1: the client's organism, grown in this tab ──
$('g-go').addEventListener('click', async () => {
  const btn = $('g-go'); btn.disabled = true;
  put('g-log'); put('g-out');
  try {
    const r = await grow((t) => $('g-log').append(el('li', null, t)));
    const want = RECEIPT && RECEIPT.facts.p1 ? RECEIPT.facts.p1.want : null;
    p7.p1 = { where: location.host + location.pathname, facts: r.facts };
    if (want) {
      const sameKeys = JSON.stringify(r.facts.keys) === JSON.stringify(want.keys), sameVerdicts = JSON.stringify(r.facts.verdicts) === JSON.stringify(want.verdicts);
      const ok = r.facts.roster === want.roster && r.facts.genesis === want.genesis && sameKeys && sameVerdicts;
      put('g-out', el('p', ok ? 'ok' : 'no', 'Your tab reached ' + (r.facts.roster === want.roster ? 'the receipt\'s roster' : 'a DIFFERENT roster') + ', ' + (r.facts.genesis === want.genesis ? 'its genesis' : 'a DIFFERENT genesis') + ', ' + (sameKeys ? 'its keys' : 'DIFFERENT keys') + ' and ' + (sameVerdicts ? 'its answers' : 'DIFFERENT answers') + ', in ' + r.seconds + ' s.'));
    } else put('g-out', el('p', 'small', 'Grown in ' + r.seconds + ' s. The receipt holds no tab measurement yet to compare with.'));
  } catch (e) { say('g-out', 'The organism did not grow: ' + e.message, 'no'); }
  btn.disabled = false;
});

$('own-go').addEventListener('click', async () => {
  const btn = $('own-go'), phrase = $('own-phrase').value;
  btn.disabled = true; put('own-out');
  try {
    const r = await grow(null, phrase);
    const o = r.organism, list = el('ul', 'small');
    for (const role of o.roles) list.append(el('li', null, role + ': key ' + o.ids[role].slice(0, 16) + '…'));
    put('own-out', el('p', 'ok', 'Your organism grew in ' + r.seconds + ' s: a founder and ' + (o.roles.length - 1) + ' nodes, ' + o.messages + ' messages between them, ' + o.nonLight + ' not LIGHT; its desk asked its booking engine ' + o.stays.length + ' times and every answer was checked. Its keys, worked out from your phrase in this tab:'), list, el('p', 'small dim', 'Nothing was sent anywhere. The same phrase grows the same organism on any machine; a different phrase, a different one.'));
  } catch (e) { say('own-out', 'It did not grow: ' + String(e.message).replace(/^the seed did not plant: /, ''), 'no'); }
  btn.disabled = false;
});

// ── the cost case: staff time, at the UK's legal minimum, from its one sourced figure ──
let COST = null;
async function loadCost() {
  try { COST = await getJson('./costs.json'); cost(); } catch (e) { say('c-out', 'The source could not be loaded: ' + e.message, 'no'); }
}
function cost() {
  if (!COST) return;
  const int = (id) => { const v = Number($(id).value); return Number.isFinite(v) && v >= 0 ? v : NaN; };
  const hours = int('c-hours'), share = Math.min(int('c-share'), 100);
  if (!Number.isFinite(hours) || !Number.isFinite(share)) { say('c-out', 'Enter hours and a share of 0 to 100.', 'no'); return; }
  const off = Math.round(hours * share) / 100, pence = Math.round(off * COST.nlwPence);
  put('c-out', el('p', 'bottom', off + ' staff hours a month come off your people. At the UK\'s legal minimum wage that is ' + (pence / 100).toFixed(2) + ' pounds a month, ' + ((pence * 12) / 100).toFixed(2) + ' pounds a year: a floor, because your own people cost more.'), el('p', 'small dim', 'The sum is hours, times the share, times ' + (COST.nlwPence / 100).toFixed(2) + ' pounds an hour: ' + COST.source.what + ' (' + COST.source.url + ', read ' + COST.source.read + '). The node runs on machines you already have; the code is MIT, no licence fee. A double booking prevented is not counted here.'));
}
for (const id of ['c-hours', 'c-share']) $(id).addEventListener('input', cost);

load();
loadCost();
