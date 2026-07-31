-- Harden share_links: owners manage rows; public reads only via token RPC.
-- Harden shared_binders: members cannot change owner_id / invite_token.

-- 1) share_links: replace open SELECT with owner-only
drop policy if exists "share_links_select_public" on public.share_links;

create policy "share_links_select_own"
  on public.share_links for select
  using (auth.uid() = owner_id);

create or replace function public.get_share_link(p_token text)
returns setof public.share_links
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return;
  end if;
  return query
    select *
    from public.share_links
    where token = trim(p_token)
    limit 1;
end;
$$;

revoke all on function public.get_share_link(text) from public;
grant execute on function public.get_share_link(text) to anon, authenticated;

-- 2) shared_binders: prevent members from hijacking ownership / invites
create or replace function public.protect_shared_binder_sensitive()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Cannot change owner_id';
  end if;
  if new.invite_token is distinct from old.invite_token
     and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the owner can change invite_token';
  end if;
  return new;
end;
$$;

drop trigger if exists shared_binders_protect_sensitive on public.shared_binders;
create trigger shared_binders_protect_sensitive
  before update on public.shared_binders
  for each row
  execute function public.protect_shared_binder_sensitive();
