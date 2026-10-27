import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostOf, isEdgeHost, cspOf, cspCheck, inlineScripts, urlsIn, commentsOf, stunMissing, egress } from './egress.mjs';

const EDGES = ['esm.run', 'cdn.jsdelivr.net', '*.hf.co'];
const H = 'h' + 'ttps://';   // built here so this file names no host itself

test('hostOf: the lower-cased host, no port', () => {
  assert.equal(hostOf(H + 'Esm.Run/@x'), 'esm.run');
  assert.equal(hostOf('http://localhost:11434/api'), 'localhost');
  assert.equal(hostOf(H + 'a.b.c'), 'a.b.c');
  assert.equal(hostOf('ftp://a.b'), '');
  assert.equal(hostOf('/relative'), '');
  assert.equal(hostOf(7), '');
});

test('isEdgeHost: exact, or under a wildcard but not the wildcard\'s own host', () => {
  assert.equal(isEdgeHost('esm.run', EDGES), true);
  assert.equal(isEdgeHost('ESM.RUN', EDGES), true);
  assert.equal(isEdgeHost('xesm.run', EDGES), false);
  assert.equal(isEdgeHost('cas-bridge.xethub.hf.co', EDGES), true);
  assert.equal(isEdgeHost('x.hf.co', EDGES), true);
  assert.equal(isEdgeHost('hf.co', EDGES), false);
  assert.equal(isEdgeHost('.hf.co', EDGES), false);
  assert.equal(isEdgeHost('evilhf.co', EDGES), false);
  assert.equal(isEdgeHost('a b', EDGES), false);
  assert.equal(isEdgeHost('esm.run', 'esm.run'), false);
  assert.equal(isEdgeHost('esm.run', [7, 'esm.run']), true);
  assert.equal(isEdgeHost(null, EDGES), false);
});

test('cspOf: the meta policy, directive by directive', () => {
  const html = '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; Script-Src \'self\' ' + H + 'esm.run;  ;img-src data:"></head>';
  assert.deepEqual(cspOf(html), { ok: true, directives: { 'default-src': ["'self'"], 'script-src': ["'self'", H + 'esm.run'], 'img-src': ['data:'] } });
  assert.deepEqual(cspOf('<meta name="x">'), { ok: false, why: 'no policy' });
  assert.deepEqual(cspOf(null), { ok: false, why: 'no policy' });
});

test('cspCheck: only the sealed sources, each where it may be', () => {
  const ok = { 'default-src': ["'self'"], 'script-src': ["'self'", "'wasm-unsafe-eval'", H + 'esm.run'], 'style-src': ["'self'", "'unsafe-inline'"], 'connect-src': [H + '*.hf.co'], 'img-src': ["'self'", 'data:'], 'object-src': ["'none'"] };
  assert.deepEqual(cspCheck(ok, EDGES), { unknown: [], unsafeEval: false });
  assert.deepEqual(cspCheck({ 'style-src': ["'wasm-unsafe-eval'"], 'script-src': ["'unsafe-inline'", 'data:'], 'img-src': ["'unsafe-inline'"] }, EDGES).unknown, ["style-src 'wasm-unsafe-eval'", "script-src 'unsafe-inline'", 'script-src data:', "img-src 'unsafe-inline'"]);
  assert.deepEqual(cspCheck({ 'script-src': ["'unsafe-eval'"] }, EDGES), { unknown: ["script-src 'unsafe-eval'"], unsafeEval: true });
  assert.deepEqual(cspCheck({ 'connect-src': ['http://esm.run', H + 'evil.com', H + 'esm.run/x', '*', H + '*.HF.co'] }, EDGES).unknown, ['connect-src http://esm.run', 'connect-src ' + H + 'evil.com', 'connect-src ' + H + 'esm.run/x', 'connect-src *', 'connect-src ' + H + '*.HF.co']);
  assert.deepEqual(cspCheck({ 'connect-src': [H + 'esm.run'] }, 'esm.run').unknown, ['connect-src ' + H + 'esm.run']);
  assert.deepEqual(cspCheck({ 'connect-src': 'x' }, EDGES), { unknown: [], unsafeEval: false });
  assert.deepEqual(cspCheck(null, EDGES), { unknown: [], unsafeEval: false });
  assert.deepEqual(cspCheck({ toString: ["'self'"] }, EDGES).unknown, []);
});

test('inlineScripts: code written into the page, not a src and not JSON-LD', () => {
  assert.equal(inlineScripts('<script src="a.js"></script><script type="application/ld+json">{"a":1}</script><script>  </script>'), 0);
  assert.equal(inlineScripts('<script>alert(1)</script><SCRIPT type="module">x()</SCRIPT>'), 2);
  assert.equal(inlineScripts('<script type="application/json">{}</script>'), 1);
  assert.equal(inlineScripts(7), 0);
});

test('urlsIn html: loaded, a link, or words', () => {
  const html = '<link rel="canonical" href="' + H + 'site.io/p/"><link rel="stylesheet" href="' + H + 'cdn.io/x.css"><script src="' + H + 'esm.run/y"></script>'
    + '<script type="application/ld+json">{"u":"' + H + 'repo.io/r"}</script><a href="' + H + 'out.io/z">z</a><img src="/local.png"><p>see ' + H + 'text.io/t</p>'
    + '<style>.a{background:url(' + H + 'img.io/i.png)} .b{content:"' + H + 'css.io/w"}</style><form action="' + H + 'post.io/f"></form><a href="#x">x</a><meta name="d" content="go ' + H + 'meta.io">';
  assert.deepEqual(urlsIn(html, 'html'), [
    { url: H + 'site.io/p/', host: 'site.io', where: 'words' },
    { url: H + 'cdn.io/x.css', host: 'cdn.io', where: 'loaded' },
    { url: H + 'esm.run/y', host: 'esm.run', where: 'loaded' },
    { url: H + 'repo.io/r', host: 'repo.io', where: 'words' },
    { url: H + 'out.io/z', host: 'out.io', where: 'link' },
    { url: H + 'text.io/t', host: 'text.io', where: 'words' },
    { url: H + 'img.io/i.png', host: 'img.io', where: 'loaded' },
    { url: H + 'css.io/w', host: 'css.io', where: 'words' },
    { url: H + 'post.io/f', host: 'post.io', where: 'loaded' },
    { url: H + 'meta.io', host: 'meta.io', where: 'words' },
  ]);
  assert.deepEqual(urlsIn('<link rel="alternate" href="' + H + 'alt.io">', 'html'), [{ url: H + 'alt.io', host: 'alt.io', where: 'words' }]);
  assert.deepEqual(urlsIn('<link href="' + H + 'x.io/m.json" rel="manifest">', 'html'), [{ url: H + 'x.io/m.json', host: 'x.io', where: 'loaded' }]);
  assert.deepEqual(urlsIn('<video poster="' + H + 'p.io/1.png" data="' + H + 'd.io">', 'html').map((u) => u.where), ['loaded', 'loaded']);
  assert.deepEqual(urlsIn('<A HREF="' + H + 'up.io">', 'html'), [{ url: H + 'up.io', host: 'up.io', where: 'link' }]);
  assert.deepEqual(urlsIn('<img src="HTTPS://Big.IO/x">', 'html'), [{ url: 'HTTPS://Big.IO/x', host: 'big.io', where: 'loaded' }], 'a scheme in capitals is still a URL');
  assert.deepEqual(urlsIn('<div style="background:url(' + H + 'sa.io/i.png)">', 'html'), [{ url: H + 'sa.io/i.png', host: 'sa.io', where: 'loaded' }], 'url() in a style attribute is loaded too');
  assert.deepEqual(urlsIn('<a href="' + H + '">x</a><a href="mailto:a@b">m</a>', 'html'), [], 'no host, no URL');
  assert.deepEqual(urlsIn('<p>HTTP://Shout.IO and url ' + H + 'u.io</p>', 'html').map((u) => u.host + ' ' + u.where), ['shout.io words', 'u.io words']);
  assert.deepEqual(urlsIn(null, 'html'), []);
});

test('commentsOf: comments, stepping over strings and regular expressions', () => {
  assert.deepEqual(commentsOf('a // c\nb /* d */ e'), [[2, 6], [9, 16]]);
  assert.deepEqual(commentsOf('x = "// not" + \'/* no */\' + `//`;'), []);
  assert.deepEqual(commentsOf('x = /\\/\\//.test(y); // yes'), [[20, 26]]);
  assert.deepEqual(commentsOf('const r = /["\']/; // q'), [[18, 22]]);
  assert.deepEqual(commentsOf('if (a) /[/]/.test(b); // r'), [[22, 26]], 'a slash inside a character class');
  assert.deepEqual(commentsOf('a = b / c; // d'), [[11, 15]], 'division is not a regular expression');
  assert.deepEqual(commentsOf('"a\\"b" // c'), [[7, 11]]);
  assert.deepEqual(commentsOf('/* never closed'), [[0, 15]]);
  assert.deepEqual(commentsOf('// no newline'), [[0, 13]]);
  assert.deepEqual(commentsOf('x = /abc'), []);
  assert.deepEqual(commentsOf("const r = /\\/'/; // q"), [[17, 21]], 'an escaped slash inside a regular expression');
  assert.deepEqual(commentsOf('r = /a[\\]/]b/; // s'), [[15, 19]], 'an escaped bracket inside a class');
  assert.deepEqual(commentsOf('x = /a\nb // c'), [[9, 13]], 'a regular expression ends at a line break');
  assert.deepEqual(commentsOf("x = /[/]'/; // c"), [[12, 16]], 'a slash inside a class does not end it, so the quote after is not a string');
  assert.deepEqual(commentsOf("x = /[a]/'; // c'"), [], 'after the class closes, the next slash ends it');
  assert.deepEqual(commentsOf(5), []);
});

test('urlsIn js: code is loaded, a comment is words', () => {
  const js = "// see " + H + "doc.io\nimport x from '" + H + "esm.run/lib';\n/* " + H + "blk.io */ fetch(\"" + H + "api.io/v\")\nconst r = /x/; // " + H + "c.io";
  assert.deepEqual(urlsIn(js, 'js'), [
    { url: H + 'doc.io', host: 'doc.io', where: 'words' },
    { url: H + 'esm.run/lib', host: 'esm.run', where: 'loaded' },
    { url: H + 'blk.io', host: 'blk.io', where: 'words' },
    { url: H + 'api.io/v', host: 'api.io', where: 'loaded' },
    { url: H + 'c.io', host: 'c.io', where: 'words' },
  ]);
  assert.deepEqual(urlsIn('x = "http://localhost:11434"', 'js'), [{ url: 'http://localhost:11434', host: 'localhost', where: 'loaded' }]);
  assert.deepEqual(urlsIn('/* c */' + H + 'right.io', 'js'), [{ url: H + 'right.io', host: 'right.io', where: 'loaded' }], 'just after a comment is code');
  assert.deepEqual(urlsIn('x = 1; //' + H + 'in.io', 'js'), [{ url: H + 'in.io', host: 'in.io', where: 'words' }]);
});

test('stunMissing: every FallLink is given an empty STUN list', () => {
  assert.equal(stunMissing('new FallLink({ ownId: x, stunServers: [] })'), false);
  assert.equal(stunMissing('new FallLink({ ownId: x, stunServers: [ ] })'), false);
  assert.equal(stunMissing('new FallLink({ ownId: x })'), true);
  assert.equal(stunMissing('new FallLink({ ownId: f(x), stunServers: [] }); new FallLink({})'), true, 'the second has none');
  assert.equal(stunMissing('new FallLink({ ownId: x, stunServers: ["stun:x"] })'), true);
  assert.equal(stunMissing('new FallLink({ ownId: x }); const stunServers = []'), true, 'the list must be in the call');
  assert.equal(stunMissing('new  FallLink ( { stunServers:[] } )'), false);
  assert.equal(stunMissing('no link here'), false);
  assert.equal(stunMissing('new FallLink({ ownId: x }); f({ stunServers: [] })'), true, 'a list after the call is not in it');
  assert.equal(stunMissing('new FallLink({ ownId: g(h(x)) }); f({ stunServers: [] })'), true, 'nested calls close inside it');
  assert.equal(stunMissing('new FallLink({ a: (1), stunServers: [] })'), false);
  assert.equal(stunMissing(null), false);
  assert.equal(stunMissing('new FallLink({ stunServers: [] '), false, 'an unclosed call is read to the end');
});

test('egress: the facts for a set of files', () => {
  const page = { path: 'p/index.html', text: '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' ' + H + 'esm.run"><a href="' + H + 'out.io">x</a><a href="' + H + 'me.io/k">k</a><script type="module" src="./page.mjs"></script>' };
  const wake = { path: 'p/wake.mjs', text: "import('" + H + "esm.run/lib')" };
  const bad = { path: 'p/bad.mjs', text: "fetch('" + H + "esm.run/x'); fetch('" + H + "evil.io'); new FallLink({})" };
  const self = { path: 'p/self.mjs', text: "fetch('" + H + "me.io/a') // " + H + "doc.io" };
  const f = egress([page, wake, bad, self, null, { path: 7 }], { selfHost: 'me.io', edges: EDGES, wake: 'p/wake.mjs', page: 'p/index.html' });
  assert.equal(f.files, 4);
  assert.deepEqual(f.policy, { 'default-src': ["'self'"], 'script-src': ["'self'", H + 'esm.run'] });
  assert.deepEqual(f.unknownSources, []);
  assert.equal(f.unsafeEval, false);
  assert.equal(f.inlineScripts, 0);
  assert.equal(f.loaded, 3);
  assert.deepEqual(f.loadedOutside, ['p/bad.mjs ' + H + 'esm.run/x', 'p/bad.mjs ' + H + 'evil.io'], 'an edge outside the wake module, and a host that is no edge');
  assert.deepEqual(f.stunMissing, ['p/bad.mjs']);
  assert.deepEqual(f.urls.map((u) => u.file + ' ' + u.host + ' ' + u.where), ['p/index.html esm.run words', 'p/index.html out.io link', 'p/wake.mjs esm.run loaded', 'p/bad.mjs esm.run loaded', 'p/bad.mjs evil.io loaded', 'p/self.mjs doc.io words']);
  const none = egress([wake], { edges: EDGES, wake: 'p/wake.mjs', page: 'p/index.html' });
  assert.deepEqual([none.policy, none.unknownSources, none.inlineScripts], [null, ['no policy'], 0]);
  assert.deepEqual(egress(null, null), { files: 0, policy: null, unknownSources: ['no policy'], unsafeEval: false, inlineScripts: 0, urls: [], loaded: 0, loadedOutside: [], stunMissing: [] });
  const evalPage = egress([{ path: 'i.html', text: '<meta http-equiv="Content-Security-Policy" content="script-src \'unsafe-eval\'"><script>x()</script>' }], { page: 'i.html' });
  assert.deepEqual([evalPage.unsafeEval, evalPage.inlineScripts], [true, 1]);
  assert.equal(egress([{ path: 'a.HTM', text: '<a href="' + H + 'x.io">' }], {}).urls[0].where, 'link', '.htm is HTML');
  assert.deepEqual(egress([{ path: 'a.mjs', text: "fetch('" + H + "x.io')" }], null).loadedOutside, ['a.mjs ' + H + 'x.io'], 'no options: no self host, no edges');
  assert.deepEqual(egress([{ path: 'a.mjs', text: "fetch('" + H + "x.io')" }], 'opts').loadedOutside, ['a.mjs ' + H + 'x.io']);
});
