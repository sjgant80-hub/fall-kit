// core/phase5/mesh-tab.mjs — two tabs of the living site, one antibody (Phase 5, claim N3). Each tab is a node with its
// own key, made in the tab. They meet over a real WebRTC data channel (falllink, the estate's connection layer, loaded
// from its own site on this origin; offer and answer carried between the tabs by its same-device signalling; an empty
// STUN list, so nothing leaves this machine). Each tab shows the other's key and pins it only when the visitor says so.
// Then one tab refuses a packet from a key nobody pinned, sends the other its antibodies, then that same packet, then an
// honest one. The receiving tab's own door decides each. The results are on window.p5.n3 in each tab.
import { FallLink } from '/falllink/falllink.js';
import { createNode } from '../node.mjs';
import { makeIdentity, hex, unhex } from '../identity.mjs';
import { strangerPacket } from './sitenode.mjs';

const brief = (r) => ({ ok: r.ok === true, stage: r.ok === true ? null : r.stage || null, recognised: r.recognised === true, t: r.t || null });
let state = null;

/** Join: make this tab's key and node, and look for the other tab. ui = { say(text), ready(card), pinned(), done(facts) }. */
export async function joinTabs(ui) {
  if (state) return state.facts;
  const me = await makeIdentity();
  const node = await createNode({ name: 'living-site-tab', identity: me });
  const facts = { tabs: 1, channel: false, me: me.id.slice(0, 16), them: null, pinned: false, role: null, refused: null, offered: 0, adopted: 0, autoimmuneBlocked: 0, again: null, honest: null };
  state = { me, node, facts, theirs: null, wrapper: null };
  const link = new FallLink({ ownId: 'p5-' + me.id.slice(0, 12), signalChannel: 'fall-link-phase5', stunServers: [] });
  link.on('peer', ({ wrapper }) => {
    state.wrapper = wrapper; facts.channel = true; facts.tabs = 2;
    wrapper.send({ card: node.card() });
    ui.say('A channel opened to another tab. Sent it this tab\'s card.');
  });
  link.on('message', async ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (data.card && typeof data.card === 'object' && typeof data.card.id === 'string') {
      state.theirs = data.card; facts.them = data.card.id.slice(0, 16);
      ui.ready(data.card);
      return;
    }
    if (typeof data.light !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(data.light)) return;
    const r = await node.hear(unhex(data.light));
    facts.role = 'receiver';
    if (data.what === 'antibodies') { facts.adopted = r.adopted || 0; facts.autoimmuneBlocked = r.autoimmuneBlocked || 0; facts.offered = r.offered || 0; ui.say('Antibodies from the other tab: ' + (r.adopted || 0) + ' adopted after this tab\'s own door refused the same bytes, ' + (r.autoimmuneBlocked || 0) + ' blocked.'); }
    else if (data.what === 'attack') { facts.again = brief(r); ui.say('The attack, heard here: ' + (r.recognised ? 'refused on sight, recognised from the antibody' : 'refused at ' + r.stage + ', NOT recognised') + '.'); }
    else if (data.what === 'honest') { facts.honest = brief(r); ui.say('An honest packet from the other tab: ' + (r.ok ? 'let in' : 'refused at ' + r.stage) + '.'); ui.done(facts); }
  });
  link.startBroadcast();
  ui.say('This tab\'s key: ' + me.id.slice(0, 16) + '… Looking for another tab of this page.');
  return facts;
}

/** Pin the other tab: the visitor's decision, made on what the screen showed. */
export async function pinTab() {
  if (!state || !state.theirs) return { ok: false, why: 'no other tab yet' };
  const r = await state.node.pin(state.theirs);
  state.facts.pinned = r.ok === true;
  return r;
}

/** This tab refuses a stranger's packet and shares what it learned with the other tab, then sends the same packet and an honest one. */
export async function attackTab(ui) {
  const s = state;
  if (!s || !s.wrapper || !s.theirs || !s.facts.pinned) return { ok: false, why: 'join, and pin the other tab, first' };
  let stranger = await makeIdentity();
  while (stranger.slot === s.me.slot || stranger.slot === s.theirs.slot) stranger = await makeIdentity();   // a key nobody pinned, on a slot nobody holds
  const attack = await strangerPacket(stranger, s.me.id);
  const r = await s.node.hear(unhex(attack));
  s.facts.role = 'attacker'; s.facts.refused = brief(r);
  ui.say('A packet from a key nobody pinned: refused here at ' + r.stage + '.');
  const bundle = await s.node.shareAntibodies(s.theirs.id);
  if (!bundle) return { ok: false, why: 'nothing to share' };
  s.wrapper.send({ light: hex(bundle), what: 'antibodies' });
  s.wrapper.send({ light: attack, what: 'attack' });
  s.node.setShared('mesh', 'note', 'from the other tab');
  s.wrapper.send({ light: hex(await s.node.shareSync(s.theirs.id, 'mesh')), what: 'honest' });
  ui.say('Sent the other tab this tab\'s antibodies, then the same packet, then an honest one.');
  return { ok: true };
}
