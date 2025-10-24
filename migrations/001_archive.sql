create table if not exists archive_items (
  id bigserial primary key,
  origin text not null check (origin in ('polygon','fmp')),
  type text not null check (type in ('news','press_release')),
  external_id text not null,
  source text,
  symbol text[] not null default '{}',
  published_at timestamptz not null,
  received_at timestamptz not null default now(),
  title text not null,
  summary text,
  body text,
  url text,
  image_url text,
  categories text[],
  content_hash text not null,
  unique (origin, type, external_id),
  unique (content_hash)
);
create index if not exists idx_archive_published_at on archive_items (published_at desc);
create index if not exists idx_archive_symbol on archive_items using gin (symbol);
create index if not exists idx_archive_ft on archive_items using gin (
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(body,''))
);
