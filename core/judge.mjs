// ════════════════════════════════════════════════════════════════
// core/judge.mjs — Phase 1's verdicts, from the facts core/prove.mjs measured, against the claims sealed in
// core/claims.json before any of this code existed. Pure, total, gated. No model judges anything: each claim has one
// rule over numbers and flags, and a claim whose facts are missing is UNMEASURED, never held.
// ════════════════════════════════════════════════════════════════
const obj = (x) => (x !== null && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isSafeInteger(x) ? x : -1);
const present = (f, k) => Object.prototype.hasOwnProperty.call(obj(f), k) && obj(f)[k] !== null && typeof obj(f)[k] === 'object';

// each rule: facts → [held, what was measured, in words] — or null when the facts were not measured
export const RULES = Object.freeze({
  F1: (f) => {
    if (!present(f, 'wire')) return null;
    const w = obj(f.wire);
    return [n(w.messages) > 0 && n(w.nonLight) === 0, n(w.messages) + ' messages between the nodes; ' + n(w.nonLight) + ' not a LIGHT packet'];
  },
  F2: (f) => {
    if (!present(f, 'hostile')) return null;
    const h = arr(obj(f.hostile).cases);
    const refused = h.filter((x) => obj(x).ok === false).length, decoded = h.filter((x) => obj(x).decoded === true).length, admitted = h.filter((x) => obj(x).ok === true).length;
    return [h.length === 6 && refused === 6 && decoded === 0 && admitted === 0, h.length + ' hostile packets: ' + refused + ' refused, ' + decoded + ' decoded, ' + admitted + ' admitted (' + h.map((x) => obj(x).stage).join(', ') + ')'];
  },
  F3: (f) => {
    if (!present(f, 'couplings')) return null;
    const c = obj(f.couplings);
    return [n(c.next) === 20 && n(c.honest) > n(c.dishonest) && n(c.toHonest) >= 18, 'links: honest ' + n(c.honest) + ', dishonest ' + n(c.dishonest) + ' (parts of a million); of the next ' + n(c.next) + ' asks, ' + n(c.toHonest) + ' went to the honest peer'];
  },
  F4: (f) => {
    if (!present(f, 'immunity')) return null;
    const i = obj(f.immunity);
    return [n(i.adopted) >= 1 && i.recognisedAfter === true && n(i.autoimmuneBlocked) >= 1 && n(i.adoptedAdmitted) === 0,
      n(i.shared) + ' antigens shared, ' + n(i.adopted) + ' adopted after re-running each on the receiver’s own door; the attack at the receiver afterwards: ' + (i.recognisedAfter === true ? 'recognised on sight' : 'not recognised') + '; a valid packet slipped into a bundle: ' + n(i.autoimmuneBlocked) + ' blocked; adopted antigens the receiver’s door admits: ' + n(i.adoptedAdmitted)];
  },
  F5: (f) => {
    if (!present(f, 'ledger')) return null;
    const l = obj(f.ledger);
    return [n(l.used) > 0 && n(l.records) === n(l.used) && l.creditsEqual === true && l.replayed === true,
      n(l.used) + ' verified answers used, ' + n(l.records) + ' value records written; credits ' + (l.creditsEqual === true ? 'identical' : 'different') + ' on both ledgers after reconcile; replay ' + (l.replayed === true ? 're-derives both chains' : 'failed')];
  },
  F6: (f) => {
    if (!present(f, 'memory')) return null;
    const m = obj(f.memory);
    return [m.identical === true && m.topIsTriageAnswer === true, 'vault ' + n(m.vaultBytes) + ' B for ' + n(m.plainBytes) + ' B of memory, ' + (m.identical === true ? 'byte-identical' : 'NOT identical') + ' on unpack; recall’s top record ' + (m.topIsTriageAnswer === true ? 'is the triage answer' : 'is not the triage answer')];
  },
  F7: (f) => {
    if (!present(f, 'budget')) return null;
    const b = obj(f.budget);
    return [n(b.allowed) === 5 && b.sixthRefused === true && n(b.sixthPackets) === 0, n(b.allowed) + ' asks inside a budget of 5; the sixth ' + (b.sixthRefused === true ? 'refused by the wallet' : 'NOT refused') + ', ' + n(b.sixthPackets) + ' packets built for it'];
  },
  F8: (f) => {
    if (!present(f, 'seed')) return null;
    const s = obj(f.seed);
    return [s.same === true && n(s.count) > 0, n(s.count) + ' patterns re-grown from the genome in the card; ' + (s.same === true ? 'every id the same' : 'ids differ')];
  },
  F9: (f) => {
    if (!present(f, 'processes')) return null;
    const p = obj(f.processes);
    return [p.ran === true && n(p.steps) > 0 && p.identical === true, (p.ran === true ? n(p.steps) + ' verdicts from separate processes: ' + (p.identical === true ? 'identical to the one-process run' : 'DIFFERENT from the one-process run') : 'the separate-process run did not run')];
  },
});

/** sealed = { claims: [{ id, claim, predicted }] }. → { verdicts: [{ id, claim, held, measured, predicted }], held, failed, unmeasured } */
export function judge(sealed, facts) {
  const claims = arr(obj(sealed).claims);
  const verdicts = [];
  let held = 0, failed = 0, unmeasured = 0;
  for (const c of claims) {
    const id = obj(c).id, rule = Object.prototype.hasOwnProperty.call(RULES, id) ? RULES[id] : null;
    let r = null;
    try { r = rule === null ? null : rule(obj(facts)); } catch { r = null; }
    const v = { id: String(id), claim: String(obj(c).claim || ''), held: r === null ? null : r[0] === true, measured: r === null ? 'not measured here' : r[1], predicted: String(obj(c).predicted || '') };
    if (v.held === true) held++; else if (v.held === false) failed++; else unmeasured++;
    verdicts.push(v);
  }
  return { verdicts, held, failed, unmeasured };
}
