-- Collaborative shared binders (realtime-friendly, separate from user_binders blob)

create table if not exists public.shared_binders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  grid text not null default '3x3',
  doc jsonb not null,
  revision bigint not null default 0,
  invite_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_binders_owner_idx on public.shared_binders (owner_id);
create index if not exists shared_binders_invite_idx on public.shared_binders (invite_token)
  where invite_token is not null;

create table if not exists public.binder_members (
  binder_id uuid not null references public.shared_binders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (binder_id, user_id)
);

create index if not exists binder_members_user_idx on public.binder_members (user_id);

-- Helper to avoid RLS recursion when checking membership
create or replace function public.is_binder_member(p_binder_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.binder_members m
    where m.binder_id = p_binder_id and m.user_id = p_user_id
  );
$$;

revoke all on function public.is_binder_member(uuid, uuid) from public;
grant execute on function public.is_binder_member(uuid, uuid) to authenticated;
grant execute on function public.is_binder_member(uuid, uuid) to anon;

alter table public.shared_binders enable row level security;
alter table public.binder_members enable row level security;

-- shared_binders policies
create policy "shared_binders_select_member"
  on public.shared_binders for select
  using (public.is_binder_member(id) or owner_id = auth.uid());

create policy "shared_binders_insert_own"
  on public.shared_binders for insert
  with check (auth.uid() = owner_id);

create policy "shared_binders_update_member"
  on public.shared_binders for update
  using (public.is_binder_member(id))
  with check (public.is_binder_member(id));

create policy "shared_binders_delete_owner"
  on public.shared_binders for delete
  using (owner_id = auth.uid());

-- binder_members policies
create policy "binder_members_select_member"
  on public.binder_members for select
  using (
    public.is_binder_member(binder_id)
    or user_id = auth.uid()
  );

create policy "binder_members_insert_owner"
  on public.binder_members for insert
  with check (
    -- owner adding someone (including self on create)
    exists (
      select 1 from public.shared_binders b
      where b.id = binder_id and b.owner_id = auth.uid()
    )
    or (
      -- self-join is handled by RPC; allow owner row on create
      user_id = auth.uid()
      and role = 'owner'
      and exists (
        select 1 from public.shared_binders b
        where b.id = binder_id and b.owner_id = auth.uid()
      )
    )
  );

create policy "binder_members_delete_owner_or_self"
  on public.binder_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.shared_binders b
      where b.id = binder_id and b.owner_id = auth.uid()
    )
  );

-- Join via invite token
create or replace function public.join_shared_binder(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Invalid invite token';
  end if;

  select id into bid
  from public.shared_binders
  where invite_token = trim(p_token);

  if bid is null then
    raise exception 'Invite not found or disabled';
  end if;

  insert into public.binder_members (binder_id, user_id, role)
  values (bid, uid, 'editor')
  on conflict (binder_id, user_id) do nothing;

  return bid;
end;
$$;

revoke all on function public.join_shared_binder(text) from public;
grant execute on function public.join_shared_binder(text) to authenticated;

-- Owner invites a friend (must be someone the owner follows)
create or replace function public.invite_friend_to_binder(p_binder_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.shared_binders b
    where b.id = p_binder_id and b.owner_id = uid
  ) then
    raise exception 'Only the owner can invite';
  end if;

  if p_friend_id = uid then
    raise exception 'Cannot invite yourself';
  end if;

  if not exists (
    select 1 from public.follows f
    where f.follower_id = uid and f.following_id = p_friend_id
  ) then
    raise exception 'You can only invite people you follow';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_friend_id) then
    raise exception 'User not found';
  end if;

  insert into public.binder_members (binder_id, user_id, role)
  values (p_binder_id, p_friend_id, 'editor')
  on conflict (binder_id, user_id) do nothing;
end;
$$;

revoke all on function public.invite_friend_to_binder(uuid, uuid) from public;
grant execute on function public.invite_friend_to_binder(uuid, uuid) to authenticated;

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.shared_binders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
