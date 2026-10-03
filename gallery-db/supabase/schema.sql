-- =====================================================================
--  Gallery DB — Supabase schema
--  Run this whole file once in: Supabase Dashboard → SQL Editor → New query
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS)
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Admins: only users listed here can create/edit/delete posts,
-- upload images, and delete comments.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Posts
--   images = ordered JSON array:
--   [{ "full": "posts/<id>/a.webp", "thumb": "posts/<id>/a_t.webp", "w": 1600, "h": 1067 }, ...]
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 20000),
  images      jsonb not null default '[]'::jsonb,
  -- lowercase title + description, used by the search box
  search_text text generated always as (lower(title || ' ' || description)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
-- Fast partial-word search (e.g. "sun" finds "sunset")
create index if not exists posts_search_trgm_idx on public.posts using gin (search_text gin_trgm_ops);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Comments (anyone can post; name optional)
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  name       text check (name is null or char_length(name) <= 60),
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.admins   enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;

-- admins: a signed-in user may check only their own row
drop policy if exists "admins self read" on public.admins;
create policy "admins self read" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- posts: everyone reads, only admins write
drop policy if exists "posts public read"  on public.posts;
drop policy if exists "posts admin insert" on public.posts;
drop policy if exists "posts admin update" on public.posts;
drop policy if exists "posts admin delete" on public.posts;
create policy "posts public read"  on public.posts for select using (true);
create policy "posts admin insert" on public.posts for insert to authenticated with check (public.is_admin());
create policy "posts admin update" on public.posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "posts admin delete" on public.posts for delete to authenticated using (public.is_admin());

-- comments: everyone reads & adds, only admins delete
drop policy if exists "comments public read"   on public.comments;
drop policy if exists "comments public insert" on public.comments;
drop policy if exists "comments admin delete"  on public.comments;
create policy "comments public read"   on public.comments for select using (true);
create policy "comments public insert" on public.comments for insert to anon, authenticated with check (true);
create policy "comments admin delete"  on public.comments for delete to authenticated using (public.is_admin());

-- Basic anti-flood: max 5 comments per post per minute (across everyone)
create or replace function public.comment_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments
      where post_id = new.post_id and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Too many comments right now — please try again in a minute.';
  end if;
  new.created_at = now();          -- clients can't fake timestamps
  new.name = nullif(trim(new.name), '');
  return new;
end $$;

drop trigger if exists comments_rate on public.comments;
create trigger comments_rate before insert on public.comments
for each row execute function public.comment_rate_limit();

-- ---------------------------------------------------------------------
-- Storage bucket for images (public read, admin-only write)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 10485760, array['image/webp','image/jpeg','image/png','image/gif'])
on conflict (id) do update set public = true;

drop policy if exists "post-images admin insert" on storage.objects;
drop policy if exists "post-images admin update" on storage.objects;
drop policy if exists "post-images admin delete" on storage.objects;
create policy "post-images admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-images' and public.is_admin());
create policy "post-images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'post-images' and public.is_admin());
create policy "post-images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'post-images' and public.is_admin());

-- =====================================================================
-- LAST STEP (run separately after creating your user in
-- Authentication → Users → Add user). Replace the email:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
-- =====================================================================
