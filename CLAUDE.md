# CLAUDE.md — working notes for agents

Guidance for an AI agent (or human) making changes in this repository.

## What this repo is

`fall-kit` is a single-file, zero-dependency browser module that adds an optional
AI cascade (T0 off / T2 WebLLM / T3 BYOK) to sovereign single-file tools. The whole
module is one IIFE in `fall-kit.js` that attaches a `FallKit` global. `shim.js`
loads it lazily; `porter.mjs` inlines it into a seed's `index.html`.

It is also the home of the estate's Lego socket: `socket.mjs` (the five studs and the
`kard.v1` checker), `kard-writer.mjs` (writes a build's `kard.json` from its files),
`recycle.mjs` (the recycling saving at published prices) and `socket-builds.json`
(the 100 builds that carry the socket).

## How to run and verify

- `npm test` — `node --test`: `test.mjs` (the kit under Node), `socket.test.mjs`,
  `recycle.test.mjs`.
- Mutation witness on the pure kernels (CI runs it):
  `git clone --depth 1 --branch v0.2 https://github.com/sjgant80-hub/witness .witness`, then
  `node .witness/witness.mjs mutate socket.mjs --cap 400 --test node --test socket.test.mjs`
  (and the same for `recycle.mjs`). Both must be clean; kill a survivor with a test, or
  restructure an equivalent mutant away. Never baseline one.

## Ground rules for changes

- **Keep it single-file and dependency-free.** No bundler, no runtime dependencies,
  no build step. The module must remain inlineable verbatim into an `index.html`.
- **Preserve the null-degrade contract.** `aiComplete`, `aiChat`, `aiImage`, `aiVideo`,
  `aiTTS`, and `aiSTT` must return `null` (never throw) when the active tier cannot
  serve the request. Tests pin this; do not weaken it.
- **Preserve the registry invariant.** Every provider's `default` must be one of the
  entries in its own `models` array. If you add or edit a provider, update both.
- **Keys are held in the tab.** Never proxy or log a key. A key goes to `localStorage`
  only when the owner ticks "remember my keys on this device" (every estate page shares
  one origin, so stored keys are readable by all of them). Keys travel in headers, never URLs.
- **Recycling.** Keep the system prompt first and byte-identical per call; never edit a
  conversation's earlier turns (`aiChat` returns the assistant turn to append as-is).
- **The module targets the browser** but must still load under Node for the pure
  paths — it falls back to `globalThis` when `window` is undefined. Do not add
  top-level DOM or network access that would break that load.
- **One copy per page.** A page that inlines the kit must not also load `fall-kit.js`:
  keys live in each copy's memory, so two copies do not see each other's keys.
- **Version.** Bump `FALL_KIT_VERSION`, the banner line `Fall Kit · vX.Y.Z` (socket.mjs
  reads it) and `package.json` together.

## When adding behaviour

Add a focused test in `test.mjs` derived from the real output of the code, extend
the design note in `SPEC.md`, and keep the public API surface on `FallKit`
explicit at the bottom of `fall-kit.js`. After a commit, rewrite this repo's own
`kard.json` (`node kard-writer.mjs . --name fall-kit …`) so it matches the files.
