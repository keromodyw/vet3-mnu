-- =====================================================================
--  EL DOF3A EVENTS — layout designer backend (run once in Supabase → SQL Editor, safe to re-run).
--  Adds what the "تصميم القاعة" screen needs: block letters/order, aisles, saved templates.
--  Needs the main el-dof3a-events.sql to have been run before.
-- =====================================================================
set search_path = el_dof3a_events, public;

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

-- the fixed A/B/C generator is replaced by md_apply_layout
drop function if exists md_generate_layout(uuid, int, int, int, int, int, int, int, text);
drop function if exists md_add_row(uuid, int, int, int);


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

revoke execute on function md_check_spec(jsonb) from public, anon, authenticated;
grant execute on function md_layouts(), md_save_layout(text, jsonb), md_delete_layout(uuid), md_apply_layout(uuid, jsonb), md_add_seats(uuid, uuid[], text) to authenticated;
notify pgrst, 'reload schema';
