#!/usr/bin/env python3
"""The gram table -- per-item weights for things counted rather than weighed.

This turned out to matter far more than "a fallback for what CNF lacks". CNF's whole-item
measures are CANADIAN-sized: one eggplant is 458 g there against a Filipino talong of about
100 g, and a "medium" onion resolves to CNF's "1 large" at 150 g. Trusting CNF first made
tortang talong 70% eggplant at a 614 g serving. So these take PRECEDENCE over CNF's count
measures, and CNF is consulted only for counts nobody names here.

Ordered, first match wins, so the specific goes before the general -- "quail egg" before
"egg", or a quail egg is priced as a chicken egg and comes out five times too heavy.

Every row carries where its number came from. A wrong number in this file is invisible
downstream: it produces a plausible dish that is simply not the dish.

Unit `None` means a bare count with no unit word at all -- "2 onions", "1 whole chicken".
Both spellings are listed for anything the corpus writes both ways.
"""

# (name pattern, unit or None, grams, source)
FALLBACK_COUNT = [
    (r"quail egg", None, 9.0, "1 quail egg ~9 g"),
    (r"quail egg", "piece", 9.0, "1 quail egg ~9 g"),
    # \b before "egg" still matches EGGPLANT -- the boundary sits at the word start either
    # way -- so the trailing boundary is the one doing the work here.
    (r"\begg(s|whites?|yolks?)?\b", "piece", 50.0, "USDA 1 large egg 50 g"),
    (r"\begg(s|whites?|yolks?)?\b", None, 50.0, "USDA 1 large egg 50 g"),

    # Peppers. Siling haba is a mild finger chili; labuyo is the tiny hot one. Getting these
    # confused with the ground black pepper SPICE cost a 200x understatement once already.
    (r"siling haba|long green pepper|finger chil", None, 12.0, "1 siling haba ~12 g, weighed"),
    (r"siling haba|long green pepper|finger chil", "piece", 12.0, "1 siling haba ~12 g"),
    (r"siling labuyo|bird.?s eye", "piece", 1.0, "1 labuyo ~1 g"),
    (r"siling labuyo|bird.?s eye", None, 1.0, "1 labuyo ~1 g"),
    (r"chil[il]|\bsili\b", "piece", 5.0, "1 finger chili ~5 g"),
    (r"bell pepper", "piece", 120.0, "1 medium bell pepper ~120 g"),

    # Produce, at Philippine sizes rather than Canadian ones.
    (r"eggplant|talong", None, 100.0, "1 Filipino talong ~100 g; CNF's 458 g row is a "
                                      "Western globe eggplant"),
    (r"eggplant|talong", "piece", 100.0, "1 Filipino talong ~100 g"),
    (r"kalabasa|squash", "piece", 1000.0, "1 whole kabocha ~1 kg; recipes usually take a "
                                          "fraction of one"),
    (r"onion|sibuyas", None, 110.0, "1 Filipino red onion ~110 g; CNF offers only '1 large' "
                                    "at 150 g"),
    (r"onion|sibuyas", "piece", 110.0, "1 Filipino red onion ~110 g"),
    (r"potato|patatas", "piece", 150.0, "1 medium potato ~150 g"),
    (r"potato|patatas", None, 150.0, "1 medium potato ~150 g"),
    (r"tomato|kamatis", "piece", 100.0, "1 medium tomato ~100 g"),
    (r"tomato|kamatis", None, 100.0, "1 medium tomato ~100 g"),
    (r"carrot|karot", "piece", 60.0, "1 medium carrot ~60 g"),
    (r"carrot|karot", None, 60.0, "1 medium carrot ~60 g"),
    (r"okra", "piece", 12.0, "USDA 1 medium pod 12 g"),
    (r"okra", None, 12.0, "USDA 1 medium pod 12 g"),
    (r"banana|saging", "piece", 118.0, "USDA 1 medium banana 118 g"),
    (r"banana|saging", None, 118.0, "USDA 1 medium banana 118 g"),
    (r"lime|calamansi|kalamansi", "piece", 15.0, "1 calamansi ~15 g, weighed"),
    (r"lime|calamansi|kalamansi", None, 15.0, "1 calamansi ~15 g, weighed"),
    (r"lemon", "piece", 67.0, "USDA 1 lemon 67 g"),
    (r"string bean|sitaw|yardlong", "piece", 6.0, "1 long bean ~6 g"),
    (r"bok choy|pechay", "bunch", 340.0, "1 bunch ~340 g, weighed"),
    (r"lemongrass|tanglad", "stalk", 20.0, "1 trimmed stalk ~20 g"),
    (r"pandan", "leaf", 5.0, "1 pandan leaf ~5 g"),
    (r"\bbay\b", "piece", 0.2, "USDA 1 bay leaf 0.2 g"),
    (r"\bbay\b", None, 0.2, "USDA 1 bay leaf 0.2 g"),
    (r"star anise", "piece", 0.5, "1 whole star ~0.5 g"),
    (r"ginger|luya", "knob", 15.0, "1 thumb-size piece ~15 g"),
    (r"ginger|luya", "piece", 15.0, "1 thumb-size piece ~15 g"),

    # Cubes and sachets come FIRST, and the reason is a bug this file's own docstring told me
    # to avoid: `\bchicken\b` sat above the bouillon rule, so "1 piece Knorr Chicken Cube"
    # weighed 1,200 g. A bowl of mami took 129 g of dry bouillon powder a serving and read
    # 1,305 kcal. Every counted chicken PART -- wings, liver, breast -- weighed a whole bird
    # too. 69 lines across the corpus.
    (r"cube|knorr|maggi|bouillon|broth cube|seasoning", "piece", 4.0, "1 bouillon cube 4 g"),
    (r"cube|knorr|maggi|bouillon|broth cube|seasoning", None, 4.0, "1 bouillon cube 4 g"),

    # Whole proteins. CNF prices these per 100 g and carries no whole-item measure, so before
    # these entries existed the line simply DROPPED -- which is how a stuffed milkfish and a
    # smoked fish both ended up in the catalog with no fish in them at all.
    (r"whole chicken", "piece", 1200.0, "1 whole chicken ~1.2 kg edible portion"),
    (r"whole chicken", None, 1200.0, "1 whole chicken ~1.2 kg edible portion"),

    # A whole pork leg. Missing this weight is what destroyed Crispy Pata: EVERY genuine
    # recipe names the cut whole ("1 whole pig leg", "1 piece 3 to 4 lbs. pig leg"), produced
    # no grams, and was thrown out -- leaving only a sisig and a dinakdakan made FROM crispy
    # pata, and putting chicken liver into a pork dish. The gate that protects against a
    # missing ingredient deletes canonical recipes unless the canonical cuts are in here.
    #
    # Edible portion, not as-purchased: the recipes themselves say 1.7-2 kg for a whole leg,
    # of which roughly a third is bone. Skin and fat ARE eaten in this dish, so only bone
    # comes off.
    (r"pig leg|pork leg|whole pata|pata\b", "piece", 1200.0,
     "1 whole pig leg ~1.8 kg as purchased, ~1.2 kg edible (bone off, skin on)"),
    (r"pig leg|pork leg|whole pata|pata\b", None, 1200.0,
     "1 whole pig leg ~1.8 kg as purchased, ~1.2 kg edible"),
    (r"pork hock|ham hock|pata", "piece", 800.0, "1 hock ~1.1 kg as purchased, ~800 g edible"),
    (r"pork hock|ham hock|pata", None, 800.0, "1 hock ~1.1 kg as purchased, ~800 g edible"),
    (r"lemongrass|tanglad", "bunch", 60.0, "1 bunch of 3 stalks, tied ~60 g"),
    # A counted "chicken" is a whole bird ONLY when nothing narrows it. A wing, a breast, a
    # liver, a thigh or a hotdog is a part, and pricing a part as a bird is a 20x error.
    (r"^(a |one )?chickens?$", "piece", 1200.0, "an unqualified counted chicken is a whole one"),
    (r"^(a |one )?chickens?$", None, 1200.0, "an unqualified counted chicken is a whole one"),
    (r"bangus|milkfish", "piece", 500.0, "1 medium bangus ~500 g"),
    (r"bangus|milkfish", None, 500.0, "1 medium bangus ~500 g"),
    (r"tilapia", "piece", 250.0, "1 tilapia ~250 g"),
    (r"tilapia", None, 250.0, "1 tilapia ~250 g"),
    (r"\bfish\b|isda|bisugo|galunggong", "piece", 400.0, "1 whole market fish ~400 g"),
    (r"\bfish\b|isda|bisugo|galunggong", None, 400.0, "1 whole market fish ~400 g"),
    (r"\bcrab\b|alimango|alimasag", "piece", 300.0, "1 crab ~300 g whole"),
    (r"\bsquid\b|pusit", "piece", 150.0, "1 medium squid ~150 g"),

    # Cans. The corpus writes the real size in a bracket ("1 (14 oz) can"), which parse.py now
    # reads; these cover the lines that just say "1 can".
    (r"coconut milk|gata", "can", 400.0, "1 standard can 400 ml"),
    (r"condensed milk", "can", 390.0, "1 standard can 390 g"),
    (r"evaporated milk", "can", 370.0, "1 standard can 370 ml"),
    (r"tomato sauce", "can", 230.0, "1 standard can 230 g"),
    (r"tomato paste", "can", 170.0, "1 standard can 170 g"),
    (r".", "can", 400.0, "unspecified can, 400 g"),

    (r"cube|knorr|maggi|bouillon", "piece", 4.0, "1 bouillon cube 4 g"),
    (r"cube|knorr|maggi|bouillon", None, 4.0, "1 bouillon cube 4 g"),
]
