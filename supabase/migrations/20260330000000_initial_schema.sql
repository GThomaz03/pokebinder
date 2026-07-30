-- PokéBinder: schema inicial com auth, persistência e compartilhamento

-- Perfis de usuário
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  preferred_lang text not null default 'pt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dados do usuário (jsonb espelha o modelo local para sync simples)
create table if not exists public.user_binders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  binders jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_inventory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  inventory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_decks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  decks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Links de compartilhamento (snapshot público do recurso)
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  resource_type text not null check (resource_type in ('binder', 'deck')),
  resource_id text not null,
  title text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists share_links_token_idx on public.share_links (token);
create index if not exists share_links_owner_idx on public.share_links (owner_id);

-- Trigger: criar perfil ao registrar
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.user_binders enable row level security;
alter table public.user_inventory enable row level security;
alter table public.user_decks enable row level security;
alter table public.share_links enable row level security;

-- Profiles
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- User binders
create policy "user_binders_select_own"
  on public.user_binders for select
  using (auth.uid() = user_id);

create policy "user_binders_insert_own"
  on public.user_binders for insert
  with check (auth.uid() = user_id);

create policy "user_binders_update_own"
  on public.user_binders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_binders_delete_own"
  on public.user_binders for delete
  using (auth.uid() = user_id);

-- User inventory
create policy "user_inventory_select_own"
  on public.user_inventory for select
  using (auth.uid() = user_id);

create policy "user_inventory_insert_own"
  on public.user_inventory for insert
  with check (auth.uid() = user_id);

create policy "user_inventory_update_own"
  on public.user_inventory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_inventory_delete_own"
  on public.user_inventory for delete
  using (auth.uid() = user_id);

-- User decks
create policy "user_decks_select_own"
  on public.user_decks for select
  using (auth.uid() = user_id);

create policy "user_decks_insert_own"
  on public.user_decks for insert
  with check (auth.uid() = user_id);

create policy "user_decks_update_own"
  on public.user_decks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_decks_delete_own"
  on public.user_decks for delete
  using (auth.uid() = user_id);

-- Share links: dono gerencia, qualquer um lê pelo token (snapshot público)
create policy "share_links_select_public"
  on public.share_links for select
  using (true);

create policy "share_links_insert_own"
  on public.share_links for insert
  with check (auth.uid() = owner_id);

create policy "share_links_update_own"
  on public.share_links for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "share_links_delete_own"
  on public.share_links for delete
  using (auth.uid() = owner_id);
