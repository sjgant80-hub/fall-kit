# CLAUDE.md — working notes for agents

Guidance for an AI agent (or human) making changes in this repository.

## What this repo is

`fall-kit` is a single-file, zero-dependency browser module that adds an optional
AI cascade (T0 off / T2 WebLLM / T3 BYOK) to sovereign single-file tools. The whole
module is one IIFE in `fall-kit.js` that attaches a `FallKit` global. `shim.js`
loads it lazily; `porter.mjs` inlines it into a seed's `index.html`.

## How to run and verify

- `npm test` — runs `node test.mjs`, the unit suite.
- The suite loads `fall-kit.js` under Node and asserts against the environment-free
  surface (tier default, the null-degrade contract, registry shape/consistency, the
  mesh inactive-post guard, and the help text).

## Ground rules for changes

- **Keep it single-file and dependency-free.** No bundler, no runtime dependencies,
  no build step. The module must remain inlineable verbatim into an `index.html`.
- **Preserve the null-degrade contract.** `aiComplete`, `aiImage`, `aiVideo`,
  `aiTTS`, and `aiSTT` must return `null` (never throw) when the active tier cannot
  serve the request. Tests pin this; do not weaken it.
- **Preserve the registry invariant.** Every provider's `default` must be one of the
  entries in its own `models` array. If you add or edit a provider, update both.
- **Never proxy or log keys.** Keys stay in `localStorage` and go directly to the
  provider. There is no server component and there must not be one.
- **The module targets the browser** but must still load under Node for the pure
  paths — it falls back to `globalThis` when `window` is undefined. Do not add
  top-level DOM or network access that would break that load.

## When adding behaviour

Add a focused test in `test.mjs` derived from the real output of the code, extend
the design note in `SPEC.md`, and keep the public API surface on `FallKit`
explicit at the bottom of `fall-kit.js`.
