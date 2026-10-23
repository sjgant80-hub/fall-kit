// recycle.test.mjs — the recycling saving: the opening written to the cache once and read back after, priced at the
// published rates; every edge refused by name, nothing thrown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPUS_5_5, talkCost, teamCost } from './recycle.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + ' is not ' + b);
const TALK = { opening: 2000, asked: 150, answered: 400, questions: 6 };
const TALK_WHY = 'a talk is an opening, the words each question adds and each answer takes, in tokens, and 1 to 10,000 questions';
const RATES_WHY = 'rates are input, write, read and output prices per million tokens (0 to 1,000), and the smallest opening that caches';

test('the published rates: Claude Opus 5.5 on the Claude API', () => {
  assert.deepEqual(OPUS_5_5, { model: 'claude-opus-5-5', input: 4, write: 5, read: 0.2, output: 20, min: 512 });
  assert.ok(Object.isFrozen(OPUS_5_5));
});

test('a talk: the opening written once, read back for every later question; answers cost the same either way', () => {
  const t = talkCost(TALK);
  assert.equal(t.ok, true); assert.equal(t.cached, true);
  near(t.plain, (6 * 2150 * 4 + 6 * 400 * 20) / 1e6);                                   // 0.0996
  near(t.recycled, (2000 * 5 + 5 * 2000 * 0.2 + 6 * 150 * 4 + 6 * 400 * 20) / 1e6);     // 0.0636
  near(t.saved, 0.036); near(t.share, 0.036 / 0.0996);
  assert.deepEqual(talkCost(TALK, OPUS_5_5), t, 'Opus 5.5 is the default');
  const one = talkCost({ ...TALK, questions: 1 });
  assert.ok(one.saved < 0, 'one question pays the write and reads nothing back'); near(one.saved, -2000 / 1e6);
  assert.ok(talkCost({ ...TALK, questions: 2 }).saved > 0, 'two questions already save');
});

test('an opening below the minimum is not cached and nothing is saved', () => {
  assert.equal(talkCost({ ...TALK, opening: 512 }).cached, true);
  const short = talkCost({ ...TALK, opening: 511 });
  assert.equal(short.cached, false); assert.equal(short.recycled, short.plain); assert.equal(short.saved, 0); assert.equal(short.share, 0);
  const none = talkCost({ opening: 0, asked: 0, answered: 0, questions: 3 });
  assert.equal(none.plain, 0); assert.equal(none.share, 0, 'nothing spent is nothing saved, not a division by zero');
  const other = { model: 'x', input: 1, write: 2, read: 0.5, output: 3, min: 0 };
  near(talkCost({ opening: 10, asked: 1, answered: 1, questions: 3 }, other).recycled, (10 * 2 + 2 * 10 * 0.5 + 3 * 1 * 1 + 3 * 1 * 3) / 1e6);
});

test('a talk or rates that are not a talk or rates are refused, by name', () => {
  for (const junk of [null, 5, 'x', [], {}]) assert.equal(talkCost(junk).why, TALK_WHY);
  for (const k of ['opening', 'asked', 'answered']) {
    for (const v of [-1, 1.5, '5', 1e6 + 1]) assert.equal(talkCost({ ...TALK, [k]: v }).why, TALK_WHY, k + ' ' + v);
    assert.equal(talkCost({ ...TALK, [k]: 1e6 }).ok, true);
  }
  for (const questions of [0, 10001, 2.5]) assert.equal(talkCost({ ...TALK, questions }).why, TALK_WHY);
  assert.equal(talkCost({ ...TALK, questions: 10000 }).ok, true); assert.equal(talkCost({ ...TALK, questions: 1 }).ok, true);
  for (const junk of [null, 5, [], {}]) assert.equal(talkCost(TALK, junk).why, RATES_WHY);
  for (const k of ['input', 'write', 'read', 'output']) {
    for (const v of [-0.1, 1000.5, '4', NaN, Infinity]) assert.equal(talkCost(TALK, { ...OPUS_5_5, [k]: v }).why, RATES_WHY, k + ' ' + v);
    assert.equal(talkCost(TALK, { ...OPUS_5_5, [k]: 1000 }).ok, true); assert.equal(talkCost(TALK, { ...OPUS_5_5, [k]: 0 }).ok, true);
  }
  for (const min of [-1, 1.5, 1e6 + 1]) assert.equal(talkCost(TALK, { ...OPUS_5_5, min }).why, RATES_WHY);
  assert.equal(talkCost(TALK, { ...OPUS_5_5, min: 1e6 }).ok, true);
});

test('a team’s month: every person’s talks, priced with and without recycling', () => {
  const m = teamCost({ people: 20, talks: 40 }, TALK);
  assert.equal(m.ok, true); assert.equal(m.talks, 800);
  near(m.plain, 800 * 0.0996); near(m.recycled, 800 * 0.0636); near(m.perPerson, 40 * 0.0636);
  assert.deepEqual(teamCost({ people: 20, talks: 40 }, TALK, OPUS_5_5), m);
  const quiet = teamCost({ people: 1, talks: 0 }, TALK);
  assert.equal(quiet.talks, 0); assert.equal(quiet.recycled, 0); assert.equal(quiet.perPerson, 0);
  assert.equal(teamCost({ people: 100000, talks: 10000 }, TALK).ok, true);
  const TEAM_WHY = 'a team is 1 to 100,000 people and 0 to 10,000 talks each in a month';
  for (const team of [null, 5, {}, { people: 0, talks: 1 }, { people: 100001, talks: 1 }, { people: 2, talks: 10001 }, { people: 2, talks: -1 }, { people: 1.5, talks: 1 }]) assert.equal(teamCost(team, TALK).why, TEAM_WHY);
  assert.equal(teamCost({ people: 2, talks: 3 }, { ...TALK, questions: 0 }).why, TALK_WHY, 'a bad talk is refused as a talk');
  assert.equal(teamCost({ people: 2, talks: 3 }, TALK, null).why, RATES_WHY);
});

test('fuzz: junk into every function is refused or answered, never thrown', () => {
  const junk = [undefined, null, 0, -1, 1.5, NaN, '', 'x', [], {}, () => 1, true, TALK, OPUS_5_5, { people: 3, talks: 2 }];
  for (const a of junk) for (const b of junk) { talkCost(a, b); for (const c of junk) teamCost(a, b, c); }
});
