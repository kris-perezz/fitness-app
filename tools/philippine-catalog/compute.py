#!/usr/bin/env python3
"""Phase 5 -- turn a pile of recipes into one row per dish.

The arithmetic that makes this defensible, restated because it is the whole plan:

**Per-serving macros need no cooked weight.** Cooking conserves nutrients and loses water, so
summing the raw ingredients and dividing by the stated servings is exact. No yield factor is
invented anywhere in this file.

**Median, not mean.** The corpus is long-tailed and heavily cross-copied; a mean is weighted
by whichever version got reprinted most.

**Aggregate the ingredients, not the totals.** Each recipe is reduced to proportions
(percent of its own raw weight), the median proportion per ingredient defines a typical dish,
and the nutrients are computed from that. Taking the median of finished kcal instead would
hide which ingredient the number came from.

  python compute.py            -> dishes.computed.json + a report
  python compute.py --verbose  -> also print the median composition of each dish

Every dish carries the diagnostics that decide whether to trust it: how many recipes it rests
on, how much of its weight resolved to grams, how much of that mapped to CNF, the spread of
its serving weights, and whether kcal agrees with 4/4/9.
"""
import json, os, re, statistics, sys

import cnf
import convert
import hand_foods
import map as mapping

HERE = os.path.dirname(os.path.abspath(__file__))

# `cnf_coverage` is the share of a dish's resolved weight that CNF could price. It is a real
# weight fraction now: every recipe that reaches this point resolved all of its quantified
# lines, so nothing is missing from the denominator.
MIN_GRAM_COVERAGE = 1.0
MIN_CNF_COVERAGE = 0.75

# CNF ids for the cooking fats, so frying oil can be told apart from the oil in a dressing.
FRYING_OILS = {"451", "422", "424", "420", "437", "419", "92", "118", "16"}
# Water, broths and stock. Nothing fries in these and nothing absorbs oil into them.
WATERY = {"2933", "501763", "927", "2566"}


def parse_yield(y):
    """recipeYield is ['4', '4 people'] or ['6 servings'] or '8-10'. Return servings."""
    if y is None:
        return None
    if isinstance(y, (int, float)):
        return float(y) or None
    if isinstance(y, list):
        for item in y:
            v = parse_yield(item)
            if v:
                return v
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)", str(y))
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    m = re.search(r"(\d+(?:\.\d+)?)", str(y))
    return float(m.group(1)) if m else None


def median(xs):
    return statistics.median(xs) if xs else None


class Pipeline:
    def __init__(self):
        self.conv = convert.Converter()
        self.amounts = cnf.load_amounts(set(cnf.NUTRIENTS))
        # Bagoong and patis, which CNF has no row for. See hand_foods.py for why the bar for
        # adding one is high and why bagoong cleared it.
        hand_foods.inject({}, self.amounts, {v: k for k, v in cnf.NUTRIENTS.items()})
        self.mapping = mapping.load_mapping()
        self.refuse = cnf.load_refuse()
        self.recipes = {}
        for line in open(os.path.join(HERE, "parsed.jsonl"), encoding="utf-8"):
            r = json.loads(line)
            self.recipes[r["url"]] = r
        # The sites' own published calories are a BOUND, never an input: they come from a
        # WordPress plugin's estimate, so averaging them would converge on the plugin rather
        # than on the food. Landing far outside them means the gram table is wrong, not them.
        self.published = {}
        for line in open(os.path.join(HERE, "corpus.jsonl"), encoding="utf-8"):
            r = json.loads(line)
            n = r.get("published_nutrition") or {}
            m = re.search(r"([\d.]+)", str(n.get("calories", "")))
            if m:
                self.published[r["url"]] = float(m.group(1))

    def weigh(self, recipe):
        """One recipe -> per-CNF-food grams, plus what did not resolve."""
        grams, unresolved, untaxed, unmapped_g, resolved_g, notes = {}, [], [], 0.0, 0.0, []
        fried = False
        for item in recipe["items"]:
            name = item["name"].strip()
            fid, how_mapped = mapping.resolve(name, self.mapping)
            if fid and how_mapped != "exact":
                notes.append("%s -> mapped as '%s'" % (name, how_mapped))
            g, how = self.conv.grams(item["qty"], item["unit"], fid, item.get("size"),
                                     name=name)
            if g is None:
                # "Salt and pepper to taste" carries no quantity because there isn't one.
                # Counting it as a coverage failure punishes a recipe for being written the
                # way recipes are written; it is unquantifiable, not unresolved.
                (untaxed if item["qty"] is None else unresolved).append(item["raw"])
                continue
            # As-purchased -> edible. See cnf.load_refuse(). Applied before anything else
            # sees the number, so both the nutrients AND the serving weight describe the food
            # rather than the food plus its bones.
            if fid:
                edible = 1.0 - self.refuse.get(fid, 0.0)
                if edible < 1.0:
                    g *= edible
                    if edible < 0.9:
                        notes.append("%s: %.0f%% refuse removed (bone, shell or skin)"
                                     % (name, 100 * (1 - edible)))
            resolved_g += g
            if fid:
                grams[fid] = grams.get(fid, 0.0) + g
            else:
                unmapped_g += g
            if item.get("frying"):
                fried = True
            if "fallback" in how or "asked" in how or "approximated" in how:
                notes.append("%s: %s" % (name, how))
        # Frying medium: a deep-fried food absorbs roughly a tenth of its weight in oil,
        # not the potful it was cooked in. Two triggers -- the line says "for frying", or the
        # oil simply dwarfs the food, which is the same situation written less explicitly.
        oil_g = sum(g for f, g in grams.items() if f in FRYING_OILS)
        # Against the FOOD, not the pot. Taking 10% of everything resolved counted the water,
        # the broth and the marinade as though oil could soak into them, which let tortang
        # talong keep 32 g of oil a serving -- half its calories.
        watery_g = sum(g for f, g in grams.items() if f in WATERY)
        food_g = resolved_g - oil_g - watery_g
        if oil_g and food_g > 0 and (fried or oil_g > 0.20 * food_g):
            keep = min(oil_g, 0.10 * food_g)
            shed = oil_g - keep
            if shed > 1:
                for f in list(grams):
                    if f in FRYING_OILS:
                        grams[f] *= keep / oil_g
                resolved_g -= shed
                notes.append("frying oil discounted: %.0f g of %.0f g not absorbed"
                             % (shed, oil_g))
        return {"grams": grams, "unresolved": unresolved, "untaxed": untaxed,
                "unmapped_g": unmapped_g,
                "resolved_g": resolved_g, "notes": notes,
                "servings": parse_yield(recipe.get("yield"))}

    def nutrients(self, grams):
        """grams per CNF food -> summed nutrients, and the share of weight CNF could price."""
        total = {k: 0.0 for k in cnf.NUTRIENTS.values()}
        priced = 0.0
        for fid, g in grams.items():
            per = cnf.per100(fid, self.amounts)
            if not per:
                continue
            priced += g
            for k, v in per.items():
                total[k] += v * g / 100.0
        return total, priced

    # A soup is eaten with its liquid. A braise keeps some. Everything boiled-then-fried --
    # bagnet, crispy pata, lechon kawali -- throws its cooking water down the sink, and
    # counting it made bagnet a 583 g "serving" that was 57% water. Water carries no
    # calories, so this never moved kcal; it moved the serving weight, which is the number
    # the user reads and the app divides by.
    SOUPY = ("Soups",)

    def dish(self, entry):
        urls = [u for u in entry.get("matches", []) if u in self.recipes]
        weighed, rejected = [], 0
        for u in urls:
            w = self.weigh(self.recipes[u])
            if not (w["servings"] and w["resolved_g"] > 0):
                continue
            # A DROPPED QUANTIFIED LINE DISQUALIFIES THE RECIPE. This used to merely dent a
            # coverage score, and the score could not see the damage: a dropped line is
            # absent from resolved_g, so it is missing from the denominator it should have
            # failed. That is how a stuffed milkfish and a smoked fish both reached the
            # catalog with no fish in them, at 96% and 86% "coverage".
            #
            # An unquantifiable line ("salt and pepper to taste") is fine -- there is no
            # amount to lose. A line that stated an amount and produced no grams is a hole.
            if w["unresolved"]:
                rejected += 1
                continue
            w["url"] = u
            weighed.append(w)
        if not weighed:
            return None

        # Composition as proportions of each recipe's own raw weight, then the median.
        props = {}
        for w in weighed:
            for fid, g in w["grams"].items():
                props.setdefault(fid, []).append(g / w["resolved_g"])
        n = len(weighed)
        # Two wrong ways to aggregate, both tried:
        #
        #   median over users only -- something two recipes in twenty use looks like a
        #   majority ingredient, and the proportions sum to far more than 1.
        #   median with absences padded as zeros -- anything in fewer than half the recipes
        #   vanishes. Adobo's recipes split between pork, chicken and beef, so EVERY protein
        #   fell under half and the median adobo came out as soy sauce and garlic: 111 kcal.
        #
        # Prevalence weighting keeps both halves: how much when it is used, times how often
        # it is used. The proportions still sum to about 1, and a dish whose recipes disagree
        # about the protein becomes a blend of them -- which is what a row called
        # "Adobo (pork / chicken)" honestly is.
        composition = {fid: median(vals) * (len(vals) / float(n)) for fid, vals in props.items()}
        composition = {f: p for f, p in composition.items() if p > 0.001}
        drained = 0.0
        if entry.get("section") not in self.SOUPY:
            drained = sum(p for f, p in composition.items() if f in WATERY)
            composition = {f: p for f, p in composition.items() if f not in WATERY}

        total_weights = [w["resolved_g"] for w in weighed]
        servings = [w["servings"] for w in weighed]
        per_serving_w = [w["resolved_g"] / w["servings"] for w in weighed]
        typical_total = median(total_weights)
        typical_servings = median(servings)

        # Proportions are already fractions of the whole recipe, so the typical dish is
        # simply proportion x typical weight. Re-normalising them to sum to 1 would spread
        # the unmapped weight across whatever *did* map -- one daing recipe where only the
        # cooking oil mapped came out as 507 g of oil and 4,489 kcal a serving. The unmapped
        # share must stay missing and be reported as missing.
        grams = {f: p * typical_total for f, p in composition.items()}
        nutr, priced = self.nutrients(grams)
        per_serv = {k: v / typical_servings for k, v in nutr.items()} if typical_servings else {}

        # Every surviving recipe resolved every quantified line, so this is 1.0 by
        # construction and is kept only so the shape of the output does not change. What
        # actually varies is how many recipes had to be thrown away to get there.
        gram_cov = 1.0
        # The drained water has to leave the denominator as well as the numerator, or every
        # boiled-then-fried dish fails a coverage test for weight it deliberately does not
        # contain. Coverage asks "of the food that IS the dish, how much could CNF price?"
        accounted_total = typical_total * (1 - drained)
        cnf_cov = priced / accounted_total if accounted_total else 0
        kcal = per_serv.get("kcal", 0)
        pub = [self.published[w["url"]] for w in weighed if w["url"] in self.published]
        atwater = (4 * per_serv.get("protein_g", 0) + 4 * per_serv.get("carb_g", 0)
                   + 9 * per_serv.get("fat_g", 0))
        # The mass the macros actually describe. `composition` sums to about 0.85, not 1 --
        # prevalence weighting shrinks every proportion, and unmapped ingredients are absent
        # entirely -- so the median raw weight per serving describes a BIGGER dish than the
        # nutrients do. Emitting that as grams_per_unit was not a cosmetic mismatch: the app
        # divides user-entered grams by this field (src/lib/food.ts qtyFromMeasure), so the
        # two have to be the same dish. They now are, and the observed weight is kept beside
        # it as a diagnostic rather than shipped.
        accounted_g = sum(composition.values()) * typical_total
        serving_g = accounted_g / typical_servings if typical_servings else 0

        return {
            "n": entry["n"], "name": entry["name"], "region": entry["region"],
            "tier": entry["tier"], "recipes": len(weighed), "section": entry.get("section"),
            "recipes_rejected": rejected,
            "serving_g": round(serving_g, 1),
            "serving_g_observed": round(median(per_serving_w), 1),
            "accounted_share": round(sum(composition.values()), 3),
            "serving_g_p25": round(sorted(per_serving_w)[len(per_serving_w) // 4], 1),
            "serving_g_p75": round(sorted(per_serving_w)[3 * len(per_serving_w) // 4], 1),
            "servings": typical_servings,
            "raw_total_g": round(typical_total, 1),
            "per_serving": {k: round(v, 3) for k, v in per_serv.items() if v},
            "composition": {f: round(p, 4) for f, p in sorted(
                composition.items(), key=lambda x: -x[1])},
            "gram_coverage": round(gram_cov, 3),
            "cnf_coverage": round(cnf_cov, 3),
            "atwater_kcal": round(atwater, 1),
            "atwater_delta": round((atwater - kcal) / kcal, 3) if kcal else None,
            "published_kcal": round(median(pub), 0) if pub else None,
            "published_n": len(pub),
            "published_delta": (round((kcal - median(pub)) / median(pub), 3)
                                if pub and median(pub) else None),
            "notes": sorted({note for w in weighed for note in w["notes"]})[:8],
            # The sites' published calories are a bound, not a target: they are a plugin's
            # estimate, so agreeing with them exactly proves nothing, but landing at double
            # or half of them means our gram table is wrong rather than theirs. Counting the
            # braising liquid in full explains a consistent overshoot -- it does not explain
            # 5x, which is what banana cue's frying oil was doing.
            "seedable": bool(gram_cov >= MIN_GRAM_COVERAGE and cnf_cov >= MIN_CNF_COVERAGE
                             and kcal > 0
                             and sum(composition.values()) <= 1.05
                             # A brine or cure counted as eaten. Isaw came through with 49 g
                             # of table salt in its composition and 4,449 mg of sodium in one
                             # serving -- twice a whole day's intake, from a street snack.
                             and per_serv.get("sodium_mg", 0) < 3000
                             and (not pub or -0.5 <= (kcal - median(pub)) / median(pub) <= 1.0)),
        }


def main():
    dishes = json.load(open(os.path.join(HERE, "dishes.json"), encoding="utf-8"))
    p = Pipeline()
    out, skipped = [], []
    for entry in dishes:
        row = p.dish(entry)
        (out if row else skipped).append(row or entry["name"])
    json.dump(out, open(os.path.join(HERE, "dishes.computed.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)

    seedable = [d for d in out if d["seedable"]]
    print("computed %d dishes (%d seedable), %d had no usable recipe"
          % (len(out), len(seedable), len(skipped)))
    print("\n%-26s %4s %7s %7s %6s %6s %6s" % ("dish", "n", "kcal/sv", "sv (g)", "gram%", "cnf%", "4/4/9"))
    for d in sorted(out, key=lambda x: x["n"]):
        print("%-26s %4d %7.0f %7.0f %6.0f %6.0f %6s %8s%s" % (
            d["name"][:26], d["recipes"], d["per_serving"].get("kcal", 0), d["serving_g"],
            100 * d["gram_coverage"], 100 * d["cnf_coverage"],
            ("%+.0f%%" % (100 * d["atwater_delta"])) if d["atwater_delta"] is not None else "--",
            ("%+.0f%%" % (100 * d["published_delta"])) if d["published_delta"] is not None else "--",
            "" if d["seedable"] else "  <- held back"))
    if skipped:
        print("\nno usable recipe: %s" % ", ".join(skipped))

    sw = [d["serving_g"] for d in out]
    if sw:
        print("\nserving weights across dishes: median %.0f g, range %.0f-%.0f g"
              % (statistics.median(sw), min(sw), max(sw)))
        print("This is the Phase 0 question answered with data: a tight spread means "
              "'one serving' is a real convention, a wide one means the number is soft.")
    if "--verbose" in sys.argv:
        foods = cnf.load_foods()
        for d in sorted(out, key=lambda x: x["n"]):
            print("\n%s -- %d recipes" % (d["name"], d["recipes"]))
            for fid, prop in list(d["composition"].items())[:8]:
                print("   %5.1f%%  %s" % (100 * prop, foods.get(fid, fid)[:56]))


if __name__ == "__main__":
    main()
