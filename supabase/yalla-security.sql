-- =====================================================================
--  YALLA NEZAKER — security fix.  Run in Supabase → SQL Editor.
--  Replaces "password typed in the code / plain-text passwords in a table"
--  with Supabase Auth + database rules (RLS).
--
--  ORDER:  PART 1 → create your Super Admin (steps below) → log in → PART 2
-- =====================================================================

-- ---------------------------- PART 1 ---------------------------------
alter table public.admins add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

-- the old plain-text column must stop being required (it is dropped in PART 2)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='admins' and column_name='password') then
    alter table public.admins alter column password drop not null;
  end if;
end $$;

create or replace function public.is_yalla_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
create or replace function public.is_yalla_super() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'super_admin')
$$;

-- wipe every existing policy on the content tables + admins, then set clean ones
do $$
declare t text; r record;
begin
  foreach t in array array['courses','exams','questions','admins'] loop
    execute format('alter table public.%I enable row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- students can READ courses / exams / questions; only admins can WRITE
create policy courses_read   on public.courses   for select using (true);
create policy exams_read     on public.exams     for select using (true);
create policy questions_read on public.questions for select using (true);
create policy courses_write   on public.courses   for all to authenticated using (public.is_yalla_admin()) with check (public.is_yalla_admin());
create policy exams_write     on public.exams     for all to authenticated using (public.is_yalla_admin()) with check (public.is_yalla_admin());
create policy questions_write on public.questions for all to authenticated using (public.is_yalla_admin()) with check (public.is_yalla_admin());

-- the admins table is invisible to the public; an admin sees only their own row, the super admin sees all.
-- (no write policy: admins are created/deleted by the Cloudflare Function with the service key)
create policy admins_read on public.admins for select to authenticated using (user_id = auth.uid() or public.is_yalla_super());
revoke all on public.admins from anon;

-- image uploads (storage bucket "images"): everyone can view, only admins can change
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual,'') ilike '%''images''%' or coalesce(with_check,'') ilike '%''images''%') loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
create policy "images read"         on storage.objects for select using (bucket_id = 'images');
create policy "images admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'images' and public.is_yalla_admin());
create policy "images admin update" on storage.objects for update to authenticated using (bucket_id = 'images' and public.is_yalla_admin());
create policy "images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'images' and public.is_yalla_admin());

-- ---- CREATE YOUR SUPER ADMIN (do this now, before PART 2) ----
-- 1) Supabase → Authentication → Users → Add user → Create new user
--      Email:    01551711514@yalla.vet3-mnu.pages.dev      (your phone @ yalla.vet3-mnu.pages.dev)
--      Password: a NEW strong password (NOT admin123)       ✔ Auto Confirm User
-- 2) run this (change phone/name if needed):
--
--   delete from public.admins where phone = '01551711514';
--   insert into public.admins (name, phone, role, user_id)
--   select 'Super Admin', '01551711514', 'super_admin', id from auth.users where email = '01551711514@yalla.vet3-mnu.pages.dev';
--
-- 3) Deploy the new code, log in at /yalla-nezaker/admin/login with the phone + new password.
-- 4) Add the other admins from the "المستخدمين" page (they get real accounts).

-- ---------------------------- PART 2 ---------------------------------
-- Run only AFTER you logged in successfully with the new account:
--   alter table public.admins drop column if exists password;

-- Also recommended: Supabase → Authentication → Providers/Settings → turn OFF "Allow new users to sign up".
