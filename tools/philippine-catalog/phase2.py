#!/usr/bin/env python3
"""Phase 2 -- turn the hand-written dish list into dishes.json, then score it against
the harvested corpus.

The list comes from filipino-catalog-plan.md and is authoritative. This script never adds a
dish; it only measures how much corpus evidence each one has, and assigns a tier from that.

  python phase2.py            score against corpus.jsonl if present, else urls.txt
  python phase2.py --urls     force the URL-slug-only pass (usable mid-harvest)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = os.path.join(HERE, "..", "..", "filipino-catalog-plan.md")

# Matching a dish name inside a recipe title is where a scoring pass quietly goes wrong:
# "adobo" matches adobong pusit, "puto" matches puto bumbong, "pancit" matches all five
# pancits. Every ambiguous dish gets an explicit include/exclude pair rather than a slug.
# Anything not listed here uses the auto-generated pattern (name, separators loosened).
OVERRIDES = {
    "Adobo (pork / chicken)": (r"\badobo(ng)?\b", r"pusit|kangkong|sitaw|gata|talong|squid|okra|manok sa"),
    "Adobo sa Gata": (r"adobo.{0,12}gata|gata.{0,12}adobo", None),
    "Adobong Pusit": (r"adobo.{0,10}(pusit|squid)|squid adobo", None),
    "Lechon": (r"\blechon\b", r"kawali|manok|paksiw|sauce|cebu"),
    "Lechon Kawali": (r"lechon.{0,6}kawali", None),
    "Lechon Cebu": (r"lechon.{0,10}cebu|cebu.{0,10}lechon", None),
    "Lechon Manok": (r"lechon.{0,6}manok", None),
    "Caldereta (beef)": (r"kaldereta|caldereta", r"kambing|goat"),
    "Kaldereta (goat, Batangas)": (r"(c|k)aldereta.{0,14}(kambing|goat)|(kambing|goat).{0,14}(c|k)aldereta", None),
    "Kilawin (meat)": (r"kilawin", None),
    "Kinilaw": (r"kinilaw", None),
    "Sinigang (pork / beef / shrimp)": (r"sinigang", r"isda|bangus|salmon|hipon|sugpo|shrimp"),
    "Sinigang na Isda": (r"sinigang.{0,14}(isda|bangus|salmon|fish)", None),
    "Tinola": (r"tinola", r"isda|fish|bangus"),
    "Tinolang Isda": (r"tinola.{0,12}(isda|fish|bangus)", None),
    "Pinakbet (Tagalog)": (r"pinakbet|pakbet", r"ilocano|ilokano"),
    "Pinakbet Ilocano": (r"(pinakbet|pakbet).{0,12}iloc?kano|iloc?kano.{0,12}(pinakbet|pakbet)", None),
    "Ginataang Gulay": (r"ginataang.{0,16}(gulay|kalabasa|sitaw)", None),
    "Ginataang Hipon": (r"ginataang.{0,10}(hipon|shrimp)", None),
    # alimasag (blue crab) and alimango (mud crab) are different animals cooked identically;
    # for a seeded macro row the difference is noise, so both count. Noted on the row.
    "Ginataang Alimango": (r"ginataa?n[g]?.{0,16}(alimango|alimasag|crab)|crab.{0,16}coconut", None),
    "Puto": (r"\bputo\b", r"bumbong|maya"),
    "Puto Bumbong": (r"puto.{0,6}bumbong", None),
    "Pancit Canton": (r"pancit.{0,4}canton|\bcanton\b", None),
    "Pancit Bihon": (r"pancit.{0,4}bihon|\bbihon\b", None),
    "Pancit Malabon": (r"pancit.{0,4}malabon", None),
    "Pancit Palabok": (r"palabok", None),
    "Pancit Habhab": (r"habhab", None),
    "Molo Soup / Pancit Molo": (r"\bmolo\b", None),
    "Lumpiang Shanghai": (r"lumpia.{0,12}shanghai|shanghai.{0,10}lumpia|spring roll", r"sariwa|fresh"),
    "Lumpiang Sariwa": (r"lumpia.{0,10}(sariwa|ubod)|fresh lumpia", None),
    "Relyeno / Rellenong Manok": (r"rell?enong?.{0,10}manok|relyenong?.{0,10}manok|stuffed chicken", None),
    "Rellenong Bangus": (r"rell?enong?.{0,10}bangus|relyenong?.{0,10}bangus|stuffed.{0,10}bangus", None),
    "Nilagang Baka": (r"nilaga|nilagang", None),
    "KBL (Kadyos, Baboy, Langka)": (r"\bkbl\b|kadyos|kadios", None),
    "La Paz Batchoy": (r"batchoy|bachoy", None),
    "Bam-i": (r"bam[-\s]?i\b", None),
    "Beef Pares": (r"\bpares\b", None),
    "Goto": (r"\bgoto\b", None),
    "Isaw": (r"\bisaw\b", None),
    "Betamax": (r"betamax|dugo.{0,12}stick|blood.{0,12}(cube|stick)", None),
    "Fishball": (r"fish.{0,3}ball", None),
    "Kwek-kwek": (r"kwek", None),
    "Banana Cue": (r"banana.{0,4}(cue|que)", None),
    "Camote Cue": (r"[ck]amote.{0,4}(cue|que)", None),
    "Halo-halo": (r"halo[-\s]?halo", None),
    "Sapin-sapin": (r"sapin[-\s]?sapin", None),
    "Kare-kare": (r"kare[-\s]?kare", None),
    "Steamed white rice": (None, None),   # not a corpus dish; one CNF lookup
    "Chorizo de Cebu": (r"chorizo.{0,10}cebu|longganisa.{0,10}cebu", None),
    "Ngohiong": (r"ngohiong|ngo hiong", None),
    "Inubarang Manok": (r"inubaran", None),
    "Budbud Kabog": (r"budbud|budbod", None),
    "Binagol": (r"binagol", None),
    "Balbacua": (r"balbacua|balbakwa", None),
    "Humba": (r"humba", None),
    "Chicken Inasal": (r"inasal", None),
    "Binakol": (r"binakol|binakel", None),
    "Sinampalukang Manok": (r"sinampaluk", None),
    "Ensaladang Talong": (r"ensalada.{0,10}talong|eggplant salad", None),
    "Tortang Talong": (r"torta.{0,10}talong|eggplant omelet", None),
    "Ginisang Ampalaya": (r"ampalaya", None),
    "Ginisang Sitaw": (r"\bsitaw\b|string bean", r"kalabasa|ginataang"),
    "Ginisang Munggo": (r"munggo|mongo", None),
    "Chopsuey": (r"chop\s?suey", None),
    "Daing na Bangus": (r"daing", None),
    "Paksiw na Isda": (r"paksiw", r"lechon|pata"),
    "Java Rice": (r"java rice", None),
    "Sinangag": (r"sinangag|garlic fried rice", None),
    "Mami": (r"\bmami\b", None),
    "Lomi": (r"\blomi\b", None),
    "Sotanghon": (r"sotanghon", None),
    "Biko": (r"\bbiko\b", None),
    "Suman": (r"\bsuman\b", None),
    "Turon": (r"\bturon\b", None),
    "Maruya": (r"maruya|banana fritter", None),
    "Ukoy": (r"ukoy|okoy", None),
    "Balut": (r"\bbalut\b", None),
    "Kikiam": (r"kikiam|que\s?kiam", None),
    "Pandesal": (r"pande?\s?sal", None),
    "Bagnet": (r"bagnet", None),
    "Tapa": (r"\btapa\b|tapsilog", None),
    "Tocino": (r"tocino|tosino", None),
    "Longganisa": (r"longganisa|longanisa", r"cebu"),
    "Asado": (r"asado", r"siopao"),
    "Igado": (r"igado", None),
    "Estofado": (r"estofado|estufado", None),
    "Papaitan": (r"papaitan", None),
    "Binagoongan": (r"binagoongan", None),
    "Dinuguan": (r"dinuguan", None),
    "Sisig": (r"sisig", None),
    "Bulalo": (r"bulalo", None),
    "Bringhe": (r"bringhe", None),
    "Champorado": (r"champorado|tsampurado", None),
    "Arroz Caldo": (r"arroz caldo|lugaw", None),
    "Escabeche": (r"escabeche", None),
    "Tinapa": (r"tinapa", None),
    "Laing": (r"\blaing\b", None),
    "Dinengdeng": (r"dinengdeng", None),
    "Crispy Pata": (r"crispy pata", None),
    "Bistek Tagalog": (r"bistek|beef steak", None),
    "Menudo": (r"menudo", None),
    "Afritada": (r"afritada", None),
    "Mechado": (r"mechado", None),
    "Pochero": (r"pochero|puchero", None),
    "Embutido": (r"embutido", None),
    "Morcon": (r"morcon", None),
    "Leche Flan": (r"leche flan", None),
    "Bibingka": (r"bibingka", None),
    "Kutsinta": (r"kutsinta|cuchinta", None),
    "Cassava Cake": (r"cassava cake", None),
    "Palitaw": (r"palitaw", None),
    "Dinuguan": (r"dinuguan", None),
}


# Recipe blogs publish endless derivative forms -- adobo fried rice, sisig pizza, sinigang
# pasta -- and every one of them matches its parent dish's name while being a different food
# with different macros. "Adobo Fried Rice" scoring as adobo put 641 g of cooked rice into
# the median adobo. A dish only accepts a derivative title if it is itself that form.
DERIVATIVE = re.compile(
    r"\b(fried rice|pizza|pasta|spaghetti|sandwich|burger|empanada|nachos|dip|burrito|"
    r"quesadilla|taco|lasagna|casserole|salad wrap|spring roll|flakes|chips|fritter|"
    r"cupcake|ice cream|smoothie|shake|cheesecake|leftover|"
    # A -silog is a PLATE: meat, garlic rice and a fried egg together. It is not the meat and
    # it is not the rice. "Bangsilog" and "Tonkatsu Sinangag at Itlog" were counted as
    # sinangag, which is how 31% UNCOOKED rice got into a fried-rice dish. No leading \b --
    # the boundary sits inside "bangsilog", not before it.
    r"\w*silog|tonkatsu|combo|platter|meal set)\b", re.I)


def auto_pattern(name):
    base = re.sub(r"\*\(V\)\*", "", name)
    base = re.sub(r"\([^)]*\)", "", base).strip().lower()
    base = re.sub(r"\s*/\s*", " ", base)
    parts = [re.escape(p) for p in re.split(r"[\s-]+", base) if p]
    return r"[-\s]?".join(parts)


def parse_plan():
    text = open(PLAN, encoding="utf-8").read()
    text = text[text.index("### Main / ulam"):]
    dishes, section = [], None
    for line in text.splitlines():
        if line.startswith("### "):
            section = line[4:].strip()
            continue
        m = re.match(r"\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|", line)
        if not m:
            continue
        num, name, old_count, old_tier = m.groups()
        visayan = "*(V)*" in name
        clean = re.sub(r"\s*\*\(V\)\*", "", name).strip()
        if clean in OVERRIDES:
            inc, exc = OVERRIDES[clean]
        else:
            inc, exc = auto_pattern(clean), None
        dishes.append({
            "n": int(num), "name": clean, "section": section,
            "region": "Visayas" if visayan else "Luzon",
            "include": inc, "exclude": exc,
            "planned_count": old_count, "planned_tier": old_tier,
        })
    return dishes


def hay(*parts):
    """URL slugs hyphenate what a title spaces, so `crispy pata` must match
    `/crispy-pata/`. Flatten every separator to a single space once, here, rather than
    writing each pattern twice."""
    s = " ".join(p for p in parts if p).lower()
    return re.sub(r"[-_/.]+", " ", s)


def load_records(force_urls=False):
    corpus = os.path.join(HERE, "corpus.jsonl")
    if not force_urls and os.path.exists(corpus):
        recs = [json.loads(l) for l in open(corpus, encoding="utf-8")]
        return ([{"url": r["url"], "hay": hay(r.get("name"), r["url"])} for r in recs],
                "corpus.jsonl")
    urls = [l.strip() for l in open(os.path.join(HERE, "urls.txt"), encoding="utf-8") if l.strip()]
    return [{"url": u, "hay": hay(u)} for u in urls], "urls.txt"


def main():
    dishes = parse_plan()
    recs, source = load_records("--urls" in sys.argv)
    no_override = [d["name"] for d in dishes if d["name"] not in OVERRIDES]
    for d in dishes:
        if not d["include"]:
            d["matches"], d["count"], d["tier"] = [], None, "cnf"
            continue
        inc = re.compile(d["include"], re.I)
        exc = re.compile(d["exclude"], re.I) if d["exclude"] else None
        self_derivative = bool(DERIVATIVE.search(d["name"]))
        hits = [r["url"] for r in recs
                if inc.search(r["hay"])
                and not (exc and exc.search(r["hay"]))
                and not (DERIVATIVE.search(r["hay"]) and not self_derivative)]
        d["matches"] = hits
        d["count"] = len(hits)
        d["tier"] = 1 if len(hits) >= 5 else (2 if hits else 3)
    # ONE RECIPE, ONE DISH. "Ginisang Munggo with Tinapa" matches both munggo and tinapa,
    # and counting it for both put a mung bean stew into the median smoked fish -- 6 g of
    # protein in a fish dish. Likewise "Tapsilog" fed cooked rice into beef tapa, and listicle
    # posts fed pinakbet into lechon kawali.
    #
    # Which dish a title is depends on HOW the two names are joined, and an earlier version
    # of this got it exactly backwards by taking the first name every time:
    #
    #   "Ginisang Munggo with Tinapa"  -> munggo. "A with B" is an A that has B in it.
    #   "Crispy Pata Sisig"            -> SISIG.  A bare compound is head-FINAL in both
    #                                     English and Tagalog: the last noun is the dish.
    #
    # Taking the first name made Crispy Pata out of a sisig and a dinakdakan, and put chicken
    # liver in a pork dish. So: cut the title at a joining word, then take the LAST dish named
    # in the part before it.
    JOIN = re.compile(r"\b(with|and|at|sa|topped|over|plus|served)\b", re.I)
    claims = {}
    for d in dishes:
        if not d["include"]:
            continue
        inc = re.compile(d["include"], re.I)
        for url in d["matches"]:
            title = next((r["hay"] for r in recs if r["url"] == url), "")
            head = JOIN.split(title)[0] or title
            m = inc.search(head)
            # -m.start() so that max() picks the LAST match within the head phrase, while a
            # dish named only after the joining word loses to any dish named before it.
            claims.setdefault(url, []).append((0 if m else -1, m.start() if m else -10 ** 6,
                                               d["n"]))
    winner = {url: max(cs)[2] for url, cs in claims.items()}
    taken = 0
    for d in dishes:
        if not d["include"]:
            continue
        kept = [u for u in d["matches"] if winner.get(u) == d["n"]]
        taken += len(d["matches"]) - len(kept)
        d["matches"] = kept
        d["count"] = len(kept)
        d["tier"] = 1 if len(kept) >= 5 else (2 if kept else 3)
    print("contested recipes reassigned by head-noun rule: %d" % taken)

    json.dump(dishes, open(os.path.join(HERE, "dishes.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)

    tiers = {1: 0, 2: 0, 3: 0, "cnf": 0}
    for d in dishes:
        tiers[d["tier"]] += 1
    print("scored %d dishes against %d records from %s" % (len(dishes), len(recs), source))
    print("tier 1 (5+): %d   tier 2 (1-4): %d   tier 3 (0): %d   cnf-only: %d"
          % (tiers[1], tiers[2], tiers[3], tiers["cnf"]))
    if no_override:
        print("\nusing auto-generated patterns (no hand-written include): %s" % ", ".join(no_override))
    moved = [d for d in dishes if str(d["planned_tier"]) not in (str(d["tier"]), "--")]
    print("\ntier changed vs the plan's slug estimate: %d" % len(moved))
    for d in sorted(moved, key=lambda x: x["n"]):
        print("  %3d %-34s %4s -> %-4s tier %s -> %s"
              % (d["n"], d["name"][:34], d["planned_count"], d["count"], d["planned_tier"], d["tier"]))
    print("\ntier 3 (no corpus evidence):")
    for d in dishes:
        if d["tier"] == 3:
            print("  %3d %s  [%s]" % (d["n"], d["name"], d["region"]))


if __name__ == "__main__":
    main()
