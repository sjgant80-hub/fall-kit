// core/phase4/organism.mjs — the organism (Phase 4; claims in core/phase4/claims.json). A mesh of real foundation nodes,
// planted with two holders and asked real work across five domains; the self-model watches every round; gated growth
// fills its gaps, one node at a time, until its own stop rule. Glue: the laws are core/selfmodel.mjs (what the organism
// sees) and core/growth.mjs (whether a node may join); the growth engine is the seed-library ribosome (dex-frontier's
// copy, vendored under ./dex). It runs the same in Node and in a browser tab: it has no file, network or clock of its
// own; it is handed the loaded datasets and the sealed policy, and every identity is a fixed public test seed.
//
//   growNode(ds, opts)            → a grown body: the best silo's scorecard on FIT, its operating point, its pattern id
//   run({ datasets, policy, grow, onStep }) → { rounds, decisions, stop, nodes }   the whole life, one step at a time
import { createNode } from '../node.mjs';
import { makeIdentity, hex } from '../identity.mjs';
import { makeRoster, readRoster, rosterChanges } from '../roster.mjs';
import { observe, gaps, flags, predict, grade, balanced, round6 } from '../selfmodel.mjs';
import { gate, nextStep } from '../growth.mjs';
import { sha256 } from '../vendor/light/sha256.mjs';
import * as SL from './dex/vendor/living-seed/vendor/seed-library/seedlib.mjs';

export const GROW = Object.freeze({ population: 24, elites: 4, generations: 16 });
export const SKILLS = Object.freeze(['adult', 'bank', 'coupon', 'credit', 'shop']);
const CLOCK = () => new Date('2026-10-26T12:00:00Z');
const seedOf = (k) => new Uint8Array(32).fill(k);
const enc = (s) => new TextEncoder().encode(s);
const digest = (x) => hex(sha256(enc(JSON.stringify(x))));
export const SEEDS = Object.freeze({ founder: 40, askers: [41, 42], planted: { shop: 43, bank: 44 }, grownFrom: 50 });

/** labels shuffled among the FIT rows only (the control): the same rows, the same features, the answers scrambled */
function shuffledLabels(ds, seed) {
  const y = Uint8Array.from(ds.y), r = SL.rng(seed), rows = ds.fitRows.slice();
  const vals = rows.map((i) => y[i]);
  for (let i = vals.length - 1; i > 0; i--) { const j = SL.draw(r, i + 1); [vals[i], vals[j]] = [vals[j], vals[i]]; }
  rows.forEach((i, k) => { y[i] = vals[k]; });
  return y;
}
const score = (rules, x) => rules.reduce((s, r) => s + (SL.fires(r, x[r.feat]) ? r.w : 0), 0);
/** the operating point on the rows it was grown on: the threshold with the best balanced accuracy there, the lowest of ties */
function operatingPoint(rules, ds, y, rows) {
  const pts = rows.map((i) => [score(rules, Object.fromEntries(rules.map((r) => [r.feat, ds.cols[r.feat][i]]))), y[i]]);
  const cuts = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  let best = { thr: cuts[0] - 1, ba: -1 };
  for (const thr of [cuts[0] - 1, ...cuts]) {
    const t = { pos: 0, neg: 0, tp: 0, tn: 0 };
    for (const [s, l] of pts) { const p = s > thr ? 1 : 0; if (l === 1) { t.pos++; if (p === 1) t.tp++; } else { t.neg++; if (p === 0) t.tn++; } }
    const ba = balanced(t);
    if (ba > best.ba) best = { thr, ba };
  }
  return best.thr;
}

/** Grow a node's body for a domain from its FIT rows only. opts: { seed, shuffle (the control), stem (no evolution), silo } */
export function growNode(ds, opts = {}) {
  const seed = Number.isSafeInteger(opts.seed) && opts.seed >= 1 ? opts.seed : 4;
  const y = opts.shuffle ? shuffledLabels(ds, seed) : ds.y;
  const inner = SL.splitRows({ y }, ds.fitRows, 0.25, seed);
  let best = null;
  for (const silo of (opts.silo ? [opts.silo] : Object.keys(ds.silos).sort())) {
    const features = ds.silos[silo].slice(0, SL.MAXFEATS);
    const view = { name: ds.name, n: ds.n, cols: ds.cols, y, features, trainRows: inner.rest, heldRows: inner.held };
    const seedStr = SL.encodeSeed(SL.makeSeed({ domain: ds.name, seed, grow: opts.stem ? null : GROW }));
    const g = SL.germinate(view, seedStr, { guard: false });
    if (!g.ok) continue;
    if (best === null || g.heldAuc > best.innerAuc) best = { silo, features, rules: g.scorecard.rules, innerAuc: g.heldAuc, seedStr };
  }
  if (best === null) return null;
  const threshold = operatingPoint(best.rules, ds, y, inner.rest);
  const body = { skill: ds.name, silo: best.silo, rules: best.rules, threshold, seed: best.seedStr };
  return { ...body, innerAuc: best.innerAuc, control: opts.shuffle === true, patternId: digest(body).slice(0, 16) };
}

/** A grown body as a node's skill: the label at its operating point, with a receipt the asker's door re-hashes. */
const skillOf = (body) => async (input) => {
  const x = input && typeof input === 'object' && input.x && typeof input.x === 'object' ? input.x : null;
  if (x === null || !body.rules.every((r) => Number.isFinite(x[r.feat]))) return { verdict: 'ABSTAIN', why: 'the input lacks a feature this pattern reads' };
  const label = score(body.rules, x) > body.threshold ? 1 : 0;
  const core = { model: body.patternId, skill: body.skill, label, verdict: 'VERIFIED' };
  return { verdict: 'VERIFIED', label, receipt: { ...core, receiptHash: digest(core) } };
};
/** the same label, called directly: how the gate judges a node on GATE rows (not mesh traffic) */
export const labelOf = (body, ds, i) => (score(body.rules, Object.fromEntries(body.rules.map((r) => [r.feat, ds.cols[r.feat][i]]))) > body.threshold ? 1 : 0);
const rowOf = (ds, i) => Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][i]]));

/** The organism's whole life: planting, then each round of work, the self-model's look, and (if grow) gated growth. */
export async function run({ datasets, policy, grow = true, onStep = () => {} }) {
  const P = policy;
  const ids = {}, members = [], byId = new Map(), answers = [];
  const make = async (name, s, skills, body) => {
    const identity = await makeIdentity(seedOf(s));
    const node = await createNode({ name, identity, skills, clock: CLOCK, budget: 20000 });
    const m = { name, id: identity.id, node, body: body || null, skill: body ? body.skill : null };
    byId.set(m.id, m);
    return m;
  };
  // carry a packet to the node it names and every reply back; the askers' answers are kept as the self-model sees them
  const deliver = async (to, bytes) => {
    const m = byId.get(to);
    if (!m) return null;
    const r = await m.node.hear(bytes);
    if (r.ok && r.t === 'answer') answers.push({ id: r.id, from: r.from, label: r.answer && r.answer.verdict === 'VERIFIED' ? r.answer.label : null, outcome: r.outcome });
    for (const rep of r.replies || []) await deliver(rep.to, rep.bytes);
    return r;
  };
  const founder = await makeIdentity(seedOf(SEEDS.founder));
  const sign = async (list) => {
    const read = await readRoster((await makeRoster(founder, list.map((m) => m.node.card()))).roster, founder.id);
    for (const m of byId.values()) {
      const ch = rosterChanges(read, m.node.pinned(), m.id);
      for (const c of ch.pin) await m.node.pin(c);
      for (const id of ch.unpin) m.node.unpin(id);
    }
    return read;
  };

  // planting: two askers, a decent shop holder, a weak bank holder
  const askers = [await make('a1', SEEDS.askers[0], {}), await make('a2', SEEDS.askers[1], {})];
  const shopBody = growNode(datasets.shop), bankBody = growNode(datasets.bank, { stem: true, silo: 'credit' });
  const holders = new Map();   // skill → the member that holds it
  holders.set('shop', await make('shop-0', SEEDS.planted.shop, { shop: skillOf(shopBody) }, shopBody));
  holders.set('bank', await make('bank-0', SEEDS.planted.bank, { bank: skillOf(bankBody) }, bankBody));
  members.push(...askers, holders.get('shop'), holders.get('bank'));
  await sign(members);
  const planted = { shop: { patternId: shopBody.patternId, silo: shopBody.silo }, bank: { patternId: bankBody.patternId, silo: bankBody.silo, stem: true } };
  onStep({ kind: 'planted', planted });

  const rounds = [], decisions = [], tried = new Set();
  let grown = 0, stop = null, predicted = null, seq = 0;
  for (let c = 1; c <= P.maxCycles; c++) {
    // a round of work: each skill asked P.asksPerSkillPerRound fresh TEST rows, the askers taking turns
    const asks = [], truth = {}, from = answers.length;
    for (const skill of SKILLS) {
      const ds = datasets[skill], rows = ds.testRows.slice((c - 1) * P.asksPerSkillPerRound, c * P.asksPerSkillPerRound);
      for (const [k, i] of rows.entries()) {
        const asker = askers[k % askers.length];
        const a = await asker.node.ask(skill, { x: rowOf(ds, i) });
        if (!a.ok) { const id = 'none:' + skill + ':' + c + ':' + (++seq); asks.push({ id, skill, asker: asker.id, to: null, row: i }); truth[id] = ds.y[i]; continue; }
        asks.push({ id: a.id, skill, asker: asker.id, to: a.to, row: i });
        truth[a.id] = ds.y[i];
        await deliver(a.to, a.bytes);
      }
    }
    const links = [];
    for (const asker of askers) for (const [skill, h] of [...holders.entries()].sort()) links.push({ asker: asker.id, holder: h.id, skill, weight: asker.node.weight(h.id, skill) });
    const roundAnswers = answers.slice(from).map(({ id, from: f, label }) => ({ id, from: f, label }));
    const model = observe({ asks, answers: roundAnswers.filter((a) => a.label !== null), truth, links });
    const measured = Object.fromEntries(Object.entries(model.skills).map(([s, t]) => [s, t.ba]));
    const naive = rounds.length ? rounds[rounds.length - 1].measured : null;
    const round = {
      cycle: c, asks, answers: roundAnswers, truth, links, model, measured,
      gaps: gaps(model, { target: P.target }), flags: flags(model, { target: P.target, start: 500000 }),
      predicted, error: predicted ? grade(predicted, measured) : null, naiveError: naive ? grade(naive, measured) : null,
      holders: Object.fromEntries([...holders.entries()].sort().map(([s, h]) => [s, h.name])),
    };
    rounds.push(round);
    onStep({ kind: 'round', cycle: c, measured, gaps: round.gaps });

    // growth: at most one join a cycle, never after the last round (a node must have work to be tested on)
    const joined = {};
    if (grow && stop === null && c < P.maxCycles) {
      const step = nextStep(round.gaps, { tried: [...tried], grown }, P);
      if (step.stop) { stop = { after: c, why: step.stop }; decisions.push({ cycle: c, kind: 'stop', why: step.stop }); onStep({ kind: 'stop', why: step.stop }); }
      else {
        const skill = step.gap.skill, ds = datasets[skill];
        tried.add(skill);
        const inc = holders.get(skill) || null;
        const truthGate = ds.gateRows.map((i) => ds.y[i]), incLabels = ds.gateRows.map((i) => (inc ? labelOf(inc.body, ds, i) : null));
        for (const control of [true, false]) {
          const body = growNode(ds, { shuffle: control });
          const verdict = body ? gate(truthGate, ds.gateRows.map((i) => labelOf(body, ds, i)), incLabels, P) : { pass: false, why: 'nothing grew' };
          const d = { cycle: c, kind: control ? 'control' : 'candidate', skill, chose: step.gap, patternId: body ? body.patternId : null, silo: body ? body.silo : null, innerAuc: body ? body.innerAuc : null, incumbent: inc ? inc.name : null, ...verdict };
          if (verdict.pass && grown < P.maxGrown) {
            const name = skill + '-' + (grown + 1);
            const m = await make(name, SEEDS.grownFrom + grown, { [skill]: skillOf(body) }, body);
            grown++;
            const next = members.filter((x) => x !== inc);
            next.push(m);
            members.length = 0; members.push(...next);
            await sign(members);
            holders.set(skill, m);
            joined[skill] = verdict.ba;
            d.joined = name;
            d.dropped = inc ? inc.name : null;
          }
          decisions.push(d);
          onStep({ kind: 'decision', decision: d });
          if (d.joined) break;   // one join a cycle
        }
      }
    }
    predicted = predict(model, joined);
  }
  if (grow && stop === null) stop = { after: P.maxCycles, why: 'the last round was worked' };
  const nodes = members.map((m) => ({ name: m.name, id: m.id, skill: m.skill, patternId: m.body ? m.body.patternId : null }));
  return { planted, rounds, decisions, stop, nodes, grown };
}
