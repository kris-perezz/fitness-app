-- A goal weight and a goal rate (S60).
--
-- On `nutrition_settings` rather than in a table of their own, because that is
-- already the app's phase.json: the row of PRESCRIBED values, never measured
-- ones. A goal rate belongs beside the calorie target that is supposed to
-- produce it, and nowhere near `weigh_ins`, which holds what actually happened.
-- One screen holds what you decided, the other holds what happened (S60).
--
-- Both nullable, and the nullability is load-bearing in two directions:
--
--   * No goal is a legitimate state. Most of the app's life is spent without
--     one, and a default would be the app asserting a target nobody set.
--   * "Maintain" is a goal rate of 0, NOT an absent one. Collapsing those would
--     make someone deliberately holding their weight indistinguishable from
--     someone who never answered, which is exactly the distinction 0009 made
--     for `rir` and for the same reason.
--
-- No check constraint on the rate's sign: a gaining phase is a positive rate, a
-- cut is a negative one, and both are ordinary. The weight is checked positive
-- on the same grounds as `weigh_ins.weight_lb` -- zero is a mistyped entry
-- every time.
alter table public.nutrition_settings
  add column if not exists goal_weight_lb        numeric check (goal_weight_lb > 0),
  add column if not exists goal_rate_lb_per_week numeric;
