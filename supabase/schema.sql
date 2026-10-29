create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.documents (
  id bigint generated always as identity primary key,
  source text not null,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null default 'gemini-embedding-001:1536',
  created_at timestamptz not null default now()
);

alter table public.documents add column if not exists embedding_model text;
update public.documents
set embedding_model = 'text-embedding-3-small'
where embedding_model is null;
alter table public.documents alter column embedding_model
  set default 'gemini-embedding-001:1536';
alter table public.documents alter column embedding_model set not null;

create index if not exists documents_embedding_idx
  on public.documents using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists documents_content_search_idx
  on public.documents using gin (content extensions.gin_trgm_ops);

drop function if exists public.hybrid_search_documents(text, extensions.vector, integer);

create or replace function public.hybrid_search_documents(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count integer default 5,
  query_embedding_model text default 'gemini-embedding-001:1536'
)
returns table (content text, source text, score double precision)
language sql
stable
set search_path = public, extensions
as $$
  with semantic_matches as (
    select d.id, d.content, d.source,
      1 - (d.embedding <=> query_embedding) as semantic_score,
      similarity(d.content, query_text) as lexical_score
    from public.documents d
    where d.embedding_model = query_embedding_model
    order by d.embedding <=> query_embedding
    limit greatest(match_count * 4, 20)
  )
  select content, source,
    (semantic_score * 0.75 + lexical_score * 0.25)::double precision as score
  from semantic_matches
  order by score desc
  limit match_count;
$$;

revoke all on function public.hybrid_search_documents(text, extensions.vector, integer, text) from public;
grant execute on function public.hybrid_search_documents(text, extensions.vector, integer, text) to service_role;