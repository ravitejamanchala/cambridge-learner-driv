// Deterministic feedback from measured faults; never changes the assessment result.
export function buildReport({ lessonId, scenarioId, pass, faults = [], duration = 0, objectives = [], evidence = {} }) {
  const categories = [...new Set(faults.map(f => f.cat))];
  return { version: 1, lessonId, scenarioId, pass, duration: Math.max(0, duration), objectives,
    faults: faults.map(f => ({ ...f })), evidence,
    summary: pass ? 'You met the measured objectives for this exercise.' : 'Repeat this exercise and address the assessment reasons.',
    practice: categories.map(cat => ({ category: cat, evidence: faults.filter(f => f.cat === cat).length,
      advice: cat.startsWith('Use of speed') ? 'Ease off earlier and check the posted limit.' : cat.startsWith('Move off') ? 'Complete the observation inputs before moving away and wait for a safe gap.' : cat.startsWith('Control') ? 'Use a lower speed and make one deliberate control change at a time.' : 'Review the lesson instructions and the recorded fault before retrying.' })) };
}
