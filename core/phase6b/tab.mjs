// core/phase6b/tab.mjs — Phase 6b, claim N8: anyone can check the fix in their own browser. Phase 6's books, its evidence,
// its sealed seeds and policy, and the sealed attacks are fetched from this site; the books are replayed from nothing under
// the auditor's gate; the bound network is built, the attacks offered at its door, the books merged into it, the switch
// set on a copy and the pool shared; and the books are offered to Phase 6's own mock, which does not bind names. The code
// is the code CI measured (net.mjs). Nothing is sent anywhere.
import * as L from '../vendor/ledger/contrib.mjs';
import { auditGate } from '../phase6/books.mjs';
import { worldOf } from '../phase6/world.mjs';
import { ctxOf, attacksOf, fixPath, refusePath } from './net.mjs';

const getJson = async (path) => { const r = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
const n0 = (x) => Number(x).toLocaleString('en-GB');

/** → the tab's facts for N8, and what it saw on the way. */
export async function rebind(onStep) {
  const say = (t) => { if (typeof onStep === 'function') onStep(t); };
  const [log, ev, c6, c6b] = await Promise.all([getJson('../phase6/books.json'), getJson('../phase6/evidence.json'), getJson('../phase6/claims.json'), getJson('./claims.json')]);
  say('Fetched the books (' + n0(log.length) + ' entries), the evidence, Phase 6\'s seeds and policy, and the ' + c6b.attacks.length + ' sealed attacks.');
  const t0 = performance.now();
  const world = await worldOf(c6.seeds, c6.policy);
  const r = await L.replay(log, { gate: auditGate(ctxOf(ev)) });
  if (!r.ok) throw new Error('the books did not replay: ' + r.why);
  say('Replayed the books from nothing under the auditor\'s gate, to the final hash ' + r.ledger.head.slice(0, 16) + '….');
  const fix = await fixPath(r.ledger, world, auditGate(ctxOf(ev)), c6.pool, c6.counsel, await attacksOf(c6b.attacks, world));
  if (!fix.merged) throw new Error('the merge into the bound network was refused: ' + fix.why);
  say('Built a network that holds the rule: ' + fix.network.atDoor.filter((a) => !a.ok).length + ' of ' + fix.network.atDoor.length + ' attacks refused at its door, its ' + fix.network.own.length + ' contributors recorded under their own names.');
  say('Merged the books into it: ' + n0(fix.added) + ' added, ' + n0(fix.skipped) + ' already held, ' + n0(fix.refused.length) + ' refused; a switch on a copy, and the pool shared.');
  const refuse = await refusePath(r.ledger, world, auditGate(ctxOf(ev)));
  say('Offered the books to Phase 6\'s mock network, which does not bind names: ' + (refuse.refused ? 'refused, ' + refuse.unbound.length + ' releases named, nothing written.' : 'NOT refused.'));
  const seconds = Math.round(performance.now() - t0) / 1000;
  return {
    facts: { booksEntries: fix.booksEntries, added: fix.added, skipped: fix.skipped, refused: fix.refused.length, parts: fix.parts, atDoorRefused: fix.network.atDoor.filter((a) => !a.ok).length, unboundRefused: refuse.refused, siteNamed: refuse.siteNamed, seconds },
    fix, refuse, seconds,
  };
}
