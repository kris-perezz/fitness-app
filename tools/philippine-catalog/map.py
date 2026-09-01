#!/usr/bin/env python3
"""Phase 3, part three -- propose a CNF food for every ingredient name, for review.

This is the only step in the pipeline that involves judgement, so it is the only one whose
output is a file a human reads. It proposes; it never decides. `mapping.tsv` is the reviewed
artefact and it wins over anything this script would suggest on a re-run.

  python map.py propose      -> mapping.candidates.tsv, ranked guesses for unmapped names
  python map.py status       -> how much of the corpus by weight is mapped

Ranking is token overlap against CNF descriptions with a few deliberate thumbs on the scale:
CNF writes "Onion, raw" and "Pork, fresh, belly, raw", so a raw entry beats a cooked one for
an ingredient going into a pot, and a shorter description beats a longer one because CNF's
long descriptions are branded or heavily prepared variants.
"""
import collections, json, os, re, sys

import cnf

HERE = os.path.dirname(os.path.abspath(__file__))
MAPPING = os.path.join(HERE, "mapping.tsv")

STOP = {"of", "the", "a", "an", "and", "or", "for", "to", "in", "with", "into", "about",
        "large", "small", "medium", "big", "whole", "fresh", "dried", "ground", "boneless",
        "skinless", "lean", "extra", "virgin", "pure", "all", "purpose"}

# Filipino ingredient names the corpus uses that CNF has never heard of, mapped to the CNF
# food they are nutritionally. Each one is a judgement and gets written down here rather than
# hidden in a score.
SYNONYMS = {
    "patis": "fish sauce", "toyo": "soy sauce", "suka": "vinegar",
    "bagoong": "shrimp paste", "gata": "coconut milk", "kalamansi": "lime",
    "calamansi": "lime", "sitaw": "green beans", "kangkong": "spinach",
    "malunggay": "spinach", "talong": "eggplant", "kalabasa": "squash",
    "ampalaya": "bitter melon", "labanos": "radish", "upo": "gourd",
    "baboy": "pork", "manok": "chicken", "baka": "beef", "isda": "fish",
    "hipon": "shrimp", "pusit": "squid", "alimasag": "crab", "alimango": "crab",
    "bangus": "milkfish", "tilapia": "tilapia", "itlog": "egg", "bawang": "garlic",
    "sibuyas": "onion", "luya": "ginger", "asin": "salt", "asukal": "sugar",
    "mantika": "oil", "kamote": "sweet potato", "gabi": "taro", "ubod": "palm heart",
    "puso ng saging": "banana flower", "dahon ng laurel": "bay leaf",
    "siling haba": "pepper", "siling labuyo": "chili pepper",
    "pechay": "bok choy", "repolyo": "cabbage", "patatas": "potato",
    "karot": "carrot", "kamatis": "tomato", "sili": "pepper",
}


def tokens(s):
    return [t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if t and t not in STOP]


def load_mapping():
    """name -> (cnf_food_id, note). Reviewed by hand; this file is the source of truth."""
    out = {}
    if not os.path.exists(MAPPING):
        return out
    for line in open(MAPPING, encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2:
            continue
        name, fid = parts[0].strip(), parts[1].strip()
        out[name] = (fid or None, parts[2].strip() if len(parts) > 2 else "")
    return out


def resolve(name, mapped):
    """Find a mapping for `name`, falling back through spellings of the same thing.

    The corpus writes one ingredient a dozen ways -- "chicken thighs", "bone-in beef shanks",
    "extra firm tofu" -- and hand-mapping every variant is a losing race. English puts the
    head noun on the right, so dropping leading words walks toward the general case:
    "extra firm tofu" -> "firm tofu" -> "tofu". Returns (food_id, how), where `how` is
    "exact" or the spelling that actually matched, so a loose match is visible downstream
    rather than silently equal to a reviewed one.
    """
    name = name.strip()
    if name in mapped:
        return mapped[name][0], "exact"
    words = name.split()
    for start in range(len(words)):
        tail = words[start:]
        for variant in _variants(" ".join(tail)):
            if variant in mapped and variant != name:
                return mapped[variant][0], variant
    return None, None


def _variants(s):
    """The same phrase singular and plural, since the corpus uses both."""
    out = [s]
    words = s.split()
    if not words:
        return out
    last = words[-1]
    if last.endswith("ies") and len(last) > 4:
        out.append(" ".join(words[:-1] + [last[:-3] + "y"]))
    if last.endswith("es") and len(last) > 3:
        out.append(" ".join(words[:-1] + [last[:-2]]))
    if last.endswith("s") and len(last) > 2:
        out.append(" ".join(words[:-1] + [last[:-1]]))
    else:
        out.append(s + "s")
        out.append(s + "es")
    return out


def name_counts():
    """Distinct ingredient name -> how many recipes use it."""
    counts = collections.Counter()
    path = os.path.join(HERE, "parsed.jsonl")
    for line in open(path, encoding="utf-8"):
        for item in json.loads(line)["items"]:
            n = item["name"].strip()
            if n:
                counts[n] += 1
    return counts


class Matcher:
    def __init__(self):
        self.foods = cnf.load_foods()
        self.index = collections.defaultdict(list)
        for fid, desc in self.foods.items():
            for t in set(tokens(desc)):
                self.index[t].append(fid)

    def candidates(self, name, limit=5):
        q = tokens(name)
        for i, t in enumerate(q):
            if t in SYNONYMS:
                q = q[:i] + tokens(SYNONYMS[t]) + q[i + 1:]
        if not q:
            return []
        scored = collections.Counter()
        for t in q:
            for fid in self.index.get(t, ()):
                scored[fid] += 1
        out = []
        for fid, hits in scored.most_common(400):
            desc = self.foods[fid]
            dt = tokens(desc)
            score = hits / float(len(q))                 # how much of the query is covered
            score -= 0.02 * max(0, len(dt) - len(q))      # prefer short, generic entries
            if re.search(r"\braw\b", desc, re.I):
                score += 0.15
            if re.search(r"\b(cooked|boiled|fried|roasted|canned|baby ?food|dehydrated)\b", desc, re.I):
                score -= 0.10
            out.append((round(score, 3), fid, desc))
        out.sort(reverse=True)
        return out[:limit]


def cmd_propose():
    counts = name_counts()
    mapped = load_mapping()
    m = Matcher()
    todo = [(n, c) for n, c in counts.most_common() if n not in mapped]
    path = os.path.join(HERE, "mapping.candidates.tsv")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# name\tfood_id\tnote\t| candidates (score food_id description)\n")
        f.write("# review: put the right food_id in column 2, or leave it blank to drop the\n")
        f.write("# ingredient, then move the line into mapping.tsv. Column 3 is for why.\n")
        for name, count in todo:
            cands = m.candidates(name)
            best = cands[0] if cands else None
            f.write("%s\t%s\t(x%d)\t| %s\n" % (
                name, best[1] if best else "", count,
                "  ||  ".join("%.2f %s %s" % (s, fid, d) for s, fid, d in cands)))
    print("%d names to review -> %s" % (len(todo), os.path.basename(path)))
    print("(%d already mapped in mapping.tsv)" % len(mapped))
    print("\ntop 15 unmapped, with the leading candidate:")
    for name, count in todo[:15]:
        cands = m.candidates(name, 1)
        print("  %4d  %-28s -> %s" % (count, name[:28], cands[0][2][:52] if cands else "NO CANDIDATE"))


def cmd_status():
    counts = name_counts()
    mapped = load_mapping()
    total = sum(counts.values())
    hit = sum(c for n, c in counts.items() if n in mapped)
    print("ingredient lines: %d" % total)
    print("mapped:           %d (%.1f%%)" % (hit, 100.0 * hit / max(total, 1)))
    print("distinct names:   %d, of which mapped %d" % (len(counts), len(mapped)))
    missing = [(c, n) for n, c in counts.items() if n not in mapped]
    missing.sort(reverse=True)
    print("\nbiggest unmapped:")
    for c, n in missing[:12]:
        print("  %4d  %s" % (c, n[:60]))


if __name__ == "__main__":
    {"propose": cmd_propose, "status": cmd_status}.get(
        sys.argv[1] if len(sys.argv) > 1 else "status", cmd_status)()
