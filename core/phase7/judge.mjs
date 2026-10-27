// core/phase7/judge.mjs — Phase 7's verdicts from its facts (core/phase7/claims.json). Pure and total: it reads the facts
// measure.mjs gathered (in CI, or committed from a browser tab) against each sealed rule, so anyone can re-judge the receipt
// without trusting the run. A claim with no facts yet is "not measured", never guessed.
export const ESTATE = Object.freeze(['breakit', 'konomi', 'site', 'wishwood']);
export const CHILD = Object.freeze(['desk', 'gate', 'stay-a', 'stay-b']);
export const STAYS = 24, GUARDS = 4, CHILD_ASKS = 12, KILLED_AFTER = 6, CASES = 5;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const list = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : NaN);   // a count that is not one equals nothing, and sums to nothing
const of = (x, k) => (isObj(x[k]) ? x[k] : {});   // x is always a record here: the facts, or what of() gave
const str = (x) => (typeof x === 'string' ? x : '');
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const others = (all, me) => all.filter((r) => r !== me);
const yes = (b) => (b ? 'yes' : 'NO');

function a1(f) {
  const x = of(f, 'a1');
  const ok = n(x.files) >= 10 && list(x.differ).length === 0 && Array.isArray(x.differ) && Array.isArray(x.missing) && x.missing.length === 0 && x.ancestor === true && x.kernel === true && x.foundation === true && Array.isArray(x.copies) && x.copies.length === 0;
  return [ok, 'wishwood ' + str(x.commit).slice(0, 7) + ' carries ' + n(x.files) + ' pinned files of fall-kit ' + str(x.foundationCommit).slice(0, 7) + ': ' + list(x.differ).length + ' differ, ' + list(x.missing).length + ' missing; that commit an ancestor of this phase\'s: ' + yes(x.ancestor === true) + '; the node imports the engine\'s kernel: ' + yes(x.kernel === true) + ', the vendored foundation: ' + yes(x.foundation === true) + '; copies of either in it: ' + list(x.copies).length];
}
function a2(f) {
  const x = of(f, 'a2'), p = of(x, 'pinned'), o = of(x, 'outsider');
  const pins = ESTATE.filter((r) => same(list(p[r]), others(ESTATE, r)));
  const refused = ESTATE.filter((r) => isObj(o[r]) && o[r].refused === true && o[r].pinnedOutsider === false);
  const ok = n(x.processes) === 4 && pins.length === 4 && Object.keys(p).length === 4 && refused.length === 4 && n(x.messages) >= 1 && n(x.nonLight) === 0;
  return [ok, n(x.processes) + ' processes; ' + pins.length + ' of 4 pinned exactly the other three from the founder\'s roster; the card not on it refused by ' + refused.length + ' of 4; ' + n(x.messages) + ' messages, ' + n(x.nonLight) + ' not LIGHT'];
}
function a3(f) {
  const x = of(f, 'a3'), ss = list(x.stays).filter(isObj), gs = list(x.guards).filter(isObj);
  const goodStay = ss.filter((s) => s.outcome === 'verified' && s.audit === true && s.digest === true && s.recorded === true && typeof s.available === 'boolean');
  const goodGuard = gs.filter((g) => isObj(g.second) && g.outcome === 'verified' && g.recheck === true && g.recorded === true && Array.isArray(g.clashes) && g.clashes.length === n(g.second.clashes) && n(g.bookings) === g.second.bookings);
  const by = Object.fromEntries(gs.map((g) => [str(g.id), g]));
  const g1 = list(by.g1 && by.g1.clashes);
  const g1ok = g1.length === 1 && isObj(g1[0]) && g1[0].cabin === 'yurt' && same([str(of(g1[0], 'a').channel), str(of(g1[0], 'b').channel)].sort(), ['airbnb', 'booking']);
  const none = (id) => isObj(by[id]) && Array.isArray(by[id].clashes) && by[id].clashes.length === 0;
  const ok = ss.length === STAYS && goodStay.length === STAYS && gs.length === GUARDS && goodGuard.length === GUARDS && g1ok && none('g2') && none('g4') && none('g3') && n(by.g3.bookings) === 0 && n(by.g4.bookings) === 1;
  return [ok, goodStay.length + ' of ' + ss.length + ' stay asks answered, recorded and equal to the client\'s audit on a calendar of the same digest (' + ss.filter((s) => s.available === false).length + ' not free); ' + goodGuard.length + ' of ' + gs.length + ' guard asks answered, recorded and re-run by the asker to the same answer, every one matching the second count; g1: ' + (g1ok ? 'the yurt sold by Airbnb and Booking.com' : 'NOT the yurt sold twice (' + g1.length + ' clashes)') + '; g2, g3, g4: ' + ['g2', 'g3', 'g4'].map((id) => (isObj(by[id]) ? list(by[id].clashes).length + ' clashes, ' + n(by[id].bookings) + ' bookings' : 'not asked')).join('; ')];
}
function a4(f) {
  const x = of(f, 'a4'), found = list(x.found);
  const ok = n(x.packets) >= 1 && Array.isArray(x.found) && found.length === 0 && n(x.foundCount) === 0 && n(x.stayAnswers) === STAYS && n(x.stayShaped) === x.stayAnswers;
  return [ok, n(x.packets) + ' packets sent by the client\'s node, read raw and decoded: ' + (found.length ? 'FOUND ' + found.join(', ') : 'none of the privacy list') + '; ' + n(x.stayShaped) + ' of ' + n(x.stayAnswers) + ' stay answers carry the cabin, the dates, the verdict and the calendar\'s digest, and nothing else'];
}
function immuneOk(step, first, adopters) {
  const ad = of(step, 'adopters');
  return step.first === first && step.refused === true && same(Object.keys(ad).sort(), adopters.slice().sort())
    && adopters.every((o) => isObj(ad[o]) && n(ad[o].adopted) >= 1 && isObj(ad[o].again) && ad[o].again.recognised === true && ad[o].again.decoded === false && ad[o].again.admitted === false);
}
function a5(f) {
  const xs = list(f.a5).filter(isObj);
  const one = xs[0] || {}, two = xs[1] || {};
  const ok1 = immuneOk(one, 'breakit', ['wishwood']), ok2 = immuneOk(two, 'wishwood', ['site', 'breakit', 'konomi']);
  return [xs.length === 2 && ok1 && ok2, 'first at break-it (refused at ' + str(one.stage) + '): the client\'s node ' + (ok1 ? 'adopted after its own re-run and refused it on sight' : 'did NOT adopt and refuse it on sight') + '; first at the client\'s node (refused at ' + str(two.stage) + '): ' + (ok2 ? 'all three estate nodes adopted after their own re-run and refused it on sight' : 'NOT every estate node adopted and refused it on sight')];
}
function a6(f) {
  const x = of(f, 'a6'), live = of(x, 'live');
  const ok = n(x.refused) === 0 && n(x.used) === STAYS + GUARDS && x.everyUsedValued === true && n(x.valuesOnClient) >= x.used && x.clientCredited === true && live.ok === false;
  return [ok, n(x.used) + ' answers used, ' + n(x.valuesOnClient) + ' routing values on the client\'s node\'s name in the books, every used answer valued by its asker: ' + yes(x.everyUsedValued === true) + '; refused in the merge: ' + n(x.refused) + '; the client\'s key credited: ' + yes(x.clientCredited === true) + '; a live allocation ' + (live.ok === false ? 'refused (' + str(live.why) + ')' : 'GIVEN')];
}
function b1(f) {
  const x = of(f, 'b1'), p = of(x, 'pinned'), asks = list(x.asks).filter(isObj), killed = list(x.killed), fg = of(x, 'forged'), ad = of(fg, 'adopters');
  const pins = CHILD.filter((r) => same(list(p[r]), others(CHILD, r)));
  const good = asks.filter((a) => a.outcome === 'verified' && a.audit === true);
  const after = asks.filter((a) => n(a.k) >= KILLED_AFTER);
  const survived = killed.length === 1 && after.length === CHILD_ASKS - KILLED_AFTER && after.every((a) => a.outcome === 'verified' && a.to !== killed[0]);
  const lost = asks.reduce((t, a) => t + list(a.lost).length, 0);
  const forged = fg.refused === true && ['desk', 'stay-b', 'gate'].every((o) => isObj(ad[o]) && n(ad[o].adopted) >= 1 && isObj(ad[o].again) && ad[o].again.recognised === true && ad[o].again.decoded === false && ad[o].again.admitted === false);
  const ok = n(x.processes) === 4 && pins.length === 4 && Object.keys(p).length === 4 && asks.length === CHILD_ASKS && good.length === CHILD_ASKS && survived && lost <= 1 && forged;
  return [ok, n(x.processes) + ' processes; ' + pins.length + ' of 4 pinned exactly the other three from the client\'s roster; ' + good.length + ' of ' + asks.length + ' asks answered and equal to the client\'s audit; ' + (killed[0] ? str(killed[0]) + ' killed after ask ' + KILLED_AFTER + ', every later ask ' + (survived ? 'answered by the holder still standing' : 'NOT answered by the holder still standing') : 'NO holder killed') + ', ' + lost + ' ask lost and asked again; the forged packet ' + (forged ? 'refused on sight by desk, stay-b and the gate after their own re-run' : 'NOT refused on sight by every adopter')];
}
function b2(f) {
  const x = of(f, 'b2'), cr = of(x, 'cross'), into = of(cr, 'intoChild'), out = of(cr, 'intoEstate'), rp = of(x, 'replay'), dk = of(rp, 'desk'), er = of(x, 'estateRefuses');
  const stages = [...ESTATE.flatMap((e) => CHILD.map((c) => of(into, e)[c])), ...CHILD.flatMap((c) => ESTATE.map((e) => of(out, c)[e]))];
  const atSender = stages.filter((s) => s === 'sender').length;
  const refusals = Object.values(er);
  const refusedAll = refusals.length >= 1 && refusals.every((w) => str(w).includes('different geneses'));
  const ok = n(x.foreign) === 0 && atSender === 32 && rp.ownGenesis === true && dk.merged === true && list(dk.refused).length === 0 && Array.isArray(dk.refused) && refusedAll;
  return [ok, n(x.foreign) + ' estate keys in the client\'s roster, genesis or pins; ' + atSender + ' of 32 cross packets refused at the sender stage; the desk\'s ledger replayed under the client\'s own genesis: ' + yes(rp.ownGenesis === true && dk.merged === true && list(dk.refused).length === 0) + '; the estate\'s books ' + (refusedAll ? 'refused all ' + refusals.length + ' of the client\'s ledgers: they began from different geneses' : 'did NOT refuse every ledger of the client\'s')];
}
function b3(f) {
  const x = of(f, 'b3'), m = Object.values(of(x, 'merged')).filter(isObj), d = of(x, 'desk'), sh = of(x, 'sharedOn'), fa = of(x, 'falseAntibody');
  const mergedAll = m.length === 4 && m.every((r) => r.merged === true && Array.isArray(r.refused) && r.refused.length === 0 && n(r.added) + n(r.skipped) === n(r.sent));
  const adopted = n(d.adopted) >= 1 && isObj(d.again) && d.again.recognised === true && d.again.decoded === false && d.again.admitted === false;
  const on = ['stay-a', 'stay-b', 'gate'].filter((o) => isObj(sh[o]) && sh[o].shared === true && n(sh[o].adopted) >= 1 && sh[o].recognised === true);
  const notFalse = n(fa.adopted) === 0 && n(fa.blocked) >= 1;
  const ok = x.genesisIsEstate === true && mergedAll && n(x.asks) >= 1 && of(x, 'hub').refused === true && adopted && on.length === 3 && notFalse && n(x.rosterForeign) === 0;
  return [ok, 'planted on the estate\'s genesis: ' + yes(x.genesisIsEstate === true) + '; the client\'s ' + m.length + ' ledgers merged into the estate\'s books ' + (mergedAll ? 'with nothing refused, every entry once' : 'NOT cleanly') + '; the desk ' + (adopted ? 'adopted the hub\'s antibodies after its own re-run and refused the forged packet on sight' : 'did NOT adopt the hub\'s antibodies and refuse it on sight') + '; shared on to ' + on.length + ' of 3 (' + ['stay-a', 'stay-b', 'gate'].map((o) => o + ': ' + (isObj(sh[o]) && sh[o].shared === true ? 'shared' : 'nothing to share')).join(', ') + '); the antibody made from a genuine packet ' + (notFalse ? 'not adopted (' + n(fa.blocked) + ' blocked)' : 'ADOPTED') + '; estate keys in the client\'s roster: ' + n(x.rosterForeign)];
}
function w1(f) {
  const x = of(f, 'w1'), s = of(x, 'sealed');
  const ok = x.exit === 0 && str(x.last).includes('PILOT CHECK CLEAN') && same(x.judged, [9, 1]) && n(s.held) === 9 && n(s.failed) === 1 && same(s.failedIds, ['ciso-1']) && n(x.crosses) === 0 && n(x.ticks) >= 1;
  return [ok, 'break-it ' + str(x.commit).slice(0, 7) + '\'s pilot/check.mjs exited ' + (Number.isSafeInteger(x.exit) ? x.exit : 'without a code') + ': ' + str(x.last).trim() + '; ' + n(x.ticks) + ' checks held, ' + n(x.crosses) + ' not; the judge re-run gives ' + (Array.isArray(x.judged) ? x.judged.join(' held, ') + ' failed' : 'nothing') + ' (sealed: ' + n(s.held) + ' held, ' + list(s.failedIds).join(', ') + ' failed)'];
}
function w2(f) {
  const x = of(f, 'w2'), cs = list(x.cases).filter(isObj), direct = list(x.direct);
  const good = cs.filter((c, i) => c.outcome === 'verified' && str(c.stage) !== '' && c.stage === c.expect && c.stage === direct[i]);
  const ok = cs.length === CASES && direct.length === CASES && good.length === CASES && cs.filter((c) => c.stage === 'admitted').length === 1;
  return [ok, good.length + ' of ' + cs.length + ' cases decided by the client\'s gate at the stage the case names and as break-it\'s own gate decides it (' + cs.map((c) => str(c.stage)).join(', ') + ')'];
}
function p1(f) {
  const x = of(f, 'p1'), w = of(x, 'want'), fg = of(x, 'forged');
  const ok = str(x.roster) !== '' && x.roster === w.roster && str(x.genesis) !== '' && x.genesis === w.genesis && isObj(x.keys) && Object.keys(x.keys).length === 5 && same(x.keys, w.keys) && list(x.verdicts).length === CHILD_ASKS && same(x.verdicts, w.verdicts) && n(fg.adopters) === 3 && n(fg.recognised) === 3;
  return [ok, 'in a tab at ' + str(x.where) + ': the roster ' + (x.roster === w.roster ? 'the measure\'s' : 'DIFFERENT') + ', the genesis ' + (x.genesis === w.genesis ? 'the measure\'s' : 'DIFFERENT') + ', the keys ' + (same(x.keys, w.keys) ? 'the measure\'s' : 'DIFFERENT') + '; ' + list(x.verdicts).length + ' asks, the verdicts ' + (same(x.verdicts, w.verdicts) ? 'the measure\'s' : 'DIFFERENT') + '; the forged packet refused on sight by ' + n(fg.recognised) + ' of ' + n(fg.adopters) + ' adopters' + (Number.isFinite(x.seconds) ? ', in ' + x.seconds + ' s' : '')];
}
function p2(f) {
  const x = of(f, 'p2'), mods = of(x, 'modules'), pv = of(x, 'privacy');
  const barred = Object.entries(mods).filter(([, w]) => !Array.isArray(w) || w.length > 0);
  const leaks = Object.entries(pv).filter(([, w]) => !Array.isArray(w) || w.length > 0);
  const ok = Array.isArray(x.page) && x.page.length === 0 && has(mods, 'core/seed.mjs') && Object.keys(mods).length >= 2 && barred.length === 0 && has(pv, 'core/phase7/index.html') && has(pv, 'core/receipts/phase7.json') && has(pv, 'core/phase7/nodes.json') && leaks.length === 0;
  return [ok, Object.keys(mods).length + ' modules and the page read: ' + (barred.length || list(x.page).length ? 'barred words in ' + [...barred.map(([p]) => p), ...(list(x.page).length ? ['the page'] : [])].join(', ') : 'no barred word') + (Array.isArray(x.page) ? '' : ' (the page was NOT read)') + '; ' + Object.keys(pv).length + ' published files read for the client\'s guests: ' + (leaks.length ? 'FOUND in ' + leaks.map(([p, w]) => p + ' (' + list(w).join(', ') + ')').join('; ') : 'none')];
}

const RULES = Object.freeze({ A1: a1, A2: a2, A3: a3, A4: a4, A5: a5, A6: a6, B1: b1, B2: b2, B3: b3, W1: w1, W2: w2, P1: p1, P2: p2 });

export function judge(claims, facts) {
  const cs = isObj(claims) ? list(claims.claims) : [], f = isObj(facts) ? facts : {};
  const verdicts = cs.filter(isObj).map((c) => {
    const id = str(c.id), key = id.toLowerCase();
    const present = key === 'a5' ? Array.isArray(f[key]) : isObj(f[key]);
    if (!has(RULES, id) || !present) return { id, pass: c.pass, held: null, measured: 'not measured yet' };
    const [held, measured] = RULES[id](f);
    return { id, pass: c.pass, held, measured };
  });
  return { verdicts, held: verdicts.filter((v) => v.held === true).length, failed: verdicts.filter((v) => v.held === false).length, open: verdicts.filter((v) => v.held === null).length };
}
