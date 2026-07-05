alter table public.tasks
add column if not exists recurrence_type text not null default 'none';

alter table public.tasks
drop constraint if exists tasks_recurrence_type_check;

alter table public.tasks
add constraint tasks_recurrence_type_check
check (recurrence_type in ('none', 'daily', 'weekly'));
