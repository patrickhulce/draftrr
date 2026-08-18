/**
 * Bounded Damerau-Levenshtein. Returns Infinity when the distance would exceed `max`.
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return Number.POSITIVE_INFINITY;

  const INF = max + 1;
  const prev2 = new Array<number>(lb + 1);
  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prev2[j - 2] + 1);
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > max) return Number.POSITIVE_INFINITY;
    for (let j = 0; j <= lb; j++) {
      prev2[j] = prev[j] ?? INF;
      prev[j] = curr[j] ?? INF;
    }
  }
  const dist = prev[lb] ?? INF;
  return dist > max ? Number.POSITIVE_INFINITY : dist;
}
