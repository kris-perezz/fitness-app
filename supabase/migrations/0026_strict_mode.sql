-- Strict mode (S75).
--
-- OFF FOR EVERY ACCOUNT, and turned on only by the user (tone decision 3). A
-- calm default is only a default if nothing nags you out of it, so the column
-- defaults false and nothing in the app suggests, prompts or upsells it.
--
-- ONE SWITCH FOR THE WHOLE APP, not one per metric (tone decision 1). Per-metric
-- tone is a preferences screen nobody finishes, and it makes "what does red mean
-- here" a question with six answers.
--
-- THE TONE OWNS NO DATA (S77). It is read at render time and written nowhere
-- else: no snapshot on an intake row, no derived "was this day a failure"
-- column. Turning it off restores calm everywhere, including for days logged
-- while it was on -- which is only true because this column is the whole of it.
alter table public.nutrition_settings
  add column if not exists strict_mode boolean not null default false;
