# Third-party data

## Canadian Nutrient File — Health Canada

Generic food composition values (`foods` rows with `source = 'cnf'`, ids prefixed
`cnf_`) come from the Canadian Nutrient File, published by Health Canada.

> Contains information licensed under the Open Government Licence – Canada.

Licence: <https://open.canada.ca/en/open-government-licence-canada>
Dataset: <https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109>
API: <https://food-nutrition.canada.ca/api/canadian-nutrient-file/>

The licence grants the right to use and redistribute this information, including
in this app's shared catalog, on condition that the source is acknowledged and
the licence linked where feasible. **The rights end automatically if the
attribution is dropped**, so the acknowledgement is rendered in the app wherever
CNF numbers are shown — see `CNF_ATTRIBUTION` in `src/lib/cnf.ts`, the food
picker's Health Canada section, and `sourceHint('cnf')`.

Health Canada does not endorse this application. Nothing here may be presented
as having official status.

## Open Food Facts

Barcode lookups (`source = 'off'`, ids prefixed `off_`) come from Open Food
Facts, whose product data is published under the Open Database License (ODbL).
Open Food Facts states that it offers no assurance the data is accurate or
complete, which is why these rows are stored `verified = false` and carry the
loudest badge in the app.

Database: <https://world.openfoodfacts.org/>
Licence: <https://opendatacommons.org/licenses/odbl/1-0/>
