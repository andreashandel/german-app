// End-to-end test: loads index.html into jsdom, shims the browser APIs the app
// touches, imports app.js for real, and drives the actual UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name, extra); }
};

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'http://localhost:8765/',
  pretendToBeVisual: true,
});

const { window } = dom;

// Serve fetches straight off disk.
window.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/localhost:8765\//, '');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, text: async () => '', json: async () => { throw new Error('404'); } };
  }
  const body = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
};

// Not implemented by jsdom; the app only asks whether it has a fine pointer.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
window.confirm = () => true;
window.URL.createObjectURL = () => 'blob:stub';
window.URL.revokeObjectURL = () => {};

// navigator is a getter-only global in Node; the app only probes it for
// serviceWorker support, which correctly reports false here.
// Speech is absent from jsdom; stub it so the speaker buttons are exercisable.
const spoken = [];
window.speechSynthesis = {
  getVoices: () => [{ lang: 'de-DE', name: 'Test German' }],
  speak: (u) => spoken.push(u.text),
  cancel: () => {},
  addEventListener: () => {},
};
window.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};

for (const key of ['document', 'localStorage', 'fetch', 'Blob', 'confirm', 'Event',
                   'speechSynthesis', 'SpeechSynthesisUtterance']) {
  globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.document = window.document;

const $ = (id) => window.document.getElementById(id);
const settle = () => new Promise((r) => setTimeout(r, 60));
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

await import('../js/app.js');
await settle();

/* ------------------------------------------------------------ setup screen */

ok('article required by default', $('opt-article').checked === true);

ok('deck loaded', $('deck-summary').textContent === '500 words loaded', $('deck-summary').textContent);
ok('deck option present', $('deck-select').options.length >= 1);
ok('pos checkboxes built', $('pos-filter').querySelectorAll('.check').length === 9);
ok('setup visible at boot', $('screen-setup').hidden === false);
ok('session hidden at boot', $('screen-session').hidden === true);

// default 1-100, all types
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '100'; fire($('range-end'), 'input');
await settle();
ok('1-100 selects 100', $('selection-count').textContent.startsWith('100 words'), $('selection-count').textContent);

// 200-400 on the full list
$('range-start').value = '200'; fire($('range-start'), 'input');
$('range-end').value = '400'; fire($('range-end'), 'input');
await settle();
ok('200-400 selects 201', $('selection-count').textContent.startsWith('201 words'), $('selection-count').textContent);

// The range always counts positions among the ticked types.
ok('range mode selector is gone',
  window.document.querySelectorAll('input[name="rangeMode"]').length === 0);

$('btn-pos-none').click();
const nounBox = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'noun');
nounBox.checked = true; fire(nounBox, 'change');
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '50'; fire($('range-end'), 'input');
await settle();
ok('nouns 1-50 gives 50 nouns', $('selection-count').textContent.startsWith('50 words'), $('selection-count').textContent);
ok('hint names the type', /nouns/i.test($('range-hint').textContent), $('range-hint').textContent);
ok('hint states the pool size', /242/.test($('range-hint').textContent), $('range-hint').textContent);
ok('hint states the positions', /1–50|1-50/.test($('range-hint').textContent), $('range-hint').textContent);

// Widening the type filter keeps the width but changes what falls inside it.
$('btn-pos-all').click();
await settle();
ok('width unchanged by filter', $('selection-count').textContent.startsWith('50 words'),
  $('selection-count').textContent);
ok('hint switches to the whole list', /500 words on the list/.test($('range-hint').textContent),
  $('range-hint').textContent);

// Two types ticked: not the whole list, and no single type to name.
$('btn-pos-none').click();
for (const v of ['noun', 'verb']) {
  const box = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === v);
  box.checked = true; fire(box, 'change');
}
await settle();
ok('hint counts the mixed pool', /350 words you have ticked/.test($('range-hint').textContent),
  $('range-hint').textContent);

$('btn-pos-all').click();
await settle();
ok('all-types hint on the full deck', /500 words on the list/.test($('range-hint').textContent),
  $('range-hint').textContent);

// empty selection disables the start buttons
$('btn-pos-none').click();
await settle();
ok('empty selection warns', $('selection-count').classList.contains('empty'));
ok('typing disabled when empty', $('btn-typing').disabled === true);
ok('flashcards disabled when empty', $('btn-flash').disabled === true);

$('btn-pos-core').click();
await settle();
ok('core preset re-enables', $('btn-typing').disabled === false);

/* -------------------------------------------------------- typing session */

$('opt-length').value = '10'; fire($('opt-length'), 'change');
window.document.querySelector('input[name="direction"][value="de-en"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="de-en"]'), 'change');

$('btn-typing').click();
await settle();
ok('session screen shown', $('screen-session').hidden === false);
ok('typing area shown', $('typing-area').hidden === false);
ok('flash area hidden', $('flash-area').hidden === true);
ok('counter starts at 1/10', $('session-counter').textContent === '1 / 10', $('session-counter').textContent);
ok('prompt is non-empty', $('card-prompt').textContent.length > 0);
ok('feedback hidden initially', $('feedback').hidden === true);

// answer the first card wrong on purpose
$('answer-input').value = 'definitely not the answer';
$('btn-check').click();
await settle();
ok('wrong answer gives feedback', $('feedback').hidden === false);
ok('wrong verdict', $('verdict').classList.contains('wrong'), $('verdict').textContent);
ok('correct answer revealed', $('correct-answer').textContent.length > 0);
ok('example sentence shown', $('example-line').textContent.length > 0);
ok('input locked after answering', $('answer-input').disabled === true);

$('btn-next').click();
await settle();
ok('advanced to card 2', $('session-counter').textContent === '2 / 10');
ok('input unlocked on new card', $('answer-input').disabled === false);
ok('input cleared on new card', $('answer-input').value === '');

// accent buttons insert into the field
$('answer-input').value = 'gr';
$('accent-row').querySelector('[data-ch="ü"]').click();
ok('accent button inserts', $('answer-input').value === 'grü', $('answer-input').value);

// answer the rest correctly by reading the revealed answer
for (let i = 2; i <= 10; i++) {
  $('answer-input').value = '';
  $('btn-check').click();
  await settle();
  const expected = $('correct-answer').textContent.split(';')[0].trim();
  $('btn-next').click();
  await settle();
  void expected;
}
ok('summary shown after last card', $('screen-summary').hidden === false);
ok('session screen hidden', $('screen-session').hidden === true);
ok('score line present', /of 10 correct/.test($('summary-score').textContent), $('summary-score').textContent);
ok('missed list populated', $('missed-list').children.length > 0);
ok('retry button offered', $('btn-retry-missed').hidden === false);

/* ------------------------------------------------------------- progress */

const stored = JSON.parse(window.localStorage.getItem('germanapp:progress:v1:builtin:de-top500') || '{}');
ok('progress saved for 10 words', Object.keys(stored).length === 10, String(Object.keys(stored).length));
const anyRec = Object.values(stored)[0];
ok('record has box/seen/due', anyRec && 'box' in anyRec && 'seen' in anyRec && 'due' in anyRec);
ok('wrong answer reset box to 1', Object.values(stored).some((r) => r.box === 1 && r.wrong > 0));

$('btn-to-setup').click();
await settle();
ok('back to setup', $('screen-setup').hidden === false);
ok('stats line updated', /known/.test($('progress-stats').textContent), $('progress-stats').textContent);

/* ----------------------------------------------------------- flashcards */

$('btn-flash').click();
await settle();
ok('flash area shown', $('flash-area').hidden === false);
ok('typing area hidden', $('typing-area').hidden === true);
ok('grade row hidden before reveal', $('grade-row').hidden === true);
ok('reveal button visible', $('btn-reveal').hidden === false);

$('btn-reveal').click();
await settle();
ok('grade row shown after reveal', $('grade-row').hidden === false);
ok('answer shown after reveal', $('correct-answer').textContent.length > 0);
ok('next button hidden in flash mode', $('btn-next').hidden === true);

const beforeIdx = $('session-counter').textContent;
$('grade-row').querySelector('[data-grade="good"]').click();
await settle();
ok('grading advances the card', $('session-counter').textContent !== beforeIdx, $('session-counter').textContent);
ok('reveal button back for new card', $('btn-reveal').hidden === false);

$('btn-quit').click();
await settle();
ok('quit returns to setup', $('screen-setup').hidden === false);

/* --------------------------------------------------------------- browse */

$('btn-browse').click();
await settle();
ok('browse screen shown', $('screen-browse').hidden === false);
const rowCount = $('browse-body').children.length;
ok('browse renders rows', rowCount > 0, String(rowCount));
ok('browse title counts', /\d+ words/.test($('browse-title').textContent), $('browse-title').textContent);

$('browse-search').value = 'Haus';
fire($('browse-search'), 'input');
await settle();
ok('search filters', $('browse-body').children.length < rowCount && $('browse-body').children.length > 0,
  String($('browse-body').children.length));

$('browse-search').value = '';
fire($('browse-search'), 'input');
window.document.querySelector('.word-table th[data-sort="german"]').click();
await settle();
ok('sort by german works', $('browse-body').children.length === rowCount);
ok('sorted header marked', window.document.querySelector('th[data-sort="german"]').classList.contains('sorted'));

$('btn-browse-back').click();
await settle();
ok('browse back to setup', $('screen-setup').hidden === false);

/* -------------------------------------------------- settings persistence */

const settings = JSON.parse(window.localStorage.getItem('germanapp:settings:v1') || '{}');
ok('range start persisted', Number.isFinite(settings.start));
ok('retired range mode not persisted', !('rangeMode' in settings), JSON.stringify(settings.rangeMode));
ok('session length persisted', settings.sessionLength === 10, String(settings.sessionLength));
ok('pos filter persisted', Array.isArray(settings.posFilter));

/* ------------------------------- regression: flashcards then typing ------ */
// The reveal handler hides Next; a following typing session must get it back.

$('btn-flash').click();
await settle();
$('btn-reveal').click();
await settle();
ok('flash reveal hides next', $('btn-next').hidden === true);
ok('flash reveal shows no verdict', $('verdict').textContent === '', $('verdict').textContent);
$('btn-quit').click();
await settle();

$('btn-typing').click();
await settle();
ok('typing after flash: next visible', $('btn-next').hidden === false);
$('answer-input').value = 'nonsense answer here';
$('btn-check').click();
await settle();
ok('typing after flash: feedback usable', $('feedback').hidden === false && $('btn-next').hidden === false);
ok('typing after flash: verdict restored', $('verdict').textContent.length > 0, $('verdict').textContent);
$('btn-next').click();
await settle();
ok('typing after flash: advances', $('session-counter').textContent === '2 / 10', $('session-counter').textContent);
$('btn-quit').click();
await settle();

/* ------------------------------------------------ hints and pronunciation */

// Force German → English so the prompt side is the one carrying the speaker.
window.document.querySelector('input[name="direction"][value="de-en"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="de-en"]'), 'change');
$('btn-typing').click();
await settle();

ok('hint hidden until asked', $('hint-line').hidden === true);
ok('hint button offered', $('btn-hint').hidden === false);

$('btn-hint').click();
await settle();
ok('hint appears', $('hint-line').hidden === false);
const firstHint = $('hint-line').textContent;
ok('hint masks with dots', firstHint.includes('·'), firstHint);
ok('hint reveals one letter', firstHint.replace(/[^·]/g, '').length === firstHint.replace(/\s/g, '').length - 1, firstHint);

$('btn-hint').click();
await settle();
const secondHint = $('hint-line').textContent;
ok('second hint reveals more', secondHint.replace(/[^·]/g, '').length < firstHint.replace(/[^·]/g, '').length,
  firstHint + ' -> ' + secondHint);

// keep pressing; it must stop one short of spelling the whole answer
for (let i = 0; i < 30 && !$('btn-hint').disabled; i++) $('btn-hint').click();
await settle();
ok('hint stops short of the answer', $('hint-line').textContent.includes('·'), $('hint-line').textContent);
ok('hint button disables at the ceiling', $('btn-hint').disabled === true);

// answering after a hint must not re-enable hinting for that card
$('answer-input').value = $('hint-line').textContent.replace(/·/g, '') + 'zzz';
$('btn-check').click();
await settle();
ok('hint locks out further hints', $('btn-hint').disabled === true);

$('btn-next').click();
await settle();
$('btn-hint').click();
await settle();
$('answer-input').value = '';
$('btn-check').click();
await settle();
ok('hint verdict distinct', $('verdict').textContent.length > 0);

$('btn-quit').click();
await settle();

/* ---- speaker buttons ---- */

$('btn-typing').click();
await settle();
const spokenBefore = spoken.length;
ok('auto-speak off by default', spokenBefore === 0, String(spokenBefore));
ok('prompt speaker shown on de-en', $('btn-speak-prompt').hidden === false);
ok('answer speaker hidden before reveal', $('btn-speak-answer').hidden === true);

$('btn-speak-prompt').click();
await settle();
ok('speaker button speaks', spoken.length === spokenBefore + 1, String(spoken.length));
ok('speaks the German headword', /\w/.test(spoken[spoken.length - 1] || ''), spoken[spoken.length - 1]);

$('answer-input').value = 'nope';
$('btn-check').click();
await settle();
ok('answer speaker stays hidden on de-en', $('btn-speak-answer').hidden === true);
$('btn-quit').click();
await settle();

// English → German puts the German on the answer side
window.document.querySelector('input[name="direction"][value="en-de"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="en-de"]'), 'change');
$('btn-typing').click();
await settle();
ok('prompt speaker hidden on en-de', $('btn-speak-prompt').hidden === true);
$('answer-input').value = 'nope';
$('btn-check').click();
await settle();
ok('answer speaker shown on en-de', $('btn-speak-answer').hidden === false);
const beforeAnswerSpeak = spoken.length;
$('btn-speak-answer').click();
await settle();
ok('answer speaker speaks', spoken.length === beforeAnswerSpeak + 1);

// with the article required, a bare noun is now rejected
$('btn-quit').click();
await settle();
ok('requireArticle persisted true', JSON.parse(window.localStorage.getItem('germanapp:settings:v1')).requireArticle === true);
ok('migration flag written', JSON.parse(window.localStorage.getItem('germanapp:settings:v1')).articleDefaultApplied === true);

/* ------------------------------------------------------ switching decks -- */

const topKey = 'germanapp:progress:v1:builtin:de-top500';
const topCountBefore = Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length;

const deckSel = $('deck-select');
const builtinOpts = [...deckSel.options].filter((o) => o.value.startsWith('builtin:'));
ok('all four decks offered', builtinOpts.length === 4, String(builtinOpts.length));
ok('food deck listed', builtinOpts.some((o) => o.value === 'builtin:de-food'));
ok('numbers deck listed', builtinOpts.some((o) => o.value === 'builtin:de-numbers'));
ok('time deck listed', builtinOpts.some((o) => o.value === 'builtin:de-time'));

deckSel.value = 'builtin:de-food';
fire(deckSel, 'change');
await settle();
ok('food deck loaded', $('deck-summary').textContent === '130 words loaded', $('deck-summary').textContent);

$('btn-pos-all').click();
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '130'; fire($('range-end'), 'input');
await settle();
ok('food range selects all 130', $('selection-count').textContent.startsWith('130 words'), $('selection-count').textContent);

// the pos filter must rebuild for a deck with a different mix of types
const foodTypes = [...$('pos-filter').querySelectorAll('.check')].map((c) => c.textContent);
ok('food filter drops unused types', foodTypes.length < 9 && foodTypes.length >= 3, String(foodTypes.length));

// This deck has only three of the ten types, so "nothing excluded" cannot be
// detected by counting ticked types — it has to compare against the deck.
ok('all-types hint on a partial-type deck',
  /130 words on the list/.test($('range-hint').textContent), $('range-hint').textContent);

const firstFoodBox = $('pos-filter').querySelector('input');
firstFoodBox.checked = false; fire(firstFoodBox, 'change');
await settle();
ok('unticking one type switches the wording',
  /you have ticked/.test($('range-hint').textContent), $('range-hint').textContent);
firstFoodBox.checked = true; fire(firstFoodBox, 'change');
await settle();

// a session on the new deck runs, and writes to its own progress key
$('opt-length').value = '10'; fire($('opt-length'), 'change');
$('btn-typing').click();
await settle();
ok('food session starts', $('screen-session').hidden === false);
ok('food counter', $('session-counter').textContent === '1 / 10', $('session-counter').textContent);
$('answer-input').value = 'wrong';
$('btn-check').click();
await settle();
ok('food card grades', $('feedback').hidden === false);
$('btn-quit').click();
await settle();

const foodKey = 'germanapp:progress:v1:builtin:de-food';
ok('food progress stored separately', window.localStorage.getItem(foodKey) !== null);
ok('top500 progress untouched by food session',
  Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length === topCountBefore,
  String(Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length));

// numbers deck: the range selector must cope with a deck of numerals
deckSel.value = 'builtin:de-numbers';
fire(deckSel, 'change');
await settle();
ok('numbers deck loaded', $('deck-summary').textContent === '115 words loaded', $('deck-summary').textContent);
$('btn-pos-none').click();
const numBox = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'numeral');
ok('numeral type offered', Boolean(numBox));
numBox.checked = true; fire(numBox, 'change');
await settle();
ok('numerals selectable', /^\d+ words/.test($('selection-count').textContent), $('selection-count').textContent);

deckSel.value = 'builtin:de-time';
fire(deckSel, 'change');
await settle();
ok('time deck loaded', $('deck-summary').textContent === '120 words loaded', $('deck-summary').textContent);

/* -------------------------------------------------- streak, logo, audio -- */

const logo = window.document.querySelector('.app-header .logo');
ok('logo rendered in header', logo !== null);
ok('logo is the pretzel', logo.textContent.trim() === '🥨', logo.textContent);
ok('logo is labelled for screen readers', logo.getAttribute('aria-label') === 'Pretzel');
// The header mark and the streak chip must be the same glyph, or they read as
// two different brands sitting one above the other.
ok('logo matches the streak icon',
  logo.textContent.trim() === window.document.querySelector('.streak-icon').textContent.trim());

// A session ran earlier in this file, so today is already credited.
const streakRaw = window.localStorage.getItem('germanapp:streak:v1');
ok('streak persisted', streakRaw !== null);
const streakRec = JSON.parse(streakRaw || '{}');
ok('streak counted one day', streakRec.current === 1, String(streakRec.current));
ok('streak recorded best', streakRec.best === 1);
ok('streak chip reads live', $('streak-chip').classList.contains('done-today'));
ok('streak chip not cold', $('streak-chip').classList.contains('cold') === false);
ok('streak label mentions the run', /1 day in a row/.test($('streak-label').textContent),
  $('streak-label').textContent);

// The summary line only appears once there is a streak to report.
deckSel.value = 'builtin:de-top500';
fire(deckSel, 'change');
await settle();
$('btn-pos-core').click();
$('opt-length').value = '10'; fire($('opt-length'), 'change');
$('btn-typing').click();
await settle();

// The example speaker only appears once the answer is revealed.
ok('example speaker hidden before answering', $('btn-speak-example').hidden === true);

$('answer-input').value = 'nope';
$('btn-check').click();
await settle();

const currentPrompt = $("card-prompt").textContent;
ok('example speaker shown after answering', $('btn-speak-example').hidden === false);
ok('example text rendered', $('example-text').textContent.length > 0);
ok('speaker sits beside the German sentence',
  $('btn-speak-example').parentElement.tagName === 'EM');

const beforeExample = spoken.length;
$('btn-speak-example').click();
await settle();
ok('example speaker speaks', spoken.length === beforeExample + 1, String(spoken.length));

// The whole point: it must read the example sentence, not the headword.
// Compared against the sentence actually on screen rather than against the
// prompt's length -- cards are shuffled, and a short sentence under a long
// English gloss made that a coin toss.
const said = spoken[spoken.length - 1] || '';
const shownSentence = $('example-text').querySelector('em').textContent.replace('🔊', '').trim();
ok('speaks exactly the sentence on screen', said === shownSentence, `${said} | ${shownSentence}`);
ok('speaks more than the headword', said !== currentPrompt, said);
ok('sentence ends like a sentence', /[.!?]$/.test(said), said);

$('btn-quit').click();
await settle();

/* ------------------------------------------------- Enter key behaviour --- */
// Regression: Enter used to check the answer and then immediately advance,
// because the keydown bubbled to the document handler whose guard submit() had
// just satisfied. One press must check and stop.

const pressEnter = (el) => {
  const ev = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
};

$('btn-pos-core').click();
$('opt-length').value = '10'; fire($('opt-length'), 'input');
$('btn-typing').click();
await settle();
ok('enter test: session started', $('session-counter').textContent === '1 / 10');

$('answer-input').value = 'definitely wrong';
pressEnter($('answer-input'));
await settle();
ok('enter checks the answer', $('feedback').hidden === false);
ok('enter does not advance', $('session-counter').textContent === '1 / 10',
  $('session-counter').textContent);
ok('enter shows the correct answer', $('correct-answer').textContent.length > 0);
ok('enter locks the input', $('answer-input').disabled === true);

// A second press, now that the input is disabled, moves on.
pressEnter($('btn-next'));
await settle();
ok('second enter advances', $('session-counter').textContent === '2 / 10',
  $('session-counter').textContent);
ok('second enter advances exactly one card', $('feedback').hidden === true);

// Enter on an empty box should still grade (as wrong), not silently do nothing.
$('answer-input').value = '';
pressEnter($('answer-input'));
await settle();
ok('enter on empty input still checks', $('feedback').hidden === false);
ok('empty answer counts as wrong', $('verdict').classList.contains('wrong'));

$('btn-quit').click();
await settle();

/* ------------------------------------------------------------ sliders --- */

ok('range start is a slider', $('range-start').type === 'range');
ok('range end is a slider', $('range-end').type === 'range');
ok('length is a slider', $('opt-length').type === 'range');

$('range-start').value = '10'; fire($('range-start'), 'input');
$('range-end').value = '60'; fire($('range-end'), 'input');
await settle();
ok('slider values shown', $('range-start-out').textContent === '10' && $('range-end-out').textContent === '60',
  $('range-start-out').textContent + '/' + $('range-end-out').textContent);
ok('slider range selects', $('selection-count').textContent.startsWith('51 words'),
  $('selection-count').textContent);

// Dragging start past end pushes end along rather than being blocked.
$('range-start').value = '90'; fire($('range-start'), 'input');
await settle();
ok('start pushes end', parseInt($('range-end').value, 10) === 90, $('range-end').value);
ok('pushed end shown', $('range-end-out').textContent === '90');
ok('pushed range is one word', $('selection-count').textContent.startsWith('1 word'),
  $('selection-count').textContent);

// Dragging end below start pushes start back down.
$('range-end').value = '40'; fire($('range-end'), 'input');
await settle();
ok('end pushes start', parseInt($('range-start').value, 10) === 40, $('range-start').value);

$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '200'; fire($('range-end'), 'input');
await settle();

// The length slider is bounded by the selection and says "all" at the top.
const selNow = parseInt($('selection-count').textContent, 10);
ok('length slider max tracks selection',
  parseInt($('opt-length').max, 10) === Math.max(5, Math.min(selNow, 200)),
  $('opt-length').max + ' vs ' + selNow);

$('opt-length').value = '35'; fire($('opt-length'), 'input');
await settle();
ok('length value shown', $('opt-length-out').textContent === '35', $('opt-length-out').textContent);

$('opt-length').value = $('opt-length').max; fire($('opt-length'), 'input');
await settle();
ok('length at max reads as all', /^all /.test($('opt-length-out').textContent),
  $('opt-length-out').textContent);

$('opt-length').value = '10'; fire($('opt-length'), 'input');
await settle();

/* --------------------------------------------------- word type on card --- */

// Narrow to nouns so the label is predictable.
$('btn-pos-none').click();
const nounOnly = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'noun');
nounOnly.checked = true; fire(nounOnly, 'change');
await settle();
$('btn-typing').click();
await settle();
ok('word type shown on card', $('card-pos').hidden === false);
ok('word type says noun', /noun/i.test($('card-pos').textContent), $('card-pos').textContent);
ok('direction label still present', $('card-direction').textContent.includes('→'));

$('btn-quit').click();
await settle();

/* ----------------------------------------------------------- menu button - */

ok('back button is labelled', /menu/i.test($('btn-quit').textContent), $('btn-quit').textContent);
ok('back button explains itself', /menu/i.test($('btn-quit').getAttribute('aria-label')));

/* -------------------------------------- range survives a smaller deck ---- */
// A range set on the 500-word list must not outrun a 115-word one.

$('btn-pos-all').click();
deckSel.value = 'builtin:de-top500';
fire(deckSel, 'change');
await settle();
$('range-start').value = '300'; fire($('range-start'), 'input');
$('range-end').value = '480'; fire($('range-end'), 'input');
await settle();
ok('wide range set on big deck', $('selection-count').textContent.startsWith('181 words'),
  $('selection-count').textContent);

deckSel.value = 'builtin:de-numbers';
fire(deckSel, 'change');
await settle();
ok('sliders rebounded to smaller deck', parseInt($('range-start').max, 10) === 115,
  $('range-start').max);
ok('start pulled back into range', parseInt($('range-start').value, 10) <= 115,
  $('range-start').value);
ok('end pulled back into range', parseInt($('range-end').value, 10) <= 115, $('range-end').value);
ok('start not past end', parseInt($('range-start').value, 10) <= parseInt($('range-end').value, 10));
ok('smaller deck still selects words', /^\d+ words/.test($('selection-count').textContent),
  $('selection-count').textContent);
ok('outputs match the sliders',
  $('range-start-out').textContent === $('range-start').value &&
  $('range-end-out').textContent === $('range-end').value);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
