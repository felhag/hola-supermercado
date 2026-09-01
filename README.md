# Hola supermercado

A static, offline-first Spanish trainer. No build step, no dependencies, no network at
runtime. 455 cards across nine decks, four drill types, Leitner scheduling, progress in
IndexedDB.

## Files

```
index.html               app shell
styles.css
js/app.js                views, session loop
js/drills.js             the four drill types
js/srs.js                Leitner boxes
js/store.js              IndexedDB, with a localStorage fallback
js/content.js            deck loading, answer matching
js/ui.js                 tiny DOM helper
sw.js                    precache list + cache-first fetch
manifest.webmanifest
data/decks/*.json        content
package.json             npm scripts, no dependencies
tools/serve.js           dev server for npm start
tools/validate.js        deck and precache checks for npm run validate
serve.ps1                fallback server for machines without Node
.nojekyll                stops GitHub Pages running Jekyll over the folder
```

## Run locally

Service workers need `http://`, so opening `index.html` from disk will not work.

```
npm start
```

Then open http://localhost:8080/. Use another port with `npm start -- 3000`.

There are no dependencies, so `npm install` downloads nothing and is optional. The dev
server and the validator are plain Node scripts in `tools/`, which keeps the project
usable on a plane.

Without Node, `powershell -ExecutionPolicy Bypass -File .\serve.ps1` does the same job.

## Validate the content

```
npm run validate
```

Checks that every deck parses, that card ids are unique across all decks, that no deck
file is orphaned, that each cloze card has a `___` gap whose full sentence matches the
answer and whose choices contain it, and that every shipped file is listed in the service
worker precache. Run it after editing decks: a deck missing from the precache is simply
absent offline, which is the one failure you cannot debug at 30,000 feet.

## Publish to GitHub Pages

```
git init
git add .
git commit -m "Spanish trainer"
git branch -M main
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin main
```

Then in the repo: Settings, Pages, Source "Deploy from a branch", branch `main`, folder
`/ (root)`. The app appears at `https://<user>.github.io/<repo>/` within a minute or two.

Every path in the app is relative, so the `/<repo>/` subpath works without changes.

## Before you fly

1. Open the app online, on the device you will actually use.
2. Wait for the badge in the top right to read **offline ready**. It asks the service
   worker how many of the 23 precached files actually landed, so it is a real check
   rather than a guess. Settings shows the long version of the same status.
3. Install it: Chrome and Edge show "Install on this device" on the home screen, or use
   the browser menu. On iOS Safari, Share then "Add to Home Screen".
4. Optional: switch on airplane mode and open it once, to be sure.

## Changing content

Edit or add a file in `data/decks/`, register it in `data/decks/index.json`, add the path
to `ASSETS` in `sw.js`, then run `npm run stamp`. `npm run validate` fails if you forget
any of those, which matters: an unstamped service worker keeps serving the old files to
every device that already installed the app.

Vocab cards:

```json
{ "id": "fo01", "es": "la comida", "en": "the food / the meal" }
```

Cloze cards, in a deck whose `kind` is `"cloze"`:

```json
{ "id": "se01", "text": "Yo ___ de Alemania.", "answer": "soy",
  "es": "Yo soy de Alemania.", "en": "I am from Germany.",
  "choices": ["soy", "estoy", "es", "son"], "note": "ser for where you are from" }
```

Alternatives go in one field separated by `/`, and a parenthesis holds a qualifier that
is ignored when matching. Typed answers are lenient: accents, punctuation, articles and
the English "to " of an infinitive all drop out, so `manana`, `mañana` and `la mañana`
all count, and `to be able to`, `be able to` and `can` all pass for
`to be able to / can`.

## How scheduling works

Five Leitner boxes. A correct answer moves a card up one box and pushes the next review
out by 0, 1, 3, 7 then 21 days. A wrong answer, including "I don't know", drops it back to
box 1 and shows it again later in the same session.

The box sets the drill style:

| Box | Vocab | Cloze sentences |
| --- | --- | --- |
| 1 | typing | pick the missing word |
| 2, 3 | multiple choice | pick, then type, the missing word |
| 4, 5 | typing | type the missing word |

Direction is decided per card, from a hash of the card id plus how many times you have
seen it, so a session always mixes both ways and a card comes round the other way next
time. Reading Spanish is easier than producing it, so the box tilts the odds towards
recognition early:

| Box | Spanish shown, you give the English | English shown, you give the Spanish |
| --- | --- | --- |
| 1 | 3 in 4 | 1 in 4 |
| 2, 3 | half | half |
| 4, 5 | 1 in 4 | 3 in 4 |

Direction deliberately does not come from the box alone. A box is a schedule rather than a
session: after a correct answer a card is not due for a day, so every card in a fresh
session sits in box 1, and deriving direction from the box meant one direction all
evening.

A new word is a cold test either way: nothing is revealed up front, the answer appears
after you commit, and the card returns later in the same session.

Typed answers are matched leniently, so accents, articles, punctuation and the English
"to " of an infinitive are all optional, and any one of several "/" alternatives counts.

Settings can override all of it: "Which way round" pins every card to one direction, and
the drill type override gives flashcards only for a fast passive pass, multiple choice
only, or typing only.

## Cramming on a plane

Settings, "Waiting between reviews", set to off. Every card in the chosen decks stays
available no matter when it is next due, weakest and least recently seen first, so a long
flight does not run dry after twenty cards. Boxes and due dates still advance underneath,
so switching spacing back on resumes the real schedule with nothing lost.
