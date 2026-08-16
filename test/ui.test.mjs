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
  if (!fs.existsSync(file)) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => fs.readFileSync(file, 'utf8') };
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

// nouns only, positions within the filter
$('btn-pos-none').click();
const nounBox = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'noun');
nounBox.checked = true; fire(nounBox, 'change');
window.document.querySelector('input[name="rangeMode"][value="filter"]').checked = true;
fire(window.document.querySelector('input[name="rangeMode"][value="filter"]'), 'change');
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '50'; fire($('range-end'), 'input');
await settle();
ok('nouns 1-50 in filter mode', $('selection-count').textContent.startsWith('50 words'), $('selection-count').textContent);
ok('range hint explains filter mode', $('range-hint').textContent.includes('most common nouns'));

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
ok('settings persisted', settings.rangeMode === 'filter' || settings.rangeMode === 'all');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
