// UI wiring: setup screen, typing and flashcard sessions, summary, browse.

import { parseCsv, toWords, germanDisplay, englishDisplay, POS_VALUES, POS_LABELS } from './csv.js';
import { selectWords, countByPos, shuffle, rankExtent } from './deck.js';
import { checkAnswer, makeCard } from './quiz.js';
import {
  loadProgress,
  saveProgress,
  recordResult,
  dueWords,
  hardWords,
  summarise,
  exportProgress,
  importProgress,
  resetProgress,
  loadSettings,
  saveSettings,
} from './progress.js';

const CUSTOM_DECKS_KEY = 'germanapp:decks:v1';

const $ = (id) => document.getElementById(id);

const state = {
  deckId: '',
  deckName: '',
  words: [],
  progress: {},
  settings: {
    posFilter: [...POS_VALUES],
    start: 1,
    end: 100,
    rangeMode: 'all',
    direction: 'de-en',
    allowTypos: true,
    requireArticle: false,
    showExamples: true,
    audio: false,
    sessionLength: 20,
  },
  session: null,
};

/* ------------------------------------------------------------------ decks */

function readCustomDecks() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_DECKS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCustomDeck(id, name, csv) {
  const decks = readCustomDecks();
  decks[id] = { name, csv };
  try {
    localStorage.setItem(CUSTOM_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // Too big for storage: the deck still works for this visit, it just will
    // not be remembered next time.
  }
}

async function loadBuiltInDecks() {
  try {
    const res = await fetch('data/manifest.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    /* fall through to the default below */
  }
  return [{ id: 'de-top500', name: 'German — 500 most common words', file: 'data/de-top500.csv' }];
}

function populateDeckSelect(builtIns) {
  const select = $('deck-select');
  select.innerHTML = '';

  for (const deck of builtIns) {
    const opt = document.createElement('option');
    opt.value = `builtin:${deck.id}`;
    opt.textContent = deck.name;
    opt.dataset.file = deck.file;
    select.append(opt);
  }

  const custom = readCustomDecks();
  for (const [id, deck] of Object.entries(custom)) {
    const opt = document.createElement('option');
    opt.value = `custom:${id}`;
    opt.textContent = `${deck.name} (yours)`;
    select.append(opt);
  }
}

async function activateDeck(value) {
  const select = $('deck-select');
  select.value = value;
  const option = select.selectedOptions[0];
  if (!option) return;

  if (value.startsWith('builtin:')) {
    const res = await fetch(option.dataset.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${option.dataset.file}`);
    state.words = toWords(parseCsv(await res.text()));
  } else {
    const deck = readCustomDecks()[value.slice('custom:'.length)];
    state.words = deck ? toWords(parseCsv(deck.csv)) : [];
  }

  state.deckId = value;
  state.deckName = option.textContent;
  state.progress = loadProgress(value);

  const extent = rankExtent(state.words);
  $('deck-summary').textContent = `${state.words.length} words loaded`;
  $('range-start').max = String(extent.max);
  $('range-end').max = String(extent.max);
  if (state.settings.end > extent.max) {
    state.settings.end = Math.min(100, extent.max);
    $('range-end').value = String(state.settings.end);
  }

  buildPosFilter();
  refreshSelection();
}

/* --------------------------------------------------------- setup controls */

function buildPosFilter() {
  const container = $('pos-filter');
  const counts = countByPos(state.words);
  container.querySelectorAll('.check').forEach((el) => el.remove());

  for (const pos of POS_VALUES) {
    if (!counts[pos]) continue;
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `
      <input type="checkbox" value="${pos}" ${state.settings.posFilter.includes(pos) ? 'checked' : ''} />
      <span>${POS_LABELS[pos]} <span class="pos-count">${counts[pos]}</span></span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.settings.posFilter = [...container.querySelectorAll('input:checked')].map((i) => i.value);
      persistSettings();
      refreshSelection();
    });
    container.append(label);
  }
}

/** The words the current settings select, used for counts and for starting a session. */
function currentSelection() {
  return selectWords(state.words, {
    posFilter: state.settings.posFilter,
    start: Math.max(1, state.settings.start),
    end: Math.max(1, state.settings.end),
    rangeMode: state.settings.rangeMode,
  });
}

function refreshSelection() {
  const selected = currentSelection();
  const countEl = $('selection-count');
  countEl.textContent =
    selected.length === 0
      ? 'No words match — widen the range or pick more word types'
      : `${selected.length} word${selected.length === 1 ? '' : 's'} selected`;
  countEl.classList.toggle('empty', selected.length === 0);

  for (const id of ['btn-typing', 'btn-flash', 'btn-browse']) {
    $(id).disabled = selected.length === 0;
  }

  $('range-hint').textContent =
    state.settings.rangeMode === 'all'
      ? 'Counting positions on the whole frequency list, then keeping the types you ticked.'
      : 'Counting positions among the ticked types only — so “Nouns, 1 to 100” means the 100 most common nouns.';

  const stats = summarise(state.words, state.progress);
  const due = dueWords(state.words, state.progress).length;
  const hard = hardWords(state.words, state.progress).length;
  $('progress-stats').textContent = `${stats.mastered} known · ${stats.learning} learning · ${stats.unseen} not seen yet · ${due} due now`;
  $('btn-due').textContent = `Review what is due (${due})`;
  $('btn-hard').textContent = `Practice hard words (${hard})`;
  $('btn-due').disabled = due === 0;
  $('btn-hard').disabled = hard === 0;
}

function persistSettings() {
  saveSettings(state.settings);
}

function applySettingsToForm() {
  $('range-start').value = String(state.settings.start);
  $('range-end').value = String(state.settings.end);
  $('opt-typos').checked = state.settings.allowTypos;
  $('opt-article').checked = state.settings.requireArticle;
  $('opt-examples').checked = state.settings.showExamples;
  $('opt-audio').checked = state.settings.audio;
  $('opt-length').value = String(state.settings.sessionLength);
  document.querySelector(`input[name="rangeMode"][value="${state.settings.rangeMode}"]`).checked = true;
  document.querySelector(`input[name="direction"][value="${state.settings.direction}"]`).checked = true;
}

/* -------------------------------------------------------------- speaking */

let germanVoice = null;

function pickGermanVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  germanVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('de')) || null;
}

function speakGerman(text) {
  if (!state.settings.audio || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'de-DE';
    if (germanVoice) utter.voice = germanVoice;
    utter.rate = 0.9;
    speechSynthesis.speak(utter);
  } catch {
    /* speech is a bonus, never a blocker */
  }
}

/* --------------------------------------------------------------- screens */

function showScreen(name) {
  for (const id of ['setup', 'session', 'summary', 'browse']) {
    $(`screen-${id}`).hidden = id !== name;
  }
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------- session */

function startSession(mode, words) {
  if (words.length === 0) return;

  const limit = state.settings.sessionLength;
  const pool = shuffle(words);
  const chosen = limit > 0 ? pool.slice(0, limit) : pool;

  state.session = {
    mode,
    cards: chosen.map((w) => makeCard(w, state.settings.direction)),
    index: 0,
    results: [],
    sourceWords: words,
  };

  $('typing-area').hidden = mode !== 'typing';
  $('flash-area').hidden = mode !== 'flash';
  showScreen('session');
  renderCard();
}

function currentCard() {
  return state.session.cards[state.session.index];
}

function renderCard() {
  const session = state.session;
  const card = currentCard();

  $('session-counter').textContent = `${session.index + 1} / ${session.cards.length}`;
  $('progress-fill').style.width = `${(session.index / session.cards.length) * 100}%`;
  $('card-direction').textContent = `${card.fromLabel} → ${card.toLabel}`;
  $('card-prompt').textContent = card.prompt;

  // A plural is a hint about the word being asked, so it only shows on the
  // German side where it is not giving away the answer.
  $('card-extra').textContent =
    card.dir === 'de-en' && card.word.plural ? `plural: die ${card.word.plural}` : '';

  $('feedback').hidden = true;
  $('answer-input').value = '';
  $('answer-input').disabled = false;
  $('btn-check').disabled = false;
  $('btn-reveal').hidden = false;
  $('grade-row').hidden = true;
  // Flashcards advance via the grade buttons, typing advances via Next. Reset
  // it every card so a previous flashcard session cannot leave it hidden.
  $('btn-next').hidden = session.mode !== 'typing';

  if (session.mode === 'typing') {
    // Focus only on a device with a real keyboard: pulling up the iPad
    // keyboard automatically hides half the card.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      $('answer-input').focus();
    }
  }

  if (card.dir === 'de-en') speakGerman(card.word.german);
}

function showFeedback({ correct, typo, missingArticle, wrongArticle }) {
  const card = currentCard();
  const verdict = $('verdict');

  // Revealing a flashcard is not a judgement — she grades herself next.
  if (state.session.mode === 'flash') {
    verdict.textContent = '';
    verdict.className = 'verdict';
  } else if (correct && typo) {
    verdict.textContent = 'Close enough — check the spelling';
    verdict.className = 'verdict typo';
  } else if (correct) {
    verdict.textContent = 'Correct';
    verdict.className = 'verdict correct';
  } else if (wrongArticle) {
    verdict.textContent = 'Right word, wrong article';
    verdict.className = 'verdict wrong';
  } else if (missingArticle) {
    verdict.textContent = 'Add the article';
    verdict.className = 'verdict wrong';
  } else {
    verdict.textContent = 'Not quite';
    verdict.className = 'verdict wrong';
  }

  $('correct-answer').textContent = card.expected;

  const exampleEl = $('example-line');
  if (state.settings.showExamples && card.word.exampleDe) {
    exampleEl.innerHTML = '';
    const de = document.createElement('em');
    de.textContent = card.word.exampleDe;
    exampleEl.append(de, document.createTextNode(card.word.exampleEn || ''));
  } else {
    exampleEl.textContent = '';
  }

  $('feedback').hidden = false;
  if (card.dir === 'en-de') speakGerman(card.word.german);
}

function gradeCard(grade) {
  const card = currentCard();
  recordResult(state.progress, card.word.id, grade);
  saveProgress(state.deckId, state.progress);
  state.session.results.push({ card, correct: grade !== 'again' });
}

function nextCard() {
  const session = state.session;
  session.index += 1;
  if (session.index >= session.cards.length) finishSession();
  else renderCard();
}

function finishSession() {
  const { results } = state.session;
  const correct = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);

  $('summary-score').textContent = `${correct} of ${results.length} correct`;
  $('missed-heading').textContent = missed.length ? 'Words to review' : 'Nothing missed — nicely done';

  const list = $('missed-list');
  list.innerHTML = '';
  for (const { card } of missed) {
    const li = document.createElement('li');
    const de = document.createElement('span');
    de.className = 'de';
    de.textContent = germanDisplay(card.word);
    const en = document.createElement('span');
    en.className = 'en';
    en.textContent = englishDisplay(card.word);
    li.append(de, en);
    list.append(li);
  }

  $('btn-retry-missed').hidden = missed.length === 0;
  showScreen('summary');
  refreshSelection();
}

/* ---------------------------------------------------------------- browse */

let browseSort = { key: 'rank', asc: true };

function renderBrowse(words) {
  const query = $('browse-search').value.trim().toLowerCase();
  const filtered = query
    ? words.filter(
        (w) =>
          w.german.toLowerCase().includes(query) ||
          w.english.join(' ').toLowerCase().includes(query)
      )
    : words;

  const sorted = [...filtered].sort((a, b) => {
    const { key, asc } = browseSort;
    const va = key === 'rank' ? a.rank : key === 'english' ? a.english[0] : a[key];
    const vb = key === 'rank' ? b.rank : key === 'english' ? b.english[0] : b[key];
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de');
    return asc ? cmp : -cmp;
  });

  const body = $('browse-body');
  body.innerHTML = '';
  for (const w of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="num">${w.rank}</td>
      <td class="de">${escapeHtml(germanDisplay(w))}</td>
      <td>${escapeHtml(englishDisplay(w))}</td>
      <td class="pos">${POS_LABELS[w.pos]}</td>`;
    body.append(tr);
  }

  document.querySelectorAll('.word-table th').forEach((th) => {
    const active = th.dataset.sort === browseSort.key;
    th.classList.toggle('sorted', active);
    th.classList.toggle('asc', active && browseSort.asc);
  });

  $('browse-title').textContent = `${sorted.length} words`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/* ------------------------------------------------------------------ wire */

function wireSetup() {
  $('deck-select').addEventListener('change', (e) => {
    activateDeck(e.target.value).catch((err) => {
      $('deck-note').textContent = err.message;
    });
  });

  $('btn-load-csv').addEventListener('click', () => $('file-input').click());

  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = toWords(parseCsv(text));
      if (parsed.length === 0) {
        $('deck-note').textContent =
          'No usable rows — the file needs a German column and an English column.';
        return;
      }
      const id = file.name.replace(/\.csv$/i, '');
      writeCustomDeck(id, id, text);
      const builtIns = await loadBuiltInDecks();
      populateDeckSelect(builtIns);
      await activateDeck(`custom:${id}`);
      $('deck-note').textContent = `Loaded ${parsed.length} words from ${file.name}.`;
    } catch (err) {
      $('deck-note').textContent = `Could not read that file: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });

  const onRange = () => {
    state.settings.start = parseInt($('range-start').value, 10) || 1;
    state.settings.end = parseInt($('range-end').value, 10) || 1;
    persistSettings();
    refreshSelection();
  };
  $('range-start').addEventListener('input', onRange);
  $('range-end').addEventListener('input', onRange);

  document.querySelectorAll('input[name="rangeMode"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.settings.rangeMode = el.value;
      persistSettings();
      refreshSelection();
    })
  );

  document.querySelectorAll('input[name="direction"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.settings.direction = el.value;
      persistSettings();
    })
  );

  const setPos = (values) => {
    state.settings.posFilter = values;
    buildPosFilter();
    persistSettings();
    refreshSelection();
  };
  $('btn-pos-all').addEventListener('click', () => setPos([...POS_VALUES]));
  $('btn-pos-none').addEventListener('click', () => setPos([]));
  $('btn-pos-core').addEventListener('click', () => setPos(['noun', 'verb', 'adjective']));

  const bindOption = (id, key) =>
    $(id).addEventListener('change', (e) => {
      state.settings[key] = e.target.checked;
      persistSettings();
    });
  bindOption('opt-typos', 'allowTypos');
  bindOption('opt-article', 'requireArticle');
  bindOption('opt-examples', 'showExamples');
  bindOption('opt-audio', 'audio');

  $('opt-length').addEventListener('change', (e) => {
    state.settings.sessionLength = parseInt(e.target.value, 10);
    persistSettings();
  });

  $('btn-typing').addEventListener('click', () => startSession('typing', currentSelection()));
  $('btn-flash').addEventListener('click', () => startSession('flash', currentSelection()));
  $('btn-browse').addEventListener('click', () => {
    renderBrowse(currentSelection());
    showScreen('browse');
  });

  $('btn-due').addEventListener('click', () =>
    startSession('typing', dueWords(currentSelection(), state.progress))
  );
  $('btn-hard').addEventListener('click', () =>
    startSession('typing', hardWords(currentSelection(), state.progress))
  );

  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([exportProgress(state.deckId)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `german-progress-${state.deckId.replace(/[:]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('btn-import').addEventListener('click', () => $('import-input').click());
  $('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const count = importProgress(state.deckId, await file.text());
      state.progress = loadProgress(state.deckId);
      refreshSelection();
      $('deck-note').textContent = `Imported progress for ${count} words.`;
    } catch (err) {
      $('deck-note').textContent = `Could not import: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm(`Erase all progress for “${state.deckName}”? This cannot be undone.`)) return;
    resetProgress(state.deckId);
    state.progress = {};
    refreshSelection();
  });
}

function wireSession() {
  const submit = () => {
    const card = currentCard();
    const result = checkAnswer($('answer-input').value, card.word, card.dir, {
      allowTypos: state.settings.allowTypos,
      requireArticle: state.settings.requireArticle,
    });
    gradeCard(result.correct ? 'good' : 'again');
    $('answer-input').disabled = true;
    $('btn-check').disabled = true;
    showFeedback(result);
    $('btn-next').focus();
  };

  $('btn-check').addEventListener('click', submit);
  $('answer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  $('accent-row').addEventListener('click', (e) => {
    const ch = e.target.dataset?.ch;
    if (!ch) return;
    const input = $('answer-input');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + ch + input.value.slice(end);
    input.setSelectionRange(start + 1, start + 1);
    input.focus();
  });

  $('btn-reveal').addEventListener('click', () => {
    $('btn-reveal').hidden = true;
    $('grade-row').hidden = false;
    showFeedback({ correct: true, typo: false });
    $('btn-next').hidden = true;
  });

  $('grade-row').addEventListener('click', (e) => {
    const grade = e.target.dataset?.grade;
    if (!grade) return;
    gradeCard(grade);
    nextCard();
  });

  $('btn-next').addEventListener('click', nextCard);

  document.addEventListener('keydown', (e) => {
    if ($('screen-session').hidden) return;
    if (e.key === 'Enter' && !$('feedback').hidden && !$('btn-next').hidden) {
      e.preventDefault();
      nextCard();
    }
  });

  $('btn-quit').addEventListener('click', () => {
    state.session = null;
    showScreen('setup');
    refreshSelection();
  });
}

function wireSummary() {
  $('btn-retry-missed').addEventListener('click', () => {
    const missed = state.session.results.filter((r) => !r.correct).map((r) => r.card.word);
    startSession(state.session.mode, missed);
  });
  $('btn-again-same').addEventListener('click', () => {
    startSession(state.session.mode, state.session.sourceWords);
  });
  $('btn-to-setup').addEventListener('click', () => showScreen('setup'));
}

function wireBrowse() {
  $('btn-browse-back').addEventListener('click', () => showScreen('setup'));
  $('browse-search').addEventListener('input', () => renderBrowse(currentSelection()));
  document.querySelectorAll('.word-table th').forEach((th) =>
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      browseSort = { key, asc: browseSort.key === key ? !browseSort.asc : true };
      renderBrowse(currentSelection());
    })
  );
}

/* ------------------------------------------------------------------ boot */

async function init() {
  Object.assign(state.settings, loadSettings());
  // A stored filter naming a type this deck lacks would silently select nothing.
  state.settings.posFilter = state.settings.posFilter.filter((p) => POS_VALUES.includes(p));

  applySettingsToForm();
  wireSetup();
  wireSession();
  wireSummary();
  wireBrowse();

  if ('speechSynthesis' in window) {
    pickGermanVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickGermanVoice);
  }

  const builtIns = await loadBuiltInDecks();
  populateDeckSelect(builtIns);

  const saved = loadSettings().deckId;
  const options = [...$('deck-select').options].map((o) => o.value);
  const wanted = saved && options.includes(saved) ? saved : options[0];

  try {
    await activateDeck(wanted);
  } catch (err) {
    $('deck-summary').textContent = 'Could not load the word list.';
    $('deck-note').textContent = err.message;
    return;
  }

  $('deck-select').addEventListener('change', () => {
    state.settings.deckId = $('deck-select').value;
    persistSettings();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is optional; the app works without it.
    });
  }
}

init();
