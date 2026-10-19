-- Sets were numbered from the client's count, so deleting a middle set and
-- adding another left two rows with the same number. Renumber every slot's sets
-- in the order they were logged; the app keeps them gapless from here.
update public.workout_sets s
set set_index = n.i
from (
  select id, row_number() over (partition by workout_exercise_id order by set_index, created_at) - 1 as i
  from public.workout_sets
) n
where s.id = n.id and s.set_index <> n.i;
