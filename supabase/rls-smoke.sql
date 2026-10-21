-- Optional: run the COMPLETE file as postgres in Supabase SQL Editor after schema.sql.
-- All data, including test users and helper objects, is rolled back on success.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','gather-owner-test@example.invalid','{"display_name":"Test Owner"}'),
('10000000-0000-4000-8000-000000000002','gather-member-test@example.invalid','{"display_name":"Test Member"}'),
('10000000-0000-4000-8000-000000000003','gather-outsider-test@example.invalid','{"display_name":"Test Outsider"}');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.create_team('Authorization smoke test');
select public.create_invite(id) from public.teams where name='Authorization smoke test';
reset role;
-- Persist generated IDs in transaction-local settings before changing identities.
select set_config('test.team',(select id::text from public.teams where name='Authorization smoke test' and owner_id='10000000-0000-4000-8000-000000000001'),true);
select set_config('test.channel',(select id::text from public.channels where team_id=current_setting('test.team')::uuid),true);
select set_config('test.invite',(select token::text from public.team_invites where team_id=current_setting('test.team')::uuid),true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
  assert (select count(*)=0 from public.teams where id=current_setting('test.team')::uuid), 'Outsider can see team';
  assert not public.can_access_channel(current_setting('test.channel')::uuid), 'Outsider can access channel';
  assert not public.can_access_file(current_setting('test.team')||'/'||current_setting('test.channel')||'/x/y'), 'Outsider can read attachment';
  begin
    insert into public.messages(channel_id,user_id,body) values(current_setting('test.channel')::uuid,auth.uid(),'Unauthorized');
    raise exception 'Outsider message unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.join_team(current_setting('test.invite')::uuid);
do $$ begin
  assert public.can_access_channel(current_setting('test.channel')::uuid), 'Invited member cannot access channel';
  begin
    perform public.join_team(current_setting('test.invite')::uuid);
    raise exception 'Invitation reuse unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Invitation is invalid, expired, or already used' then raise; end if;
  end;
  begin
    perform public.create_invite(current_setting('test.team')::uuid);
    raise exception 'Member invitation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Only the team owner can invite' then raise; end if;
  end;
  begin
    insert into public.messages(channel_id,user_id,body) values(current_setting('test.channel')::uuid,'10000000-0000-4000-8000-000000000001','Spoofed author');
    raise exception 'Author spoof unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.messages(channel_id,user_id,body) values(current_setting('test.channel')::uuid,auth.uid(),'Authorized message');
insert into storage.objects(bucket_id,name) values('attachments',current_setting('test.team')||'/'||current_setting('test.channel')||'/'||auth.uid()::text||'/test-file');
insert into public.messages(channel_id,user_id,body,attachment_path,attachment_name) values(current_setting('test.channel')::uuid,auth.uid(),'',current_setting('test.team')||'/'||current_setting('test.channel')||'/'||auth.uid()::text||'/test-file','test.txt');
do $$ begin
  assert (select count(*)=2 from public.messages where channel_id=current_setting('test.channel')::uuid), 'Member messages missing';
  assert (select count(*)=1 from storage.objects where bucket_id='attachments' and name like current_setting('test.team')||'/%'), 'Member attachment missing';
  begin
    insert into storage.objects(bucket_id,name) values('attachments',current_setting('test.team')||'/'||current_setting('test.channel')||'/10000000-0000-4000-8000-000000000001/spoof');
    raise exception 'Uploader spoof unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.channels(team_id,name) values(current_setting('test.team')::uuid,'Unauthorized channel');
    raise exception 'Member channel creation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  assert (select count(*)=0 from public.messages where channel_id=current_setting('test.channel')::uuid), 'Outsider can see messages';
  assert (select count(*)=0 from storage.objects where name like current_setting('test.team')||'/%'), 'Outsider can see stored attachment';
  assert (select count(*)=0 from public.profiles where id='10000000-0000-4000-8000-000000000001'), 'Outsider can see another profile';
end $$;
reset role;
rollback;
