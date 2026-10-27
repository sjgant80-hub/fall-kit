// core/phase6/tab.mjs — Phase 6, claim C11: anyone can re-derive the books in their own browser. The books (books.json), the
// evidence the auditor's gate re-checks (evidence.json: every node's card and every signed answer packet), the sealed
// claims and the receipt are fetched from this site; the log is replayed from nothing with the ledger's own code under
// the auditor's own gate, and the sandbox allocation is computed again. Nothing is sent anywhere.
import * as L from '../vendor/ledger/contrib.mjs';
import { auditGate } from './books.mjs';
import { creditsOf, partsOf } from '../economy.mjs';

const getJson = async (url) => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };

/** → the tab's facts for C11, and what it saw on the way. */
export async function rederive(onStep) {
  const say = (t) => { if (typeof onStep === 'function') onStep(t); };
  const [log, ev, claims, receipt] = await Promise.all([getJson('./books.json'), getJson('./evidence.json'), getJson('./claims.json'), getJson('../receipts/phase6.json')]);
  say('Fetched ' + log.length + ' entries and the evidence for ' + Object.keys(ev.evidence).length + ' answers.');
  const ctx = { cards: new Map(ev.cards.map((c) => [c.id, c])), evidence: ev.evidence, phase4: ev.phase4, growth: ev.growth, founder: ev.founder, auditor: ev.auditor, checked: new Set() };
  const t0 = performance.now();
  const r = await L.replay(log, { gate: auditGate(ctx) });
  if (!r.ok) return { facts: { head: null, sameCredits: false, parts: null, why: r.why }, seconds: 0 };
  say('Replayed every entry from nothing, each re-checked by the auditor\'s gate: ' + ctx.checked.size + ' answers checked against their signed packets.');
  const credits = L.credits(r.ledger), al = L.allocate(r.ledger, { sandbox: true, pool: claims.pool });
  const second = creditsOf(r.ledger.log, claims.policy), parts2 = second.ok ? partsOf(second.credits, claims.pool) : { ok: false };
  const want = receipt.facts && receipt.facts.c5 ? receipt.facts.c5 : {};
  return {
    facts: {
      head: r.ledger.head, entries: r.ledger.log.length, checked: ctx.checked.size,
      sameCredits: JSON.stringify(credits.credits) === JSON.stringify(want.credits), parts: al.ok ? al.parts : null,
      secondHandAgrees: al.ok && parts2.ok && JSON.stringify(al.parts) === JSON.stringify(parts2.parts),
    },
    credits: credits.credits, live: L.allocate(r.ledger, {}), seconds: Math.round(performance.now() - t0) / 1000,
  };
}
