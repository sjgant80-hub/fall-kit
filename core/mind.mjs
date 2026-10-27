// ════════════════════════════════════════════════════════════════
// core/mind.mjs — the mind at a living website's door. Organ 11 of the shared foundation (Phase 5: claims M1–M4 in
// core/phase5/claims.json).
//
// A small language model reads each message a visitor types (after the site's door has let it in: site.mjs) and says
// which of a fixed list of routes it wants. The model is the first thing that reasons about a request, and it is
// trusted with nothing: its reply is a request too, and it crosses a door of its own.
//
//   promptOf(routes)          → the system prompt: the routes and their descriptions, and the one reply asked for
//   chatOf(routes, text)      → the messages a chat model is sent: that prompt, then the visitor's text
//   proposal(reply, ids)      → { ok: true, route } | { ok: false, why }: the reply at most 512 bytes, white space and
//                               one ``` fence (json or not) removed, JSON, a record whose 'route' is exactly one id
//   keywordsOf(routes)        → the fallback's words: every word of four or more letters in a route's description
//                               that no other route's description uses (a rule, so nobody picks them by hand)
//   keywordRoute(text, kw, ids) → the route whose words the text contains most; a tie goes to the one listed first,
//                               and no word at all is 'none'
//   decide(reply, text, kw, ids)→ { route, by: 'mind' | 'keywords', why }: the mind's route when its proposal holds,
//                               the keywords' when it does not, and never anything outside the list
//
// What a route shows is the site's own fixed words, so a fooled model picks a wrong route: it cannot admit a packet,
// run code or put words of its own on the page. Pure and total; the model is called by the caller, not here.
// Powered by the Konomi architecture, created by Thomas Frumkin.
// ════════════════════════════════════════════════════════════════
export const ROUTES = Object.freeze(['about', 'start', 'digi', 'defend', 'mesh', 'business', 'none']);
export const MAX_REPLY = 512;
export const OPTIONS = Object.freeze({ temperature: 0, maxTokens: 24, json: true, seed: 0 });
const HEAD = 'You are the front door of a website. Read the visitor\'s message and choose the one route that fits it best.\nRoutes:\n';
const TAIL = '\nAnswer with JSON only, exactly like {"route":"about"}.';
const FENCE = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*```$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const pairs = (routes) => (Array.isArray(routes) ? routes : []).filter((r) => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string');
const idsOf = (ids) => (Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : ROUTES);

/** The system prompt for these routes ([[id, description]]). */
export function promptOf(routes) {
  return HEAD + pairs(routes).map(([id, d]) => '- ' + id + ': ' + d).join('\n') + TAIL;
}

/** What a chat model is sent for one message. */
export function chatOf(routes, text) {
  return [{ role: 'system', content: promptOf(routes) }, { role: 'user', content: typeof text === 'string' ? text : '' }];
}

/** The model's reply, through the mind's own door. ids = the routes it may name (ROUTES by default). */
export function proposal(reply, ids) {
  if (typeof reply !== 'string') return { ok: false, why: 'no reply' };
  if (new TextEncoder().encode(reply).length > MAX_REPLY) return { ok: false, why: 'longer than ' + MAX_REPLY + ' bytes' };
  let body = reply.trim();
  const fenced = FENCE.exec(body);
  if (fenced) body = fenced[1].trim();
  let v;
  try { v = JSON.parse(body); } catch { return { ok: false, why: 'not JSON' }; }
  if (!isObj(v) || !Object.prototype.hasOwnProperty.call(v, 'route')) return { ok: false, why: 'no route' };
  if (typeof v.route !== 'string' || !idsOf(ids).includes(v.route)) return { ok: false, why: 'not one of the routes' };
  return { ok: true, route: v.route };
}

const wordsOf = (s) => [...new Set(String(s).toLowerCase().match(/[a-z]+/g) || [])];

/** The fallback's words for each route, by the rule: four or more letters, and in no other route's description. */
export function keywordsOf(routes) {
  const ps = pairs(routes), out = {};
  for (const [id, d] of ps) {
    const others = new Set(ps.filter(([o]) => o !== id).flatMap(([, od]) => wordsOf(od)));
    out[id] = wordsOf(d).filter((w) => w.length >= 4 && !others.has(w));
  }
  return out;
}

/** The route whose words the text contains most; a tie goes to the route listed first; no word at all is 'none'. */
export function keywordRoute(text, kw, ids) {
  const t = typeof text === 'string' ? text.toLowerCase() : '', k = isObj(kw) ? kw : {};
  let best = 'none', top = 0;
  for (const id of idsOf(ids)) {
    const ws = Array.isArray(k[id]) ? k[id] : [];
    const score = ws.filter((w) => typeof w === 'string' && w.length > 0 && t.includes(w)).length;
    if (score > top) { best = id; top = score; }
  }
  return best;
}

/** The site's decision for one message: the mind's route if its proposal holds, else the keywords'. */
export function decide(reply, text, kw, ids) {
  const p = proposal(reply, ids);
  if (p.ok) return { route: p.route, by: 'mind', why: null };
  return { route: keywordRoute(text, kw, ids), by: 'keywords', why: p.why };
}
