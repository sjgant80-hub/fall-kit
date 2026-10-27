// core/phase5/page.mjs — the living site's page engine (Phase 5). Every request this page takes crosses core/site.mjs
// first: the address it was opened at (on load and on every change), each message typed, each record filled in. A
// message let in is shown with textContent only and routed by the mind (core/mind.mjs: a model behind a door of its own,
// once the visitor wakes it) or, until then, by the keyword rule. The page also re-judges the committed receipt, replays
// the red team through these same handlers (D4), puts the site in the mesh beside break-it's and konomi-slm's real nodes
// loaded from their own sites, lists every request this tab has made (Q2, Q3), and hands a visitor to Kardlings for
// their own DIGI (V1). This file writes no markup into the page: every word it puts there is textContent.
// Nothing here talks to anything but this origin; waking the mind is mind-tab.mjs.
import { makeDoor, take, perceive, emptyLibrary } from '../site.mjs';
import { ROUTES, decide, keywordsOf, proposal, keywordRoute, keywordScore, decideKeywordsFirst } from '../mind.mjs';
import { makeIdentity, hex } from '../identity.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { judge } from './judge.mjs';
import { localSiteCell, siteMesh, meshOf, carrier, SEEDS } from './sitenode.mjs';
import { brk1CasesFrom, triageRowsFrom } from '../scenario.mjs';

export const FUNNEL = 'https://sjgant80-hub.github.io/kardlings/#first-game';
const $ = (id) => document.getElementById(id);
const enc = (s) => new TextEncoder().encode(s);
const n0 = (x) => Number(x).toLocaleString('en-GB');
const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function put(id, ...kids) { const t = $(id); if (!t) return; t.replaceChildren(...kids); }
const say = (id, text, cls) => put(id, el('p', cls || 'small', text));
try { performance.setResourceTimingBufferSize(10000); } catch { /* an old browser keeps its default */ }

const p5 = (window.p5 = window.p5 || {});
const NAMES = [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter(Boolean))].sort();
const DOOR = makeDoor(NAMES), LIB = emptyLibrary();
let CLAIMS = null, RECEIPT = null, KW = null, MIND = null;
const ROUTE_WORDS = Object.freeze({
  about: ['What this is', 'A living website: a door that checks every request on raw bytes, a mind on your machine that picks where to take you, a memory of what it refused, and a place in the estate\'s mesh.', '#what-it-is'],
  start: ['How to use it', 'Talk to it, replay the red team, wake the mind if you like, put it in the mesh, check what it called, and get your own DIGI: the steps are here.', '#start-here'],
  digi: ['Your own DIGI', 'Kardlings, on this same site, hands you a card made for a key that lives only in your browser. One click, and nothing about you is sent anywhere.', FUNNEL],
  defend: ['How it defends itself', 'Every request crosses a door on raw bytes before any code uses it; what it refuses it remembers, refuses on sight, and shares with the mesh. Replay the red team here.', '#the-door'],
  mesh: ['The mesh', 'This site is a node: its own key, the peers it pinned, signed packets, antibodies shared and re-checked. Put it in the mesh here.', '#the-mesh'],
  business: ['For a company', 'What it does for each role, the cost case on dated public prices, security, roll-out and support.', '#for-a-business'],
  none: ['Nothing here on that', 'This site has nothing on that. It can tell you what it is, how to use it, how it defends itself, the mesh, your own DIGI, or what it does for a company.', '#start-here'],
});

// the seven routes and the fixed words each shows, from the same table the router uses
put('route-rows', ...ROUTES.map((r) => { const [title, words, go] = ROUTE_WORDS[r], tr = el('tr'); tr.append(el('td', 'mono', r), el('td', null, title + ': ' + words), el('td', 'small', go)); return tr; }));

// ── the address: through the door on load and on every change ──
export function address(bytes, opts = {}) {
  const r = take(LIB, { kind: 'address', bytes }, DOOR);
  const line = $('addr-line');
  if (line) line.textContent = r.ok ? '' : 'That link names nothing on this page (refused at ' + r.stage + (r.recognised ? ', on sight' : '') + '), so you are at the top.';
  if (!r.ok && opts.scroll !== false) window.scrollTo(0, 0);
  return r;
}
addEventListener('hashchange', () => address(enc(location.hash)));
address(enc(location.hash));

// ── a message: through the door, shown as text, routed ──
const seenText = (s) => 'The door saw ' + s.bytes + ' bytes' + (s.utf8 ? ', ' + s.chars + ' characters, ' + s.lines + (s.lines === 1 ? ' line, ' : ' lines, ') + s.markup + ' markup brackets, ' + s.links + ' links, ' + s.controls + ' control and ' + s.bidi + ' bidirectional characters.' : ', not valid UTF-8.');
function routeLine(p, route, by, why) {
  const [title, words] = ROUTE_WORDS[route];
  const who = by === 'mind' ? 'the mind chose this: the keyword rule found none of its words' : by === 'none' ? 'the keyword rule found none of its words, and the mind said nothing usable: ' + why : 'the keyword rule chose this' + (why ? '; the mind said nothing usable: ' + why : '');
  p.replaceChildren(el('b', null, title), document.createTextNode(' — ' + words + ' (' + who + ')'));
}
/** One message through the door, into a log (the talk log, or the replay's). opts.mind = false keeps the mind out of it. → the door's result. */
export function message(bytes, log, opts = {}) {
  const r = take(LIB, { kind: 'message', bytes }, DOOR), seen = perceive(bytes), li = el('li', r.ok ? 'said-in' : 'refused');
  if (!r.ok) {
    const p = el('p', 'route');
    p.replaceChildren(el('b', null, 'Refused'), document.createTextNode(' at ' + r.stage + ': ' + (r.recognised ? 'recognised on sight, refused here before' : r.why) + '. It was not shown and nothing used it.'));
    li.append(p, el('p', 'small dim', seenText(seen)));
    (log || $('talk-log')).prepend(li);
    return r;
  }
  const said = el('p', 'said'); said.textContent = r.value;
  const p = el('p', 'route'), go = el('a', 'small', 'Go there →');
  routeLine(p, keywordRoute(r.value, KW, ROUTES), 'keywords', null);
  go.href = ROUTE_WORDS[keywordRoute(r.value, KW, ROUTES)][2];
  li.append(said, p, el('p', 'small dim', seenText(seen)), go);
  (log || $('talk-log')).prepend(li);
  // keyword-first (Phase 5b): the mind is asked only about a message the keyword rule finds none of its words in
  if (opts.mind !== false && MIND && MIND.awake() && keywordScore(r.value, KW, ROUTES) === 0) {
    MIND.ask(CLAIMS.mind.routes, r.value).then((reply) => {
      const d = decideKeywordsFirst(reply, r.value, KW, ROUTES);
      routeLine(p, d.route, d.by, d.why);
      go.href = ROUTE_WORDS[d.route][2];
    }).catch(() => {});
  }
  return r;
}
// the keyword rule's words come from the sealed claims: nothing is routed until they are here (a message sent in the
// first moment was once routed to 'none' because they were not yet loaded; found by the V1 walk)
const ROUTES_READY = getJson('./claims.json').then((c) => { if (!KW) KW = keywordsOf(c.mind.routes); if (!CLAIMS) CLAIMS = c; }).catch(() => {});
async function sendTalk(text) {
  const t = typeof text === 'string' ? text : $('talk-in').value;
  if (typeof text !== 'string') $('talk-in').value = '';
  await ROUTES_READY;
  message(enc(t), $('talk-log'));
}
$('talk-go').addEventListener('click', () => sendTalk());
$('talk-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTalk(); } });
for (const b of document.querySelectorAll('[data-say]')) b.addEventListener('click', () => { sendTalk(b.getAttribute('data-say')); location.hash = '#talk-to-it'; });

// ── the receipt, re-judged here ──
const tagOf = (held) => el('span', 'tag ' + (held === true ? 'held' : held === false ? 'failed' : 'na'), held === true ? 'HELD' : held === false ? 'FAILED' : 'OPEN');
async function loadReceipt() {
  try {
    const [claims, receipt] = await Promise.all([getJson('./claims.json'), getJson('../receipts/phase5.json')]);
    CLAIMS = claims; RECEIPT = receipt; KW = keywordsOf(claims.mind.routes);
    const j = judge(claims, receipt.facts), f = receipt.facts;
    const same = j.verdicts.every((v, i) => receipt.verdicts[i] && receipt.verdicts[i].id === v.id && receipt.verdicts[i].held === v.held && receipt.verdicts[i].measured === v.measured);
    p5.rejudged = { held: j.held, failed: j.failed, open: j.open, same };
    put('r-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + '. '), el('span', same ? 'ok' : 'no', same ? 'Re-judged in this tab from the receipt\'s own facts: the same verdicts, word for word.' : 'Re-judged in this tab, the verdicts differ from the committed ones.'));
    const byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('r-rows', ...j.verdicts.map((v) => { const tr = el('tr'), td = el('td'); td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', v.measured)); tr.append(el('td', 'mono', v.id), (() => { const x = el('td'); x.append(tagOf(v.held)); return x; })(), td); return tr; }));
    put('r-notes', ...(Array.isArray(receipt.notes) && receipt.notes.length ? receipt.notes.map((n) => el('p', null, n)) : [el('p', 'dim', 'No failures or corrections.')]));
    const passes = [[1, 'core/site.mjs: the door', ['D1', 'D2', 'D3', 'D4', 'L1', 'F1']], [2, 'core/mind.mjs: the mind at the door', ['M1', 'M2', 'M3', 'M4']], [3, 'core/phase5/sitenode.mjs: a node of the mesh', ['N1', 'N2', 'N3']], [4, 'core/egress.mjs: local-first', ['Q1', 'Q2', 'Q3']], [5, 'the visitor\'s own DIGI', ['V1']]];
    const vOf = Object.fromEntries(j.verdicts.map((v) => [v.id, v]));
    put('pass-rows', ...passes.map(([n, organ, ids]) => {
      const tr = el('tr'), held = ids.filter((i) => vOf[i] && vOf[i].held === true).length, failed = ids.filter((i) => vOf[i] && vOf[i].held === false).length, open = ids.length - held - failed;
      tr.append(el('td', 'mono', String(n)), el('td', null, organ), el('td', 'mono', ids.join(' ')), el('td', null, held + ' held' + (failed ? ', ' + failed + ' failed' : '') + (open ? ', ' + open + ' open' : '')));
      return tr;
    }));
    const tile = (id, text) => { const t = $(id); if (t) t.textContent = text; };
    if (f.d1) tile('t-refused', n0(f.d1.corpus.count - f.d1.corpus.admitted));
    if (f.m2) tile('t-mind', f.m2.mindRight + ' of ' + f.m2.messages);
    if (f.n2) tile('t-shared', f.n2.again && f.n2.again.recognised ? 'on sight' : 'not yet');
    tile('t-held', j.held + ' of ' + j.verdicts.length);
    if (f.m2) tile('m-local', f.m2.mindRight + ' of 70');
    tile('m-tab', f.m3 ? f.m3.mindRight + ' of 70' : 'not yet measured');
    if (f.mind) tile('m-kw', f.mind.t0Right + ' of 70');
    if (f.m1) tile('m-fuzz', f.m1.outside + ' of ' + n0(f.m1.fuzzed));
    if (f.d4) tile('s-d4', n0(f.d4.addresses.elementsAdded) + ' elements added to the page in a real tab by ' + n0(f.d4.payloads) + ' of them as its address, and every one of the ' + n0(f.d4.messages.admitted) + ' let in as a message shown as a single text node (' + n0(f.d4.messages.textOnly) + ' checked)');
    loadTrace();
  } catch (e) { say('r-sum', 'The receipt could not be loaded: ' + e.message, 'no'); }
  loadFix();
}

// ── Phase 5b's receipt, as committed (CI re-derives it from the tab's raw replies; this page does not load its judge,
// so that what Phase 5 measured of this page stays what it measured) ──
async function loadFix() {
  try {
    const [claims, receipt] = await Promise.all([getJson('../phase5b/claims.json'), getJson('../receipts/phase5b.json')]);
    const j = receipt;
    put('p5b-sum', el('b', null, j.held + ' held, ' + j.failed + ' failed, ' + j.open + ' not measured yet'), document.createTextNode(', of ' + j.verdicts.length + ' claims sealed at ' + String(receipt.sealedIn || '').slice(0, 7) + ', as committed; CI re-derives every tab count from the tab\'s raw replies.'));
    const byId = Object.fromEntries(claims.claims.map((c) => [c.id, c]));
    put('p5b-rows', ...j.verdicts.map((v) => {
      const tr = el('tr'), td = el('td'), tg = el('td');
      td.append(el('b', null, byId[v.id].claim), el('br'), el('span', 'small dim', 'Predicted before the run: ' + byId[v.id].predicted + '. Measured: ' + v.measured));
      tg.append(tagOf(v.held));
      tr.append(el('td', 'mono', v.id), tg, td);
      return tr;
    }));
  } catch (e) { say('p5b-sum', 'Phase 5b\'s receipt could not be loaded: ' + e.message, 'no'); }
}

// ── one message, traced from the measured run (core/phase5/local/m2.json) ──
async function loadTrace() {
  try {
    const m2 = await getJson('./local/m2.json'), row = m2.rows.find((r) => r.want === 'digi' && r.proposal === 'digi') || m2.rows[0];
    const b = enc(row.text), r = take(emptyLibrary(), { kind: 'message', bytes: b }, DOOR), s = perceive(b);
    put('trace',
      el('li', null, 'A visitor types: “' + row.text + '”.'),
      el('li', null, seenText(s) + ' The door ' + (r.ok ? 'let it in as text' : 'refused it at ' + r.stage) + ': ' + s.bytes + ' bytes is within 2,000, it is valid UTF-8, and it has no control or bidirectional character.'),
      el('li', null, 'The mind, ' + m2.model + ' on ' + m2.runtime + ', was sent the sealed prompt and the message, and replied: ' + String(row.reply).trim()),
      el('li', null, 'The mind\'s door read that reply: ' + (row.proposal ? 'at most 512 bytes, JSON, and its route "' + row.proposal + '" is one of the seven. The site took it.' : 'no proposal (' + row.why + '); the keyword rule chose ' + row.decided + '.')),
      el('li', null, 'The keyword rule, for comparison, would have chosen "' + row.keywords + '". The visitor is shown the site\'s own words for "' + row.decided + '" and a link: ' + ROUTE_WORDS[row.decided][2] + '.'));
  } catch { put('trace', el('li', 'dim', 'The measured run could not be loaded.')); }
}

// ── the red team, through this page's own handlers (D4, and the memory in a tab) ──
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
$('replay-go').addEventListener('click', async () => {
  const btn = $('replay-go'); btn.disabled = true;
  try {
    say('replay-out', 'Loading the red team from this site…');
    await ROUTES_READY;
    const rt = await getJson('./redteam.json'), list = rt.payloads.map(([id, b]) => ({ id, bytes: unb64(b) }));
    const digest = hex(sha256(enc(list.map((p) => p.id + ':' + hex(sha256(p.bytes))).join('\n'))));
    const log = $('replay-log'), obs = new MutationObserver(() => {});
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const added = () => obs.takeRecords().reduce((k, m) => k + [...m.addedNodes].filter((x) => x.nodeType === 1).reduce((a, x) => a + 1 + x.getElementsByTagName('*').length, 0), 0);
    const f = { payloads: list.length, digest, addresses: { count: 0, elementsAdded: 0, refused: 0 }, messages: { count: 0, admitted: 0, refused: 0, perAdmitted: [], perRefused: [], textOnly: 0 }, second: { refused: 0, recognised: 0, admitted: 0 } };
    const pin = new Set(), pout = new Set();
    let csp = 0; const onCsp = () => { csp++; };
    addEventListener('securitypolicyviolation', onCsp);
    added();
    for (let i = 0; i < list.length; i++) {
      const b = list[i].bytes;
      const a = address(b, { scroll: false }); f.addresses.count++; if (!a.ok) f.addresses.refused++;
      f.addresses.elementsAdded += added();
      const m = message(b, log, { mind: false }); f.messages.count++;
      const k = added();
      if (m.ok) {
        f.messages.admitted++; pin.add(k);
        const said = log.firstElementChild && log.firstElementChild.querySelector('.said');
        if (said && said.childNodes.length === 1 && said.firstChild.nodeType === 3 && said.firstChild.data === m.value) f.messages.textOnly++;
      } else { f.messages.refused++; pout.add(k); }
      if (i % 100 === 99) { log.replaceChildren(); added(); $('replay-bar').style.width = Math.round((50 * (i + 1)) / list.length) + '%'; await new Promise((r) => setTimeout(r, 0)); }
    }
    log.replaceChildren(); added();
    for (let i = 0; i < list.length; i++) {
      for (const kind of ['address', 'message']) {
        const r = take(LIB, { kind, bytes: list[i].bytes }, DOOR);
        if (r.ok) f.second.admitted++; else { f.second.refused++; if (r.recognised) f.second.recognised++; }
      }
      if (i % 500 === 499) { $('replay-bar').style.width = Math.round(50 + (50 * (i + 1)) / list.length) + '%'; await new Promise((r) => setTimeout(r, 0)); }
    }
    obs.disconnect(); removeEventListener('securitypolicyviolation', onCsp);
    f.messages.perAdmitted = [...pin].sort((x, y) => x - y); f.messages.perRefused = [...pout].sort((x, y) => x - y); f.cspViolations = csp;
    p5.d4 = f;
    $('replay-bar').style.width = '100%';
    put('replay-out',
      el('p', f.addresses.elementsAdded === 0 ? 'ok' : 'no', n0(f.payloads) + ' payloads as the page\'s address: ' + n0(f.addresses.refused) + ' refused, ' + n0(f.addresses.elementsAdded) + ' elements added to the page.'),
      el('p', null, n0(f.messages.admitted) + ' let in as messages, each shown as one text node (' + n0(f.messages.textOnly) + ' checked) in the page\'s own ' + f.messages.perAdmitted.join(' or ') + '-element template; ' + n0(f.messages.refused) + ' refused, each a ' + f.messages.perRefused.join(' or ') + '-element refusal that shows none of it.'),
      el('p', null, 'Sent again: ' + n0(f.second.recognised) + ' of ' + n0(f.second.refused) + ' refusals recognised on sight; ' + n0(f.second.admitted) + ' let in again.'),
      el('p', 'small dim', 'Digest of the set: ' + digest.slice(0, 16) + '… (the receipt\'s: ' + (RECEIPT && RECEIPT.facts.corpus ? RECEIPT.facts.corpus.tabDigest.slice(0, 16) + '…' : '?') + '). Policy violations during the replay: ' + csp + '.'));
  } catch (e) { say('replay-out', 'The replay stopped: ' + e.message, 'no'); }
  btn.disabled = false;
});

// ── the mind: woken only when the visitor presses the button ──
$('mind-wake').addEventListener('click', async () => {
  const btn = $('mind-wake'); btn.disabled = true;
  try {
    MIND = await import('./mind-tab.mjs');
    say('mind-out', 'Waking: fetching WebLLM and ' + MIND.MODEL + '…');
    p5.wakeAt = performance.now();
    await MIND.wake((p) => { $('mind-bar').style.width = Math.round((p.progress || 0) * 100) + '%'; say('mind-out', String(p.text || '')); });
    $('mind-bar').style.width = '100%';
    say('mind-out', 'Awake: ' + MIND.MODEL + ' is running in this browser, its reply held to a route. It now reads every message the keyword rule finds none of its words in; its reply still crosses the mind\'s door.', 'ok');
    $('talk-who').textContent = 'The keyword rule routes what it can; the mind (' + MIND.MODEL + ', in this browser) routes the rest.';
    $('mind-run').disabled = false;
  } catch (e) { say('mind-out', 'The mind could not be woken: ' + e.message, 'no'); btn.disabled = false; }
});
// Phase 5b (B1–B4): the sealed 70 of Phase 5, then the 70 fresh messages sealed in core/phase5b/claims.json, each asked
// once of the mind held to its route; every reply decided both ways, keyword-first and Phase 5's mind-first
$('mind-run').addEventListener('click', async () => {
  if (!MIND || !MIND.awake() || !CLAIMS) return;
  const btn = $('mind-run'); btn.disabled = true;
  try {
    const fresh = (await getJson('../phase5b/claims.json')).fresh.messages, t0 = performance.now(), rows = { sealed: [], fresh: [] };
    const sets = [['sealed', CLAIMS.mind.messages], ['fresh', fresh]], n = sets[0][1].length + sets[1][1].length;
    const tally = {};
    let k = 0;
    for (const [name, msgs] of sets) {
      const t = { messages: msgs.length, digest: hex(sha256(enc(JSON.stringify(msgs)))), valid: 0, outside: 0, mindRight: 0, keywordRight: 0, keywordsFirstRight: 0, mindFirstRight: 0, askedOfMind: 0 };
      for (const m of msgs) {
        const reply = await MIND.ask(CLAIMS.mind.routes, m.text);
        const pr = proposal(reply, ROUTES), kf = decideKeywordsFirst(reply, m.text, KW, ROUTES), mf = decide(reply, m.text, KW, ROUTES), kr = keywordRoute(m.text, KW, ROUTES);
        if (pr.ok) t.valid++;
        if (!ROUTES.includes(kf.route) || !ROUTES.includes(mf.route)) t.outside++;
        if (pr.ok && pr.route === m.route) t.mindRight++;
        if (kr === m.route) t.keywordRight++;
        if (kf.route === m.route) t.keywordsFirstRight++;
        if (mf.route === m.route) t.mindFirstRight++;
        if (keywordScore(m.text, KW, ROUTES) === 0) t.askedOfMind++;
        rows[name].push({ text: m.text, want: m.route, reply, proposal: pr.ok ? pr.route : null, why: pr.ok ? null : pr.why, keywords: kr, keywordsFirst: kf.route, mindFirst: mf.route });
        k++;
        $('mind-bar').style.width = Math.round((100 * k) / n) + '%';
        say('mind-out', k + ' of ' + n + ' (' + name + ' messages): ' + t.mindRight + ' routed right by the mind so far in this set.');
      }
      tally[name] = t;
    }
    p5.m5b = { model: MIND.MODEL, runtime: 'WebLLM 0.2.79 in a browser tab', schema: MIND.SCHEMA, sealed: tally.sealed, fresh: tally.fresh, rows, seconds: Math.round((performance.now() - t0) / 100) / 10, browser: navigator.userAgent };
    const s = tally.sealed, f = tally.fresh;
    put('mind-out',
      el('p', s.mindRight >= 49 ? 'ok' : 'no', 'Phase 5\'s 70 sealed messages: ' + s.valid + ' replies a proposal; the mind right ' + s.mindRight + ' (bar 49).'),
      el('p', f.keywordsFirstRight >= f.keywordRight + 7 ? 'ok' : 'no', 'The 70 fresh messages: keyword-first right ' + f.keywordsFirstRight + ', the keyword rule alone ' + f.keywordRight + ', mind-first ' + f.mindFirstRight + '; the mind was asked about ' + f.askedOfMind + ' of them.'));
  } catch (e) { say('mind-out', 'The run stopped: ' + e.message, 'no'); }
  btn.disabled = false;
});

// ── the mesh in this tab: the site beside break-it's and konomi-slm's real nodes, from their own sites ──
let MESH = null;
$('mesh-go').addEventListener('click', async () => {
  const btn = $('mesh-go'); btn.disabled = true;
  try {
    say('mesh-out', 'Loading break-it\'s and konomi-slm\'s nodes from their own sites…');
    const [breakit, konomi, pinsJson, domains, wire] = await Promise.all([import('/break-it/node/breakit-node.mjs'), import('/konomi-slm/node/konomi-node.mjs'), getJson('/break-it/node/pins.json'), import('/konomi-slm/vendor/seed-library/domains.mjs'), import('/break-it/src/wire.mjs')]);
    const mods = { breakit, konomi, pins: pinsJson.pins };
    const taken = new Set();
    const { ids } = await meshOf();
    for (const k of Object.keys(SEEDS)) if (k !== 'site') taken.add(ids[k].slot);
    let me = await makeIdentity();
    while (taken.has(me.slot)) me = await makeIdentity();   // the tab's own key, on a slot no other node holds
    const cells = { site: await localSiteCell('site', mods, me), breakit: await localSiteCell('breakit', mods, me), konomi: await localSiteCell('konomi', mods, me) };
    const inputs = { brk1: await brk1CasesFrom(wire, ids.stranger, ids.screenSender), rows: triageRowsFrom(domains, 27).slice(7, 27) };
    const lines = [];
    const r = await siteMesh(cells, inputs, ids.stranger, (name) => { if (name !== 'pin') { lines.push(name); say('mesh-out', 'Working: ' + lines.length + ' steps…'); } });
    MESH = { cells, wire, ids, me };
    p5.mesh = r;
    const sc = r.n1.screens;
    put('mesh-out',
      el('p', null, 'The site\'s own key, made in this tab: ' + me.id.slice(0, 16) + '…. It pinned break-it and konomi-slm, and they pinned it.'),
      el('p', null, 'It asked break-it\'s screen to check five BRK1 records: ' + sc.map((s) => s.stage).join(', ') + ' (' + sc.filter((s) => s.stage === s.expect).length + ' of 5 as expected), every answer signed and its receipt checked here.'),
      el('p', null, 'It asked konomi-slm\'s triage twenty times: ' + r.n1.triage.verified + ' answers verified, ' + r.n1.triage.receiptsHold + ' with receipts that checked at the site, ' + r.n1.ledgerTriage + ' recorded in its ledger.'),
      el('p', null, r.n1.messages + ' messages crossed between the nodes, ' + r.n1.nonLight + ' not LIGHT.'),
      el('p', r.n2.again.recognised ? 'ok' : 'no', 'A packet from a key nobody pinned: the site refused it at ' + r.n2.refused.stage + ', sent break-it its antibodies (' + r.n2.adopted + ' adopted after break-it\'s own re-run, ' + r.n2.autoimmuneBlocked + ' blocked), and break-it then refused the same packet ' + (r.n2.again.recognised ? 'on sight' : 'at ' + r.n2.again.stage) + '. An honest packet from the site was ' + (r.n2.honest.ok ? 'let in' : 'refused') + ' after.'));
    say('form-out', 'The site is in the mesh. Send a record.');
  } catch (e) { say('mesh-out', 'The mesh could not be set up here: ' + e.message, 'no'); }
  btn.disabled = false;
});

// ── a record, through the site's door, then to break-it's screen over the mesh ──
$('form-go').addEventListener('click', async () => {
  const rec = { account: Number($('f-account').value), period: Number($('f-period').value), amount: Number($('f-amount').value) };
  const r = take(LIB, { kind: 'form', bytes: enc(JSON.stringify(rec)) }, DOOR);
  if (!r.ok) { say('form-out', 'Refused at this site\'s door, at ' + r.stage + ': ' + r.why + '. Nothing was sent.', 'no'); return; }
  if (!MESH) { say('form-out', 'Let in by the door. Put the site in the mesh to send it to break-it.'); return; }
  try {
    const wire = await import('/break-it/src/wire.mjs');
    const u = wire.encodeUnsigned({ sender: 1, counter: 1n, op: wire.OPS.REC, account: r.value.account, period: r.value.period, amount: r.value.amount });
    const zero = wire.withSignature(u, new Uint8Array(64)), n = wire.rawCheck(zero).n;
    const signed = wire.withSignature(u, await MESH.ids.screenSender.sign(wire.signedBytes(zero, n)));
    const x = await carrier(MESH.cells).ask('screen', { hex: hex(signed) });
    const a = x.answer;
    say('form-out', 'Let in by this site\'s door; signed as a BRK1 record with break-it\'s public test key; asked of break-it over the mesh. break-it\'s screen: ' + (a && a.answer ? a.answer.stage : 'no answer') + '; its receipt ' + (a && a.outcome === 'verified' ? 'checked here' : 'did not check') + '.', a && a.outcome === 'verified' ? 'ok' : 'no');
  } catch (e) { say('form-out', 'The record could not be sent: ' + e.message, 'no'); }
});

// ── two tabs, one antibody ──
let TABS = null;
const tabsSay = (t) => { const o = $('tabs-out'); o.prepend(el('p', 'small', t)); };
$('tabs-join').addEventListener('click', async () => {
  $('tabs-join').disabled = true;
  TABS = await import('./mesh-tab.mjs');
  p5.n3 = await TABS.joinTabs({ say: tabsSay, ready: (card) => { tabsSay('The other tab\'s key: ' + card.id.slice(0, 16) + '…. Pin it if it is the one you opened.'); $('tabs-pin').disabled = false; }, done: (f) => { p5.n3 = f; } });
});
$('tabs-pin').addEventListener('click', async () => { const r = await TABS.pinTab(); tabsSay(r.ok ? 'Pinned the other tab.' : 'Not pinned: ' + (r.why || 'refused')); if (r.ok) $('tabs-attack').disabled = false; });
$('tabs-attack').addEventListener('click', async () => { const r = await TABS.attackTab({ say: tabsSay }); if (!r.ok) tabsSay(r.why); });

// ── every request this tab has made, and one it may not ──
function requests() {
  const all = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].map((e) => { try { return new URL(e.name); } catch { return null; } }).filter(Boolean);
  const other = [...new Set(all.filter((u) => u.origin !== location.origin).map((u) => u.host))].sort();
  return { requests: all.length, other, sameOrigin: all.filter((u) => u.origin === location.origin).length };
}
p5.requests = requests;
$('req-go').addEventListener('click', () => {
  const r = requests();
  put('req-out', el('p', r.other.length ? null : 'ok', r.requests + ' requests so far, ' + r.sameOrigin + ' to this site (' + location.origin + '); to anywhere else: ' + (r.other.join(', ') || 'none') + '.'), el('p', 'small dim', 'Read from the browser\'s own record of this tab (performance entries), not from the page\'s code.'));
});
$('req-policy').addEventListener('click', () => {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  put('req-out', el('p', 'small', 'This page\'s policy, which the browser enforces:'), el('pre', null, meta ? meta.getAttribute('content').split('; ').join(';\n') : 'none found'));
});

// ── the cost case: break-it's kernel on break-it's dated sources ──
let costKernel = null, prices = null, fx10k = null;
const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function loadCost() {
  try {
    const [k, src] = await Promise.all([import('/break-it/src/cost.mjs'), getJson('/break-it/costs/sources.json')]);
    const p = k.pricesFrom(src);
    if (!p.ok) throw new Error(p.why);
    costKernel = k; prices = p.prices; fx10k = p.prices.fx10k;
    put('c-sources', ...src.sources.filter((s) => ['aws-waf', 'aws-apigw', 'uk-nlw', 'ofgem-cap', 'intel-i7-1255u', 'boe-usd'].includes(s.key) || /WAF|API Gateway|Ofgem|Living Wage|i7-1255U|XUDLUSS/.test(s.what)).map((s) => { const li = el('li'), a = el('a', null, s.what); a.href = s.url; li.append(a, el('span', 'dim', ' (read ' + s.read + ')')); return li; }));
    cost();
  } catch (e) { say('c-out', 'The cost kernel or its sources could not be loaded from break-it: ' + e.message, 'no'); }
}
function cost() {
  if (!costKernel) return;
  const int = (id) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.round(v) : NaN; };
  const inputs = { requests: int('c-req'), acls: 1, rules: int('c-rules'), api: $('c-api').value, rate: 1000000, watts: int('c-watts'), hours: int('c-hours'), fx10k, machinePence: 0, lifeMonths: 36, staffHours: int('c-staffh'), staffRatePence: Math.round(Number($('c-staffr').value) * 100), staffShare: int('c-share') };
  const r = costKernel.costCase(inputs, prices);
  if (!r.ok) { say('c-out', r.why, 'no'); return; }
  const line = (k, v) => { const d = el('div', 'line'); d.append(el('span', null, k), el('span', null, v)); return d; };
  put('c-out',
    el('p', 'bottom', 'The managed path in front of a site costs ' + usd(r.managed.totalCents) + ' a month (' + gbp(r.managed.totalPence) + '). This site needs no server; one mesh node on a machine you own costs ' + gbp(r.node.totalPence) + ' in electricity. ' + (r.monthlyPence >= 0 ? 'You keep ' + gbp(r.monthlyPence) + ' a month, ' + gbp(r.yearlyPence) + ' a year.' : 'At these figures it costs ' + gbp(-r.monthlyPence) + ' a month more.')),
    line('AWS WAF: one web ACL, your rules, every request', usd(r.managed.wafCents)), line('API Gateway for a chat backend (' + inputs.api + ')', usd(r.managed.gatewayCents)),
    line('Managed path in pounds, at the Bank of England rate', gbp(r.managed.totalPence)), line('This site\'s server', '£0.00: there is none'),
    line('One mesh node\'s electricity at the Ofgem cap', gbp(r.node.electricityPence)), line('Staff time the routing takes off your people', gbp(r.staffPence)), line('Licence', 'MIT, no licence fee'));
}
for (const id of ['c-req', 'c-rules', 'c-api', 'c-staffh', 'c-share', 'c-staffr', 'c-watts', 'c-hours']) $(id).addEventListener('input', cost);

// ── the visitor's own DIGI: the funnel is one link; the route says the same ──
for (const a of document.querySelectorAll('a[href="' + FUNNEL + '"]')) a.addEventListener('click', () => { p5.funnel = { followed: a.href, at: Date.now() }; });

loadReceipt();
loadCost();
p5.site = { address, message, names: NAMES, door: DOOR, library: LIB };
