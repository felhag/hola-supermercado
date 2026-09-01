const BASE = './data/decks/';

export async function loadIndex() {
  const res = await fetch(BASE + 'index.json');
  if (!res.ok) throw new Error('deck index missing');
  return res.json();
}

export async function loadDeck(meta) {
  const res = await fetch(BASE + meta.file);
  if (!res.ok) throw new Error('deck ' + meta.id + ' missing');
  const data = await res.json();
  const cards = data.cards.map((card) => Object.assign({ deck: meta.id }, card));
  return { meta, cards };
}

export function target(card) {
  return card.en;
}

// Typing on a phone, in a plane, with no Spanish keyboard layout: be generous.
// Accents, punctuation, articles and English "to " infinitive markers all go.
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(el|la|los|las|un|una|unos|unas|to|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Alternatives are separated by "/", but a slash also turns up inside a
// qualifier like "to be (state / place)". Drop the parentheses first, or that
// card splits into two nonsense halves and rejects the obvious answer. The
// whole string counts too, so "to be able to" passes as readily as "can".
export function accepts(text) {
  const bare = String(text).replace(/\(.*?\)/g, ' ');
  const pieces = bare.split(/[/;]/).concat([bare]);
  const out = [];
  for (const piece of pieces) {
    const form = normalize(piece);
    if (form && !out.includes(form)) out.push(form);
  }
  return out;
}

export function checkTyped(input, text) {
  const given = normalize(input);
  if (!given) return false;
  return accepts(text).includes(given);
}

export function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function distractors(pool, card, get, count) {
  const correct = normalize(get(card));
  const seen = new Set([correct]);
  const out = [];
  for (const other of shuffle(pool)) {
    if (out.length >= count) break;
    if (other.id === card.id) continue;
    const value = get(other);
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
