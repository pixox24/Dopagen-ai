-- Supabase schema aligned with the current Dopagen AI codebase.
-- Safe to run multiple times in Supabase SQL Editor.
--
-- Important:
-- 1. This script is designed to match the current frontend code.
-- 2. The current admin panel writes `custom_models` and `site_settings`
--    directly from the browser with the anon key, so those tables are left
--    with RLS disabled for compatibility.
-- 3. If you want secure admin controls, move admin writes behind a server/API
--    layer first, then re-enable RLS on those tables.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text,
  avatar_url text,
  role text default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text,
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists role text default 'user',
  add column if not exists created_at timestamptz not null default now();

update public.profiles
set username = coalesce(nullif(username, ''), split_part(coalesce(email, id::text), '@', 1))
where username is null or username = '';

alter table public.profiles
  alter column username set not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, new.id::text), '@', 1)),
    new.email,
    null,
    'user'
  )
  on conflict (id) do update
  set email = excluded.email,
      username = coalesce(public.profiles.username, excluded.username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

-- ---------------------------------------------------------------------------
-- custom_models
-- ---------------------------------------------------------------------------

create table if not exists public.custom_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  version text default '1.0',
  description text default '',
  web_app_id bigint,
  schema jsonb,
  input_map jsonb,
  thumbnail_url text,
  api_key text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_models
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text,
  add column if not exists version text default '1.0',
  add column if not exists description text default '',
  add column if not exists web_app_id bigint,
  add column if not exists schema jsonb,
  add column if not exists input_map jsonb,
  add column if not exists thumbnail_url text,
  add column if not exists api_key text,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.custom_models
set version = coalesce(version, '1.0'),
    description = coalesce(description, ''),
    is_hidden = coalesce(is_hidden, false),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where version is null
   or description is null
   or is_hidden is null
   or created_at is null
   or updated_at is null;

alter table public.custom_models
  alter column name set not null,
  alter column is_hidden set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

create index if not exists idx_custom_models_user_id on public.custom_models(user_id);
create index if not exists idx_custom_models_hidden on public.custom_models(is_hidden);

-- Compatibility mode for the current admin UI.
alter table public.custom_models disable row level security;

-- ---------------------------------------------------------------------------
-- generation_tasks
-- ---------------------------------------------------------------------------

create table if not exists public.generation_tasks (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  model_id text,
  prompt text,
  params jsonb,
  status text,
  result_url text,
  created_at timestamptz not null default now()
);

alter table public.generation_tasks
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists model_id text,
  add column if not exists prompt text,
  add column if not exists params jsonb,
  add column if not exists status text,
  add column if not exists result_url text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_generation_tasks_user_id on public.generation_tasks(user_id);
create index if not exists idx_generation_tasks_created_at on public.generation_tasks(created_at desc);

alter table public.generation_tasks enable row level security;

drop policy if exists "generation_tasks_select_own" on public.generation_tasks;
create policy "generation_tasks_select_own"
on public.generation_tasks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "generation_tasks_insert_own" on public.generation_tasks;
create policy "generation_tasks_insert_own"
on public.generation_tasks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "generation_tasks_update_own" on public.generation_tasks;
create policy "generation_tasks_update_own"
on public.generation_tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- images
-- ---------------------------------------------------------------------------

create table if not exists public.images (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  prompt text not null,
  width integer not null,
  height integer not null,
  model_name text,
  is_public boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.images
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists url text,
  add column if not exists prompt text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists model_name text,
  add column if not exists is_public boolean not null default false,
  add column if not exists params jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

update public.images
set is_public = coalesce(is_public, false),
    params = coalesce(params, '{}'::jsonb),
    created_at = coalesce(created_at, now())
where is_public is null
   or params is null
   or created_at is null;

alter table public.images
  alter column user_id set not null,
  alter column url set not null,
  alter column prompt set not null,
  alter column width set not null,
  alter column height set not null,
  alter column is_public set not null,
  alter column params set not null,
  alter column created_at set not null;

create index if not exists idx_images_public_created_at on public.images(is_public, created_at desc);
create index if not exists idx_images_user_id on public.images(user_id);

alter table public.images enable row level security;

drop policy if exists "images_select_public" on public.images;
create policy "images_select_public"
on public.images
for select
to anon, authenticated
using (is_public = true);

drop policy if exists "images_select_own" on public.images;
create policy "images_select_own"
on public.images
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "images_insert_own" on public.images;
create policy "images_insert_own"
on public.images
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "images_update_own" on public.images;
create policy "images_update_own"
on public.images
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "images_delete_own" on public.images;
create policy "images_delete_own"
on public.images
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------------

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings
  add column if not exists value jsonb not null default 'null'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.site_settings
set created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where created_at is null
   or updated_at is null;

-- Compatibility mode for the current admin UI.
alter table public.site_settings disable row level security;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_custom_models_updated_at on public.custom_models;
create trigger set_custom_models_updated_at
before update on public.custom_models
for each row execute procedure public.set_updated_at();

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- default site settings rows
-- ---------------------------------------------------------------------------

insert into public.site_settings (key, value)
values
  ('bizyairApiKey', '""'::jsonb),
  ('loadingMessages', '[]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- storage bucket and policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('public-gallery', 'public-gallery', true)
on conflict (id) do update
set public = excluded.public,
    name = excluded.name;

drop policy if exists "public_gallery_read" on storage.objects;
create policy "public_gallery_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'public-gallery');

drop policy if exists "public_gallery_insert_own_folder" on storage.objects;
create policy "public_gallery_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'public-gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "public_gallery_update_own_folder" on storage.objects;
create policy "public_gallery_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'public-gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'public-gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "public_gallery_delete_own_folder" on storage.objects;
create policy "public_gallery_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'public-gallery'
  and (storage.foldername(name))[1] = auth.uid()::text
);
