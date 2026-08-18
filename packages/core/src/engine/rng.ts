/** Mulberry32 — small seeded PRNG. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller draw from Normal(mean, stdev). σ ≤ 0 returns the mean. */
export function normalSample(mean: number, stdev: number, rng: () => number): number {
  if (stdev <= 0) return mean;
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdev;
}

export function weightedPick(weights: number[], rng: () => number): number {
  let sum = 0;
  for (const w of weights) sum += w;
  if (sum <= 0) return 0;
  let target = rng() * sum;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i] ?? 0;
    if (target <= 0) return i;
  }
  return weights.length - 1;
}
