export function el(tag, props, children) {
  const node = document.createElement(tag);
  const attrs = props || {};
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children || []) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function render(node, children) {
  clear(node);
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

export function plural(count, one, many) {
  return count + ' ' + (count === 1 ? one : many);
}

export function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Numbers that tick up read as a result being tallied rather than printed. The
// node is left at its final value if motion is unwelcome, or if the screen is
// replaced mid-count: nothing here touches anything but its own textContent.
export function countUp(node, to, suffix, ms) {
  const end = String(to) + (suffix || '');
  if (reducedMotion() || !to) {
    node.textContent = end;
    return;
  }
  const duration = ms || 700;
  const started = performance.now();
  node.textContent = '0' + (suffix || '');
  const step = (now) => {
    const t = Math.min((now - started) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = Math.round(to * eased) + (suffix || '');
    if (t < 1) requestAnimationFrame(step);
    else node.textContent = end;
  };
  requestAnimationFrame(step);
}

// Confetti out of plain divs: no library to cache, works offline, and the whole
// burst removes itself so repeat sessions cannot leave nodes behind.
export function confetti(pieces) {
  if (reducedMotion() || pieces <= 0) return;
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < pieces; i += 1) {
    layer.appendChild(el('span', {
      class: 'bit c' + (i % 5),
      style: 'left:' + (Math.random() * 100).toFixed(2) + '%;'
        + '--drift:' + ((Math.random() * 2 - 1) * 90).toFixed(0) + 'px;'
        + '--spin:' + (360 + Math.random() * 540).toFixed(0) + 'deg;'
        + 'animation-delay:' + (Math.random() * 0.8).toFixed(2) + 's;'
        + 'animation-duration:' + (1.7 + Math.random() * 1.3).toFixed(2) + 's;'
        + (Math.random() < 0.35 ? 'border-radius:50%;' : '')
    }));
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4200);
}
