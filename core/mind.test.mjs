import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, MAX_REPLY, OPTIONS, promptOf, chatOf, proposal, keywordsOf, keywordRoute, decide, keywordScore, decideKeywordsFirst, schemaOf } from './mind.mjs';

const R = [['about', 'what this is and what it does'], ['start', 'how to use it, step by step'], ['none', 'small talk or nothing it covers']];

test('the constants', () => {
  assert.deepEqual(ROUTES, ['about', 'start', 'digi', 'defend', 'mesh', 'business', 'none']);
  assert.equal(Object.isFrozen(ROUTES), true);
  assert.equal(MAX_REPLY, 512);
  assert.deepEqual(OPTIONS, { temperature: 0, maxTokens: 24, json: true, seed: 0 });
  assert.equal(Object.isFrozen(OPTIONS), true);
});

test('promptOf and chatOf: the sealed template, exactly', () => {
  assert.equal(promptOf(R), 'You are the front door of a website. Read the visitor\'s message and choose the one route that fits it best.\nRoutes:\n- about: what this is and what it does\n- start: how to use it, step by step\n- none: small talk or nothing it covers\nAnswer with JSON only, exactly like {"route":"about"}.');
  assert.equal(promptOf([['a', 'x'], ['b'], 'c', [1, 'y'], ['d', 2], ['e', 'z']]), 'You are the front door of a website. Read the visitor\'s message and choose the one route that fits it best.\nRoutes:\n- a: x\n- e: z\nAnswer with JSON only, exactly like {"route":"about"}.');
  assert.equal(promptOf(null), 'You are the front door of a website. Read the visitor\'s message and choose the one route that fits it best.\nRoutes:\n\nAnswer with JSON only, exactly like {"route":"about"}.');
  assert.deepEqual(chatOf(R, 'hello'), [{ role: 'system', content: promptOf(R) }, { role: 'user', content: 'hello' }]);
  assert.deepEqual(chatOf(R, 7)[1], { role: 'user', content: '' });
});

test('proposal: a well-formed reply is its route', () => {
  assert.deepEqual(proposal('{"route":"about"}'), { ok: true, route: 'about' });
  assert.deepEqual(proposal('  \n{"route": "mesh"}\n '), { ok: true, route: 'mesh' });
  assert.deepEqual(proposal('{"route":"none","why":"small talk","n":1}'), { ok: true, route: 'none' }, 'other fields are ignored');
  assert.deepEqual(proposal('```json\n{"route":"digi"}\n```'), { ok: true, route: 'digi' });
  assert.deepEqual(proposal('```\n{"route":"digi"}\n```'), { ok: true, route: 'digi' });
  assert.deepEqual(proposal('```json {"route":"digi"} ```'), { ok: true, route: 'digi' });
  assert.deepEqual(proposal('```json\r\n{"route":"start"}\r\n```'), { ok: true, route: 'start' });
  assert.deepEqual(proposal('```{"route":"start"}```'), { ok: true, route: 'start' });
  assert.deepEqual(proposal('{"route":"about","__proto__":{"route":"x"}}'), { ok: true, route: 'about' });
  for (const id of ROUTES) assert.deepEqual(proposal(JSON.stringify({ route: id })), { ok: true, route: id });
});

test('proposal: anything else is no proposal, with its reason', () => {
  assert.deepEqual(proposal(undefined), { ok: false, why: 'no reply' });
  assert.deepEqual(proposal({ route: 'about' }), { ok: false, why: 'no reply' });
  assert.deepEqual(proposal('about'), { ok: false, why: 'not JSON' });
  assert.deepEqual(proposal(''), { ok: false, why: 'not JSON' });
  assert.deepEqual(proposal('{"route":"about"} and more'), { ok: false, why: 'not JSON' });
  assert.deepEqual(proposal('``` ```json\n{"route":"about"}\n``` ```'), { ok: false, why: 'not JSON' }, 'one fence only');
  assert.deepEqual(proposal('```js\n{"route":"about"}\n```'), { ok: false, why: 'not JSON' });
  assert.deepEqual(proposal('["about"]'), { ok: false, why: 'no route' });
  assert.deepEqual(proposal('null'), { ok: false, why: 'no route' });
  assert.deepEqual(proposal('{"Route":"about"}'), { ok: false, why: 'no route' });
  assert.deepEqual(proposal('{"__proto__":{"route":"about"}}'), { ok: false, why: 'no route' });
  assert.deepEqual(proposal('{"route":1}'), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":"About"}'), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":" about"}'), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":"admit"}'), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":"toString"}'), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":["about"]}'), { ok: false, why: 'not one of the routes' });
});

test('proposal: the size bound is bytes, at 512', () => {
  const pad = (n) => '{"route":"about","x":"' + 'a'.repeat(n) + '"}';
  assert.equal(pad(0).length, 24);
  assert.deepEqual(proposal(pad(488)), { ok: true, route: 'about' }, '512 bytes');
  assert.deepEqual(proposal(pad(489)), { ok: false, why: 'longer than 512 bytes' });
  const multi = '{"route":"about","x":"' + 'é'.repeat(244) + '"}';
  assert.equal(multi.length, 268);
  assert.deepEqual(proposal(multi), { ok: true, route: 'about' }, '512 bytes in two-byte characters');
  assert.deepEqual(proposal(multi.replace('"}', 'é"}')), { ok: false, why: 'longer than 512 bytes' });
});

test('proposal: the ids it may name', () => {
  assert.deepEqual(proposal('{"route":"about"}', ['start']), { ok: false, why: 'not one of the routes' });
  assert.deepEqual(proposal('{"route":"start"}', ['start', 7]), { ok: true, route: 'start' });
  assert.deepEqual(proposal('{"route":"x"}', ['x']), { ok: true, route: 'x' });
  assert.deepEqual(proposal('{"route":"digi"}', 'digi'), { ok: true, route: 'digi' }, 'ids that are not a list are the sealed routes');
  assert.deepEqual(proposal('{"route":"7"}', [7]), { ok: false, why: 'not one of the routes' });
});

test('keywordsOf: four or more letters, and in no other route\'s description', () => {
  assert.deepEqual(keywordsOf(R), { about: ['what', 'this', 'does'], start: ['step'], none: ['small', 'talk', 'nothing', 'covers'] });
  assert.deepEqual(keywordsOf([['a', 'Hello WORLD hello, worlds'], ['b', 'world']]), { a: ['hello', 'worlds'], b: [] });
  assert.deepEqual(keywordsOf([['a', 'abc abcd 12345 ab-cdef']]), { a: ['abcd', 'cdef'] });
  assert.deepEqual(keywordsOf([['a', '']]), { a: [] });
  assert.deepEqual(keywordsOf('x'), {});
  assert.deepEqual(keywordsOf([['a', 'shared word'], ['a', 'shared']]), { a: ['shared'] }, 'a repeated id: the last one is kept, and a route is not another route to itself');
});

test('keywordRoute: the most words wins, a tie goes first, none is none', () => {
  const kw = { about: ['what', 'does'], start: ['step', 'start'], none: ['talk'] };
  const ids = ['about', 'start', 'none'];
  assert.equal(keywordRoute('What does it do?', kw, ids), 'about');
  assert.equal(keywordRoute('step by step: how do I start', kw, ids), 'start');
  assert.equal(keywordRoute('what is the first step', kw, ids), 'about', 'a tie goes to the route listed first');
  assert.equal(keywordRoute('what step to start', kw, ids), 'start', 'two words beat one');
  assert.equal(keywordRoute('hello there', kw, ids), 'none');
  assert.equal(keywordRoute('talk to me', kw, ['none', 'about']), 'none');
  assert.equal(keywordRoute('talk talk talk what', kw, ids), 'about', 'a word counts once');
  assert.equal(keywordRoute('anything', { about: [''] }, ids), 'none', 'an empty word is no word');
  assert.equal(keywordRoute('what', { about: [7, 'what'] }, ids), 'about');
  assert.equal(keywordRoute('what', { about: 'what' }, ids), 'none');
  assert.equal(keywordRoute(7, kw, ids), 'none');
  assert.equal(keywordRoute('what', null, ids), 'none');
  assert.equal(keywordRoute('a digi card', { digi: ['digi'] }), 'digi', 'the sealed routes by default');
});

test('decide: the mind when its proposal holds, the keywords when it does not', () => {
  const kw = keywordsOf(R), ids = ['about', 'start', 'none'];
  assert.deepEqual(decide('{"route":"start"}', 'what does it do', kw, ids), { route: 'start', by: 'mind', why: null });
  assert.deepEqual(decide('{"route":"admit"}', 'what does it do', kw, ids), { route: 'about', by: 'keywords', why: 'not one of the routes' });
  assert.deepEqual(decide(null, 'nothing here', kw, ids), { route: 'none', by: 'keywords', why: 'no reply' });
});

test('keywordScore: how many words the best route finds', () => {
  const kw = { about: ['what', 'does'], start: ['step', 'start'], none: ['talk'] }, ids = ['about', 'start', 'none'];
  assert.equal(keywordScore('what does a step do', kw, ids), 2);
  assert.equal(keywordScore('step by step, start', kw, ids), 2);
  assert.equal(keywordScore('hello', kw, ids), 0);
  assert.equal(keywordScore('talk', kw, ids), 1, 'the none route\'s own words count');
  assert.equal(keywordScore('WHAT', kw, ids), 1);
  assert.equal(keywordScore('what', kw, ['start']), 0, 'only the ids given');
  assert.equal(keywordScore('what', { about: [''] }, ids), 0);
  assert.equal(keywordScore('what', { about: [7, 'what'] }, ids), 1);
  assert.equal(keywordScore('what', { about: 'what' }, ids), 0);
  assert.equal(keywordScore(7, kw, ids), 0);
  assert.equal(keywordScore('what', null, ids), 0);
  assert.equal(keywordScore('a digi card', { digi: ['digi', 'card'] }), 2, 'the sealed routes by default');
});

test('decideKeywordsFirst: the keyword rule where it finds a word, the mind where it finds none', () => {
  const kw = { about: ['what'], start: ['step'], none: ['talk'] }, ids = ['about', 'start', 'none'];
  assert.deepEqual(decideKeywordsFirst('{"route":"start"}', 'what is it', kw, ids), { route: 'about', by: 'keywords', why: null }, 'a word found: the mind is not asked');
  assert.deepEqual(decideKeywordsFirst('{"route":"start"}', 'how do I begin', kw, ids), { route: 'start', by: 'mind', why: null });
  assert.deepEqual(decideKeywordsFirst('nonsense', 'how do I begin', kw, ids), { route: 'none', by: 'none', why: 'not JSON' });
  assert.deepEqual(decideKeywordsFirst('{"route":"admit"}', 'how do I begin', kw, ids), { route: 'none', by: 'none', why: 'not one of the routes' });
  assert.deepEqual(decideKeywordsFirst(null, 'small talk', kw, ids), { route: 'none', by: 'keywords', why: null }, 'the none route found by its own word');
  assert.deepEqual(decideKeywordsFirst('{"route":"about"}', 7, kw, ids), { route: 'about', by: 'mind', why: null });
});

test('schemaOf: one field, route, one of the ids', () => {
  assert.deepEqual(schemaOf(['a', 'b']), { type: 'object', properties: { route: { type: 'string', enum: ['a', 'b'] } }, required: ['route'], additionalProperties: false });
  assert.deepEqual(schemaOf().properties.route.enum, ROUTES);
  const ids = ['a'];
  schemaOf(ids).properties.route.enum.push('b');
  assert.deepEqual(ids, ['a'], 'a copy');
  assert.deepEqual(schemaOf(['a', 7]).properties.route.enum, ['a']);
});

test('fuzz: 5,000 garbage replies, never a route outside the list, never a throw', () => {
  let s = 3;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const parts = ['{', '}', '"route"', ':', '"about"', '"admit"', '```', 'json', ' ', '\n', '[', ']', ',', '"', '__proto__', 'null', '1'];
  for (let i = 0; i < 5000; i++) {
    const n = Math.floor(r() * 12);
    let t = '';
    for (let j = 0; j < n; j++) t += parts[Math.floor(r() * parts.length)];
    const d = decide(r() < 0.1 ? [t] : t, t, keywordsOf(R), ['about', 'start', 'none']);
    assert.ok(['about', 'start', 'none'].includes(d.route), t);
  }
});
