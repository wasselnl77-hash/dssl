/* DSSL — utils.js — tiny shared helpers */

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** best "did you mean ..." suggestion, or undefined */
export function didYouMean(word, candidates) {
  if (!word || !candidates || !candidates.length) return undefined;
  let best = undefined, bestDist = Infinity;
  const w = word.toLowerCase();
  for (const c of candidates) {
    if (!c) continue;
    const d = levenshtein(w, String(c).toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const tolerance = Math.max(2, Math.floor(w.length / 3));
  return bestDist <= tolerance ? String(best) : undefined;
}
