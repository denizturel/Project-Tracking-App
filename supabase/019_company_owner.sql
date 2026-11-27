-- Doneva: company level. Safe to run twice.
--   Owner:         admin power everywhere, and the only one who makes company-level changes
--                  (company name, who is a company admin, people's company status).
--   Company admin: creates, edits and deletes projects, and is an admin inside every project.
alter policy companies_update on public.companies
  using (public.company_role_of(id) = 'owner')
  with check (public.company_role_of(id) = 'owner');

alter policy company_members_insert on public.company_members
  with check (public.company_role_of(company_id) = 'owner');
alter policy company_members_update on public.company_members
  using (public.company_role_of(company_id) = 'owner')
  with check (public.company_role_of(company_id) = 'owner');
alter policy company_members_delete on public.company_members
  using (public.company_role_of(company_id) = 'owner' or user_id = (select auth.uid()));

-- Deleting a project is for the owner and company admins, not for a project's own admin.
alter policy projects_delete on public.projects
  using (public.is_company_admin(company_id));

-- Invitations: only the owner can invite someone straight in as a company admin.
alter policy invitations_all on public.invitations
  with check (invited_by = (select auth.uid())
              and (public.company_role_of(company_id) = 'owner'
                   or ((public.is_company_admin(company_id)
                        or (project_id is not null and public.is_project_admin(project_id)))
                       and company_role in ('member', 'guest'))));
