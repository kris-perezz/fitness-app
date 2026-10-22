-- The weekly goal rate as a percent of body weight: negative loses, 0 maintains,
-- null is no goal. A pound rate means a different pace as weight changes; a
-- percent keeps meaning the same thing.
alter table public.nutrition_settings
  add column if not exists goal_rate_pct numeric
    check (goal_rate_pct is null or goal_rate_pct between -1 and 1);

-- From the pound rate and the latest weigh-in, snapped into the slider's
-- 0.25-1% range. Accounts with no weigh-in have nothing to divide by and keep
-- no goal.
update public.nutrition_settings s
set goal_rate_pct = case
  when s.goal_rate_lb_per_week = 0 then 0
  else sign(s.goal_rate_lb_per_week)
    * round(least(greatest(abs(s.goal_rate_lb_per_week) / w.weight_lb * 100, 0.25), 1) * 20) / 20
end
from (
  select distinct on (user_id) user_id, weight_lb
  from public.weigh_ins
  order by user_id, log_date desc
) w
where w.user_id = s.user_id
  and s.goal_rate_lb_per_week is not null
  and s.goal_rate_pct is null;
