insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read recipe images" on storage.objects;
create policy "Public can read recipe images"
  on storage.objects for select
  to public
  using (bucket_id = 'recipe-images');

create table if not exists public.dietary_options (
  id text primary key,
  name text not null,
  type text not null check (type in ('allergy', 'intolerance', 'dislike')),
  normalized_name text not null,
  match_terms text[] not null default '{}',
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (type, normalized_name)
);

create table if not exists public.dietary_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.user_dietary_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  option_id text not null references public.dietary_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, option_id)
);

create index if not exists dietary_options_type_idx
  on public.dietary_options (type);

create index if not exists user_dietary_preferences_option_idx
  on public.user_dietary_preferences (option_id);

insert into public.dietary_options (id, name, type, normalized_name, match_terms)
values
  ('allergy:peanuts', 'Cacahuates / maní', 'allergy', 'cacahuates mani', array['cacahuate', 'cacahuetes', 'mani', 'peanut']),
  ('allergy:tree_nuts', 'Frutos secos', 'allergy', 'frutos secos', array['nuez', 'nueces', 'almendra', 'avellana', 'pistacho', 'anacardo', 'nuez de la india', 'nuez pecana', 'nuez de brasil', 'macadamia', 'walnut', 'cashew', 'pecan']),
  ('allergy:milk', 'Leche y lácteos', 'allergy', 'leche y lacteos', array['leche', 'queso', 'yogur', 'mantequilla', 'crema', 'lacteo', 'lacteos', 'caseina', 'suero de leche', 'lactosa', 'caseinato', 'lactosuero', 'dairy', 'whey']),
  ('allergy:egg', 'Huevo', 'allergy', 'huevo', array['huevo', 'huevos', 'clara', 'yema', 'mayonesa', 'merengue', 'egg']),
  ('allergy:wheat', 'Trigo', 'allergy', 'trigo', array['trigo', 'harina de trigo', 'semola', 'pan', 'pasta', 'wheat']),
  ('allergy:gluten', 'Gluten', 'allergy', 'gluten', array['gluten', 'trigo', 'cebada', 'centeno', 'harina', 'seitan', 'cuscus', 'malta']),
  ('allergy:soy', 'Soya', 'allergy', 'soya', array['soya', 'soja', 'tofu', 'edamame', 'soy']),
  ('allergy:fish', 'Pescado', 'allergy', 'pescado', array['pescado', 'atun', 'salmon', 'sardina', 'anchoa', 'bacalao', 'merluza', 'fish']),
  ('allergy:shellfish', 'Mariscos', 'allergy', 'mariscos', array['marisco', 'camarone', 'gamba', 'cangrejo', 'langostino', 'langosta', 'mejillon', 'almeja', 'ostion', 'ostra', 'vieira', 'shrimp', 'shellfish']),
  ('allergy:sesame', 'Sésamo / ajonjolí', 'allergy', 'sesamo ajonjoli', array['sesamo', 'ajonjoli', 'tahini', 'aceite de sesamo']),
  ('intolerance:lactose', 'Intolerancia a la lactosa', 'intolerance', 'intolerancia a la lactosa', array['leche', 'queso', 'yogur', 'mantequilla', 'crema', 'lacteo', 'lacteos', 'caseina', 'suero de leche', 'dairy']),
  ('intolerance:gluten', 'Sensibilidad al gluten', 'intolerance', 'sensibilidad al gluten', array['gluten', 'trigo', 'cebada', 'centeno', 'harina', 'seitan', 'cuscus', 'malta']),
  ('intolerance:fructose', 'Intolerancia a la fructosa', 'intolerance', 'intolerancia a la fructosa', array['fructosa', 'miel', 'jarabe de maiz', 'manzana', 'pera', 'mango', 'agave'])
on conflict (id) do nothing;

insert into public.user_dietary_preferences (user_id, option_id)
select profile.id, 'allergy:' || selected.preference
from public.profiles as profile
cross join lateral unnest(profile.allergies) as selected(preference)
where exists (
  select 1
  from public.dietary_options as existing_option
  where existing_option.id = 'allergy:' || selected.preference
)
on conflict do nothing;

insert into public.user_dietary_preferences (user_id, option_id)
select profile.id, 'intolerance:' || selected.preference
from public.profiles as profile
cross join lateral unnest(profile.intolerances) as selected(preference)
where exists (
  select 1
  from public.dietary_options as existing_option
  where existing_option.id = 'intolerance:' || selected.preference
)
on conflict do nothing;

alter table public.dietary_options enable row level security;
alter table public.dietary_suggestions enable row level security;
alter table public.user_dietary_preferences enable row level security;

drop policy if exists "Anyone can read dietary options" on public.dietary_options;
create policy "Anyone can read dietary options"
  on public.dietary_options for select
  to public
  using (true);

drop policy if exists "Users can read their dietary suggestions" on public.dietary_suggestions;
create policy "Users can read their dietary suggestions"
  on public.dietary_suggestions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can submit dietary suggestions" on public.dietary_suggestions;
create policy "Users can submit dietary suggestions"
  on public.dietary_suggestions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their dietary suggestions" on public.dietary_suggestions;
create policy "Users can delete their dietary suggestions"
  on public.dietary_suggestions for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read their dietary preferences" on public.user_dietary_preferences;
create policy "Users can read their dietary preferences"
  on public.user_dietary_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add their dietary preferences" on public.user_dietary_preferences;
create policy "Users can add their dietary preferences"
  on public.user_dietary_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can remove their dietary preferences" on public.user_dietary_preferences;
create policy "Users can remove their dietary preferences"
  on public.user_dietary_preferences for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can update their dietary preferences" on public.user_dietary_preferences;
create policy "Users can update their dietary preferences"
  on public.user_dietary_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.dietary_options from anon;
revoke all on public.dietary_suggestions from anon;
revoke all on public.user_dietary_preferences from anon;

grant select on public.dietary_options to anon, authenticated;
grant select, insert, delete on public.dietary_suggestions to authenticated;
grant select, insert, update, delete on public.user_dietary_preferences to authenticated;
