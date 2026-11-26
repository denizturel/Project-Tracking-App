-- Doneva permission tests. Everything runs inside one transaction that is rolled back at the end,
-- so no pretend person, company or message is kept. Run it in the Supabase SQL Editor; the result
-- is one row per test with pass = true/false (null = for information only).
begin;
create temp table r (n serial, who text, label text, got text, want text, pass boolean) on commit drop;

create function pg_temp.q(who uuid, who_name text, label text, stmt text, want text) returns void language plpgsql as $f$
declare got text; n bigint;
begin
  perform set_config('request.jwt.claims',
    case when who is null then '{"role":"anon"}' else json_build_object('sub', who, 'role', 'authenticated')::text end, true);
  begin
    if who is null then set local role anon; else set local role authenticated; end if;
    if stmt ~* '^\s*select' then execute stmt into got;
    else execute stmt; get diagnostics n = row_count; got := 'rows ' || n; end if;
    reset role;
  exception when others then
    reset role;
    got := 'ERROR ' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);
  insert into r (who, label, got, want, pass) values (who_name, label, got, want,
    case want when '?' then null
              when 'ERROR' then got like 'ERROR%'
              when 'NOERR' then got is null or got not like 'ERROR%'
              when 'DENY' then got like 'ERROR%' or got = 'rows 0'
              when 'DENY0' then got like 'ERROR%' or got = '0'
              else got is not distinct from want end);
end $f$;

-- Pretend people
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.mail,
       json_build_object('full_name', u.name, 'company_name', 'Test', 'position', 'Tester', 'username', u.uname)::jsonb, now(), now()
from (values ('a0000000-0000-4000-8000-000000000001'::uuid, 'o@test.invalid', 'Owner', 'owner.one'), ('a0000000-0000-4000-8000-000000000002', 'a@test.invalid', 'Admin', 'admin.one'),
             ('a0000000-0000-4000-8000-000000000003', 'm@test.invalid', 'Manager', 'manager.one'), ('a0000000-0000-4000-8000-000000000004', 's1@test.invalid', 'Staff One', 'staff.one'),
             ('a0000000-0000-4000-8000-000000000005', 's2@test.invalid', 'Staff Two', 'staff.two'), ('a0000000-0000-4000-8000-000000000006', 'x@test.invalid', 'Outsider X', 'out.x'),
             ('a0000000-0000-4000-8000-000000000007', 'y@test.invalid', 'Outsider Y', 'out.y'), ('a0000000-0000-4000-8000-000000000008', 'z@test.invalid', 'Outsider Z', 'out.z')) as u(id, mail, name, uname);

-- One company, one project, two groups with one team each
insert into public.companies (id, name, created_by) values ('c0000000-0000-4000-8000-000000000001', 'Test Company QA', 'a0000000-0000-4000-8000-000000000001');
insert into public.company_members (company_id, user_id, role)
  values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'member'), ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'guest'), ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'guest'), ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'guest') on conflict do nothing;
insert into public.projects (id, company_id, name, created_by) values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Test Project', 'a0000000-0000-4000-8000-000000000001');
insert into public.project_members (project_id, user_id, role)
  values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'admin'), ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'admin'), ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'member'), ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'member'), ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'member') on conflict do nothing;
insert into public.subgroups (id, project_id, parent_id, name) values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', null, 'Group 1'), ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', null, 'Group 2');
insert into public.subgroups (id, project_id, parent_id, name) values ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Team 1'), ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Team 2');
insert into public.subgroup_members (subgroup_id, user_id, role) values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'manager'), ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'member'), ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 'member');
insert into public.tasks (id, project_id, subgroup_id, title, created_by) values ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', null, 'Project task', 'a0000000-0000-4000-8000-000000000001'), ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'Team 1 task', 'a0000000-0000-4000-8000-000000000001'), ('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'Team 2 task', 'a0000000-0000-4000-8000-000000000001');
insert into public.questions (id, project_id, subgroup_id, title, asked_by) values ('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'Team 1 question', 'a0000000-0000-4000-8000-000000000004'), ('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'Team 2 question', 'a0000000-0000-4000-8000-000000000005');
insert into public.messages (id, conversation_id, sender_id, body, created_at)
  values ('f0000000-0000-4000-8000-000000000010', (select id from public.conversations where subgroup_id = 'e0000000-0000-4000-8000-000000000004'), 'a0000000-0000-4000-8000-000000000005', 'old message', now() - interval '2 days');
insert into r (who, label, got, want, pass)
  select 'setup', 'Each project, group and team got its own chat', count(*)::text, '5', count(*) = 5 from public.conversations where project_id = 'd0000000-0000-4000-8000-000000000001';

select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff sees own team and its group only (2 of 4 places)', $s$select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '2');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager sees own group and its teams only (2 of 4)', $s$select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '2');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'Project admin sees every group and team (4)', $s$select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '4');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Company owner sees every group and team (4)', $s$select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '4');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider sees no groups', $s$select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider sees no project', $s$select count(*) from public.projects where id = 'd0000000-0000-4000-8000-000000000001'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider sees no company', $s$select count(*) from public.companies where id = 'c0000000-0000-4000-8000-000000000001'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000008', 'Outsider', 'Outsider sees nobody elses profile', $s$select count(*) from public.profiles where id <> 'a0000000-0000-4000-8000-000000000008'$s$, '0');
select pg_temp.q(null, 'Not signed in', 'Not signed in: sees no profiles', $s$select count(*) from public.profiles$s$, 'DENY0');
select pg_temp.q(null, 'Not signed in', 'Not signed in: sees no companies', $s$select count(*) from public.companies$s$, 'DENY0');
select pg_temp.q(null, 'Not signed in', 'Not signed in: sees no messages', $s$select count(*) from public.messages$s$, 'DENY0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff sees the task of own team', $s$select count(*) from public.tasks where id = 'f0000000-0000-4000-8000-000000000002'$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff does not see a task of another team', $s$select count(*) from public.tasks where id = 'f0000000-0000-4000-8000-000000000003'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager sees tasks of own groups team', $s$select count(*) from public.tasks where id = 'f0000000-0000-4000-8000-000000000002'$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager does not see tasks of another group', $s$select count(*) from public.tasks where id = 'f0000000-0000-4000-8000-000000000003'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff and project-wide task (info)', $s$select count(*) from public.tasks where id = 'f0000000-0000-4000-8000-000000000001'$s$, '?');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff and questions of other teams (info: design says all Q&A is shared)', $s$select count(*) from public.questions where id = 'f0000000-0000-4000-8000-000000000005'$s$, '?');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff sees the project chat', $s$select count(*) from public.conversations where kind = 'project' and project_id = 'd0000000-0000-4000-8000-000000000001'$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff does not see another teams chat', $s$select count(*) from public.conversations where subgroup_id = 'e0000000-0000-4000-8000-000000000004'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot read another teams messages', $s$select count(*) from public.messages where id = 'f0000000-0000-4000-8000-000000000010'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot create a task', $s$insert into public.tasks (project_id, subgroup_id, title) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'x')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager creates a task in own groups team', $s$insert into public.tasks (project_id, subgroup_id, title) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'by manager')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot create a task in another group', $s$insert into public.tasks (project_id, subgroup_id, title) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'x')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot tick off a task', $s$update public.tasks set completed_at = now() where id = 'f0000000-0000-4000-8000-000000000002'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager ticks off a task of own group', $s$update public.tasks set completed_at = now() where id = 'f0000000-0000-4000-8000-000000000002'$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot make themselves project admin', $s$update public.project_members set role = 'admin' where project_id = 'd0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000004'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot make themselves project admin', $s$update public.project_members set role = 'admin' where project_id = 'd0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000003'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager creates a team in own group', $s$insert into public.subgroups (project_id, parent_id, name) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'New team')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot create a new group', $s$insert into public.subgroups (project_id, name) values ('d0000000-0000-4000-8000-000000000001', 'New group')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot create a team in another group', $s$insert into public.subgroups (project_id, parent_id, name) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'x')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot give statuses', $s$update public.subgroup_members set role = 'manager' where subgroup_id = 'e0000000-0000-4000-8000-000000000003' and user_id = 'a0000000-0000-4000-8000-000000000004'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager adds a project member to own team', $s$insert into public.subgroup_members (subgroup_id, user_id) values ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot add people to another groups team', $s$insert into public.subgroup_members (subgroup_id, user_id) values ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot add people to a team', $s$insert into public.subgroup_members (subgroup_id, user_id) values ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'Project admin (not company admin) cannot change company statuses', $s$update public.company_members set role = 'admin' where company_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000004'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'Project admin (not company admin) cannot create a project', $s$insert into public.projects (company_id, name) values ('c0000000-0000-4000-8000-000000000001', 'x')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Owner creates a project', $s$insert into public.projects (company_id, name) values ('c0000000-0000-4000-8000-000000000001', 'Second project')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Owner changes a company status', $s$update public.company_members set role = 'member' where company_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000004'$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot rename the project', $s$update public.projects set name = 'hacked' where id = 'd0000000-0000-4000-8000-000000000001'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot rename a group', $s$update public.subgroups set name = 'hacked' where id = 'e0000000-0000-4000-8000-000000000001'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider cannot add themselves to the project', $s$insert into public.project_members (project_id, user_id) values ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider cannot add themselves to the company', $s$insert into public.company_members (company_id, user_id, role) values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'admin')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff asks a question in own team', $s$insert into public.questions (project_id, subgroup_id, title) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'How?')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot ask in another team', $s$insert into public.questions (project_id, subgroup_id, title) values ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'How?')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Someone else posts a solution', $s$insert into public.solutions (question_id, body) values ('f0000000-0000-4000-8000-000000000004', 'Do this')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Only the asker marks a solution as worked', $s$select public.mark_solution((select id from public.solutions where question_id = 'f0000000-0000-4000-8000-000000000004' limit 1), true)$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'The asker marks the solution as worked', $s$select public.mark_solution((select id from public.solutions where question_id = 'f0000000-0000-4000-8000-000000000004' limit 1), true)$s$, 'NOERR');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff writes in own team chat', $s$insert into public.messages (id, conversation_id, body) values ('f0000000-0000-4000-8000-000000000011', (select id from public.conversations where subgroup_id = 'e0000000-0000-4000-8000-000000000003'), 'hello')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot write in another teams chat', $s$insert into public.messages (conversation_id, body) values ((select id from public.conversations where subgroup_id = 'e0000000-0000-4000-8000-000000000004'), 'x')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Writer edits own fresh message', $s$update public.messages set body = 'hello!' where id = 'f0000000-0000-4000-8000-000000000011'$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Another person replies', $s$insert into public.messages (conversation_id, body, created_at) values ((select id from public.conversations where subgroup_id = 'e0000000-0000-4000-8000-000000000003'), 'reply', clock_timestamp())$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Writer cannot edit after someone replied', $s$update public.messages set body = 'changed' where id = 'f0000000-0000-4000-8000-000000000011'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Writer cannot delete after someone replied', $s$select public.delete_message('f0000000-0000-4000-8000-000000000011')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000003', 'Manager', 'Manager cannot edit someone elses message', $s$update public.messages set body = 'changed' where id = 'f0000000-0000-4000-8000-000000000011'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'Project admin can still moderate a message', $s$select public.delete_message('f0000000-0000-4000-8000-000000000011')$s$, 'NOERR');
select pg_temp.q('a0000000-0000-4000-8000-000000000005', 'Staff 2', 'Writer cannot edit a message older than 24 hours', $s$update public.messages set body = 'changed' where id = 'f0000000-0000-4000-8000-000000000010'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Private chat with someone in the same project', $s$select public.start_direct_chat('a0000000-0000-4000-8000-000000000002') is not null$s$, 'true');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider cannot start a private chat', $s$select public.start_direct_chat('a0000000-0000-4000-8000-000000000004')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Outsider asks to connect', $s$insert into public.connections (addressee) values ('a0000000-0000-4000-8000-000000000004')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Asker cannot accept their own request', $s$update public.connections set status = 'accepted' where requester = 'a0000000-0000-4000-8000-000000000006'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'No private chat while the request is pending', $s$select public.start_direct_chat('a0000000-0000-4000-8000-000000000004')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'The asked person accepts', $s$update public.connections set status = 'accepted' where addressee = 'a0000000-0000-4000-8000-000000000004'$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Connected people can start a private chat', $s$select public.start_direct_chat('a0000000-0000-4000-8000-000000000004') is not null$s$, 'true');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Connected person writes a private message', $s$insert into public.messages (conversation_id, body) values (public.start_direct_chat('a0000000-0000-4000-8000-000000000004'), 'hi')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'A third person cannot read that private chat', $s$select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.kind = 'direct' and m.body = 'hi'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Even the owner cannot read that private chat', $s$select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.kind = 'direct' and m.body = 'hi'$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'The receiver reads it and sees 1 unread', $s$select coalesce(sum(unread), 0) from public.my_direct_chats()$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Block a person', $s$insert into public.user_blocks (blocked) values ('a0000000-0000-4000-8000-000000000006')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Blocked person cannot write', $s$insert into public.messages (conversation_id, body) values (public.start_direct_chat('a0000000-0000-4000-8000-000000000004'), 'again')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Blocked person cannot see that they are blocked', $s$select count(*) from public.user_blocks$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Report a person', $s$insert into public.user_reports (reported, reason) values ('a0000000-0000-4000-8000-000000000006', 'spam messages')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Nobody can read reports from the app', $s$select count(*) from public.user_reports$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Reporter cannot read reports either', $s$select count(*) from public.user_reports$s$, '0');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'A taken username shows as not free', $s$select public.username_available('staff.one')$s$, 'false');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Cannot take someone elses username', $s$update public.profiles set username = 'staff.one' where id = 'a0000000-0000-4000-8000-000000000006'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Cannot save a username with spaces or capitals', $s$update public.profiles set username = 'Bad Name' where id = 'a0000000-0000-4000-8000-000000000006'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Cannot change someone elses profile', $s$update public.profiles set full_name = 'hacked' where id = 'a0000000-0000-4000-8000-000000000004'$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'Find a person by exact username', $s$select count(*) from public.find_person_by_username('staff.one')$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'Email search is switched off', $s$select count(*) from public.find_person_by_email('s1@test.invalid')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'Find a company by name', $s$select count(*) from public.search_companies('Test Company QA')$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'Ask to join a company', $s$insert into public.company_join_requests (company_id) values ('c0000000-0000-4000-8000-000000000001')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'Cannot approve own request', $s$select public.decide_join_request((select id from public.company_join_requests where user_id = 'a0000000-0000-4000-8000-000000000007'), 'member')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'A normal member cannot approve requests', $s$select public.decide_join_request((select id from public.company_join_requests where user_id = 'a0000000-0000-4000-8000-000000000007'), 'member')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Owner sees the request', $s$select count(*) from public.company_join_requests where company_id = 'c0000000-0000-4000-8000-000000000001' and status = 'pending'$s$, '1');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Owner lets the person in as guest', $s$select public.decide_join_request((select id from public.company_join_requests where user_id = 'a0000000-0000-4000-8000-000000000007'), 'guest')$s$, 'NOERR');
select pg_temp.q('a0000000-0000-4000-8000-000000000007', 'Outsider', 'The new guest is in the company but sees no project yet', $s$select (select count(*) from public.company_members where company_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000007') || '/' || (select count(*) from public.projects where company_id = 'c0000000-0000-4000-8000-000000000001')$s$, '1/0');
select pg_temp.q('a0000000-0000-4000-8000-000000000004', 'Staff', 'Staff cannot create an invite link', $s$insert into public.project_links (project_id) values ('d0000000-0000-4000-8000-000000000001')$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Admin turns on the invite link', $s$insert into public.project_links (project_id, token) values ('d0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000009')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000008', 'Outsider', 'A person with the link joins the project', $s$select public.join_project_by_link('f0000000-0000-4000-8000-000000000009') = 'd0000000-0000-4000-8000-000000000001'$s$, 'true');
select pg_temp.q('a0000000-0000-4000-8000-000000000008', 'Outsider', 'That person is staff and sees the project but no team yet', $s$select (select count(*) from public.projects where id = 'd0000000-0000-4000-8000-000000000001') || '/' || (select count(*) from public.subgroups where project_id = 'd0000000-0000-4000-8000-000000000001')$s$, '1/0');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'Admin turns the link off', $s$update public.project_links set enabled = false where project_id = 'd0000000-0000-4000-8000-000000000001'$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'A switched-off link lets nobody in', $s$select public.join_project_by_link('f0000000-0000-4000-8000-000000000009')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'A guessed link lets nobody in', $s$select public.join_project_by_link('00000000-0000-4000-8000-000000000000')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Create company space 1 of 3 allowed per day', $s$insert into public.companies (name) values ('Spam 1')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Create company space 2 of 3 allowed per day', $s$insert into public.companies (name) values ('Spam 2')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'Create company space 3 of 3 allowed per day', $s$insert into public.companies (name) values ('Spam 3')$s$, 'rows 1');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'A 4th company space on the same day is refused', $s$insert into public.companies (name) values ('Spam 4')$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000006', 'Outsider', 'A very long message is refused', $s$insert into public.messages (conversation_id, body) values ((select id from public.conversations where kind = 'direct' limit 1), repeat('x', 9000))$s$, 'DENY');
select pg_temp.q('a0000000-0000-4000-8000-000000000001', 'Owner', 'The only owner cannot delete their account while others are in the company', $s$select public.delete_my_account()$s$, 'ERROR');
select pg_temp.q('a0000000-0000-4000-8000-000000000005', 'Staff 2', 'A normal person deletes their account', $s$select public.delete_my_account()$s$, 'NOERR');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'Their name is gone but their old message stays', $s$select (select full_name from public.profiles where id = 'a0000000-0000-4000-8000-000000000005') || '/' || (select count(*) from public.messages where id = 'f0000000-0000-4000-8000-000000000010')$s$, 'Deleted user/1');
select pg_temp.q('a0000000-0000-4000-8000-000000000002', 'Project admin', 'They are out of the project', $s$select count(*) from public.project_members where project_id = 'd0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000005'$s$, '0');

select n, who, label, got, want, pass from r order by (pass is true), n;
rollback;
