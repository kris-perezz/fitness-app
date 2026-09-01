-- Seed: a starter exercise catalog, so the first session has something to log
-- against (S27). Roughly the movements a general hypertrophy programme uses,
-- with the aliases people actually type -- "ohp", "rdl", "bss", "pushdown".
--
-- `created_by` is null, exactly as the food seed in 0002 is. That marks these
-- as the app's own data rather than anyone's, and it is what the corrections
-- rule keys off: nobody owns them, so nobody silently edits them out from under
-- everyone else.
--
-- `bodyweight_fraction` is filled where the movement is genuinely bodyweight.
-- Nothing reads it yet (S29 is not built); it is here because getting the
-- number right is a research question and doing it once is cheaper than doing
-- it later per row.

insert into public.exercises
  (id, name, aliases, muscle_group, equipment, bodyweight_fraction)
values
('bench_press','Barbell bench press',ARRAY['bench','bench press','flat bench']::text[],'Chest','Barbell',null),
('db_bench_press','Dumbbell bench press',ARRAY['db bench','dumbbell bench']::text[],'Chest','Dumbbell',null),
('incline_bench_press','Incline barbell bench press',ARRAY['incline bench','incline press']::text[],'Chest','Barbell',null),
('incline_db_press','Incline dumbbell press',ARRAY['incline db press','incline dumbbell']::text[],'Chest','Dumbbell',null),
('chest_press_machine','Chest press machine',ARRAY['machine chest press']::text[],'Chest','Machine',null),
('cable_fly','Cable fly',ARRAY['cable flye','pec fly','chest fly']::text[],'Chest','Cable',null),
('push_up','Push-up',ARRAY['pushup','press-up']::text[],'Chest','Bodyweight',0.64),
('dip','Dip',ARRAY['dips','chest dip','tricep dip']::text[],'Chest','Bodyweight',1.0),
('deadlift','Barbell deadlift',ARRAY['deadlift','conventional deadlift']::text[],'Back','Barbell',null),
('romanian_deadlift','Romanian deadlift',ARRAY['rdl','romanian']::text[],'Hamstrings','Barbell',null),
('barbell_row','Barbell row',ARRAY['bent over row','bb row','pendlay row']::text[],'Back','Barbell',null),
('db_row','Dumbbell row',ARRAY['one arm row','db row','single arm row']::text[],'Back','Dumbbell',null),
('lat_pulldown','Lat pulldown',ARRAY['pulldown','lat pull down']::text[],'Back','Cable',null),
('seated_cable_row','Seated cable row',ARRAY['cable row','seated row']::text[],'Back','Cable',null),
('pull_up','Pull-up',ARRAY['pullup','pull ups','chin up','chinup']::text[],'Back','Bodyweight',1.0),
('face_pull','Face pull',ARRAY['facepull']::text[],'Rear delts','Cable',null),
('chest_supported_row','Chest-supported row',ARRAY['seal row','machine row']::text[],'Back','Machine',null),
('back_squat','Barbell back squat',ARRAY['squat','back squat']::text[],'Quads','Barbell',null),
('front_squat','Barbell front squat',ARRAY['front squat']::text[],'Quads','Barbell',null),
('hack_squat','Hack squat',ARRAY['hack']::text[],'Quads','Machine',null),
('leg_press','Leg press',ARRAY['press']::text[],'Quads','Machine',null),
('bulgarian_split_squat','Bulgarian split squat',ARRAY['bss','split squat','rear foot elevated split squat']::text[],'Quads','Dumbbell',null),
('walking_lunge','Walking lunge',ARRAY['lunge','lunges']::text[],'Quads','Dumbbell',null),
('leg_extension','Leg extension',ARRAY['quad extension','leg ext']::text[],'Quads','Machine',null),
('lying_leg_curl','Lying leg curl',ARRAY['leg curl','hamstring curl']::text[],'Hamstrings','Machine',null),
('seated_leg_curl','Seated leg curl',ARRAY['seated hamstring curl']::text[],'Hamstrings','Machine',null),
('hip_thrust','Barbell hip thrust',ARRAY['hip thrust','thrust']::text[],'Glutes','Barbell',null),
('standing_calf_raise','Standing calf raise',ARRAY['calf raise','calves']::text[],'Calves','Machine',null),
('seated_calf_raise','Seated calf raise',ARRAY['seated calves']::text[],'Calves','Machine',null),
('overhead_press','Barbell overhead press',ARRAY['ohp','military press','shoulder press','strict press']::text[],'Shoulders','Barbell',null),
('db_shoulder_press','Dumbbell shoulder press',ARRAY['db press','db shoulder press','seated dumbbell press']::text[],'Shoulders','Dumbbell',null),
('lateral_raise','Lateral raise',ARRAY['side raise','lat raise','laterals']::text[],'Shoulders','Dumbbell',null),
('cable_lateral_raise','Cable lateral raise',ARRAY['cable side raise']::text[],'Shoulders','Cable',null),
('rear_delt_fly','Rear delt fly',ARRAY['reverse fly','rear delt']::text[],'Rear delts','Dumbbell',null),
('barbell_curl','Barbell curl',ARRAY['bb curl','curl']::text[],'Biceps','Barbell',null),
('db_curl','Dumbbell curl',ARRAY['db curl','bicep curl']::text[],'Biceps','Dumbbell',null),
('incline_db_curl','Incline dumbbell curl',ARRAY['incline curl']::text[],'Biceps','Dumbbell',null),
('hammer_curl','Hammer curl',ARRAY['hammers']::text[],'Biceps','Dumbbell',null),
('cable_curl','Cable curl',ARRAY['cable bicep curl']::text[],'Biceps','Cable',null),
('preacher_curl','Preacher curl',ARRAY['preacher']::text[],'Biceps','Machine',null),
('triceps_pushdown','Triceps pushdown',ARRAY['pushdown','tricep pushdown','rope pushdown']::text[],'Triceps','Cable',null),
('overhead_triceps_ext','Overhead triceps extension',ARRAY['overhead extension','skull crusher','tricep extension']::text[],'Triceps','Cable',null),
('close_grip_bench','Close-grip bench press',ARRAY['cgbp','close grip bench']::text[],'Triceps','Barbell',null),
('cable_crunch','Cable crunch',ARRAY['kneeling crunch']::text[],'Core','Cable',null),
('hanging_leg_raise','Hanging leg raise',ARRAY['leg raise','hanging knee raise']::text[],'Core','Bodyweight',null),
('plank','Plank',ARRAY['front plank']::text[],'Core','Bodyweight',null)
on conflict (id) do nothing;
