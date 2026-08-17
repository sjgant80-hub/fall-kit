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
  assert.equal(FK.version, '2.0.0');
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
  assert.equal(a.default, 'claude-sonnet-4-5');
  assert.ok(a.models.includes('claude-sonnet-4-5'));
  assert.ok(a.models.includes('claude-opus-4-8'));
});
