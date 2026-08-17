# German Vocabulary

A small web app for practising German vocabulary. Pick a word list, take a slice
of it, choose which kinds of words you want, and drill them by typing or with
flashcards — in either translation direction. Four lists are built in (the 500
most common words, plus numbers, food and time), and you can load your own.

Live at **https://andreashandel.github.io/german-app**

It is a static site: plain HTML, CSS and ES modules, no build step and no
runtime dependencies. Open `index.html` through any web server and it runs.

## Using it

**Which words.** Pick a list from the dropdown, drag the `From` and `To` sliders
to a stretch of it, and tick the word types you want. The sliders push each
other rather than blocking — dragging `From` past `To` carries `To` along — and
they rescale when you switch to a shorter list. The radio buttons underneath
decide what those numbers mean:

- *positions on the full list* — `200`–`400` is literally ranks 200 to 400,
  then narrowed to the types you ticked.
- *positions within the chosen types* — tick only Nouns and `1`–`100` gives the
  hundred most common nouns.

**How many.** *Words per session* under Options is a slider bounded by how many
words are currently selected. At the top of its travel it reads "all N" — so
picking everything is a position on the scale rather than a special value.

Every card names the **part of speech** it is asking for. Without it an English
prompt like *date* is ambiguous between the noun and the verb, and there is no
way to know which German word is wanted.

**How to practise.**

- **Typing** — type the translation and get it checked (see below). **Enter**
  does the same as the *Check* button; a second press moves to the next card.
  **Hint** uncovers a letter at a time if she is stuck.
- **Flashcards** — reveal the answer, then grade yourself *Again / Good / Easy*.
  The grade feeds the review scheduler.
- **Browse** — the current selection as a sortable, searchable table.

**Review what is due** and **Practice hard words** pull from your history rather
than the range: due words are ones whose Leitner interval has elapsed, hard
words are ones answered wrong at least a third of the time.

### The streak

The chip at the top of the setup screen counts consecutive days practised. It
turns green once the day is banked and shows your best run alongside the current
one.

A day counts from the **first answer you grade**, not from finishing a session —
abandoning a session halfway still counts, because you did practise. Days are
local calendar days, so 11pm and then 8am the next morning is two days, not one.
Miss a day and the count restarts at 1, though your best is kept. Yesterday
still counts as live: the streak only reads as broken once a whole day has gone
by without practice.

The streak spans every deck — five minutes of food words keeps it alive just as
well as the main list. It is stored separately from per-deck progress, and is
not included in the progress export.

### How answers are checked

Typed answers are graded generously, because the point is recall, not fighting
an iPad keyboard:

- Case and punctuation are ignored.
- Umlauts match three ways — `grün`, `gruen` and `grun` are all accepted.
- `ß` and `ss` are interchangeable.
- Any one of several translations counts: `to look for; to search` accepts either.
- A leading `to ` or `a/an/the` is optional in both directions: `go` is fine for
  `to go`, and `the hour` is fine for `hour`.
- Parentheticals are optional: `the` is fine for `the (masculine)`.
- Small typos are forgiven by default (one character, two on long words), and
  flagged so you still see the correct spelling. Swapped neighbouring letters
  count as one slip, not two, since `huor` for `hour` is what a thumb does on a
  tablet. Turn all of this off under *Options*.

German nouns are the exception. **The article is required** — `Haus` alone is
marked wrong, and only `das Haus` counts. Articles are never fuzzy-matched
either, so `der Haus` is a miss rather than a forgiven typo: the gender *is* the
thing being tested. Untick *Require the correct article* under *Options* to go
back to accepting a bare noun.

### Hints and pronunciation

**Hint** uncovers the answer one letter at a time — `····` becomes `J···`, then
`Ja··`. It stops one letter short, so it can never simply spell the word out. A
noun's article is never revealed by a hint, for the same reason it is required:
the placeholder `···` stays in front as a reminder that the gender is still
owed.

Getting a word right after a hint still counts as correct, but it does not push
the word further down the review schedule — she got there with help, and a word
she cannot recall unaided should come back around soon. The session summary
counts how many answers needed one.

**🔊** next to a German word reads it aloud, using the German voice already on
the device. It sits beside the prompt when translating out of German, and beside
the answer when translating into it, so it always follows the German side. There
is also a *Read the German word aloud* option that plays every card
automatically without pressing anything.

A second **🔊** sits beside the German **example sentence** once the answer is
revealed, and reads the whole sentence. Hearing a word inside a sentence is
where the stress and rhythm actually live, so it is worth more than the headword
on its own. It is always manual — the auto-play option only ever reads the
single word, since having a full sentence fire on every card would wear thin.

Pronunciation needs no network and no API key, but it does depend on the device
having a German voice — every current iPad does. Where speech is unavailable the
buttons simply do not appear.

### The pretzel

The app's mark is a Brezel, used for the home-screen icon, the browser tab and
the header. It is generated rather than drawn by hand:

```bash
python tools/make-icons.py
```

That rewrites every file in `icons/` and prints the SVG path used by the inline
logo in `index.html`, so the icon and the in-app logo come from one geometry and
cannot drift apart. Editing the curve means editing the control points at the
top of that script. It needs Pillow, and is the only part of the project that
touches Python — the app itself is unaffected.

## Adding your own word list

Two ways:

**Load a file from the device.** *Load a CSV file…* on the setup screen. The
file is read locally and never uploaded. It is remembered in the browser, so it
only has to be picked once.

**Add it to the repo.** Drop the CSV in `data/`, add one line to
`data/manifest.json`, and it appears in the dropdown:

```json
[
  { "id": "de-top500", "name": "German — 500 most common words", "file": "data/de-top500.csv" },
  { "id": "kitchen",   "name": "Kitchen words",                  "file": "data/kitchen.csv" }
]
```

### CSV format

Only **two columns are required**: the German word and the English translation.
Everything else is optional.

| Column       | Required | Notes                                                        |
| ------------ | -------- | ------------------------------------------------------------ |
| `german`     | yes      | Headword only. Nouns without the article — that goes in `article`. Verbs as infinitives. |
| `english`    | yes      | Several translations separated by `;`. Any one is accepted.   |
| `rank`       | no       | Sort order for the range selector. Defaults to row order.     |
| `article`    | no       | `der`, `die` or `das`. Displayed as "das Jahr".                |
| `plural`     | no       | Shown as a hint on the German side only.                      |
| `pos`        | no       | One of `noun, verb, adjective, adverb, pronoun, preposition, conjunction, article, numeral, other`. Defaults to `other`. |
| `example_de` | no       | Example sentence, shown after answering.                      |
| `example_en` | no       | Its translation.                                              |
| `also`       | no       | Other German words meaning the same thing, separated by `;`. Accepted as answers and shown with the correct one, but never used as the prompt. |

Header names are matched loosely and German names work too — `Wort`,
`Übersetzung`, `Wortart`, `Artikel`, `Beispiel` are all recognised, as are
`de`/`en`/`word`/`translation`/`type`. Part-of-speech values accept German
spellings (`Substantiv`, `Verb`, `Adjektiv`, …).

The smallest valid file:

```csv
word,translation
Hund,dog
Katze,cat
```

Save as UTF-8. Quote any field containing a comma. If two entries share a
headword they must differ in `pos` — that is how `das Essen` (noun) and `essen`
(verb) stay separate, including in your progress history.

Use `also` for genuine synonyms rather than adding a second row. `never` is one
vocabulary item that happens to have two German words, so `nie` with
`also=niemals` accepts either and teaches both; two rows would instead make two
cards and mark `nie` wrong on the `niemals` one.

### The bundled lists

Four decks ship with the app, picked from the dropdown at the top of the setup
screen. Every entry in all of them carries a part of speech, gender and plural
for nouns, and a German example sentence with its translation.

| Deck | Words | What it covers |
| ---- | ----- | -------------- |
| **German — 500 most common words** | 500 | General vocabulary, ordered by frequency |
| **Numbers & counting** | 115 | Cardinals, ordinals, fractions, units, quantity words |
| **Food & eating out** | 130 | Ordering, meals, ingredients, cooking, tableware |
| **Time, days & months** | 120 | Clock units, weekdays, months, seasons, time adverbs |

Each deck keeps its own progress history, so practising food words does not
disturb where you are in the main list.

The three topic decks are ordered by theme rather than frequency — the range
selector still works, it just means "the first 40 of the food deck" is the
restaurant-and-meals block rather than the commonest 40 food words.

On the main list, `rank` is a **learner-priority order, weighted by frequency** —
not exact corpus positions. Roughly the first 150 track real frequency closely,
which is why they are mostly function words (*der, und, zu, nicht*); those are
worth knowing and their example sentences carry most of the teaching. Beyond
that the list leans toward everyday vocabulary a beginner will actually use,
rather than the news-corpus words (*Unternehmen, Bereich, Milliarde*) that
dominate a strict frequency count in that band.

Translations were compiled by hand and are worth a review pass. They are plain
CSVs — fix anything that looks off and commit it.

## On an iPad

Open the page in Safari, then **Share → Add to Home Screen**. That gives it an
icon, runs it full screen without browser chrome, and works offline.

It also matters for a reason that is not obvious: iOS clears `localStorage` for
sites not visited in about seven days, which would wipe your progress. Adding it
to the home screen exempts the app from that. **Export progress** on the setup
screen writes a JSON backup either way.

## Development

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`. A plain file:// open will *not* work — ES
modules and `fetch` both need a real server.

```bash
npm test
```

`package.json` exists only for the tests; nothing in it reaches the browser.
`test/logic.test.mjs` covers parsing, filtering and answer checking and needs
nothing installed. `test/ui.test.mjs` drives the real UI in jsdom and needs
`npm install` first.

### Layout

```
index.html               all markup, four screens
css/style.css            one stylesheet, light and dark
js/app.js                UI wiring and state
js/csv.js                CSV parsing, column aliases, word normalisation
js/deck.js               range and part-of-speech selection
js/quiz.js               card generation and answer grading
js/progress.js           localStorage, Leitner scheduling, streak, export/import
data/*.csv               the bundled word lists
data/manifest.json       which decks appear in the dropdown
icons/                   generated app icons
tools/make-icons.py      regenerates icons/ and the logo path
sw.js                    offline cache
```

## Deploying

GitHub Pages, no workflow needed. In the repository, **Settings → Pages →
Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Pushing to
`main` publishes.

`.nojekyll` is present so Jekyll does not touch the files.

When you change any app file, bump `CACHE` in `sw.js` — otherwise devices that
already installed the app keep serving the old version from cache.
