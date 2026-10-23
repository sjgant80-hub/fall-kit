// recycle.mjs — what recycling the opening saves. Every question in a talk sends the same opening (who the helper is,
// what it knows) before the new words. Fall Kit marks that opening for the provider's cache, so the provider stores it
// once and reads it back at a fraction of the price for every question after the first.
//
// Prices are the provider's published rates in dollars per million tokens. The defaults are Claude Opus 5.5 on the
// Claude API (Fall Kit's default Anthropic model): $4 input, $5 to write the five-minute cache, $0.20 to read it back,
// $20 output, and an opening of at least 512 tokens before anything is cached. Only the opening is counted as recycled;
// a real talk also re-reads its own earlier turns from the cache, so the true saving is larger, never smaller.
// Pure and total: junk in → { ok: false, why }, never a throw.

export const OPUS_5_5 = Object.freeze({ model: 'claude-opus-5-5', input: 4, write: 5, read: 0.2, output: 20, min: 512 });
const M = 1e6;
const no = (why) => ({ ok: false, why });
const isObj = (x) => Object.prototype.toString.call(x) === '[object Object]';
const whole = (x, hi) => Number.isInteger(x) && x >= 0 && x <= hi;
const price = (x) => typeof x === 'number' && x >= 0 && x <= 1000;

function ratesOk(r) {
  return isObj(r) && price(r.input) && price(r.write) && price(r.read) && price(r.output) && whole(r.min, M);
}
const RATES = 'rates are input, write, read and output prices per million tokens (0 to 1,000), and the smallest opening that caches';

/**
 * One talk: the opening, the words each question adds, the words each answer takes (thinking included), and how
 * many questions. → { ok, cached, plain, recycled, saved, share } in dollars; share is the part of the plain cost saved.
 */
export function talkCost(talk, rates = OPUS_5_5) {
  if (!isObj(talk) || !whole(talk.opening, M) || !whole(talk.asked, M) || !whole(talk.answered, M) || !whole(talk.questions, 10000) || talk.questions < 1)
    return no('a talk is an opening, the words each question adds and each answer takes, in tokens, and 1 to 10,000 questions');
  if (!ratesOk(rates)) return no(RATES);
  const q = talk.questions, o = talk.opening, a = talk.asked;
  const out = (q * talk.answered * rates.output) / M;
  const plain = (q * (o + a) * rates.input) / M + out;
  const cached = o >= rates.min;
  const recycled = cached ? (o * rates.write + (q - 1) * o * rates.read + q * a * rates.input) / M + out : plain;
  return { ok: true, cached, plain, recycled, saved: plain - recycled, share: plain > 0 ? (plain - recycled) / plain : 0 };
}

/** a team's month: people, talks each person has in a month, and the talk. → { ok, talks, plain, recycled, perPerson } */
export function teamCost(team, talk, rates = OPUS_5_5) {
  if (!isObj(team) || !whole(team.people, 100000) || team.people < 1 || !whole(team.talks, 10000)) return no('a team is 1 to 100,000 people and 0 to 10,000 talks each in a month');
  const t = talkCost(talk, rates);
  if (!t.ok) return t;
  const talks = team.people * team.talks;
  return { ok: true, talks, plain: talks * t.plain, recycled: talks * t.recycled, perPerson: team.talks * t.recycled };
}
