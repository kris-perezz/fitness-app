-- Aliases for the 54 exercises that came in through the personal data import
-- rather than through 0010, and so have none at all (S28).
--
-- The seeded 46 already carry 92 between them -- ohp, rdl, bss, pushdown --
-- because searchNamed() in src/lib/search.ts matches name AND aliases, and a
-- catalog that only answers to its own formal names is one you have to
-- memorise. The import set name, muscle group, equipment and load_is_per_side
-- and nothing else, which is why half the catalog has been literal to search.
--
-- COLLISIONS ARE DELIBERATE. Several terms below already belong to a seeded
-- lift: pushdown to Triceps Pushdown, lunge to Walking Lunge, bss to Bulgarian
-- Split Squat, chest fly to Cable Fly, rdl to Romanian Deadlift. Nothing breaks
-- -- searchNamed scores exact above prefix above substring and breaks ties
-- alphabetically, so a shared term simply returns both lifts. Two results you
-- choose between beat one result that silently hid the other.
--
-- Appended, never assigned, and each term added only if absent: aliases is a
-- list, so a migration that overwrites it is one nobody can safely add to
-- later, and re-running this must be a no-op.
--
-- No exception if a row is missing, unlike 0013. These ids are in NO migration
-- -- they exist only where the personal import has been run -- so a fresh
-- database legitimately has none of them and must not fail here. The notice at
-- the end says how many actually matched.

create temporary table alias_import (id text, aliases text[]) on commit drop;

insert into alias_import values
  ('barbell_lunge',array['barbell lunges','bb lunge','lunge','lunges']),
  ('barbell_shrug',array['shrug','shrugs','bb shrug']),
  ('bulgarian_split_squat_barbell',array['barbell bss','barbell split squat','rfess','bss','split squat']),
  ('cable_hammer_curl',array['rope curl','rope hammer curl']),
  ('cable_tricep_kickback',array['kickback','tricep kickback']),
  ('cable_upright_row',array['cable high pull']),
  ('chest_press_cable_single_stack',array['cable chest press']),
  ('chest_press_plate_per_arm',array['hammer strength chest press','plate loaded chest press','iso lateral chest press']),
  ('close_grip_ez_bar_curl',array['close grip curl','narrow grip curl']),
  ('close_grip_lat_pulldown',array['close grip pulldown','v bar pulldown','v handle pulldown']),
  ('crunches',array['crunch','ab crunch']),
  ('dumbbell_fly',array['db fly','dumbbell flye','flyes','chest fly']),
  ('dumbbell_front_raise',array['front raise','db front raise']),
  ('dumbbell_reverse_curl',array['reverse curl','pronated curl']),
  ('dumbbell_reverse_fly',array['bent over fly','rear delt raise','db rear delt fly','rear delt fly']),
  ('dumbbell_romanian_deadlift',array['db rdl','dumbbell rdl','rdl']),
  ('ez_bar_curl',array['ez curl','ez bar bicep curl']),
  ('ez_bar_reverse_curl',array['reverse ez curl','ez reverse curl']),
  ('ez_bar_upright_row',array['ez upright row']),
  ('floor_press',array['barbell floor press']),
  ('good_morning',array['good mornings','gm']),
  ('hex_bar_shrug',array['trap bar shrug']),
  ('hip_adduction',array['adductor machine','inner thigh machine','adduction']),
  ('incline_hammer_press',array['hammer strength incline press','incline machine press']),
  ('low_to_high_cable_fly',array['low to high fly','low cable fly','incline cable fly']),
  -- Skullcrusher is what almost everyone says; the formal name is what almost
  -- nobody types.
  ('lying_tricep_extension',array['skullcrusher','skull crusher','french press','lying triceps extension']),
  ('machine_bicep_curl',array['machine curl']),
  -- Verified rather than recalled: a machine fly IS the pec deck.
  ('machine_chest_fly',array['pec deck','pec dec','butterfly','machine fly','chest fly']),
  ('machine_reverse_fly',array['reverse pec deck','rear delt machine']),
  ('machine_row',array['hammer strength row','iso row','seated machine row']),
  ('machine_seated_crunch',array['ab machine','machine crunch']),
  ('machine_shoulder_press',array['shoulder press machine','machine ohp']),
  -- Not a synonym but a VARIATION: a Bayesian curl is the face-away one-arm
  -- cable curl, which is the whole point of it. Kept as an alias because this
  -- is the closest row the catalog has. If it earns its own row, move it.
  ('one_arm_cable_bicep_curl',array['bayesian curl','face away cable curl','behind the back cable curl','single arm cable curl']),
  ('one_arm_cable_reverse_fly',array['single arm reverse fly','cable rear delt fly']),
  ('one_arm_cable_tricep_extension',array['single arm tricep extension','cable tricep extension']),
  ('one_arm_lat_pulldown',array['single arm pulldown','unilateral pulldown']),
  ('pendulum_squat',array['pendulum']),
  ('push_press',array['overhead push press']),
  ('reverse_grip_lat_pulldown',array['underhand pulldown','supinated pulldown','reverse grip pulldown']),
  ('reverse_grip_tricep_pushdown',array['underhand pushdown','supinated pushdown','pushdown']),
  -- Verified: also the lat sweep, or the cable pullover.
  ('rope_straight_arm_pulldown',array['straight arm pulldown','lat sweep','cable pullover','lat prayer']),
  ('seated_dip_machine',array['dip machine','machine dip']),
  ('seated_dumbbell_curl',array['seated db curl']),
  ('seated_dumbbell_lateral_raise',array['seated lateral raise','seated side raise']),
  ('seated_dumbbell_shoulder_press',array['seated db press','seated ohp','seated shoulder press']),
  ('sled_leg_press',array['45 degree leg press','plate loaded leg press']),
  ('smith_machine_incline_bench_press',array['smith incline','smith machine incline']),
  ('snatch_grip_barbell_shrug',array['wide grip shrug','snatch grip shrug']),
  ('standing_leg_curl',array['standing hamstring curl']),
  -- Verified: the T-bar row is the landmine row. Still a DIFFERENT exercise
  -- from the chest-supported row, and nothing here maps one to the other.
  ('t_bar_row',array['landmine row','tbar row']),
  ('tricep_rope_pushdown',array['rope pushdown','rope tricep extension','pushdown']),
  ('upright_row',array['barbell upright row','bb upright row']),
  ('wide_grip_seated_cable_row',array['wide grip row','wide cable row']),
  ('wrist_curl',array['wrist curls','forearm curl']);

-- A skullcrusher is a LYING triceps extension -- elbows over the face, the
-- humerus roughly vertical -- and 0010 hung that alias on the OVERHEAD
-- extension, where the arm is behind the head and the long head is loaded in a
-- different position entirely. Two exercises, one name, and the wrong one owned
-- it. It went unnoticed because the lying version was not in the catalog until
-- the personal import brought it in; this file is what gives that name to the
-- movement it belongs to, so the mistake has to go at the same moment.
--
-- Fixed forward rather than by editing 0010. That migration has already run
-- everywhere it is going to run, so changing it would correct nothing in any
-- existing database while quietly disagreeing with what those databases were
-- actually built from. A fresh database applies 0010 then this, and lands in
-- the same place.
update public.exercises
   set aliases = array_remove(aliases, 'skull crusher')
 where id = 'overhead_triceps_ext';

-- Only terms not already there, so this is idempotent and an alias added by
-- hand in between survives.
update public.exercises e
   set aliases = e.aliases || (
         select coalesce(array_agg(a), '{}')
           from unnest(i.aliases) as a
          where not (e.aliases @> array[a])
       )
  from alias_import i
 where e.id = i.id;

do $$
declare matched integer;
begin
  select count(*) into matched
    from public.exercises e join alias_import i on i.id = e.id;
  raise notice 'aliases applied to % of % imported exercises', matched,
               (select count(*) from alias_import);
end $$;
