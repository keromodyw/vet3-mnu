-- =====================================================================
--  EL DOF3A EVENTS — database setup (run once in Supabase → SQL Editor)
--  Safe to re-run. Everything lives in its OWN schema "el_dof3a_events",
--  so nothing in "public" (yalla-nezaker) is touched.
--
--  AFTER running this file, expose the schema to the API (one time):
--  Supabase Dashboard → Project Settings → API → "Exposed schemas"
--  → add  el_dof3a_events  (remove movie_day if it is there) → Save.
-- =====================================================================

-- if you already ran the first version (schema "movie_day"), keep its data by renaming it
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'movie_day')
     and not exists (select 1 from pg_namespace where nspname = 'el_dof3a_events') then
    alter schema movie_day rename to el_dof3a_events;
  end if;
end $$;

create schema if not exists el_dof3a_events;
set search_path = el_dof3a_events, public;

-- ---------- tables ----------
create table if not exists students (
  national_id text primary key check (national_id ~ '^[0-9]{14}$'),
  name        text not null,
  academic_no text,
  created_at  timestamptz not null default now()
);
create index if not exists md_students_academic_idx on students(academic_no);

create table if not exists staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text,
  name       text not null,
  role       text not null check (role in ('super_admin','reviewer','scanner')),
  created_at timestamptz not null default now()
);

create table if not exists events (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  venue              text,
  poster_url         text,
  event_at           timestamptz,
  booking_opens_at   timestamptz,          -- null = open as soon as published
  booking_closes_at  timestamptz,
  price              numeric(10,2) not null default 0,
  instapay_phone     text,
  instapay_note      text,
  max_bookings       int check (max_bookings is null or max_bookings >= 0),  -- cap on total bookings (null = every open seat)
  hold_minutes       int not null default 10 check (hold_minutes between 1 and 120),
  published          boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists seats (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  row_label   text not null,
  seat_no     int  not null,
  label       text not null,
  sort_order  int  not null,
  restriction text not null default 'any' check (restriction in ('any','male','female')),
  blocked     boolean not null default false,
  state       text not null default 'free' check (state in ('free','held','taken')),
  held_until  timestamptz,
  unique (event_id, label)
);
create index if not exists md_seats_event_idx on seats(event_id, sort_order);

create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  national_id    text not null references students(national_id),
  seat_id        uuid references seats(id) on delete set null,
  status         text not null check (status in ('awaiting_payment','pending','approved','declined','cancelled','expired')),
  amount         numeric(10,2) not null default 0,
  proof_path     text,
  decline_reason text,
  hold_until     timestamptz,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id),
  scanned_at     timestamptz,
  scanned_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);
-- THE race-condition backstop: the database itself refuses a 2nd active booking
-- for the same seat, and a 2nd active booking for the same student in an event.
create unique index if not exists md_one_per_student on bookings(event_id, national_id)
  where status in ('awaiting_payment','pending','approved');
create unique index if not exists md_one_per_seat on bookings(seat_id)
  where status in ('awaiting_payment','pending','approved');
create index if not exists md_bookings_event_idx on bookings(event_id, status);

-- public, non-sensitive "something changed" table so a student's status page updates instantly
create table if not exists booking_pulse (
  id uuid primary key,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists scans (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  national_id  text,
  student_name text,
  seat_label   text,
  booking_id   uuid,
  result       text not null check (result in ('ok','duplicate','not_found','not_approved','invalid')),
  scanned_by   uuid references auth.users(id),
  scanner_name text,
  scanned_at   timestamptz not null default now()
);
create index if not exists md_scans_event_idx on scans(event_id, scanned_at desc);

-- event options (added in v2; safe on existing installs)
alter table events add column if not exists booking_mode    text    not null default 'seats' check (booking_mode in ('seats','names'));
alter table events add column if not exists payment_required boolean not null default true;
alter table events add column if not exists auto_approve    boolean not null default false;  -- only used when payment_required = false

-- v3: seats live in blocks A/B/C (right / middle / left) and rows; numbering runs across the rows of each block
alter table seats  add column if not exists row_no  int;
alter table seats  add column if not exists section text;
alter table seats  add column if not exists pos     int;     -- position inside the row-block, left → right
alter table events add column if not exists numbering_dir text not null default 'rtl' check (numbering_dir in ('rtl','ltr'));
update seats set row_no = ascii(upper(row_label)) - 64, section = 'B', pos = seat_no where row_no is null;
alter table seats alter column row_no  set not null;
alter table seats alter column section set not null;
alter table seats alter column pos     set not null;
-- ===== custom hall layouts (v4): any block letters, any number of blocks, aisles, saved templates =====
alter table seats add column if not exists section_order int;                       -- left → right position of the block on the map
update seats set section_order = case section when 'C' then 0 when 'B' then 1 when 'A' then 2 else 0 end where section_order is null;   -- halls made before v4 (once)
alter table seats alter column section_order set default 0;
alter table seats alter column section_order set not null;
alter table seats drop constraint if exists seats_section_chk;
alter table seats add constraint seats_section_chk check (section ~ '^[A-Z0-9]{1,3}$');
alter table events add column if not exists layout_spec jsonb;                      -- the design last applied to this event

create table if not exists layouts (                                                -- named designs, reusable in any event
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  spec       jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists layouts_name_idx on layouts (lower(name));
alter table layouts enable row level security;                                      -- no policies: only the functions below can touch it

-- ---------- helpers ----------
create or replace function md_now() returns timestamptz language sql stable as $$ select now() $$;

create or replace function md_role() returns text language sql stable security definer set search_path = el_dof3a_events, public as $$
  select role from staff where user_id = auth.uid()
$$;

-- 13th digit: odd = male, even = female
create or replace function md_gender(nid text) returns text language sql immutable as $$
  select case when substr(nid,13,1)::int % 2 = 1 then 'male' else 'female' end
$$;

-- 2423xxxx → 4th year · 2424 → 3rd · 2425 → 2nd · 2426 → 1st (info + stats only)
create or replace function md_batch(p_acad text) returns text language sql immutable as $$
  select case substr(coalesce(p_acad, ''), 1, 4) when '2423' then 'fourth' when '2424' then 'third' when '2425' then 'second' when '2426' then 'first' else null end
$$;

create or replace function md_booked_count(p_event uuid) returns int language sql stable security definer set search_path = el_dof3a_events, public as $$
  select count(*)::int from bookings
  where event_id = p_event
    and (status in ('pending','approved') or (status = 'awaiting_payment' and hold_until > now()))
$$;

create or replace function md_booking_json(p_id uuid) returns jsonb language sql stable security definer set search_path = el_dof3a_events, public as $$
  select jsonb_build_object(
    'id', b.id, 'event_id', b.event_id, 'status', b.status, 'amount', b.amount,
    'hold_until', b.hold_until, 'submitted_at', b.submitted_at, 'reviewed_at', b.reviewed_at,
    'decline_reason', b.decline_reason, 'scanned_at', b.scanned_at, 'created_at', b.created_at,
    'seat_label', s.label, 'seat_row', s.row_label,
    'event_title', e.title, 'event_venue', e.venue, 'event_at', e.event_at,
    'instapay_phone', e.instapay_phone, 'instapay_note', e.instapay_note,
    'price', case when e.payment_required then e.price else 0 end,
    'payment_required', e.payment_required, 'booking_mode', e.booking_mode, 'hold_minutes', e.hold_minutes,
    'national_id', b.national_id, 'name', st.name, 'academic_no', st.academic_no, 'batch', md_batch(st.academic_no))
  from bookings b
  join events e on e.id = b.event_id
  join students st on st.national_id = b.national_id
  left join seats s on s.id = b.seat_id
  where b.id = p_id
$$;
revoke execute on function md_booking_json(uuid), md_booked_count(uuid) from public, anon, authenticated;

-- pulse trigger
create or replace function md_pulse() returns trigger language plpgsql security definer set search_path = el_dof3a_events, public as $$
begin
  insert into booking_pulse(id, status, updated_at) values (new.id, new.status, now())
  on conflict (id) do update set status = excluded.status, updated_at = now();
  return new;
end $$;
drop trigger if exists md_pulse_trg on bookings;
create trigger md_pulse_trg after insert or update of status on bookings
  for each row execute function md_pulse();

-- ---------- row level security ----------
alter table students      enable row level security;
alter table staff         enable row level security;
alter table events        enable row level security;
alter table seats         enable row level security;
alter table bookings      enable row level security;
alter table booking_pulse enable row level security;
alter table scans         enable row level security;

drop policy if exists md_events_read   on events;
drop policy if exists md_events_write  on events;
drop policy if exists md_seats_read    on seats;
drop policy if exists md_students_read on students;
drop policy if exists md_students_write on students;
drop policy if exists md_staff_read    on staff;
drop policy if exists md_bookings_read on bookings;
drop policy if exists md_pulse_read    on booking_pulse;
drop policy if exists md_scans_read    on scans;

create policy md_events_read    on events for select using (published or md_role() is not null);
create policy md_events_write   on events for all    using (md_role() = 'super_admin') with check (md_role() = 'super_admin');
create policy md_seats_read     on seats  for select using (true);                       -- seat map is public (labels/state only)
create policy md_students_read  on students for select using (md_role() = 'super_admin'); -- students can NEVER list the roster
create policy md_students_write on students for all using (md_role() = 'super_admin') with check (md_role() = 'super_admin');
create policy md_staff_read     on staff for select using (user_id = auth.uid() or md_role() = 'super_admin');
create policy md_bookings_read  on bookings for select using (md_role() in ('super_admin','reviewer'));
create policy md_pulse_read     on booking_pulse for select using (true);
create policy md_scans_read     on scans for select using (md_role() is not null);
-- note: NO insert/update policies on bookings/seats/scans → they change only through the functions below.

-- ---------- student-facing functions ----------
-- turns whatever a barcode (or typed code) contains into a student's national id:
-- a 14-digit national id, or an 8-digit academic number (only when it is unique)
create or replace function md_resolve_id(p_code text) returns text language plpgsql stable security definer set search_path = el_dof3a_events, public as $$
declare v text; vd text; nid text; acad text; hit text;
begin
  v := btrim(coalesce(p_code, ''));
  if v = '' then return null; end if;
  vd := regexp_replace(v, '\D', '', 'g');

  nid := (regexp_match(v, '(^|[^0-9])([0-9]{14})([^0-9]|$)'))[2];
  if nid is null and length(vd) = 14 then nid := vd; end if;
  if nid is not null then
    select national_id into hit from students where national_id = nid;
    if hit is not null then return hit; end if;
  end if;

  acad := (regexp_match(v, '(^|[^0-9])([0-9]{8})([^0-9]|$)'))[2];
  if acad is null and length(vd) = 8 then acad := vd; end if;
  if acad is not null then
    select t.national_id into hit
      from (select national_id, count(*) over () as c
              from students where academic_no = acad) t
     where t.c = 1
     limit 1;
    if hit is not null then return hit; end if;
  end if;

  return null;
end $$;

-- ---------- login: both numbers, either one identifies the student ----------
-- the app asks for the national id (14) AND the academic number (8); whichever is missing in the
-- database gets saved, so a student imported with only one of them is never locked out.
create or replace function md_login_student(p_nid text, p_academic text) returns jsonb
language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_nid text; v_acad text; s students; v_old text;
begin
  v_nid  := nullif(regexp_replace(coalesce(p_nid, ''), '\D', '', 'g'), '');
  v_acad := nullif(regexp_replace(coalesce(p_academic, ''), '\D', '', 'g'), '');
  if v_nid is null or v_nid !~ '^[0-9]{14}$' then raise exception 'bad_nid'; end if;
  if v_acad is null or v_acad !~ '^[0-9]{8}$' then raise exception 'bad_academic'; end if;

  -- 1) the national id is the primary key, so look there first
  select * into s from students where national_id = v_nid;

  -- 2) otherwise the academic number (the row may not have a national id yet)
  if s.national_id is null then
    select * into s from students where btrim(coalesce(academic_no, '')) = v_acad order by national_id limit 1;
  end if;
  if s.national_id is null then return null; end if;          -- not on the allowed list

  -- the two numbers must belong to the same student
  if nullif(btrim(s.academic_no), '') is not null and btrim(s.academic_no) <> v_acad then raise exception 'id_mismatch'; end if;

  -- fill in a missing academic number
  if nullif(btrim(s.academic_no), '') is null then
    if exists (select 1 from students where btrim(coalesce(academic_no, '')) = v_acad and national_id <> s.national_id) then
      raise exception 'academic_taken';
    end if;
    update students set academic_no = v_acad where national_id = s.national_id;
    s.academic_no := v_acad;
  end if;

  -- found by the academic number and the stored national id is only a placeholder → store the real one
  if s.national_id <> v_nid then
    if s.national_id !~ '^0+$' then raise exception 'id_mismatch'; end if;
    if exists (select 1 from students where national_id = v_nid) then raise exception 'id_mismatch'; end if;
    v_old := s.national_id;
    insert into students(national_id, name, academic_no, created_at) values (v_nid, s.name, s.academic_no, s.created_at);
    update bookings set national_id = v_nid where national_id = v_old;
    update scans set national_id = v_nid where national_id = v_old;
    delete from students where national_id = v_old;
    s.national_id := v_nid;
  end if;

  return jsonb_build_object('national_id', s.national_id, 'name', s.name, 'academic_no', s.academic_no,
                            'gender', md_gender(s.national_id), 'batch', md_batch(s.academic_no));
end $$;

create or replace function md_lookup_student(p_nid text) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare s students; v_nid text;
begin
  v_nid := md_resolve_id(p_nid);                       -- national id or academic number
  if v_nid is null then return null; end if;
  select * into s from students where national_id = v_nid;
  if not found then return null; end if;
  return jsonb_build_object('national_id', s.national_id, 'name', s.name, 'academic_no', s.academic_no,
                            'gender', md_gender(s.national_id), 'batch', md_batch(s.academic_no));
end $$;

create or replace function md_events_overview() returns jsonb language sql stable security definer set search_path = el_dof3a_events, public as $$
  select coalesce(jsonb_agg(
    to_jsonb(e) || jsonb_build_object(
      'price', case when e.payment_required then e.price else 0 end,
      'seats_total', (select count(*) from seats s where s.event_id = e.id and not s.blocked),
      'seats_free', least(
          (select count(*) from seats s where s.event_id = e.id and not s.blocked
             and (s.state = 'free' or (s.state = 'held' and s.held_until < now()))),
          coalesce(e.max_bookings - md_booked_count(e.id), 2147483647)),
      -- names-only events: how many places are left (null = unlimited)
      'spots_left', case when e.max_bookings is null then null else greatest(0, e.max_bookings - md_booked_count(e.id)) end,
      'now', now())
    order by e.event_at nulls last, e.created_at), '[]'::jsonb)
  from events e where e.published
$$;

-- a hold whose payment deadline passed is dead: mark it expired and put the seat back, so the
-- student can pick a seat and book again like nothing happened. Called by md_my_bookings (every poll)
-- and by the hold/pay functions, so it is never possible to pay for a seat after the deadline.
create or replace function md_expire_holds(p_nid text default null) returns void
language plpgsql security definer set search_path = el_dof3a_events, public as $$
begin
  with gone as (
    update bookings set status = 'expired'
     where status = 'awaiting_payment' and (hold_until is null or hold_until < now())
       and (p_nid is null or national_id = p_nid)
    returning seat_id
  )
  update seats set state = 'free', held_until = null
   where id in (select seat_id from gone where seat_id is not null)
     and state = 'held'
     and not exists (select 1 from bookings b
                      where b.seat_id = seats.id and b.status = 'awaiting_payment' and b.hold_until > now());
end $$;

create or replace function md_hold_seat(p_event uuid, p_nid text, p_seat uuid) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare ev events; st students; se seats; bk bookings; old bookings; v_gender text;
begin
  -- serialize every hold for this event → no two people can win the same seat / cap
  select * into ev from events where id = p_event and published for update;
  if not found then raise exception 'event_not_found'; end if;
  if ev.booking_mode <> 'seats' then raise exception 'wrong_mode'; end if;
  select * into st from students where national_id = p_nid;
  if not found then raise exception 'student_not_allowed'; end if;
  perform md_expire_holds(p_nid);                       -- a dead hold must not block a fresh booking

  if ev.booking_opens_at is not null and now() < ev.booking_opens_at then raise exception 'booking_not_open'; end if;
  if ev.booking_closes_at is not null and now() >= ev.booking_closes_at then raise exception 'booking_closed'; end if;

  select * into old from bookings
   where event_id = p_event and national_id = p_nid and status in ('awaiting_payment','pending','approved') for update;
  if found then
    if old.status <> 'awaiting_payment' then raise exception 'already_booked'; end if;
    update bookings set status = 'cancelled' where id = old.id;          -- switching seats: drop old hold
    update seats set state = 'free', held_until = null where id = old.seat_id and state = 'held';
  end if;

  select * into se from seats where id = p_seat and event_id = p_event for update;
  if not found then raise exception 'seat_not_found'; end if;
  if se.blocked then raise exception 'seat_unavailable'; end if;
  if se.state = 'taken' or (se.state = 'held' and se.held_until >= now()) then raise exception 'seat_taken'; end if;

  v_gender := md_gender(p_nid);
  if se.restriction <> 'any' and se.restriction <> v_gender then raise exception 'seat_gender'; end if;
  if ev.max_bookings is not null and md_booked_count(p_event) >= ev.max_bookings then raise exception 'sold_out'; end if;

  update bookings set status = 'expired' where seat_id = p_seat and status = 'awaiting_payment';  -- stale hold of someone else

  insert into bookings(event_id, national_id, seat_id, status, amount, hold_until)
  values (p_event, p_nid, p_seat, 'awaiting_payment', case when ev.payment_required then ev.price else 0 end, now() + make_interval(mins => ev.hold_minutes))
  returning * into bk;
  update seats set state = 'held', held_until = bk.hold_until where id = p_seat;
  return md_booking_json(bk.id);
exception when unique_violation then
  raise exception 'seat_taken';
end $$;

-- names-only events (no seats): same idea, a counted place instead of a seat
create or replace function md_reserve_spot(p_event uuid, p_nid text) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare ev events; old bookings; bk bookings;
begin
  select * into ev from events where id = p_event and published for update;
  if not found then raise exception 'event_not_found'; end if;
  if ev.booking_mode <> 'names' then raise exception 'wrong_mode'; end if;
  if not exists (select 1 from students where national_id = p_nid) then raise exception 'student_not_allowed'; end if;
  perform md_expire_holds(p_nid);                       -- a dead hold must not block a fresh reservation
  if ev.booking_opens_at is not null and now() < ev.booking_opens_at then raise exception 'booking_not_open'; end if;
  if ev.booking_closes_at is not null and now() >= ev.booking_closes_at then raise exception 'booking_closed'; end if;

  select * into old from bookings
   where event_id = p_event and national_id = p_nid and status in ('awaiting_payment','pending','approved') for update;
  if found then
    if old.status <> 'awaiting_payment' then raise exception 'already_booked'; end if;
    update bookings set status = 'cancelled' where id = old.id;
  end if;

  if ev.max_bookings is not null and md_booked_count(p_event) >= ev.max_bookings then raise exception 'sold_out'; end if;

  insert into bookings(event_id, national_id, status, amount, hold_until)
  values (p_event, p_nid, 'awaiting_payment', case when ev.payment_required then ev.price else 0 end, now() + make_interval(mins => ev.hold_minutes))
  returning * into bk;
  return md_booking_json(bk.id);
exception when unique_violation then
  raise exception 'already_booked';
end $$;

create or replace function md_release_hold(p_booking uuid, p_nid text) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare sid uuid;
begin
  update bookings set status = 'cancelled'
   where id = p_booking and national_id = p_nid and status = 'awaiting_payment' returning seat_id into sid;
  if found then update seats set state = 'free', held_until = null where id = sid and state = 'held'; end if;
end $$;

create or replace function md_submit_payment(p_booking uuid, p_nid text, p_proof text) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare bk bookings; ev events; v_ev uuid; v_status text;
begin
  select event_id into v_ev from bookings where id = p_booking and national_id = p_nid;
  if v_ev is null then raise exception 'booking_not_found'; end if;
  select * into ev from events where id = v_ev for update;                       -- same lock order as the hold functions
  perform md_expire_holds(p_nid);                                                -- a hold past its deadline can never be paid
  select * into bk from bookings where id = p_booking and national_id = p_nid for update;
  if bk.status in ('pending','approved') then return md_booking_json(bk.id); end if;   -- idempotent
  if bk.status <> 'awaiting_payment' then raise exception 'hold_expired'; end if;      -- someone else took the seat after the hold ran out
  if ev.payment_required and (p_proof is null or p_proof not like p_booking::text || '/%') then raise exception 'proof_required'; end if;
  -- names-only event whose short hold already ran out: make sure there is still room
  if bk.seat_id is null and bk.hold_until < now() and ev.max_bookings is not null and md_booked_count(ev.id) >= ev.max_bookings then
    raise exception 'sold_out';
  end if;

  v_status := case when not ev.payment_required and ev.auto_approve then 'approved' else 'pending' end;
  update bookings set status = v_status, proof_path = p_proof, submitted_at = now(), hold_until = null,
         reviewed_at = case when v_status = 'approved' then now() end
   where id = bk.id;
  if bk.seat_id is not null then update seats set state = 'taken', held_until = null where id = bk.seat_id; end if;
  return md_booking_json(bk.id);
end $$;

create or replace function md_my_bookings(p_nid text) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_out jsonb;
begin
  perform md_expire_holds(p_nid);                     -- expired payment holds disappear from the list
  select coalesce(jsonb_agg(md_booking_json(b.id) order by b.created_at desc), '[]'::jsonb) into v_out
  from bookings b
  where p_nid ~ '^[0-9]{14}$' and b.national_id = p_nid
    and b.status in ('awaiting_payment','pending','approved','declined');
  return v_out;
end $$;

-- ---------- staff functions ----------
create or replace function md_my_role() returns jsonb language sql stable security definer set search_path = el_dof3a_events, public as $$
  select jsonb_build_object('role', role, 'name', name) from staff where user_id = auth.uid()
$$;

create or replace function md_review_booking(p_booking uuid, p_approve boolean, p_reason text default null) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare bk bookings;
begin
  if coalesce(md_role(), '') not in ('super_admin','reviewer') then raise exception 'forbidden'; end if;
  select * into bk from bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found'; end if;
  if bk.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_approve then
    update bookings set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid() where id = bk.id;
  else
    update bookings set status = 'declined', decline_reason = nullif(trim(p_reason), ''), reviewed_at = now(), reviewed_by = auth.uid() where id = bk.id;
    update seats set state = 'free', held_until = null where id = bk.seat_id;     -- seat is available again, instantly
  end if;
  return md_booking_json(bk.id);
end $$;

create or replace function md_scan(p_event uuid, p_code text) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_nid text; st students; bk bookings; v_seat text; v_res text; sname text; v_first timestamptz; v_qr boolean;
begin
  if coalesce(md_role(), '') not in ('super_admin','scanner') then raise exception 'forbidden'; end if;
  select name into sname from staff where user_id = auth.uid();
  p_code := btrim(p_code);

  -- new tickets carry the booking id (unguessable, no personal data, opens only its own event);
  -- older tickets and hand-typed codes still go through the national id / academic number
  v_qr := p_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  if v_qr then
    select * into bk from bookings where id = p_code::uuid and event_id = p_event for update;
    if not found then
      insert into scans(event_id, result, scanned_by, scanner_name) values (p_event, 'invalid', auth.uid(), sname);
      return jsonb_build_object('result', 'invalid');
    end if;
    v_nid := bk.national_id;
  else
    v_nid := md_resolve_id(p_code);                      -- national id or academic number
    if v_nid is null then
      insert into scans(event_id, result, scanned_by, scanner_name) values (p_event, 'invalid', auth.uid(), sname);
      return jsonb_build_object('result', 'invalid');
    end if;

    select * into bk from bookings
     where event_id = p_event and national_id = v_nid and status in ('approved','pending','declined')
     order by case status when 'approved' then 0 when 'pending' then 1 else 2 end
     limit 1 for update;                    -- row lock: two scanners at the same instant are serialized
  end if;

  select * into st from students where national_id = v_nid;

  if bk.id is null then
    v_res := 'not_found';
  elsif bk.status <> 'approved' then
    v_res := 'not_approved';
  elsif bk.scanned_at is not null then
    v_res := 'duplicate'; v_first := bk.scanned_at;
  else
    v_res := 'ok';
    update bookings set scanned_at = now(), scanned_by = auth.uid() where id = bk.id;
  end if;

  if bk.seat_id is not null then select label into v_seat from seats where id = bk.seat_id; end if;

  insert into scans(event_id, national_id, student_name, seat_label, booking_id, result, scanned_by, scanner_name)
  values (p_event, v_nid, st.name, v_seat, bk.id, v_res, auth.uid(), sname);

  return jsonb_build_object('result', v_res, 'national_id', v_nid, 'name', st.name, 'academic_no', st.academic_no,
                            'seat', v_seat, 'first_scanned_at', v_first, 'status', bk.status);
end $$;

-- ===== hall layout: blocks A (right) · B (middle) · C (left), numbering runs across the rows of each block =====
drop function if exists md_generate_layout(uuid, int, int);
drop function if exists md_add_row(uuid, int);
-- the fixed A/B/C generator is replaced by md_apply_layout
drop function if exists md_generate_layout(uuid, int, int, int, int, int, int, int, text);
drop function if exists md_add_row(uuid, int, int, int);

create or replace function md_has_active(p_event uuid) returns boolean language sql stable security definer set search_path = el_dof3a_events, public as $$
  select exists (select 1 from bookings where event_id = p_event and status in ('awaiting_payment','pending','approved'))
$$;

-- A1..An in block A going row after row (front → back), then B, then C. rtl = number each row from the right edge.

create or replace function md_renumber_event(p_event uuid) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  perform md_renumber(p_event);
end $$;

-- 'pos' is the slot inside a row-block, left → right. An aisle is simply a hole in the sequence of pos.
-- Numbers run row after row inside each block (A1..A4, then A5..A9 …); rtl = each row is numbered from its right edge.
create or replace function md_renumber(p_event uuid) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_dir text;
begin
  select numbering_dir into v_dir from events where id = p_event;
  update seats set label = '~' || id::text where event_id = p_event;      -- park labels: no unique clash mid-update
  with numbered as (
    select id, section,
           row_number() over (partition by section order by row_no, case when v_dir = 'rtl' then -pos else pos end) as n
    from seats where event_id = p_event
  )
  update seats s set seat_no = n.n, label = n.section || n.n, row_label = s.row_no::text,
         sort_order = s.row_no * 1000000 + s.section_order * 10000 + s.pos
  from numbered n where s.id = n.id;
end $$;

-- validates a design (used by apply + save): raises bad_layout / bad_keys / too_many_seats
create or replace function md_check_spec(p_spec jsonb) returns void language plpgsql as $$
declare b jsonb; v_rows int; v_total int := 0; v_keys text[] := '{}'; k text; r int; x text;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or jsonb_typeof(p_spec->'blocks') <> 'array' then raise exception 'bad_layout'; end if;
  v_rows := coalesce((p_spec->>'rows')::int, 0);
  if v_rows not between 1 and 40 then raise exception 'bad_layout'; end if;
  if coalesce(p_spec->>'dir', 'rtl') not in ('rtl','ltr') then raise exception 'bad_layout'; end if;
  if jsonb_array_length(p_spec->'blocks') not between 1 and 12 then raise exception 'bad_layout'; end if;
  for b in select value from jsonb_array_elements(p_spec->'blocks') loop
    k := upper(coalesce(b->>'key', ''));
    if k !~ '^[A-Z0-9]{1,3}$' or k = any(v_keys) then raise exception 'bad_layout'; end if;
    -- block "A" and block "A1" would both produce a chair labelled A12 → refuse keys that extend another key with digits
    foreach x in array v_keys loop
      if (k like x || '%' and substr(k, length(x) + 1) ~ '^[0-9]+$') or (x like k || '%' and substr(x, length(k) + 1) ~ '^[0-9]+$') then raise exception 'bad_keys'; end if;
    end loop;
    v_keys := v_keys || k;
    if coalesce((b->>'seats')::int, -1) not between 0 and 40 or coalesce((b->>'grow')::int, 99) not between -5 and 5
       or coalesce((b->>'aisleEvery')::int, 0) not between 0 and 40 or coalesce((b->>'aisleWidth')::int, 1) not between 0 and 4 then
      raise exception 'bad_layout';
    end if;
    for r in 1..v_rows loop v_total := v_total + greatest(0, (b->>'seats')::int + (r - 1) * (b->>'grow')::int); end loop;
  end loop;
  if v_total < 1 then raise exception 'bad_layout'; end if;
  if v_total > 2000 then raise exception 'too_many_seats'; end if;
end $$;

-- builds the whole hall from a design. Aisles are counted from the block's inner edge (the side facing the middle),
-- so they line up from row to row even when rows get longer toward the back.
create or replace function md_apply_layout(p_event uuid, p_spec jsonb) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_rows int; v_dir text;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  perform md_check_spec(p_spec);
  perform 1 from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if md_has_active(p_event) then raise exception 'has_bookings'; end if;
  v_rows := (p_spec->>'rows')::int;
  v_dir := coalesce(p_spec->>'dir', 'rtl');

  delete from seats where event_id = p_event;
  with blocks as (
    select (t.ord - 1)::int as idx, upper(t.e->>'key') as key,
           (t.e->>'seats')::int as seats, (t.e->>'grow')::int as grow,
           coalesce((t.e->>'aisleEvery')::int, 0) as ae, coalesce((t.e->>'aisleWidth')::int, 1) as aw
    from jsonb_array_elements(p_spec->'blocks') with ordinality as t(e, ord)
  ), nb as (select count(*)::numeric as n from blocks),
  cells as (
    select b.idx, b.key, b.ae, b.aw, r as row_no, greatest(0, b.seats + (r - 1) * b.grow) as n
    from blocks b cross join generate_series(1, v_rows) as r
  ),
  slots as (
    select c.idx, c.key, c.row_no, j + case when c.ae > 0 then (j / c.ae) * c.aw else 0 end as slot
    from cells c cross join lateral generate_series(0, c.n - 1) as j
  ),
  mx as (select key, max(slot) as ms from slots group by key)
  insert into seats(event_id, row_label, seat_no, label, sort_order, row_no, section, section_order, pos)
  select p_event, s.row_no::text, 0, 'tmp' || gen_random_uuid()::text, 0, s.row_no, s.key, s.idx,
         case when s.idx < (nb.n - 1) / 2 then m.ms + 1 - s.slot else 1 + s.slot end
  from slots s join mx m on m.key = s.key cross join nb;

  update events set numbering_dir = v_dir, layout_spec = p_spec where id = p_event;
  perform md_renumber(p_event);
end $$;

-- saved designs (super admin only)
create or replace function md_layouts() returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'spec', spec) order by lower(name)) from layouts), '[]'::jsonb);
end $$;

create or replace function md_save_layout(p_name text, p_spec jsonb) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  if v_name = '' or length(v_name) > 60 then raise exception 'bad_name'; end if;
  perform md_check_spec(p_spec);
  update layouts set spec = p_spec, updated_at = now() where lower(name) = lower(v_name);   -- same name → replace it
  if not found then insert into layouts(name, spec, created_by) values (v_name, p_spec, auth.uid()); end if;
end $$;

create or replace function md_delete_layout(p_id uuid) returns void language plpgsql security definer set search_path = el_dof3a_events, public as $$
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  delete from layouts where id = p_id;
end $$;

-- insert a chair to the left/right of each selected chair (same row, same block); later chairs shift over
create or replace function md_add_seats(p_event uuid, p_refs uuid[], p_side text) returns int language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare r record; v_has boolean; n int := 0; v_next int; v_pos int;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_side not in ('left','right') then raise exception 'bad_layout'; end if;
  v_has := md_has_active(p_event);
  for r in select id, row_no, section, section_order, pos from seats where event_id = p_event and id = any(p_refs)
           order by row_no desc, section_order desc, pos desc loop
    if p_side = 'right' then
      v_pos := r.pos + 1;
      update seats set pos = pos + 1 where event_id = p_event and row_no = r.row_no and section = r.section and pos > r.pos;
    else
      v_pos := r.pos;
      update seats set pos = pos + 1 where event_id = p_event and row_no = r.row_no and section = r.section and pos >= r.pos;
    end if;
    select coalesce(max(seat_no), 0) + 1 into v_next from seats where event_id = p_event and section = r.section;
    while exists (select 1 from seats where event_id = p_event and label = r.section || v_next) loop v_next := v_next + 1; end loop;
    insert into seats(event_id, row_label, seat_no, label, sort_order, row_no, section, section_order, pos)
    values (p_event, r.row_no::text, v_next, r.section || v_next, 0, r.row_no, r.section, r.section_order, v_pos);
    n := n + 1;
  end loop;
  if not v_has then perform md_renumber(p_event);
  else update seats set sort_order = row_no * 1000000 + section_order * 10000 + pos where event_id = p_event; end if;   -- tickets issued → keep old numbers
  return n;
end $$;

-- rows × (A, B, C): start count per block + how many more each row gets (halls widen toward the back)

-- a new row at the back

-- insert a chair to the left/right of each selected chair (same row, same block); later chairs shift over

-- remove chairs (only ones nobody holds or booked)
create or replace function md_delete_seats(p_event uuid, p_ids uuid[]) returns int language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare n int;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  update bookings set status = 'expired' where status = 'awaiting_payment' and hold_until < now() and seat_id = any(p_ids);
  update seats set state = 'free', held_until = null where event_id = p_event and id = any(p_ids) and state = 'held' and held_until < now();
  delete from seats where event_id = p_event and id = any(p_ids) and state = 'free';
  get diagnostics n = row_count;
  if not md_has_active(p_event) then perform md_renumber(p_event); end if;
  return n;
end $$;

-- ===== admin tools: manual booking, delete booking, reset event =====
-- books someone as an already-paid, approved booking (works on blocked chairs too)
create or replace function md_admin_book(p_event uuid, p_nid text, p_seat uuid) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare ev events; se seats; bk bookings; old bookings;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'event_not_found'; end if;
  if not exists (select 1 from students where national_id = p_nid) then raise exception 'student_not_allowed'; end if;

  select * into old from bookings where event_id = p_event and national_id = p_nid and status in ('awaiting_payment','pending','approved') for update;
  if found then
    if old.status <> 'awaiting_payment' then raise exception 'already_booked'; end if;
    update bookings set status = 'cancelled' where id = old.id;
    if old.seat_id is not null then update seats set state = 'free', held_until = null where id = old.seat_id and state = 'held'; end if;
  end if;

  if ev.booking_mode = 'seats' then
    if p_seat is null then raise exception 'seat_not_found'; end if;
    select * into se from seats where id = p_seat and event_id = p_event for update;
    if not found then raise exception 'seat_not_found'; end if;
    if se.state = 'taken' or (se.state = 'held' and se.held_until >= now()) then raise exception 'seat_taken'; end if;
    update bookings set status = 'expired' where seat_id = p_seat and status = 'awaiting_payment';
  end if;

  insert into bookings(event_id, national_id, seat_id, status, amount, submitted_at, reviewed_at, reviewed_by)
  values (p_event, p_nid, case when ev.booking_mode = 'seats' then p_seat end, 'approved',
          case when ev.payment_required then ev.price else 0 end, now(), now(), auth.uid())
  returning * into bk;
  if ev.booking_mode = 'seats' then update seats set state = 'taken', held_until = null, blocked = false where id = p_seat; end if;
  return md_booking_json(bk.id);
exception when unique_violation then
  raise exception 'seat_taken';
end $$;

-- deletes one booking and frees its seat; returns the booking id so the app can delete its photos
create or replace function md_delete_booking(p_booking uuid) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare bk bookings;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  select * into bk from bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found'; end if;
  if bk.seat_id is not null then update seats set state = 'free', held_until = null where id = bk.seat_id and state in ('held','taken'); end if;
  delete from booking_pulse where id = bk.id;
  delete from bookings where id = bk.id;
  return jsonb_build_array(jsonb_build_object('id', bk.id, 'proof_path', bk.proof_path));
end $$;

-- wipes every booking + scan of an event, frees all seats; returns the ids so the app can delete the photos
create or replace function md_reset_event(p_event uuid) returns jsonb language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare v_ids jsonb;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'proof_path', proof_path)), '[]'::jsonb) into v_ids from bookings where event_id = p_event;
  delete from booking_pulse where id in (select id from bookings where event_id = p_event);
  delete from scans where event_id = p_event;
  delete from bookings where event_id = p_event;
  update seats set state = 'free', held_until = null where event_id = p_event;
  return v_ids;
end $$;

-- one-time: move seats made with the old row-letter layout into the new numbering (only where nothing is booked)
do $$
declare e record;
begin
  for e in select distinct event_id from seats where label ~ '^[A-Z][0-9]+$' and row_label ~ '^[A-Z]$' loop
    if not md_has_active(e.event_id) then perform md_renumber(e.event_id); end if;
  end loop;
end $$;


-- p_restriction: 'any' | 'male' | 'female' | null (leave);  p_blocked: true | false | null (leave)
-- seats that are currently reserved are never touched, so existing bookings can't be invalidated.
create or replace function md_set_seats(p_event uuid, p_ids uuid[], p_restriction text, p_blocked boolean) returns int language plpgsql security definer set search_path = el_dof3a_events, public as $$
declare n int;
begin
  if coalesce(md_role(), '') <> 'super_admin' then raise exception 'forbidden'; end if;
  if p_restriction is not null and p_restriction not in ('any','male','female') then raise exception 'bad_layout'; end if;
  update bookings set status = 'expired'
   where status = 'awaiting_payment' and hold_until < now() and seat_id = any(p_ids);
  update seats set state = 'free', held_until = null
   where event_id = p_event and id = any(p_ids) and state = 'held' and held_until < now();
  update seats set restriction = coalesce(p_restriction, restriction), blocked = coalesce(p_blocked, blocked)
   where event_id = p_event and id = any(p_ids) and state = 'free';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function md_event_stats(p_event uuid) returns jsonb language plpgsql stable security definer set search_path = el_dof3a_events, public as $$
declare r jsonb;
begin
  if md_role() is null then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'seats_total',   count(*) filter (where not s.blocked),
    'seats_blocked', count(*) filter (where s.blocked),
    -- a temporary hold is still "booked" for everyone
    'seats_taken',   count(*) filter (where not s.blocked and (s.state = 'taken' or (s.state = 'held' and s.held_until >= now()))),
    'seats_held',    0,
    'seats_free',    count(*) filter (where not s.blocked and (s.state = 'free' or (s.state = 'held' and s.held_until < now()))),
    'seats_male',    count(*) filter (where not s.blocked and s.restriction = 'male'),
    'seats_female',  count(*) filter (where not s.blocked and s.restriction = 'female')
  ) into r from seats s where s.event_id = p_event;

  return r || (select jsonb_build_object(
    'awaiting',  count(*) filter (where status = 'awaiting_payment' and hold_until >= now()),
    'pending',   count(*) filter (where status = 'pending'),
    'approved',  count(*) filter (where status = 'approved'),
    'declined',  count(*) filter (where status = 'declined'),
    'revenue_approved', coalesce(sum(amount) filter (where status = 'approved'), 0),
    'revenue_pending',  coalesce(sum(amount) filter (where status = 'pending'), 0),
    'male_booked',   count(*) filter (where status in ('pending','approved') and md_gender(national_id) = 'male'),
    'female_booked', count(*) filter (where status in ('pending','approved') and md_gender(national_id) = 'female'),
    'entered',       count(*) filter (where status = 'approved' and scanned_at is not null)
  ) from bookings where event_id = p_event)
  || (select jsonb_build_object(
    'batch_first',   count(*) filter (where md_batch(st.academic_no) = 'first'),
    'batch_second',  count(*) filter (where md_batch(st.academic_no) = 'second'),
    'batch_third',   count(*) filter (where md_batch(st.academic_no) = 'third'),
    'batch_fourth',  count(*) filter (where md_batch(st.academic_no) = 'fourth'),
    'batch_unknown', count(*) filter (where md_batch(st.academic_no) is null)
  ) from bookings b join students st on st.national_id = b.national_id
     where b.event_id = p_event and b.status in ('pending','approved'))
  || (select jsonb_build_object('booking_mode', booking_mode, 'max_bookings', max_bookings) from events where id = p_event)
  || (select jsonb_build_object(
    'scan_ok',        count(*) filter (where result = 'ok'),
    'scan_duplicate', count(*) filter (where result = 'duplicate'),
    'scan_declined',  count(*) filter (where result in ('duplicate','not_found','not_approved','invalid'))
  ) from scans where event_id = p_event) || jsonb_build_object('now', now());
end $$;


-- ---------- API access (RLS above decides who sees what) ----------
grant usage on schema el_dof3a_events to anon, authenticated;
grant select on events, seats, booking_pulse to anon;
grant select, insert, update, delete on all tables in schema el_dof3a_events to authenticated;
grant execute on all functions in schema el_dof3a_events to anon, authenticated;
revoke execute on function md_booking_json(uuid), md_booked_count(uuid), md_renumber(uuid), md_has_active(uuid), md_expire_holds(text), md_check_spec(jsonb) from public, anon, authenticated;
-- tell PostgREST to pick up the new schema/functions
notify pgrst, 'reload schema';

-- ---------- payment-proof storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('md-proofs', 'md-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "md proofs upload" on storage.objects;
drop policy if exists "md proofs staff read" on storage.objects;
drop policy if exists "md proofs staff delete" on storage.objects;
create policy "md proofs upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'md-proofs');
create policy "md proofs staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'md-proofs' and el_dof3a_events.md_role() = 'super_admin');
create policy "md proofs staff read" on storage.objects for select to authenticated
  using (bucket_id = 'md-proofs' and el_dof3a_events.md_role() in ('super_admin','reviewer'));

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['seats','bookings','booking_pulse','scans','events'] loop
    begin execute format('alter publication supabase_realtime add table el_dof3a_events.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
