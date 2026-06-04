create table if not exists item_collections (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  item_id       uuid        not null references items(id)       on delete cascade,
  collection_id uuid        not null references collections(id) on delete cascade,
  created_at    timestamptz not null    default now(),
  unique(user_id, item_id, collection_id)
);

create index if not exists item_collections_item_id_idx       on item_collections(item_id);
create index if not exists item_collections_collection_id_idx on item_collections(collection_id);
create index if not exists item_collections_user_id_idx       on item_collections(user_id);

alter table item_collections enable row level security;

create policy "Users manage own item_collections"
  on item_collections for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Seed from existing single-collection FK
insert into item_collections (user_id, item_id, collection_id)
select user_id, id, collection_id
from   items
where  collection_id is not null
on conflict do nothing;
