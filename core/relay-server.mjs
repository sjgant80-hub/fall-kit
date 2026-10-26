#!/usr/bin/env node
// core/relay-server.mjs — a relay of the mesh as a running process (glue around core/relay.mjs, which holds the law).
//
//   node core/relay-server.mjs <port> [--repeat 2] [--host <address>]
//
// Listens on 127.0.0.1:<port> for nodes over TCP, or on the address given: --host 0.0.0.0 lets nodes on another device
// on your network reach it (a relay reads no body, so it can carry nothing a node's door would admit, but anyone who
// can reach it can use it to carry bytes: open it only on a network you trust). Each connection is cut into frames by the relay's reader and handed
// to the relay; what the relay says to deliver is written to the connection it names. A stream that is not frames is
// cut off. On stdin, the line "stats" prints the relay's counts as one JSON line; "quit" stops it. It reads no body:
// the law it runs imports nothing at all.
import { createServer } from 'node:net';
import { createRelay, createReader } from './relay.mjs';

const port = Number(process.argv[2]);
const repeat = process.argv.includes('--repeat') ? Number(process.argv[process.argv.indexOf('--repeat') + 1]) : 1;
const host = process.argv.includes('--host') ? String(process.argv[process.argv.indexOf('--host') + 1]) : '127.0.0.1';
const relay = createRelay({ repeat });
const socks = new Map();
let next = 0;
const say = (x) => process.stdout.write(JSON.stringify(x) + '\n');

const server = createServer((sock) => {
  const conn = 'c' + (++next), reader = createReader();
  socks.set(conn, sock);
  relay.open(conn);
  sock.on('data', (chunk) => {
    const r = reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    if (!r.ok) { sock.destroy(); return; }
    for (const f of r.frames) {
      for (const out of relay.take(conn, f, Date.now())) {
        const s = socks.get(out.conn);
        if (s && !s.destroyed) s.write(out.bytes);
      }
    }
  });
  const gone = () => { relay.close(conn); socks.delete(conn); };
  sock.on('close', gone);
  sock.on('error', () => {});
});
server.listen(port, host, () => say({ ready: true, port, host }));
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line === 'stats') say({ stats: relay.stats() });
    if (line === 'quit') { server.close(); for (const s of socks.values()) s.destroy(); process.exit(0); }
  }
});
