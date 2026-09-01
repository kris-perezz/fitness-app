#!/usr/bin/env python3
"""Phase 6 -- generate 0020_seed_filipino_foods.sql from dishes.computed.json.

Never hand-type the rows. The migration is a build artefact of this pipeline, and if a number
in it is wrong the fix is upstream, in the mapping or the gram conversion, not in the SQL.

Three things this does that a naive INSERT would not:

- **Checks for collisions with 0002.** Pandesal is already in the catalog as `bread_pandesal`,
  verified from a real label. A computed median must never shadow a transcribed label (S6's
  hierarchy), so a dish already present is skipped and reported, not inserted.
- **Refuses dishes that did not compute cleanly.** A row whose ingredients only half resolved
  is a partial dish wearing a full dish's name, and nothing downstream can tell.
- **Writes the provenance into the migration**, including what is missing: CNF attribution,
  the substitutions, and the fact that Mindanao is absent by decision rather than oversight.

  python seed.py            -> ../../supabase/migrations/0020_seed_filipino_foods.sql
  python seed.py --dry-run  -> print the summary only
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = os.path.abspath(os.path.join(HERE, "..", "..", "supabase", "migrations"))
OUT = os.path.join(MIGRATIONS, "0020_seed_filipino_foods.sql")

# Aliases are what make a catalog usable -- the exercise catalog learned that across 0015 and
# 0016. These are the spellings you would actually type, per dish, beyond the obvious ones
# generated from the name itself.
EXTRA_ALIASES = {
    "Adobo (pork / chicken)": ["adobo", "adobong baboy", "adobong manok", "pork adobo",
                               "chicken adobo"],
    "Adobo sa Gata": ["adobo sa gata", "coconut adobo"],
    "Sinigang (pork / beef / shrimp)": ["sinigang", "sinigang na baboy", "sour soup"],
    "Kare-kare": ["kare kare", "karekare", "peanut stew"],
    "Caldereta (beef)": ["kaldereta", "caldereta", "beef kaldereta"],
    "Kaldereta (goat, Batangas)": ["kalderetang kambing", "goat kaldereta"],
    "Pinakbet (Tagalog)": ["pinakbet", "pakbet"],
    "Ginisang Munggo": ["munggo", "mongo", "monggo guisado"],
    "Lumpiang Shanghai": ["lumpia", "lumpiang shanghai", "spring rolls"],
    "Chicken Inasal": ["inasal", "chicken inasal"],
    "La Paz Batchoy": ["batchoy", "la paz batchoy"],
    "Bistek Tagalog": ["bistek", "beef steak tagalog"],
    "Sinangag": ["garlic fried rice", "sinangag"],
    "Steamed white rice": ["rice", "kanin", "white rice", "steamed rice"],
    # The rest: the English name, the Tagalog name, and the spelling you would actually
    # thumb into a phone. A catalog nobody can find is a catalog nobody uses.
    "Lechon Kawali": ["lechon kawali", "crispy pork belly", "deep fried pork belly"],
    "Crispy Pata": ["crispy pata", "fried pork knuckle"],
    "Bagnet": ["bagnet", "ilocano crispy pork"],
    "Menudo": ["menudo", "pork menudo"],
    "Afritada": ["afritada", "chicken afritada", "apritada"],
    "Mechado": ["mechado", "beef mechado"],
    "Pochero": ["pochero", "puchero"],
    "Dinuguan": ["dinuguan", "blood stew", "chocolate meat"],
    "Sisig": ["sisig", "pork sisig", "sizzling sisig"],
    "Binagoongan": ["binagoongan", "pork binagoongan", "bagoong pork"],
    "Longganisa": ["longganisa", "longanisa", "filipino sausage"],
    "Tocino": ["tocino", "sweet cured pork"],
    "Tapa": ["tapa", "beef tapa", "tapsilog"],
    "Humba": ["humba", "braised pork humba"],
    "Beef Pares": ["pares", "beef pares"],
    "Paksiw na Isda": ["paksiw", "paksiw na isda", "fish in vinegar"],
    "Daing na Bangus": ["daing", "daing na bangus", "marinated milkfish"],
    "Adobong Pusit": ["adobong pusit", "squid adobo"],
    "Laing": ["laing", "taro leaves in coconut milk"],
    "Chopsuey": ["chopsuey", "chop suey"],
    "Ginisang Ampalaya": ["ampalaya", "ginisang ampalaya", "bitter melon with egg"],
    "Tortang Talong": ["tortang talong", "eggplant omelette"],
    "Tinola": ["tinola", "tinolang manok", "chicken ginger soup"],
    "Bulalo": ["bulalo", "beef marrow soup"],
    "Nilagang Baka": ["nilaga", "nilagang baka", "boiled beef"],
    "Goto": ["goto", "beef tripe congee"],
    "Arroz Caldo": ["arroz caldo", "lugaw", "chicken congee"],
    "Pancit Canton": ["pancit canton", "canton", "pansit canton"],
    "Pancit Bihon": ["pancit bihon", "bihon", "pansit bihon"],
    "Pancit Palabok": ["palabok", "pancit palabok"],
    "Sotanghon": ["sotanghon", "glass noodles"],
    "Lomi": ["lomi", "batangas lomi"],
    "Turon": ["turon", "banana lumpia"],
    "Ukoy": ["ukoy", "okoy", "shrimp fritter"],
    "Leche Flan": ["leche flan", "creme caramel"],
    "Halo-halo": ["halo halo", "halohalo"],
    "Bibingka": ["bibingka", "rice cake"],
    "Puto": ["puto", "steamed rice cake"],
    "Biko": ["biko", "sticky rice cake"],
    "Suman": ["suman", "sticky rice roll"],
    "Cassava Cake": ["cassava cake", "cassava bibingka"],
    "Champorado": ["champorado", "chocolate rice porridge", "tsampurado"],
    "Ginisang Munggo": ["munggo", "mongo", "monggo guisado", "mung bean stew"],
    "Chicken Inasal": ["inasal", "chicken inasal", "grilled chicken inasal"],
    "Lumpiang Sariwa": ["lumpiang sariwa", "fresh lumpia"],
    "Kilawin (meat)": ["kilawin", "kilawing baboy"],
    "Kinilaw": ["kinilaw", "filipino ceviche"],
    "Igado": ["igado", "ilocano igado"],
    "Estofado": ["estofado", "estufado"],
    "Asado": ["asado", "pork asado"],
    "Embutido": ["embutido", "filipino meatloaf"],
    "Morcon": ["morcon", "beef morcon"],
    "Tinapa": ["tinapa", "smoked fish"],
    "Escabeche": ["escabeche", "sweet and sour fish"],
    "Dinengdeng": ["dinengdeng", "inabraw"],
    "Ginataang Gulay": ["ginataang gulay", "vegetables in coconut milk"],
    "Ginataang Hipon": ["ginataang hipon", "shrimp in coconut milk"],
    "Ginataang Alimango": ["ginataang alimango", "crab in coconut milk", "ginataang alimasag"],
    "La Paz Batchoy": ["batchoy", "la paz batchoy", "bachoy"],
    "Molo Soup / Pancit Molo": ["molo soup", "pancit molo", "molo"],
    "Binakol": ["binakol", "chicken in coconut water"],
    "Balbacua": ["balbacua", "balbakwa"],
    "Bam-i": ["bam i", "bami", "cebu bam-i"],
    "Lechon": ["lechon", "roast pig", "lechon baboy"],
    "Lechon Manok": ["lechon manok", "roast chicken"],
    "Kaldereta (goat, Batangas)": ["kalderetang kambing", "goat caldereta"],
    "Sinigang na Isda": ["sinigang na isda", "fish sinigang"],
    "Tinolang Isda": ["tinolang isda", "fish tinola"],
    "Rellenong Bangus": ["rellenong bangus", "stuffed milkfish"],
    "Relyeno / Rellenong Manok": ["rellenong manok", "stuffed chicken", "relyeno"],
    "Sinampalukang Manok": ["sinampalukan", "sinampalukang manok"],
    "Ensaladang Talong": ["ensaladang talong", "eggplant salad"],
    "Pinakbet (Tagalog)": ["pinakbet", "pakbet", "pinakbet tagalog"],
    "Ginisang Sitaw": ["ginisang sitaw", "sauteed string beans"],
    "Java Rice": ["java rice", "yellow rice"],
    "Bringhe": ["bringhe", "filipino paella"],
    "Isaw": ["isaw", "grilled chicken intestine"],
    "Betamax": ["betamax", "grilled pork blood"],
    "Fishball": ["fishball", "fish ball"],
    "Kwek-kwek": ["kwek kwek", "kwekkwek", "orange quail eggs"],
    "Kikiam": ["kikiam", "que kiam"],
    "Balut": ["balut"],
    "Banana Cue": ["banana cue", "bananacue", "banana que"],
    "Camote Cue": ["camote cue", "kamote cue"],
    "Maruya": ["maruya", "banana fritter"],
    "Puto Bumbong": ["puto bumbong"],
    "Kutsinta": ["kutsinta", "cuchinta"],
    "Sapin-sapin": ["sapin sapin"],
    "Palitaw": ["palitaw"],
    "Papaitan": ["papaitan", "goat innards soup"],
    "Mami": ["mami", "beef mami", "chicken mami"],
    "Pancit Malabon": ["pancit malabon"],
    "Pancit Habhab": ["pancit habhab", "lucban pancit"],
    "KBL (Kadyos, Baboy, Langka)": ["kbl", "kadyos baboy langka"],
}


# S35. The cooked weight of a Filipino dish is not derivable from a recipe -- that was
# Phase 0's finding and no amount of arithmetic has changed it. Rather than ship an invented
# gram weight, the portion becomes informal but STABLE, which is the hand-portion argument
# applied to a catalog row: a systematic error cancels out of an adaptive TDEE, a noisy one
# does not. So `grams_per_unit` is null -- canMeasure() then correctly refuses a grams input
# and offers a count of units instead -- and the unit is a word you can picture.
UNIT_FOR_SECTION = {
    "Soups": "bowl",
    "Rice and noodles": "bowl",
    "Street food and snacks": "piece",
    "Bread, desserts and kakanin": "piece",
}
DEFAULT_UNIT = "serving"

# Dishes whose natural portion is not their section's. A pancit is served as a plate, not a
# bowl; a whole leche flan is not one piece.
UNIT_OVERRIDE = {
    "Pancit Canton": "serving", "Pancit Bihon": "serving", "Pancit Palabok": "serving",
    "Sotanghon": "serving", "Bam-i": "serving", "Sinangag": "cup", "Java Rice": "cup",
    "Champorado": "bowl", "Arroz Caldo": "bowl", "Goto": "bowl",
    "Leche Flan": "slice", "Bibingka": "slice", "Cassava Cake": "slice", "Biko": "slice",
    "Halo-halo": "glass", "Lumpiang Shanghai": "piece", "Lumpiang Sariwa": "roll",
}


def unit_for(name, section):
    return UNIT_OVERRIDE.get(name) or UNIT_FOR_SECTION.get(section, DEFAULT_UNIT)


def slug(name):
    s = re.sub(r"\([^)]*\)", "", name).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return "fil_" + s


def aliases(name):
    base = re.sub(r"\([^)]*\)", "", name).strip().lower()
    out = {base, base.replace("-", " ")}
    # "karekare" is a real spelling; "adobosagata" is not. Collapse spaces only for two-word
    # names, where the run-together form is how people actually type it.
    if len(base.split()) <= 2:
        out.add(base.replace(" ", "").replace("-", ""))
    out |= set(EXTRA_ALIASES.get(name, []))
    return sorted(a for a in out if a)


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def sql_array(items):
    return "ARRAY[" + ",".join(sql_str(i) for i in items) + "]::text[]"


def num(v, default="null"):
    return default if v is None else ("%g" % round(float(v), 3))


def existing_catalog():
    """ids, names AND aliases already in the catalog, so a computed median never shadows a
    label. Aliases matter as much as names: 0002 carries pandesal as `bread_pandesal`, named
    "Pandesal (homemade)". Comparing names alone misses it, and the catalog ends up with two
    pandesals -- one transcribed from a real label, one a computed median, ranked equal in
    search. Aliases are how a user finds either, so aliases are what must not collide."""
    ids, names = set(), set()
    path = os.path.join(MIGRATIONS, "0002_seed_foods.sql")
    if not os.path.exists(path):
        return ids, names
    text = open(path, encoding="utf-8").read()
    for m in re.finditer(r"^\('([^']+)','((?:[^']|'')*)',ARRAY\[([^\]]*)\]", text, re.M):
        ids.add(m.group(1))
        names.add(m.group(2).replace("''", "'").lower())
        for a in re.findall(r"'((?:[^']|'')*)'", m.group(3)):
            names.add(a.replace("''", "'").lower())
    return ids, names


MICRO_KEYS = {
    "potassium_mg": "potassium_mg", "calcium_mg": "calcium_mg", "iron_mg": "iron_mg",
    "magnesium_mg": "magnesium_mg", "phosphorus_mg": "phosphorus_mg", "zinc_mg": "zinc_mg",
    "vitamin_c_mg": "vit_c_mg", "vitamin_a_rae": "vit_a_ug", "vitamin_d_ug": "vit_d_ug",
    "vitamin_b6_mg": "vit_b6_mg", "vitamin_b12_ug": "vit_b12_ug", "folate_ug": "folate_ug",
    "cholesterol_mg": "cholesterol_mg", "sat_fat_g": "sat_fat_g",
}


def main():
    rows = json.load(open(os.path.join(HERE, "dishes.computed.json"), encoding="utf-8"))
    ids, names = existing_catalog()
    lines, skipped, collided, stolen = [], [], [], []
    for d in sorted(rows, key=lambda x: x["n"]):
        if not d["seedable"]:
            skipped.append("%s (%d recipes, gram %.0f%%, cnf %.0f%%)"
                           % (d["name"], d["recipes"], 100 * d["gram_coverage"],
                              100 * d["cnf_coverage"]))
            continue
        fid = slug(d["name"])
        # A dish is skipped only when the catalog already holds THAT DISH -- its own name is
        # an existing row's name or alias. An overlap on a generic gloss is a different
        # problem: "rice cake" is already Quaker Crispy Minis, so bibingka must not claim it,
        # but bibingka itself is new and belongs in the catalog. Steal no aliases, skip no
        # dishes that are actually missing.
        if fid in ids or d["name"].lower() in names:
            collided.append("%s (already in the catalog)" % d["name"])
            continue
        als = aliases(d["name"])
        # `names` grows as rows are emitted, so this catches collisions with 0002 AND with
        # dishes already seeded in this same run -- two Filipino dishes can share an English
        # gloss as easily as one can share it with a snack.
        taken = [a for a in als if a in names]
        if taken:
            als = [a for a in als if a not in names]
            stolen.append("%s: dropped %s" % (d["name"], ", ".join(taken)))
        names.update(als)
        names.add(d["name"].lower())
        ids.add(fid)
        p = d["per_serving"]
        micros = {dst: round(p[src], 2) for src, dst in MICRO_KEYS.items() if p.get(src)}
        lines.append(
            "(%s,%s,%s,'per_unit',%s,null,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,false,'seed')" % (
                sql_str(fid), sql_str(d["name"]), sql_array(als),
                sql_str(unit_for(d["name"], d.get("section", ""))), num(p.get("kcal"), "0"), num(p.get("protein_g"), "0"),
                num(p.get("fat_g"), "0"), num(p.get("carb_g"), "0"), num(p.get("fiber_g"), "0"),
                num(p.get("sugar_g")), num(p.get("sodium_mg")),
                sql_str(json.dumps(micros, sort_keys=True))))

    header = """-- Seed: Filipino dishes (S34), generated by tools/philippine-catalog.
-- Regenerate rather than hand-edit: `python seed.py` in that directory. A wrong number here
-- is a bug upstream in the ingredient mapping or the gram conversion, not in this file.
--
-- How these numbers were made
--   Ingredient lists come from schema.org Recipe JSON-LD published by three Filipino recipe
--   sites. Quantities are converted to grams using each food's own conversion factors from
--   the Canadian Nutrient File. A dish is the prevalence-weighted median of its recipes'
--   ingredient proportions -- how much of an ingredient when it is used, times how often it
--   is used -- costed against CNF and divided by the stated servings.
--
--   Nutrients are conserved by cooking and water is not, so per-serving macros need no
--   cooked weight and none is invented.
--
-- Why `grams_per_unit` is null on every row
--   Because the cooked weight of these dishes is genuinely unknown. A recipe states its
--   servings but never their weight, and what a dish weighs after cooking depends on how
--   much water it lost or gained. Earlier drafts shipped a raw pre-cooking mass in this
--   field; the app divides user-entered grams BY it (src/lib/food.ts qtyFromMeasure), so a
--   400 g bowl of champorado logged as 3.7 servings. A number that wrong is worse than no
--   number, and `canMeasure()` already handles the honest case: with a null weight it drops
--   the grams input and offers a count of units instead.
--
--   So the portion is informal and the unit is a word you can picture -- a bowl of sinigang,
--   a slice of bibingka, a piece of lumpia. This is S35's argument applied to a catalog row:
--   consistency beats accuracy, because a systematic logging error cancels out of an
--   adaptive TDEE while a noisy one does not. One bowl logged the same way every time is
--   worth more than a gram figure that is precise about the wrong thing.
--
-- Attribution: nutrient values derive from the Canadian Nutrient File, 2015, Health Canada,
-- used under the Open Government Licence - Canada.
--
-- Why every row is source='seed', verified=false
--   A computed median is not a label transcription. These must rank below anything the user
--   scans or types (S6), and they are a starting point that per-user corrections fork from --
--   there is no canonical adobo.
--
-- Known and accepted
--   * Marinade and braising liquid are counted in full, even the part left in the pan. Adobo
--     and paksiw are the worst cases; both read high.
--   * CNF is Canadian. Calamansi, cane vinegar, bagoong, kangkong and several Philippine cuts
--     have no CNF entry and use a documented substitute -- see tools/philippine-catalog/
--     mapping.tsv, where each substitution carries its reason.
--   * "Serves 4" is an author's judgement about appetite, not a measurement. The median makes
--     that judgement typical; it does not make it yours.
--
-- Coverage: Luzon and Visayas. **Mindanao is absent**, and by decision rather than oversight:
-- across ~4,000 harvested posts the corpus contains zero Moro dishes -- no piaparan, palapa,
-- tiyula itum, satti or rendang -- because Filipino recipe blogging is a Tagalog-language,
-- Luzon-centred activity. Those dishes need hand-building from other sources. Do not read
-- this catalog as national.

insert into public.foods
  (id,name,aliases,basis,unit,grams_per_unit,kcal,protein_g,fat_g,carb_g,fiber_g,sugar_g,sodium_mg,micros,verified,source)
values
"""
    body = ",\n".join(lines) + ";\n"
    if "--dry-run" not in sys.argv:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(header + body)
        print("wrote %s" % os.path.relpath(OUT, os.path.join(HERE, "..", "..")))
    print("%d rows" % len(lines))
    if collided:
        print("\nalready in the catalog, left alone (a median must not shadow a label): %s"
              % ", ".join(collided))
    if stolen:
        print("\naliases already claimed by another food, dropped rather than duplicated:")
        for t in stolen:
            print("   %s" % t)
    if skipped:
        print("\nnot seeded -- did not compute cleanly (%d):" % len(skipped))
        for s in skipped:
            print("   %s" % s)


if __name__ == "__main__":
    main()
