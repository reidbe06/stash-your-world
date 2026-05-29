
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text default 'pink',
  is_public boolean not null default false,
  share_slug text unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete set null,
  title text not null,
  url text,
  description text,
  image_url text,
  type text not null default 'link',
  source text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_idx on public.items(user_id, created_at desc);
create index items_collection_idx on public.items(collection_id);
create index collections_user_idx on public.collections(user_id, created_at desc);

grant select, insert, update, delete on public.collections to authenticated;
grant all on public.collections to service_role;
grant select on public.collections to anon;

grant select, insert, update, delete on public.items to authenticated;
grant all on public.items to service_role;
grant select on public.items to anon;

alter table public.collections enable row level security;
alter table public.items enable row level security;

create policy "Users view own collections" on public.collections for select using (auth.uid() = user_id);
create policy "Public collections viewable by all" on public.collections for select using (is_public = true);
create policy "Users insert own collections" on public.collections for insert with check (auth.uid() = user_id);
create policy "Users update own collections" on public.collections for update using (auth.uid() = user_id);
create policy "Users delete own collections" on public.collections for delete using (auth.uid() = user_id);

create policy "Users view own items" on public.items for select using (auth.uid() = user_id);
create policy "Public items viewable via public collection" on public.items for select
  using (exists (select 1 from public.collections c where c.id = items.collection_id and c.is_public = true));
create policy "Users insert own items" on public.items for insert with check (auth.uid() = user_id);
create policy "Users update own items" on public.items for update using (auth.uid() = user_id);
create policy "Users delete own items" on public.items for delete using (auth.uid() = user_id);
