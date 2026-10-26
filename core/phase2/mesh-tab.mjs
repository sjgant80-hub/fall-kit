// core/phase2/mesh-tab.mjs — (named -tab, not -test: node --test would run it as a Node test) pass 4's claim B1, measured in two real pages on one device. A listens through Fall Kit's
// mesh and counts; B speaks through the kit, then posts on the same channel what no page should accept, and old JSON.
import { speak } from '../mesh.mjs';
import { openDevice } from '../mesh-device.mjs';
import { makeIdentity } from '../identity.mjs';

const role = new URLSearchParams(location.search).get('role') || 'a';
const out = document.getElementById('out');
const show = (x) => { out.textContent = JSON.stringify(x, null, 1); };
const FK = window.FallKit;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (role === 'a') {
  const heard = [];
  await FK.meshStart({ seedName: 'mesh-test-a', onMessage: (m) => heard.push(m) });
  const report = () => {
    const s = FK.meshStats();
    window.result = {
      role: 'a', at: new Date().toISOString(), version: FK.version, light: s.light,
      admitted: s.admitted, legacy: s.legacy, refused: s.refused,
      heardProbes: heard.filter((m) => m.kind === 'probe' && m.light === true).length,
      heardHello: heard.filter((m) => m.kind === 'fall-kit:hello' && m.light === true).length,
      heardReplayFirsts: heard.filter((m) => m.kind === 'probe-replay' && m.light === true).length,
      legacyMarked: heard.filter((m) => m.kind === 'probe-legacy' && m.legacy === true).length,
      wronglyAdmitted: heard.filter((m) => m.kind === 'probe-forged' || m.kind === 'probe-stranger' || m.kind === 'probe-tampered').length,
    };
    show(window.result);
  };
  setInterval(report, 500);
  report();
} else {
  await FK.meshStart({ seedName: 'mesh-test-b' });
  await wait(400);
  for (let i = 0; i < 20; i++) { FK.meshPost('probe', { i }); await wait(20); }
  const bc = new BroadcastChannel('fall-signal');
  const dev = await openDevice();
  let other = await makeIdentity();
  while (other.slot === dev.slot) other = await makeIdentity();
  const tabs = crypto.getRandomValues(new Uint32Array(4));
  const posted = { forged: 0, stranger: 0, tampered: 0, replayed: 0, legacy: 0 };
  for (let k = 1; k <= 10; k++) {
    const f = await speak({ kind: 'probe-forged', k }, { slot: dev.slot, tab: tabs[0], seq: k, sign: other.sign });
    bc.postMessage(f.bytes); posted.forged++;
    const s = await speak({ kind: 'probe-stranger', k }, { slot: other.slot, tab: tabs[1], seq: k, sign: other.sign });
    bc.postMessage(s.bytes); posted.stranger++;
    const t = await speak({ kind: 'probe-tampered', k }, { slot: dev.slot, tab: tabs[2], seq: k, sign: dev.sign });
    const c = t.bytes.slice(); c[24] ^= 1;
    bc.postMessage(c); posted.tampered++;
    const r = await speak({ kind: 'probe-replay', k }, { slot: dev.slot, tab: tabs[3], seq: k, sign: dev.sign });
    bc.postMessage(r.bytes); await wait(10); bc.postMessage(r.bytes); posted.replayed++;
    bc.postMessage({ kind: 'probe-legacy', k, peerId: 'old-page#' + k, ts: Date.now() }); posted.legacy++;
    await wait(20);
  }
  window.result = { role: 'b', version: FK.version, light: FK.meshStats().light, sent: FK.meshStats().sent, posted };
  show(window.result);
}
