// ════════════════════════════════════════════════════════════════
// core/phase6/world.mjs — Phase 6's nodes, booted the same way in Node (each in its own process) or in a browser tab:
// the living site, its door offered to the mesh as the skill door; break-it's and konomi-slm's real nodes (their adapter
// modules handed in); and a dishonest peer offering triage with receipts that do not check. Every identity comes from a
// public test seed sealed in core/phase6/claims.json, and every node begins its ledger from the same genesis, the one
// the auditor's books begin from: the founder as the one activator, the sealed policy, and the measurers.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
import { makeIdentity, hex } from '../identity.mjs';
import { createNode, stableJson } from '../node.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import * as L from '../vendor/ledger/contrib.mjs';
import { door, makeDoor } from '../site.mjs';
import { opsOf } from '../cells.mjs';

export const ROLES = Object.freeze(['site', 'breakit', 'konomi', 'liar']);
export const CLOCK = () => new Date('2026-10-27T15:00:00Z');
export const AT = '2026-10-27T15:00:00Z';
const seedOf = (n) => new Uint8Array(32).fill(n);
const enc = (s) => new TextEncoder().encode(s);
const DOOR = makeDoor([]);

/** Every key of the world, and the genesis every ledger begins from. seeds = claims.seeds; policy = claims.policy. */
export async function worldOf(seeds, policy) {
  const ids = {};
  for (const k of ['founder', 'site', 'breakit', 'konomi', 'liar', 'growth', 'networkMeasurer']) ids[k] = await makeIdentity(seedOf(seeds[k]));
  ids.network = await Promise.all(seeds.network.map((n) => makeIdentity(seedOf(n))));
  const measurers = [ids.site.id, ids.breakit.id, ids.konomi.id, ids.founder.id, ids.networkMeasurer.id];
  const g = await L.sign(ids.founder.ledgerKeys, { type: 'genesis', activators: [ids.founder.id], measurers, policy });
  return { ids, genesis: g.entry };
}

/** The site's door as a skill: a message's verdict, with a receipt that carries the text and re-hashes. */
export function doorAnswer(input) {
  const text = input && typeof input.text === 'string' ? input.text : '';
  const r = door({ kind: 'message', bytes: enc(text) }, DOOR);
  const core = { kind: 'message', text, sha: hex(sha256(enc(text))), ok: r.ok, stage: r.ok ? null : r.stage, door: DOOR.version };
  return { verdict: 'VERIFIED', ok: r.ok, stage: core.stage, receipt: { ...core, receiptHash: hex(sha256(enc(JSON.stringify(core)))) } };
}
/** An asker's check of a door answer: the receipt re-hashes, and the door, run again here on the receipt's text, agrees. */
export function doorChecks(answer) {
  const rc = answer && answer.receipt;
  if (!rc || typeof rc.text !== 'string' || typeof rc.receiptHash !== 'string') return false;
  const { receiptHash, ...core } = rc;
  if (hex(sha256(enc(JSON.stringify(core)))) !== receiptHash) return false;
  const again = doorAnswer({ text: rc.text });
  return again.receipt.receiptHash === receiptHash && answer.ok === again.ok && answer.stage === again.stage;
}

const dishonestTriage = async () => ({ verdict: 'VERIFIED', domain: 'triage', label: 1, receipt: { model: 'konomi-slm/1', domain: 'triage', label: 1, verdict: 'VERIFIED', receiptHash: 'f'.repeat(64) } });

/** Boot one role. mods = { breakit, konomi, pins } (break-it's and konomi-slm's adapter modules, break-it's pinned table). */
export async function bootRole(role, mods, seeds, policy) {
  const m = mods && typeof mods === 'object' ? mods : {};
  const { ids, genesis } = await worldOf(seeds, policy);
  const checks = { door: doorChecks };
  if (role === 'site') return { node: await createNode({ name: 'living-site', identity: ids.site, genesis, clock: CLOCK, budget: 1000, skills: { door: async (input) => doorAnswer(input) }, checks }), extra: {} };
  if (role === 'breakit') return { node: (await m.breakit.breakitNode({ identity: ids.breakit, genesis, clock: CLOCK, budget: 1000, pins: m.pins })).node, extra: {} };
  if (role === 'konomi') return { node: (await m.konomi.konomiNode({ identity: ids.konomi, genesis, clock: CLOCK, budget: 1000 })).node, extra: {} };
  if (role === 'liar') return { node: await createNode({ name: 'dishonest-peer', identity: ids.liar, genesis, clock: CLOCK, budget: 1000, skills: { triage: dishonestTriage } }), extra: {} };
  throw new Error('no such role: ' + role);
}

/** A cell in this same process or tab. */
export async function localCell(role, mods, seeds, policy) {
  const { node, extra } = await bootRole(role, mods, seeds, policy);
  return { id: node.id, call: opsOf(node, extra), close: async () => {} };
}
export { stableJson };
