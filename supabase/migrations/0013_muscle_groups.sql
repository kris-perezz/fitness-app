-- Primary and secondary muscles per exercise (S32).
--
-- Volume counts a working set 1.0 for each PRIMARY muscle and 0.5 for each
-- SECONDARY one. That 0.5 is not a convention picked for tidiness: Pelland et
-- al. (67 studies, 2,058 participants) compared counting indirect sets at 0,
-- 0.5 and 1.0 against the same datasets, and the 0.5 method had the strongest
-- relative evidence across outcomes. Their definitions map exactly onto these
-- two columns -- a direct set is one where the muscle was likely the primary
-- force generator, an indirect set one where it contributed meaningfully to
-- force production without being primary.
--
-- PRIMARY IS A LIST, not one muscle. A set can be direct for two muscles, and
-- forcing a single winner is what makes a dip either a chest exercise with no
-- triceps or the reverse. The discipline that keeps the list honest: a muscle
-- is primary only if you would program the exercise TO TRAIN IT.
--
-- Stabilisers are excluded entirely. Erectors on a squat, abs on a deadlift and
-- forearms on a row are holding position, not producing the force -- and
-- counting them would make Core and Forearms look permanently trained. Forearms
-- appear only where grip genuinely limits (deadlift, shrugs, pull-ups) or as
-- the elbow-flexor synergist on curls.
--
-- The vocabulary splits Back into Lats / Upper back / Lower back, because one
-- Back group let a month of nothing but pulldowns read as a fully trained back
-- while rhomboids and erectors got nothing. Adductors is new because Hip
-- Adduction could not otherwise be classified at all.

alter table public.exercises
  add column if not exists primary_muscles   text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}';

-- The log denormalises these the way it already denormalises name and
-- muscle_group: reclassifying an exercise must never rewrite what past sessions
-- say it trained (S32, the same rule as S7 and S19).
alter table public.workout_exercises
  add column if not exists primary_muscles   text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}';

update public.exercises as e set
       primary_muscles = v.p, secondary_muscles = v.s
  from (values
    ('back_squat',ARRAY['Quads']::text[],ARRAY['Glutes']::text[]),
    ('barbell_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('barbell_lunge',ARRAY['Quads','Glutes']::text[],ARRAY['Hamstrings']::text[]),
    ('barbell_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('barbell_shrug',ARRAY['Traps']::text[],ARRAY['Forearms']::text[]),
    ('bench_press',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('bulgarian_split_squat',ARRAY['Quads','Glutes']::text[],ARRAY['Hamstrings']::text[]),
    ('bulgarian_split_squat_barbell',ARRAY['Quads','Glutes']::text[],ARRAY['Hamstrings']::text[]),
    ('cable_crunch',ARRAY['Core']::text[],'{}'::text[]),
    ('cable_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('cable_fly',ARRAY['Chest']::text[],ARRAY['Shoulders']::text[]),
    ('cable_hammer_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('cable_lateral_raise',ARRAY['Shoulders']::text[],'{}'::text[]),
    ('cable_tricep_kickback',ARRAY['Triceps']::text[],'{}'::text[]),
    ('cable_upright_row',ARRAY['Shoulders']::text[],ARRAY['Traps','Biceps']::text[]),
    ('chest_press_cable_single_stack',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('chest_press_machine',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('chest_press_plate_per_arm',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('chest_supported_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('close_grip_bench',ARRAY['Triceps']::text[],ARRAY['Chest','Shoulders']::text[]),
    ('close_grip_ez_bar_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('close_grip_lat_pulldown',ARRAY['Lats']::text[],ARRAY['Biceps','Upper back']::text[]),
    ('crunches',ARRAY['Core']::text[],'{}'::text[]),
    ('db_bench_press',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('db_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('db_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('db_shoulder_press',ARRAY['Shoulders']::text[],ARRAY['Triceps']::text[]),
    ('deadlift',ARRAY['Glutes','Hamstrings']::text[],ARRAY['Lower back','Traps','Quads']::text[]),
    ('dip',ARRAY['Chest','Triceps']::text[],ARRAY['Shoulders']::text[]),
    ('dumbbell_fly',ARRAY['Chest']::text[],ARRAY['Shoulders']::text[]),
    ('dumbbell_front_raise',ARRAY['Shoulders']::text[],'{}'::text[]),
    ('dumbbell_reverse_curl',ARRAY['Forearms']::text[],ARRAY['Biceps']::text[]),
    ('dumbbell_reverse_fly',ARRAY['Rear delts']::text[],ARRAY['Upper back','Traps']::text[]),
    ('dumbbell_romanian_deadlift',ARRAY['Hamstrings']::text[],ARRAY['Glutes','Lower back']::text[]),
    ('ez_bar_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('ez_bar_reverse_curl',ARRAY['Forearms']::text[],ARRAY['Biceps']::text[]),
    ('ez_bar_upright_row',ARRAY['Shoulders']::text[],ARRAY['Traps','Biceps']::text[]),
    ('face_pull',ARRAY['Rear delts']::text[],ARRAY['Upper back','Traps']::text[]),
    ('floor_press',ARRAY['Triceps']::text[],ARRAY['Chest','Shoulders']::text[]),
    ('front_squat',ARRAY['Quads']::text[],ARRAY['Glutes']::text[]),
    ('good_morning',ARRAY['Hamstrings']::text[],ARRAY['Glutes','Lower back']::text[]),
    ('hack_squat',ARRAY['Quads']::text[],ARRAY['Glutes']::text[]),
    ('hammer_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('hanging_leg_raise',ARRAY['Core']::text[],'{}'::text[]),
    ('hex_bar_shrug',ARRAY['Traps']::text[],ARRAY['Forearms']::text[]),
    ('hip_adduction',ARRAY['Adductors']::text[],'{}'::text[]),
    ('hip_thrust',ARRAY['Glutes']::text[],ARRAY['Hamstrings']::text[]),
    ('incline_bench_press',ARRAY['Chest']::text[],ARRAY['Shoulders','Triceps']::text[]),
    ('incline_db_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('incline_db_press',ARRAY['Chest']::text[],ARRAY['Shoulders','Triceps']::text[]),
    ('incline_hammer_press',ARRAY['Chest']::text[],ARRAY['Shoulders','Triceps']::text[]),
    ('lat_pulldown',ARRAY['Lats']::text[],ARRAY['Biceps','Upper back']::text[]),
    ('lateral_raise',ARRAY['Shoulders']::text[],'{}'::text[]),
    ('leg_extension',ARRAY['Quads']::text[],'{}'::text[]),
    ('leg_press',ARRAY['Quads']::text[],ARRAY['Glutes','Hamstrings']::text[]),
    ('low_to_high_cable_fly',ARRAY['Chest']::text[],ARRAY['Shoulders']::text[]),
    ('lying_leg_curl',ARRAY['Hamstrings']::text[],ARRAY['Calves']::text[]),
    ('lying_tricep_extension',ARRAY['Triceps']::text[],'{}'::text[]),
    ('machine_bicep_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('machine_chest_fly',ARRAY['Chest']::text[],ARRAY['Shoulders']::text[]),
    ('machine_reverse_fly',ARRAY['Rear delts']::text[],ARRAY['Upper back','Traps']::text[]),
    ('machine_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('machine_seated_crunch',ARRAY['Core']::text[],'{}'::text[]),
    ('machine_shoulder_press',ARRAY['Shoulders']::text[],ARRAY['Triceps']::text[]),
    ('one_arm_cable_bicep_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('one_arm_cable_reverse_fly',ARRAY['Rear delts']::text[],ARRAY['Upper back','Traps']::text[]),
    ('one_arm_cable_tricep_extension',ARRAY['Triceps']::text[],'{}'::text[]),
    ('one_arm_lat_pulldown',ARRAY['Lats']::text[],ARRAY['Biceps','Upper back']::text[]),
    ('overhead_press',ARRAY['Shoulders']::text[],ARRAY['Triceps']::text[]),
    ('overhead_triceps_ext',ARRAY['Triceps']::text[],'{}'::text[]),
    ('pendulum_squat',ARRAY['Quads']::text[],ARRAY['Glutes']::text[]),
    ('plank',ARRAY['Core']::text[],'{}'::text[]),
    ('preacher_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('pull_up',ARRAY['Lats']::text[],ARRAY['Biceps','Upper back','Forearms']::text[]),
    ('push_press',ARRAY['Shoulders']::text[],ARRAY['Triceps','Quads','Glutes']::text[]),
    ('push_up',ARRAY['Chest']::text[],ARRAY['Triceps','Shoulders']::text[]),
    ('rear_delt_fly',ARRAY['Rear delts']::text[],ARRAY['Upper back','Traps']::text[]),
    ('reverse_grip_lat_pulldown',ARRAY['Lats']::text[],ARRAY['Biceps','Upper back']::text[]),
    ('reverse_grip_tricep_pushdown',ARRAY['Triceps']::text[],'{}'::text[]),
    ('romanian_deadlift',ARRAY['Hamstrings']::text[],ARRAY['Glutes','Lower back']::text[]),
    ('rope_straight_arm_pulldown',ARRAY['Lats']::text[],ARRAY['Rear delts']::text[]),
    ('seated_cable_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('seated_calf_raise',ARRAY['Calves']::text[],'{}'::text[]),
    ('seated_dip_machine',ARRAY['Chest','Triceps']::text[],ARRAY['Shoulders']::text[]),
    ('seated_dumbbell_curl',ARRAY['Biceps']::text[],ARRAY['Forearms']::text[]),
    ('seated_dumbbell_lateral_raise',ARRAY['Shoulders']::text[],'{}'::text[]),
    ('seated_dumbbell_shoulder_press',ARRAY['Shoulders']::text[],ARRAY['Triceps']::text[]),
    ('seated_leg_curl',ARRAY['Hamstrings']::text[],ARRAY['Calves']::text[]),
    ('sled_leg_press',ARRAY['Quads']::text[],ARRAY['Glutes','Hamstrings']::text[]),
    ('smith_machine_incline_bench_press',ARRAY['Chest']::text[],ARRAY['Shoulders','Triceps']::text[]),
    ('snatch_grip_barbell_shrug',ARRAY['Traps']::text[],ARRAY['Rear delts','Forearms']::text[]),
    ('standing_calf_raise',ARRAY['Calves']::text[],'{}'::text[]),
    ('standing_leg_curl',ARRAY['Hamstrings']::text[],ARRAY['Calves']::text[]),
    ('t_bar_row',ARRAY['Lats','Upper back']::text[],ARRAY['Biceps','Rear delts']::text[]),
    ('tricep_rope_pushdown',ARRAY['Triceps']::text[],'{}'::text[]),
    ('triceps_pushdown',ARRAY['Triceps']::text[],'{}'::text[]),
    ('upright_row',ARRAY['Shoulders']::text[],ARRAY['Traps','Biceps']::text[]),
    ('walking_lunge',ARRAY['Quads','Glutes']::text[],ARRAY['Hamstrings']::text[]),
    -- The one row that is not dual-primary: a wide grip and a high elbow path
    -- make this upper-back work with the lats assisting, which is the whole
    -- reason to program it next to a normal row rather than instead of one.
    ('wide_grip_seated_cable_row',ARRAY['Upper back']::text[],ARRAY['Lats','Rear delts','Biceps']::text[]),
    ('wrist_curl',ARRAY['Forearms']::text[],'{}'::text[])
  ) as v(id, p, s)
 where e.id = v.id;

-- Anything left unclassified is a bug, not a default: a set that counts toward
-- nothing is invisible in every volume figure without ever looking wrong. This
-- runs BEFORE the backfill so the failure names the catalog gap rather than
-- arriving after the log has been written from it.
do $$
declare n integer;
begin
  select count(*) into n from public.exercises where cardinality(primary_muscles) = 0;
  if n > 0 then
    raise exception '% exercise(s) have no primary muscle -- classify them before this migration runs', n;
  end if;
end $$;

-- Backfill the log from the catalog. This is the ONE moment the two are allowed
-- to be synchronised: from here on the log keeps whatever it was logged with.
update public.workout_exercises we
   set primary_muscles = e.primary_muscles,
       secondary_muscles = e.secondary_muscles
  from public.exercises e
 where e.id = we.exercise_id;

-- And the same for the log itself. workout_exercises.exercise_id is `not null
-- references exercises(id)`, so every historical row -- the seeded history
-- included -- has a catalog row to inherit from and none can be missed. This
-- asserts that rather than assuming it.
do $$
declare n integer;
begin
  select count(*) into n
    from public.workout_exercises where cardinality(primary_muscles) = 0;
  if n > 0 then
    raise exception '% logged exercise(s) were not backfilled', n;
  end if;
end $$;

-- ------------------------------------------------------------- vocabulary
-- Nothing above stops 'lats' or 'Lats ' from being written, and a typo does not
-- fail -- it invents a seventeenth muscle that shows up in the volume view with
-- one exercise in it. The same reasoning as the guard: a wrong classification
-- must be loud. `<@` also rejects nothing when the array is empty, so the
-- cardinality check is what makes an unclassified exercise impossible rather
-- than merely absent.
--
-- Kept in step with MUSCLE_GROUPS in src/lib/training.ts by hand. There is no
-- mechanism that enforces that, which is the price of the list living in two
-- languages.
alter table public.exercises
  add constraint exercises_muscles_known check (
    primary_muscles   <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Shoulders','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and secondary_muscles <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Shoulders','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and cardinality(primary_muscles) > 0
  );

-- The same on the log. Added after the backfill, so it validates the history it
-- has just been given: an existing row that could not be classified would fail
-- here rather than sit quietly at zero volume.
alter table public.workout_exercises
  add constraint workout_exercises_muscles_known check (
    primary_muscles   <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Shoulders','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and secondary_muscles <@ ARRAY['Chest','Lats','Upper back','Lower back','Traps','Shoulders','Rear delts','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Adductors','Calves','Core']::text[]
    and cardinality(primary_muscles) > 0
  );
