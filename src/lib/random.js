// Tiny dependency-free random helpers, split out from utils.js so the
// rotation engines (src/engines/*) can import them without creating a
// circular import back through utils.js's own engine wiring.

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
