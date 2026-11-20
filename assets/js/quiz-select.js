/**
 * quiz-select.js  (Linux Security Lab)
 * Chooses the questions of one quiz round. Pure (no DOM, injectable randomness) so it can be tested.
 * For a single section: a random sample of that section. For "All": questions are drawn evenly from every section
 * (round-robin over shuffled sections), so a section with many questions — the inherited File Permissions set is
 * 109 of 159 — does not dominate the mixed round. The round itself is then shuffled.
 */

export function shuffle(arr, rng = Math.random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** @param {{section:string}[]} questions @param {string} section "All" or a section id */
export function pickRound(questions, section, size, rng = Math.random) {
  if (section !== "All") return shuffle(questions.filter((q) => q.section === section), rng).slice(0, size);
  const buckets = new Map();
  for (const q of questions) {
    if (!buckets.has(q.section)) buckets.set(q.section, []);
    buckets.get(q.section).push(q);
  }
  const queues = shuffle([...buckets.values()].map((b) => shuffle(b, rng)), rng);
  const round = [];
  while (round.length < size && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (round.length >= size) break;
      if (queue.length) round.push(queue.shift());
    }
  }
  return shuffle(round, rng);
}
