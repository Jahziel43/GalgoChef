create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  description text not null default '',
  prep_time text not null default '30 min',
  calories integer not null default 0,
  macros jsonb not null default '{"protein": 0, "carbs": 0, "fats": 0}',
  used_ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  image_url text,
  image_photographer text,
  image_source_url text,
  match_percentage integer not null default 100,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (collection_id, recipe_id)
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

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute procedure public.set_updated_at();

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute procedure public.set_updated_at();

alter table public.recipes enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists "Anyone can read published recipes" on public.recipes;
create policy "Anyone can read published recipes"
  on public.recipes for select
  to public
  using (true);

drop policy if exists "Authenticated users can create recipes" on public.recipes;
create policy "Authenticated users can create recipes"
  on public.recipes for insert
  to authenticated
  with check (true);

drop policy if exists "Owners can update recipes" on public.recipes;
drop policy if exists "Users can update their recipes" on public.recipes;
create policy "Owners can update recipes"
  on public.recipes for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Users can read their collections" on public.collections;
create policy "Users can read their collections"
  on public.collections for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert their collections" on public.collections;
create policy "Users can insert their collections"
  on public.collections for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their collections" on public.collections;
create policy "Users can update their collections"
  on public.collections for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their collections" on public.collections;
create policy "Users can delete their collections"
  on public.collections for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read their collection items" on public.collection_items;
create policy "Users can read their collection items"
  on public.collection_items for select
  to authenticated
  using (collection_id in (
    select id from public.collections where user_id = auth.uid()
  ));

drop policy if exists "Users can insert into their collection items" on public.collection_items;
create policy "Users can insert into their collection items"
  on public.collection_items for insert
  to authenticated
  with check (collection_id in (
    select id from public.collections where user_id = auth.uid()
  ));

drop policy if exists "Users can delete from their collection items" on public.collection_items;
create policy "Users can delete from their collection items"
  on public.collection_items for delete
  to authenticated
  using (collection_id in (
    select id from public.collections where user_id = auth.uid()
  ));

revoke all on public.recipes from anon;
revoke all on public.collections from anon;
revoke all on public.collection_items from anon;

grant select on public.recipes to anon;
grant select on public.recipes to authenticated;
grant insert, update on public.recipes to authenticated;

grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, delete on public.collection_items to authenticated;
