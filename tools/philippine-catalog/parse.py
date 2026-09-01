#!/usr/bin/env python3
"""Phase 3, part one -- split each ingredient line into quantity / unit / name.

Deterministic only. This step does no gram conversion and makes no guesses about what an
ingredient IS: it turns "1 1/2 pounds pork belly (- cut into 1x1-inch cubes)" into
(1.5, "lb", "pork belly") and stops there. Densities and canonical names are the next two
steps, and keeping them apart is the point -- a model guessing grams is learnings #16
happening again, and the error would be silent.

  python parse.py            -> parsed.jsonl + a report of what did not parse
  python parse.py --report   -> report only
"""
import collections, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))

VULGAR = {"¼": .25, "½": .5, "¾": .75, "⅓": 1/3, "⅔": 2/3,
          "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875,
          "⅕": .2, "⅖": .4, "⅗": .6, "⅘": .8, "⅙": 1/6, "⅚": 5/6}

# Canonical unit -> the spellings the three sites actually use. Order matters: longer
# spellings are tried first so "tablespoon" never matches as "tbs" + "poon".
UNITS = {
    "g":     ["grams", "gram", "gr", "g"],
    "kg":    ["kilograms", "kilogram", "kilo", "kilos", "kg"],
    "mg":    ["milligrams", "mg"],
    "oz":    ["ounces", "ounce", "oz"],
    "lb":    ["pounds", "pound", "lbs", "lb"],
    "tsp":   ["teaspoons", "teaspoon", "tsps", "tsp", "tsp."],
    "tbsp":  ["tablespoons", "tablespoon", "tbsps", "tbsp", "tbs", "tbsp."],
    "cup":   ["cups", "cup"],
    "ml":    ["milliliters", "millilitres", "ml"],
    "l":     ["liters", "litres", "liter", "litre", "l"],
    "floz":  ["fluid ounces", "fluid ounce", "fl oz", "fl. oz."],
    "qt":    ["quarts", "quart", "qt"],
    "pt":    ["pints", "pint", "pt"],
    "gal":   ["gallons", "gallon"],
    # count-ish units. These need a per-ingredient weight, not a density.
    "piece": ["pieces", "piece", "pcs", "pc", "pcs.", "pc."],
    "clove": ["cloves", "clove"],
    "head":  ["heads", "head"],
    "bunch": ["bunches", "bunch"],
    "stalk": ["stalks", "stalk"],
    "sprig": ["sprigs", "sprig"],
    "leaf":  ["leaves", "leaf"],
    "slice": ["slices", "slice"],
    "strip": ["strips", "strip"],
    "cube":  ["cubes", "cube"],
    "can":   ["cans", "can"],
    "pack":  ["packages", "package", "packets", "packet", "packs", "pack", "pouches", "pouch"],
    "bottle": ["bottles", "bottle"],
    "sachet": ["sachets", "sachet"],
    "bar":   ["bars", "bar"],
    "knob":  ["knobs", "knob", "thumbs", "thumb"],
    "dash":  ["dashes", "dash", "pinches", "pinch", "drops", "drop"],
}
UNIT_LOOKUP = {}
for canon, spellings in UNITS.items():
    for sp in spellings:
        UNIT_LOOKUP[sp] = canon
UNIT_ALT = "|".join(sorted((re.escape(s) for s in UNIT_LOOKUP), key=len, reverse=True))

# Size words carry real weight information for count units (1 large onion vs 1 small onion),
# so they are captured rather than discarded.
SIZES = ("small", "medium", "med", "large", "big", "extra large", "jumbo", "baby")

# "1 1/2" and "1 ½" are the same amount written two ways, and only the first was matched.
# The second parsed as qty=1 with the rest -- fraction AND unit -- swallowed into the name:
# "1 ½ lbs chicken" became 1 of something called "½ lbs chicken". 338 lines in this corpus.
QTY = (r"(?:\d+\s*[" + "".join(VULGAR) + r"]|\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+|["
       + "".join(VULGAR) + r"])")
LINE = re.compile(
    r"^\s*(?P<qty>" + QTY + r"(?:\s*(?:-|–|to|or)\s*" + QTY + r")?)?"
    r"\s*(?P<unit>" + UNIT_ALT + r")?\b\.?\s*(?P<rest>.*)$", re.I)

# Preparation words are not part of an ingredient's identity, but they sit on both sides of
# it -- "minced garlic" and "garlic, minced" are the same thing. Stripping to end-of-line on
# either would delete the name itself, which is exactly what a first pass here did to 203
# lines. So: CLAUSE eats to the end (it is genuinely trailing), ADJ removes only the word.
CLAUSE = re.compile(
    r"\b(cut into|to taste|as needed|"
    r"for (?:frying|garnish|serving|topping|dipping|boiling|blanching|soaking|"
    r"marinating|the sauce|the marinade|the broth|the filling)|"
    r"divided|room temperature|about|approximately|preferably|or more|plus more|optional)\b.*$",
    re.I)
ADJ = re.compile(
    r"\b(chopped|minced|sliced|diced|cubed|crushed|peeled|grated|shredded|julienne[d]?|"
    r"cleaned|washed|rinsed|drained|trimmed|deveined|pounded|mashed|beaten|toasted|"
    r"roasted|fried|boiled|fresh|frozen|thawed|ripe|unripe|"
    r"finely|thinly|coarsely|roughly|lightly)\b", re.I)


def number(tok):
    tok = tok.strip()
    if not tok:
        return None
    total, seen = 0.0, False
    for part in tok.split():
        if part in VULGAR:
            total += VULGAR[part]
            seen = True
        elif "/" in part:
            try:
                a, b = part.split("/")
                total += float(a) / float(b)
                seen = True
            except (ValueError, ZeroDivisionError):
                return None
        else:
            # "1½" written without a space
            m = re.match(r"^(\d*\.?\d*)([" + "".join(VULGAR) + r"])?$", part)
            if not m or not (m.group(1) or m.group(2)):
                return None
            if m.group(1):
                total += float(m.group(1))
            if m.group(2):
                total += VULGAR[m.group(2)]
            seen = True
    return total if seen else None


def quantity(tok):
    """A range ("2-3 cloves") collapses to its midpoint. Recorded as a range so Phase 5 can
    see how much of a dish rests on them."""
    if not tok:
        return None, False
    parts = re.split(r"\s*(?:-|–|to|or)\s*", tok.strip())
    vals = [v for v in (number(p) for p in parts) if v is not None]
    if not vals:
        return None, False
    return sum(vals) / len(vals), len(vals) > 1


def clean_name(rest):
    s = rest.strip()
    s = re.sub(r"\([^)]*\)", " ", s)          # "(cut into serving pieces)"
    s = re.sub(r"\[[^\]]*\]", " ", s)
    # "pork belly, cut into cubes" -> "pork belly". But "boneless, skinless chicken thighs"
    # is one noun phrase interrupted by a comma, and taking the first clause yields the
    # ingredient "boneless" -- 4 kg of it across the corpus. Keep the whole line when the
    # first clause is only qualifiers.
    head = s.split(",")[0]
    if re.fullmatch(r"[\s\w-]*", head) and re.sub(
            r"\b(boneless|skinless|bone-in|skin-on|lean|whole|fresh|frozen|large|small|"
            r"medium|thick|thin|ripe|green|dried|raw|cooked|cut|trimmed|peeled)\b|[\s-]", "",
            head) == "":
        s = s.replace(",", " ", 1)
    else:
        s = head
    s = CLAUSE.sub("", s)
    s = ADJ.sub("", s)
    s = re.sub(r"^\s*(?:of|-|–)\s+", "", s)
    # A line like "1 cup (240 ml) water)" leaves a stray bracket the balanced-paren strip
    # cannot see, and "water )" then becomes its own ingredient.
    s = re.sub(r"[()\[\]]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -–.·*").lower()
    size = None
    for sz in SIZES:
        m = re.match(r"^" + sz + r"\b\s*", s)
        if m:
            size, s = sz, s[m.end():]
            break
    return s, size


# NOTE: "cooked", "uncooked", "raw" and "dry" are deliberately NOT stripped as adjectives.
# They are not preparation notes on the same ingredient, they are DIFFERENT ingredients:
# 100 g of dry rice is 360 kcal and 100 g of cooked rice is 130. Collapsing them made
# sinangag 31% dry rice and 21% cooked rice at once, and 1,596 kcal a serving.
#
# Oil a dish is fried IN is not oil the dish contains. Banana cue's two recipes call for
# four cups of frying oil between them, and counting it as eaten produced 1,905 kcal a
# serving -- twelve times what the sites publish. Flagged here, discounted in compute.py.
FRYING = re.compile(r"for (deep[- ]?)?fry(ing)?|deep[- ]?fry", re.I)


def parse_line(line):
    raw = re.sub(r"\s+", " ", (line or "").replace(" ", " ")).strip()
    if not raw:
        return None
    m = LINE.match(raw)
    if not m:
        return {"raw": raw, "qty": None, "unit": None, "name": raw.lower(), "size": None,
                "range": False, "frying": bool(FRYING.search(raw))}
    qty, is_range = quantity(m.group("qty"))
    unit = UNIT_LOOKUP.get((m.group("unit") or "").lower().rstrip(".")) if m.group("unit") else None
    rest = m.group("rest")

    # "1 (14 ounces) can coconut milk": the amount that matters is in the bracket, and the
    # outer number counts cans. Read as 1 can, the line resolved to nothing at all and the
    # coconut milk left the dish -- one-directional fat loss across every ginataang recipe.
    inner = re.match(r"^\s*\(([^)]*)\)\s*(.*)$", rest)
    if inner and qty is not None:
        sub = LINE.match(inner.group(1))
        if sub and sub.group("qty") and sub.group("unit"):
            sub_qty, _ = quantity(sub.group("qty"))
            sub_unit = UNIT_LOOKUP.get(sub.group("unit").lower().rstrip("."))
            if sub_qty and sub_unit in ("g", "kg", "oz", "lb", "ml", "l", "floz", "cup"):
                qty, unit = qty * sub_qty, sub_unit
                rest = inner.group(2)

    name, size = clean_name(rest)
    frying = bool(FRYING.search(raw))
    if not name and unit in (None, "piece"):
        name = raw.lower()
    return {"raw": raw, "qty": qty, "unit": unit, "name": name, "size": size,
            "range": is_range, "frying": frying}


def main():
    rows = [json.loads(l) for l in open(os.path.join(HERE, "corpus.jsonl"), encoding="utf-8")]
    out = open(os.path.join(HERE, "parsed.jsonl"), "w", encoding="utf-8")
    names, units, noqty, nounit, total = collections.Counter(), collections.Counter(), 0, 0, 0
    for r in rows:
        items = [p for p in (parse_line(i) for i in r["ingredients"]) if p]
        for p in items:
            total += 1
            names[p["name"]] += 1
            units[p["unit"]] += 1
            noqty += p["qty"] is None
            nounit += p["unit"] is None
        out.write(json.dumps({"url": r["url"], "name": r.get("name"), "yield": r.get("yield"),
                              "items": items}, ensure_ascii=False) + "\n")
    out.close()
    print("%d recipes, %d ingredient lines" % (len(rows), total))
    print("  no quantity parsed: %d (%.1f%%)" % (noqty, 100.0 * noqty / max(total, 1)))
    print("  no unit parsed:     %d (%.1f%%)  <- mostly bare counts, '2 onions'"
          % (nounit, 100.0 * nounit / max(total, 1)))
    print("\ntop units:")
    for u, c in units.most_common(18):
        print("  %-8s %d" % (u, c))
    print("\ntop 40 ingredient names (this is the gram table's work queue):")
    for n, c in names.most_common(40):
        print("  %4d  %s" % (c, n[:60]))
    print("\ndistinct names: %d; names seen once: %d"
          % (len(names), sum(1 for c in names.values() if c == 1)))


if __name__ == "__main__":
    main()
