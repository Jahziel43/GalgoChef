create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  normalized_name text not null,
  category text not null default 'Otros',
  emoji text not null default '🥕',
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredient_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  category text null,
  emoji text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create index if not exists ingredients_category_idx
  on public.ingredients (category);

create index if not exists ingredients_normalized_name_idx
  on public.ingredients (normalized_name);

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

drop trigger if exists ingredients_set_updated_at on public.ingredients;
create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row execute procedure public.set_updated_at();

alter table public.ingredients enable row level security;
alter table public.ingredient_suggestions enable row level security;

drop policy if exists "Public can read active ingredients" on public.ingredients;
create policy "Public can read active ingredients"
  on public.ingredients for select
  to public
  using (is_active = true);

drop policy if exists "Authenticated users can insert ingredients" on public.ingredients;
create policy "Authenticated users can insert ingredients"
  on public.ingredients for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update ingredients" on public.ingredients;
create policy "Authenticated users can update ingredients"
  on public.ingredients for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Users can read their ingredient suggestions" on public.ingredient_suggestions;
create policy "Users can read their ingredient suggestions"
  on public.ingredient_suggestions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert ingredient suggestions" on public.ingredient_suggestions;
create policy "Users can insert ingredient suggestions"
  on public.ingredient_suggestions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete ingredient suggestions" on public.ingredient_suggestions;
create policy "Users can delete ingredient suggestions"
  on public.ingredient_suggestions for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.ingredients from anon;
revoke all on public.ingredient_suggestions from anon;

grant select on public.ingredients to anon;
grant select on public.ingredients to authenticated;
grant insert, update on public.ingredients to authenticated;
grant select, insert, delete on public.ingredient_suggestions to authenticated;
