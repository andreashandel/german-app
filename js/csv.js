// CSV parsing and normalisation into the word shape the rest of the app uses.
//
// The parser is deliberately forgiving: a custom deck only has to supply a
// German column and an English column. Everything else is optional and gets a
// sensible default, so a two-column file typed in Excel just works.

/**
 * Parse CSV text into an array of row objects keyed by header name.
 * Handles quoted fields, embedded commas and newlines, doubled quotes,
 * CRLF line endings and a leading UTF-8 BOM.
 */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // Swallow the \n of a \r\n pair.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  // Trailing field / row when the file does not end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

// Accepted spellings for each logical column, English and German.
const COLUMN_ALIASES = {
  rank: ['rank', 'rang', 'frequency', 'freq', 'nr', 'no', 'number'],
  german: ['german', 'deutsch', 'de', 'word', 'wort', 'term'],
  english: ['english', 'englisch', 'en', 'translation', 'ubersetzung', 'übersetzung', 'meaning'],
  article: ['article', 'artikel', 'gender', 'genus'],
  plural: ['plural', 'pl'],
  pos: ['pos', 'type', 'wordtype', 'word_type', 'wortart', 'part_of_speech', 'partofspeech'],
  example_de: ['example_de', 'beispiel', 'beispiel_de', 'example', 'satz'],
  example_en: ['example_en', 'beispiel_en', 'example_translation'],
};

function pickColumn(row, logical) {
  for (const alias of COLUMN_ALIASES[logical]) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

export const POS_VALUES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'numeral',
  'other',
];

export const POS_LABELS = {
  noun: 'Nouns',
  verb: 'Verbs',
  adjective: 'Adjectives',
  adverb: 'Adverbs',
  pronoun: 'Pronouns',
  preposition: 'Prepositions',
  conjunction: 'Conjunctions',
  article: 'Articles',
  numeral: 'Numbers',
  other: 'Other',
};

const POS_ALIASES = {
  noun: ['noun', 'n', 'nomen', 'substantiv', 'hauptwort'],
  verb: ['verb', 'v', 'verben', 'zeitwort'],
  adjective: ['adjective', 'adj', 'adjektiv', 'eigenschaftswort'],
  adverb: ['adverb', 'adv', 'umstandswort'],
  pronoun: ['pronoun', 'pron', 'pronomen', 'fürwort', 'furwort'],
  preposition: ['preposition', 'prep', 'präposition', 'praposition', 'verhältniswort'],
  conjunction: ['conjunction', 'conj', 'konjunktion', 'bindewort'],
  article: ['article', 'art', 'artikel', 'geschlechtswort'],
  numeral: ['numeral', 'num', 'number', 'zahlwort', 'numerale'],
};

function normalisePos(raw) {
  const v = raw.trim().toLowerCase();
  if (!v) return 'other';
  for (const [canonical, aliases] of Object.entries(POS_ALIASES)) {
    if (aliases.includes(v)) return canonical;
  }
  return 'other';
}

const VALID_ARTICLES = ['der', 'die', 'das'];

/**
 * Turn parsed rows into word objects. Rows without both a German and an
 * English side are dropped rather than silently producing unanswerable cards.
 */
export function toWords(rows) {
  const words = [];

  rows.forEach((row, index) => {
    const german = pickColumn(row, 'german');
    const englishRaw = pickColumn(row, 'english');
    if (!german || !englishRaw) return;

    const rankRaw = parseInt(pickColumn(row, 'rank'), 10);
    const article = pickColumn(row, 'article').toLowerCase();

    words.push({
      rank: Number.isFinite(rankRaw) ? rankRaw : index + 1,
      german,
      article: VALID_ARTICLES.includes(article) ? article : '',
      plural: pickColumn(row, 'plural'),
      english: englishRaw
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      pos: normalisePos(pickColumn(row, 'pos')),
      exampleDe: pickColumn(row, 'example_de'),
      exampleEn: pickColumn(row, 'example_en'),
      // Part of speech is part of the identity: "das Essen" and "essen" are
      // different words that differ only by capitalisation, and each needs its
      // own progress record.
      id: `${german.toLowerCase()}:${normalisePos(pickColumn(row, 'pos'))}`,
    });
  });

  // Later duplicates of the same headword would collide on progress tracking.
  const seen = new Set();
  return words.filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
}

/** "das Jahr" for nouns with a known article, otherwise just the headword. */
export function germanDisplay(word) {
  return word.article ? `${word.article} ${word.german}` : word.german;
}

export function englishDisplay(word) {
  return word.english.join('; ');
}

export async function loadDeckFromUrl(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return toWords(parseCsv(await res.text()));
}
