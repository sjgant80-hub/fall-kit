// core/phase3/webrtc-tab.mjs — Phase 3, pass 5 (claim X1): a browser tab is a node on the mesh. Two tabs connect over a
// real WebRTC data channel (falllink, the estate's connection layer, loaded from its own site on this origin; offer and
// answer carried between the tabs by its same-device signalling; no STUN server, so nothing leaves the machine). Each
// tab runs a foundation node; A says signed LIGHT packets to B over the channel (shared-state syncs), then a changed one
// and a replay, and B's own door decides each. The results are on window.result in each tab.
import { FallLink } from '/falllink/falllink.js';
import { createNode } from '../node.mjs';
import { makeIdentity, hex, unhex } from '../identity.mjs';

const role = new URLSearchParams(location.search).get('role') === 'b' ? 'b' : 'a';
const out = document.getElementById('out');
const show = (x) => { out.textContent = JSON.stringify(x, null, 1); };
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const ids = { a: await makeIdentity(new Uint8Array(32).fill(95)), b: await makeIdentity(new Uint8Array(32).fill(96)) };
const me = ids[role], them = ids[role === 'a' ? 'b' : 'a'];
const node = await createNode({ name: 'tab-' + role, identity: me, clock: CLOCK });
// the other tab's card is built from its public test seed here: pinning is the owner's decision, made out of band
const theirs = await createNode({ name: 'tab-' + (role === 'a' ? 'b' : 'a'), identity: them, clock: CLOCK });
const pinned = await node.pin(theirs.card());
const result = { role, pinned: pinned.ok, channel: false, falllink: null, sent: 0, admitted: 0, refused: {}, shared: null };
window.result = result;
show(result);

const link = new FallLink({ ownId: 'x1-' + role, signalChannel: 'fall-link-x1', stunServers: [] });
link.on('peer', async ({ wrapper }) => {
  result.channel = true;
  show(result);
  if (role !== 'a') return;
  const packets = [];
  for (let i = 0; i < 10; i++) {
    node.setShared('mesh', 'note-' + i, 'from tab a, ' + i);
    packets.push(await node.shareSync(them.id, 'mesh'));
  }
  for (const p of packets) { wrapper.send({ light: hex(p) }); result.sent++; }
  const changed = packets[0].slice(); changed[30] ^= 1;
  wrapper.send({ light: hex(changed) }); result.sent++;       // one byte changed
  wrapper.send({ light: hex(packets[9]) }); result.sent++;    // the last one again: a replay
  show(result);
});
link.on('message', async ({ data }) => {
  if (!data || typeof data.light !== 'string') return;
  const r = await node.hear(unhex(data.light));
  if (r.ok === true && r.t === 'sync') result.admitted++;
  else result.refused[r.stage || 'other'] = (result.refused[r.stage || 'other'] || 0) + 1;
  result.shared = Object.keys(node.shared('mesh')).length;
  show(result);
});
const res = await fetch('/falllink/falllink.js', { cache: 'no-store' });
result.falllink = res.ok ? (await res.text()).length + ' bytes' : null;
link.startBroadcast();
show(result);
