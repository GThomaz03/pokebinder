-- Social: profiles públicos, follows, fichários publicados no perfil

-- Extensão de profiles
alter table public.profiles
  add column if not exists username text,
  add column if not exists friend_code text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists is_public boolean not null default true;

create unique index if not exists profiles_username_idx
  on public.profiles (lower(username))
  where username is not null;

create unique index if not exists profiles_friend_code_idx
  on public.profiles (friend_code)
  where friend_code is not null;

-- Follows (one-way)
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists follows_follower_idx on public.follows (follower_id);

-- Espelho listável de recursos publicados no perfil (híbrido com share_links)
create table if not exists public.published_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  resource_type text not null check (resource_type in ('binder', 'deck')),
  resource_id text not null,
  share_token text not null,
  title text,
  published_at timestamptz not null default now(),
  unique (owner_id, resource_type, resource_id)
);

create index if not exists published_resources_owner_idx
  on public.published_resources (owner_id, published_at desc);

create index if not exists published_resources_token_idx
  on public.published_resources (share_token);

-- Helpers para username / friend_code
create or replace function public.slugify_username(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(coalesce(raw, 'treinador'));
  s := regexp_replace(s, '[^a-z0-9_]+', '_', 'g');
  s := regexp_replace(s, '^_+|_+$', '', 'g');
  if length(s) < 3 then
    s := 'treinador';
  end if;
  return left(s, 24);
end;
$$;

create or replace function public.generate_friend_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.ensure_unique_username(base text, user_id uuid)
returns text
language plpgsql
as $$
declare
  candidate text;
  n int := 0;
begin
  candidate := public.slugify_username(base);
  while exists (
    select 1 from public.profiles p
    where lower(p.username) = lower(candidate)
      and p.id <> user_id
  ) loop
    n := n + 1;
    candidate := left(public.slugify_username(base), 20) || n::text;
  end loop;
  return candidate;
end;
$$;

-- Atualiza trigger de signup para preencher username + friend_code
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  uname text;
  fcode text;
begin
  base_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );
  uname := public.ensure_unique_username(base_name, new.id);
  fcode := public.generate_friend_code();

  insert into public.profiles (id, display_name, username, friend_code)
  values (new.id, base_name, uname, fcode)
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    username = coalesce(public.profiles.username, excluded.username),
    friend_code = coalesce(public.profiles.friend_code, excluded.friend_code),
    updated_at = now();

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Backfill perfis existentes
do $$
declare
  r record;
  uname text;
  fcode text;
begin
  for r in
    select id, display_name from public.profiles
    where username is null or friend_code is null
  loop
    uname := coalesce(
      (select username from public.profiles where id = r.id),
      public.ensure_unique_username(coalesce(r.display_name, 'treinador'), r.id)
    );
    fcode := coalesce(
      (select friend_code from public.profiles where id = r.id),
      public.generate_friend_code()
    );
    update public.profiles
    set username = uname,
        friend_code = fcode,
        updated_at = now()
    where id = r.id;
  end loop;
end;
$$;

-- RLS
alter table public.follows enable row level security;
alter table public.published_resources enable row level security;

-- Profiles: leitura pública de perfis públicos; dono sempre lê;
-- quem segue (ou é seguido) também pode ler o perfil do outro
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_public_or_own" on public.profiles;
create policy "profiles_select_public_or_own"
  on public.profiles for select
  using (
    is_public = true
    or auth.uid() = id
    or exists (
      select 1 from public.follows f
      where (f.follower_id = auth.uid() and f.following_id = profiles.id)
         or (f.following_id = auth.uid() and f.follower_id = profiles.id)
    )
  );

-- keeps existing insert/update own policies

-- Follows
create policy "follows_select_involved"
  on public.follows for select
  using (auth.uid() = follower_id or auth.uid() = following_id);

create policy "follows_insert_own"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "follows_delete_own"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- Published resources: leitura pública; escrita só dono
create policy "published_resources_select_public"
  on public.published_resources for select
  using (true);

create policy "published_resources_insert_own"
  on public.published_resources for insert
  with check (auth.uid() = owner_id);

create policy "published_resources_update_own"
  on public.published_resources for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "published_resources_delete_own"
  on public.published_resources for delete
  using (auth.uid() = owner_id);

-- Allow anonymous read of public profiles + published (already covered by policies)
-- Authenticated users can look up by friend_code via select policy
