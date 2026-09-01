import { el, render } from './ui.js';
import { target, distractors, shuffle, checkTyped } from './content.js';

// Direction and difficulty are independent. Difficulty rises with the Leitner
// box, but a box is a schedule, not a session: every card in a fresh session
// sits in box 1, so tying direction to the box meant one direction all evening.
// Direction comes from the card itself instead, which mixes both ways inside a
// single session and flips a given card each time it comes round.
// Reading Spanish is easier than producing it, so lead with recognition and
// shift towards production as the word gets stronger: three in four cards show
// the Spanish at box 1, even odds in the middle, one in four at the top. The
// box only tilts the odds, so both directions still turn up in every session.
function wantsSpanishFirst(state) {
  const id = String(state.id || '');
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  const bucket = (hash + (state.seen || 0)) % 4;
  const spanishShare = state.box <= 1 ? 3 : (state.box <= 3 ? 2 : 1);
  return bucket < spanishShare;
}

// mode picks the drill style, direction picks which language is the question:
// showing the Spanish is recognition, asking for it is production.
export function pickKind(state, deckKind, mode, direction) {
  if (deckKind === 'cloze') {
    if (mode === 'type') return 'cloze-type';
    if (mode === 'flash' || mode === 'choice') return 'cloze-choice';
    return state.box <= 2 ? 'cloze-choice' : 'cloze-type';
  }
  if (mode === 'flash') return 'flash';

  const spanishFirst = direction === 'es-first'
    || (direction !== 'target-first' && wantsSpanishFirst(state));

  if (mode === 'choice') return spanishFirst ? 'choice-es' : 'choice-tgt';
  if (mode === 'type') return spanishFirst ? 'type-target' : 'type';

  // Adaptive: type at the edges, multiple choice while the word is settling.
  // A new word is a cold test with nothing revealed; the answer shows up
  // afterwards and the card comes back later in the same session.
  const middle = state.box === 2 || state.box === 3;
  if (middle) return spanishFirst ? 'choice-es' : 'choice-tgt';
  return spanishFirst ? 'type-target' : 'type';
}

export const KIND_LABEL = {
  flash: 'Flashcard',
  'choice-es': 'Multiple choice',
  'choice-tgt': 'Multiple choice',
  'type-target': 'Type the translation',
  type: 'Type the Spanish',
  'cloze-choice': 'Fill the gap',
  'cloze-type': 'Fill the gap'
};

function promptCard(main, sub) {
  return el('div', { class: 'card prompt' }, [
    el('div', { class: 'prompt-word', text: main }),
    sub ? el('div', { class: 'prompt-sub', text: sub }) : null
  ]);
}

function clozePrompt(card, sub) {
  const parts = card.text.split('___');
  const line = el('div', { class: 'cloze' }, [
    parts[0] || '',
    el('span', { class: 'gap', text: ' ' }),
    parts[1] || ''
  ]);
  return el('div', { class: 'card prompt' }, [
    line,
    sub ? el('div', { class: 'prompt-sub', text: sub }) : null
  ]);
}

function clozeDetail(card) {
  return card.note ? card.es + "  (" + card.note + ")" : card.es;
}

// Admitting you do not know beats typing nonsense or guessing an option, and it
// grades the same as a wrong answer: back to box 1, seen again this session.
function dunnoButton(onGiveUp) {
  return el('button', { class: 'btn ghost dunno', text: "I don't know", onclick: onGiveUp });
}

// Every drill ends the same way: say what happened, wait for a deliberate
// continue so a wrong answer is actually read before it disappears.
function verdict(area, correct, solution, onAnswer, detail, label) {
  const next = el('button', {
    class: 'btn primary',
    text: 'Continue',
    onclick: () => onAnswer(correct)
  });
  render(area, [
    el('div', { class: 'card' }, [
      el('div', {
        class: 'verdict ' + (correct ? 'ok' : 'no'),
        text: label || (correct ? 'Correct' : 'Not quite')
      }),
      el("div", { class: correct ? "small muted" : "answer-word", text: solution }),
      detail ? el("div", { class: "small muted", text: detail }) : null
    ]),
    next
  ]);
  next.focus();
  return { onKey: (event) => { if (event.key === 'Enter' || event.key === ' ') next.click(); } };
}

function flash(view, card, onAnswer) {
  const area = el('div', { class: 'stack' });
  const reveal = el('button', { class: 'btn primary', text: 'Show translation' });
  const handler = { onKey: (event) => { if (event.key === ' ' || event.key === 'Enter') reveal.click(); } };

  reveal.onclick = () => {
    const again = el('button', { class: 'btn bad', text: 'Again', onclick: () => onAnswer(false) });
    const got = el('button', { class: 'btn good', text: 'Got it', onclick: () => onAnswer(true) });
    render(area, [
      el('div', { class: 'card' }, [
        el('div', { class: 'answer-word', text: target(card) }),
        card.note ? el('div', { class: 'small muted', text: card.note }) : null
      ]),
      el('div', { class: 'btn-row' }, [again, got])
    ]);
    got.focus();
    handler.onKey = (event) => {
      if (event.key === '1') again.click();
      if (event.key === '2' || event.key === 'Enter') got.click();
    };
  };

  render(view, [promptCard(card.es, 'Think of the translation, then check yourself'), area]);
  render(area, [reveal]);
  return handler;
}

function choice(view, card, pool, onAnswer, spanishAnswer) {
  const area = el('div', { class: 'stack' });
  const get = spanishAnswer ? (c) => c.es : (c) => target(c);
  const solution = get(card);
  const options = shuffle([solution].concat(distractors(pool, card, get, 3)));
  const handler = { onKey: null };

  const choose = (value) => {
    const done = verdict(area, value === solution, solution, onAnswer);
    handler.onKey = done.onKey;
  };
  const giveUp = () => {
    const done = verdict(area, false, solution, onAnswer, null, 'The answer');
    handler.onKey = done.onKey;
  };

  render(view, [
    spanishAnswer
      ? promptCard(target(card), 'Pick the Spanish')
      : promptCard(card.es, 'Pick the translation'),
    area
  ]);
  render(area, options.map((value, index) => el('button', {
    class: 'btn',
    text: (index + 1) + '.  ' + value,
    onclick: () => choose(value)
  })).concat([dunnoButton(giveUp)]));
  handler.onKey = (event) => {
    if (event.key === '0') giveUp();
    const index = Number(event.key) - 1;
    if (index >= 0 && index < options.length) choose(options[index]);
  };
  return handler;
}

function typed(view, card, onAnswer, solution, promptNode, detail) {
  const area = el('div', { class: 'stack' });
  const input = el('input', {
    class: 'text',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'Your answer'
  });
  const error = el('div', { class: 'error' });
  const check = el('button', { class: 'btn primary', text: 'Check' });
  const handler = { onKey: null };

  check.onclick = () => {
    if (!input.value.trim()) {
      error.textContent = "Type an answer, or tap I don't know.";
      input.focus();
      return;
    }
    const done = verdict(area, checkTyped(input.value, solution), solution, onAnswer, detail);
    handler.onKey = done.onKey;
  };
  input.addEventListener('input', () => { error.textContent = ''; });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); check.click(); }
  });

  const giveUp = () => {
    const done = verdict(area, false, solution, onAnswer, detail, 'The answer');
    handler.onKey = done.onKey;
  };

  render(view, [promptNode, area]);
  render(area, [input, error, check, dunnoButton(giveUp)]);
  input.focus();
  return handler;
}

export function renderDrill(view, opts) {
  const { card, kind, pool, onAnswer } = opts;
  if (kind === 'flash') return flash(view, card, onAnswer);
  if (kind === 'choice-es') return choice(view, card, pool, onAnswer, false);
  if (kind === 'choice-tgt') return choice(view, card, pool, onAnswer, true);
  if (kind === 'type-target') {
    return typed(view, card, onAnswer, target(card), promptCard(card.es, 'Type the translation'));
  }
  if (kind === 'type') {
    return typed(view, card, onAnswer, card.es, promptCard(target(card), 'Write it in Spanish'));
  }
  if (kind === 'cloze-type') {
    return typed(view, card, onAnswer, card.answer, clozePrompt(card, target(card)), clozeDetail(card));
  }
  // cloze-choice
  const area = el('div', { class: 'stack' });
  const options = shuffle(card.choices.slice());
  const handler = { onKey: null };
  const choose = (value) => {
    const done = verdict(area, value === card.answer, card.answer, onAnswer, clozeDetail(card));
    handler.onKey = done.onKey;
  };
  const giveUp = () => {
    const done = verdict(area, false, card.answer, onAnswer, clozeDetail(card), 'The answer');
    handler.onKey = done.onKey;
  };
  render(view, [clozePrompt(card, target(card)), area]);
  render(area, options.map((value, index) => el('button', {
    class: 'btn',
    text: (index + 1) + '.  ' + value,
    onclick: () => choose(value)
  })).concat([dunnoButton(giveUp)]));
  handler.onKey = (event) => {
    if (event.key === '0') giveUp();
    const index = Number(event.key) - 1;
    if (index >= 0 && index < options.length) choose(options[index]);
  };
  return handler;
}
