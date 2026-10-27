// core/phase7/tab.mjs — Phase 7, claim P1: anyone can grow the client's organism in a browser tab. The claims, the client's
// demo calendar (from the wishwood engine's own site) and the node modules (wishwood's and break-it's, from their own sites,
// at the commits their pages serve) are fetched from this origin; the seed is planted in the tab; the four nodes live in the
// tab; the founder's roster, a forged packet and the 12 stay asks run through the same code CI measured (run.mjs). With the
// sealed phrase the tab must reach the measure's roster, genesis, keys and verdicts. A visitor's own phrase grows their own
// organism the same way: its keys are worked out in the tab and nothing is sent anywhere.
import * as L from '../vendor/ledger/contrib.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import { hex } from '../identity.mjs';
import { stableJson } from '../node.mjs';
import { opsOf } from '../cells.mjs';
import { rosterOf } from '../seed.mjs';
import { CHILD, bootRole, extraOf, childOf, estateOf, feedSetsOf } from './world.mjs';
import { wireOf, carrier, rosterUp, forge, ask, stayAsks } from './run.mjs';

const getJson = async (path) => { const r = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
const shaOf = (x) => hex(sha256(new TextEncoder().encode(stableJson(x))));

/** The modules and data a tab grows the organism from, all from this origin. */
export async function tabMods(claims) {
  const [wishwood, breakit, cal] = await Promise.all([import('/wishwood/node/wishwood-node.mjs'), import('/break-it/node/breakit-node.mjs'), getJson('/wishwood/data/demo-calendar.json')]);
  return { wishwood, breakit, bookings: cal.bookings, feedSets: feedSetsOf(claims) };
}

/** Grow the client's organism in this tab. phrase = the sealed one unless a visitor gives their own. → { facts, organism } */
export async function grow(onStep, phrase) {
  const say = (t) => { if (typeof onStep === 'function') onStep(t); };
  const sealed = await getJson('./claims.json');
  const claims = phrase === undefined ? sealed : { ...sealed, child: { ...sealed.child, phrase } };
  const mods = await tabMods(claims);
  say('Fetched the claims, the client\'s demo calendar (' + mods.bookings.length + ' bookings) and the node modules from this site.');
  const t0 = performance.now();
  const planted = await childOf(claims), { ids } = await estateOf(sealed);
  say('Planted the seed: a founder and ' + CHILD.length + ' organs, every key worked out from the phrase in this tab (founder ' + planted.ids.founder.id.slice(0, 12) + '…).');
  const cells = {};
  for (const r of CHILD) { const { node } = await bootRole(r, mods, claims, 'child'); cells[r] = { id: node.id, call: opsOf(node, extraOf(node)) }; }
  const w = wireOf(), dead = new Set(), byId = Object.fromEntries(Object.values(cells).map((c) => [c.id, c]));
  const carry = carrier(byId, w, dead);
  const up = await rosterUp(cells, (cards) => rosterOf(planted, cards));
  say('The founder signed the roster of the four; each node pinned the other three from it.');
  const bad = await forge(planted.ids.desk.slot, cells['stay-a'].id, ids.stranger, 700003);
  await cells['stay-a'].call('hear', { bytes: bad });
  let recognised = 0, adopters = 0;
  for (const o of ['desk', 'stay-b', 'gate']) {
    const s = await cells['stay-a'].call('shareAntibodies', { to: cells[o].id });
    const r = s ? await carry(cells['stay-a'].id, cells[o].id, s.bytes) : null;
    if (r && r.adopted >= 1) adopters++;
    if ((await cells[o].call('hear', { bytes: bad })).recognised === true) recognised++;
  }
  say('A packet in the desk\'s name signed by a stranger\'s key: refused at stay-a, its antibodies adopted by ' + adopters + ' of 3 after their own re-run, then refused on sight by ' + recognised + '.');
  const stays = [];
  for (const q of stayAsks(claims).slice(0, 12)) stays.push(await ask(cells, carry, w, dead, 'desk', 'stay', q));
  say('The desk asked its own booking engine 12 times: ' + stays.filter((s) => s.outcome === 'verified').length + ' answered and checked, ' + stays.filter((s) => s.answer && s.answer.available === false).length + ' of the stays not free.');
  const seconds = Math.round(performance.now() - t0) / 1000;
  return {
    facts: { roster: shaOf(up.roster), genesis: await L.idOf(planted.genesis), keys: Object.fromEntries(planted.roles.map((r) => [r, planted.ids[r].id])), verdicts: stays.map((s) => (s.answer ? s.answer.available : null)), forged: { adopters, recognised }, seconds },
    organism: { roles: planted.roles, ids: Object.fromEntries(planted.roles.map((r) => [r, planted.ids[r].id])), stays: stays.map((s) => ({ cabin: s.input.cabin, checkin: s.input.checkin, checkout: s.input.checkout, to: s.to, available: s.answer ? s.answer.available : null })), messages: w.messages, nonLight: w.nonLight },
    seconds,
  };
}
