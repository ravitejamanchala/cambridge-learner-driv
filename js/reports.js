// Deterministic feedback from measured faults; never changes the assessment result.
export function buildReport({ lessonId, scenarioId, pass, faults = [], duration = 0, objectives = [], evidence = {} }) {
  const categories = [...new Set(faults.map(f => f.cat))];
  return { version: 1, lessonId, scenarioId, pass, duration: Math.max(0, duration), objectives,
    faults: faults.map(f => ({ ...f })), evidence,
    summary: pass ? 'You met the measured objectives for this exercise.' : 'Repeat this exercise and address the assessment reasons.',
    practice: categories.map(cat => ({ category: cat, evidence: faults.filter(f => f.cat === cat).length,
      advice: cat.startsWith('Use of speed') ? 'Ease off earlier and check the posted limit.' : cat.startsWith('Move off') ? 'Complete the observation inputs before moving away and wait for a safe gap.' : cat.startsWith('Control') ? 'Use a lower speed and make one deliberate control change at a time.' : 'Review the lesson instructions and the recorded fault before retrying.' })) };
}

const metres = v => `${v.toFixed(1)} m`;
const mph = v => `${Math.round(v * 2.23694)} mph`;
const secs = v => `${Math.round(v)} s`;
const times = n => n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times';
// Measured account of one run, for the result sheet. Facts only: every line comes from something
// the drive recorded, so it never flatters or invents.
export function runDetail({ kind = 'lesson', lesson = null, test, scenario = null, stats = {}, observations = [] }) {
  const lines = [], events = scenario?.events || [];
  if (Number.isFinite(test?.elapsed)) lines.push(`Took ${secs(test.elapsed)}.`);
  if (Number.isFinite(stats.distance) && stats.distance > 1) lines.push(`Drove ${stats.distance < 1000 ? metres(stats.distance) : (stats.distance / 1000).toFixed(2) + ' km'}${lesson?.manoeuvre ? '' : `, topping out at ${mph(stats.topSpeed || 0)}`}.`);
  if (lesson?.manoeuvre) {
    const legs = events.filter(e => e.type === 'parking-leg-complete');
    const stages = ['Pulling up alongside', 'Reversing into the space'];
    if (!legs.length) lines.push('No stage of the manoeuvre was completed: the car never reached the first target and stopped in it.');
    for (const leg of legs) lines.push(`${stages[leg.leg] || 'Stage ' + (leg.leg + 1)}: completed after ${metres(leg.travel)}${leg.gear === 'R' ? ' in reverse' : ''}.`);
    const contacts = events.filter(e => e.type === 'parking-contact');
    if (contacts.length) {
      const names = { 'parked-front': 'the car in front', 'parked-rear': 'the car behind', boundary: 'the kerb or the far side of the road' };
      lines.push(`Touched ${[...new Set(contacts.map(c => names[c.object] || c.object))].join(' and ')} ${times(contacts.length)}.`);
    } else if (legs.length) lines.push('No contact with the parked cars or the kerb.');
    const assessed = events.find(e => e.type === 'parking-assessment');
    const grade = assessed?.grade;
    if (grade) {
      lines.push(grade.inside ? 'Finished with the whole car inside the space.' : 'Finished with part of the car outside the space.');
      lines.push(`Ended ${grade.angleDegrees.toFixed(1)}° off parallel; up to ${grade.tolerance ?? 8}° counts as parallel.`);
    }
    if (Number.isFinite(stats.topSpeed)) lines.push(`Fastest point of the manoeuvre ${mph(stats.topSpeed || 0)}; keep it to walking pace.`);
  }
  const during = observations.length;
  lines.push(during ? `Looked round ${times(during)}.` : 'No look-round input recorded on this run.');
  const emergency = events.filter(e => e.type === 'emergency-approach');
  if (emergency.length) {
    const passedBy = events.find(e => e.type === 'emergency-passed');
    const side = emergency[0].side === 'oncoming' ? 'came the other way' : 'came up behind';
    lines.push(passedBy
      ? `A blue-light vehicle ${side} and got past after ${secs(passedBy.followFor)}${passedBy.pulledIn ? ', once you were over to the left' : passedBy.slowed ? ', once you had slowed down' : ' without you making room'}.`
      : `A blue-light vehicle ${side} and never got past you.`);
  }
  const byCat = new Map();
  for (const f of test?.faults || []) byCat.set(f.cat, (byCat.get(f.cat) || 0) + 1);
  if (byCat.size) for (const [cat, n] of byCat) lines.push(`${cat}: marked ${times(n)}.`);
  else lines.push('Nothing marked against you.');
  if (test?.hits?.length) lines.push(`Someone drove into you ${times(test.hits.length)}; not your fault.`);
  return lines;
}
