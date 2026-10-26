// core/phase2/judge.mjs — Phase 2's verdicts from its facts (core/phase2/claims.json). Pure and total: the facts come
// from core/phase2/measure.mjs, and this only reads them against the sealed holds_if, so CI and a reader can re-judge a
// receipt without trusting the run that wrote it. A claim whose pass has not run yet is "not measured", never guessed.

export const EXPECT = Object.freeze({ unsigned: 'signature', unpinned: 'sender', tampered: 'signature', replayed: 'counter', dictionary: 'dictionary', length: 'length' });
export const EDGE_STAGES = Object.freeze(['size', 'utf8', 'json', 'shape']);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : -1);
const stagesOf = (x) => (isObj(x) ? Object.entries(x).filter(([, c]) => n(c) > 0) : []);
const list = (x) => stagesOf(x).map(([s, c]) => s + ' ' + c).join(', ') || 'none';

function g1(f) {
  const g = isObj(f.g1) ? f.g1 : {};
  return [n(g.heard) >= 5000 && n(g.admitted) === 0 && n(g.decoded) === 0,
    n(g.heard) + ' standard-format payloads heard: ' + n(g.admitted) + ' admitted, ' + n(g.decoded) + ' decoded; refused at ' + list(g.stages)];
}
function g2(f) {
  const k = isObj(f.g2) && isObj(f.g2.kinds) ? f.g2.kinds : {};
  const parts = Object.keys(EXPECT).map((kind) => {
    const x = isObj(k[kind]) ? k[kind] : {};
    const st = stagesOf(x.stages);
    const ok = n(x.n) >= 1000 && n(x.admitted) === 0 && n(x.decoded) === 0 && st.length === 1 && st[0][0] === EXPECT[kind] && st[0][1] === x.n;
    return { ok, text: kind + ' ' + n(x.n) + ' (' + list(x.stages) + (n(x.admitted) > 0 ? ', ' + x.admitted + ' ADMITTED' : '') + (n(x.decoded) > 0 ? ', ' + x.decoded + ' DECODED' : '') + ')' };
  });
  return [parts.every((p) => p.ok), parts.map((p) => p.text).join('; ')];
}
function g3(f) {
  const g = isObj(f.g3) ? f.g3 : {};
  return [n(g.n) >= 1000 && n(g.admitted) === g.n && n(g.equal) === g.n,
    n(g.n) + ' packets a pinned peer signed: ' + n(g.admitted) + ' admitted, ' + n(g.equal) + ' equal to what was sent, after the node had learned from every refusal above'];
}
function e1(f) {
  const e = isObj(f.e1) ? f.e1 : {}, good = isObj(e.good) ? e.good : {}, badR = isObj(e.bad) ? e.bad : {};
  const st = stagesOf(badR.stages);
  const ok = n(good.n) >= 1 && n(good.admitted) === good.n && n(good.equal) === good.n
    && n(badR.n) >= 1 && n(badR.refused) === badR.n && st.every(([s]) => EDGE_STAGES.includes(s)) && st.reduce((a, [, c]) => a + c, 0) === badR.n && n(badR.packets) === 0;
  return [ok, n(good.n) + ' well-formed requests: ' + n(good.admitted) + ' admitted, ' + n(good.equal) + ' equal; ' + n(badR.n) + ' malformed: ' + n(badR.refused) + ' refused (' + list(badR.stages) + '), ' + n(badR.packets) + ' packets built'];
}
function e2(f) {
  const e = isObj(f.e2) ? f.e2 : {};
  return [n(e.n) === 20000 && n(e.throws) === 0 && n(e.malformed) === 0,
    n(e.n) + ' garbage inputs (' + n(e.inbound) + ' in, ' + n(e.outbound) + ' out): ' + n(e.throws) + ' throws, ' + n(e.malformed) + ' results that were neither a refusal with a stage nor a well-formed result'];
}
function e3(f) {
  const e = isObj(f.e3) ? f.e3 : {}, a = isObj(e.g3) ? e.g3 : {}, b = isObj(e.g2) ? e.g2 : {};
  return [n(a.n) >= 1000 && n(a.roundTrip) === a.n && n(b.n) >= 6000 && n(b.output) === 0,
    n(a.n) + ' trusted packets out through the edge: ' + n(a.roundTrip) + ' parsed back exactly; ' + n(b.n) + ' untrusted packets: ' + n(b.output) + ' produced output'];
}
const journalsOf = (x) => (isObj(x) && Array.isArray(x.journals) ? x.journals.filter(isObj) : []);
const whole = (j) => j.legacy === 'gzip' && j.light === 'light' && j.migrated === true && j.asideKept === true && j.sameEvents === true && j.sameSnapshot === true;
function m1(f) {
  const js = journalsOf(f.m1);
  const ok = js.length >= 3 && js.some((j) => j.events === 10000) && js.every(whole);
  const bad = js.filter((j) => !whole(j)).map((j) => String(j.name));
  return [ok, js.length + ' journals (' + js.map((j) => n(j.events)).join(', ') + ' events): '
    + (bad.length === 0 ? 'each loaded from gzip, migrated to LIGHT with the old file kept aside, and reloaded to the same events, the same organ counts and the same event hash' : 'NOT whole: ' + bad.join('; '))];
}
function m2(f) {
  const js = journalsOf(f.m2);
  const b = (j) => (isObj(j.bytes) ? j.bytes : {});
  const fits = (j) => n(b(j).light) >= 0 && n(b(j).gzip) >= 0 && b(j).light <= b(j).gzip;
  return [js.length >= 1 && js.every(fits), 'LIGHT against the raw gzip stream: ' + js.map((j) => String(j.name) + ' ' + n(b(j).light) + ' vs ' + n(b(j).gzip) + (fits(j) ? '' : ' (LARGER)')).join('; ')
    + '. Against the gzip envelope as it sat on disk: ' + js.map((j) => n(b(j).light) + ' vs ' + n(b(j).envelope)).join(', ')];
}
function m3(f) {
  const ns = isObj(f.m3) && Array.isArray(f.m3.nights) ? f.m3.nights.filter(isObj) : [];
  const good = (x) => x.identical === true && n(x.mismatched) === 0 && n(x.extra) === 0 && n(x.vaultBytes) >= 0 && x.vaultBytes < n(x.bytes);
  return [ns.length >= 1 && ns.every(good), ns.length + ' night(s): ' + ns.map((x) => n(x.files) + ' files, ' + n(x.bytes) + ' bytes into ' + n(x.vaultBytes) + (good(x) ? ', byte-identical' : ', NOT identical or not smaller')).join('; ')];
}
const RULES = Object.freeze({ G1: g1, G2: g2, G3: g3, E1: e1, E2: e2, E3: e3, M1: m1, M2: m2, M3: m3 });

/** claims = the sealed claims; facts = what measure.mjs measured, keyed by pass. → verdicts in the sealed order. */
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
