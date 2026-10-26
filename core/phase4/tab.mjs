// core/phase4/tab.mjs — the organism's growth, replayed in a browser tab (claim W1). Glue. For each domain the tab loads
// it does what the measured run did: plant what was planted, score the holder on the first round's TEST rows (what the
// mesh's answers are: the holder's own labels), and if that skill is a gap, grow the shuffled-label control and then the
// candidate from FIT, and judge each on GATE against the holder, exactly as the organism does. The mesh traffic itself is
// not replayed here: Phase 3 measured it, and it changes no label. Same code, same seeds, so the same bodies.
import { growNode, labelOf, SEEDS } from './organism.mjs';
import { gate, baOf } from '../growth.mjs';

/** datasets: the loaded domains; policy: the sealed one. → { domains, grown: { skill: [steps] } } */
export async function replay(datasets, policy, onStep = () => {}) {
  const grown = {}, domains = Object.keys(datasets).sort();
  for (const skill of domains) {
    const ds = datasets[skill], steps = [];
    let holder = null;
    if (skill === 'shop') holder = growNode(ds);
    if (skill === 'bank') holder = growNode(ds, { stem: true, silo: 'credit' });
    if (holder) { steps.push({ kind: 'planted', patternId: holder.patternId, pass: null }); onStep({ skill, kind: 'planted', patternId: holder.patternId }); }
    await new Promise((r) => setTimeout(r, 0));
    const rows = ds.testRows.slice(0, policy.asksPerSkillPerRound), truth = rows.map((i) => ds.y[i]);
    const ba = holder ? baOf(truth, rows.map((i) => labelOf(holder, ds, i))) : 0;
    onStep({ skill, kind: 'look', ba });
    if (ba < policy.target) {
      const gateTruth = ds.gateRows.map((i) => ds.y[i]), inc = ds.gateRows.map((i) => (holder ? labelOf(holder, ds, i) : null));
      for (const control of [true, false]) {
        const body = growNode(ds, { shuffle: control });
        await new Promise((r) => setTimeout(r, 0));
        const v = gate(gateTruth, ds.gateRows.map((i) => labelOf(body, ds, i)), inc, policy);
        steps.push({ kind: control ? 'control' : 'candidate', patternId: body.patternId, pass: v.pass });
        onStep({ skill, kind: control ? 'control' : 'candidate', patternId: body.patternId, silo: body.silo, ...v });
        if (v.pass) break;
      }
    }
    grown[skill] = steps;
  }
  return { domains, grown, seeds: SEEDS };
}
