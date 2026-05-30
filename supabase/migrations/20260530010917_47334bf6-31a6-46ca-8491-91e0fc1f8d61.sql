create or replace function public.search_items_semantic(query_embedding extensions.vector, match_count integer default 30, min_similarity double precision default 0.0)
returns table(id uuid, similarity double precision)
language sql
stable
set search_path to public, extensions
as $$
  select
    i.id,
    1 - (i.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.items i
  where i.user_id = auth.uid()
    and i.embedding is not null
    and 1 - (i.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by i.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;