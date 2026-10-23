# fall-kit — design note

`fall-kit` is a single-file, dependency-free JavaScript module that adds an optional
AI cascade to any sovereign single-file browser tool ("seed") in the AI-Native
Solutions estate. It is written to be inlined verbatim into a seed's `index.html`
(see `porter.mjs`) or loaded lazily from one host (see `shim.js`). This document
records what the module is meant to do so the behaviour can be checked against intent.

## Design goals

1. **Zero cost when off.** A seed must work fully with no AI, no downloads, and no
   network calls. AI is strictly additive.
2. **Sovereignty preserved.** No build step, no bundler, no runtime dependency. The
   module is one IIFE that attaches a single global, `FallKit`.
3. **Bring-your-own everything.** When the user opts in, keys are held in the tab's
   memory and requests go directly to the chosen provider — never proxied. A key is
   written to `localStorage` only when the owner ticks "remember my keys on this
   device": every estate page is served from one origin (`sjgant80-hub.github.io`)
   and so shares one storage, which any of those pages could read. A key stored by
   v1/v2 is moved out of storage on the first v3 load (`configFrom` / `storedForm`).

## The tier model

The cascade has three user-selectable tiers, stored in `config.ai_tier`:

- **T0 — off (default).** No model, no key, no traffic. Every universal helper
  resolves to `null` so the caller degrades gracefully.
- **T2 — WebLLM in-browser.** A model from the local registry is lazy-loaded on
  explicit user action; weights download once and then run offline.
- **T3 — BYOK.** The user configures a provider and key per modality; the module
  formats the provider-specific request and calls the provider's endpoint directly.

The active tier is reported through `aiTier()`, which returns `T0` until a config
selects otherwise. On a plain runtime with no stored config, that default holds.

## The universal helpers

Five modality entrypoints present one shape to callers regardless of provider:

| helper | returns on success | returns when unavailable |
|---|---|---|
| `aiComplete(system, user, maxTokens)` | text string | `null` |
| `aiChat(system, history, user, maxTokens)` | `{ text, assistant }` | `null` |
| `aiImage(prompt, opts)` | `{ url }` | `null` |
| `aiVideo(prompt, opts)` | `{ url }` or `{ id }` | `null` |
| `aiTTS(text, opts)` | `{ url, blob }` | `null` |
| `aiSTT(blob, opts)` | `{ text }` | `null` |

"Unavailable" means the active tier cannot serve the request — T0, or a T3 modality
with no key set. The contract is that these helpers **return `null` rather than
throw** in the unavailable case, so a seed can always call them unconditionally and
branch on the result. This is the single most important invariant in the module.

## One request shape, recycling, and the receipt (v3)

Every text call goes through `requestOf(type, { model, key, system, messages, maxTokens, url })`,
which builds the provider's request, and `textOf(type, response)`, which reads back the
words of the answer only (an Anthropic reply can open with a thinking block; that is
never shown). The key travels in a header for every provider, Google's included
(`x-goog-api-key`), never in the URL.

- **Recycling.** The system prompt (the opening) is sent first and byte-identical each
  call. For Anthropic it is marked `cache_control: ephemeral`, so it is written to the
  cache once and read back at a fraction of the price; OpenAI, Google and OpenRouter
  cache repeated prefixes themselves. `aiChat` returns the assistant turn exactly as
  it came, so the caller's history only grows and the cached prefix stays valid.
- **Anthropic specifics.** Models from the Claude 5 family get `output_config.effort: low`,
  `max_tokens` with headroom for thinking, and (except Haiku) server-side fallback
  (`fallbacks: 'default'` with the `server-side-fallback-2026-07-01` beta header).
- **The receipt.** `usageOf(type, response)` reads `{ read, recycled, written, out }` from
  each provider's usage block; `lastUsage()` returns it for the last call. `recycle.mjs`
  prices a talk and a team's month with and without recycling at published rates.

## The Lego socket (`socket.mjs`, `kard.v1`)

Five studs every estate build carries, each measured from the build's own files:
**brain** (fall-kit inlined between its markers, with its version, or loaded by the shim),
**manifest** (the build's `kard.json`), **mesh** (same-device BroadcastChannel; WebRTC
across devices), **memory** (IndexedDB or localStorage) and **proof** (workflows under
`.github/workflows`, and test files). `studsOf({ html, files })` measures them;
`kardOf(build, studs)` makes the kard; `checkKard(x)` checks any `kard.json` field by
field and names the studs it lacks. A build *fits* exactly when every stud is there.
`kard-writer.mjs` writes a build's `kard.json` from its files; `--check` exits 1 when
the file no longer matches what the files show. `socket-builds.json` lists the 100
builds that carry the socket; the live page reads each one's `kard.json` and checks it.

## The provider registries

Each modality owns a frozen registry object keyed by provider slug. Every entry
declares at minimum: a human `label`, a request `type`, a `models` array, and a
`default` model. The `default` is always one of the entries in that provider's own
`models` array — a self-consistency invariant the test suite pins for every provider
across all five registries. `type` selects the request-formatting branch (for
example `anthropic`, `openai`, `openai_compat`, `google`), which keeps a dozen
text providers, and the image/video/audio providers, on shared code paths rather
than a bespoke function each.

## The cross-seed mesh

`meshStart` / `meshPost` implement same-device discovery over a `BroadcastChannel`
(`fall-signal`) so estate seeds open in different tabs can find one another. `meshPost`
returns `false` when the mesh has not been started, so a caller can post
unconditionally without first checking state.

## What is deterministically testable

Most of the module is UI (settings modal, header chip, toasts) and needs a DOM. The
parts that are pure and environment-free — the tier default, the null-degrade
contract of the five helpers, the mesh's inactive-post guard, the help text, and the
shape/consistency of the model and provider registries, the key move, every request
shape, reply and usage reader — are covered by `test.mjs`, which loads `fall-kit.js`
under Node and asserts against its real output. `socket.mjs` and `recycle.mjs` are
pure kernels with their own tests (`socket.test.mjs`, `recycle.test.mjs`), and CI runs
the mutation witness on both: every planted bug must be caught.

## Non-goals

- Not a proxy. The module never sees or stores a key server-side; there is no server.
- Not a scheduler or agent runtime. It formats one request per call and returns.
- Not a polyfill host. If `BroadcastChannel` or WebLLM is unavailable, the affected
  feature is skipped, not shimmed.
