# Fall Kit · the shared brain, and the Lego socket

**Live: https://sjgant80-hub.github.io/fall-kit/** — the page explains itself, shows the real request the kit
builds, works out what recycling saves your team, and reads all 100 builds' sockets live.

Fall Kit is one small script. Put it in a web page and that page gets an AI helper the person using it controls:
**off** (the default; the page works without AI), a model **inside their own browser** (WebLLM, nothing sent), or
**their own key** to a frontier model, sent from the browser straight to the provider. No server, no account, no
middleman. MIT.

## The shared foundation (core/)

**Live: https://sjgant80-hub.github.io/fall-kit/core/** — the modules every estate node runs (Phase 1 of the estate going
live: nine claims sealed first, the receipt re-runs byte for byte in CI).

**Live: https://sjgant80-hub.github.io/fall-kit/core/phase2/** — Phase 2, LIGHT everywhere: the estate keeps and carries
everything as signed LIGHT, and one mutation-tested edge (`core/edge.mjs`) speaks the outside's formats. Fifteen claims
sealed first over five passes (`core/phase2/claims.json`): 13 held, 2 failed and kept. Re-run it with
`node core/phase2/measure.mjs --check`.

**Live: https://sjgant80-hub.github.io/fall-kit/core/phase3/** — Phase 3, the mesh is live: foundation nodes as separate
processes on thin relays that read no body (`core/relay.mjs`), joined by the founder's roster (`core/roster.mjs`), routing
by answers that check, routing around a dead node or relay, a shared map by CRDT, and shared immunity. Thirteen claims
sealed first (`core/phase3/claims.json`): 11 held, 2 failed and kept (J3, J4: each asker routes on its own evidence).
Run a mesh in your browser on the page, or re-run the whole thing with `node core/phase3/measure.mjs --check`.

## v3.2.0

- **The mesh speaks LIGHT.** Every message on the same-device mesh is a LIGHT packet signed by this device's own
  key (made by WebCrypto, its private half unextractable, kept in this origin's IndexedDB) and checked before it is
  read: the sender, the signature, and a counter per tab, so a changed or replayed message is refused. The LIGHT part
  is one gated module on this origin (`core/mesh.mjs`), loaded only when the mesh is switched on; an old JSON message
  still arrives, marked legacy; on a page served anywhere else the mesh speaks JSON as before. `FallKit.meshStats()`
  counts what it heard. Part of Phase 2 of the estate going live: https://sjgant80-hub.github.io/fall-kit/core/phase2/

## v3.1.1

- **Ask about this page.** The chip's panel answers questions from the page's own words, through the brain the
  person picked, so the chip is useful in every build whether or not the build calls the kit itself.
  `FallKit.askPage(question)` → `{ text, why }`; the page is read once per talk and sent byte-identical, so it recycles.
- **Keys are held in the tab.** Every estate page shares one origin and so one browser storage; a key kept there
  could be read by any of them. A key is now held in tab memory and stored only if the owner ticks *remember my
  keys on this device*. Keys stored by v1/v2 are moved out on the first v3 load. *Forget my keys* clears them all.
  Google's key travels in a header, not the URL.
- **Recycling.** The opening (system prompt) goes first, byte-identical, marked for Anthropic's cache; the other big
  providers cache repeated openings themselves. `FallKit.lastUsage()` reports `{ read, recycled, written, out }`.
  `recycle.mjs` prices a talk and a team's month with and without it at published rates.
- **Conversations.** `FallKit.aiChat(system, history, question)` → `{ text, assistant }`; append both as they are.
- **Claude 5.** Opus 5.5 (default), Sonnet 5.5, Haiku 5.5; answers read from text blocks only (thinking is never
  shown); low effort with room to think; server-side fallback where offered.

## The Lego socket

Five studs every estate build carries, each measured from the build's own files and written to its `kard.json`
(`kard.v1`): **brain** (Fall Kit), **manifest** (the kard itself), **mesh** (same-device, and the build's own
WebRTC across devices), **memory** (the build's own IndexedDB or localStorage) and **proof** (CI workflows and
tests). A build fits when it has every stud.

```bash
node kard-writer.mjs <build-dir> --name <repo> --title "<title>" --retires "<rented tool>" --category "<category>"
node kard-writer.mjs <build-dir> ... --check      # exits 1 if kard.json no longer matches the files
node kard-writer.mjs <build-dir> ... --page docs/index.html   # a site served from a folder: kard.json goes beside its page
```

## Use it

```html
<script src="https://sjgant80-hub.github.io/fall-kit/shim.js" defer></script>
```

or copy it into a page so it works offline: `node porter.mjs [--update] <build-dir>`. Then call
`FallKit.aiComplete(system, question)` or `FallKit.aiChat(system, history, question)`; both return `null` when AI
is off, and your page does its own thing.

## Proof

- `npm test` — `test.mjs` (the kit under Node), `socket.test.mjs`, `recycle.test.mjs`.
- CI also checks this repo's own `kard.json` and runs the mutation witness on `socket.mjs` and `recycle.mjs`:
  every planted bug must be caught.
- The `gate` workflow checks the page: scripts parse, no placeholders, no dead links, no committed keys.
- `node socket-snapshot.mjs` writes `socket-kards.json`: for each build its kard, the commit its site serves, every
  GitHub run on that commit and `verdictOf` them (green only when one succeeded and none failed), and its live status.
  Kardlings vendors it byte for byte to make its gear cards; each run id is a receipt.
- The `socket-watch` workflow clones all 100 builds daily and re-measures each against its own `kard.json`
  (`node socket-watch.mjs [name...]`); a kard that no longer matches its build turns it red, by name.

Design note: [SPEC.md](SPEC.md) · agent notes: [CLAUDE.md](CLAUDE.md) · machine summary: [llms.txt](llms.txt)

## License

MIT · Copyright 2026 AI-Native Solutions · https://ai-nativesolutions.com
