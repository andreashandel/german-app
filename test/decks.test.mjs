// Validates every deck listed in data/manifest.json against the real parser
// and grader: schema, gender, unique identities, and that each word can be
// answered, hinted and graded in both directions.
import fs from 'node:fs';
import { parseCsv, toWords, germanDisplay, englishDisplay, POS_VALUES } from '../js/csv.js';
import { selectWords, countByPos } from '../js/deck.js';
import { checkAnswer, makeCard, hintFor, hintMax } from '../js/quiz.js';

import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(`${ROOT}/data/manifest.json`, 'utf8'));

let problems = 0;
const flag = (msg) => { problems++; console.log('  !!', msg); };

for (const deck of manifest) {
  const text = fs.readFileSync(`${ROOT}/${deck.file}`, 'utf8');
  const words = toWords(parseCsv(text));
  console.log(`\n${deck.name}  [${deck.id}]  ${words.length} words`);

  // every row parsed with the essentials
  for (const w of words) {
    if (!w.german) flag(`empty german at rank ${w.rank}`);
    if (!w.english || !w.english.length) flag(`no translation for ${w.german}`);
    if (!POS_VALUES.includes(w.pos)) flag(`bad pos "${w.pos}" on ${w.german}`);
    if (w.pos === 'noun' && !w.article) flag(`noun without article: ${w.german}`);
    if (w.pos !== 'noun' && w.article) flag(`non-noun with article: ${w.german}`);
    if (w.article && !['der', 'die', 'das'].includes(w.article)) flag(`bad article on ${w.german}`);
  }

  // identity collisions would merge progress records
  const ids = new Map();
  for (const w of words) {
    const key = `${w.german.toLowerCase()}|${w.pos}`;
    if (ids.has(key)) flag(`duplicate identity: ${w.german} (${w.pos})`);
    ids.set(key, w);
  }

  // ranks usable by the range selector
  const ranks = words.map((w) => w.rank);
  if (new Set(ranks).size !== ranks.length) flag('duplicate ranks');
  if (Math.min(...ranks) !== 1) flag(`ranks do not start at 1 (min ${Math.min(...ranks)})`);

  const counts = countByPos(words);
  console.log('  pos:', Object.entries(counts).filter(([, n]) => n).map(([p, n]) => `${p} ${n}`).join(', '));

  // the range selector and both directions actually work on this deck
  const all = selectWords(words, { posFilter: null, start: 1, end: words.length, rangeMode: 'all' });
  if (all.length !== words.length) flag(`full range gave ${all.length} of ${words.length}`);

  const nouns = selectWords(words, { posFilter: ['noun'], start: 1, end: 10, rangeMode: 'filter' });
  console.log('  first nouns:', nouns.slice(0, 4).map(germanDisplay).join(', ') || '(none)');

  // grading works both ways on every single word, with the article required
  for (const w of words) {
    const de = makeCard(w, 'de-en');
    const en = makeCard(w, 'en-de');
    void de; void en;

    const enAnswer = w.english[0];
    if (!checkAnswer(enAnswer, w, 'de-en', { requireArticle: true }).correct) {
      flag(`own translation rejected: ${w.german} -> "${enAnswer}"`);
    }
    if (w.pos === 'noun' && !checkAnswer(`the ${enAnswer}`, w, 'de-en', { requireArticle: true }).correct) {
      flag(`"the ${enAnswer}" rejected for noun ${w.german}`);
    }
    const deAnswer = germanDisplay(w);
    if (!checkAnswer(deAnswer, w, 'en-de', { requireArticle: true }).correct) {
      flag(`own german rejected: "${deAnswer}"`);
    }
    if (w.article && checkAnswer(w.german, w, 'en-de', { requireArticle: true }).correct) {
      flag(`bare noun accepted despite requireArticle: ${w.german}`);
    }
    // Hints must never be empty or give the whole thing away. The button is
    // hidden below 2 letters and clamps to hintMax-1, so that is the ceiling
    // the app can actually reach.
    for (const card of [de, en]) {
      if (hintMax(card) < 2) continue; // no hint button offered for these
      const ceiling = hintMax(card) - 1;
      const h = hintFor(card, 1);
      if (typeof h !== 'string' || !h.length) flag(`bad hint for ${w.german}`);
      if (!hintFor(card, ceiling).includes('·')) {
        flag(`hint spells out ${w.german} (${card.dir})`);
      }
      if (card.dir === 'en-de' && w.article && !hintFor(card, ceiling).startsWith('···')) {
        flag(`hint leaks the article for ${w.german}`);
      }
    }
  }

  // long entries are awkward on a phone-width card
  const longest = [...words].sort((a, b) => englishDisplay(b).length - englishDisplay(a).length)[0];
  console.log('  longest gloss:', `${longest.german} -> ${englishDisplay(longest)}`);
}

// Every deck must be precached, or it is unavailable offline until she happens
// to open it while online.
const sw = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');
console.log('\nservice worker precache');
for (const deck of manifest) {
  if (!sw.includes(`'${deck.file}'`)) flag(`${deck.file} missing from sw.js ASSETS`);
}
if (!sw.includes("'data/manifest.json'")) flag('manifest.json missing from sw.js ASSETS');
console.log(`  ${manifest.length} decks checked`);

console.log(problems ? `\n${problems} problems` : '\nall decks clean');
process.exit(problems ? 1 : 0);
