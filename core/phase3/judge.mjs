// core/phase3/judge.mjs — Phase 3's verdicts from its facts (core/phase3/claims.json). Pure and total: it reads the
// facts measure.mjs gathered against each sealed holds_if, so anyone can re-judge a receipt without trusting the run.
// A claim whose pass has not run is "not measured", never guessed.
export const FLOOR = 50000;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0);
const of = (f, k) => (isObj(f[k]) ? f[k] : {});

function r1(f) {
  const x = of(f, 'r1'), rl = isObj(x.relay) ? x.relay : {};
  const ok = n(rl.imports) === 0 && rl.dynamic === false && n(x.delivered) >= 1 && n(x.heard) === x.delivered && n(x.waiting) === 0 && n(x.dropped) === 0;
  return [ok, n(x.delivered) + ' frames delivered by the relays, ' + n(x.heard) + ' heard by the nodes they named; ' + n(x.waiting) + ' left waiting, ' + n(x.dropped) + ' dropped; relay.mjs imports ' + n(rl.imports) + ' modules' + (rl.dynamic === false ? ' and loads none' : ' and LOADS SOME') + ' (it cannot decode a body)'];
}
function r2(f) {
  const x = of(f, 'r2');
  const ok = x.relayAKilled === true && n(x.asksAfterKill) >= 1 && n(x.answeredAfterKill) === x.asksAfterKill && x.sameStates === true;
  return [ok, 'relay A ' + (x.relayAKilled === true ? 'killed' : 'NOT killed') + ' after 50 asks: ' + n(x.answeredAfterKill) + ' of the ' + n(x.asksAfterKill) + ' later asks answered through relay B; every node\'s state ' + (x.sameStates === true ? 'the same as' : 'NOT the same as') + ' the run where nothing was killed'];
}
function r3(f) {
  const x = of(f, 'r3'), k = n(x.sentWhileAway);
  const ok = k >= 1 && n(x.admitted) === k && n(x.refusedAtCounter) === k && n(x.other) === 0;
  return [ok, k + ' asks sent while the node was away; on its return ' + n(x.admitted) + ' admitted, ' + n(x.refusedAtCounter) + ' second copies (the relay delivered ' + n(x.lateDelivered) + ') refused at the counter, ' + n(x.other) + ' other'];
}
function j1(f) {
  const x = of(f, 'j1'), p = Array.isArray(x.pinned) ? x.pinned : [];
  const ok = p.length === 8 && p.every((v) => v === 7) && n(x.strangerRefused) === 8 && n(x.badRosterRefused) === 8;
  return [ok, 'eight nodes pinned ' + p.join(', ') + ' members each from the founder\'s roster; the ninth card refused by ' + n(x.strangerRefused) + ' of 8; a roster signed by another key refused by ' + n(x.badRosterRefused) + ' of 8'];
}
function j2(f) {
  const x = of(f, 'j2');
  const ok = n(x.asks) >= 1 && n(x.toHolder) === x.asks && n(x.triageAfter20) >= 1 && n(x.toHonestAfter20) * 10 >= x.triageAfter20 * 9;
  return [ok, n(x.toHolder) + ' of ' + n(x.asks) + ' asks went to a holder of their skill (' + n(x.answered) + ' answered); after the first 20, ' + n(x.toHonestAfter20) + ' of ' + n(x.triageAfter20) + ' triage asks (' + pct(n(x.toHonestAfter20), n(x.triageAfter20)) + '%) went to an honest holder (bar 90%)'];
}
function j3(f) {
  const x = of(f, 'j3');
  const ok = n(x.asks) >= 1 && n(x.toDead) <= 2 && x.answeredAfterLastDead === true;
  return [ok, (typeof x.killed === 'string' ? x.killed + ', the holder the triage asks were going to, killed; ' + (n(x.askers) > 1 ? 'each of the ' + x.askers + ' askers finds out on its own; ' : '') : '') + n(x.toDead) + ' of the ' + n(x.asks) + ' asks after the holder died went to it (bar 2)' + (n(x.toDead) > 0 ? ', the last at ask ' + x.lastToDead : '') + '; every ask after that ' + (x.answeredAfterLastDead === true ? 'went to a live holder and was answered' : 'did NOT all go to a live holder and get answered')];
}
function j4(f) {
  const ls = isObj(f.j4) && Array.isArray(f.j4.links) ? f.j4.links.filter(isObj) : [];
  const good = (l) => n(l.liar) >= 0 && n(l.honest) > l.liar && l.liar < FLOOR;
  return [ls.length >= 1 && ls.every(good), ls.map((l) => String(l.asker) + ': honest ' + n(l.honest) + ', dishonest ' + n(l.liar) + (good(l) ? '' : ' (NOT)')).join('; ') + ' (parts of a million; the floor is ' + FLOOR + ')'];
}
const HEX64 = /^[0-9a-f]{64}$/;
const DOCS = Object.freeze(['s1', 's2', 's3']);
const list = (x) => (Array.isArray(x) ? x : []);
const stagesOf = (t) => (isObj(t.stages) ? Object.entries(t.stages).filter(([, c]) => n(c) > 0).map(([s, c]) => s + ' ' + c).join(', ') : '');
/** One kind of packet sent to the doors: every one heard, none admitted, none decoded. */
const shut = (t) => isObj(t) && n(t.sent) >= 1 && n(t.heard) === t.sent && n(t.admitted) === 0 && n(t.decoded) === 0;
function s1(f) {
  const x = of(f, 's1'), k = n(x.nodes), d = isObj(x.digests) ? x.digests : {}, z = isObj(x.sizes) ? x.sizes : {};
  const first = list(d.s1)[0];
  const each = (doc) => list(d[doc]).length === k && list(d[doc]).every((h) => h === first) && list(z[doc]).length === k && list(z[doc]).every((c) => c === k + 2);
  const ok = k >= 2 && typeof first === 'string' && HEX64.test(first) && DOCS.every(each) && DOCS.includes(x.relayKilledIn);
  return [ok, k + ' nodes each wrote ' + n(x.writesEach) + ' keys, then synced pair by pair (' + n(x.syncsPerOrder) + ' signed syncs through the relays) in three shuffled orders, relay A killed halfway through the ' + String(x.relayKilledIn) + ' order: ' + DOCS.map((doc) => 'in ' + doc + ' ' + new Set(list(d[doc])).size + ' digest' + (new Set(list(d[doc])).size === 1 ? '' : 's') + ' across the ' + list(d[doc]).length + ' nodes').join(', ') + (ok ? ', all ' + String(first).slice(0, 12) + '…, every map holding ' + (k + 2) + ' keys' : ' (NOT one map)')];
}
function s2(f) {
  const x = of(f, 's2'), ks = isObj(x.kinds) ? x.kinds : {}, names = ['stranger', 'forged', 'changed'];
  const ok = names.every((m) => shut(ks[m])) && n(x.mapsChanged) === 0;
  return [ok, names.map((m) => { const t = isObj(ks[m]) ? ks[m] : {}; return n(t.sent) + ' ' + m + ' (' + n(t.admitted) + ' admitted, ' + n(t.decoded) + ' decoded; ' + stagesOf(t) + ')'; }).join('; ') + '; ' + n(x.mapsChanged) + ' of the nodes\' maps changed'];
}
function h1(f) {
  const x = of(f, 'h1'), k = n(x.members), s = isObj(x.onSight) ? x.onSight : {};
  const ok = k >= 2 && typeof x.firstRefusedAt === 'string' && n(x.sharedTo) === k - 1 && n(x.adopted) === x.sharedTo && shut(s) && n(s.sent) === k && n(s.recognised) === k;
  return [ok, 'one forged packet refused at one node (at the ' + String(x.firstRefusedAt) + ' stage); its antibodies shared with ' + n(x.sharedTo) + ', adopted by ' + n(x.adopted) + ' after each re-ran it on its own door; the same bytes then sent to all ' + k + ': ' + n(s.recognised) + ' refused them as recognised on sight, ' + n(s.decoded) + ' decoded, ' + n(s.admitted) + ' admitted'];
}
function h2(f) {
  const x = of(f, 'h2'), ks = isObj(x.kinds) ? x.kinds : {}, names = ['unpinned', 'forged', 'junk', 'replayed', 'changed'];
  const fg = isObj(ks.forged) ? ks.forged : {};
  const sent = names.reduce((a, m) => a + (isObj(ks[m]) ? Math.max(0, n(ks[m].sent)) : 0), 0);
  const ok = n(x.hostile) >= 1 && names.every((m) => shut(ks[m])) && n(fg.variantNamed) * 2 >= fg.sent;
  return [ok, n(x.hostile) + ' hostile nodes sent ' + sent + ' packets to the ' + n(x.members) + ' members: ' + names.map((m) => { const t = isObj(ks[m]) ? ks[m] : {}; return n(t.sent) + ' ' + m + ' (' + n(t.admitted) + ' admitted, ' + n(t.decoded) + ' decoded)'; }).join(', ') + '; of the ' + n(fg.sent) + ' forged variants, ' + n(fg.variantNamed) + ' (' + pct(n(fg.variantNamed), n(fg.sent)) + '%) named as a variant of a family already learned (bar 50%)'];
}
function h3(f) {
  const x = of(f, 'h3');
  const ok = n(x.asks) >= 1 && n(x.answered) === x.asks && n(x.heard) >= 2 * x.asks && n(x.admitted) === x.heard && n(x.recognised) === 0;
  return [ok, 'after all the learning, ' + n(x.answered) + ' of ' + n(x.asks) + ' ordinary asks answered; the doors heard ' + n(x.heard) + ' packets of that work, admitted ' + n(x.admitted) + ', refused ' + n(x.recognised) + ' as recognised'];
}
function x1(f) {
  const x = of(f, 'x1'), tabs = isObj(x.tabs) ? x.tabs : {}, a = isObj(tabs.a) ? tabs.a : {}, b = isObj(tabs.b) ? tabs.b : {};
  const refused = isObj(b.refused) ? Object.entries(b.refused).filter(([, c]) => n(c) > 0) : [];
  const total = refused.reduce((s, [, c]) => s + c, 0);
  const ok = a.channel === true && b.channel === true && a.pinned === true && b.pinned === true && n(a.sent) >= 3 && n(b.admitted) === a.sent - 2 && total === 2 && refused.some(([s, c]) => s === 'counter' && c === 1);
  return [ok, 'two tabs' + (typeof x.where === 'string' ? ' on ' + x.where : '') + ': the WebRTC data channel ' + (a.channel === true && b.channel === true ? 'opened in both' : 'did NOT open in both') + '; tab A sent ' + n(a.sent) + ' signed packets, tab B\'s door admitted ' + n(b.admitted) + ' and refused ' + total + (refused.length > 0 ? ' (' + refused.map(([s, c]) => s + ' ' + c).join(', ') + ')' : '') + ', and holds ' + n(b.shared) + ' shared notes'];
}
const RULES = Object.freeze({ R1: r1, R2: r2, R3: r3, J1: j1, J2: j2, J3: j3, J4: j4, S1: s1, S2: s2, H1: h1, H2: h2, H3: h3, X1: x1 });

/** claims = the sealed claims; facts = what measure.mjs measured. → verdicts in the sealed order. */
export function judge(claims, facts) {
  const cs = isObj(claims) && Array.isArray(claims.claims) ? claims.claims : [];
  const f = isObj(facts) ? facts : {};
  const ran = Array.isArray(f.passes) ? f.passes : [];
  const verdicts = cs.filter(isObj).map((c) => {
    if (!ran.includes(c.pass) || !Object.prototype.hasOwnProperty.call(RULES, c.id)) return { id: c.id, pass: c.pass, held: null, measured: 'not measured yet: pass ' + c.pass, predicted: c.predicted };
    const [held, measured] = RULES[c.id](f);
    return { id: c.id, pass: c.pass, held, measured, predicted: c.predicted };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
