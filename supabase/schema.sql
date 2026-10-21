-- Run ONCE on a new Supabase project using the SQL Editor.
begin;
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60)
);
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  owner_id uuid not null references auth.users,
  created_at timestamptz not null default now()
);
create table public.team_members (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key(team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique(team_id, name)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  user_id uuid not null references auth.users,
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  attachment_name text check (char_length(attachment_name) <= 255),
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) > 0 or attachment_path is not null),
  check ((attachment_path is null) = (attachment_name is null))
);
create index messages_channel_time_idx on public.messages(channel_id, created_at desc);
create table public.team_invites (
  token uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
  expires_at timestamptz not null default now() + interval '24 hours'
);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Teammate'),60));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also populate any users created before this migration.
insert into public.profiles(id,display_name) select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),split_part(email,'@',1),'Teammate'),60) from auth.users on conflict do nothing;

create function public.is_team_member(target_team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.team_members where team_id=target_team and user_id=(select auth.uid()));
$$;
create function public.owns_team(target_team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.teams where id=target_team and owner_id=(select auth.uid()));
$$;
create function public.can_access_channel(target_channel uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.channels where id=target_channel and public.is_team_member(team_id));
$$;
create function public.shares_team(target_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select target_user=(select auth.uid()) or exists(select 1 from public.team_members a join public.team_members b using(team_id) where a.user_id=(select auth.uid()) and b.user_id=target_user);
$$;
-- Path format: team/channel/uploader/random-id. Compare text rather than casting untrusted paths.
create function public.can_access_file(object_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.channels c where c.id::text=split_part(object_name,'/',2) and c.team_id::text=split_part(object_name,'/',1) and public.is_team_member(c.team_id));
$$;

create function public.create_team(team_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.teams(name,owner_id) values(trim(team_name),auth.uid()) returning id into team;
  insert into public.team_members(team_id,user_id) values(team,auth.uid());
  insert into public.channels(team_id,name) values(team,'General');
  return team;
end; $$;
create function public.create_invite(target_team uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare invite uuid;
begin
  if not public.owns_team(target_team) then raise exception 'Only the team owner can invite'; end if;
  delete from public.team_invites where team_id=target_team and expires_at<now();
  insert into public.team_invites(team_id) values(target_team) returning token into invite;
  return invite;
end; $$;
create function public.join_team(invite_token uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  -- DELETE ... RETURNING makes redemption single-use even under concurrent requests.
  delete from public.team_invites where token=invite_token and expires_at>now() returning team_id into team;
  if team is null then raise exception 'Invitation is invalid, expired, or already used'; end if;
  insert into public.team_members(team_id,user_id) values(team,auth.uid()) on conflict do nothing;
  return team;
end; $$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.team_invites enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(public.shares_team(id));
create policy teams_read on public.teams for select to authenticated using(public.is_team_member(id));
create policy members_read on public.team_members for select to authenticated using(public.is_team_member(team_id));
create policy channels_read on public.channels for select to authenticated using(public.is_team_member(team_id));
create policy channels_create on public.channels for insert to authenticated with check(public.owns_team(team_id));
create policy messages_read on public.messages for select to authenticated using(public.can_access_channel(channel_id));
create policy messages_create on public.messages for insert to authenticated with check (
  user_id=(select auth.uid()) and public.can_access_channel(channel_id)
  and (attachment_path is null or (
    public.can_access_file(attachment_path)
    and split_part(attachment_path,'/',2)=channel_id::text
    and split_part(attachment_path,'/',3)=(select auth.uid())::text
    and exists(select 1 from storage.objects where bucket_id='attachments' and name=attachment_path)
  ))
);
-- No direct invite/member mutation or team insertion: only scoped RPCs above.
revoke all on public.profiles, public.teams, public.team_members, public.channels, public.messages, public.team_invites from anon, authenticated;
grant select on public.profiles, public.teams, public.team_members, public.channels, public.messages to authenticated;
grant insert(team_id,name) on public.channels to authenticated;
grant insert(channel_id,user_id,body,attachment_path,attachment_name) on public.messages to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_team_member(uuid), public.owns_team(uuid), public.can_access_channel(uuid), public.shares_team(uuid), public.can_access_file(text), public.create_team(text), public.create_invite(uuid), public.join_team(uuid) from public, anon;
grant execute on function public.is_team_member(uuid), public.owns_team(uuid), public.can_access_channel(uuid), public.shares_team(uuid), public.can_access_file(text), public.create_team(text), public.create_invite(uuid), public.join_team(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('attachments','attachments',false,10485760);
create policy attachments_read on storage.objects for select to authenticated using(bucket_id='attachments' and public.can_access_file(name));
create policy attachments_upload on storage.objects for insert to authenticated with check(bucket_id='attachments' and public.can_access_file(name) and split_part(name,'/',3)=(select auth.uid())::text);
create policy attachments_cleanup on storage.objects for delete to authenticated using(bucket_id='attachments' and split_part(name,'/',3)=(select auth.uid())::text and public.can_access_file(name));
alter publication supabase_realtime add table public.messages, public.channels;
commit;
