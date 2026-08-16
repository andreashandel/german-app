import fs from 'node:fs';
import { parseCsv, toWords, germanDisplay } from '../js/csv.js';
import { selectWords, countByPos } from '../js/deck.js';
import { checkAnswer, normalise, acceptedAnswers, makeCard } from '../js/quiz.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const text = fs.readFileSync(new URL('../data/de-top500.csv', import.meta.url), 'utf8');
const words = toWords(parseCsv(text));

ok('500 words parsed', words.length === 500);
const jahr = words.find(w => w.german === 'Jahr');
ok('Jahr has article das', jahr.article === 'das');
ok('Jahr display', germanDisplay(jahr) === 'das Jahr');
ok('Jahr plural', jahr.plural === 'Jahre');
const suchen = words.find(w => w.german === 'suchen');
ok('suchen has 2 glosses', suchen.english.length === 2);
ok('example preserved with comma', words.find(w => w.german === 'dass').exampleDe.includes(','));

// --- normalisation / umlaut tolerance
ok('gruen folds', normalise('grün') === normalise('gruen'));
ok('grun folds', normalise('grün') === normalise('grun'));
ok('sz folds', normalise('weiß') === normalise('weiss'));
ok('case+punct', normalise('Das Jahr!') === 'das jahr');

// --- answer checking
const gruen = words.find(w => w.german === 'grün');
ok('en-de exact', checkAnswer('grün', gruen, 'en-de').correct);
ok('en-de ue spelling', checkAnswer('gruen', gruen, 'en-de').correct);
ok('en-de bare u', checkAnswer('grun', gruen, 'en-de').correct);
ok('en-de wrong', !checkAnswer('blau', gruen, 'en-de').correct);

const gehen = words.find(w => w.german === 'gehen');
ok('de-en full gloss', checkAnswer('to go', gehen, 'de-en').correct);
ok('de-en without to', checkAnswer('go', gehen, 'de-en').correct);
ok('de-en second gloss', checkAnswer('to walk', gehen, 'de-en').correct);
ok('de-en wrong', !checkAnswer('to run', gehen, 'de-en').correct);

const der = words.find(w => w.german === 'der');
ok('parenthetical stripped', checkAnswer('the', der, 'de-en').correct);

// article handling
ok('noun without article accepted by default', checkAnswer('Jahr', jahr, 'en-de').correct);
ok('noun with article accepted', checkAnswer('das Jahr', jahr, 'en-de').correct);
ok('requireArticle rejects bare', !checkAnswer('Jahr', jahr, 'en-de', { requireArticle: true }).correct);
ok('requireArticle accepts full', checkAnswer('das Jahr', jahr, 'en-de', { requireArticle: true }).correct);
ok('requireArticle rejects wrong article', !checkAnswer('der Jahr', jahr, 'en-de', { requireArticle: true }).correct);

// typos
const r1 = checkAnswer('Jahrr', jahr, 'en-de', { allowTypos: true });
ok('typo forgiven + flagged', r1.correct && r1.typo);
ok('typo off rejects', !checkAnswer('Jahrr', jahr, 'en-de', { allowTypos: false }).correct);
ok('empty rejected', !checkAnswer('   ', jahr, 'en-de').correct);
ok('far-off word rejected', !checkAnswer('Haus', jahr, 'en-de').correct);

// --- selection
const nounsTop100 = selectWords(words, { posFilter: ['noun'], start: 1, end: 100, rangeMode: 'filter' });
ok('filter mode gives 100 nouns', nounsTop100.length === 100 && nounsTop100.every(w => w.pos === 'noun'));
ok('filter mode starts at most common noun', nounsTop100[0].german === 'Jahr');

const allRange = selectWords(words, { posFilter: ['noun'], start: 1, end: 100, rangeMode: 'all' });
ok('all mode is a subset of rank window', allRange.every(w => w.rank <= 100 && w.pos === 'noun'));
ok('all mode smaller than filter mode', allRange.length < nounsTop100.length);

const range200_400 = selectWords(words, { posFilter: null, start: 200, end: 400, rangeMode: 'all' });
ok('200-400 gives 201 words', range200_400.length === 201);
ok('200-400 respects bounds', range200_400[0].rank === 200 && range200_400[200].rank === 400);

const verbsAndNouns = selectWords(words, { posFilter: ['verb', 'noun'], start: 1, end: 500, rangeMode: 'all' });
ok('two-type filter', verbsAndNouns.length === 108 + 242);

const counts = countByPos(words);
ok('counts sum to 500', Object.values(counts).reduce((a, b) => a + b, 0) === 500);

// --- cards
const card = makeCard(jahr, 'de-en');
ok('card prompt is german', card.prompt === 'das Jahr');
ok('card expected is english', card.expected === 'year');
const card2 = makeCard(jahr, 'en-de');
ok('reverse card prompt', card2.prompt === 'year');
ok('reverse card expected', card2.expected === 'das Jahr');

// forgiving custom deck: only two columns
const mini = toWords(parseCsv('word,translation\nHund,dog\nKatze,cat\n'));
ok('2-column deck parses', mini.length === 2);
ok('2-column deck defaults pos', mini[0].pos === 'other');
ok('2-column deck defaults rank', mini[0].rank === 1 && mini[1].rank === 2);
ok('2-column deck answers', checkAnswer('dog', mini[0], 'de-en').correct);

// German header aliases
const de = toWords(parseCsv('Wort,Übersetzung,Wortart\nlaufen,to run,Verb\n'));
ok('german headers work', de.length === 1 && de[0].pos === 'verb');

// quoted field with embedded comma and doubled quote
const q = parseCsv('a,b\n"x, y","he said ""hi"""\n');
ok('embedded comma', q[0].a === 'x, y');
ok('doubled quote', q[0].b === 'he said "hi"');

// --- article grading detail
const haus = words.find((w) => w.german === 'Haus');
ok('wrongArticle flagged', checkAnswer('der Haus', haus, 'en-de', { requireArticle: true }).wrongArticle === true);
ok('missingArticle flagged', checkAnswer('Haus', haus, 'en-de', { requireArticle: true }).missingArticle === true);
ok('correct article passes', checkAnswer('das Haus', haus, 'en-de', { requireArticle: true }).correct);
ok('gender typo never forgiven when required', !checkAnswer('die Haus', haus, 'en-de', { requireArticle: true }).correct);
ok('article optional: wrong article ignored', checkAnswer('der Haus', haus, 'en-de', { requireArticle: false }).correct);
ok('article optional: bare noun fine', checkAnswer('Haus', haus, 'en-de').correct);
ok('article optional: typo in noun forgiven', checkAnswer('das Hauss', haus, 'en-de').correct);
ok('wrong noun still rejected with right article', !checkAnswer('das Buch', haus, 'en-de').correct);

// --- homographs that differ only by capitalisation must both survive
const essenN = words.find((w) => w.german === 'Essen' && w.pos === 'noun');
const essenV = words.find((w) => w.german === 'essen' && w.pos === 'verb');
ok('both Essen entries survive', Boolean(essenN) && Boolean(essenV));
ok('homograph ids differ', essenN.id !== essenV.id);
ok('Morgen/morgen both present', words.filter((w) => w.german.toLowerCase() === 'morgen').length === 2);
ok('Leben/leben both present', words.filter((w) => w.german.toLowerCase() === 'leben').length === 2);
ok('Wissen/wissen both present', words.filter((w) => w.german.toLowerCase() === 'wissen').length === 2);
ok('all ids unique', new Set(words.map((w) => w.id)).size === words.length);

// --- short words get no typo forgiveness
const bis = words.find((w) => w.german === 'bis');
ok('short word no typo budget', !checkAnswer('bei', bis, 'en-de').correct);
ok('short word exact still works', checkAnswer('bis', bis, 'en-de').correct);


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
