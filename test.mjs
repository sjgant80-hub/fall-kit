/*
 * fall-kit · unit tests
 *
 * These exercise the deterministic, environment-free surface of fall-kit.js: the
 * public FallKit API assembled by the module IIFE. fall-kit.js targets the browser
 * (window) but falls back to globalThis when window is absent, so it loads under
 * Node for exactly the paths that touch no DOM / network. Every assertion here was
 * derived by running the real module and observing its output — not from the docs.
 *
 * Run: node test.mjs   (also: npm test)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Side-effect import of the project's own source. The IIFE attaches `FallKit` to
// globalThis when `window` is undefined (the Node case).
import './fall-kit.js';

const FK = globalThis.FallKit;

test('the module attaches its public API to the global', () => {
  assert.ok(FK, 'FallKit should be present on the global after import');
  assert.equal(typeof FK, 'object');
  assert.equal(typeof FK.aiComplete, 'function');
  assert.equal(typeof FK.helpSection, 'function');
});

test('version is a semver string equal to the module constant', () => {
  assert.equal(FK.version, '3.2.0');
  assert.equal(typeof FK.version, 'string');
  assert.match(FK.version, /^\d+\.\d+\.\d+$/);
});

test('tier defaults to T0 (off) when no config is stored', () => {
  // loadConfig() cannot read localStorage under Node, so it returns the empty
  // default and aiTier() must fall back to the documented T0.
  assert.equal(FK.aiTier(), 'T0');
});

test('aiComplete degrades to null at T0 instead of throwing', async () => {
  // Doctrine: "T0 fallback ALWAYS works · aiComplete returns null".
  const r = await FK.aiComplete('you are a test', 'hello', 64);
  assert.equal(r, null);
});

test('image / video / tts / stt all resolve to null without an API key', async () => {
  // No key configured for any modality => each helper must short-circuit to null,
  // never attempt a network call.
  assert.equal(await FK.aiImage('a cat'), null);
  assert.equal(await FK.aiVideo('a cat'), null);
  assert.equal(await FK.aiTTS('hello'), null);
  assert.equal(await FK.aiSTT(new Uint8Array([1, 2, 3])), null);
});

test('meshPost returns false while the mesh is inactive', () => {
  assert.equal(FK.state.mesh.active, false);
  assert.equal(FK.meshPost('ping', { x: 1 }), false);
});

test('meshStats: an inactive mesh has sent and heard nothing, and speaks no LIGHT yet', () => {
  assert.deepEqual(FK.meshStats(), { active: false, light: false, tab: null, sent: 0, admitted: 0, legacy: 0, refused: {} });
  const s = FK.meshStats();
  s.refused.magic = 9;
  assert.deepEqual(FK.meshStats().refused, {}, 'the counts handed out are a copy');
});

test('helpSection returns HTML naming every tier and the mesh channel', () => {
  const html = FK.helpSection();
  assert.equal(typeof html, 'string');
  assert.ok(html.length > 1000, `expected a substantial help block, got ${html.length} chars`);
  for (const needle of ['T0', 'T2', 'T3', 'Fall Kit', 'fall-signal']) {
    assert.ok(html.includes(needle), `help should mention "${needle}"`);
  }
});

test('WebLLM registry is the 1B->70B cascade with a valid default entry', () => {
  const keys = Object.keys(FK.MODELS);
  assert.deepEqual(keys, ['llama-1b', 'llama-3b', 'qwen-7b', 'llama-8b', 'llama-70b']);
  assert.equal(keys.length, 5);
  const def = FK.MODELS['llama-3b'];
  assert.ok(def, 'the documented default model key must exist');
  assert.equal(def.id, 'Llama-3.2-3B-Instruct-q4f16_1-MLC');
  assert.equal(def.size, '~2GB');
  for (const [k, m] of Object.entries(FK.MODELS)) {
    assert.equal(typeof m.id, 'string', `${k}.id`);
    assert.equal(typeof m.size, 'string', `${k}.size`);
    assert.equal(typeof m.label, 'string', `${k}.label`);
  }
});

test('provider registries have the observed shapes and sizes', () => {
  const sizes = {
    TEXT_PROVIDERS: 12,
    IMAGE_PROVIDERS: 8,
    VIDEO_PROVIDERS: 5,
    TTS_PROVIDERS: 4,
    STT_PROVIDERS: 3,
  };
  for (const [name, count] of Object.entries(sizes)) {
    const reg = FK[name];
    assert.equal(typeof reg, 'object', `${name} should be exposed`);
    assert.equal(Object.keys(reg).length, count, `${name} should hold ${count} providers`);
  }
});

test('every provider default is a member of its own models list', () => {
  const registries = {
    TEXT_PROVIDERS: FK.TEXT_PROVIDERS,
    IMAGE_PROVIDERS: FK.IMAGE_PROVIDERS,
    VIDEO_PROVIDERS: FK.VIDEO_PROVIDERS,
    TTS_PROVIDERS: FK.TTS_PROVIDERS,
    STT_PROVIDERS: FK.STT_PROVIDERS,
  };
  for (const [name, reg] of Object.entries(registries)) {
    for (const [pk, p] of Object.entries(reg)) {
      assert.equal(typeof p.label, 'string', `${name}.${pk}.label`);
      assert.equal(typeof p.type, 'string', `${name}.${pk}.type`);
      assert.ok(Array.isArray(p.models) && p.models.length > 0, `${name}.${pk}.models`);
      assert.ok(
        p.models.includes(p.default),
        `${name}.${pk}: default "${p.default}" must be one of its models`,
      );
    }
  }
});

test('anthropic text provider carries the observed model set', () => {
  const a = FK.TEXT_PROVIDERS.anthropic;
  assert.equal(a.type, 'anthropic');
  assert.equal(a.default, 'claude-opus-5-5');
  assert.deepEqual(a.models, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
});

// ── v3 · keys held in the tab · recycling · one way to read every provider ──────────────────────────────────────

test('keys: a stored key is taken out of shared storage unless its owner chose to remember it', () => {
  const old = FK.configFrom({ ai_tier: 'T3', text_provider: 'anthropic', keys: { text: { anthropic: { key: 'k-1', model: 'claude-sonnet-5-5' } }, image: { fal: { key: 'k-2' } } } });
  assert.equal(old.moved, 2);
  assert.equal(old.secrets.text.anthropic, 'k-1'); assert.equal(old.secrets.image.fal, 'k-2');
  assert.equal(old.config.keys, undefined, 'no keys in what is stored');
  assert.equal(old.config.models.text.anthropic, 'claude-sonnet-5-5', 'the model choice is kept');
  assert.deepEqual(FK.storedForm(old.config, old.secrets).keys, undefined);
  assert.ok(!JSON.stringify(FK.storedForm(old.config, old.secrets)).includes('k-1'));
  const kept = FK.configFrom({ remember_keys: true, keys: { text: { openai: { key: 'k-3', model: 'gpt-4.1' } } } });
  assert.equal(kept.moved, 0); assert.equal(kept.secrets.text.openai, 'k-3');
  assert.deepEqual(FK.storedForm(kept.config, kept.secrets).keys.text.openai, { key: 'k-3', model: 'gpt-4.1' });
  const v1 = FK.configFrom({ api_key: 'k-4', api_provider: 'google', api_model: 'gemini-2.5-flash' });
  assert.equal(v1.secrets.text.google, 'k-4'); assert.equal(v1.config.api_key, undefined); assert.equal(v1.moved, 1);
  for (const junk of [null, 5, 'x', [], undefined]) { const r = FK.configFrom(junk); assert.equal(r.moved, 0); assert.deepEqual(r.secrets.text, {}); }
  assert.deepEqual(FK.configFrom({ keys: { text: { a: { key: '' }, b: 'x' } } }).secrets.text, {}, 'an empty or malformed key is no key');
  assert.deepEqual(FK.configFrom({ models: { text: { openai: 'gpt-4.1' } } }).config.models.text, { openai: 'gpt-4.1' }, 'a stored model choice stays');
});

test('requests: the opening first and marked for the cache; room to think; the key in a header, never the address', () => {
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'hello' }] }, { role: 'user', content: 'again' }];
  const a = FK.requestOf('anthropic', { model: 'claude-opus-5-5', key: 'K', system: 'SYS', messages: msgs, maxTokens: 300 });
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(a.body.system, [{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
  assert.equal(a.body.max_tokens, 4000); assert.deepEqual(a.body.output_config, { effort: 'low' });
  assert.equal(a.body.fallbacks, 'default'); assert.equal(a.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(a.body.messages[1].content, msgs[1].content, 'an earlier answer goes back exactly as it came');
  assert.equal(a.headers['x-api-key'], 'K');
  const h = FK.requestOf('anthropic', { model: 'claude-haiku-5-5', key: 'K', system: 'S', messages: msgs, maxTokens: 2000 });
  assert.equal(h.body.fallbacks, undefined, 'Haiku has no server-side fallback'); assert.equal(h.headers['anthropic-beta'], undefined); assert.equal(h.body.max_tokens, 8000);
  const old = FK.requestOf('anthropic', { model: 'claude-3-haiku', key: 'K', system: 'S', messages: msgs, maxTokens: 300 });
  assert.equal(old.body.max_tokens, 300); assert.equal(old.body.output_config, undefined);
  const g = FK.requestOf('google', { model: 'gemini-2.5-flash', key: 'G', system: 'SYS', messages: msgs, maxTokens: 200 });
  assert.ok(!g.url.includes('key='), 'the key is not in the address'); assert.equal(g.headers['x-goog-api-key'], 'G');
  assert.deepEqual(g.body.systemInstruction, { parts: [{ text: 'SYS' }] });
  assert.deepEqual(g.body.contents.map((c) => c.role + ':' + c.parts[0].text), ['user:hi', 'model:hello', 'user:again']);
  const o = FK.requestOf('openai', { model: 'gpt-4.1', key: 'O', system: 'SYS', messages: msgs, maxTokens: 150 });
  assert.equal(o.body.max_completion_tokens, 150); assert.deepEqual(o.body.messages[0], { role: 'system', content: 'SYS' }); assert.deepEqual(o.body.messages[2], { role: 'assistant', content: 'hello' });
  const c = FK.requestOf('openai_compat', { model: 'm', key: 'C', system: 'S', messages: msgs, maxTokens: 0, url: 'https://openrouter.ai/api/v1/chat/completions' });
  assert.equal(c.url, 'https://openrouter.ai/api/v1/chat/completions'); assert.equal(c.body.max_tokens, 600, 'a missing limit is the default 600');
  assert.equal(FK.requestOf('cohere', { model: 'm', key: 'C', system: 'S', messages: msgs }).url, 'https://api.cohere.com/v2/chat');
  assert.ok(FK.requestOf('hf_inference', { model: 'x/y', key: 'H', system: 'S', messages: msgs }).url.includes('/models/x/y/'));
  assert.equal(FK.requestOf('nobody', { model: 'm', key: 'k', system: 'S', messages: msgs }), null);
});

test('replies: the answer words only, null when declined or empty', () => {
  assert.equal(FK.textOf('anthropic', { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: ' Yes. ' }, { type: 'text', text: 'And more.' }] }), 'Yes. \nAnd more.');
  assert.equal(FK.textOf('anthropic', { stop_reason: 'refusal', content: [] }), null);
  assert.equal(FK.textOf('anthropic', { content: [{ type: 'thinking', thinking: 'x' }] }), null, 'thinking alone is no answer');
  assert.equal(FK.textOf('anthropic', { content: 'x' }), null);
  assert.equal(FK.textOf('google', { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }, {}] } }] }), 'ab');
  assert.equal(FK.textOf('google', { candidates: [] }), null);
  assert.equal(FK.textOf('openai', { choices: [{ message: { content: 'ok' } }] }), 'ok');
  assert.equal(FK.textOf('openai_compat', { choices: [{ message: { content: '   ' } }] }), null);
  assert.equal(FK.textOf('cohere', { message: { content: [{ text: 'c' }] } }), 'c');
  for (const j of [null, 5, [], 'x']) assert.equal(FK.textOf('openai', j), null);
});

test('usage: what was read, how much the provider reused, what it cached and wrote', () => {
  assert.deepEqual(FK.usageOf('anthropic', { usage: { input_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 80, output_tokens: 40 } }), { read: 1000, recycled: 900, written: 80, out: 40 });
  assert.deepEqual(FK.usageOf('openai', { usage: { prompt_tokens: 1200, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 1024 } } }), { read: 1200, recycled: 1024, written: 0, out: 30 });
  assert.deepEqual(FK.usageOf('openai_compat', { usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 99 } } }), { read: 10, recycled: 10, written: 0, out: 2 });
  assert.deepEqual(FK.usageOf('google', { usageMetadata: { promptTokenCount: 800, cachedContentTokenCount: 600, candidatesTokenCount: 30, thoughtsTokenCount: 10 } }), { read: 800, recycled: 600, written: 0, out: 40 });
  assert.deepEqual(FK.usageOf('cohere', { usage: { tokens: { input_tokens: 7, output_tokens: 3 } } }), { read: 7, recycled: 0, written: 0, out: 3 });
  for (const j of [null, {}, { usage: 'x' }, { usage: { input_tokens: -5, output_tokens: 1.5 } }]) assert.deepEqual(FK.usageOf('anthropic', j), { read: 0, recycled: 0, written: 0, out: 0 });
});

test('a conversation degrades to null at T0, and nothing has been used', async () => {
  assert.equal(await FK.aiChat('you are a test', [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], 'c', 64), null);
  assert.equal(FK.lastUsage(), null);
});

// ── v3.1 · ask about this page ──────────────────────────────────────────────────────────────────────────────────

test('the page opening: who the helper is, then the page in its own words, the same bytes every time', () => {
  const page = { title: '  FallNote  · notes ', description: 'A notes\n workspace.', text: 'Start here\n\n\n  1.  Open   a note \t\n Save it ' };
  const o = FK.pageOpening(page);
  assert.ok(o.startsWith('You are the helper inside a web page. Answer questions about this page and how to use it'));
  assert.ok(o.endsWith('\n\nPAGE: FallNote · notes\nABOUT: A notes workspace.\nTEXT:\nStart here\n1. Open a note\nSave it'), JSON.stringify(o.slice(-80)));
  assert.equal(FK.pageOpening(page), o, 'the same page gives the same opening, so it can be recycled');
  assert.ok(!FK.pageOpening({ title: 'T', text: 'x' }).includes('ABOUT:'), 'no description, no ABOUT line');
  assert.ok(FK.pageOpening({}).endsWith('PAGE: (no title)\nTEXT:\n'));
  const long = FK.pageOpening({ title: 'x'.repeat(500), description: 'd'.repeat(900), text: 'w'.repeat(20000) });
  assert.ok(long.includes('PAGE: ' + 'x'.repeat(200) + '\n')); assert.ok(long.includes('ABOUT: ' + 'd'.repeat(400) + '\n'));
  assert.ok(long.endsWith('TEXT:\n' + 'w'.repeat(12000)), 'the page text is capped at 12,000 characters');
  for (const junk of [null, 5, 'x', [], { title: 5, description: {}, text: [1] }]) assert.ok(FK.pageOpening(junk).endsWith('PAGE: (no title)\nTEXT:\n'));
});

test('asking about the page with AI off says how to switch it on, and asks nothing', async () => {
  assert.deepEqual(await FK.askPage('How do I use this?'), { text: null, why: 'AI is off. Pick T2 (a model in your browser) or T3 (your own key) below, press Save, then ask.' });
  assert.deepEqual(await FK.askPage('   '), { text: null, why: 'Type a question first.' });
  assert.equal(FK.state.ask.opening, null, 'the page is not read until a question can be answered');
});
