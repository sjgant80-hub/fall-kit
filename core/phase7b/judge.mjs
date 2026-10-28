// core/phase7b/judge.mjs — Phase 7b's verdicts from its facts (core/phase7b/claims.json). Pure and total. R1 and R2 are
// judged by Phase 7's own judge on Phase 7's own sealed B3 rule (core/phase7/judge.mjs, given only B3's claim), so the fix
// is held to the rule the failure was measured by. A claim with no facts yet is "not measured", never guessed.
import { judge as judgePhase7 } from '../phase7/judge.mjs';

export const PHASES = Object.freeze(['phase2', 'phase3', 'phase3c', 'phase4', 'phase5', 'phase5b', 'phase6', 'phase6b', 'phase7']);
const B3 = Object.freeze({ claims: [Object.freeze({ id: 'B3', pass: 2 })] });
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : NaN);   // a count that is not one equals nothing, and sums to nothing
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const b3Of = (b3) => judgePhase7(B3, { b3 }).verdicts[0];

function r1(f) {
  const x = of(f, 'r1'), v = b3Of(x.b3);
  return [v.held === true && n(x.relayed) >= 1, 'with the desk as a bridge (it kept ' + n(x.relayed) + ' to share on), Phase 7\'s judge ' + (v.held === true ? 'holds' : v.held === false ? 'FAILS' : 'cannot judge') + ' B3: ' + v.measured];
}
function r2(f) {
  const x = of(f, 'r2'), v = b3Of(x.b3);
  const ok = isObj(x.sealed) && Object.keys(x.sealed).length >= 1 && same(x.b3, x.sealed) && v.held === false && x.relayed === null;
  return [ok, 'the desk booted as Phase 7 booted it: ' + (same(x.b3, x.sealed) ? 'field for field the b3 facts of Phase 7\'s receipt' : 'NOT the b3 facts of Phase 7\'s receipt') + ', and Phase 7\'s judge ' + (v.held === false ? 'fails B3 on them, as it did' : v.held === true ? 'HOLDS B3 on them' : 'cannot judge them')];
}
function r3(f) {
  const x = of(f, 'r3'), d = of(x, 'desk'), a = of(x, 'stayA'), b = of(x, 'stayB');
  const ok = n(d.adopted) >= 1 && n(d.relayed) >= 1 && a.shared === true && x.stayADoor === 'passed' && b.shared === true && x.stayBDoor === 'recognised';
  return [ok, 'the desk adopted ' + n(d.adopted) + ' and kept ' + n(d.relayed) + ' to share on; stay-a, whose door admits the packet, ' + (x.stayADoor === 'passed' ? 'did not take its antibody and still lets the genuine packet through its door' : 'did NOT let the genuine packet through its door (' + str(x.stayADoor) + ')') + '; stay-b, whose door refuses it, ' + (x.stayBDoor === 'recognised' ? 'took it and refuses the packet on sight' : 'did NOT refuse it on sight (' + str(x.stayBDoor) + ')') + ' (of the whole bundle: stay-a adopted ' + n(a.adopted) + ', ' + n(a.blocked) + ' blocked; stay-b adopted ' + n(b.adopted) + ')'];
}
function r4(f) {
  const x = of(f, 'r4'), rs = list(x.results).filter(isObj);
  const passed = rs.filter((r) => r.exit === 0);
  const ok = same(rs.map((r) => r.phase), PHASES) && passed.length === PHASES.length && str(x.nodeSha) !== '' && x.nodeSha === x.nodeShaNow && /^[0-9a-f]{40}$/.test(str(x.commit));
  return [ok, passed.length + ' of ' + rs.length + ' phase checks exited 0 (' + rs.map((r) => str(r.phase) + (r.exit === 0 ? '' : ' EXIT ' + r.exit)).join(', ') + ') at ' + str(x.commit).slice(0, 7) + ', ' + (x.nodeSha === x.nodeShaNow && str(x.nodeSha) !== '' ? 'on the core/node.mjs this receipt runs' : 'NOT on the core/node.mjs this receipt runs')];
}
function r5(f) {
  const x = of(f, 'r5'), on = of(x, 'relayOn'), off = of(x, 'relayOff');
  const ok = n(on.adopted) >= 1 && on.recognised === true && off.shared === false && off.recognised === false;
  return [ok, 'in a tab at ' + str(x.where) + ': with relay the member adopted ' + n(on.adopted) + ' and ' + (on.recognised === true ? 'refused the packet on sight' : 'did NOT refuse it on sight') + '; without, the bridge ' + (off.shared === false ? 'had nothing to share' : 'SHARED') + ' and the member ' + (off.recognised === false ? 'did not know the packet' : 'KNEW it') + (Number.isFinite(x.seconds) ? ', in ' + x.seconds + ' s' : '')];
}
function r6(f) {
  const x = of(f, 'r6'), mods = of(x, 'modules'), pv = of(x, 'privacy');
  const barred = Object.entries(mods).filter(([, w]) => !Array.isArray(w) || w.length > 0), leaks = Object.entries(pv).filter(([, w]) => !Array.isArray(w) || w.length > 0);
  const ok = Array.isArray(x.page) && x.page.length === 0 && Object.keys(mods).length >= 2 && barred.length === 0 && has(pv, 'core/phase7/index.html') && has(pv, 'core/receipts/phase7b.json') && leaks.length === 0;
  return [ok, Object.keys(mods).length + ' modules and the page read: ' + (barred.length || list(x.page).length ? 'barred words in ' + [...barred.map(([p]) => p), ...(list(x.page).length ? ['the page'] : [])].join(', ') : 'no barred word') + '; ' + Object.keys(pv).length + ' published files read for the client\'s guests: ' + (leaks.length ? 'FOUND in ' + leaks.map(([p]) => p).join(', ') : 'none')];
}

const RULES = Object.freeze({ R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6 });

export function judge(claims, facts) {
  const cs = isObj(claims) ? list(claims.claims) : [], f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((c) => {
    const id = str(c.id);
    if (!has(RULES, id) || !isObj(f[id.toLowerCase()])) return { id, pass: c.pass, held: null, measured: 'not measured yet' };
    const [held, measured] = RULES[id](f);
    return { id, pass: c.pass, held, measured };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
