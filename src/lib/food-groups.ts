import type { Food } from "@/lib/food";

/**
 * Which catalog rows are the same food in different states (S92).
 *
 * "Chicken, broiler, breast, skinless, boneless, meat, raw" and "...grilled"
 * are one food and two forms of it. Search should show one row; the drawer
 * should ask which. Nothing is ever CONVERTED between them -- picking a form
 * swaps which catalog row the entry is logged against, and grams mean grams of
 * that form. There is no arithmetic here at all, which is the point: CNF
 * publishes no cooking yield (`/yieldamount/` is empty for every food probed on
 * 2026-09-01, chicken and rice included), so a raw-to-cooked conversion is not
 * available at any price and nothing should pretend otherwise.
 *
 * WHY THIS IS A FILE AND NOT A TABLE
 *
 * CNF publishes no grouping field. `/food/` returns `food_code` and
 * `food_description` and nothing else, and `/foodgroup/` answers `group_code: 0,
 * group_desc: null` for everything -- the endpoint is dead. So "codes 841, 838,
 * 7322 and 839 are all chicken breast" is a human reading of a 5,690-row
 * taxonomy. That reading is the same for every user, is not derived from
 * anybody's log, and changes on Health Canada's schedule rather than the app's.
 * It is reference data, and reference data in the database buys the ability to
 * change it at runtime -- which nothing here wants -- at the price of a typo
 * that fails silently. `'cnf:chicken-brest'` as a text column saves fine and
 * quietly yields a one-member group that renders no toggles and looks entirely
 * correct. Here the same typo is a build error.
 *
 * Consequence worth knowing: this needs NO migration and no columns. A CNF row's
 * id already carries its food code, so membership and axis values are looked up
 * from the id. Backing the feature out is a `git revert` with nothing left
 * behind in the database.
 *
 * WHAT THE GRID LOOKS LIKE
 *
 * Sparse, and not marginally. Chicken breast exists as `meat and skin` in
 * raw/roasted/stewed/fried/rotisserie and as `skinless, boneless` in
 * raw/braised/grilled -- so grilled-with-skin does not exist, and neither does
 * braised-with-skin. The variant list IS the set of legal combinations, so
 * impossible ones need no constraint and no exclusion table: they are simply
 * not written down. `availableOptions` reads them off the list.
 */

export type Axis = {
  id: string;
  /** Question the control asks, not the attribute's name: "Weighed", not "state". */
  label: string;
  /** Render order. The first is the default when nothing else decides. */
  options: { value: string; label: string }[];
};

export type Variant = {
  /** The catalog row this form is, e.g. `cnf_841`. */
  id: string;
  /**
   * CNF's own wording. Kept because materialising the row needs it (the nutrient
   * endpoint returns numbers and no name) and because it is what makes a
   * curation decision auditable a year from now.
   */
  description: string;
  /** A value for EVERY axis the group declares. Partial points are a bug. */
  values: Record<string, string>;
};

export type FoodGroup = {
  key: string;
  /** What search shows in place of the members. */
  name: string;
  axes: Axis[];
  /** The first variant is what search displays and what the drawer opens on. */
  variants: Variant[];
};

/**
 * Raw vs cooked, the only axis that is universal and the one that matters.
 * Chicken is +29% cooked; rice is -66%, a factor of 2.8. Getting it wrong on
 * rice is not a rounding error, it is the wrong meal.
 *
 * Cooking METHOD is deliberately NOT an axis (S93). Skinless breast reads
 * grilled 151, stewed 151, braised 157, roasted 165 -- a 9% spread, smaller
 * than the error in weighing on a kitchen scale and far smaller than the error
 * in guessing how much oil went in the pan. One row is chosen to represent
 * cooked and the choice is recorded beside it.
 */
const STATE = (cookedLabel = "Cooked", rawLabel = "Raw"): Axis => ({
  id: "state",
  label: "Weighed",
  options: [
    { value: "raw", label: rawLabel },
    { value: "cooked", label: cookedLabel },
  ],
});

export const GROUPS: FoodGroup[] = [
  {
    key: "cnf:chicken-breast",
    name: "Chicken breast",
    axes: [
      STATE(),
      {
        id: "skin",
        label: "Skin",
        options: [
          { value: "off", label: "Skinless" },
          { value: "on", label: "With skin" },
        ],
      },
    ],
    // Skin is a real axis and a large one: raw 120 kcal skinless against 172
    // with skin, and cooked 3.2 g fat against 7.8 g. That is food, not water.
    //
    // The cooked row differs across the skin axis -- grilled without, roasted
    // with -- because the grid has holes in it: CNF has no grilled-with-skin
    // row to choose. Under S93 that is a 9% difference and not worth a fifth
    // combination nobody can pick.
    variants: [
      {
        id: "cnf_841",
        description: "Chicken, broiler, breast, skinless, boneless, meat, raw",
        values: { state: "raw", skin: "off" },
      },
      {
        id: "cnf_7322",
        description: "Chicken, broiler, breast, skinless, boneless, meat, grilled",
        values: { state: "cooked", skin: "off" },
      },
      {
        id: "cnf_838",
        description: "Chicken, broiler, breast, meat and skin, raw",
        values: { state: "raw", skin: "on" },
      },
      {
        id: "cnf_839",
        description: "Chicken, broiler, breast, meat and skin, roasted",
        values: { state: "cooked", skin: "on" },
      },
    ],
  },
  {
    key: "cnf:white-rice",
    name: "White rice, long-grain",
    // "Raw" is CNF's word for meat and "dry" is its word for grains, and the
    // toggle should say what the food says. Normalised here, at curation, so
    // the control never has to parse a name to decide what to call itself.
    axes: [STATE("Cooked", "Dry")],
    variants: [
      {
        id: "cnf_4471",
        description: "Grains, rice, white, long-grain, regular, dry",
        values: { state: "raw" },
      },
      {
        // The UNSALTED cooked row (4525 is the salted one). Salt added in your
        // kitchen is yours to log; a reference row should not decide it for you,
        // the same way S93 refuses CNF's fried rows for baking in the oil.
        id: "cnf_4523",
        description: "Grains, rice, white, long-grain, regular, cooked",
        values: { state: "cooked" },
      },
    ],
  },
];

const BY_ID = new Map<string, { group: FoodGroup; variant: Variant }>();
for (const group of GROUPS) {
  for (const variant of group.variants) BY_ID.set(variant.id, { group, variant });
}

/** The group a catalog row belongs to, or null -- which is most foods. */
export function groupForId(id: string): FoodGroup | null {
  return BY_ID.get(id)?.group ?? null;
}

/** Where a catalog row sits in its group's axis space. */
export function valuesForId(id: string): Record<string, string> | null {
  return BY_ID.get(id)?.variant.values ?? null;
}

/** The variant occupying one point, or null where the grid has a hole. */
export function variantAt(group: FoodGroup, values: Record<string, string>): Variant | null {
  return (
    group.variants.find((v) => group.axes.every((a) => v.values[a.id] === values[a.id])) ?? null
  );
}

/**
 * Which options of one axis are reachable, holding the other axes where they
 * are. This is what greys out grilled-with-skin rather than offering a
 * combination with no food behind it -- and it is derived from the variant
 * list, so it cannot disagree with what exists.
 *
 * `present` narrows further to rows actually in the catalog: a group whose
 * members failed to materialise should offer what it has, not what it wishes it
 * had.
 */
export function availableOptions(
  group: FoodGroup,
  axisId: string,
  values: Record<string, string>,
  present?: ReadonlySet<string>,
): Set<string> {
  const others = group.axes.filter((a) => a.id !== axisId);
  const out = new Set<string>();
  for (const v of group.variants) {
    if (present && !present.has(v.id)) continue;
    if (others.every((a) => v.values[a.id] === values[a.id])) out.add(v.values[axisId]);
  }
  return out;
}

/**
 * Fold a search result list so a group appears once (S92).
 *
 * The FIRST member to survive ranking represents the group, so a query that
 * matched "grilled" does not surrender its place to whichever variant happens
 * to be listed first here. Only the DISPLAY collapses -- the row handed on is a
 * real catalog row and the drawer moves from it.
 */
export function collapseGroups<T>(items: T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const group = groupForId(idOf(item));
    if (!group) {
      out.push(item);
      continue;
    }
    if (seen.has(group.key)) continue;
    seen.add(group.key);
    out.push(item);
  }
  return out;
}

/** What a collapsed row is called: the group's name, not the member's. */
export function displayName(food: Pick<Food, "id" | "name">): string {
  return groupForId(food.id)?.name ?? food.name;
}

/** The CNF food code a catalog id carries, or null for anything else. */
export function cnfCodeOf(id: string): number | null {
  const m = /^cnf_(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}
