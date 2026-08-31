/**
 * Ranked name search, shared by the food catalog and the exercise catalog.
 *
 * S27 asks that finding an exercise behave exactly like finding a food, "so
 * there is only one thing to learn". The cheapest way to guarantee that is for
 * both to be the same function rather than two implementations that agree
 * today: this was lifted verbatim out of `searchFoods`, which now delegates.
 */
export type Named = {
  name: string;
  aliases: string[];
};

/**
 * Exact match beats a prefix beats a substring; ties break alphabetically.
 * Deliberately not fuzzy -- a typo returning nothing is easier to understand
 * than a typo returning the wrong lift, and the catalogs are small enough that
 * this runs on every keystroke without a thought.
 */
export function searchNamed<T extends Named>(items: T[], query: string, limit = 20): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { item: T; score: number }[] = [];

  for (const item of items) {
    const haystacks = [item.name.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())];
    let best = Infinity;
    for (const h of haystacks) {
      if (h === q) best = Math.min(best, 0);
      else if (h.startsWith(q)) best = Math.min(best, 1);
      else if (h.includes(q)) best = Math.min(best, 2);
    }
    if (best < Infinity) scored.push({ item, score: best });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((s) => s.item);
}
