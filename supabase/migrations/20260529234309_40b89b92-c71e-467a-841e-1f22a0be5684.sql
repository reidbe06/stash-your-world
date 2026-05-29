
create extension if not exists vector;

alter table public.items
  add column if not exists embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

create index if not exists items_embedding_idx
  on public.items using hnsw (embedding vector_cosine_ops);

create or replace function public.search_items_semantic(
  query_embedding vector(1536),
  match_count int default 30,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.id,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.items i
  where i.user_id = auth.uid()
    and i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) >= min_similarity
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.search_items_semantic(vector, int, float) to authenticated;
