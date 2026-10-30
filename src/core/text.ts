export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Index of the option that best matches `wanted`, or -1. Exact (normalized) match first; otherwise a
 * single option that starts with, or contains, the wanted text ("India" → "India (+91)"). Ambiguous
 * partial matches return -1 rather than guessing.
 */
export function bestMatch(options: readonly string[], wanted: string): number {
  const w = normalize(wanted);
  if (!w) return -1;
  const norm = options.map(normalize);
  const exact = norm.indexOf(w);
  if (exact >= 0) return exact;
  for (const test of [(o: string) => o.startsWith(w), (o: string) => o.includes(w)]) {
    const hits = norm.flatMap((o, i) => (test(o) ? [i] : []));
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return -1;
  }
  return -1;
}
