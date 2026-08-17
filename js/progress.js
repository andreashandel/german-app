// Per-word progress, stored in localStorage and scheduled with Leitner boxes.
//
// Storage is keyed by deck so a custom vocabulary list does not overwrite the
// built-in one. iOS Safari clears localStorage for sites unvisited for seven
// days unless the app has been added to the home screen — which is the reason
// the README pushes "Add to Home Screen" so hard.

const PROGRESS_KEY = (deckId) => `germanapp:progress:v1:${deckId}`;
const SETTINGS_KEY = 'germanapp:settings:v1';
// The streak spans every deck: practising food words keeps it alive just as
// well as the main list.
const STREAK_KEY = 'germanapp:streak:v1';

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

export function resetProgress(deckId) {
  try {
    localStorage.removeItem(PROGRESS_KEY(deckId));
  } catch {
    /* nothing to do */
  }
}

/* ------------------------------------------------------------- streak ---- */

/**
 * Local calendar day. Deliberately not UTC: a streak should follow the day she
 * is living in, so practising at 11pm and again at 8am is two days.
 */
function dayKey(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day arithmetic via setDate so month ends and DST shifts stay correct. */
function shiftDay(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return dayKey(d.getTime());
}

export function emptyStreak() {
  return { current: 0, best: 0, lastDay: null, totalDays: 0 };
}

export function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? { ...emptyStreak(), ...JSON.parse(raw) } : emptyStreak();
  } catch {
    return emptyStreak();
  }
}

export function saveStreak(streak) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    /* non-fatal, same as progress */
  }
}

/**
 * Credit today towards the streak.
 *
 * Called on the first graded answer of the day, so the streak counts days
 * practised rather than sessions finished — quitting a session halfway still
 * counts, which is the honest reading of "she practised today". Repeat calls
 * on the same day are no-ops.
 */
export function recordPractice(streak, now = Date.now()) {
  const today = dayKey(now);
  if (streak.lastDay === today) return { streak, advanced: false };

  const next = {
    ...streak,
    current: streak.lastDay === shiftDay(now, -1) ? (streak.current || 0) + 1 : 1,
    lastDay: today,
    totalDays: (streak.totalDays || 0) + 1,
  };
  next.best = Math.max(streak.best || 0, next.current);
  return { streak: next, advanced: true };
}

/**
 * The streak as it stands right now. A stored count is stale once a day has
 * been missed, so a gap reads as 0 rather than showing yesterday's number
 * indefinitely. Yesterday still counts: the day is not over until it is.
 */
export function currentStreak(streak, now = Date.now()) {
  if (!streak || !streak.lastDay) return 0;
  const today = dayKey(now);
  return streak.lastDay === today || streak.lastDay === shiftDay(now, -1)
    ? streak.current
    : 0;
}

export function practisedToday(streak, now = Date.now()) {
  return Boolean(streak) && streak.lastDay === dayKey(now);
}

export function resetStreak() {
  try {
    localStorage.removeItem(STREAK_KEY);
  } catch {
    /* nothing to do */
  }
}

/* ----------------------------------------------------------- settings ---- */

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
