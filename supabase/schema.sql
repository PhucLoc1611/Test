-- Insta Quote AI extraction schema
-- Run this file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_hash text,
  processing_mode text not null default 'deterministic'
    check (processing_mode in ('deterministic', 'image', 'ai')),
  document_type text not null default 'text_pdf'
    check (document_type in ('text_pdf', 'scanned_pdf', 'hybrid_pdf')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'completed_with_refusals', 'failed')),
  pages_processed integer not null default 0
    check (pages_processed >= 0),
  created_at timestamptz not null default now()
);

alter table public.documents add column if not exists file_hash text;
alter table public.documents add column if not exists processing_mode text not null default 'deterministic';
alter table public.documents add column if not exists document_type text not null default 'text_pdf';

alter table public.documents drop constraint if exists documents_processing_mode_check;
alter table public.documents add constraint documents_processing_mode_check
  check (processing_mode in ('deterministic', 'image', 'ai'));

drop index if exists documents_file_hash_unique_idx;

create unique index if not exists documents_file_hash_mode_unique_idx
  on public.documents(file_hash, processing_mode)
  where file_hash is not null;

create table if not exists public.line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.documents(id)
    on delete cascade,
  description text not null,
  quantity numeric not null,
  unit text,
  page integer not null check (page > 0),
  source_text text not null,
  source_type text not null default 'text'
    check (source_type in ('text', 'gemini_vision')),
  confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);

alter table public.line_items add column if not exists source_type text not null default 'text';
alter table public.line_items add column if not exists confidence numeric;

create table if not exists public.refusals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.documents(id)
    on delete cascade,
  page integer check (page is null or page > 0),
  source_text text,
  reason text not null,
  user_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists line_items_document_id_idx
  on public.line_items(document_id);

create index if not exists refusals_document_id_idx
  on public.refusals(document_id);

create index if not exists documents_created_at_idx
  on public.documents(created_at desc);

-- The current take-home has no user/tenant column yet. These policies allow
-- the unauthenticated publishable-key demo to persist its extraction results.
-- This is intentionally demo-only; production must add an owner_id column
-- and replace these policies with per-user authorization.
alter table public.documents enable row level security;
alter table public.line_items enable row level security;
alter table public.refusals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'documents'
      and policyname = 'demo documents public access'
  ) then
    create policy "demo documents public access"
      on public.documents for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'line_items'
      and policyname = 'demo line items public access'
  ) then
    create policy "demo line items public access"
      on public.line_items for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'refusals'
      and policyname = 'demo refusals public access'
  ) then
    create policy "demo refusals public access"
      on public.refusals for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;

comment on table public.documents is
  'Uploaded PDF metadata and extraction status.';
comment on table public.line_items is
  'Extracted quantities. Every quantity must have page and exact source_text evidence.';
comment on table public.refusals is
  'Values or pages intentionally not extracted, including the user-facing explanation.';
