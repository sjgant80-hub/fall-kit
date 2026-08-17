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
3. **Bring-your-own everything.** When the user opts in, keys live in their browser
   (`localStorage`) and requests go directly to the chosen provider — never proxied.

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
| `aiImage(prompt, opts)` | `{ url }` | `null` |
| `aiVideo(prompt, opts)` | `{ url }` or `{ id }` | `null` |
| `aiTTS(text, opts)` | `{ url, blob }` | `null` |
| `aiSTT(blob, opts)` | `{ text }` | `null` |

"Unavailable" means the active tier cannot serve the request — T0, or a T3 modality
with no key set. The contract is that these helpers **return `null` rather than
throw** in the unavailable case, so a seed can always call them unconditionally and
branch on the result. This is the single most important invariant in the module.

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
shape/consistency of the model and provider registries — are covered by `test.mjs`,
which loads `fall-kit.js` under Node and asserts against its real output.

## Non-goals

- Not a proxy. The module never sees or stores a key server-side; there is no server.
- Not a scheduler or agent runtime. It formats one request per call and returns.
- Not a polyfill host. If `BroadcastChannel` or WebLLM is unavailable, the affected
  feature is skipped, not shimmed.
