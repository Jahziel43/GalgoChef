create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null,
  allergies text[] not null default '{}',
  intolerances text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_.-]{3,24}$'
  )
);

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  recipe jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_username text;
begin
  profile_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if profile_username = '' then
    profile_username := 'usuario-' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, username, email)
  values (new.id, profile_username, lower(new.email))
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists saved_recipes_set_updated_at on public.saved_recipes;
create trigger saved_recipes_set_updated_at
  before update on public.saved_recipes
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.saved_recipes enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read their saved recipes" on public.saved_recipes;
create policy "Users can read their saved recipes"
  on public.saved_recipes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save their own recipes" on public.saved_recipes;
create policy "Users can save their own recipes"
  on public.saved_recipes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their saved recipes" on public.saved_recipes;
create policy "Users can update their saved recipes"
  on public.saved_recipes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their saved recipes" on public.saved_recipes;
create policy "Users can delete their saved recipes"
  on public.saved_recipes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.saved_recipes from anon;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (allergies, intolerances) on public.profiles to authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
