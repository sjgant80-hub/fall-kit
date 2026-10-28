// core/phase7b/tab.mjs — Phase 7b, claim R5: anyone can see a bridge pass immunity on, in a browser tab. break-it's node
// (from break-it's own site) is the hub, a foundation node is a peer the hub pins, a foundation node is the bridge, and
// wishwood's booking engine (from wishwood's own site) is a member that pins only the bridge. A packet in the peer's name,
// signed by a stranger, is refused at the hub; the hub shares its antibodies with the bridge; the bridge shares on; the
// packet is offered to the member. Run twice: the bridge with relay set, and without. Every key is a public test seed or
// the sealed public phrase. Nothing is sent anywhere.
import { createNode } from '../node.mjs';
import { makeIdentity } from '../identity.mjs';
import { prepare, finish, KINDS } from '../vendor/light/packet.mjs';
import { childOf, CLOCK } from '../phase7/world.mjs';

const getJson = async (path) => { const r = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
const seedOf = (n) => new Uint8Array(32).fill(n);

async function once(mods, ids, relay) {
  const hub = (await mods.breakit.breakitNode({ identity: ids.hub, clock: CLOCK, pins: {} })).node;
  const peer = await createNode({ name: 'living-site', identity: ids.peer, clock: CLOCK });
  const bridge = await createNode({ name: 'desk', identity: ids.bridge, clock: CLOCK, relay });
  const member = (await mods.wishwood.wishwoodNode({ identity: ids.member, clock: CLOCK, bookings: [] })).node;
  for (const [a, b] of [[hub, peer], [hub, bridge], [bridge, hub], [bridge, member], [member, bridge]]) await a.pin(b.card());
  const p = prepare({ sender: ids.peer.slot, counter: 700201n, kind: KINDS.JSON, value: { t: 'ledger', to: ids.hub.id, log: [] }, dictId: 0 });
  const forged = finish(p.unsigned, await ids.stranger.sign(p.signed)).bytes;
  const atHub = await hub.hear(forged);
  const toBridge = await hub.shareAntibodies(bridge.id);
  const atBridge = toBridge ? await bridge.hear(toBridge) : null;
  const toMember = await bridge.shareAntibodies(member.id);
  const atMember = toMember ? await member.hear(toMember) : null;
  const seen = await member.hear(forged);
  return { hubStage: atHub.stage || null, bridgeAdopted: atBridge ? atBridge.adopted : 0, shared: !!toMember, adopted: atMember ? atMember.adopted : 0, recognised: seen.recognised === true };
}

/** → { facts: { relayOn, relayOff, seconds } } */
export async function bridgeTab(onStep) {
  const say = (t) => { if (typeof onStep === 'function') onStep(t); };
  const claims7 = await getJson('../phase7/claims.json');
  const [breakit, wishwood] = await Promise.all([import('/break-it/node/breakit-node.mjs'), import('/wishwood/node/wishwood-node.mjs')]);
  say('Fetched break-it\'s node and the client\'s booking engine from their own sites.');
  const t0 = performance.now();
  const child = await childOf(claims7);
  const [hub, peer, stranger] = await Promise.all([claims7.seeds.breakit, claims7.seeds.site, claims7.seeds.stranger].map((n) => makeIdentity(seedOf(n))));
  const ids = { hub, peer, stranger, bridge: child.ids.desk, member: child.ids['stay-a'] };
  const relayOn = await once({ breakit, wishwood }, ids, true);
  say('With the bridge relaying: the hub refused the forged packet at its ' + relayOn.hubStage + ' check; the bridge adopted ' + relayOn.bridgeAdopted + ' and shared on; the member adopted ' + relayOn.adopted + ' and ' + (relayOn.recognised ? 'refused the packet on sight.' : 'did NOT refuse it on sight.'));
  const relayOff = await once({ breakit, wishwood }, ids, false);
  say('Without: the bridge adopted ' + relayOff.bridgeAdopted + ', ' + (relayOff.shared ? 'shared something' : 'had nothing to share') + ', and the member ' + (relayOff.recognised ? 'knew the packet' : 'did not know the packet') + '.');
  return { facts: { relayOn, relayOff, seconds: Math.round(performance.now() - t0) / 1000 } };
}
