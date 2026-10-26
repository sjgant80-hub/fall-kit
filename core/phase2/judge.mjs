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
const RULES = Object.freeze({ G1: g1, G2: g2, G3: g3, E1: e1, E2: e2, E3: e3 });

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
