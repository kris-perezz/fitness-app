# Fitness app

A phone-first application for logging food intake and resistance training,
developed for personal use and deployed on Vercel.

## Purpose

Most nutrition trackers present a search field over a crowdsourced database and
grade the user at the end of each day. This application proceeds from three
different premises.

**Logging must be faster than recall.** A barcode, a photographed nutrition
label, or a repeat of a frequently eaten item should require no typing.

**An entry retains the values it was logged with.** Energy and macronutrient
figures are copied onto the entry at the time of logging. A subsequent
correction to a catalogue item therefore cannot alter a record made last month.

**A logged day is an observation, not a judgement.** Exceeding a calorie target
produces no warning colour. Red is reserved for destructive actions and for the
single genuine health limit the application enforces.

## Features

### Food logging

- **Barcode scanning.** A camera scan is resolved against Open Food Facts, and
  the product is added to the catalogue on first use.
- **Nutrition label capture.** A photograph of a nutrition panel is read into a
  prefilled confirmation form, vitamins and minerals included, which is reviewed
  before anything is saved.
- **Ranked search** over the catalogue, ordered so that frequently logged items
  appear first.
- **Recipes.** A dish is composed from its ingredients, divided into servings,
  and reconciled against its measured cooked weight.
- **Waking-day attribution.** Entries recorded before 04:00 are filed under the
  previous date, so a late meal is counted on the day it was eaten.

### Nutrition data

- **Canadian Nutrient File (CNF).** Laboratory composition data published by
  Health Canada, used for whole foods that carry no barcode.
- **Open Food Facts**, used for packaged goods.
- **Micronutrients.** Eighteen vitamins and minerals are recorded per entry and
  summed across the day. An unrecorded value remains absent rather than zero, so
  a day's total reflects only the foods for which the figure was known.

### Training

- **Session logging** by exercise, set, load, and repetitions, with per-side
  loading handled for dumbbells and plate-loaded machines.
- **Exercise catalogue** with aliases, so that common informal names resolve to
  the correct movement.
- **Muscle-group volume**, summarized per session.
- **Estimated one-repetition maximum**, charted per exercise over time, with a
  single lift pinned to the progress view.

### Progress

- **Body weight** presented as a smoothed trend rather than the daily reading.
- **Observed energy balance.** Mean intake for a week is presented beside the
  change in trend weight over the same week. Weeks containing too few logged
  days are excluded, and the exclusion is stated. Nothing is inferred, and the
  arithmetic remains visible.
- **Trends.** A rolling 30-day view of energy and protein intake, together with
  the foods accounting for the most calories over that window.

### Presentation

- **Calm presentation by default.** Macronutrients are shown as plain figures,
  and the energy ring reports what was consumed rather than counting down toward
  a target.
- **Strict mode**, disabled unless the user enables it, restores targets and
  marks overshoots in red. It changes how figures are displayed and never what
  is recorded.
- **Colour is never the sole carrier of meaning.** An overshoot is also stated
  in words, so the interface remains legible in greyscale, under colour vision
  deficiency, and through a screen reader.

## Implementation

Next.js and React on the client, Supabase and PostgreSQL for storage, and
Tailwind CSS with shadcn/ui for the interface.
