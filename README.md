# Fall Kit · v1.0.0

> One cascade. Every seed. Same level.

A drop-in JS module that gives every estate seed the same AI cascade + P2P mesh, so any tool can run at any model size users want — 1B Llama on a phone through to 70B on a serious GPU, plus BYOK frontier — without each seed reinventing the integration.

**Live demo + docs:** https://sjgant80-hub.github.io/fall-kit/
**Source:** https://github.com/sjgant80-hub/fall-kit
**Estate:** https://www.ai-nativesolutions.com

## The 3 tiers

| Tier | What you get | Where the work happens |
|---|---|---|
| **T0** · off (default) | Seed works fully without AI | Nothing downloads · zero API calls |
| **T2** · WebLLM | In-browser LLM. Pick: **1B** (700MB) · **3B** (2GB, default) · **7B** (5GB) · **8B** (5GB) · **70B** (40GB, frontier) | 100% in your browser · runs offline forever after first load |
| **T3** · BYOK | Anthropic (Sonnet 4.5 / Opus 4.7 / Haiku 4.5) · OpenAI (GPT-4o / 4o-mini / o1-mini) · Google Gemini (1.5 Pro / Flash / 2.0 Flash-exp) | Direct fetch to provider · key stored only in your browser · never proxied |

## Embed in your seed

### Option 1 — inline (recommended, preserves single-HTML sovereignty)
Copy the contents of `fall-kit.js` directly inside a `<script>` tag in your HTML. ~16 KB.

### Option 2 — reference (DRY, but adds a runtime CDN dep)
```html
<script src="https://sjgant80-hub.github.io/fall-kit/fall-kit.js"></script>
<script>
  FallKit.init({
    seedName: 'my-seed',
    chipAnchor: 'header .actions'  // CSS selector for where the AI chip goes
  });

  // Use anywhere · degrades gracefully at T0
  const draft = await FallKit.aiComplete(
    'You are a tight technical writer.',
    'Summarise: ' + source,
    200
  );
  if (draft) showDraft(draft);
  else /* T0 fallback */;
</script>
```

## Public API

| Method | Returns | What |
|---|---|---|
| `FallKit.init({seedName, chipAnchor})` | `{version}` | Installs CSS, mounts AI chip |
| `FallKit.aiComplete(sys, msg, maxTokens)` | `string\|null` | Universal entry. T0 → null. Caller handles null. |
| `FallKit.loadWebLLM(modelKey?)` | `Promise` | Lazy-loads WebLLM with chosen model |
| `FallKit.openSettings()` | void | Opens the cascade settings modal |
| `FallKit.meshStart({seedName, onMessage})` | void | Activates BroadcastChannel mesh on `fall-signal` |
| `FallKit.meshPost(kind, payload)` | bool | Broadcasts to other seeds on the channel |
| `FallKit.helpSection()` | `string` (HTML) | Returns standard help-section HTML for your Help tab |
| `FallKit.MODELS` | object | Available WebLLM models registry |
| `FallKit.PROVIDERS` | object | T3 BYOK providers registry |

## Sovereignty contract

- **T0 must always work** — every seed's core feature works without AI. `aiComplete` returns `null` and callers fall back.
- **API keys never proxied** — direct user-browser-to-provider only. Key stored in `localStorage.fall-kit.config`. Never logged, never sent to us.
- **Lazy-loaded WebLLM** — model weights download only on user opt-in.
- **BroadcastChannel mesh** on `fall-signal` — canonical channel name across all estate seeds.

## Estate-first canonical references

This kit is itself a port of patterns already proven in the estate:
- **WebLLM cascade** from [`botler`](https://github.com/sjgant80-hub/botler) (see its `CLAUDE.md` for the build standard)
- **WebRTC mesh** channel + STUN from [`fallnet`](https://github.com/sjgant80-hub/fallnet)
- **Konomi seal** `◊·κ=1` — consistent across all seeds

## Consumer seeds (using the kit)

| Seed | Version | Status |
|---|---|---|
| offgridcommunitiessystem | v1.2 | inlined manually 2026-06-22 (pre-kit, same architecture) — kit-port queued |
| fallnote | v2 | kit-port queued |
| fallrecall | v1 | kit-port queued |
| fallseed-creator-os | v2 | kit-port queued |
| fallseed-agents | v2 | kit-port queued |
| fallseed-village | v1 | kit-port queued |
| /talk.html (Lia) | v1 | kit-port queued |

## License

MIT. Fork freely.

## Built by

Simon Gant · sjgant80@gmail.com · part of the AI Native Solutions estate. ◊·κ=1.
