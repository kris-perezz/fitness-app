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
 * Exact beats prefix beats substring; Infinity is no match at all. Defined once
 * so that searchNamed and matchedAlias below cannot drift into disagreeing
 * about what matched -- the second exists purely to explain the first, and an
 * explanation that contradicts the result is worse than none.
 */
function score(haystack: string, q: string): number {
  if (haystack === q) return 0;
  if (haystack.startsWith(q)) return 1;
  if (haystack.includes(q)) return 2;
  return Infinity;
}

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
    for (const h of haystacks) best = Math.min(best, score(h, q));
    if (best < Infinity) scored.push({ item, score: best });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * The alias that put this item in the results, or null if its own name did.
 *
 * Search matches aliases but nothing ever showed them, so "pec deck" returned
 * "Machine Chest Fly" with no stated connection between the two -- and now that
 * several terms deliberately return more than one lift, the row has to say why
 * it is there.
 *
 * Null whenever the NAME matches at all, even weakly. Searching "pushdown"
 * ranks Tricep Rope Pushdown on its exact alias rather than its substring name,
 * so the strictly-better-score rule would print `· "pushdown"` next to a row
 * already reading "Tricep Rope Pushdown" -- the query echoed back as though it
 * were an explanation. If the name contains what you typed, the name is the
 * answer, and only a row whose name CANNOT account for the match needs one.
 */
export function matchedAlias<T extends Named>(item: T, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const byName = score(item.name.toLowerCase(), q);
  let best: { alias: string; score: number } | null = null;
  for (const alias of item.aliases) {
    const s = score(alias.toLowerCase(), q);
    if (s < Infinity && (best === null || s < best.score)) best = { alias, score: s };
  }

  return byName === Infinity && best !== null ? best.alias : null;
}
