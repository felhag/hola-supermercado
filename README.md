# Hola supermercado

A static, offline-first Spanish trainer. No build step, no dependencies, no network at
runtime. Leitner scheduling, progress in IndexedDB.

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
sw.js                    app shell precache, decks read from the deck index
manifest.webmanifest
data/decks/*.json        content
package.json             npm scripts, no dependencies
tools/serve.js           dev server for npm start
tools/validate.js        deck and precache checks for npm run validate
tools/dist.js            builds _site for the Pages deploy
.github/workflows/       validate, build and publish on every push to main
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

## Validate the content

```
npm run validate
```

Checks that every deck parses, that card ids are unique across all decks, that no deck
file is orphaned, that each cloze card has a `___` gap whose full sentence matches the
answer and whose choices contain it, and that every shipped file is covered by the service
worker precache. Run it after editing decks: a deck the worker never caches is simply
absent offline, which is the one failure you cannot debug at 30,000 feet.

## Publish to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which validates the content,
builds `_site` with `npm run dist`, and publishes that folder to the `gh-pages` branch.
The deploy can also be started by hand from the Actions tab.

```
git push origin main
```

One-time setup in the repo: Settings, Pages, Source "Deploy from a branch", branch
`gh-pages`, folder `/ (root)`. The branch appears after the first successful run. The app
is then served at `https://<user>.github.io/<repo>/` within a minute or two.

Only the built folder is published, so the tooling and the README stay out of the deployed
site, and `404.html` is a copy of the app shell so any unknown path still boots. Every
path in the app is relative, so the `/<repo>/` subpath works without changes.

A stale build stamp fails the deploy rather than shipping: `npm run validate` is the first
step, so forgetting `npm run stamp` stops the release instead of leaving every installed
app on the previous files.

## Changing content

Edit or add a file in `data/decks/`, register it in `data/decks/index.json`, then run
`npm run stamp`. There is no deck list to maintain in `sw.js`: it reads
`data/decks/index.json` when it installs and precaches whatever is registered there, and
`npm run stamp` expands the same index so a deck edit still changes the build hash.
`npm run validate` fails if you forget to stamp, which matters: an unstamped service
worker keeps serving the old files to every device that already installed the app.

Anything that is *not* a deck — a new script, an icon, a stylesheet — still belongs in the
`SHELL` list in `sw.js`, and `npm run validate` fails until it is there.

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
