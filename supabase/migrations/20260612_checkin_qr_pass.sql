-- ============================================================================
-- Check-In por QR (Pase de acceso firmado por servidor)
-- Caso A: el admin escanea con lector USB el QR que muestra la clienta.
--
-- Incluye:
--   1. Tabla bloqueada con secreto HMAC (RLS on + sin políticas).
--   2. Settings de ventana de check-in (30/30 min por defecto).
--   3. Columnas de auditoría en bookings.
--   4. RPC issue_checkin_pass()  -> emite token rotativo firmado (cliente).
--   5. RPC checkin_scan_pass()   -> valida token y marca asistencia (admin).
--
-- pgcrypto vive en el schema `extensions` en este proyecto.
-- Zona horaria del estudio: America/Mexico_City (UTC-6 fijo, sin DST).
-- ============================================================================

-- 1. SECRETO HMAC -------------------------------------------------------------
create table if not exists public.checkin_secret (
  id     boolean primary key default true,
  secret text    not null,
  constraint checkin_secret_singleton check (id)
);

alter table public.checkin_secret enable row level security;
-- Sin políticas: ni anon ni authenticated pueden leerla.
-- Solo las funciones SECURITY DEFINER (owner) la usan.
revoke all on public.checkin_secret from anon, authenticated;

insert into public.checkin_secret (id, secret)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

-- 2. SETTINGS DE VENTANA ------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('checkin_window_before_minutes', '30', 'Minutos ANTES del inicio en que abre el check-in por QR'),
  ('checkin_window_after_minutes',  '30', 'Minutos DESPUES del inicio en que cierra el check-in por QR')
on conflict (key) do nothing;

-- 3. AUDITORIA EN BOOKINGS ----------------------------------------------------
alter table public.bookings add column if not exists checked_in_by   uuid references auth.users(id);
alter table public.bookings add column if not exists check_in_source text;

-- 4. EMITIR PASE (cliente autenticado) ---------------------------------------
create or replace function public.issue_checkin_pass()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid         uuid   := auth.uid();
  v_secret      text;
  v_iat         bigint := extract(epoch from now())::bigint;
  v_exp         bigint := extract(epoch from now())::bigint + 90;  -- 90s de validez
  v_payload     jsonb;
  v_payload_b64 text;
  v_sig         text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select secret into v_secret from public.checkin_secret where id = true;

  v_payload := jsonb_build_object('uid', v_uid, 'iat', v_iat, 'exp', v_exp);

  -- base64url(payload)
  v_payload_b64 := translate(
    encode(convert_to(v_payload::text, 'utf8'), 'base64'),
    E'+/=\n', '-_');

  -- base64url(hmac_sha256(payload_b64, secret))
  v_sig := translate(
    encode(extensions.hmac(v_payload_b64, v_secret, 'sha256'), 'base64'),
    E'+/=\n', '-_');

  return jsonb_build_object(
    'token',       v_payload_b64 || '.' || v_sig,
    'member_code', 'RGE-' || upper(substring(replace(v_uid::text, '-', '') from 1 for 8)),
    'expires_at',  to_timestamp(v_exp)
  );
end;
$$;

revoke all on function public.issue_checkin_pass() from public, anon;
grant execute on function public.issue_checkin_pass() to authenticated;

-- 5. ESCANEAR PASE (solo admin) ----------------------------------------------
create or replace function public.checkin_scan_pass(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret       text;
  v_parts        text[];
  v_payload_b64  text;
  v_sig          text;
  v_expected_sig text;
  v_payload      jsonb;
  v_uid          uuid;
  v_exp          bigint;
  v_now_epoch    bigint := extract(epoch from now())::bigint;
  v_admin        uuid   := auth.uid();
  v_before       int;
  v_after        int;
  v_now_local    timestamp;
  v_today        date;
  v_name         text;
  v_booking      public.bookings%rowtype;
  v_next         public.bookings%rowtype;
begin
  if not public.is_admin() then
    return jsonb_build_object('status_code', 'NOT_ADMIN', 'message', 'No autorizado');
  end if;

  if p_token is null or position('.' in p_token) = 0 then
    return jsonb_build_object('status_code', 'INVALID_TOKEN', 'message', 'QR no valido');
  end if;

  v_parts := string_to_array(p_token, '.');
  if array_length(v_parts, 1) <> 2 then
    return jsonb_build_object('status_code', 'INVALID_TOKEN', 'message', 'QR no valido');
  end if;

  v_payload_b64 := v_parts[1];
  v_sig         := v_parts[2];

  select secret into v_secret from public.checkin_secret where id = true;

  v_expected_sig := translate(
    encode(extensions.hmac(v_payload_b64, v_secret, 'sha256'), 'base64'),
    E'+/=\n', '-_');

  if v_sig <> v_expected_sig then
    return jsonb_build_object('status_code', 'INVALID_TOKEN', 'message', 'QR no valido o alterado');
  end if;

  -- Decodificar payload (base64url -> base64 -> json)
  begin
    v_payload := convert_from(
      decode(
        rpad(
          translate(v_payload_b64, '-_', '+/'),
          length(v_payload_b64) + ((4 - length(v_payload_b64) % 4) % 4),
          '='),
        'base64'),
      'utf8')::jsonb;
  exception when others then
    return jsonb_build_object('status_code', 'INVALID_TOKEN', 'message', 'QR no valido');
  end;

  v_uid := (v_payload->>'uid')::uuid;
  v_exp := (v_payload->>'exp')::bigint;

  if v_now_epoch > v_exp then
    return jsonb_build_object('status_code', 'EXPIRED_TOKEN',
      'message', 'El QR expiro. Pidele que lo regenere en la app.');
  end if;

  select coalesce(value, '30')::int into v_before from public.app_settings where key = 'checkin_window_before_minutes';
  select coalesce(value, '30')::int into v_after  from public.app_settings where key = 'checkin_window_after_minutes';
  v_before := coalesce(v_before, 30);
  v_after  := coalesce(v_after, 30);

  v_now_local := (now() at time zone 'America/Mexico_City');
  v_today     := v_now_local::date;

  select full_name into v_name from public.profiles where id = v_uid;

  -- (a) Reserva activa de hoy, sin marcar, dentro de la ventana
  select b.* into v_booking
  from public.bookings b
  where b.user_id = v_uid
    and b.status = 'active'
    and b.session_date = v_today
    and b.attendance_status is null
    and v_now_local >= (v_today + b.session_time) - make_interval(mins => v_before)
    and v_now_local <= (v_today + b.session_time) + make_interval(mins => v_after)
  order by b.session_time asc
  limit 1;

  if found then
    update public.bookings
      set attendance_status   = 'attended',
          attendance_marked_at = now(),
          checked_in_by        = v_admin,
          check_in_source      = 'qr'
    where id = v_booking.id;

    return jsonb_build_object(
      'status_code',  'OK',
      'message',      'Check-in exitoso',
      'client_name',  coalesce(v_name, 'Cliente'),
      'class_name',   coalesce(v_booking.coach_name, 'Clase'),
      'session_time', to_char(v_booking.session_time, 'HH24:MI'),
      'member_code',  'RGE-' || upper(substring(replace(v_uid::text, '-', '') from 1 for 8))
    );
  end if;

  -- (b) Ya tenia check-in en una clase de la ventana
  select b.* into v_booking
  from public.bookings b
  where b.user_id = v_uid
    and b.status = 'active'
    and b.session_date = v_today
    and b.attendance_status = 'attended'
    and v_now_local >= (v_today + b.session_time) - make_interval(mins => v_before)
    and v_now_local <= (v_today + b.session_time) + make_interval(mins => v_after)
  order by b.session_time asc
  limit 1;

  if found then
    return jsonb_build_object(
      'status_code',  'ALREADY_CHECKED_IN',
      'message',      'Esta clienta ya tenia check-in en esta clase',
      'client_name',  coalesce(v_name, 'Cliente'),
      'class_name',   coalesce(v_booking.coach_name, 'Clase'),
      'session_time', to_char(v_booking.session_time, 'HH24:MI')
    );
  end if;

  -- (c) Tiene clase hoy pero fuera de la ventana de check-in
  select b.* into v_next
  from public.bookings b
  where b.user_id = v_uid
    and b.status = 'active'
    and b.session_date = v_today
    and b.attendance_status is null
  order by b.session_time asc
  limit 1;

  if found then
    return jsonb_build_object(
      'status_code',  'NO_CLASS_IN_WINDOW',
      'message',      'Fuera de horario de check-in. Su proxima clase es a las ' || to_char(v_next.session_time, 'HH24:MI'),
      'client_name',  coalesce(v_name, 'Cliente'),
      'session_time', to_char(v_next.session_time, 'HH24:MI')
    );
  end if;

  -- (d) Sin reservas para hoy
  return jsonb_build_object(
    'status_code', 'NO_BOOKING_TODAY',
    'message',     'Sin reservas activas para hoy',
    'client_name', coalesce(v_name, 'Cliente')
  );
end;
$$;

revoke all on function public.checkin_scan_pass(text) from public, anon;
grant execute on function public.checkin_scan_pass(text) to authenticated;
