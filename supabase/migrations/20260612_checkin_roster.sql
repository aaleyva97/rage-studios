-- ============================================================================
-- Check-In — Lista en vivo de la clase (roster)
--
-- Permite a la estación admin mostrar la lista de personas ESPERADAS en la
-- clase en curso, marcarlas en vivo conforme escanean, ver el contador
-- "X de Y" y marcar manualmente (respaldo). Cubre reservas por créditos y
-- socias VIP/membresía.
--
-- Todo es SOLO admin (is_admin()). Zona horaria: America/Mexico_City.
-- ============================================================================

-- 1. Clases de hoy con contadores (para selector + detección de "en curso") ---
create or replace function public.get_checkin_classes_today()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now_local timestamp := (now() at time zone 'America/Mexico_City');
  v_today     date := (now() at time zone 'America/Mexico_City')::date;
  v_isodow    int  := extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int;
  v_before    int;
  v_after     int;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'NOT_ADMIN');
  end if;

  select coalesce(value, '30')::int into v_before from public.app_settings where key = 'checkin_window_before_minutes';
  select coalesce(value, '30')::int into v_after  from public.app_settings where key = 'checkin_window_after_minutes';
  v_before := coalesce(v_before, 30);
  v_after  := coalesce(v_after, 30);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'session_time', to_char(t.session_time, 'HH24:MI'),
        'coach_name',   t.coach_name,
        'expected',     t.expected,
        'checked',      t.checked,
        'is_current',   (v_now_local >= (v_today + t.session_time) - make_interval(mins => v_before)
                         and v_now_local <= (v_today + t.session_time) + make_interval(mins => v_after))
      ) order by t.session_time)
    from (
      select x.session_time,
             max(x.coach_name) as coach_name,
             count(*) as expected,
             count(*) filter (where x.attended) as checked
      from (
        -- Reservas (créditos o VIP ya materializada)
        select b.session_time, b.coach_name,
               (b.attendance_status = 'attended') as attended
        from public.bookings b
        where b.session_date = v_today and b.status = 'active'

        union all

        -- Membresías VIP sin reserva todavía
        select ss.start_time as session_time,
               coalesce((
                 select string_agg(c.name, '/' order by ssc.is_primary desc)
                 from public.schedule_slot_coaches ssc
                 join public.coaches c on c.id = ssc.coach_id
                 where ssc.schedule_slot_id = ss.id
               ), '') as coach_name,
               false as attended
        from public.membership_schedules ms
        join public.memberships m    on m.id = ms.membership_id
        join public.schedule_slots ss on ss.id = ms.schedule_slot_id
        where m.is_active and ms.is_active and ss.is_active
          and ss.day_of_week = v_isodow
          and not exists (
            select 1 from public.bookings b2
            where b2.user_id = m.user_id
              and b2.session_date = v_today
              and b2.session_time = ss.start_time
              and b2.status = 'active'
          )
      ) x
      group by x.session_time
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_checkin_classes_today() from public, anon;
grant execute on function public.get_checkin_classes_today() to authenticated;

-- 2. Roster de una clase (hoy + hora) ----------------------------------------
create or replace function public.get_checkin_roster(p_time text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_today  date := (now() at time zone 'America/Mexico_City')::date;
  v_isodow int  := extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int;
  v_t      time := p_time::time;
begin
  if not public.is_admin() then
    return jsonb_build_object('error', 'NOT_ADMIN');
  end if;

  return coalesce((
    select jsonb_agg(sub.r order by (sub.r->>'attended')::boolean asc, lower(sub.r->>'display_name') asc)
    from (
      -- Reservas (créditos o VIP materializada)
      select jsonb_build_object(
        'kind',                   'booking',
        'booking_id',             b.id,
        'membership_schedule_id', null,
        'user_id',                b.user_id,
        'display_name',           coalesce(p.full_name, nullif(b.attendees[1], ''), 'Cliente'),
        'bed_numbers',            to_jsonb(b.bed_numbers),
        'extra_attendees',        greatest(coalesce(b.total_attendees, 1) - 1, 0),
        'attendance_status',      b.attendance_status,
        'attended',               (b.attendance_status = 'attended'),
        'is_membership',          (b.check_in_source = 'qr_membership' or exists (
                                     select 1
                                     from public.membership_schedules ms
                                     join public.memberships m on m.id = ms.membership_id
                                     join public.schedule_slots ss on ss.id = ms.schedule_slot_id
                                     where m.user_id = b.user_id and m.is_active and ms.is_active and ss.is_active
                                       and ss.day_of_week = v_isodow and ss.start_time = v_t
                                   ))
      ) as r
      from public.bookings b
      left join public.profiles p on p.id = b.user_id
      where b.session_date = v_today and b.session_time = v_t and b.status = 'active'

      union all

      -- Membresías VIP sin reserva todavía
      select jsonb_build_object(
        'kind',                   'membership',
        'booking_id',             null,
        'membership_schedule_id', ms.id,
        'user_id',                m.user_id,
        'display_name',           coalesce(p.full_name, m.client_name, 'VIP'),
        'bed_numbers',            to_jsonb(ms.bed_numbers),
        'extra_attendees',        0,
        'attendance_status',      null,
        'attended',               false,
        'is_membership',          true
      ) as r
      from public.membership_schedules ms
      join public.memberships m    on m.id = ms.membership_id
      join public.schedule_slots ss on ss.id = ms.schedule_slot_id
      left join public.profiles p on p.id = m.user_id
      where m.is_active and ms.is_active and ss.is_active
        and ss.day_of_week = v_isodow and ss.start_time = v_t
        and not exists (
          select 1 from public.bookings b
          where b.user_id = m.user_id
            and b.session_date = v_today
            and b.session_time = v_t
            and b.status = 'active'
        )
    ) sub
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_checkin_roster(text) from public, anon;
grant execute on function public.get_checkin_roster(text) to authenticated;

-- 3. Marcado manual de una reserva existente ---------------------------------
create or replace function public.admin_mark_booking_attendance(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    return jsonb_build_object('status_code', 'NOT_ADMIN', 'message', 'No autorizado');
  end if;

  if p_status not in ('attended', 'missed', 'pending') then
    return jsonb_build_object('status_code', 'INVALID', 'message', 'Estado no valido');
  end if;

  if p_status = 'pending' then
    update public.bookings
      set attendance_status = null, attendance_marked_at = null, checked_in_by = null
    where id = p_booking_id;
  else
    update public.bookings
      set attendance_status    = p_status,
          attendance_marked_at = now(),
          checked_in_by        = v_admin,
          check_in_source      = 'manual'
    where id = p_booking_id;
  end if;

  if not found then
    return jsonb_build_object('status_code', 'NOT_FOUND', 'message', 'Reserva no encontrada');
  end if;

  return jsonb_build_object('status_code', 'OK');
end;
$$;

revoke all on function public.admin_mark_booking_attendance(uuid, text) from public, anon;
grant execute on function public.admin_mark_booking_attendance(uuid, text) to authenticated;

-- 4. Check-in manual de una socia VIP (materializa la reserva de hoy) --------
create or replace function public.admin_checkin_membership_today(p_membership_schedule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin   uuid := auth.uid();
  v_today   date := (now() at time zone 'America/Mexico_City')::date;
  v_isodow  int  := extract(isodow from (now() at time zone 'America/Mexico_City')::date)::int;
  v_uid     uuid;
  v_time    time;
  v_beds    integer[];
  v_coaches text;
  v_new_id  uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('status_code', 'NOT_ADMIN', 'message', 'No autorizado');
  end if;

  select m.user_id, ss.start_time, ms.bed_numbers,
         coalesce((
           select string_agg(c.name, '/' order by ssc.is_primary desc)
           from public.schedule_slot_coaches ssc
           join public.coaches c on c.id = ssc.coach_id
           where ssc.schedule_slot_id = ss.id
         ), 'Coach')
    into v_uid, v_time, v_beds, v_coaches
  from public.membership_schedules ms
  join public.memberships m    on m.id = ms.membership_id
  join public.schedule_slots ss on ss.id = ms.schedule_slot_id
  where ms.id = p_membership_schedule_id
    and m.is_active and ms.is_active and ss.is_active
    and ss.day_of_week = v_isodow;

  if v_time is null then
    return jsonb_build_object('status_code', 'NOT_FOUND', 'message', 'Membresia no valida para hoy');
  end if;

  -- Evitar duplicado (ya tiene reserva para ese horario)
  if exists (
    select 1 from public.bookings b
    where b.session_date = v_today and b.session_time = v_time and b.status = 'active'
      and (
        (v_uid is not null and b.user_id = v_uid)
        or (v_uid is null and b.bed_numbers && v_beds)
      )
  ) then
    return jsonb_build_object('status_code', 'ALREADY_CHECKED_IN', 'message', 'Ya tenia check-in');
  end if;

  insert into public.bookings (
    user_id, session_date, session_time, coach_name, bed_numbers,
    attendees, total_attendees, credits_used, status,
    attendance_status, attendance_marked_at, checked_in_by, check_in_source
  ) values (
    v_uid, v_today, v_time, v_coaches, v_beds,
    '{}'::text[], greatest(coalesce(array_length(v_beds, 1), 1), 1), 0, 'active',
    'attended', now(), v_admin, 'qr_membership'
  )
  returning id into v_new_id;

  return jsonb_build_object('status_code', 'OK', 'booking_id', v_new_id);
end;
$$;

revoke all on function public.admin_checkin_membership_today(uuid) from public, anon;
grant execute on function public.admin_checkin_membership_today(uuid) to authenticated;
