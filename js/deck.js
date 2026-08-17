// Turning a full word list plus the user's settings into the set of words
// they actually practise.

/**
 * Apply the part-of-speech filter, then take a slice of what is left.
 *
 * The range counts positions among the chosen types, so "nouns, 1-100" means
 * the 100 most common nouns. With every type chosen it is simply positions on
 * the full list, which is why this used to be a user-facing choice: on a deck
 * with contiguous ranks the two readings agree exactly whenever nothing is
 * filtered out, so the setting did nothing most of the time.
 *
 * Slicing positionally rather than matching rank values also means the count is
 * always predictable, and a custom CSV with gaps in its `rank` column still
 * yields a sensible selection.
 */
export function selectWords(words, { posFilter, start, end }) {
  const byRank = [...words].sort((a, b) => a.rank - b.rank);
  // A null filter means "every type". An empty array means the user has
  // unticked everything, which selects nothing rather than silently everything.
  const wantPos = (w) => !posFilter || posFilter.includes(w.pos);

  return byRank.filter(wantPos).slice(Math.max(0, start - 1), end);
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
