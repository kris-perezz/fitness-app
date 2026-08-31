-- Corrections to the aliases 0015 added, and one rename.
--
-- ---------------------------------------------------------------- t-bar row
-- The T-bar row is not the landmine row, and 0015 said it was.
--
-- They share a loading pattern -- one end of a barbell pinned, you row the
-- other -- which is why half the internet treats the names as interchangeable,
-- and why the alias went in. They are not the same exercise. A landmine row is
-- performed standing and unsupported: the erectors stabilise throughout, and
-- the plates on the bar end cut the range of motion short. The one in this
-- catalog is the CHEST-SUPPORTED machine, whose whole reason for existing is
-- removing that stabilisation demand so the back is the limiter instead of the
-- lower back.
--
-- There is no landmine row in the catalog at all. If one is ever added it
-- should be its own exercise, not an alias hung on this one.
update public.exercises
   set aliases = array_remove(aliases, 'landmine row')
 where id = 't_bar_row';

-- The name follows the correction. Note the id does NOT change: every
-- suggestion and every all-time best is looked up by exercise_id (0014's
-- exercise_bests and last_session_slots both filter on it, and the session page
-- passes slot.exercise_id), so renaming in place keeps six years of history
-- attached. Adding a second exercise instead would have orphaned all of it and
-- made a machine trained for months look brand new with nothing to suggest.
update public.exercises
   set name = 'Chest Supported T Bar Row'
 where id = 't_bar_row';

-- And the name frozen on the sets already logged against it.
--
-- This is a DELIBERATE EXCEPTION to the rule that the log is never rewritten
-- (S7/S19/S32), and the reason it is allowed is the same reason 0013's backfill
-- was: the rule exists to stop RECATEGORISING a lift from rewriting what past
-- sessions say it trained. Nothing is being recategorised here. The muscles are
-- untouched, the id is untouched, the sets are untouched -- the machine was
-- always the chest-supported one and the catalog simply called it by a shorter
-- name. Correcting a label for the same physical object is not the failure mode
-- the freeze protects against, and leaving it would mean a history that shows
-- two names for one machine with nothing on screen to explain the difference.
--
-- Scoped to the old name rather than to every row of this exercise, so anything
-- logged under a different name -- there is nothing today, but the log is the
-- record and it gets the benefit of the doubt -- is left exactly as it is.
update public.workout_exercises
   set name = 'Chest Supported T Bar Row'
 where exercise_id = 't_bar_row'
   and name = 'T Bar Row';

-- What people actually type for this machine, now that the wrong name is gone.
-- The hyphenated spellings are the ones the catalog's own name cannot match,
-- since searchNamed compares literal substrings and a hyphen is a character
-- like any other.
update public.exercises
   set aliases = aliases || (
         select coalesce(array_agg(a), '{}')
           from unnest(array['t bar row','t-bar row','t-bar','tbar']) as a
          where not (aliases @> array[a])
       )
 where id = 't_bar_row';

-- It is a plate-loaded machine, not a barbell. `equipment` is only two things
-- in this app -- the word printed under the name in the picker, and the check
-- in allowsBodyweight() that looks for 'Bodyweight' -- so this is cosmetic and
-- affects no logged row, no suggestion and no volume figure. The word should
-- still be true. The vocabulary does not distinguish plate-loaded from
-- pin-loaded, and does not need to: both are machines.
update public.exercises
   set equipment = 'Machine'
 where id = 't_bar_row';

-- ------------------------------------------------------- three bad aliases
-- All three are 0015's, and all three are the same mistake in different
-- clothes: a name that belongs to a NEARBY exercise, not to this one.
--
--   rfess        -- rear-foot-elevated split squat describes BOTH Bulgarians,
--                   and nobody says it anyway; bss is the term that gets typed.
--                   On one of the two it was actively misleading.
--   french press -- means the overhead triceps extension at least as often as
--                   the lying one. Exactly the confusion that had skullcrusher
--                   on the wrong row until 0015 moved it.
--   lat prayer   -- a kneeling variation with body movement to match the
--                   resistance curve, not another word for a straight-arm
--                   pulldown.
update public.exercises
   set aliases = array_remove(aliases, 'rfess')
 where id = 'bulgarian_split_squat_barbell';

update public.exercises
   set aliases = array_remove(aliases, 'french press')
 where id = 'lying_tricep_extension';

update public.exercises
   set aliases = array_remove(aliases, 'lat prayer')
 where id = 'rope_straight_arm_pulldown';

do $$
declare bad text;
begin
  -- v.id and v.term qualified: public.exercises has an `id` too, and an
  -- unqualified one here is ambiguous rather than merely unclear.
  select string_agg(v.id || ': ' || v.term, ', ') into bad
    from (values ('t_bar_row','landmine row'),
                 ('bulgarian_split_squat_barbell','rfess'),
                 ('lying_tricep_extension','french press'),
                 ('rope_straight_arm_pulldown','lat prayer')) as v(id, term)
    join public.exercises e on e.id = v.id and e.aliases @> array[v.term];
  if bad is not null then
    raise exception 'alias(es) not removed -- %', bad;
  end if;

  if not exists (select 1 from public.exercises
                  where id = 't_bar_row' and name = 'Chest Supported T Bar Row') then
    raise exception 't_bar_row was not renamed';
  end if;
end $$;
