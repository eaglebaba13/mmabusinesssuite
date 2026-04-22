

## Problem

Your app has no UI to assign roles. Roles only get inserted via SQL migrations, so any new signup (like `remedystore01@gmail.com`) lands with whatever default role the trigger gives them (currently `sales`) and the sidebar hides Academy / Inventory / Finance / Webinars / etc.

Current state in DB:
- `lwillshivansh@gmail.com` → `super_admin` ✅
- `vikas@mallofsalon.com` → `sales`
- `remedystore01@gmail.com` → `sales` ← this is you

## Solution — Two parts

### Part 1: Immediate fix (one-click)
Promote `remedystore01@gmail.com` to `super_admin` via a migration so you can see and manage everything right now.

### Part 2: Build a proper "Team & Roles" admin UI
Add a new section inside **Settings** (visible only to `super_admin` / `founder`) where admins can:

1. **List all users** — full name, email, current roles, joined date
2. **Assign / revoke roles** — multi-select chips for the 13 app roles (`super_admin`, `founder`, `franchisee`, `sales`, `accounts`, `inventory`, `academy_admin`, `webinar`, `hr`, `white_label`, `trainer`, `support`, `package_sales`)
3. **Search & filter** by name / email / role
4. **Safety guards**:
   - Cannot revoke your own `super_admin` role (prevents lockout)
   - Confirmation dialog before granting `super_admin` / `founder`
   - Toast feedback on every action

### Where it lives
New route: `/app/settings/team` (child of existing `app.settings.tsx` layout) with a tab switcher at the top of Settings → **Profile | Workspace | Team & Roles**.

Sidebar entry stays under "Settings" — no new top-level item needed.

## Technical Details

**Migration (one file):**
```sql
-- 1. Promote remedystore01 to super_admin (idempotent)
insert into public.user_roles (user_id, role)
select id, 'super_admin'::app_role from auth.users
where email = 'remedystore01@gmail.com'
on conflict (user_id, role) do nothing;

-- 2. Admin RPCs (SECURITY DEFINER, gated by has_role check)
create or replace function public.admin_list_users()
returns table(id uuid, email text, full_name text, phone text,
              created_at timestamptz, roles app_role[])
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'founder')) then
    raise exception 'Forbidden';
  end if;
  return query
    select p.id, p.email, p.full_name, p.phone, p.created_at,
           coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}')
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    group by p.id order by p.created_at desc;
end$$;

create or replace function public.admin_grant_role(_user_id uuid, _role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'founder')) then
    raise exception 'Forbidden';
  end if;
  insert into public.user_roles(user_id, role) values (_user_id, _role)
  on conflict do nothing;
end$$;

create or replace function public.admin_revoke_role(_user_id uuid, _role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'super_admin') or has_role(auth.uid(),'founder')) then
    raise exception 'Forbidden';
  end if;
  -- prevent self-lockout
  if _user_id = auth.uid() and _role = 'super_admin' then
    raise exception 'Cannot revoke your own super_admin role';
  end if;
  delete from public.user_roles where user_id=_user_id and role=_role;
end$$;
```

**Frontend files:**
- **Edit** `src/routes/app.settings.tsx` → convert into a tab layout with `Outlet` (Profile / Workspace / Team)
- **Create** `src/routes/app.settings.index.tsx` → existing Profile + Workspace content
- **Create** `src/routes/app.settings.team.tsx` → new Team & Roles page (admin-gated, redirects non-admins)

**Team page UX:**
- Table: Avatar | Name + Email | Current roles (badges) | Joined | Actions
- Click any user → side sheet with multi-select role checkboxes + Save
- Search box at top, role filter dropdown
- Empty state if no other users yet

**Files unchanged:** Sidebar (Settings link already there), all other modules.

## Outcome

After this turn:
1. You log in as `remedystore01@gmail.com` and immediately see every section in the sidebar.
2. Go to **Settings → Team & Roles** to grant/revoke any role for any user from the UI — no more SQL needed.

