// Leitner boxes: 1 is "just met it", 5 is "solid". A correct answer promotes one
// box and pushes the next review out; a wrong answer drops straight back to 1.
export const MAX_BOX = 5;
const DAY = 86400000;
const DUE_DAYS = [0, 0, 1, 3, 7, 21];

export function newState(id, deck) {
  return { id, deck, box: 1, due: 0, seen: 0, right: 0, wrong: 0, last: 0 };
}

export function grade(state, correct, now = Date.now()) {
  state.seen += 1;
  state.last = now;
  if (correct) {
    state.right += 1;
    state.box = Math.min(state.box + 1, MAX_BOX);
    state.due = now + DUE_DAYS[state.box] * DAY;
  } else {
    state.wrong += 1;
    state.box = 1;
    state.due = now;
  }
  return state;
}

export function isDue(state, now = Date.now()) {
  return state.due <= now;
}

export function isNew(state) {
  return state.seen === 0;
}

// Progress has to move the first time a card is answered, or an hour of drilling
// looks like it achieved nothing: only box 4 and up count as solid, and nothing
// reaches box 4 in a single session. Box 1 once seen is a fifth of the way,
// box 5 is the whole way, and a wrong answer costs the boxes it drops.
export function strength(state) {
  if (isNew(state)) return 0;
  return state.box / MAX_BOX;
}
