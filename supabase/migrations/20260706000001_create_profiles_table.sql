-- Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  email text,
  full_name text,
  name text,
  updated_at timestamp with time zone
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies
drop policy if exists "Allow public read access" on public.profiles;
create policy "Allow public read access" on public.profiles
  for select using (true);

drop policy if exists "Allow users to insert their own profile" on public.profiles;
create policy "Allow users to insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Allow users to update their own profile" on public.profiles;
create policy "Allow users to update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- Trigger function for new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  default_username text;
  base_username text;
  suffix int := 1;
begin
  base_username := coalesce(split_part(new.email, '@', 1), 'user');
  default_username := base_username;
  
  while exists (select 1 from public.profiles where username = default_username) loop
    default_username := base_username || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.profiles (id, username, email, updated_at)
  values (new.id, default_username, new.email, now());
  return new;
end;
$$;

-- Create the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Populate existing users
insert into public.profiles (id, username, email, updated_at)
select 
  id,
  case 
    when count(*) over (partition by split_part(email, '@', 1)) > 1 
    then split_part(email, '@', 1) || '_' || substring(id::text from 1 for 4)
    else coalesce(split_part(email, '@', 1), substring(id::text from 1 for 8))
  end as username,
  email,
  now()
from auth.users
on conflict (id) do nothing;
