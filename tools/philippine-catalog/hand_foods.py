#!/usr/bin/env python3
"""Foods CNF does not carry, entered by hand.

Only for ingredients where every CNF substitute is wrong in a way that changes the dish's
character rather than nudging it. The bar is deliberately high: a hand row is a number with
no laboratory behind it, and the whole point of costing against CNF is not doing this.

**Every value below was read off a published nutrition panel and the URL is in the row.**
An earlier version of this file carried invented numbers under a citation naming real brands
that had never been looked at -- which reads as verified and is not. If you add a row here
and cannot paste a link, the row does not go in.

Bagoong is the case that forced the file. CNF has no shrimp paste, fish paste, anchovy paste
or krill row at all (verified: five searches, zero hits). The nearest substitute used before
this was anchovy at 104 mg sodium per 100 g, which made binagoongan -- pork cooked in shrimp
paste -- read as a 123 mg low-sodium dish.

Ids are prefixed `hand_` so they never collide with a CNF FoodID, and they stay visible as
hand-entered anywhere the pipeline prints a food.
"""

# id -> (description, per-100 g nutrients, source)
HAND_FOODS = {
    "hand_bagoong": (
        "Ginisang bagoong (sauteed shrimp paste), jarred -- hand-entered",
        {"kcal": 467.0, "protein_g": 13.3, "fat_g": 33.3, "carb_g": 13.3, "fiber_g": 0.0,
         "sugar_g": 6.7, "sodium_mg": 3600.0},
        "KAMAYAN Ginisang Bagoong label, per 15 g tbsp, scaled to 100 g: "
        "https://www.nutritionvalue.org/Ginisang_bagoong_sauteed_shrimp_paste_by_KAMAYAN_"
        "391912_nutritional_value.html . This is the SAUTEED jarred product, which is what "
        "binagoongan and pinakbet recipes call for -- it carries the oil it was fried in, "
        "hence 33 g fat. Plain unsauteed alamang is leaner and saltier (secondary sources "
        "put it near 5,300-5,800 mg sodium), but the listings for it disagree with each "
        "other and one claims 0 mg sodium for salted shrimp, which cannot be true. When a "
        "recipe clearly means plain alamang this row overstates fat and understates salt.",
    ),
}

# Deliberately NOT here: patis. CNF 4731 "Sauce, fish, ready-to-serve" is a real match --
# verified 35 kcal, 5.1 g protein, 7,851 mg sodium per 100 g -- so patis maps to CNF like
# everything else. An earlier draft duplicated it here "so it sits beside bagoong", which is
# filing, not evidence, and it put a hand row in front of a laboratory one.


def inject(foods, amounts, nutrient_ids):
    """Add the hand rows to the loaded CNF tables, keyed the same way CNF is.

    `nutrient_ids` is cnf.NUTRIENTS inverted (label -> id) so the hand rows land in the same
    id-keyed shape as everything else and nothing downstream needs to know they are special.
    """
    for fid, (desc, per100, _source) in HAND_FOODS.items():
        foods[fid] = desc
        amounts[fid] = {nutrient_ids[label]: value
                        for label, value in per100.items() if label in nutrient_ids}
    return foods, amounts
