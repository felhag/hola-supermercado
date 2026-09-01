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
