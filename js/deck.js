// Turning a full word list plus the user's settings into the set of words
// they actually practise.

/**
 * Apply the part-of-speech filter and the rank range.
 *
 * rangeMode decides what "words 200-400" means:
 *   'all'    - positions on the full frequency list, then keep the chosen types
 *   'filter' - keep the chosen types first, then take the 200th-400th of those
 *              (so "nouns, 1-100" gives the 100 most common nouns)
 */
export function selectWords(words, { posFilter, start, end, rangeMode }) {
  const byRank = [...words].sort((a, b) => a.rank - b.rank);
  // A null filter means "every type". An empty array means the user has
  // unticked everything, which selects nothing rather than silently everything.
  const wantPos = (w) => !posFilter || posFilter.includes(w.pos);

  if (rangeMode === 'filter') {
    const filtered = byRank.filter(wantPos);
    return filtered.slice(Math.max(0, start - 1), end);
  }

  return byRank.filter((w) => w.rank >= start && w.rank <= end).filter(wantPos);
}

/** How many words each type contributes, for the live counts on the setup screen. */
export function countByPos(words) {
  const counts = {};
  for (const w of words) counts[w.pos] = (counts[w.pos] || 0) + 1;
  return counts;
}

/** Fisher-Yates, so the order is genuinely uniform rather than sort-with-random. */
export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rankExtent(words) {
  if (words.length === 0) return { min: 1, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const w of words) {
    if (w.rank < min) min = w.rank;
    if (w.rank > max) max = w.rank;
  }
  return { min, max };
}
