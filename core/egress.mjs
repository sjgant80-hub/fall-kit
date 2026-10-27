// ════════════════════════════════════════════════════════════════
// core/egress.mjs — what a living website may call. Organ 12 of the shared foundation (Phase 5: claim Q1 in
// core/phase5/claims.json). A page that is local-first must be able to show it, from its own files, before any tab
// runs it:
//
//   cspOf(html)            → { ok, directives: { name: [sources] } } | { ok: false, why }: the page's own
//                            Content-Security-Policy, read from its meta tag
//   cspCheck(directives, edges)
//                          → { unknown: ['directive source'], unsafeEval }: every source must be 'self', 'none', a
//                            sealed edge (https://host, or https://*.host), 'wasm-unsafe-eval' in script-src only,
//                            'unsafe-inline' in style-src only, or data: in img-src only
//   inlineScripts(html)    → how many <script> tags run code written into the page (JSON-LD data blocks do not)
//   urlsIn(text, type)     → [{ url, host, where }]: every http(s) URL in an HTML page or a JavaScript module, sorted by
//                            where it sits: 'loaded' (an HTML src, a stylesheet or other loaded link, CSS url(), or a
//                            URL in a module's code), 'link' (an <a href> a visitor follows) or 'words' (a comment, a
//                            meta tag's words, JSON-LD, the page's text, a canonical link)
//   stunMissing(js)        → true when a module makes a FallLink without an empty STUN list: a policy cannot stop
//                            WebRTC from asking a STUN server where this machine is
//   egress(files, opts)    → the facts for a set of files: opts = { selfHost, edges, wake (the one file allowed to
//                            name an edge), page (the HTML file) }
//
// Pure and total: text in, facts out, never a throw. A reader of text, not a browser: what it cannot see (a URL built
// at run time from pieces) the page's policy still holds, and the tab's own record of requests measures.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
const str = (x) => (typeof x === 'string' ? x : '');
const URL_RE = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?[^\s'"`<>)\\]*/gi;
const ONLY = Object.freeze({ "'wasm-unsafe-eval'": 'script-src', "'unsafe-inline'": 'style-src', 'data:': 'img-src' });

/** The host of an http(s) URL, lower-cased, without its port; '' when it has none. */
export function hostOf(url) {
  const m = /^https?:\/\/([A-Za-z0-9.-]+)/i.exec(str(url));
  return m ? m[1].toLowerCase() : '';
}

/** Is a host one of the sealed edges? '*.x' is any host under x, not x itself. */
export function isEdgeHost(host, edges) {
  const h = str(host).toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  return (Array.isArray(edges) ? edges : []).some((e) => typeof e === 'string' && (e.startsWith('*.') ? h.endsWith(e.slice(1)) && h.length > e.length - 1 : h === e));
}

/** The page's Content-Security-Policy, from its meta tag. */
export function cspOf(html) {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(str(html));
  if (!m) return { ok: false, why: 'no policy' };
  const directives = {};
  for (const part of m[1].split(';')) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length) directives[words[0].toLowerCase()] = words.slice(1);
  }
  return { ok: true, directives };
}

/** Every source the sealed list does not allow, and whether 'unsafe-eval' appears anywhere. */
export function cspCheck(directives, edges) {
  const d = directives !== null && typeof directives === 'object' ? directives : {};
  const unknown = [];
  let unsafeEval = false;
  for (const [name, sources] of Object.entries(d)) {
    for (const s of Array.isArray(sources) ? sources : []) {
      if (s === "'unsafe-eval'") unsafeEval = true;
      const host = /^https:\/\/((?:\*\.)?[a-z0-9.-]+)$/.exec(s);
      const ok = s === "'self'" || s === "'none'" || (Object.prototype.hasOwnProperty.call(ONLY, s) && ONLY[s] === name) || (host !== null && (Array.isArray(edges) ? edges : []).includes(host[1]));
      if (!ok) unknown.push(name + ' ' + s);
    }
  }
  return { unknown, unsafeEval };
}

/** How many <script> tags carry code in the page itself (not a src, and not a JSON-LD data block). */
export function inlineScripts(html) {
  let k = 0;
  for (const m of str(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*"application\/ld\+json"/i.test(attrs)) continue;
    if (m[2].trim() === '') continue;
    k++;
  }
  return k;
}

// ── where a URL sits ──
function htmlUrls(html) {
  const out = [], claimed = new Set();
  for (const m of html.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
    const tag = m[1].toLowerCase(), attrs = m[2], base = m.index + 1 + m[1].length;
    for (const a of attrs.matchAll(/\b(src|href|action|data|poster)\s*=\s*"([^"]*)"/gi)) {
      const at = base + a.index + a[0].indexOf('"') + 1, found = /^https?:\/\//i.test(a[2]) ? a[2].match(URL_RE) : null;
      if (!found) continue;
      const rel = (/\brel\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
      const where = tag === 'a' ? 'link' : tag === 'link' && /\b(canonical|alternate)\b/i.test(rel) ? 'words' : 'loaded';
      out.push({ at, url: found[0], where });
      claimed.add(at);
    }
  }
  for (const m of html.matchAll(URL_RE)) {
    if (claimed.has(m.index)) continue;
    const css = /url\(\s*["']?$/.test(html.slice(Math.max(0, m.index - 8), m.index));   // CSS url(), in a <style> or a style attribute
    out.push({ at: m.index, url: m[0], where: css ? 'loaded' : 'words' });
  }
  return out.sort((a, b) => a.at - b.at).map(({ url, where }) => ({ url, host: hostOf(url), where }));
}

/** The ranges of a module's comments, found by a small scanner that steps over strings and regular expressions. */
export function commentsOf(js) {
  const s = str(js), out = [];
  let i = 0, prev = '';
  for (;;) {
    const c = s[i], n = s[i + 1];
    if (c === undefined) break;
    if (c === '/' && n === '/') { const e = s.indexOf('\n', i); const end = e === -1 ? s.length : e; out.push([i, end]); i = end; continue; }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); const end = e === -1 ? s.length : e + 2; out.push([i, end]); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (s[j] !== undefined && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
      let j = i + 1, cls = false;
      for (;;) {
        const d = s[j];
        if (d === undefined || d === '\n' || (d === '/' && !cls)) break;
        if (d === '\\') { j += 2; continue; }
        if (d === '[') cls = true;
        if (d === ']') cls = false;
        j++;
      }
      i = j + 1; prev = '/'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
function jsUrls(js) {
  const mask = new Uint8Array(js.length);
  for (const [a, b] of commentsOf(js)) mask.fill(1, a, b);
  return [...js.matchAll(URL_RE)].map((m) => ({ url: m[0], host: hostOf(m[0]), where: mask[m.index] === 1 ? 'words' : 'loaded' }));
}

/** Every http(s) URL in a file, and where it sits. type = 'html' or 'js'. */
export function urlsIn(text, type) {
  const t = str(text);
  return type === 'html' ? htmlUrls(t) : jsUrls(t);
}

/** Does a module make a FallLink without giving it an empty STUN list? */
export function stunMissing(js) {
  const s = str(js);
  for (const m of s.matchAll(/new\s+FallLink\s*\(/g)) {
    let depth = 0, j = m.index + m[0].length - 1, end = s.length;
    for (; s[j] !== undefined; j++) {
      if (s[j] === '(') depth++;
      if (s[j] === ')') depth--;
      if (depth === 0) { end = j; break; }
    }
    if (!/\bstunServers\s*:\s*\[\s*\]/.test(s.slice(m.index, end))) return true;
  }
  return false;
}

/** The facts for a set of files ([{ path, text }]): the page's policy, and every other host its code names. */
export function egress(files, opts) {
  const o = opts !== null && typeof opts === 'object' ? opts : {}, fs = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.path === 'string' && typeof f.text === 'string');
  const page = fs.find((f) => f.path === o.page);
  const csp = page ? cspOf(page.text) : { ok: false, why: 'no page' };
  const check = csp.ok ? cspCheck(csp.directives, o.edges) : { unknown: ['no policy'], unsafeEval: false };
  const urls = [], loadedOutside = [], stun = [];
  let loaded = 0;
  for (const f of fs) {
    const type = /\.html?$/i.test(f.path) ? 'html' : 'js';
    for (const u of urlsIn(f.text, type)) {
      if (u.host === '' || u.host === str(o.selfHost)) continue;
      urls.push({ file: f.path, ...u });
      if (u.where !== 'loaded') continue;
      loaded++;
      if (!(isEdgeHost(u.host, o.edges) && f.path === o.wake)) loadedOutside.push(f.path + ' ' + u.url);
    }
    if (type === 'js' && stunMissing(f.text)) stun.push(f.path);
  }
  return { files: fs.length, policy: csp.ok ? csp.directives : null, unknownSources: check.unknown, unsafeEval: check.unsafeEval, inlineScripts: page ? inlineScripts(page.text) : 0, urls, loaded, loadedOutside, stunMissing: stun };
}
