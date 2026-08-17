// Card generation and answer checking.
//
// Answer checking is deliberately generous. The goal is to test whether she
// knows the word, not whether she can fight an iPad keyboard into producing an
// umlaut, so "gruen" and "grun" both count as "grün".

import { germanDisplay, englishDisplay } from './csv.js';

/**
 * Reduce a string to a comparable core: lower case, no accents, no umlaut
 * spelling variants, no punctuation.
 *
 * Umlauts fold twice over: stripping combining marks turns "ü" into "u", and
 * collapsing "ue" into "u" catches the typed-out spelling. Both directions land
 * on the same form, so all three of grün / gruen / grun compare equal.
 */
export function normalise(text) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ue/g, 'u')
    .replace(/oe/g, 'o')
    .replace(/ae/g, 'a')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Damerau-Levenshtein distance, used only to forgive small typos.
 *
 * Counting a swap of neighbouring letters as one slip rather than two matters
 * here: "huor" for "hour" is exactly what a thumb does on a tablet keyboard,
 * and under plain Levenshtein it would cost 2 and blow the budget for any word
 * shorter than twelve characters.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevPrev = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Every spelling we are willing to accept for one English gloss.
 * "to look for" also accepts "look for"; "the (masculine)" also accepts "the".
 */
function englishVariants(gloss) {
  const out = new Set();
  const add = (s) => {
    const n = normalise(s);
    if (n) out.add(n);
  };

  add(gloss);
  const noParens = gloss.replace(/\([^)]*\)/g, ' ');
  add(noParens);

  for (const base of [gloss, noParens]) {
    const trimmed = base.trim();
    add(trimmed.replace(/^to\s+/i, ''));
    add(trimmed.replace(/^(a|an|the)\s+/i, ''));
    add(trimmed.replace(/^to\s+/i, '').replace(/^(a|an|the)\s+/i, ''));
  }

  return out;
}

/**
 * The set of accepted answers for a card.
 * With requireArticle on, a noun must be answered with its article.
 */
export function acceptedAnswers(word, dir, { requireArticle = false } = {}) {
  const out = new Set();

  if (dir === 'de-en') {
    for (const gloss of word.english) {
      for (const v of englishVariants(gloss)) out.add(v);
    }
    return out;
  }

  for (const form of [word.german, ...(word.also || [])]) {
    if (word.article) {
      out.add(normalise(`${word.article} ${form}`));
      if (!requireArticle) out.add(normalise(form));
    } else {
      out.add(normalise(form));
    }
  }
  return out;
}

/**
 * Grade a typed answer.
 * Returns whether it counts, and whether it only counted because a typo was
 * forgiven, so the UI can still show the exact spelling.
 */
/** Typo budget: none for very short words, one slip normally, two for long ones. */
function typoBudget(answer) {
  if (answer.length < 4) return 0;
  if (answer.length < 12) return 1;
  return 2;
}

export function checkAnswer(input, word, dir, opts = {}) {
  const { allowTypos = true, requireArticle = false } = opts;
  let guess = normalise(input);
  if (!guess) return { correct: false, typo: false };

  // Articles are graded exactly, never fuzzily: getting "der" vs "das" wrong is
  // the whole point of the require-article setting, and a one-character typo
  // budget would otherwise let the wrong gender through.
  if (dir === 'en-de' && word.article) {
    const leading = guess.match(/^(der|die|das)\s+/);
    if (requireArticle) {
      if (!leading) return { correct: false, typo: false, missingArticle: true };
      if (leading[1] !== word.article) return { correct: false, typo: false, wrongArticle: true };
    }
    if (leading) guess = guess.slice(leading[0].length);
  }

  // The article has already been checked and stripped above, so what remains to
  // match is the bare headword or any of its alternatives.
  const accepted =
    dir === 'en-de' && word.article
      ? new Set([word.german, ...(word.also || [])].map(normalise))
      : acceptedAnswers(word, dir, { requireArticle });

  // Answering an English noun as "the year" is as right as "year", so try the
  // guess again with a leading English article removed.
  const guesses = [guess];
  if (dir === 'de-en') {
    const bare = guess.replace(/^(the|a|an)\s+/, '');
    if (bare && bare !== guess) guesses.push(bare);
  }

  for (const g of guesses) {
    if (accepted.has(g)) return { correct: true, typo: false };
  }

  if (allowTypos) {
    for (const g of guesses) {
      for (const answer of accepted) {
        if (editDistance(g, answer) <= typoBudget(answer)) {
          return { correct: true, typo: true };
        }
      }
    }
  }

  return { correct: false, typo: false };
}

/* ------------------------------------------------------------------ hints */

const LETTER = /[\p{L}\p{N}]/u;

/** Reveal the first `level` letters of `text`; mask the rest, keeping spacing. */
export function hintMask(text, level) {
  let shown = 0;
  let out = '';
  for (const ch of text) {
    if (!LETTER.test(ch)) {
      out += ch;
    } else if (shown < level) {
      out += ch;
      shown += 1;
    } else {
      out += '·';
    }
  }
  return out;
}

/** Letters available to reveal — one past this and the hint is the answer. */
export function hintLength(text) {
  return [...text].filter((ch) => LETTER.test(ch)).length;
}

/** The word a hint uncovers: the first English gloss, or the German headword. */
function hintSource(card) {
  return card.dir === 'de-en' ? card.word.english[0] || '' : card.word.german;
}

export function hintMax(card) {
  return hintLength(hintSource(card));
}

/**
 * A partially revealed answer.
 *
 * A noun's article is never uncovered by a hint. The gender is the thing being
 * tested, so handing it over would defeat the exercise — the placeholder stays
 * in front as a reminder that it is still owed.
 */
export function hintFor(card, level) {
  const masked = hintMask(hintSource(card), level);
  return card.dir === 'en-de' && card.word.article ? `··· ${masked}` : masked;
}

/**
 * What the card shows as the correct answer once it is revealed. Alternatives
 * are listed too, so she learns that "niemals" exists rather than just being
 * told her answer was accepted.
 */
export function expectedAnswer(word, dir) {
  if (dir === 'de-en') return englishDisplay(word);
  const alts = (word.also || []).map((alt) =>
    word.article ? `${word.article} ${alt}` : alt
  );
  return [germanDisplay(word), ...alts].join(' / ');
}

export function promptFor(word, dir) {
  return dir === 'de-en' ? germanDisplay(word) : englishDisplay(word);
}

/** 'mixed' resolves per card so a session alternates directions. */
export function resolveDirection(direction) {
  if (direction === 'mixed') return Math.random() < 0.5 ? 'de-en' : 'en-de';
  return direction;
}

export function makeCard(word, direction) {
  const dir = resolveDirection(direction);
  return {
    word,
    dir,
    prompt: promptFor(word, dir),
    expected: expectedAnswer(word, dir),
    fromLabel: dir === 'de-en' ? 'German' : 'English',
    toLabel: dir === 'de-en' ? 'English' : 'German',
  };
}
