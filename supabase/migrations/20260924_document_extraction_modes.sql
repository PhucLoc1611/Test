-- Migration for an existing Insta Quote AI database.
-- Run this once in the Supabase SQL Editor if the tables already existed.

alter table public.documents add column if not exists file_hash text;
alter table public.documents add column if not exists processing_mode text not null default 'deterministic';
alter table public.documents add column if not exists document_type text not null default 'text_pdf';

alter table public.documents drop constraint if exists documents_processing_mode_check;
alter table public.documents add constraint documents_processing_mode_check
  check (processing_mode in ('deterministic', 'image', 'ai'));

alter table public.documents drop constraint if exists documents_document_type_check;
alter table public.documents add constraint documents_document_type_check
  check (document_type in ('text_pdf', 'scanned_pdf', 'hybrid_pdf'));

create unique index if not exists documents_file_hash_mode_unique_idx
  on public.documents(file_hash, processing_mode)
  where file_hash is not null;

alter table public.line_items add column if not exists source_type text not null default 'text';
alter table public.line_items add column if not exists confidence numeric;

alter table public.line_items drop constraint if exists line_items_source_type_check;
alter table public.line_items add constraint line_items_source_type_check
  check (source_type in ('text', 'gemini_vision'));

alter table public.line_items drop constraint if exists line_items_confidence_check;
alter table public.line_items add constraint line_items_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));
