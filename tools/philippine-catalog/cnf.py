#!/usr/bin/env python3
"""Phase 4 -- the Canadian Nutrient File, loaded and queryable.

CNF 2015 ships as a base set of relational CSVs plus a separate update pack of
ADD / CHANGE / DELETE files. The obvious move is to apply the pack to the base. Do not:
**the base download is already current and the pack is a changelog of how it got there.**
Measured, not assumed -- 0 of 584 deleted foods are still in the base, 603 of 607 "added"
foods are already there, and 42,451 of 42,529 changed nutrient values already match. Applying
it would revert the 78 values that differ to older numbers and re-add withdrawn rows. So the
loader reads the base only, and the pack stays on disk as provenance.

Licence: Open Government Licence - Canada. Redistributable with attribution, which is what
makes a shared catalog possible at all (Finding 5). The attribution belongs in the seed
migration, not just here.

  python cnf.py search "pork belly"     find food codes by description
  python cnf.py show 2786               per-100 g nutrients for one food
  python cnf.py measures 2786           household measures and their conversion factors

Column headers differ between the base and update files ("FoodID" / "FoodId",
"Nutrient NameID" / "NutrientID"), so every header is normalised on read instead of being
indexed by position.
"""
import csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "cnf", "base")
UPDATE = os.path.join(HERE, "cnf", "update")

# The nutrients this project actually stores. CNF carries ~150; capturing the extras here
# costs nothing and re-running the whole pipeline later to get them costs a lot (S36-S39).
NUTRIENTS = {
    208: "kcal", 203: "protein_g", 204: "fat_g", 205: "carb_g", 291: "fiber_g",
    269: "sugar_g", 307: "sodium_mg", 306: "potassium_mg", 301: "calcium_mg",
    303: "iron_mg", 304: "magnesium_mg", 305: "phosphorus_mg", 309: "zinc_mg",
    401: "vitamin_c_mg", 320: "vitamin_a_rae", 328: "vitamin_d_ug", 415: "vitamin_b6_mg",
    418: "vitamin_b12_ug", 417: "folate_ug", 606: "sat_fat_g", 605: "trans_fat_g",
    601: "cholesterol_mg",
}


def norm(h):
    return re.sub(r"[^a-z0-9]", "", (h or "").lower())


def read(path):
    """Yield rows as dicts with normalised keys. CNF is latin-1, not UTF-8."""
    if not os.path.exists(path):
        return
    with open(path, newline="", encoding="latin-1") as f:
        r = csv.reader(f)
        try:
            header = [norm(h) for h in next(r)]
        except StopIteration:
            return
        for row in r:
            if not row:
                continue
            yield dict(zip(header, row))


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def load_foods():
    return {row["foodid"]: row.get("fooddescription", "")
            for row in read(os.path.join(BASE, "FOOD NAME.csv"))}


def load_amounts(keep=None):
    """FoodID -> {NutrientID: value per 100 g}. `keep` limits to the nutrients we store."""
    amounts = {}

    def put(fid, nid, val):
        if keep and nid not in keep:
            return
        if val is None:
            return
        amounts.setdefault(fid, {})[nid] = val

    def key(row):
        fid = row.get("foodid")
        nid = row.get("nutrientid") or row.get("nutrientnameid")
        return fid, (int(nid) if nid and nid.isdigit() else None)

    for row in read(os.path.join(BASE, "NUTRIENT AMOUNT.csv")):
        fid, nid = key(row)
        put(fid, nid, num(row.get("nutrientvalue")))
    return amounts


def load_measures():
    names = {r["measureid"]: r.get("measuredescription", "")
             for r in read(os.path.join(BASE, "MEASURE NAME.csv"))}
    conv = {}
    for r in read(os.path.join(BASE, "CONVERSION FACTOR.csv")):
        v = num(r.get("conversionfactorvalue"))
        if v is not None:
            conv.setdefault(r["foodid"], []).append((r["measureid"], v))
    return names, conv


def load_refuse():
    """FoodID -> inedible fraction (0-1).

    A recipe weighs food AS PURCHASED -- "2 lbs chicken" is bone, skin and all -- while CNF's
    per-100 g values are for the EDIBLE PORTION. Pricing the whole as-purchased weight as
    edible meat inflates both the calories and the serving weight, which is how crispy pata
    arrived at a 586 g serving. CNF ships the discount: chicken 32% bone, spareribs 27%,
    garlic 13% skin.
    """
    out = {}
    for row in read(os.path.join(BASE, "REFUSE AMOUNT.csv")):
        v = num(row.get("refuseamount"))
        if v is None:
            continue
        # A food can list several refuse components; the largest is the "total refuse" row.
        out[row["foodid"]] = max(out.get(row["foodid"], 0.0), v / 100.0)
    return out


def per100(fid, amounts):
    row = amounts.get(fid, {})
    return {label: row[nid] for nid, label in NUTRIENTS.items() if nid in row}


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    foods = load_foods()
    if cmd == "stats":
        amounts = load_amounts(set(NUTRIENTS))
        print("foods: %d  (base only; the update pack is a changelog, see the docstring)" % len(foods))
        print("foods with a kcal value: %d"
              % sum(1 for f in foods if 208 in amounts.get(f, {})))
        return
    if cmd == "search":
        term = " ".join(sys.argv[2:]).lower()
        hits = [(fid, desc) for fid, desc in foods.items() if term in desc.lower()]
        hits.sort(key=lambda x: len(x[1]))
        for fid, desc in hits[:30]:
            print("  %-7s %s" % (fid, desc))
        print("%d matches" % len(hits))
        return
    if cmd == "show":
        fid = sys.argv[2]
        amounts = load_amounts(set(NUTRIENTS))
        print("%s  %s" % (fid, foods.get(fid, "<not in CNF>")))
        for k, v in per100(fid, amounts).items():
            print("  %-16s %s" % (k, v))
        return
    if cmd == "measures":
        fid = sys.argv[2]
        names, conv = load_measures()
        print("%s  %s" % (fid, foods.get(fid, "<not in CNF>")))
        for mid, factor in conv.get(fid, []):
            print("  %-28s x%-10s = %6.1f g" % (names.get(mid, mid), factor, factor * 100))
        return
    print(__doc__)


if __name__ == "__main__":
    main()
