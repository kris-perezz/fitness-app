-- Shoulders becomes Front delts + Side delts. Rear delts already existed.
--
-- 0013 split Back into Lats / Upper back / Lower back and wrote a paragraph on
-- why one lump was wrong: it let a month of nothing but pulldowns read as a
-- fully trained back. It then left Shoulders exactly as the original seed had
-- it -- one "Shoulders" group beside a separate "Rear delts" -- which is the
-- same mistake, unexamined because it was inherited rather than written.
--
-- Half-split is worse than unsplit. Chest, Triceps and Calves are each one
-- group here and could all be argued apart; leaving them whole is a defensible
-- simplification. Splitting ONE head of three out and lumping the other two is
-- not: it claims precision about rear delts while making front and side delts
-- uncountable, and a month of pressing reads as fully trained shoulders while
-- side delts get nothing.
--
-- The three heads are trained by genuinely different movements, which is the
-- test that matters:
--   front -- pressing. Gets enormous indirect volume from every bench, dip and
--            fly, which is exactly why it is the head nobody needs to program
--            directly, and you cannot see that until it is countable.
--   side  -- lateral raises and upright rows. Almost no indirect volume.
--   rear  -- face pulls and reverse flies. Almost no indirect volume.
--
-- Sixteen groups become seventeen: Shoulders leaves, two arrive.

-- The constraints pin the vocabulary, so they have to go before it changes.
alter table public.exercises           drop constraint exercises_muscles_known;
alter table public.workout_exercises   drop constraint workout_exercises_muscles_known;

-- ------------------------------------------------------------- the catalog
-- Side delts first, by name, because they are the specific case. Everything
-- still saying Shoulders afterwards is a press, a dip or a fly, and those are
-- all front delt -- so the second statement is a blanket sweep rather than a
-- second list to keep in step with this one.
update public.exercises
   set primary_muscles = array_replace(primary_muscles, 'Shoulders', 'Side delts')
 where id in ('lateral_raise','cable_lateral_raise','seated_dumbbell_lateral_raise',
              'upright_row','cable_upright_row','ez_bar_upright_row');

update public.exercises
   set primary_muscles   = array_replace(primary_muscles,   'Shoulders', 'Front delts'),
       secondary_muscles = array_replace(secondary_muscles, 'Shoulders', 'Front delts')
 where 'Shoulders' = any (primary_muscles)
    or 'Shoulders' = any (secondary_muscles);

-- A vertical press is not front-delt-only: the lateral head assists through the
-- overhead portion, which is why pressing keeps side delts ticking over while
-- never being enough on its own. Half a set each, the same 0.5 every other
-- meaningful-but-not-primary contribution gets.
--
-- NOT the front raise: that one is front delts and nothing else, which is the
-- whole reason it is a different exercise from a press.
update public.exercises
   set secondary_muscles = secondary_muscles || array['Side delts']
 where id in ('overhead_press','push_press','db_shoulder_press',
              'machine_shoulder_press','seated_dumbbell_shoulder_press')
   and not (secondary_muscles @> array['Side delts']);

-- ----------------------------------------------------------------- the log
-- Every set already logged, rewritten the same way.
--
-- Without this the sets are not merely mislabelled, they VANISH: the chart maps
-- the fixed group list onto whatever the log says, so a row still reading
-- "Shoulders" matches nothing and is silently dropped. Months of pressing would
-- disappear with no error anywhere.
--
-- This is the second time the log has been rewritten, after 0013's backfill,
-- and that migration called itself "the ONE moment they are allowed to be
-- synchronised". That was aspirational, so here is the rule it should have
-- stated: reclassifying an EXERCISE never touches the log -- decide a dip is
-- really a triceps movement and March keeps saying what March said -- but
-- refining the VOCABULARY ITSELF is a migration, because the alternative is a
-- history written in words the app no longer knows.
update public.workout_exercises
   set primary_muscles = array_replace(primary_muscles, 'Shoulders', 'Side delts')
 where exercise_id in ('lateral_raise','cable_lateral_raise','seated_dumbbell_lateral_raise',
                       'upright_row','cable_upright_row','ez_bar_upright_row');

update public.workout_exercises
   set primary_muscles   = array_replace(primary_muscles,   'Shoulders', 'Front delts'),
       secondary_muscles = array_replace(secondary_muscles, 'Shoulders', 'Front delts')
 where 'Shoulders' = any (primary_muscles)
    or 'Shoulders' = any (secondary_muscles);

-- Deliberately NOT backfilling the side-delt secondary onto logged sets. A set
-- from last year trained what it trained; adding a contribution nobody counted
-- at the time would inflate a past week to match a present opinion. The catalog
-- change applies from here on, which is what the freeze is for.

-- ------------------------------------------------------------- vocabulary
-- Same shape as 0013's, with Shoulders replaced by the two heads. Kept in step
-- with MUSCLE_GROUPS in src/lib/training.ts by hand; nothing enforces that,
-- which is the price of the list living in two languages.
alter table public.exercises
  add constraint exercises_muscles_known check (
    primary_muscles   <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Front delts','Side delts','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and secondary_muscles <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Front delts','Side delts','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and cardinality(primary_muscles) > 0
  );

alter table public.workout_exercises
  add constraint workout_exercises_muscles_known check (
    primary_muscles   <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Front delts','Side delts','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and secondary_muscles <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Front delts','Side delts','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and cardinality(primary_muscles) > 0
  );

-- Adding the constraints would already have failed on a leftover, but the
-- error would name a constraint rather than the thing that is wrong.
do $$
declare n integer;
begin
  select count(*) into n from public.exercises
   where 'Shoulders' = any (primary_muscles) or 'Shoulders' = any (secondary_muscles);
  if n > 0 then raise exception '% catalog row(s) still say Shoulders', n; end if;

  select count(*) into n from public.workout_exercises
   where 'Shoulders' = any (primary_muscles) or 'Shoulders' = any (secondary_muscles);
  if n > 0 then raise exception '% logged row(s) still say Shoulders', n; end if;
end $$;
