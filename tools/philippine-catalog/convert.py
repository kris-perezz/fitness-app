#!/usr/bin/env python3
"""Phase 3, part two -- turn (quantity, unit, CNF food) into grams.

The plan budgeted a hand-built gram table as the highest-risk artefact in this pipeline,
because every downstream number is a multiple of it and an error in it is silent. Most of
that risk is gone: **CNF ships per-food conversion factors**, so garlic already knows that
one clove is 3.0 g and soy sauce already knows that 100 ml is 107.8 g. The hand table shrinks
to a fallback for what CNF genuinely lacks.

Three paths, in descending order of trust, and every result says which one it took:

  mass    "2 lbs pork"      -> pure arithmetic, no food knowledge needed at all
  count   "5 cloves garlic" -> CNF's own measure for that food ("1 clove")
  volume  "1/3 cup soy"     -> ml x the food's CNF density (its 100 ml factor)

Note on cups: a North American recipe cup is 240 ml, while CNF's household measure is a
metric 250 ml. Multiplying by CNF's "250ml" factor would quietly inflate every cup by 4%, so
volumes go through millilitres and the food's density instead of through CNF's cup row.
"""
import re

import cnf
from count_table import FALLBACK_COUNT

# Recipe volume units in millilitres. US customary, because the three sites are US-facing.
UNIT_ML = {"tsp": 4.93, "tbsp": 14.79, "cup": 240.0, "ml": 1.0, "l": 1000.0,
           "floz": 29.57, "qt": 946.35, "pt": 473.18, "gal": 3785.41,
           "dash": 0.6}
UNIT_G = {"g": 1.0, "kg": 1000.0, "mg": 0.001, "oz": 28.3495, "lb": 453.592}

# CNF measure descriptions mix whole items with fragments of one: onion carries both
# "1 large" (150 g) and "1 medium slice" (14 g). A naive "^1 medium" match on "1 medium onion"
# picks the slice and understates the onion by a factor of ten, silently -- a first pass here
# did exactly that. Any measure carrying a fragment word is disqualified from counting as one
# whole item.
FRAGMENT = re.compile(
    r"\b(slices?|sliced|rings?|chopped|diced|cubed|wedges?|strips?|mashed|shredded|"
    r"grated|cooked|pureed|halves|half|quarter|tbsp|tsp|cup)\b", re.I)

# A recipe's count word and CNF's measure description rarely spell each other. Each entry is
# an ordered list of patterns tried against that food's own measure names.
COUNT_PATTERNS = {
    "clove":  [r"^1 clove"],
    "head":   [r"^1 (head|bulb)"],
    "bulb":   [r"^1 bulb"],
    "piece":  [r"^1 (medium|whole|piece|fruit|unit)\b"],
    "slice":  [r"^1 slice"],
    "strip":  [r"^1 (strip|slice)"],
    "stalk":  [r"^1 (stalk|stick)"],
    "sprig":  [r"^1 sprig"],
    "leaf":   [r"^1 leaf"],
    "bunch":  [r"^1 bunch"],
    "can":    [r"^1 can"],
    "cube":   [r"^1 cube"],
    "bar":    [r"^1 bar"],
    "pack":   [r"^1 (package|packet|pouch)"],
    "bottle": [r"^1 bottle"],
    "sachet": [r"^1 (packet|sachet)"],
}
# A size word overrides the generic count measure when the food has one.
SIZE_PATTERNS = {
    "small": r"^1 small", "medium": r"^1 medium", "med": r"^1 medium",
    "large": r"^1 large", "big": r"^1 large", "jumbo": r"^1 (jumbo|extra large)",
    "extra large": r"^1 extra large", "baby": r"^1 small",
}

# Densities for the handful of things CNF cannot price by volume. Every entry needs a
# written-down reason -- this is the file that has to stay honest, since a wrong number here
# is invisible downstream.
# The per-item gram table lives in count_table.py -- see the note there on why it takes
# precedence over CNF's own count measures.

FALLBACK_DENSITY = {
    "water_like": 1.00,   # broths, vinegar, fish sauce, coconut water
    "oil_like": 0.92,     # cooking oils; USDA soybean oil is 0.9175 g/ml
    "default": 1.00,      # used only when nothing better is known, and always flagged
}


class Converter:
    def __init__(self):
        self.foods = cnf.load_foods()
        self.measure_names, self.conv = cnf.load_measures()

    def measures_for(self, fid):
        return [(self.measure_names.get(mid, ""), factor)
                for mid, factor in self.conv.get(fid, [])]

    def density(self, fid):
        """g per ml, from the food's own millilitre conversion factor.

        Plain "100ml" rows win; a qualified row ("100ml chopped") is used only when nothing
        plain exists, and says so, because chopped-and-packed is denser than whole."""
        best = None
        for name, factor in self.measures_for(fid):
            m = re.match(r"^(\d+)\s*ml\b(.*)$", name.strip(), re.I)
            if not m:
                continue
            ml, qualifier = int(m.group(1)), m.group(2).strip()
            if not ml:
                continue
            d = factor * 100.0 / ml
            if not qualifier:
                return d, "cnf"
            if best is None:
                best = (d, "cnf:" + name.strip())
        return best if best else (None, None)

    def count_grams(self, fid, unit, size):
        rows = self.measures_for(fid)
        if not rows:
            return None, None
        whole = [(n, f) for n, f in rows if not FRAGMENT.search(n)]
        tries = []
        if size and size in SIZE_PATTERNS:
            tries.append(SIZE_PATTERNS[size])
        tries += COUNT_PATTERNS.get(unit, [])
        if unit is None:                     # a bare count: "2 onions"
            tries += [r"^1 (medium|whole|piece|fruit|unit)\b", r"^1 large", r"^1 small"]
        wanted_size = SIZE_PATTERNS.get(size) if size else None
        for pat in tries:
            rx = re.compile(pat, re.I)
            for name, factor in whole:
                if rx.match(name.strip()):
                    # "1 medium onion" answered by CNF's "1 large" is 30% high. Real number,
                    # known bias, and it has to say so rather than passing as an exact match.
                    off = " (asked %s)" % size if wanted_size and pat != wanted_size else ""
                    return factor * 100.0, "cnf:" + name.strip() + off
        # No measure for the size asked for. Use another whole-item measure rather than
        # inventing a size ratio, and flag it -- "1 medium onion" priced off CNF's "1 large"
        # is a real number with a known bias, which beats a plausible invented one.
        if unit in (None, "piece"):
            for name, factor in whole:
                if re.match(r"^1\b", name.strip()):
                    return factor * 100.0, "cnf:" + name.strip() + " (size approximated)"
        return None, None

    def fallback_count(self, name, unit):
        if not name:
            return None, None
        n = name.lower()
        for pattern, u, g, why in FALLBACK_COUNT:
            if u == unit and re.search(pattern, n):
                return g, "fallback:" + why
        return None, None

    def grams(self, qty, unit, fid, size=None, hint=None, name=None):
        """-> (grams, how). `how` names the path taken so Phase 5 can audit the weak ones."""
        if qty is None:
            return None, "no-quantity"
        if unit in UNIT_G:
            return qty * UNIT_G[unit], "mass"
        if unit in UNIT_ML:
            ml = qty * UNIT_ML[unit]
            d, src = (self.density(fid) if fid else (None, None))
            if d is None:
                d = FALLBACK_DENSITY.get(hint or "default", FALLBACK_DENSITY["default"])
                src = "fallback:" + (hint or "default")
            return ml * d, "volume/" + src
        # Hand table first: see the note on FALLBACK_COUNT. CNF's count measures are right
        # for Canadian produce and wrong for Philippine produce, and being wrong there is
        # silent, so a reviewed number beats a foreign one.
        g, src = self.fallback_count(name, unit)
        if g is not None:
            return qty * g, "count/" + src
        g, src = (self.count_grams(fid, unit, size) if fid else (None, None))
        if g is not None:
            return qty * g, "count/" + src
        return None, "unresolved-count"


if __name__ == "__main__":
    c = Converter()
    cases = [
        (2, "lb", None, None, "2 lbs chicken"),
        (5, "clove", "2394", None, "5 cloves garlic"),
        (1, "head", "2394", None, "1 head garlic"),
        (1 / 3, "cup", "3403", None, "1/3 cup soy sauce"),
        (4, "tbsp", "3403", None, "4 tbsp soy sauce"),
        (1, None, "2401", "medium", "1 medium onion"),
        (2, None, "2401", None, "2 onions"),
        (1, "cup", "2401", None, "1 cup onion"),
    ]
    for qty, unit, fid, size, label in cases:
        g, how = c.grams(qty, unit, fid, size)
        print("  %-22s -> %-10s [%s]" % (label, ("%.1f g" % g) if g else "unresolved", how))
