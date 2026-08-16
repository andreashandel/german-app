// Per-word progress, stored in localStorage and scheduled with Leitner boxes.
//
// Storage is keyed by deck so a custom vocabulary list does not overwrite the
// built-in one. iOS Safari clears localStorage for sites unvisited for seven
// days unless the app has been added to the home screen, which is why the
// export button exists.

const PROGRESS_KEY = (deckId) => `germanapp:progress:v1:${deckId}`;
const SETTINGS_KEY = 'germanapp:settings:v1';

// Days until a word in each box comes back around.
const BOX_INTERVALS = [0, 1, 3, 7, 21];
const MAX_BOX = BOX_INTERVALS.length;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyRecord() {
  return { box: 1, due: 0, seen: 0, correct: 0, wrong: 0, last: 0 };
}

export function loadProgress(deckId) {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(deckId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProgress(deckId, progress) {
  try {
    localStorage.setItem(PROGRESS_KEY(deckId), JSON.stringify(progress));
  } catch {
    // Quota or private-browsing failures are non-fatal: practice still works,
    // it just will not be remembered.
  }
}

/**
 * Fold one answer into the record.
 * grade: 'again' | 'hint' | 'good' | 'easy'. A typed answer maps to again/good,
 * or to 'hint' if she uncovered part of the answer before typing it.
 */
export function recordResult(progress, wordId, grade) {
  const rec = progress[wordId] ? { ...progress[wordId] } : emptyRecord();
  const now = Date.now();

  rec.seen += 1;
  rec.last = now;

  if (grade === 'again') {
    rec.wrong += 1;
    rec.box = 1;
  } else if (grade === 'hint') {
    // Right, but with help: it counts, yet the interval must not stretch or she
    // would stop seeing a word she cannot actually recall unaided.
    rec.correct += 1;
  } else {
    rec.correct += 1;
    rec.box = Math.min(MAX_BOX, rec.box + (grade === 'easy' ? 2 : 1));
  }

  rec.due = now + BOX_INTERVALS[rec.box - 1] * DAY_MS;
  progress[wordId] = rec;
  return rec;
}

export function getRecord(progress, wordId) {
  return progress[wordId] || emptyRecord();
}

/** Words never seen, or whose interval has elapsed. */
export function dueWords(words, progress, now = Date.now()) {
  return words.filter((w) => {
    const rec = progress[w.id];
    return !rec || rec.due <= now;
  });
}

/** Words she gets wrong at least a third of the time, worst first. */
export function hardWords(words, progress) {
  return words
    .filter((w) => {
      const rec = progress[w.id];
      return rec && rec.seen >= 2 && rec.wrong / rec.seen >= 1 / 3;
    })
    .sort((a, b) => {
      const ra = progress[a.id];
      const rb = progress[b.id];
      return rb.wrong / rb.seen - ra.wrong / ra.seen;
    });
}

export function summarise(words, progress) {
  let unseen = 0;
  let learning = 0;
  let mastered = 0;

  for (const w of words) {
    const rec = progress[w.id];
    if (!rec || rec.seen === 0) unseen += 1;
    else if (rec.box >= 4) mastered += 1;
    else learning += 1;
  }

  return { total: words.length, unseen, learning, mastered };
}

export function exportProgress(deckId) {
  return JSON.stringify(
    { deck: deckId, exported: new Date().toISOString(), progress: loadProgress(deckId) },
    null,
    2
  );
}

/** Merge an exported file back in, keeping whichever record was seen more. */
export function importProgress(deckId, json) {
  const parsed = JSON.parse(json);
  const incoming = parsed.progress || parsed;
  const current = loadProgress(deckId);

  for (const [id, rec] of Object.entries(incoming)) {
    if (!rec || typeof rec.seen !== 'number') continue;
    const existing = current[id];
    if (!existing || rec.seen > existing.seen) current[id] = rec;
  }

  saveProgress(deckId, current);
  return Object.keys(incoming).length;
}

export function resetProgress(deckId) {
  try {
    localStorage.removeItem(PROGRESS_KEY(deckId));
  } catch {
    /* nothing to do */
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* non-fatal */
  }
}
