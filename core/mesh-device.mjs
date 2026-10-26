// core/mesh-device.mjs — the device's mesh key, the browser glue for core/mesh.mjs. One Ed25519 key per browser and
// origin, made by WebCrypto with its private half unextractable, kept in IndexedDB: every estate page open on this
// device signs with the same key, and no page can read the private half as bytes. When two pages make a key at the
// same moment, the first one stored wins and the other reads it back, so the device never holds two.
import { sha256 } from './vendor/light/sha256.mjs';
import { hex, verifyBytes } from './identity.mjs';

const DB = 'fall-kit-mesh', STORE = 'keys', KEY = 'device', ED = { name: 'Ed25519' };
const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

function database() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

/** This device's mesh key: { id, raw, slot, sign, verifyBytes }. */
export async function openDevice() {
  const db = await database();
  const get = () => req(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY));
  let pair = await get();
  if (!pair) {
    const made = await crypto.subtle.generateKey(ED, false, ['sign', 'verify']);
    try { await req(db.transaction(STORE, 'readwrite').objectStore(STORE).add(made, KEY)); } catch { /* another page stored one first */ }
    pair = await get();
  }
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { id: hex(raw), raw, slot: sha256(raw)[0], sign: async (b) => new Uint8Array(await crypto.subtle.sign(ED, pair.privateKey, b)), verifyBytes };
}
